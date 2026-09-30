import { fixture } from "./fixture.mjs";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { seed, makeAsset, revise } from "../src/store.js";
import { stringify, parse } from "../src/serialization.js";
import { unzipSync } from "fflate";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await fixture();
const session = await (
  await fetch(app.url + "/api/session", {
    headers: { "x-workbench-client": "1" },
  })
).json();
const headers = {
  "x-workbench-token": session.token,
  "content-type": "application/json",
};
const getState = async () =>
  parse(await (await fetch(app.url + "/api/workspace", { headers })).text());
const putState = async (state) => {
  const response = await fetch(app.url + "/api/workspace", {
    method: "PUT",
    headers,
    body: stringify({ state }),
  });
  assert.equal(response.status, 200);
  return parse(await response.text());
};
const skill = makeAsset({
  type: "Skill",
  title: "文件历史验收",
  content: "# 第一版",
  files: [
    { path: "SKILL.md", text: true, data: "# 第一版", mode: 0o644 },
    {
      path: "image.bin",
      text: false,
      data: new Uint8Array([0, 255, 1]),
      mode: 0o644,
    },
    { path: "run.sh", text: true, data: "echo test\n", mode: 0o644 },
    { path: "empty", text: true, data: "", directory: true, mode: 0o755 },
  ],
});
const revisedSkill = revise(skill, {
  content: "# 第二版",
  files: [
    { path: "SKILL.md", text: true, data: "# 第二版", mode: 0o644 },
    {
      path: "image.bin",
      text: false,
      data: new Uint8Array([0, 255, 2]),
      mode: 0o644,
    },
    { path: "run.sh", text: true, data: "echo test\n", mode: 0o755 },
    { path: "new.txt", text: true, data: "新文件", mode: 0o644 },
  ],
});
await putState({ ...seed(), assets: [revisedSkill] });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(5000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(app.url + "/#assets");
  await page.getByRole("button", { name: "新建资产", exact: true }).click();
  await page.getByRole("button", { name: "Prompt", exact: true }).click();
  await page.getByLabel("名称", { exact: true }).fill("历史验收");
  await page.getByLabel("提示词全文").fill("共同背景\n旧的判断\n保持来源");
  await page.getByRole("button", { name: "保存资产", exact: true }).click();
  await page
    .getByRole("button", { name: "查看 历史验收", exact: true })
    .click();
  await page.getByRole("button", { name: "编辑资产", exact: true }).click();
  await page.getByLabel("提示词全文").fill("共同背景\n新的判断\n保持来源");
  await page.getByLabel("一句话说明").fill("新版说明");
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await page.getByRole("button", { name: "历史 2", exact: true }).click();
  for (const label of ["查看版本", "比较到"]) {
    const bounds = await page.getByLabel(label, { exact: true }).boundingBox();
    assert.ok(bounds.height >= 44, `${label} should have a 44px control`);
  }
  await page
    .getByLabel("查看版本", { exact: true })
    .selectOption({ label: "v1.0" });
  assert.match(await page.locator(".version-snapshot").innerText(), /旧的判断/);
  assert.match(
    await page.locator(".version-comparison").innerText(),
    /旧的判断/,
  );
  assert.match(
    await page.locator(".version-comparison").innerText(),
    /新的判断/,
  );
  await page.getByRole("button", { name: "恢复此版本", exact: true }).click();
  await page.getByRole("button", { name: "取消恢复", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "历史 2", exact: true }).count(),
    1,
  );
  await page.getByRole("button", { name: "恢复此版本", exact: true }).click();
  await page
    .getByRole("button", { name: "确认恢复为新版本", exact: true })
    .click();
  await page.getByRole("button", { name: "历史 3", exact: true }).waitFor();
  await page.getByRole("button", { name: "内容预览", exact: true }).click();
  assert.equal(
    await page.locator(".content-preview").innerText(),
    "共同背景\n旧的判断\n保持来源",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "查看 历史验收", exact: true })
    .click();
  await page.getByRole("button", { name: "历史 3", exact: true }).click();
  await page
    .getByLabel("查看版本", { exact: true })
    .selectOption({ label: "v2.0" });
  await page.getByRole("button", { name: "恢复此版本", exact: true }).click();
  await page
    .getByRole("button", { name: "确认恢复为新版本", exact: true })
    .click();
  await page.getByRole("button", { name: "历史 4", exact: true }).waitFor();
  console.log("PASS 历史正文与差异→取消→恢复→刷新→恢复回来");
  await page
    .getByLabel("查看版本", { exact: true })
    .selectOption({ label: "v1.0" });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出此版本", exact: true }).click();
  const download = await downloadPromise;
  const chunks = [];
  for await (const chunk of await download.createReadStream())
    chunks.push(chunk);
  assert.equal(
    Buffer.concat(chunks).toString("utf8"),
    "共同背景\n旧的判断\n保持来源",
  );
  await page.route("**/api/workspace", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "模拟写入失败" }),
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "恢复此版本", exact: true }).click();
  await page
    .getByRole("button", { name: "确认恢复为新版本", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: /恢复未完成/ })
    .waitFor();
  assert.equal(
    (await getState()).assets.find((a) => a.type === "Prompt").versions.length,
    4,
  );
  assert.equal(
    await page.getByLabel("查看版本", { exact: true }).inputValue(),
    (await getState()).assets.find((a) => a.type === "Prompt").versions[0].id,
  );
  await page.unroute("**/api/workspace");
  await page.getByRole("button", { name: "恢复此版本", exact: true }).click();
  await page
    .getByRole("button", { name: "确认恢复为新版本", exact: true })
    .click();
  await page.getByRole("button", { name: "历史 5", exact: true }).waitFor();
  const stored = await getState();
  await putState({
    ...stored,
    assets: stored.assets.map((a) =>
      a.type === "Prompt" ? revise(a, { content: "另一个页面的新版本" }) : a,
    ),
  });
  await page.getByRole("button", { name: "恢复此版本", exact: true }).click();
  await page
    .getByRole("button", { name: "确认恢复为新版本", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: /恢复未完成/ })
    .waitFor();
  assert.equal(
    (await getState()).assets.find((a) => a.type === "Prompt").versions.length,
    6,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "确认恢复为新版本", exact: true })
      .count(),
    0,
  );
  console.log("PASS 历史 Markdown 导出、写入失败保留、重试、并发冲突拒绝覆盖");
  await page.reload();
  await page
    .getByRole("button", { name: "查看 文件历史验收", exact: true })
    .click();
  await page.getByRole("button", { name: "历史 2", exact: true }).click();
  assert.match(
    await page.locator(".history-file-changes").innerText(),
    /new.txt/,
  );
  assert.equal(
    await page.locator(".history-file-changes .diff-line").count(),
    0,
  );
  await page
    .locator(".history-file-changes summary")
    .filter({ hasText: "image.bin" })
    .click();
  await page
    .getByText("二进制内容发生变化，不作为文本显示。可导出对应版本核对。", {
      exact: true,
    })
    .waitFor();
  await page
    .locator(".history-file-changes summary")
    .filter({ hasText: "run.sh" })
    .click();
  await page.getByText("权限 · 权限 644 → 755", { exact: true }).waitFor();
  assert.match(
    await page.locator(".history-file-changes").innerText(),
    /644 → 755/,
  );
  await page
    .locator(".history-file-changes summary")
    .filter({ hasText: "new.txt" })
    .click();
  await page
    .locator(".history-file-changes pre")
    .filter({ hasText: /^新文件$/ })
    .waitFor();
  assert.match(
    await page.locator(".history-file-changes").innerText(),
    /新文件/,
  );
  const zipPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出此版本", exact: true }).click();
  const zip = await zipPromise;
  const zipChunks = [];
  for await (const chunk of await zip.createReadStream()) zipChunks.push(chunk);
  const unpacked = unzipSync(Buffer.concat(zipChunks));
  assert.deepEqual([...unpacked["image.bin"]], [0, 255, 1]);
  assert.ok(unpacked["empty/"]);
  assert.equal(unpacked["new.txt"], undefined);
  console.log("PASS Skill 文件新增/删除/二进制/权限差异与完整历史包导出");
  await page.locator(".toast").waitFor({ state: "hidden", timeout: 6000 });
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/history-desktop.png" });
  await page
    .locator(".asset-history")
    .screenshot({ path: "test-results/history-component.png" });
  assert.deepEqual(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
    [],
  );
  for (const width of [320, 375, 393, 430]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.equal(
      await page
        .locator(".drawer")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
    );
    await page.screenshot({ path: `test-results/history-${width}.png` });
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByLabel("查看版本", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/history-top-320.png" });
  await page.getByRole("button", { name: "恢复此版本", exact: true }).click();
  await page.locator(".history-confirm").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/history-confirm-320.png" });
  assert.match(
    await page.locator(".history-confirm").innerText(),
    /名称、描述/,
  );
  assert.equal(
    await page
      .locator(".drawer")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  await page.getByRole("button", { name: "取消恢复", exact: true }).click();
  assert.deepEqual(errors, []);
  console.log("PASS 版本历史 axe 与四档窄屏；无 JS 异常");
} finally {
  await browser.close();
  await app.close();
}

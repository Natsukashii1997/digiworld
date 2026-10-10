import { fixture } from "./fixture.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { unzipSync } from "fflate";
import AxeBuilder from "@axe-core/playwright";
import { seed, makeAsset, current, revise } from "../src/store.js";
import { stringify, parse } from "../src/serialization.js";
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
const prompt = makeAsset({
  type: "Prompt",
  title: "审阅原则",
  content: "只按事实判断\r\n保留来源\n",
  demo: true,
});
const skill = makeAsset({
  type: "Skill",
  title: "实现检查",
  content: "# 实现检查",
  files: [
    { path: "SKILL.md", data: "# 实现检查", text: true },
    {
      path: "assets/raw.bin",
      data: new Uint8Array([0, 255, 128]),
      text: false,
      mode: 0o644,
    },
  ],
});
const unusedDemo = makeAsset({
  type: "Prompt",
  title: "未引用的演示",
  content: "可安全移除的合成示例",
  demo: true,
});
await putState({ ...seed(), assets: [prompt, skill, unusedDemo] });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(5000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(app.url + "/#assets");
  await page.getByRole("button", { name: "新建", exact: true }).click();
  await page.getByRole("button", { name: "工作流", exact: true }).click();
  await page.getByLabel("名称", { exact: true }).fill("上线复核");
  await page
    .getByLabel("工作流内容", { exact: true })
    .fill("先审阅材料，再进行实现检查。人工确认后交付。");
  await page.getByLabel("引用资产", { exact: true }).selectOption(prompt.id);
  await page.getByLabel("查找资产", { exact: true }).fill("实现检查");
  assert.equal(
    await page.getByLabel("引用资产", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await page.getByLabel("固定版本", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "添加引用", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByLabel("查找资产", { exact: true }).fill("");
  assert.equal(
    await page.getByLabel("引用资产", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await page.getByLabel("固定版本", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "添加引用", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByLabel("引用资产", { exact: true }).selectOption(prompt.id);
  await page.getByRole("button", { name: "添加引用", exact: true }).click();
  await page.getByLabel("引用资产", { exact: true }).selectOption(skill.id);
  await page.getByRole("button", { name: "添加引用", exact: true }).click();
  await page.getByRole("button", { name: "保存资产", exact: true }).click();
  await page.getByRole("button",{name:"查看 上线复核",exact:true}).waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "查看 上线复核", exact: true })
    .click();
  assert.match(
    await page.locator(".workflow-reference-list").innerText(),
    /审阅原则/,
  );
  const saved = await getState();
  assert.deepEqual(
    current(saved.assets.find((a) => a.type === "Workflow")).references,
    [
      { assetId: prompt.id, versionId: current(prompt).id },
      { assetId: skill.id, versionId: current(skill).id },
    ],
  );
  assert.deepEqual(errors, []);
  console.log("PASS 空白工作流→选择Prompt与Skill固定版本→保存→重开引用不变");
  const workflowId = saved.assets.find((a) => a.type === "Workflow").id;
  await putState({
    ...saved,
    assets: saved.assets.map((a) =>
      a.id === prompt.id
        ? revise(a, { content: "第二版：不得混入固定引用" })
        : a,
    ),
  });
  await page.reload();
  await page
    .getByRole("button", { name: "查看 上线复核", exact: true })
    .click();
  assert.match(
    await page.locator(".workflow-reference-list").innerText(),
    /有新版 · 保持固定/,
  );
  assert.match(
    await page.locator(".workflow-reference-list").innerText(),
    /v1\.0/,
  );
  await page.getByRole("button", { name: "复制流程说明", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "已复制流程说明" })
    .waitFor();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(copied.includes("只按事实判断\r\n保留来源\n"));
  assert.ok(!copied.includes("第二版：不得混入固定引用"));
  const promptPath = `refs/prompts/${prompt.id}/${current(prompt).id}.md`;
  const skillPath = `refs/skills/${skill.id}/${current(skill).id}.zip`;
  assert.ok(copied.includes(skillPath));
  assert.match(copied, /纯剪贴板不包含 Skill 文件/);
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出流程与引用", exact: true })
    .click();
  const chunks = [];
  for await (const chunk of await (await downloaded).createReadStream())
    chunks.push(chunk);
  const unpacked = unzipSync(Buffer.concat(chunks));
  const manifest = JSON.parse(
    Buffer.from(unpacked["manifest.json"]).toString("utf8"),
  );
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.workflow.assetId, workflowId);
  assert.equal(
    manifest.workflow.versionId,
    current(saved.assets.find((a) => a.id === workflowId)).id,
  );
  assert.deepEqual(
    manifest.references.map(({ assetId, versionId, number, file }) => ({
      assetId,
      versionId,
      number,
      file,
    })),
    [
      {
        assetId: prompt.id,
        versionId: current(prompt).id,
        number: 1,
        file: promptPath,
      },
      {
        assetId: skill.id,
        versionId: current(skill).id,
        number: 1,
        file: skillPath,
      },
    ],
  );
  assert.deepEqual(
    Buffer.from(unpacked[promptPath]),
    Buffer.from("只按事实判断\r\n保留来源\n"),
  );
  assert.equal(Buffer.from(unpacked["workflow.md"]).toString("utf8"), copied);
  for (const record of [manifest.workflow, ...manifest.references])
    assert.equal(
      record.sha256,
      createHash("sha256").update(unpacked[record.file]).digest("hex"),
    );
  const skillPackage = unzipSync(unpacked[skillPath]);
  assert.deepEqual([...skillPackage["assets/raw.bin"]], [0, 255, 128]);
  assert.equal(
    Buffer.from(skillPackage["SKILL.md"]).toString("utf8"),
    "# 实现检查",
  );
  console.log(
    "PASS 上游升级不改固定引用、真实剪贴板原文与 Skill 包路径、导出完整嵌套 ZIP 与 SHA-256",
  );
  await page.evaluate(() => {
    window.originalClipboardWrite = navigator.clipboard.writeText.bind(
      navigator.clipboard,
    );
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async () => {
        throw new DOMException("Denied", "NotAllowedError");
      },
    });
  });
  await page.getByRole("button", { name: "复制流程说明", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "剪贴板不可用" }).waitFor();
  assert.equal(
    await page.getByLabel("完整流程说明", { exact: true }).inputValue(),
    copied.replace(/\r\n/g, "\n"),
  );
  await mkdir("test-results", { recursive: true });
  await page.locator(".toast").waitFor({ state: "hidden", timeout: 6000 });
  await page.setViewportSize({ width: 320, height: 900 });
  await page
    .getByLabel("完整流程说明", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/workflow-failure-320.png" });
  assert.deepEqual(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
    [],
  );
  assert.equal(
    await page
      .locator(".drawer")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: window.originalClipboardWrite,
    });
  });
  const beforeArchive = await getState();
  await app.repository.write({
    ...beforeArchive,
    assets: beforeArchive.assets.map((a) =>
      a.id === prompt.id ? { ...a, archived: true } : a,
    ),
  });
  const downloads = [];
  const recordDownload = (download) =>
    downloads.push(download.suggestedFilename());
  page.on("download", recordDownload);
  await page.evaluate(() =>
    navigator.clipboard.writeText("归档检查：保留原剪贴板"),
  );
  await page.getByRole("button", { name: "复制流程说明", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "引用资产已归档" }).waitFor();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    "归档检查：保留原剪贴板",
  );
  assert.equal(
    await page.getByLabel("完整流程说明", { exact: true }).count(),
    0,
  );
  await page
    .getByRole("button", { name: "导出流程与引用", exact: true })
    .click();
  await page.getByRole("alert").filter({ hasText: "引用资产已归档" }).waitFor();
  await page
    .getByRole("button", { name: "导出流程与引用", exact: true })
    .waitFor({ state: "visible" });
  assert.deepEqual(downloads, []);
  page.off("download", recordDownload);
  const archivedState = await getState();
  await app.repository.write({
    ...archivedState,
    assets: archivedState.assets.map((a) =>
      a.id === prompt.id ? { ...a, archived: false } : a,
    ),
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page
    .getByRole("button", { name: "查看 上线复核", exact: true })
    .click();
  console.log(
    "PASS 剪贴板拒绝展示完整 fallback；交付前新鲜读取归档状态并阻断剪贴板和下载",
  );
  await page.getByRole("button", { name: "编辑资产", exact: true }).click();
  const updatedPrompt = (await getState()).assets.find(
    (a) => a.id === prompt.id,
  );
  await page
    .getByLabel("引用 1 的版本", { exact: true })
    .selectOption(current(updatedPrompt).id);
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await page.getByRole("button", { name: "历史 2", exact: true }).waitFor();
  const upgradedWorkflow = (await getState()).assets.find(
    (a) => a.id === workflowId,
  );
  assert.equal(
    upgradedWorkflow.versions[0].references[0].versionId,
    current(prompt).id,
  );
  assert.equal(
    current(upgradedWorkflow).references[0].versionId,
    current(updatedPrompt).id,
  );
  await page.getByRole("button", { name: "历史 2", exact: true }).click();
  await page
    .getByLabel("查看版本", { exact: true })
    .selectOption({ label: "v1.0" });
  assert.match(
    await page.locator(".version-comparison").innerText(),
    /资产引用/,
  );
  const diffReferences = page.locator(
    ".version-comparison .workflow-reference-list",
  );
  assert.equal(await diffReferences.count(), 2);
  assert.match(await diffReferences.nth(0).innerText(), /Prompt · v1\.0/);
  assert.match(await diffReferences.nth(1).innerText(), /Prompt · v2\.0/);
  await page.getByRole("button", { name: "恢复此版本", exact: true }).click();
  assert.match(await page.locator(".history-confirm").innerText(), /资产引用/);
  await page
    .getByRole("button", { name: "确认恢复为新版本", exact: true })
    .click();
  await page.getByRole("button", { name: "历史 3", exact: true }).waitFor();
  const restoredWorkflow = (await getState()).assets.find(
    (a) => a.id === workflowId,
  );
  assert.equal(
    current(restoredWorkflow).references[0].versionId,
    current(prompt).id,
  );
  assert.equal(
    current(restoredWorkflow).restoredFrom,
    restoredWorkflow.versions[0].id,
  );
  await page.getByRole("button", { name: "内容预览", exact: true }).click();
  await page.getByRole("button", { name: "复制流程说明", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "已复制流程说明" })
    .waitFor();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    copied,
  );
  console.log(
    "PASS 显式升级引用保存新版本→历史引用差异→恢复旧版引用和交付仍为 v1",
  );
  await page.locator(".toast").waitFor({ state: "hidden", timeout: 6000 });
  await page.locator(".workflow-detail-references").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/workflow-detail-desktop.png" });
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
    await page.locator(".workflow-detail-references").scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `detail body overflow at ${width}`,
    );
    assert.equal(
      await page
        .locator(".drawer")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
      `detail drawer overflow at ${width}`,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "编辑资产", exact: true }).click();
  await page
    .getByLabel("引用 1 的版本", { exact: true })
    .selectOption(current(updatedPrompt).id);
  await page
    .getByLabel("工作流内容", { exact: true })
    .fill("修改中的流程草稿：不应丢失，也不应提前保存。");
  await page.locator(".workflow-reference-editor").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/workflow-editor-desktop.png" });
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
    await page.locator(".workflow-reference-editor").scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `editor body overflow at ${width}`,
    );
    assert.equal(
      await page
        .locator(".modal")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
      `editor modal overflow at ${width}`,
    );
    if (width === 320)
      await page.screenshot({ path: "test-results/workflow-editor-320.png" });
  }
  await page.getByRole("button", { name: "移除引用 2", exact: true }).click();
  const beforeFailedSave = await getState();
  await page.route("**/api/workspace", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "保存失败：模拟磁盘不可写" }),
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "本次未保存" }).waitFor();
  assert.equal(
    await page.getByLabel("工作流内容", { exact: true }).inputValue(),
    "修改中的流程草稿：不应丢失，也不应提前保存。",
  );
  assert.equal(
    await page.getByLabel("引用 1 的版本", { exact: true }).inputValue(),
    current(updatedPrompt).id,
  );
  assert.equal(
    await page.getByLabel("引用 2 的版本", { exact: true }).count(),
    0,
  );
  assert.deepEqual((await getState()).assets, beforeFailedSave.assets);
  await page.unroute("**/api/workspace");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  assert.deepEqual((await getState()).assets, beforeFailedSave.assets);
  await page.reload();
  await page
    .getByRole("button", { name: "查看 上线复核", exact: true })
    .click();
  assert.equal(
    await page.locator(".workflow-reference-list .workflow-reference").count(),
    2,
  );
  assert.match(
    await page.locator(".workflow-reference-list").innerText(),
    /Prompt · v1\.0/,
  );
  assert.equal(
    await page.locator(".content-preview").innerText(),
    "先审阅材料，再进行实现检查。人工确认后交付。",
  );
  console.log(
    "PASS 工作流详情与编辑 axe、四档窄屏；503 保留正文与引用草稿、取消不改主库",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "编辑资产", exact: true }).click();
  await page.getByRole("button", { name: "移除引用 1", exact: true }).click();
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await page.getByRole("button", { name: "历史 4", exact: true }).waitFor();
  const beforeCleanup = await getState();
  const removedReferenceWorkflow = beforeCleanup.assets.find(
    (a) => a.id === workflowId,
  );
  assert.deepEqual(current(removedReferenceWorkflow).references, [
    { assetId: skill.id, versionId: current(skill).id },
  ]);
  assert.ok(
    removedReferenceWorkflow.versions
      .slice(0, -1)
      .some((v) => v.references.some((r) => r.assetId === prompt.id)),
  );
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "资产详情" }).waitFor({ state: "detached" });
  await page.goto(app.url + "/#assets");
  await page.getByRole("button", { name: "删除 审阅原则", exact: true }).click();
  await page.getByRole("dialog", { name: "无法删除资产" }).getByText(/工作流：上线复核/).first().waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "删除 未引用的演示", exact: true }).click();
  await page.getByRole("button", { name: "删除 未引用的演示", exact: true }).waitFor({ state: "detached" });
  const afterCleanup = await getState();
  assert.equal(afterCleanup.assets.find((a) => a.id === unusedDemo.id).archived, true);
  assert.deepEqual(
    afterCleanup.assets.find((a) => a.id === prompt.id),
    beforeCleanup.assets.find((a) => a.id === prompt.id),
  );
  assert.deepEqual(
    afterCleanup.assets.find((a) => a.id === workflowId),
    removedReferenceWorkflow,
  );
  await page.goto(app.url + "/#assets");
  await page
    .getByRole("button", { name: "查看 上线复核", exact: true })
    .click();
  await page.getByRole("button", { name: "历史 4", exact: true }).click();
  await page
    .getByLabel("查看版本", { exact: true })
    .selectOption({ label: "v1.0" });
  assert.match(
    await page
      .locator(".version-snapshot .workflow-reference-list")
      .innerText(),
    /审阅原则/,
  );
  assert.doesNotMatch(
    await page
      .locator(".version-snapshot .workflow-reference-list")
      .innerText(),
    /资产缺失|版本缺失/,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS 当前流程移除引用后，示例清理仍保护任意历史引用、移除无引用示例；所有路径无 JS 异常",
  );
} finally {
  await browser.close();
  await app.close();
}

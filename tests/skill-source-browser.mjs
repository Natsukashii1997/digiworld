import { fixture } from "./fixture.mjs";
import { createRequire } from "node:module";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import AxeBuilder from "@axe-core/playwright";
import { seed, current } from "../src/store.js";
import { parse, stringify } from "../src/serialization.js";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const sourceBase = await mkdtemp(join(tmpdir(), "guiji-source-browser-"));
const root = join(sourceBase, "skills");
const source = join(root, "sample");
const initialContent =
  "---\nname: sample\ndescription: 合成来源测试\n---\n# 完整 Skill 原文\n保留所有资源。\n";
const app = await fixture();
let browser;
try {
  await mkdir(join(source, "assets"), { recursive: true });
  await mkdir(join(source, "emptydir"));
  await writeFile(join(source, "SKILL.md"), initialContent);
  await writeFile(
    join(source, "assets", "raw.bin"),
    new Uint8Array([0, 128, 255, 10]),
  );
  await writeFile(join(source, ".hidden"), "必须保留的隐藏资源\n");
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
  const init = await fetch(app.url + "/api/workspace", {
    method: "PUT",
    headers,
    body: stringify({ state: { ...seed(), assets: [] } }),
  });
  assert.equal(init.status, 200);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.url + "/#assets");
  await page
    .getByRole("button", { name: "收录本机 Skill", exact: true })
    .click();
  await page.getByLabel("扫描目录", { exact: true }).fill(root);
  await page.getByRole("button", { name: "扫描目录", exact: true }).click();
  await page.getByRole("button", { name: "预览 sample", exact: true }).click();
  await page.getByRole("region", { name: "完整包预览", exact: true }).waitFor();
  assert.equal((await getState()).assets.length, 0);
  await page.getByLabel("收录名称", { exact: true }).fill("本机收录验收");
  const beforeConcurrentSave = await getState();
  const otherPageNote = {
    id: "other-page-note",
    text: "另一页已保存：收录时必须保留",
    at: new Date().toISOString(),
  };
  const concurrentSave = await fetch(app.url + "/api/workspace", {
    method: "PUT",
    headers,
    body: stringify({
      state: { ...beforeConcurrentSave, notes: [otherPageNote] },
    }),
  });
  assert.equal(concurrentSave.status, 200);
  const oldConfirmation = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/skill-sources/import") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "确认收录", exact: true }).click();
  assert.equal((await oldConfirmation).status(), 409);
  assert.equal((await getState()).assets.length, 0);
  await page.getByRole("button", { name: "重新预览", exact: true }).click();
  await page
    .getByRole("dialog", { name: "收录本机 Skill", exact: true })
    .locator('form[aria-busy="false"]')
    .waitFor();
  assert.equal(
    await page.getByLabel("收录名称", { exact: true }).inputValue(),
    "本机收录验收",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "确认收录", exact: true })
      .isDisabled(),
    false,
  );
  await page.getByRole("button", { name: "确认收录", exact: true }).click();
  await page.getByRole("dialog", { name: "资产详情", exact: true }).waitFor();
  assert.equal((await getState()).assets.length, 1);
  assert.deepEqual((await getState()).notes, [otherPageNote]);
  assert.equal(current((await getState()).assets[0]).title, "本机收录验收");
  assert.deepEqual(errors, []);
  console.log("PASS 显式目录扫描→完整包预览不入库→确认收录→Skill 详情");
  console.log(
    "PASS 另一页真实保存后旧确认409→重新预览保留名称并可确认→另一页随手记完整保留",
  );
  const imported = (await getState()).assets[0];
  assert.equal(imported.origin.kind, "local");
  assert.equal(imported.origin.location, await realpath(source));
  assert.match(imported.origin.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(current(imported).content, initialContent);
  await page.reload();
  await page
    .getByRole("button", { name: "查看 本机收录验收", exact: true })
    .click();
  const origin = page.getByRole("region", {
    name: "Skill 来源与改版",
    exact: true,
  });
  assert.match(await origin.innerText(), /本机初始收录/);
  assert.ok((await origin.innerText()).includes(await realpath(source)));
  assert.ok((await origin.innerText()).includes(imported.origin.fingerprint));
  const zipPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出完整 Skill 包", exact: true })
    .click();
  const chunks = [];
  for await (const chunk of await (await zipPromise).createReadStream())
    chunks.push(chunk);
  const packageFiles = unzipSync(Buffer.concat(chunks));
  assert.equal(
    Buffer.from(packageFiles["SKILL.md"]).toString("utf8"),
    initialContent,
  );
  assert.deepEqual([...packageFiles["assets/raw.bin"]], [0, 128, 255, 10]);
  assert.equal(
    Buffer.from(packageFiles[".hidden"]).toString("utf8"),
    "必须保留的隐藏资源\n",
  );
  assert.ok(packageFiles["emptydir/"]);
  assert.equal(
    await readFile(join(source, "SKILL.md"), "utf8"),
    initialContent,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS 重载来源身份可见；完整 ZIP 保留入口原文、二进制、隐藏资源与空目录，磁盘来源未变",
  );
  await page.getByRole("button", { name: "创建个人改版", exact: true }).click();
  await page.getByLabel("个人改版名称", { exact: true }).fill("我的检查版");
  await page.getByRole("button", { name: "确认创建", exact: true }).click();
  await page
    .getByRole("dialog", { name: "资产详情", exact: true })
    .getByRole("heading", { name: "我的检查版", exact: true })
    .waitFor();
  const personal = (await getState()).assets.find(
    (a) => current(a).title === "我的检查版",
  );
  assert.notEqual(personal.id, imported.id);
  assert.deepEqual(personal.origin, {
    kind: "derived",
    assetId: imported.id,
    versionId: current(imported).id,
  });
  assert.deepEqual(current(personal).files, current(imported).files);
  assert.deepEqual(
    (await getState()).assets.find((a) => a.id === imported.id),
    imported,
  );
  assert.match(await origin.innerText(), /本机收录验收 · v1\.0/);
  await page.getByRole("button", { name: "编辑资产", exact: true }).click();
  await page
    .getByLabel("一句话说明", { exact: true })
    .fill("我的独立判断，不修改来源");
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await page.getByRole("button", { name: "历史 2", exact: true }).waitFor();
  const editedPersonal = (await getState()).assets.find(
    (a) => a.id === personal.id,
  );
  assert.equal(current(editedPersonal).description, "我的独立判断，不修改来源");
  assert.deepEqual(
    (await getState()).assets.find((a) => a.id === imported.id),
    imported,
  );
  await page.getByRole("button", { name: "创建个人改版", exact: true }).click();
  await page.getByLabel("个人改版名称", { exact: true }).fill("第二层独立改版");
  await page.getByRole("button", { name: "确认创建", exact: true }).click();
  await page
    .getByRole("dialog", { name: "资产详情", exact: true })
    .getByRole("heading", { name: "第二层独立改版", exact: true })
    .waitFor();
  const secondPersonal = (await getState()).assets.find(
    (a) => current(a).title === "第二层独立改版",
  );
  assert.deepEqual(secondPersonal.origin, {
    kind: "derived",
    assetId: personal.id,
    versionId: current(editedPersonal).id,
  });
  assert.match(await origin.innerText(), /我的检查版 · v2\.0/);
  await page.getByRole("button", { name: "查看来源资产", exact: true }).click();
  await page
    .getByRole("dialog", { name: "资产详情", exact: true })
    .getByRole("heading", { name: "我的检查版", exact: true })
    .waitFor();
  assert.deepEqual(
    (await getState()).assets.find((a) => a.id === personal.id),
    editedPersonal,
  );
  assert.equal(
    await readFile(join(source, "SKILL.md"), "utf8"),
    initialContent,
  );
  console.log(
    "PASS 完整个人改版独立编辑、固定来源身份与二级派生链，源资产及磁盘文件保持不变",
  );
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  const beforeRepeat = await getState();
  await page
    .getByRole("button", { name: "收录本机 Skill", exact: true })
    .click();
  await page.getByLabel("扫描目录", { exact: true }).fill(root);
  await page.getByRole("button", { name: "扫描目录", exact: true }).click();
  await page.getByRole("button", { name: "预览 sample", exact: true }).click();
  await page.getByRole("region", { name: "完整包预览", exact: true }).waitFor();
  assert.match(
    await page
      .getByRole("region", { name: "完整包预览", exact: true })
      .innerText(),
    /已有相同快照/,
  );
  await page.getByLabel("搜索扫描结果", { exact: true }).fill("不存在的结果");
  assert.equal(
    await page.getByRole("region", { name: "完整包预览", exact: true }).count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "确认收录", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByLabel("搜索扫描结果", { exact: true }).fill("");
  assert.equal(
    await page.getByRole("region", { name: "完整包预览", exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "预览 sample", exact: true }).click();
  await page.getByRole("region", { name: "完整包预览", exact: true }).waitFor();
  const alternativeRoot = join(sourceBase, "other-skills");
  await mkdir(alternativeRoot);
  await page.getByLabel("扫描目录", { exact: true }).fill(alternativeRoot);
  assert.equal(
    await page.getByRole("region", { name: "完整包预览", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("region", { name: "扫描结果", exact: true }).count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "确认收录", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByLabel("扫描目录", { exact: true }).fill(root);
  assert.equal(
    await page.getByRole("region", { name: "完整包预览", exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "扫描目录", exact: true }).click();
  await page.getByRole("button", { name: "预览 sample", exact: true }).click();
  await page
    .getByRole("button", { name: "查看已收录资产", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "资产详情", exact: true })
    .getByRole("heading", { name: "本机收录验收", exact: true })
    .waitFor();
  assert.deepEqual(await getState(), beforeRepeat);
  console.log(
    "PASS 搜索/目录切换清空旧预览，重复相同来源快照回到原资产且不新增版本或主库修订",
  );
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await writeFile(
    join(source, "SKILL.md"),
    initialContent + "待收录的来源第二版。\n",
  );
  await page
    .getByRole("button", { name: "收录本机 Skill", exact: true })
    .click();
  await page.getByLabel("扫描目录", { exact: true }).fill(root);
  await page.getByRole("button", { name: "扫描目录", exact: true }).click();
  await page.getByRole("button", { name: "预览 sample", exact: true }).click();
  await page.getByLabel("收录名称", { exact: true }).fill("来源变更草稿");
  await page.locator(".toast").waitFor({ state: "hidden", timeout: 6000 });
  await mkdir("test-results", { recursive: true });
  await page
    .getByRole("region", { name: "完整包预览", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/skill-source-preview-desktop.png",
  });
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
    await page
      .getByRole("region", { name: "完整包预览", exact: true })
      .scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `preview body overflow at ${width}`,
    );
    assert.equal(
      await page
        .locator(".modal")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
      `preview modal overflow at ${width}`,
    );
    if (width === 320)
      await page.screenshot({
        path: "test-results/skill-source-preview-320.png",
      });
  }
  await writeFile(
    join(source, "SKILL.md"),
    initialContent + "预览后来源已经第三版。\n",
  );
  await page.getByRole("button", { name: "确认收录", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "来源路径或内容已变化" })
    .waitFor();
  assert.equal(
    await page.getByLabel("收录名称", { exact: true }).inputValue(),
    "来源变更草稿",
  );
  assert.equal(
    await page.getByLabel("扫描目录", { exact: true }).inputValue(),
    root,
  );
  assert.equal(
    await page.getByRole("region", { name: "完整包预览", exact: true }).count(),
    1,
  );
  assert.deepEqual(await getState(), beforeRepeat);
  await page.setViewportSize({ width: 320, height: 900 });
  await page
    .getByRole("alert")
    .filter({ hasText: "来源路径或内容已变化" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/skill-source-failure-320.png" });
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
      .locator(".modal")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  console.log(
    "PASS 来源预览后改变拒绝收录，目录/名称/预览保留，主库不改；预览与失败 axe、四档无溢出",
  );
  await page.getByRole("button", { name: "重新预览", exact: true }).click();
  assert.equal(
    await page.getByLabel("收录名称", { exact: true }).inputValue(),
    "来源变更草稿",
  );
  await page
    .getByRole("region", { name: "完整包预览", exact: true })
    .locator("summary")
    .filter({ hasText: "入口全文" })
    .click();
  assert.equal(
    await page.getByLabel("Skill 入口全文", { exact: true }).textContent(),
    initialContent + "预览后来源已经第三版。\n",
  );
  await page.getByLabel("收录名称", { exact: true }).fill("来源重试草稿");
  await page.route("**/api/skill-sources/import", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "模拟收录服务暂不可用" }),
    }),
  );
  await page.getByRole("button", { name: "确认收录", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "模拟收录服务暂不可用" })
    .waitFor();
  assert.equal(
    await page.getByLabel("收录名称", { exact: true }).inputValue(),
    "来源重试草稿",
  );
  assert.equal(
    await page.getByLabel("扫描目录", { exact: true }).inputValue(),
    root,
  );
  assert.equal(
    await page.getByRole("region", { name: "完整包预览", exact: true }).count(),
    1,
  );
  assert.deepEqual(await getState(), beforeRepeat);
  await page.unroute("**/api/skill-sources/import");
  await page.getByRole("button", { name: "确认收录", exact: true }).click();
  await page
    .getByRole("dialog", { name: "资产详情", exact: true })
    .getByRole("heading", { name: "来源重试草稿", exact: true })
    .waitFor();
  const newSnapshot = (await getState()).assets.find(
    (a) => current(a).title === "来源重试草稿",
  );
  assert.notEqual(newSnapshot.id, imported.id);
  assert.notEqual(newSnapshot.origin.fingerprint, imported.origin.fingerprint);
  assert.equal(newSnapshot.origin.location, imported.origin.location);
  assert.equal(
    current(newSnapshot).content,
    initialContent + "预览后来源已经第三版。\n",
  );
  assert.deepEqual(
    (await getState()).assets.find((a) => a.id === imported.id),
    imported,
  );
  assert.deepEqual(
    (await getState()).assets.find((a) => a.id === personal.id),
    editedPersonal,
  );
  assert.equal((await getState()).assets.length, 4);
  console.log(
    "PASS 503 保留收录草稿并可重试；来源新内容建立独立快照，不覆盖原收录与个人改版",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "创建个人改版", exact: true }).click();
  await page
    .getByLabel("个人改版名称", { exact: true })
    .fill("尚未确认的个人改版");
  await page.locator(".toast").waitFor({ state: "hidden", timeout: 6000 });
  await origin.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/skill-source-derive-desktop.png",
  });
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
    await origin.scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `derive body overflow at ${width}`,
    );
    assert.equal(
      await page
        .locator(".drawer")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
      `derive drawer overflow at ${width}`,
    );
    if (width === 320)
      await page.screenshot({
        path: "test-results/skill-source-derive-320.png",
      });
  }
  const beforeCancel = await getState();
  await page.getByRole("button", { name: "取消改版", exact: true }).click();
  assert.deepEqual(await getState(), beforeCancel);
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS 改版表单 axe、四档无溢出、取消无写与 Esc 关闭；所有路径无浏览器异常",
  );
} finally {
  await browser?.close();
  await app.close();
  await rm(sourceBase, { recursive: true, force: true });
}

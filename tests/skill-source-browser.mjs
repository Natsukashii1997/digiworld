// 历史本机来源资产：仓库不再提供扫描/收录入口，已有来源和个人改版仍可查看与使用。
import { fixture } from "./fixture.mjs";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import AxeBuilder from "@axe-core/playwright";
import { seed, current } from "../src/store.js";
import { parse, stringify } from "../src/serialization.js";

const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const sourceBase = await mkdtemp(join(tmpdir(), "guiji-source-browser-"));
const root = join(sourceBase, "skills");
const source = join(root, "sample");
const entry = "---\nname: sample\ndescription: 合成来源测试\n---\n# 完整 Skill 原文\n保留所有资源。\n";
const app = await fixture();
let browser;
try {
  await mkdir(join(source, "assets"), { recursive: true });
  await writeFile(join(source, "SKILL.md"), entry);
  await writeFile(join(source, "assets", "raw.bin"), new Uint8Array([0, 128, 255, 10]));
  const session = await (await fetch(app.url + "/api/session", {
    headers: { "x-workbench-client": "1" },
  })).json();
  const headers = {
    "x-workbench-token": session.token,
    "content-type": "application/json",
  };
  const getState = async () => parse(await (await fetch(app.url + "/api/workspace", { headers })).text());
  const post = async (path, body) => {
    const response = await fetch(app.url + "/api/" + path, {
      method: "POST", headers, body: stringify(body),
    });
    assert.equal(response.status, 200, await response.clone().text());
    return parse(await response.text());
  };
  const init = await fetch(app.url + "/api/workspace", {
    method: "PUT", headers, body: stringify({ state: { ...seed(), assets: [] } }),
  });
  assert.equal(init.status, 200);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  let uiScans = 0;
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/skill-sources/discover") uiScans++;
  });
  await page.goto(app.url + "/#assets");
  await page.getByRole("heading", { name: "资产仓库" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "收录本机 Skill" }).count(), 0);
  assert.equal(await page.getByRole("dialog", { name: "收录本机 Skill" }).count(), 0);
  assert.equal(uiScans, 0);
  console.log("PASS 资产仓库无本机 Skill 扫描或收录入口；打开页面不扫描目录");

  // 使用合成目录建立一份历史来源资产；来源接口的读写边界由 skill-sources.test.mjs 验证。
  const scan = await post("skill-sources/discover", { roots: [root] });
  assert.equal(scan.items.length, 1);
  const preview = await post("skill-sources/preview", { candidateId: scan.items[0].id });
  const imported = await post("skill-sources/import", {
    token: preview.token, revision: preview.revision, title: "本机收录验收",
  });
  const original = imported.state.assets.find(asset => asset.id === imported.assetId);
  assert.equal(original.origin.kind, "local");
  assert.equal(current(original).content, entry);
  await page.reload();
  // #93 资产仓库默认停在 Prompt 页，Skill 卡要先切到 Skill 页签才会显示。
  await page.getByRole("heading", { name: "资产仓库" }).waitFor();
  await page.getByRole("group", { name: "资产类型" }).getByRole("button", { name: /^Skill/ }).click();
  // #93 第二批：Skill 页只读展示 my-skills 登记的 skill，收录来的历史 Skill 资产不再出现在 Skill 页（数据保留）；
  // 先断言它不在 Skill 页网格里，再从全局搜索（⌘K）打开它的详情抽屉，之后的来源、导出、改版断言不变。
  assert.equal(await page.getByRole("button", { name: "查看 本机收录验收" }).count(), 0, "历史 Skill 资产不应出现在 Skill 页网格");
  await page.keyboard.press("Meta+k");
  await page.getByLabel("全局搜索").fill("本机收录验收");
  await page.locator('.search-results[aria-busy="false"]').waitFor();
  await page.getByRole("dialog", { name: "搜索工作台" }).getByRole("button", { name: /本机收录验收/ }).click();
  const detail = page.getByRole("dialog", { name: "资产详情" });
  await detail.waitFor();
  const origin = detail.getByRole("region", { name: "Skill 来源与改版" });
  assert.match(await origin.innerText(), /历史来源[\s\S]*本机初始收录[\s\S]*初始指纹/);
  assert.match(await origin.innerText(), /不代表当前目录内容或安装状态/);
  const download = page.waitForEvent("download");
  await detail.getByRole("button", { name: "导出完整 Skill 包" }).click();
  const downloaded = await download;
  const bytes = [];
  for await (const chunk of await downloaded.createReadStream()) bytes.push(chunk);
  const bundle = unzipSync(Buffer.concat(bytes));
  assert.equal(Buffer.from(bundle["SKILL.md"]).toString("utf8"), entry);
  assert.deepEqual([...bundle["assets/raw.bin"]], [0, 128, 255, 10]);
  assert.equal(await readFile(join(source, "SKILL.md"), "utf8"), entry);
  console.log("PASS 历史来源资产可查看固定来源并完整导出，合成源目录不被改动");

  await origin.getByRole("button", { name: "创建个人改版" }).click();
  await origin.getByLabel("个人改版名称").fill("个人改版验收");
  const beforeCancel = await getState();
  await origin.getByRole("button", { name: "取消改版" }).click();
  assert.deepEqual(await getState(), beforeCancel);
  await origin.getByRole("button", { name: "创建个人改版" }).click();
  await origin.getByLabel("个人改版名称").fill("个人改版验收");
  await origin.getByRole("button", { name: "确认创建" }).click();
  await detail.getByRole("heading", { name: "个人改版验收" }).waitFor();
  const after = await getState();
  const derived = after.assets.find(asset => current(asset).title === "个人改版验收");
  assert.ok(derived);
  assert.deepEqual(derived.origin, {
    kind: "derived", assetId: original.id, versionId: current(original).id,
  });
  assert.deepEqual(current(derived).files, current(original).files);
  assert.deepEqual(after.assets.find(asset => asset.id === original.id), original);
  assert.equal(await readFile(join(source, "SKILL.md"), "utf8"), entry);
  assert.match(await detail.getByRole("region", { name: "Skill 来源与改版" }).innerText(), /个人改版验收|本机收录验收/);
  console.log("PASS 历史来源资产可创建独立个人改版；取消零写，源版本与文件不变");

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width} 页面横向溢出`);
    assert.deepEqual((await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations, []);
  }
  assert.equal(uiScans, 0);
  assert.deepEqual(errors, []);
  console.log("skill-source-browser PASS: 历史来源、派生、三宽 axe 与无旧入口");
  await context.close();
} finally {
  await browser?.close();
  await app.close();
  await rm(sourceBase, { recursive: true, force: true });
}

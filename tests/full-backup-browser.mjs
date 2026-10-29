// 路线 v3 5.1 完整备份（浏览器回归）：设置页导出完整备份 zip → 选择该文件 → 恢复前预览（新增 / 冲突 / 缺失）
// → 确认后恢复到新目录并显示校验结果与手动切换说明；当前目录不变；44px、axe、390 无横溢。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile, writeFile, rm, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { fixture } from "./fixture.mjs";
import { openSettingsDrawer } from "./settings-entry.mjs";
import { seed } from "../src/store.js";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);

const app = await fixture();
await app.repository.write(seed(), { initialize: true });
const directory = app.repository.directory;
await mkdir(join(directory, "config-operations"), { mode: 0o700 });
await writeFile(join(directory, "config-operations", "op-1.json"), '{"id":"op-1"}');
const out=process.env.GUIJI_TEST_RESULTS||"test-results";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
async function atLeast44(locator, name) {
  const box = await locator.boundingBox();
  assert.ok(box, `${name} 不可见`);
  assert.ok(box.width >= 44 && box.height >= 44, `${name} 点击区域 ${box.width}x${box.height}，应至少 44px`);
}
async function axe(page, label) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  assert.deepEqual(
    result.violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target).join(" ")}`),
    [],
  );
}
let target;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${app.url}/#settings`);
  await openSettingsDrawer(page,"数据与备份");
  await page.getByText("最近完整备份 / 恢复",{exact:true}).waitFor();
  await page.getByText(/历史快照保持原样；已撤销页面的记录不会导入当前主库/).waitFor();
  await button(page.getByRole("dialog", { name: "数据与备份" }), "导出可合并数据 JSON").waitFor();
  const exportButton = button(page, "下载恢复包 ZIP");
  await atLeast44(exportButton, "下载恢复包 ZIP");
  const [download] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
  // 文件名由 HTTP 单元测试核对（full-backup.test.mjs）；无头 Chromium 对共用 download() 助手报告的建议名不可靠。
  const file = join(out, "full-backup.zip");
  await download.saveAs(file);
  const entries = unzipSync(new Uint8Array(await readFile(file)));
  const manifest = JSON.parse(strFromU8(entries["manifest.json"]));
  assert.ok(manifest.files.some((f) => f.path === "config-operations/op-1.json"));
  assert.ok(manifest.files.some((f) => f.path === "CURRENT.json"));
  ok("导出完整备份：下载单个 zip，清单包含主库指针与配置操作日志");

  // 备份之后当前目录变化：改一个文件、加一个文件。
  await writeFile(join(directory, "config-operations", "op-1.json"), '{"id":"op-1","changed":true}');
  await writeFile(join(directory, "config-operations", "op-2.json"), '{"id":"op-2"}');
  await page.getByLabel("选择完整备份文件").setInputFiles(file);
  const dialog = page.getByRole("dialog", { name: "完整备份恢复预览" });
  await dialog.waitFor();
  await dialog.getByText("恢复只创建新的数据目录；历史快照保持原样，已撤销页面的记录不会进入当前主库。",{exact:true}).waitFor();
  const count = (label) => dialog.locator(".backup-summary > div", { hasText: label }).locator("strong").innerText();
  assert.equal(await count("冲突"), "1");
  const receiptNames = (await readdir(join(directory,"backup-records"))).sort();
  assert.equal(receiptNames.length, 2, "本次完整备份只新增一份prepared和一份回读回执");
  assert.ok(receiptNames.some(n => /^[a-f0-9-]{36}\.json$/.test(n)));
  assert.ok(receiptNames.some(n => /^[a-f0-9-]{36}\.receipt\.json$/.test(n)));
  assert.equal(await count("缺失"), "3", "备份完成后留痕的两文件加op-2，恰为3");
  await dialog.locator("summary", {hasText:"缺失"}).click();
  for(const path of ["config-operations/op-2.json", ...receiptNames.map(n=>"backup-records/"+n)])
    await dialog.getByText(path,{exact:true}).waitFor();
  assert.equal(await count("新增"), "0");
  await dialog.locator("summary", { hasText: "冲突" }).click();
  await dialog.getByText("config-operations/op-1.json").waitFor();
  target = await dialog.locator("code.storage-path").innerText();
  assert.match(target, /-恢复-[a-f0-9-]{36}$/);
  await atLeast44(button(dialog, "恢复到新目录"), "恢复到新目录");
  await atLeast44(dialog.locator("summary").first(), "路径列表展开");
  await axe(page, "full backup preview");
  await page.screenshot({ path: join(out,"full-backup-preview-1440.png") });
  ok("恢复前预览：新增 0、冲突 1、缺失 3（两份生成回执+新增op-2），可展开路径，显示新目录位置");

  await button(dialog, "恢复到新目录").click();
  const done = page.locator(".full-backup-done");
  await done.getByText(/已恢复到新目录并逐个校验 \d+ 个文件/).waitFor();
  assert.equal(await done.locator("code").innerText(), target);
  await done.getByText(/WORKBENCH_DATA_DIR/).waitFor();
  assert.equal(await readFile(join(target, "config-operations", "op-1.json"), "utf8"), '{"id":"op-1"}');
  assert.equal(await readFile(join(directory, "config-operations", "op-1.json"), "utf8"), '{"id":"op-1","changed":true}', "当前目录不变");
  await stat(join(directory, "config-operations", "op-2.json"));
  await axe(page, "full backup done");
  await context.close();
  ok("确认后恢复到新目录：备份内容原样写出并校验，当前目录不变，页面说明如何手动切换");

  const mobile = await (await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })).newPage();
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(`${app.url}/#settings`);
  await openSettingsDrawer(mobile,"数据与备份");
  await mobile.getByText("最近完整备份 / 恢复",{exact:true}).waitFor();
  const over = await mobile.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(over <= 0, `390 settings 横向溢出 ${over}px`);
  await atLeast44(button(mobile, "下载恢复包 ZIP"), "390 导出完整备份");
  await axe(mobile, "settings 390");
  await mobile.getByLabel("选择完整备份文件").setInputFiles(file);
  const mobilePreview=mobile.getByRole("dialog",{name:"完整备份恢复预览"});await mobilePreview.waitFor();
  for(const width of [390,320]){
    await mobile.setViewportSize({width,height:844});
    const action=button(mobilePreview,"恢复到新目录"),box=await action.boundingBox(),dialogBox=await mobilePreview.boundingBox();
    assert.ok(box&&dialogBox&&box.y>=dialogBox.y&&box.y+box.height<=dialogBox.y+dialogBox.height&&box.y+box.height<=844,"restore action visible before scrolling "+width);
    await atLeast44(action,"restore "+width);await axe(mobile,"restore "+width);
  }
  await button(mobilePreview,"取消").click();
  await mobile.context().close();
  ok("390 宽：设置页无横向溢出，按钮 44px，axe 通过");
  assert.deepEqual(errors, []);
  console.log("full-backup-browser: all passed");
} finally {
  await browser.close();
  await app.close();
  if (target) await rm(target, { recursive: true, force: true });
}

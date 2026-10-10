// 返修 WB-20260929-73：Codex 2.3 复核 D-R1 / D-R2 / D-R3 / D-R7 的浏览器回归。
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { contextFixture } from "./context-fixture.mjs";
import { makeAsset, revise } from "../src/store.js";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await contextFixture();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(5000);
const panel = () => page.getByRole("region", { name: "装入项目" });

async function seedRule() {
  const state = (await app.call("/workspace")).body;
  const asset = makeAsset({ title: "项目协同协议", type: "Rule", content: "## 协同\n先读 CURRENT.md。\n" });
  const saved = await app.call("/workspace", { state: { ...state, assets: [...state.assets, asset] } }, "PUT");
  assert.equal(saved.status, 200);
  return { asset, revision: saved.body.revision };
}
async function installVia(asset, revision, file) {
  const preview = await app.call("/rule-templates/preview", {
    projectId: app.input.projectId, root: app.input.root, file,
    assetId: asset.id, versionId: asset.versions.at(-1).id, overwriteDrift: false, revision,
  });
  assert.ok(preview.body.token, JSON.stringify(preview.body));
  const applied = await app.call("/rule-templates/apply", { token: preview.body.token, revision });
  assert.equal(applied.body.status, "matches_after");
}
async function openRule() {
  // 只改 # 不会重新加载页面；带查询参数确保读到最新主库
  await page.goto(`${app.url}/?t=${Date.now()}#assets`);
  await page.getByRole("button", { name: "查看 项目协同协议", exact: true }).click();
  await panel().waitFor();
}

try {
  const { asset, revision } = await seedRule();
  await installVia(asset, revision, "AGENTS.md");
  await installVia(asset, revision, "CLAUDE.md");

  // D-R7：项目详情显示装入的模板、版本与文件
  await page.goto(app.url + "/#projects");
  await page.getByRole("button", { name: /作品集/ }).first().click();
  const rules = page.getByRole("region", { name: "已装入的规则模板" });
  await rules.waitFor();
  assert.match(await rules.innerText(), /项目协同协议/);
  assert.match(await rules.innerText(), /AGENTS\.md/);
  assert.match(await rules.innerText(), /CLAUDE\.md/);
  assert.match(await rules.innerText(), /v1\.0/);
  await page.keyboard.press("Escape");
  console.log("PASS D-R7 项目详情显示已装模板、版本与文件");

  // 两个文件的区块都被手改，模板再出 v2
  for (const file of ["AGENTS.md", "CLAUDE.md"]) {
    const path = join(app.root, file);
    await writeFile(path, (await readFile(path, "utf8")).replace("先读 CURRENT.md。", `先读 CURRENT.md，${file} 手改。`));
  }
  const state = (await app.call("/workspace")).body;
  const stored = state.assets.find((a) => a.id === asset.id);
  const v2 = revise(stored, { content: "## 协同 v2\n" });
  const savedV2 = await app.call("/workspace", { state: { ...state, assets: state.assets.map((a) => (a.id === asset.id ? v2 : a)) } }, "PUT");
  assert.equal(savedV2.status, 200);

  // D-R1：在 AGENTS 勾选“覆盖区块内的改动”后，换到 CLAUDE，普通预览仍须默认拒绝
  await openRule();
  await panel().getByLabel("文件", { exact: true }).selectOption("AGENTS.md");
  await panel().getByRole("button", { name: /预览装入/ }).click();
  await panel().getByRole("heading", { name: "区块内容被手动改过" }).waitFor();
  await panel().getByLabel("覆盖区块内的改动", { exact: true }).check();
  await panel().getByRole("button", { name: "重新预览", exact: true }).click();
  await panel().getByRole("heading", { name: /升级/ }).waitFor();
  await panel().getByRole("button", { name: "返回", exact: true }).click();
  await panel().getByLabel("文件", { exact: true }).selectOption("CLAUDE.md");
  await panel().getByRole("button", { name: /预览装入/ }).click();
  await panel().getByRole("heading", { name: "区块内容被手动改过" }).waitFor();
  assert.equal(await panel().getByLabel("覆盖区块内的改动", { exact: true }).isChecked(), false);
  console.log("PASS D-R1 覆盖授权不跨目标、不跨预览保留");
  await panel().getByRole("button", { name: "返回", exact: true }).click();

  // D-R2：写入已被服务端处理但响应丢失 → 锁定为只能核对；关闭再打开仍锁定
  await panel().getByLabel("文件", { exact: true }).selectOption("AGENTS.md");
  await panel().getByRole("button", { name: /预览装入/ }).click();
  await panel().getByLabel("覆盖区块内的改动", { exact: true }).check();
  await panel().getByRole("button", { name: "重新预览", exact: true }).click();
  await panel().getByLabel("确认写入此项目文件", { exact: true }).check();
  await page.route("**/api/rule-templates/apply", async (route) => {
    await route.fetch(); // 服务端真实处理
    await route.abort(); // 但浏览器收不到响应
  });
  await panel().getByRole("button", { name: "确认写入", exact: true }).click();
  await panel().getByRole("button", { name: "核对写入结果", exact: true }).waitFor();
  await page.unroute("**/api/rule-templates/apply");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "查看 项目协同协议", exact: true }).click();
  await panel().getByRole("button", { name: "核对写入结果", exact: true }).waitFor();
  assert.equal(await panel().getByRole("button", { name: /预览装入/ }).isDisabled(), true, "未核对前不能再预览");
  await page.reload();
  await page.getByRole("button", { name: "查看 项目协同协议", exact: true }).click();
  await panel().getByRole("button", { name: "核对写入结果", exact: true }).click();
  await panel().getByText("已写入，回读一致", { exact: true }).waitFor();
  assert.equal(await panel().getByRole("button", { name: /预览装入/ }).isDisabled(), false);
  console.log("PASS D-R2 未知结果锁跨关闭与刷新保留，核对后解除");

  // D-R3：装入记录读取失败时如实显示失败，不显示“还没有装入”
  await page.route("**/api/rule-templates/installs", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "记录暂不可读" }) }),
  );
  await page.reload();
  await page.getByRole("button", { name: "查看 项目协同协议", exact: true }).click();
  await panel().getByText(/装入记录读取失败/).waitFor();
  assert.equal(await panel().getByText("还没有装入任何项目。").count(), 0);
  await page.unroute("**/api/rule-templates/installs");
  await panel().getByRole("button", { name: "重新读取装入记录", exact: true }).click();
  await panel().getByText(/已装入 · 2/).waitFor();
  console.log("PASS D-R3 读取失败如实显示并可重试");

  // WB-20260930-77 · D-R2 残留：写入请求在途时刷新，操作 ID 也不能丢
  await openRule();
  await panel().getByLabel("文件", { exact: true }).selectOption("CLAUDE.md");
  await panel().getByRole("button", { name: /预览装入/ }).click();
  await panel().getByLabel("覆盖区块内的改动", { exact: true }).check();
  await panel().getByRole("button", { name: "重新预览", exact: true }).click();
  await panel().getByLabel("确认写入此项目文件", { exact: true }).check();
  let served;
  const processed = new Promise((r) => (served = r));
  await page.route("**/api/rule-templates/apply", async (route) => {
    await route.fetch(); // 服务端已处理
    served(); // 但响应迟迟不交给浏览器
    await new Promise(() => {});
  });
  await panel().getByRole("button", { name: "确认写入", exact: true }).click();
  await processed;
  assert.match(await readFile(join(app.root, "CLAUDE.md"), "utf8"), /协同 v2/);
  // 先刷新、再解除拦截：若先解除，被扣住的请求会被放行、响应先到，锁按设计被正常解除（WB-20260930-83 定位的首败原因）
  await page.reload();
  // 新文档完成启动后再撤销Fetch拦截；原apply仍先经刷新作废，未知锁断言不变。
  await page.getByRole("button", { name: "查看 项目协同协议", exact: true }).waitFor();
  await page.unrouteAll({ behavior: "ignoreErrors" }); // 被扣住的旧请求随刷新作废，不再等待它
  await page.getByRole("button", { name: "查看 项目协同协议", exact: true }).click();
  await panel().getByRole("button", { name: "核对写入结果", exact: true }).waitFor();
  assert.equal(await panel().getByRole("button", { name: /预览装入/ }).isDisabled(), true, "在途刷新后也必须先核对");
  await panel().getByRole("button", { name: "核对写入结果", exact: true }).click();
  await panel().getByText("已写入，回读一致", { exact: true }).waitFor();
  assert.equal(await panel().getByRole("button", { name: /预览装入/ }).isDisabled(), false);
  console.log("PASS D-R2 请求在途时刷新，重开后仍须先核对");

  // WB-20260930-77 · D-R3 残留：记录还在读取时，不能显示“没有装入”
  let releaseInstalls;
  const hold = new Promise((r) => (releaseInstalls = r));
  await page.route("**/api/rule-templates/installs", async (route) => {
    await hold;
    await route.continue();
  });
  await page.reload();
  await page.getByRole("button", { name: "查看 项目协同协议", exact: true }).click();
  await panel().getByText(/正在读取装入记录/).waitFor();
  assert.equal(await panel().getByText("还没有装入任何项目。").count(), 0);
  await page.keyboard.press("Escape");
  await page.goto(`${app.url}/?t=${Date.now()}#projects`);
  await page.getByRole("button", { name: /作品集/ }).first().click();
  const projectRules = page.getByRole("region", { name: "已装入的规则模板" });
  await projectRules.getByText(/正在读取装入记录/).waitFor();
  assert.equal(await projectRules.getByText(/还没有通过工作台装入/).count(), 0);
  releaseInstalls();
  await projectRules.getByText(/CLAUDE\.md/).waitFor();
  await page.unroute("**/api/rule-templates/installs");
  console.log("PASS D-R3 读取中如实显示，不当作没有装入");

  // WB-20260930-83 · D-R3 残留①：写入后重新读取时，不能沿用旧列表下结论
  await page.goto(`${app.url}/?t=${Date.now()}#assets`);
  await page.getByRole("button", { name: "查看 项目协同协议", exact: true }).click();
  await panel().getByText(/已装入 · 2/).waitFor();
  let releaseAfterWrite;
  const heldAfterWrite = new Promise((r) => (releaseAfterWrite = r));
  await page.route("**/api/rule-templates/installs", async (route) => {
    await heldAfterWrite;
    await route.continue();
  });
  await panel().getByRole("button", { name: "撤回这次写入", exact: true }).first().click();
  await panel().getByLabel("确认撤回此文件的本次写入", { exact: true }).check();
  await panel().getByRole("button", { name: "确认撤回", exact: true }).click();
  await panel().getByText("已写入，回读一致", { exact: true }).waitFor();
  await panel().getByText(/正在读取装入记录/).waitFor();
  assert.equal(await panel().getByText(/已装入 · \d/).count(), 0, "重读期间不给出确定计数");
  releaseAfterWrite();
  await panel().getByText(/已装入 · 2/).waitFor();
  await page.unroute("**/api/rule-templates/installs");
  console.log("PASS D-R3 写后重读期间显示读取中，不沿用旧结果");

  // WB-20260930-83 · D-R3 残留②：首页与待处理页在规则来源未读完时不下“没有待处理”的结论
  let releaseHome;
  const heldHome = new Promise((r) => (releaseHome = r));
  await page.route("**/api/rule-templates/installs", async (route) => {
    await heldHome;
    await route.continue();
  });
  await page.goto(`${app.url}/?t=${Date.now()}#home`);
  await page.locator('.hx-mod-b').getByText(/部分来源仍在读取，待处理可能不完整/).waitFor();
  assert.equal(await page.locator('.hx-mod-b').getByText(/已读取的来源里没有要你处理的事/).count(), 0);
  await page.goto(`${app.url}/?t=${Date.now()}#inbox`);
  await page.getByText(/规则模板装入记录还在读取/).waitFor();
  assert.equal(await page.getByText("没有要你处理的事").count(), 0);
  releaseHome();
  await page.getByRole("dialog", {name:"待处理",exact:true}).getByText(/规则「项目协同协议」有 1 个项目可升级/).waitFor();
  await page.unroute("**/api/rule-templates/installs");
  console.log("PASS D-R3 首页与待处理页读取中不给空结论，读完出现可升级");

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await app.close();
}

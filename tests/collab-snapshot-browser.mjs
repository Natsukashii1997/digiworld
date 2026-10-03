// C5-F2（Codex 复核 115）：口令与留痕必须绑定同一份状态快照。
// 看板刷新在途时生成口令、刷新落地到新编号后：不能把旧口令按新状态计入留痕；口令标为过期、不能确认复制，
// 重新生成后正常复制并计入新编号。刷新失败、补记与开工口令同样处理。合成仓库与合成 CURRENT.md 在临时目录现建。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collabBoardFixture } from "./collab-board-fixture.mjs";

const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await collabBoardFixture();
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);
const sha = (text) => createHash("sha256").update(text).digest("hex");
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
const log = async () => (await app.workspace()).collabLog || [];
const currentFile = join(app.paths.collab, "CURRENT.md");
const original = await readFile(currentFile, "utf8");
const bump = (to) => writeFile(currentFile, original.replace("| state_id | P-20260930-14 |", `| state_id | ${to} |`));

// 拦住对 path 的请求（刷新可能同时发出多个），直到手动放行；放行前页面保持旧数据。
function hold(page, path) {
  let open;
  const gate = new Promise((r) => (open = r));
  let seen;
  const arrived = new Promise((r) => (seen = r));
  let done = false;
  const handler = async (route) => {
    if (done) return route.fallback();
    seen();
    const action = await gate;
    if (action === "fail") await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"读取失败"}' });
    else await route.fallback();
  };
  const release = async (action) => {
    done = true;
    open(action);
  };
  return page.route(`**${path}`, handler).then(() => ({ arrived, release }));
}

try {
  await app.mark("协同项目");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${app.url}/#collab`);
  const card = page.getByRole("article", { name: "协同看板：协同项目", exact: true });
  await card.getByText("P-20260930-14", { exact: true }).waitFor();

  // 1. 刷新在途时生成 14 的口令；刷新落地到 15。
  await bump("P-20260930-15");
  let gate = await hold(page, "/api/collab/board");
  await button(page, "刷新看板").click();
  await gate.arrived;
  await button(card, "生成派发口令").click();
  let dialog = page.getByRole("dialog", { name: "派发口令：协同项目" });
  const oldText = await dialog.getByLabel("口令预览").innerText();
  assert.ok(oldText.includes("state_id P-20260930-14"), "口令基于 14");
  await gate.release("ok");
  await card.getByText("P-20260930-15", { exact: true }).waitFor();
  await dialog.getByRole("alert").getByText(/看板已刷新到 P-20260930-15，这份口令基于 P-20260930-14，已过期/).waitFor();
  assert.equal(await button(dialog, "确认并复制").isDisabled(), true, "过期口令不能确认复制");
  assert.equal((await log()).length, 0, "过期口令不计入留痕");
  await button(dialog, "取消").click();
  await dialog.waitFor({ state: "detached" });
  assert.equal((await log()).length, 0, "取消不计");
  ok("刷新落地到新编号后，旧口令标为过期、不能确认复制，取消不计入留痕");

  // 2. 重新生成：口令、剪贴板与留痕都是 15；重复点击只计一次。
  await button(card, "生成派发口令").click();
  dialog = page.getByRole("dialog", { name: "派发口令：协同项目" });
  const newText = await dialog.getByLabel("口令预览").innerText();
  assert.ok(newText.includes("P-20260930-15"));
  await button(dialog, "确认并复制").dblclick();
  await dialog.waitFor({ state: "detached" });
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(copied, newText);
  let records = await log();
  assert.equal(records.length, 1, "重复点击只计一次");
  assert.deepEqual([records[0].stateId, records[0].promptSha256], ["P-20260930-15", sha(copied)]);
  ok("重新生成后剪贴板与留痕编号一致（15），指纹对应实际复制的口令");

  // 3. 刷新失败：看板清空，口令弹窗随之关闭，不计入留痕。
  gate = await hold(page, "/api/collab/board");
  await button(page, "刷新看板").click();
  await gate.arrived;
  await button(card, "生成派发口令").click();
  dialog = page.getByRole("dialog", { name: "派发口令：协同项目" });
  await dialog.waitFor();
  await gate.release("fail");
  await dialog.waitFor({ state: "detached" });
  assert.equal((await log()).length, 1);
  ok("刷新失败时口令弹窗关闭，不计入留痕");

  // 4. 补记：复制成功但留痕失败；补记的是当时复制的 15 及其指纹。
  await page.reload();
  await card.getByText("P-20260930-15", { exact: true }).waitFor();
  await button(card, "生成派发口令").click();
  dialog = page.getByRole("dialog", { name: "派发口令：协同项目" });
  const pendingText = await dialog.getByLabel("口令预览").innerText();
  await page.route("**/api/collab/record", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"写入失败"}' }), { times: 1 });
  await button(dialog, "确认并复制").click();
  await dialog.getByRole("alert").getByText(/口令已复制，但留痕没有写入/).waitFor();
  await button(dialog, "补记留痕").click();
  await page.getByText("已补记操作留痕").waitFor();
  records = await log();
  assert.equal(records.length, 2);
  assert.deepEqual([records[1].stateId, records[1].promptSha256], ["P-20260930-15", sha(pendingText)]);
  await button(dialog, "关闭").click();
  ok("补记使用复制时的快照编号与指纹，不受之后的状态变化影响");

  // 5. 开工口令（项目空间状态卡）：体检刷新到 17 后旧口令同样过期。
  await bump("P-20260930-16");
  await page.goto(`${app.url}/#projects`);
  await page.reload();
  const status = page.getByRole("article", { name: "项目状态卡：协同项目", exact: true });
  await status.getByText("P-20260930-16", { exact: true }).waitFor();
  await bump("P-20260930-17");
  gate = await hold(page, "/api/project-status/inspect");
  await button(page, "重新体检").click();
  await gate.arrived;
  await button(status, "生成开工口令").click();
  dialog = page.getByRole("dialog", { name: "开工口令：协同项目" });
  await dialog.waitFor();
  await gate.release("ok");
  await status.getByText("P-20260930-17", { exact: true }).waitFor();
  await dialog.getByRole("alert").getByText(/看板已刷新到 P-20260930-17，这份口令基于 P-20260930-16，已过期/).waitFor();
  assert.equal(await button(dialog, "确认并复制").isDisabled(), true);
  await button(dialog, "取消").click();
  assert.equal((await log()).length, 2);
  ok("开工口令同样绑定快照：刷新到新编号后过期，不计入留痕");

  assert.deepEqual(errors, []);
  ok("无页面脚本错误");
} finally {
  await browser.close();
  await app.close();
}

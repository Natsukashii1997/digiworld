// C5-F2（Codex 复核 115）：口令与留痕必须绑定同一份状态快照。
// 看板刷新在途时生成口令、刷新落地到新编号后：不能把旧口令按新状态计入留痕；口令标为过期、不能确认复制，
// 重新生成后正常复制并计入新编号。刷新失败、补记与开工口令同样处理。合成仓库与合成 CURRENT.md 在临时目录现建。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { preview as openPreview, copyPrompt, copied } from "./collab-v16-helpers.mjs";
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
  const card = page.locator(".collab-v16");
  await card.getByRole("button", { name: /推断依据.*P-20260930-14/ }).waitFor();

  // 1. Editable draft retains its old state until explicit regeneration.
  let launch = await openPreview(page);
  const editor = launch.getByLabel("提示词", { exact: true });
  const oldText = await editor.inputValue();
  assert.ok(oldText.includes("state_id P-20260930-14"));
  await bump("P-20260930-15");
  let gate = await hold(page, "/api/collab/protocol");
  await button(page, "刷新看板").evaluate(e=>e.click()); await gate.arrived;
  await gate.release("ok");
  await card.getByRole("button", { name: /推断依据.*P-20260930-15/ }).waitFor();
  await card.getByRole("alert").filter({hasText:/项目协议或运行已变化/}).waitFor();
  assert.equal(await button(launch, "只复制提示词").isDisabled(), true);
  assert.equal(await editor.inputValue(), oldText);
  assert.equal((await log()).length, 0);
  ok("新编号不会悄悄覆盖编辑稿；过期稿零复制零留痕");

  // 2. The edited content, clipboard and hash must be identical.
  await button(card, "按最新状态重新生成").click();
  const newText = (await editor.inputValue()) + "\n用户补充：只复核这份修改。";
  assert.ok(newText.includes("P-20260930-15"));
  await editor.fill(newText);
  let copies = 0;
  await page.exposeFunction("countCopy",()=>copies++);
  await page.evaluate(()=>{const write=navigator.clipboard.writeText.bind(navigator.clipboard);navigator.clipboard.writeText=async text=>{await window.countCopy();return write(text);};});
  gate = await hold(page, "/api/collab/protocol");
  await button(launch,"只复制提示词").dblclick(); await gate.arrived;
  assert.equal(await page.getByRole("dialog").count(),0);
  await gate.release("ok"); await copied(page);
  const copiedText = await page.evaluate(()=>navigator.clipboard.readText());
  assert.equal(copiedText,newText); assert.equal(copies,1);
  let records=await log(); assert.equal(records.length,1);
  assert.deepEqual([records[0].stateId,records[0].promptSha256],["P-20260930-15",sha(newText)]);
  assert.equal(Object.hasOwn(records[0],"prompt"),false);
  ok("编辑稿直接复制，无弹窗；重复点击只复制/留痕一次，hash对应实际文本");

  // 3. Refresh failure keeps the draft blocked and adds no record.
  gate=await hold(page,"/api/collab/protocol");
  await button(page,"刷新看板").evaluate(e=>e.click()); await gate.arrived; await gate.release("fail");
  await card.getByRole("alert").filter({hasText:/项目协议或运行已变化/}).waitFor();
  assert.equal((await log()).length,1);
  assert.equal(await page.getByRole("dialog").count(),0);
  for(const control of await card.getByRole("button",{name:/^(只复制口令|只复制提示词|已复制|带到 .* 继续)$/}).all()) assert.equal(await control.isDisabled(),true);
  ok("刷新失败不复制、不留痕");

  // 4. Lost response after a successful write retries the same ID without recopy.
  await page.reload();
  await card.getByRole("button",{name:/推断依据.*P-20260930-15/}).waitFor();
  launch=await openPreview(page);
  const pendingText=await launch.getByLabel("提示词",{exact:true}).inputValue();
  let pendingId, retryId;
  await page.route("**/api/collab/record",async route=>{
    pendingId=route.request().postDataJSON().id;
    await route.fetch();
    await route.fulfill({status:500,json:{error:"回执丢失"}});
  },{times:1});
  await copyPrompt(page);
  await card.getByRole("alert").filter({hasText:/口令已复制，但留痕没有写入/}).waitFor();
  assert.equal((await log()).length,2);
  assert.equal(await page.getByLabel("下一棒 Agent").isDisabled(),true);
  await page.evaluate(()=>{navigator.clipboard.writeText=()=>{throw new Error("补记不可再复制");};});
  await page.route("**/api/collab/record",async route=>{retryId=route.request().postDataJSON().id;await route.fallback();},{times:1});
  await button(card,"补记留痕").click(); await page.getByText("已补记操作留痕").waitFor();
  assert.equal(retryId,pendingId);
  records=await log(); assert.equal(records.length,2);
  assert.deepEqual([records[1].stateId,records[1].promptSha256],["P-20260930-15",sha(pendingText)]);
  ok("回执丢失同ID补记，无重复复制或留痕");

  // 5. 开工口令（项目空间状态卡）：体检刷新到 17 后旧口令同样过期。
  await bump("P-20260930-16"); await page.goto(`${app.url}/#projects`); await page.reload();
  const status = page.getByRole("article", { name: "项目状态卡：协同项目", exact: true });
  const resume=button(status,"继续");await resume.waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('article')].find(e=>e.getAttribute('aria-label')==='项目状态卡：协同项目')?.querySelector('.pj-go')?.disabled===false);
  await bump("P-20260930-17"); gate = await hold(page, "/api/project-status/inspect");
  await button(page.getByRole('region',{name:'在推进项目'}),'刷新').click(); await gate.arrived;
  await resume.click(); const start=page.locator('.pj-launch');await button(start,'预览口令').click();
  const preview=start.getByLabel('口令预览');assert.match(await preview.innerText(),/输入状态：state_id P-20260930-16/);await gate.release("ok");
  await page.getByRole('alert').filter({hasText:/看板已刷新到 P-20260930-17，这份口令基于 P-20260930-16，已过期/}).waitFor();
  assert.equal(await button(start,'只复制').isDisabled(),true);assert.equal(await start.getByRole('button',{name:/^带到 .* 继续$/}).isDisabled(),true);
  assert.match(await preview.innerText(),/输入状态：state_id P-20260930-16/);assert.doesNotMatch(await preview.innerText(),/输入状态：state_id P-20260930-17/);
  await button(start,'收起发车条').click();await start.waitFor({state:'detached'});assert.equal((await log()).length,2);
  ok("开工口令同样绑定快照：刷新到新编号后过期，不计入留痕");

  assert.deepEqual(errors, []);
  ok("无页面脚本错误");
} finally {
  await browser.close();
  await app.close();
}

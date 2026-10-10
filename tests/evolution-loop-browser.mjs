// 进化回路 v1（产品定义 v1.1 §4.6；v1.2 §4.7 薄控制面）：
// 需改进反馈 → 生成改版任务包并复制 → 粘贴 Agent 回复（缺段报错、恶意内容当文本）→ 候选进入待处理 →
// 与当前版本比较 → 退回（写原因）/ 采用（新版本注明候选 ID，历史不变）→ 证据（采用前后次数与需改进比例）。
// 全程不调用任何 Agent 或模型；另查 44px、axe、390 宽无横溢。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture.mjs";
import { seed, current } from "../src/store.js";
import { PACKET_MARKERS as M } from "../src/evolution.js";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await fixture();
const initial = await app.repository.write(seed(), { initialize: true });
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch();
const errors = [];
const outbound = [];
const ok = (s) => console.log("PASS", s);
const prompt = initial.assets.find((a) => a.type === "Prompt");
const skill = initial.assets.find((a) => a.type === "Skill");
const read = () => app.repository.read();
const assetOf = async (id = prompt.id) => (await read()).assets.find((a) => a.id === id);
const candidates = async () => (await read()).revisionCandidates || [];

async function open(width, height = 1100) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(`${width} ${e.message}`));
  // 薄控制面：页面只能访问本机工作台，不向任何外部服务发请求。
  page.on("request", (r) => {
    if (!r.url().startsWith(app.url) && !r.url().startsWith("data:") && !r.url().startsWith("blob:"))
      outbound.push(r.url());
  });
  await page.goto(`${app.url}/#assets`);
  await page.locator(".asset-card").first().waitFor();
  return page;
}
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
async function atLeast44(locator, name) {
  const box = await locator.boundingBox();
  assert.ok(box, `${name} 不可见`);
  assert.ok(box.width >= 44 && box.height >= 44, `${name} 点击区域 ${box.width}x${box.height}，应至少 44px`);
}
async function axe(page, label) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    result.violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target).join(" ")}`),
    [],
  );
}
async function noOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const drawer = document.querySelector('[role="dialog"]');
    return Math.max(
      document.documentElement.scrollWidth - window.innerWidth,
      drawer ? drawer.scrollWidth - drawer.clientWidth : 0,
    );
  });
  assert.ok(overflow <= 0, `${label} 横向溢出 ${overflow}px`);
}
async function until(check, label) {
  for (let i = 0; i < 50; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`等待超时：${label}`);
}
async function openAsset(page, asset) {
  await button(page, `查看 ${current(asset).title}`).click();
  await page.getByRole("region", { name: "使用记录与反馈" }).waitFor();
  return page.getByRole("dialog", { name: "资产详情" });
}
async function closeDetail(page) {
  await button(page, "关闭").click();
  await page.getByRole("dialog", { name: "资产详情" }).waitFor({ state: "hidden" });
}
const reply = (body, note) =>
  ["好的，改版如下。", M.contentStart, body, M.contentEnd, M.noteStart, note, M.noteEnd].join("\n");
async function pasteReply(detail, text) {
  const box = detail.getByLabel("粘贴 Agent 回复");
  await box.fill(text);
  await button(detail, "解析并存为候选").click();
}
const pendingCount = async (page) =>
  Number((await page.locator(".topbar-inbox").getAttribute("aria-label")).match(/待处理 (\d+) 项/)[1]);

try {
  const page = await open(1440);
  // 新来源在抽屉读回后就绪；先读回稳定状态，再验证候选严格 +1/-1。
  await page.locator(".topbar-inbox").click();
  await page.getByRole("button",{name:/个人说明 MCP 未运行/}).waitFor();
  await button(page,"关闭待处理").click();
  const v1 = current(prompt);

  // 0. 没有“需改进”反馈时不出现任务包入口；Skill 不提供改版任务包。
  let detail = await openAsset(page, prompt);
  assert.equal(await button(detail, "生成改版任务包").count(), 0);
  await closeDetail(page);
  detail = await openAsset(page, skill);
  assert.equal(await button(detail, "生成改版任务包").count(), 0);
  await closeDetail(page);
  ok("没有需改进反馈时不显示“生成改版任务包”；Skill 不提供");

  // 1. 反馈“需改进”→ 出现生成改版任务包
  detail = await openAsset(page, prompt);
  await button(detail, "需改进").click();
  await detail.getByLabel("反馈备注（可选）").fill("问题拆得不够细，缺少举例");
  await button(detail, "保存反馈").click();
  await page.getByText("反馈已保存", { exact: true }).waitFor();
  const evolution = detail.getByRole("region", { name: "改版进化" });
  await evolution.waitFor();
  await atLeast44(button(evolution, "生成改版任务包"), "生成改版任务包");
  const pendingBefore = await pendingCount(page);
  ok("保存“需改进”反馈后，资产详情出现“改版进化”与“生成改版任务包”");

  // 2. 生成并复制任务包：含当前版本全文与反馈备注；复制任务包不计为资产使用
  await button(evolution, "生成改版任务包").click();
  const packet = evolution.getByRole("region", { name: "改版任务包" });
  await packet.waitFor();
  const packetText = await packet.locator("pre").innerText();
  assert.ok(packetText.includes(v1.content.split("\n")[0]), "任务包含当前版本正文");
  assert.ok(packetText.includes("问题拆得不够细，缺少举例"), "任务包含反馈备注");
  for (const marker of Object.values(M)) assert.ok(packetText.includes(marker), marker);
  assert.match(packetText, /禁止事项/);
  await axe(page, "任务包");
  await atLeast44(button(evolution, "复制任务包"), "复制任务包");
  await button(evolution, "复制任务包").click();
  await until(async () => (await page.evaluate(() => navigator.clipboard.readText())).includes(M.contentStart), "剪贴板写入任务包");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(clip.includes(v1.content), "复制的是完整当前版本全文");
  assert.equal((await read()).assetActivity.filter((r) => r.kind === "use").length, 0, "复制任务包不计为使用");
  ok("生成改版任务包：含当前版本全文、反馈备注、产出格式与禁止事项；一键复制，不计为资产使用");

  // 3. 粘贴缺段回复：明确报错，不保存候选，粘贴内容保留
  const revision0 = (await read()).revision;
  await pasteReply(evolution, [M.contentStart, "只有正文", M.contentEnd].join("\n"));
  await evolution.getByRole("alert").filter({ hasText: "缺少" }).waitFor();
  assert.match(await evolution.getByRole("alert").innerText(), /改动说明/);
  assert.equal((await read()).revision, revision0, "解析失败不写主库");
  assert.match(await evolution.getByLabel("粘贴 Agent 回复").inputValue(), /只有正文/);
  ok("缺段回复：提示缺少“改动说明”，不写主库，粘贴内容保留");

  // 4. 恶意内容当文本：存为候选，页面按原文显示，不执行
  const evil = `# 更清晰的问题\n<img src=x onerror="window.__pwned=1">\n<script>window.__pwned=2</script>\n1. 先写现象`;
  await pasteReply(evolution, reply(evil, "<b>加粗</b>：拆细步骤并增加举例"));
  const compare = detail.getByRole("region", { name: "改版候选比较" });
  await compare.waitFor();
  await until(async () => (await candidates()).length === 1, "候选入库");
  const [c1] = await candidates();
  assert.equal(c1.status, "pending");
  assert.equal(c1.content, evil);
  assert.equal(c1.baseVersionId, v1.id);
  assert.equal(await page.evaluate(() => window.__pwned), undefined, "恶意内容没有被执行");
  assert.ok((await compare.innerText()).includes('<img src=x onerror="window.__pwned=1">'), "按原文显示");
  assert.ok((await compare.innerText()).includes("<b>加粗</b>"), "改动说明按原文显示");
  assert.equal(await compare.locator("img, script, b").count(), 0);
  assert.equal(await evolution.getByLabel("粘贴 Agent 回复").count(), 0, "有待处理候选时收起粘贴框");
  ok("恶意内容：候选按原文存入并显示，不生成任何标签、不执行脚本");

  // 5. 比较：复用逐行差异组件
  await compare.getByLabel("逐行差异").waitFor();
  assert.ok((await compare.locator(".diff-line.added").count()) > 0);
  assert.ok((await compare.locator(".diff-line.removed").count()) > 0);
  await compare.getByText(`当前 v1.0 → 候选`).waitFor();
  ok("比较：当前版本与候选用现有逐行差异组件显示");

  // 6. 顶栏待处理 +1；从待处理跳回资产详情
  await until(async () => (await pendingCount(page)) === pendingBefore + 1, "待处理 +1");
  await closeDetail(page);
  await page.locator(".topbar-inbox").click();
  const item = page.getByRole("button", { name: /有改版候选待比较/ });
  await item.waitFor();
  await item.click();
  detail = page.getByRole("dialog", { name: "资产详情" });
  await detail.getByRole("region", { name: "改版候选比较" }).waitFor();
  ok("候选进入顶栏待处理；点击直接打开资产详情里的比较");

  await axe(page, "候选比较");
  for (const name of ["采用为新版本", "退回"]) await atLeast44(button(detail, name), name);
  await page.screenshot({ path: "test-results/evolution-compare-1440.png" });

  // 7. 退回：写原因；不产生新版本
  await button(detail, "退回").click();
  await detail.getByLabel("退回原因（可选）").fill("举例与业务不符");
  for (const name of ["确认退回", "取消退回"]) await atLeast44(button(detail, name), name);
  await button(detail, "确认退回").click();
  await until(async () => (await candidates())[0].status === "returned", "候选已退回");
  assert.equal((await candidates())[0].returnReason, "举例与业务不符");
  assert.equal((await assetOf()).versions.length, 1, "退回不产生新版本");
  await detail.getByRole("region", { name: "已处理的候选" }).getByText("举例与业务不符").waitFor();
  await until(async () => (await pendingCount(page)) === pendingBefore, "待处理恢复");
  ok("退回：候选标记已退回并保存原因，不产生新版本，待处理减 1");

  // 8. 再次粘贴合格回复 → 采用：生成新版本并注明候选 ID，历史不变
  const evolution2 = detail.getByRole("region", { name: "改版进化" });
  await pasteReply(evolution2, reply("# 更清晰的问题\n\n1. 先写现象\n2. 再写期望\n3. 举一个例子", "拆细步骤，补充举例"));
  await detail.getByRole("region", { name: "改版候选比较" }).waitFor();
  await until(async () => (await candidates()).length === 2, "第二个候选入库");
  const before = structuredClone((await assetOf()).versions);
  await button(detail, "采用为新版本").click();
  await until(async () => (await assetOf()).versions.length === 2, "生成新版本");
  const adopted = await assetOf();
  assert.deepEqual(adopted.versions.slice(0, 1), before, "历史版本一字不改");
  const c2 = (await candidates())[1];
  assert.equal(c2.status, "adopted");
  assert.equal(current(adopted).candidateId, c2.id);
  assert.equal(c2.adoptedVersionId, current(adopted).id);
  assert.equal(current(adopted).content, "# 更清晰的问题\n\n1. 先写现象\n2. 再写期望\n3. 举一个例子");
  await detail.locator(".detail-version").getByText("2", { exact: false }).waitFor();
  assert.equal(await detail.getByRole("region", { name: "改版候选比较" }).count(), 0);
  // 历史标签里能看到来源候选
  await detail.getByRole("button", { name: /^历史\s*2$/ }).click();
  await detail.getByLabel("查看版本").selectOption({ label: "v2.0 · 当前" });
  await detail.getByText(`来自改版候选 ${c2.id.slice(0, 8)}`).waitFor();
  await button(detail, "内容预览").click();
  ok("采用：生成 v2.0，版本注明改版候选 ID，历史版本不变，候选标记已采用");

  // 9. 证据：采用前后复制次数与需改进比例（只用已有记录）
  const evidence = detail.getByRole("region", { name: "改版证据" });
  await evidence.waitFor();
  let evidenceText = await evidence.innerText();
  assert.match(evidenceText, /v1\.0 → v2\.0/);
  assert.match(evidenceText, /复制 0 次 → 0 次/);
  assert.match(evidenceText, /需改进 100%（1\/1） → 无反馈/);
  await button(detail, "复制全文").click();
  await page.getByText("使用记录已保存", { exact: true }).waitFor();
  await button(detail, "好用").click();
  await button(detail, "保存反馈").click();
  await page.getByText("反馈已保存", { exact: true }).waitFor();
  await until(async () => /复制 0 次 → 1 次/.test(await evidence.innerText()), "证据更新复制次数");
  evidenceText = await evidence.innerText();
  assert.match(evidenceText, /需改进 100%（1\/1） → 0%（0\/1）/);
  assert.equal(await page.getByText(/仪表盘/).count(), 0);
  await axe(page, "采用后证据");
  await page.screenshot({ path: "test-results/evolution-evidence-1440.png" });
  ok("证据：按资产显示采用前后复制次数与需改进比例，随真实记录更新，无反馈时写“无反馈”");
  await page.context().close();

  // 10. 390 宽：任务包、粘贴框、候选比较都不横向溢出
  const narrow = await open(390, 844);
  const second = initial.assets.filter((a) => a.type === "Prompt")[1];
  detail = await openAsset(narrow, second);
  await button(detail, "需改进").click();
  await button(detail, "保存反馈").click();
  await narrow.getByText("反馈已保存", { exact: true }).waitFor();
  const ev = detail.getByRole("region", { name: "改版进化" });
  await button(ev, "生成改版任务包").click();
  await ev.getByRole("region", { name: "改版任务包" }).waitFor();
  await noOverflow(narrow, "390 任务包");
  await pasteReply(ev, reply("x".repeat(300) + "\n" + "很长的一行没有空格".repeat(40), "改动说明".repeat(60)));
  await detail.getByRole("region", { name: "改版候选比较" }).waitFor();
  await noOverflow(narrow, "390 候选比较");
  for (const name of ["采用为新版本", "退回"]) await atLeast44(button(detail, name), `390 ${name}`);
  await axe(narrow, "390 候选比较");
  await narrow.screenshot({ path: "test-results/evolution-compare-390.png", fullPage: false });
  ok("390 宽：任务包与候选比较无横向溢出，按钮至少 44px，axe 通过");
  await narrow.context().close();

  assert.deepEqual(outbound, [], "页面没有访问任何外部服务");
  assert.deepEqual(errors, []);
  ok("全程无页面错误，无外部请求");
} finally {
  await browser.close();
  await app.close();
}

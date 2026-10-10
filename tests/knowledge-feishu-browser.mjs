import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { knowledge193Fixture } from "./knowledge-v16-fixture.mjs";
import { createFeishuKnowledgeFiles, feishuPrincipalIdentity } from "../server/knowledge-feishu.mjs";

const output = process.env.GUIJI_TEST_RESULTS || "test-results/knowledge-feishu";
await mkdir(output, { recursive:true });
const SPACE = "7160145948494381236", ROOT = "wikcnVisualRoot12345", CHILD = "wikcnVisualChild12345";
const nodes = new Map([
  [ROOT, { space_id:SPACE, node_token:ROOT, obj_token:"docxVisualRoot12345", obj_type:"docx", node_type:"origin", parent_node_token:"", title:"合成飞书根节点", has_child:true }],
  [CHILD, { space_id:SPACE, node_token:CHILD, obj_token:"docxVisualChild12345", obj_type:"docx", node_type:"origin", parent_node_token:ROOT, title:"飞书接力笔记", has_child:false }],
]);
const calls = [];
let denied = false;
const provider = createFeishuKnowledgeFiles({ principal:async () => feishuPrincipalIdentity("cli_aacf58ab61b85beb", "ou_synthetic_visual"), cli:async (args) => {
  calls.push(args);
  if (denied) throw Object.assign(new Error("合成撤权"), { status:401, code:"FEISHU_AUTH_REQUIRED" });
  if (args[0] === "wiki" && args[1] === "+node-get")
    return { ...nodes.get(args[args.indexOf("--node-token") + 1]) };
  if (args[0] === "wiki" && args[1] === "+node-list")
    return { nodes:[{ ...nodes.get(CHILD) }], has_more:false, page_token:"" };
  if (args[0] === "docs" && args[1] === "+fetch")
    return { document:{ content:args[args.indexOf("--doc") + 1] === "docxVisualChild12345" ? "# 飞书接力笔记\n合成接力正文" : "# 合成飞书根节点" } };
  throw new Error("unexpected synthetic command");
} });
const app = await knowledge193Fixture({ feishuKnowledge:provider,
  staticRoot:process.env.GUIJI_TEST_STATIC_ROOT || join(import.meta.dirname, "../dist") });
const browser = await chromium.launch({ headless:true });
const screenshots = [];
const errors = [];
try {
  let state = await app.workspace();
  let response = await app.call("/knowledge/connect", {
    name:"不能伪装本地目录", kind:"markdown", root:`feishu://wiki/${ROOT}`,
    confirmed:true, expectedRevision:state.revision,
  });
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0, "旧本地连接入口不能绕路读取飞书账号");
  response = await app.call("/knowledge/feishu/connect", {
    name:"合成飞书", wikiUrl:`https://feishu.cn/wiki/${ROOT}`,
    confirmed:true, expectedRevision:state.revision,
  });
  assert.equal(response.status, 200);
  const source = response.body.connections.knowledgeSources.find((item) => item.kind === "feishu");
  assert.equal(source.agentSharing, false);
  assert.equal(source.feishuSpaceId, null);
  assert.equal(calls.length, 0, "仅登记指针不能访问飞书账号");
  const context = await browser.newContext({ viewport:{ width:1440, height:1000 }, reducedMotion:"reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.url + "/#knowledge");
  const card = page.getByRole("button", { name:"合成飞书", exact:true });
  await card.getByText(/需授权/).waitFor();
  assert.equal(calls.length, 0, "页面打开不能自动请求飞书账号");
  screenshots.push("feishu-needs-auth-1440.png");
  await page.screenshot({ path:join(output, screenshots.at(-1)), fullPage:true });
  await page.setViewportSize({ width:390, height:844 });
  screenshots.push("feishu-needs-auth-390.png");
  await page.screenshot({ path:join(output, screenshots.at(-1)), fullPage:true });
  await page.setViewportSize({ width:1440, height:1000 });
  await card.click();
  const drawer = page.getByRole("dialog", { name:"合成飞书" });
  assert.equal(await drawer.getByRole("button", { name:"扫描文件" }).count(), 0);
  assert.equal(await drawer.getByRole("button", { name:"重新确认目录" }).count(), 0);
  assert.equal(await drawer.getByText(/目录绝对路径/).count(), 0);
  assert.equal(await drawer.getByRole("checkbox", { name:"开放知识给 Agent" }).isDisabled(), true);
  await drawer.getByText(/同机可连接本机知识 MCP 的其他进程/).waitFor();
  await drawer.getByRole("button", { name:"核验范围" }).click();
  await drawer.getByText(/已核验空间/).waitFor();
  screenshots.push("feishu-source-1440.png");
  await page.screenshot({ path:join(output, screenshots.at(-1)), fullPage:true });
  await page.setViewportSize({ width:390, height:844 });
  screenshots.push("feishu-source-390.png");
  await page.screenshot({ path:join(output, screenshots.at(-1)), fullPage:true });
  await page.setViewportSize({ width:1440, height:1000 });
  state = await app.workspace();
  assert.equal(state.connections.knowledgeSources.find((item) => item.id === source.id).agentSharing, false);
  await page.getByRole("dialog").getByRole("button", { name:"关闭", exact:true }).click();
  await page.locator(".toast").waitFor({ state:"detached" });
  const keyword = page.getByRole("searchbox", { name:"跨库检索", exact:true });
  await keyword.fill("接力");
  await keyword.press("Enter");
  await page.getByText(/4 个库中 4 个已查/).waitFor();
  assert.ok(await page.locator(".kh-results .kh-res-tag").allTextContents().then((items) => items.includes("FEISHU")));
  assert.equal(await page.locator(".kh-results").getByText(CHILD, { exact:false }).count(), 0);
  await page.getByText("合成飞书/合成飞书根节点 / 飞书接力笔记").waitFor();
  await page.locator(".kh-filter button").filter({ hasText:"合成飞书" }).click();
  assert.equal(await page.locator(".kh-results li").count(), 1);
  await page.locator(".kh-results .kh-res").click();
  await page.locator(".knowledge-original").getByText(/合成接力正文/).waitFor();
  assert.equal(await page.getByRole("link", { name:"在 Obsidian 中打开" }).count(), 0);
  assert.equal(await page.locator(".knowledge-path").getByText(CHILD, { exact:false }).count(), 0);
  screenshots.push("feishu-read-1440.png");
  await page.screenshot({ path:join(output, screenshots.at(-1)), fullPage:true });
  await page.setViewportSize({ width:390, height:844 });
  screenshots.push("feishu-read-390.png");
  await page.screenshot({ path:join(output, screenshots.at(-1)), fullPage:true });
  await page.setViewportSize({ width:1440, height:1000 });
  await page.getByRole("dialog").getByRole("button", { name:"关闭", exact:true }).click();
  await page.locator(".kh-filter button").filter({ hasText:"全部" }).click();
  screenshots.push("feishu-search-1440.png");
  await page.screenshot({ path:join(output, screenshots.at(-1)), fullPage:true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height:844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `feishu overflow ${width}`);
    if (width === 390) {
      screenshots.push("feishu-search-390.png");
      await page.screenshot({ path:join(output, screenshots.at(-1)), fullPage:true });
      const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      assert.deepEqual(audit.violations, []);
    }
  }
  denied = true;
  await page.setViewportSize({ width:390, height:844 });
  await keyword.fill("接力");
  await keyword.press("Enter");
  await page.getByRole("alert").getByText(/知识授权或范围已变化/).waitFor();
  await card.getByText(/需重新核验/).waitFor();
  assert.match(await card.getAttribute("class"), /warn/);
  assert.match(await card.getAttribute("aria-describedby"), /kh-source-status-/);
  assert.equal(await page.locator(".kh-lines .broken").count() > 0, true);
  assert.equal((await app.workspace()).connections.knowledgeSources.find((item) => item.id === source.id).agentSharing, false);
  screenshots.push("feishu-revoked-390.png");
  await page.screenshot({ path:join(output, screenshots.at(-1)), fullPage:true });
  await page.setViewportSize({ width:320, height:844 });
  screenshots.push("feishu-revoked-320.png");
  await page.screenshot({ path:join(output, screenshots.at(-1)), fullPage:true });
  assert.equal(await page.locator(".kh-results .kh-res-tag").count(), 0);
  await card.click();
  await page.getByRole("dialog", { name:"合成飞书" }).getByText(/授权或范围已变化，读取暂停/).waitFor();
  screenshots.push("feishu-revoked-source-320.png");
  await page.screenshot({ path:join(output, screenshots.at(-1)), fullPage:true });
  assert.deepEqual(errors, []);
  await writeFile(join(output, "report.json"), JSON.stringify({ screenshots, errors, cliCalls:calls.length,
    stateKind:source.kind, readOnly:true, profile:"synthetic" }, null, 2));
  await context.close();
  console.log("PASS 飞书待授权/核验/跨源检索/原文/撤权 1440·390·320 合成闭环");
} finally {
  await browser.close();
  await app.close();
}

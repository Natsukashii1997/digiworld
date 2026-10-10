import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { knowledge193Fixture } from "./knowledge-v16-fixture.mjs";
import { createFeishuKnowledgeFiles, feishuPrincipalIdentity } from "../server/knowledge-feishu.mjs";

const output = process.env.GUIJI_TEST_RESULTS || "test-results/knowledge-feishu-space";
await mkdir(output, { recursive:true });
const SPACE = "7160145948494381236", A = "wikcnSpaceVisualA12345", B = "wikcnSpaceVisualB12345";
const nodes = new Map([
  [A, { space_id:SPACE, node_token:A, obj_token:"docxSpaceVisualA12345", obj_type:"docx", node_type:"origin", parent_node_token:"", title:"合成空间甲", has_child:false }],
  [B, { space_id:SPACE, node_token:B, obj_token:"docxSpaceVisualB12345", obj_type:"docx", node_type:"origin", parent_node_token:"", title:"合成空间乙", has_child:false }],
]);
const calls = [];
const provider = createFeishuKnowledgeFiles({
  principal:async () => feishuPrincipalIdentity("cli_aacf58ab61b85beb", "ou_synthetic_space_visual"),
  cli:async (args) => {
    calls.push(args);
    if (args[0] === "wiki" && args[1] === "+space-list")
      return { spaces:[{ space_id:SPACE, name:"合成知识空间" }], has_more:false, page_token:"" };
    if (args[0] === "wiki" && args[1] === "spaces" && args[2] === "get")
      return { space:{ space_id:SPACE, name:"合成知识空间" } };
    if (args[0] === "wiki" && args[1] === "+node-get")
      return { ...nodes.get(args[args.indexOf("--node-token") + 1]) };
    if (args[0] === "wiki" && args[1] === "+node-list")
      return { nodes:[...nodes.values()].map((node) => ({ ...node })), has_more:false, page_token:"" };
    if (args[0] === "docs" && args[1] === "+fetch")
      return { document:{ content:`${args[args.indexOf("--doc") + 1]} 合成空间接力` } };
    throw new Error("unexpected synthetic command");
  },
});
const app = await knowledge193Fixture({ feishuKnowledge:provider,
  staticRoot:process.env.GUIJI_TEST_STATIC_ROOT || join(import.meta.dirname, "../dist") });
const browser = await chromium.launch({ headless:true });
const errors = [];
try {
  const context = await browser.newContext({ viewport:{ width:1440, height:950 }, reducedMotion:"reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.url + "/#knowledge");
  await page.locator(".kh-add").click();
  await page.getByRole("button", { name:"登记整个飞书知识空间" }).click();
  const form = page.getByRole("dialog", { name:"登记整个飞书知识空间" });
  await form.getByLabel("飞书知识空间").selectOption(SPACE);
  await form.getByRole("checkbox", { name:/只读接入这个知识空间/ }).check();
  await page.screenshot({ path:join(output, "feishu-space-form-1440.png"), fullPage:true });
  await page.setViewportSize({ width:390, height:844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path:join(output, "feishu-space-form-390.png"), fullPage:true });
  await page.setViewportSize({ width:1440, height:950 });
  const beforeRegister = calls.filter((args) => args[0] === "wiki" && args[1] === "spaces" && args[2] === "get").length;
  await form.getByRole("button", { name:"登记整个知识空间" }).click();
  const card = page.getByRole("button", { name:"合成知识空间", exact:true });
  await card.getByText(/来源范围待核验/).waitFor();
  assert.equal(calls.filter((args) => args[0] === "wiki" && args[1] === "spaces" && args[2] === "get").length,
    beforeRegister, "登记阶段不核验或读取空间");
  await card.click();
  const detail = page.getByRole("dialog", { name:"合成知识空间" });
  await detail.getByText(/所有顶层节点及其子树/).waitFor();
  assert.equal(await detail.getByRole("checkbox", { name:"开放知识给 Agent" }).isDisabled(), true);
  await detail.getByRole("button", { name:"核验范围" }).click();
  await detail.getByText(/已核验空间/).waitFor();
  assert.equal((await app.workspace()).connections.knowledgeSources.find((s) => s.kind === "feishu").agentSharing, false);
  await detail.getByRole("button", { name:"关闭", exact:true }).click();
  const keyword = page.getByRole("searchbox", { name:"跨库检索", exact:true });
  await keyword.fill("合成空间接力");
  await keyword.press("Enter");
  await page.getByText("合成知识空间/合成空间甲").waitFor();
  await page.getByText("合成知识空间/合成空间乙").waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height:844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
      `space connection overflow ${width}`);
    await page.screenshot({ path:join(output, `feishu-space-${width}.png`), fullPage:true });
  }
  assert.deepEqual(errors, []);
  await writeFile(join(output, "report.json"), JSON.stringify({ errors, screenshots:5,
    sourceCount:(await app.workspace()).connections.knowledgeSources.filter((s) => s.kind === "feishu").length,
    agentSharing:false, synthetic:true }, null, 2));
  await context.close();
  console.log("PASS 飞书整库选择/登记/核验/并列顶层检索及窄屏合成闭环");
} finally {
  await browser.close();
  await app.close();
}

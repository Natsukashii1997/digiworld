// 逆向工程：长候选默认折叠（用户 2026-10-03）。超过 6 行或 360 字只显示开头，可展开全文、再收起；
// 点展开按钮不会顺带勾选候选；短候选不出现按钮；按钮 44px、axe 无违规。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture.mjs";
import { seed } from "../src/store.js";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await fixture();
await app.repository.write(seed(), { initialize: true });
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);
const LONG = Array.from({ length: 10 }, (_, i) => `第 ${i + 1} 行：步骤说明`).join("\n");
const reply = {
  report: {
    summary: "折叠测试",
    structure: [{ mark: "原文观察", text: "结构" }],
    techniques: [{ mark: "推断", text: "手法" }],
    reusable: [{ mark: "已验证", text: "可复用" }],
  },
  candidates: [
    { type: "prompt", title: "长 Prompt", description: "", content: LONG, tags: [], mark: "推断" },
    { type: "prompt", title: "短 Prompt", description: "", content: "一句话", tags: [], mark: "推断" },
  ],
};
const fence = (value) => "```json\n" + JSON.stringify(value, null, 2) + "\n```";

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${app.url}/#references`);
  const wb = page.getByRole("region", { name: "逆向工程工作区" });
  await wb.getByLabel("素材原文").fill("素材");
  await wb.getByRole("button", { name: "生成拆解任务包", exact: true }).click();
  await wb.getByLabel("拆解任务包", { exact: true }).waitFor();
  await wb.getByLabel("Agent 回复").fill(fence(reply));
  await wb.getByRole("button", { name: "解析回复", exact: true }).click();
  const group = wb.getByRole("group", { name: "候选资产" });
  await group.waitFor();
  const text = group.locator(".candidate-text");
  const longText = () => text.nth(0).innerText();
  assert.ok((await longText()).includes("第 6 行"));
  assert.ok(!(await longText()).includes("第 7 行"), "长候选默认只显示前 6 行");
  assert.equal(await text.nth(1).innerText(), "一句话");
  const fold = group.getByRole("button", { name: "展开全文（共 10 行）" });
  assert.equal(await group.locator(".candidate-fold").count(), 1, "短候选没有展开按钮");
  const box = await fold.boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44, `展开按钮 ${box.width}x${box.height}`);
  const first = group.getByRole("checkbox", { name: /^候选 1：/ });
  await fold.click();
  assert.ok((await longText()).includes("第 10 行"), "展开后显示全文");
  assert.equal(await first.isChecked(), false, "点展开不勾选候选");
  await group.getByRole("button", { name: "收起" }).click();
  assert.ok(!(await longText()).includes("第 7 行"), "收起后恢复折叠");
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  assert.deepEqual(axe.violations.map((v) => v.id), []);
  ok("长候选默认折叠为前 6 行，可展开与收起，不顺带勾选；短候选无按钮；44px、axe 通过");
  assert.deepEqual(errors, []);
  ok("无页面脚本错误");
} finally {
  await browser.close();
  await app.close();
}

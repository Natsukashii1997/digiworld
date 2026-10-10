import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { contextFixture } from "./context-fixture.mjs";
import { parseRuleBlock } from "../server/rule-templates.mjs";
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
const agents = join(app.root, "AGENTS.md");
const axe = async () =>
  assert.deepEqual(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
    [],
  );
const panel = () => page.getByRole("region", { name: "装入项目" });
async function confirmWrite(label) {
  await panel().getByLabel(label, { exact: true }).check();
  await panel()
    .getByRole("button", { name: label.includes("撤回") ? "确认撤回" : "确认写入", exact: true })
    .click();
  await panel().getByText("已写入，回读一致", { exact: true }).waitFor();
}
try {
  const original = await readFile(agents, "utf8");
  await page.goto(app.url + "/#assets");
  await page.getByRole("button", { name: "新建", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "规则", exact: true })
    .click();
  await page.getByLabel("名称", { exact: true }).fill("项目协同协议");
  await page.getByLabel("规则正文").fill("## 协同\n先读 CURRENT.md。\n");
  await page.getByRole("button", { name: "保存资产", exact: true }).click();
  await page
    .getByRole("button", { name: "查看 项目协同协议", exact: true })
    .click();

  await panel()
    .getByRole("button", { name: "预览装入 v1.0", exact: true })
    .click();
  await panel().getByRole("heading", { name: "追加到文件末尾" }).waitFor();
  await panel()
    .getByText(`区块外的 ${Buffer.byteLength(original)} 字节保持不变。`)
    .waitFor();
  assert.equal(await readFile(agents, "utf8"), original, "预览不写文件");
  await axe();
  await confirmWrite("确认写入此项目文件");
  const installed = await readFile(agents, "utf8");
  assert.ok(installed.startsWith(original));
  assert.equal(parseRuleBlock(installed).inner, "## 协同\n先读 CURRENT.md。\n");
  await panel().getByText("已装入 · 1").waitFor();
  console.log("PASS 新建规则→预览→确认→写入并回读；区块外不变；axe");

  const tail = "\n## 项目补充\n手写内容保留。\n";
  await writeFile(agents, installed + tail);
  const beforeUpgrade = await readFile(agents, "utf8");
  await page.getByRole("button", { name: "编辑资产", exact: true }).click();
  await page.getByLabel("规则正文").fill("## 协同 v2\n先读 CURRENT.md，再认领。\n");
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await panel().getByText("可升级", { exact: true }).waitFor();
  await panel().getByRole("button", { name: "预览升级", exact: true }).click();
  await panel()
    .getByRole("heading", { name: "升级：v1.0 → v2.0" })
    .waitFor();
  assert.ok((await panel().locator(".diff-line.added").count()) > 0);
  await confirmWrite("确认写入此项目文件");
  const upgraded = await readFile(agents, "utf8");
  assert.ok(upgraded.startsWith(original));
  assert.ok(upgraded.endsWith(tail));
  assert.match(parseRuleBlock(upgraded).inner, /再认领/);
  await panel()
    .getByText("可升级", { exact: true })
    .waitFor({ state: "detached" });
  console.log("PASS 改版→可升级→差异预览→升级；区块外手写内容保留");

  await panel()
    .getByRole("button", { name: "撤回这次写入", exact: true })
    .click();
  await panel().getByRole("heading", { name: "撤回本次写入" }).waitFor();
  await confirmWrite("确认撤回此文件的本次写入");
  assert.equal(await readFile(agents, "utf8"), beforeUpgrade);
  await panel().getByText("可升级", { exact: true }).waitFor();
  console.log("PASS 撤回→文件恢复到升级前字节");

  const drifted = beforeUpgrade.replace("先读 CURRENT.md。", "先读 CURRENT.md，被手改。");
  await writeFile(agents, drifted);
  await panel().getByRole("button", { name: "预览升级", exact: true }).click();
  await panel()
    .getByRole("heading", { name: "区块内容被手动改过" })
    .waitFor();
  assert.equal(
    await panel().getByRole("button", { name: "确认写入", exact: true }).count(),
    0,
  );
  await panel().getByLabel("覆盖区块内的改动", { exact: true }).check();
  await panel().getByRole("button", { name: "重新预览", exact: true }).click();
  await panel()
    .getByRole("heading", { name: "升级：v1.0 → v2.0" })
    .waitFor();
  await panel().getByRole("button", { name: "返回", exact: true }).click();
  assert.equal(await readFile(agents, "utf8"), drifted, "未确认不写入");
  console.log("PASS 区块被手改：默认不给写入，勾选覆盖后才可预览写入");

  for (const control of await panel()
    .locator("select, button, label.config-confirm")
    .all()) {
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    assert.ok(box.height >= 44, `${await control.innerText()} 至少 44px`);
  }
  await mkdir("test-results", { recursive: true });
  await panel().screenshot({ path: "test-results/rule-install-desktop.png" });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await panel().evaluate(
      (el) => el.scrollWidth - el.clientWidth,
    );
    assert.ok(overflow <= 1, `${width}px 面板内部横向溢出 ${overflow}`);
    await panel().screenshot({ path: `test-results/rule-install-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log("PASS 控件 44px；390/320 无内部横溢");

  await page.keyboard.press("Escape");
  await page.goto(app.url + "/#inbox");
  await page.getByRole("dialog", {name:"待处理",exact:true})
    .getByText("规则「项目协同协议」有 1 个项目可升级", { exact: true })
    .waitFor();
  await axe();
  console.log("PASS 待处理出现规则可升级提示；axe");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await app.close();
}

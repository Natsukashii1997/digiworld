import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { fixture } from "./fixture.mjs";
import { seed } from "../src/store.js";

const app = await fixture();
const browser = await chromium.launch();
try {
  await app.repository.write({ ...seed(), projects: [{
    id: "p-wb", name: "个人工作台", goal: "资产管理", next: "交给 Codex 复核", location: "", status: "进行中",
  }] }, { initialize: true });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${app.url}/#agents`);
    const roles = page.getByRole("region", { name: "角色卡" });
    await roles.waitFor();
    const picker = roles.getByRole("radiogroup", { name: "接力目标" });
    assert.equal(await picker.getByRole("radio").count(), 5);
    await picker.getByRole("radio", { name: /^Hermes/ }).click();
    const card = roles.locator(".archive");
    if (width === 1440) await card.getByText("草拟默认").waitFor();
    const edit = card.getByRole("button", { name: "编辑角色卡" });
    const box = await edit.boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44);
    if (width === 1440) {
      await edit.click();
      const dialog = page.getByRole("dialog", { name: "编辑角色卡：Hermes" });
      await dialog.getByLabel("擅长关键词（用逗号或空格分隔）").fill("夜巡，监工");
      await dialog.getByLabel("成本").selectOption("low");
      await dialog.getByRole("button", { name: "保存角色卡" }).click();
      await dialog.waitFor({ state: "detached" });
      assert.deepEqual((await app.repository.read()).agentRoles[0].strengths, ["夜巡", "监工"]);
      await page.reload();
      await picker.getByRole("radio", { name: /^Hermes/ }).click();
      await card.getByText("监工").waitFor();
    } else {
      await card.getByText("监工").waitFor();
    }
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    assert.deepEqual(axe.violations.map(value => value.id), []);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("agent-roles-browser: passed");
} finally {
  await browser.close();
  await app.close();
}

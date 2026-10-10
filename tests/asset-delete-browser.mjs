import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fixture } from "./fixture.mjs";
import { seed, makeAsset, current } from "../src/store.js";

const app = await fixture();
const browser = await chromium.launch();
try {
  const initial = await app.repository.write(seed(), { initialize: true });
  const free = makeAsset({ title: "合成可删除资产", type: "Prompt", content: "合成内容" });
  const linked = makeAsset({ title: "合成被引用资产", type: "Prompt", content: "合成内容" });
  const workflow = makeAsset({ title: "合成引用流程", type: "Workflow", content: "步骤", references: [{ assetId: linked.id, versionId: current(linked).id }] });
  await app.repository.write({ ...initial, assets: [...initial.assets, free, linked, workflow] });

  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(app.url + "/#assets");
      await page.getByRole("button", { name: "删除 合成被引用资产" }).waitFor();
      assert.equal(await page.getByRole("button", { name: "收录本机 Skill" }).count(), 0);
      assert.equal(await page.getByRole("group", { name: "资产类型" }).getByRole("button", { name: /MCP 配置|已归档/ }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "新建", exact: true }).count(), 1);
      const search = await page.getByRole("textbox", { name: "在资产中搜索" }).boundingBox();
      const create = await page.getByRole("button", { name: "新建", exact: true }).boundingBox();
      assert.ok(Math.abs(search.y - create.y) < 24, `搜索与新建同排：${width}`);
      if (width === 1440) {
        const filter = await page.getByRole("group", { name: "资产类型" }).boundingBox();
        const sort = await page.getByRole("combobox", { name: "排序方式" }).boundingBox();
        assert.ok(Math.abs(filter.y - sort.y) < 24, "筛选与排序同排");
        await page.screenshot({ path: "test-results/assets-delete-1440.png", fullPage: true });
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await page.goto(app.url + "/#assets");
    await page.getByRole("button", { name: "删除 合成被引用资产" }).click();
    const blocked = page.getByRole("dialog", { name: "无法删除资产" });
    await blocked.waitFor();
    assert.match(await blocked.innerText(), /合成引用流程.*v1/);
    assert.equal((await app.repository.read()).assets.find(item => item.id === linked.id).archived, false);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "删除 合成可删除资产" }).click();
    await page.getByRole("button", { name: "删除 合成可删除资产" }).waitFor({ state: "detached" });
    const stored = await app.repository.read();
    assert.equal(stored.assets.find(item => item.id === free.id).archived, true);
    assert.deepEqual(stored.assets.find(item => item.id === free.id).versions, free.versions);
  } finally { await context.close(); }
  console.log("asset-delete-browser PASS: desktop/mobile controls, referenced block, direct deletion, history retained");
} finally { await browser.close(); await app.close(); }

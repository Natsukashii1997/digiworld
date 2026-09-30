// 1.3 搜索增强：合成数据下验证全局搜索、资产库标签筛选、两类提示分开和大数据量耗时。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture.mjs";
import { seed, makeAsset } from "../src/store.js";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);

function workspace() {
  const s = seed();
  const prompt = makeAsset({
    type: "Prompt",
    title: "周报整理",
    description: "把零散记录整理成周报",
    content: "开头先列出三件最重要的事。然后写下风险与求助事项，最后附上下周计划。",
    tags: ["写作", "复盘"],
  });
  const skill = makeAsset({
    type: "Skill",
    title: "合成技能",
    content: "",
    files: [
      { path: "SKILL.md", text: true, data: "# 合成技能\n用于校验表格公式。" },
      { path: "scripts/check.py", text: true, data: "print('lint-marker')" },
    ],
    tags: ["写作"],
  });
  // 普通长度的脚本文件名（Codex 复核 D-S3 的复现样例）。
  const longPath = makeAsset({
    type: "Skill",
    title: "格式检查技能",
    content: "",
    files: [
      { path: "SKILL.md", text: true, data: "# 格式检查技能" },
      {
        path: "scripts/generate_monthly_summary_for_workbench.py",
        text: true,
        data: "# filemarker 生成月度摘要",
      },
    ],
  });
  const archived = {
    ...makeAsset({ type: "Prompt", title: "旧周报模板", content: "周报 已停用" }),
    archived: true,
  };
  s.assets = [prompt, skill, longPath, archived];
  s.notes = [
    { id: "n1", text: "明天把周报流程改成两段式", at: "2026-09-29T00:00:00.000Z" },
  ];
  s.references = [
    { id: "r1", title: "写作手册", url: "https://example.com/guide", note: "关于周报结构的建议" },
  ];
  s.projects = [
    { id: "p1", name: "季度复盘", goal: "汇总周报", next: "", location: "", status: "进行中" },
  ];
  return s;
}

const browser = await chromium.launch();
const errors = [];
// fixture.close() 会关闭服务并删除临时主库；finally 中统一释放。
const opened = [];
async function session(state, viewport = { width: 1440, height: 1000 }) {
  const app = await fixture();
  opened.push(app);
  await app.repository.write(state, { initialize: true });
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  opened.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(app.url + "/#assets");
  await page.locator(".asset-card").first().waitFor();
  return { app, page };
}
const palette = (page) => page.getByRole("dialog", { name: "搜索工作台" });
async function search(page, text) {
  if (!(await palette(page).count())) await page.keyboard.press("Meta+k");
  await page.getByLabel("全局搜索").fill(text);
  await page.locator('.search-results[aria-busy="false"]').waitFor();
}

try {
  const { app, page } = await session(workspace());

  // 正文、文件、标签命中与跳转。
  await search(page, "求助");
  const hit = palette(page).getByRole("button", { name: /周报整理/ });
  assert.match(await hit.innerText(), /正文/);
  assert.match(await hit.innerText(), /风险与求助事项/);
  await search(page, "LINT-marker");
  assert.match(
    await palette(page).getByRole("button", { name: /合成技能/ }).innerText(),
    /文件 scripts\/check\.py/,
  );
  await search(page, "复盘");
  assert.match(
    await palette(page).getByRole("button", { name: /周报整理/ }).innerText(),
    /标签/,
  );
  await search(page, "风险 计划");
  await palette(page).getByRole("button", { name: /周报整理/ }).click();
  await page.getByRole("dialog", { name: "资产详情" }).waitFor();
  await page.keyboard.press("Escape");
  console.log("PASS ⌘K 正文、文件、标签、多词命中并打开详情");

  // 随手记、参考、项目分组；已归档只计数。
  await search(page, "周报");
  for (const heading of ["资产 · 1", "随手记 · 1", "参考 · 1", "项目 · 1"])
    await palette(page).getByText(heading, { exact: true }).waitFor();
  assert.equal(
    await palette(page).getByRole("button", { name: /旧周报模板/ }).count(),
    0,
  );
  const scope = palette(page).getByRole("note", { name: "搜索范围" });
  await scope.getByText("另有 1 个已归档资产匹配，不在此列出。").waitFor();
  assert.equal(await palette(page).locator(".search-empty").count(), 0);
  for (const [name, route] of [
    [/明天把周报流程/, "notes"],
    [/写作手册/, "references"],
    [/季度复盘/, "projects"],
  ]) {
    await search(page, "周报");
    await palette(page).getByRole("button", { name }).click();
    await page.waitForFunction((r) => location.hash === "#" + r, route);
  }
  await search(page, "周报");
  await scope.getByRole("button", { name: "去版本归档" }).click();
  await page.waitForFunction(() => location.hash === "#history");
  console.log("PASS 随手记/参考/项目分组跳转，已归档只计数并可跳转");

  // 没有结果与范围说明分开。
  await search(page, "完全不存在的词");
  const empty = palette(page).locator(".search-empty");
  assert.equal(await empty.innerText(), "没有匹配“完全不存在的词”的记录。");
  assert.equal(await scope.locator(".search-empty").count(), 0);
  assert.match(await scope.innerText(), /知识库正文、历史版本和二进制文件不在此搜索/);
  assert.doesNotMatch(await scope.innerText(), /已归档/);
  await scope.getByRole("button", { name: "去知识中枢查询" }).click();
  await page.waitForFunction(() => location.hash === "#knowledge");
  console.log("PASS 无结果提示与搜索范围说明分开，可去知识中枢");

  // 资产库：正文搜索、标签筛选组合、清除筛选、已归档提示。
  await page.goto(app.url + "/#assets");
  await page.locator(".asset-card").first().waitFor();
  // 访问项目页会触发既有的自动扫描；只读断言从这里开始，只覆盖搜索与筛选。
  const before = (await app.repository.read()).revision;
  // 搜索使用延迟值，按最终数量等待而不是立即计数。
  const cards = (n) =>
    page.waitForFunction(
      (n) => document.querySelectorAll(".asset-card").length === n,
      n,
    );
  const inline = page.getByLabel("在资产中搜索");
  await inline.fill("求助");
  await cards(1);
  await inline.fill("周报");
  await page.getByRole("note").getByText("另有 1 个已归档资产匹配，不在资产库列出。").waitFor();
  await inline.fill("");
  const tagSelect = page.getByLabel("按标签筛选");
  assert.deepEqual(
    (await tagSelect.locator("option").allInnerTexts()).slice(0, 3),
    ["全部标签", "写作 · 2", "复盘 · 1"],
  );
  await tagSelect.selectOption("写作");
  await cards(2);
  await page.getByRole("button", { name: /^Prompts/ }).click();
  await cards(1);
  await inline.fill("不存在的内容");
  await page.getByRole("heading", { name: "没有匹配的资产" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "新建资产", exact: true }).count(), 1);
  await page.getByRole("button", { name: "清除筛选" }).click();
  assert.equal(await inline.inputValue(), "");
  assert.equal(await tagSelect.inputValue(), "");
  await cards(1);
  await page.getByRole("button", { name: /^全部/ }).click();
  await cards(3);
  // 空分类（没有工作流）叠加关键词与标签：说明原因，给出退出入口，不引导新建。
  await page.getByRole("button", { name: /^工作流/ }).click();
  await inline.fill("求助");
  await tagSelect.selectOption("写作");
  const emptyState = page.locator(".empty");
  await emptyState.getByRole("heading", { name: "没有匹配的资产" }).waitFor();
  assert.match(await emptyState.innerText(), /当前类型还没有资产/);
  assert.equal(await emptyState.getByRole("button", { name: "新建资产" }).count(), 0);
  await emptyState.getByRole("button", { name: "清除筛选" }).waitFor();
  await emptyState.getByRole("button", { name: "查看全部类型" }).click();
  await cards(1);
  assert.equal(await inline.inputValue(), "求助");
  await page.getByRole("button", { name: /^工作流/ }).click();
  await emptyState.getByRole("button", { name: "清除筛选" }).click();
  // 清除后仍是空分类：回到原有的新建引导。
  await page.locator(".empty").getByRole("heading", { name: "还没有符合条件的资产" }).waitFor();
  await page.getByRole("button", { name: /^全部/ }).click();
  await cards(3);
  console.log("PASS 资产库正文搜索、标签筛选组合、清除筛选、已归档提示、空分类筛选退出");

  assert.equal((await app.repository.read()).revision, before);
  console.log("PASS 搜索与筛选只读，主库 revision 不变");

  // 窄屏、44px、axe。
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await search(page, "周报");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    );
    assert.ok(overflow <= 0, `${width} overflow ${overflow}`);
    // 长文件名：结果区内部不横向溢出，标题/摘录列保留至少 60% 行宽。
    await search(page, "格式检查 filemarker");
    const layout = await palette(page).evaluate((dialog) => {
      const results = dialog.querySelector(".search-results");
      const row = results.querySelector("button");
      return {
        inner: results.scrollWidth - results.clientWidth,
        hit: row.querySelector(".search-hit").getBoundingClientRect().width,
        row: row.getBoundingClientRect().width,
      };
    });
    assert.ok(layout.inner <= 0, `${width} results overflow ${layout.inner}`);
    assert.ok(layout.hit >= layout.row * 0.6, `${width} hit ${layout.hit}/${layout.row}`);
    assert.match(
      await palette(page).getByRole("button", { name: /格式检查技能/ }).innerText(),
      /generate_monthly_summary_for_workbench\.py/,
    );
    await search(page, "周报");
    for (const b of await palette(page).locator(".search-results button, .search-scope button").all())
      assert.ok((await b.boundingBox()).height >= 44, `${width} button < 44px`);
    // 与 accessibility.mjs 相同，只检查 WCAG 2.x A/AA。
    const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
    const axe = await new AxeBuilder({ page }).withTags(wcag).analyze();
    assert.deepEqual(axe.violations.map((v) => v.id), [], `${width} axe`);
    await page.keyboard.press("Escape");
    await page.getByLabel("按标签筛选").focus();
    const axeLib = await new AxeBuilder({ page }).withTags(wcag).analyze();
    assert.deepEqual(axeLib.violations.map((v) => v.id), [], `${width} axe library`);
  }
  console.log("PASS 1440/390/320 无溢出、按钮 44px、axe 无违规");

  {
    // 大数据量：400 份资产，每份正文 3.8 万字符（合计约 1520 万字符、UTF-8 约 22 MB）。
    const s = seed();
    const filler = "流程说明与检查点 lorem ipsum dolor sit amet ".repeat(1000);
    s.assets = Array.from({ length: 400 }, (_, i) =>
      makeAsset({
        type: "Prompt",
        title: `容量资产 ${i}`,
        content: filler + (i === 377 ? " 唯一标记-zeta " : "") + filler.slice(0, 2000),
        tags: [`组${i % 25}`],
      }),
    );
    const { page } = await session(s);
    const timings = {};
    const measure = async (label, run, done) => {
      const t0 = Date.now();
      await run();
      await done();
      timings[label] = Date.now() - t0;
    };
    await page.keyboard.press("Meta+k");
    await page.getByLabel("全局搜索").waitFor();
    await measure(
      "palette-cold",
      () => page.getByLabel("全局搜索").fill("唯一标记-zeta"),
      () => palette(page).getByRole("button", { name: /容量资产 377/ }).waitFor(),
    );
    await measure(
      "palette-warm",
      () => page.getByLabel("全局搜索").fill("唯一标记-zeta 容量"),
      () => page.locator('.search-results[aria-busy="false"]').waitFor(),
    );
    await page.keyboard.press("Escape");
    await measure(
      "library",
      () => page.getByLabel("在资产中搜索").fill("唯一标记-zeta"),
      () => page.waitForFunction(() => document.querySelectorAll(".asset-card").length === 1),
    );
    console.log("TIMING", JSON.stringify(timings));
    for (const [label, ms] of Object.entries(timings))
      assert.ok(ms <= 500, `${label} ${ms}ms > 500ms`);
    console.log("PASS 400 份资产约 1520 万字符正文，输入到结果 ≤ 500 ms");
    assert.deepEqual(errors, []);
  }
} finally {
  for (const item of opened.reverse()) await item.close();
  await browser.close();
}
process.exit(0);

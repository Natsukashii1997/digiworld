// W5: synthetic, isolated browser path for a version-locked collaboration run.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collabV16Fixture } from "./collab-v16-fixture.mjs";
import { openCollab, ready, button, axe, geometry } from "./collab-v16-helpers.mjs";
import { makeAsset, revise } from "../src/store.js";
import { freshDesignImplementationV1 } from "../src/workflow-template.js";

const out = process.env.GUIJI_TEST_RESULTS || "test-results/collab-template";
await mkdir(out, { recursive: true });
const app = await collabV16Fixture();
const browser = await chromium.launch();
const errors = [];
const protocol = async () => {
  const response = await app.call("/collab/protocol", {});
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.items.find((item) => item.name === "协同项目").protocol;
};
const currentRun = async () => (await protocol()).runs.find((run) => run.id === "notes");
const refresh = async (page) => {
  await button(page, "刷新看板").click();
  await ready(page);
};
const dismissToast = async (page) => {
  const toast = page.locator(".toast");
  if (await toast.count()) await toast.getByRole("button", { name: "关闭提示" }).click();
  await toast.waitFor({ state: "hidden" });
};

try {
  // No phase evidence exists for 1/2/4 in this synthetic run. This lets the
  // browser distinguish a skipped station from a falsely inferred pass.
  for (const number of [1, 2, 4])
    await unlink(join(app.paths.collab, `docs/agents/handoffs/2026-10-07-notes-${number}.md`));
  await writeFile(join(app.paths.collab, "docs/issues.md"),
    "# 合成轮次待议\n| # | 问题 | 结论 |\n|---|---|---|\n| 1 | 合成接口缺字段 | |\n| 2 | 合成字号偏差 | 已处理 |\n\n## 不返回的正文\nBODY-MARKER-PRIVATE");
  const workflow = makeAsset({ title: "设计实现流 v1", type: "Workflow",
    description: "合成协同模板", content: "只用于 W5 隔离浏览器测试",
    workflowTemplate: freshDesignImplementationV1() });
  const initialVersion = workflow.versions[0].id;
  const initial = await app.workspace();
  const put = await app.call("/workspace", {
    state: { ...initial, assets: [...initial.assets, workflow] },
  }, "PUT");
  assert.equal(put.status, 200, JSON.stringify(put.body));

  const page = await openCollab(browser, app, 1440);
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  assert.equal(await page.locator(".tm-s").count(), 8);
  assert.equal((await currentRun()).templateState, "legacy");
  await button(page, "绑定工作流模板").click();
  const settings = page.getByRole("dialog", { name: "运行设置与模板版本" });
  await settings.waitFor();
  await settings.getByLabel("轮次", { exact: true }).fill("UI v16");
  await settings.getByLabel("轮次待议清单（项目 docs 内）").fill("docs/issues.md");
  await settings.getByLabel("推进节奏").selectOption("continuous");
  await settings.getByLabel("纯功能任务（跳过模板中可跳过的站）").check();
  await settings.getByLabel("04 · 认领与实现").selectOption("hermes");
  await button(settings, "绑定并开始运行").click();
  await settings.waitFor({ state: "detached" });
  await page.waitForFunction(() => document.querySelectorAll(".tm-s").length === 9);
  const bound = await currentRun();
  assert.equal(bound.templateVersionId, initialVersion);
  assert.equal(bound.stations.length, 9);
  assert.equal(bound.stations[3].actor, "hermes");
  assert.equal(bound.stations[0].status, "skipped");
  assert.equal(bound.stations[1].status, "skipped");
  assert.equal(bound.stations[0].event, null);
  assert.equal(bound.pace, "continuous");
  assert.equal(await page.locator(".tm-s.skip").count(), 2);
  const ninthVisible = await page.evaluate(() => {
    const view = document.querySelector(".tm-scroll").getBoundingClientRect();
    const station = [...document.querySelectorAll(".tm-s")].at(-1).getBoundingClientRect();
    return { inside: station.left >= view.left - 0.5 && station.right <= view.right + 0.5,
      view: [view.left, view.right], station: [station.left, station.right] };
  });
  assert.equal(ninthVisible.inside, true,
    `1440 第9站须在地图首屏可见 ${JSON.stringify(ninthVisible)}`);
  const labelOverlaps = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll(".tm-s")];
    const boxes = (node) => [".tm-name", ".tm-res"].map((selector) => {
      const element = node.querySelector(selector);
      const box = element.getBBox();
      return { selector, text: element.textContent.trim(),
        x: box.x, y: box.y, right: box.x + box.width, bottom: box.y + box.height };
    });
    const overlaps = [];
    for (let index = 0; index < nodes.length - 1; index++)
      for (const left of boxes(nodes[index]))
        for (const right of boxes(nodes[index + 1])) {
          const vertical = Math.min(left.bottom, right.bottom) - Math.max(left.y, right.y);
          const horizontal = Math.min(left.right, right.right) - Math.max(left.x, right.x);
          if (vertical > 0.5 && horizontal > 0.5)
            overlaps.push({ between: [index + 1, index + 2], left, right,
              vertical, horizontal });
        }
    return overlaps;
  });
  assert.deepEqual(labelOverlaps, [], "1440 相邻站交付物/结果摘要不得叠压");
  assert.match(await page.locator(".cx-sum").innerText(), /锁定模板版本.*连续推进，最后一次验收/s);
  assert.match(await page.locator(".cx-round").first().innerText(), /待议清单 1 条/);
  assert.match(await page.locator(".cx-sum-facts").innerText(), /UI v16/, "轮次保留在项目运行摘要中");
  await page.getByRole("tab", { name: /逆向工程/ }).click();
  assert.equal(await page.locator(".tm-s").count(), 8, "未绑定的其他运行仍使用旧八站");
  await page.getByRole("tab", { name: /随手记页/ }).click();
  assert.equal(await page.locator(".tm-s").count(), 9);
  await page.locator(".cx-round").first()
    .getByRole("button", { name: /待议清单 1 条/ }).click();
  const issues = page.getByRole("dialog", { name: "UI v16 · 待议清单" });
  await issues.waitFor();
  assert.match(await issues.innerText(), /待议 1 条 · 表内共 2 条/);
  assert.match(await issues.innerText(), /合成接口缺字段/);
  assert.doesNotMatch(await issues.innerText(), /BODY-MARKER-PRIVATE/);
  assert.equal(await issues.evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);
  await axe(page);
  await page.keyboard.press("Escape");
  await page.locator(".tm-s").nth(3).click();
  const node = page.getByRole("dialog", { name: "阶段详情" });
  assert.match(await node.innerText(), /路线预期：亚古兽/);
  const templateArtifact = node.locator("dl > div").filter({ hasText: "模板要求" });
  const recordedArtifact = node.locator("dl > div").filter({ hasText: "实际记录" });
  assert.equal(await templateArtifact.locator("dt").innerText(), "模板要求");
  assert.equal(await templateArtifact.locator("dd").innerText(),
    "代码 + 全量回归 + 逐区叠图");
  assert.equal(await recordedArtifact.locator("dt").innerText(), "实际记录");
  assert.equal(await recordedArtifact.locator("dd").innerText(), "未记录");
  assert.match(await node.innerText(), /未过关 · 缺依据/);
  await page.keyboard.press("Escape");
  await geometry(page, "W5 绑定九站 1440");
  await axe(page);
  await dismissToast(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.screenshot({ path: join(out, "bound-1440.png"), fullPage: true });

  // A new asset version exists, but the running task stays on its original
  // version until the user sees and accepts the exact diff.
  const beforeVersion = await app.workspace();
  const savedAsset = beforeVersion.assets.find((asset) => asset.id === workflow.id);
  const updatedTemplate = freshDesignImplementationV1();
  updatedTemplate.stages[3].method = "新版：隔离实现并核对每个失败入口";
  const newerAsset = revise(savedAsset, { workflowTemplate: updatedTemplate });
  const newerVersion = newerAsset.versions.at(-1).id;
  const versionPut = await app.call("/workspace", { state: {
    ...beforeVersion,
    assets: beforeVersion.assets.map((asset) =>
      asset.id === workflow.id ? newerAsset : asset),
  } }, "PUT");
  assert.equal(versionPut.status, 200, JSON.stringify(versionPut.body));
  assert.equal((await currentRun()).templateVersionId, initialVersion);
  await page.reload();
  await ready(page);
  await button(page, "运行设置 / 升级模板").click();
  const upgrade = page.getByRole("dialog", { name: "运行设置与模板版本" });
  await upgrade.getByLabel("锁定的工作流资产版本")
    .selectOption(`${workflow.id}:${newerVersion}`);
  const diff = upgrade.locator(".cx-template-diff");
  assert.match(await diff.innerText(), /第 4 站方法.*新版：隔离实现并核对每个失败入口/s);
  assert.equal(await button(upgrade, "确认升级版本").isDisabled(), true);
  assert.equal((await currentRun()).templateVersionId, initialVersion,
    "预览差异前不得替运行升级版本");
  await upgrade.getByLabel("我已阅读差异，确认只升级此运行").check();
  await button(upgrade, "确认升级版本").click();
  await upgrade.waitFor({ state: "detached" });
  await page.waitForFunction(() => document.querySelector(".cx-sum")?.textContent?.includes("锁定模板版本"));
  assert.equal((await currentRun()).templateVersionId, newerVersion);
  await geometry(page, "W5 升级预览 1440");
  await axe(page);

  // Two distinct failed events for the same issue cause a main-line decision.
  const handoffs = join(app.paths.collab, "docs/agents/handoffs");
  for (const [index, minute] of [[1, "03"], [2, "04"]])
    await writeFile(join(handoffs, `2026-10-08-issue-repair-${index}.md`),
      `# 合成返修\n| run_id | notes |\n| event_id | issue-repair-${index} |\n| issue_id | field-missing |\n| title | 随手记页 |\n| phase | 6 |\n| actor | Claude Code |\n| status | failed |\n| at | 2026-10-08T11:${minute}:00+08:00 |\n| result | 同项仍未通过 |\n\n## 正文\nBODY-MARKER-PRIVATE`);
  await refresh(page);
  await page.getByText(/同项返修 2 次仍不过/).first().waitFor();
  const repaired = await currentRun();
  assert.ok(repaired.alerts.some((alert) =>
    alert.kind === "needs_decision" && alert.main));
  assert.equal(repaired.stations[3].decisionRequired, true);
  assert.equal(repaired.stations[5].decisionRequired, true);
  assert.match(await page.locator(".tm-s").nth(3).getAttribute("aria-label"), /待你决定/);
  await page.locator('[aria-label*="待处理"]').first().click();
  const pending = page.getByRole("dialog", { name: "待处理" });
  await pending.getByText(/同项返修 2 次仍不过/).waitFor();
  await page.keyboard.press("Escape");
  await geometry(page, "W5 返修决定 1440");
  await axe(page);
  await dismissToast(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.screenshot({ path: join(out, "repair-1440.png"), fullPage: true });

  const mobile = await openCollab(browser, app, 390);
  mobile.on("pageerror", (error) => errors.push(error.message));
  await ready(mobile);
  assert.equal(await mobile.locator(".tm-s").count(), 9);
  assert.ok(await mobile.locator(".tm-scroll").evaluate((element) => element.scrollLeft > 300));
  const endVisible = await mobile.locator(".tm-scroll").evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    const view = element.getBoundingClientRect();
    const station = [...element.querySelectorAll(".tm-s")].at(-1).getBoundingClientRect();
    return { inside: station.left >= view.left - 0.5 && station.right <= view.right + 0.5,
      view: [view.left, view.right], station: [station.left, station.right],
      scrollLeft: element.scrollLeft };
  });
  assert.equal(endVisible.inside, true,
    `390 横向滚动后须可看到第9站 ${JSON.stringify(endVisible)}`);
  assert.ok(endVisible.scrollLeft > 0);
  await geometry(mobile, "W5 返修决定 390");
  await axe(mobile);
  await dismissToast(mobile);
  await mobile.evaluate(() => window.scrollTo(0, 0));
  assert.equal(await mobile.evaluate(() => window.scrollY), 0);
  await mobile.screenshot({ path: join(out, "repair-390.png"), fullPage: true });
  await button(mobile, "运行设置 / 升级模板").click();
  const mobileSettings = mobile.getByRole("dialog", { name: "运行设置与模板版本" });
  await mobileSettings.waitFor();
  assert.equal(await mobileSettings.evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);
  const drawerBox = await mobileSettings.boundingBox();
  assert.ok(drawerBox.x >= -0.5 && drawerBox.x + drawerBox.width <= 390.5,
    `W5 设置抽屉 390 宽度 ${JSON.stringify(drawerBox)}`);
  await geometry(mobile, "W5 设置抽屉 390");
  await axe(mobile);
  await mobile.context().close();
  await page.context().close();
  assert.deepEqual(errors, []);
  console.log("PASS W5 合成旧八站→锁版九站/轮次待议/纯功能跳过/节奏换人/差异确认升级/同项返修主线/1440与390几何及axe");
} finally {
  await browser.close();
  await app.close();
}

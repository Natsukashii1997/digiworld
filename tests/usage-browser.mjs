import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { fixture } from "./fixture.mjs";
import { seed, current } from "../src/store.js";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await fixture();
const initial = await app.repository.write(seed(), { initialize: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  reducedMotion: "reduce",
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage(),
  errors = [];
page.setDefaultTimeout(10000);
page.on("pageerror", (e) => errors.push(e.message));
const prompt = initial.assets.find((a) => a.type === "Prompt");
const skill = initial.assets.find((a) => a.type === "Skill");
const workflow = initial.assets.find((a) => a.type === "Workflow");
const detail = page.getByRole("dialog", { name: "资产详情", exact: true });
const button = (name) => (name.startsWith("查看 ")
  ? page
  : page.getByRole("dialog", { name: "资产详情", exact: true })
).getByRole("button", { name, exact: true });
const records = async () => (await app.repository.read()).assetActivity || [];
const uses = async (a = prompt) =>
  (await records()).filter((r) => r.kind === "use" && r.assetId === a.id)
    .length;
// #93：资产仓库只剩 Prompt / Design / Skill 三页，默认 Prompt；
// 工作流不在资产仓库，详情只能从顶栏全局搜索打开。
// #93 第二批：Skill 页改为只读 my-skills，原有 Skill 资产不再出现在 Skill 页（数据保留），
// 先断言它不在 Skill 页网格里，再和工作流一样从全局搜索打开详情。
const typeTab = (p, name) =>
  p.getByRole("group", { name: "资产类型", exact: true }).getByRole("button", { name: new RegExp(`^${name}`) });
async function openFrom(p, a) {
  const title = current(a).title;
  if (["Prompt", "Design"].includes(a.type)) {
    await typeTab(p, a.type).click();
    await p.getByRole("button", { name: `查看 ${title}`, exact: true }).click();
    return;
  }
  if (a.type === "Skill") {
    await typeTab(p, "Skill").click();
    assert.equal(await p.getByRole("button", { name: `查看 ${title}`, exact: true }).count(), 0, `${title} 不应出现在 Skill 页`);
  }
  await p.locator(".topbar").getByRole("button", { name: "搜索", exact: true }).click();
  const palette = p.getByRole("dialog", { name: "搜索工作台" });
  await palette.getByLabel("全局搜索").fill(title);
  await palette.getByRole("button").filter({ hasText: title }).first().click();
}
async function open(a) {
  await openFrom(page, a);
  await page.getByRole("region", { name: "使用记录与反馈" }).waitFor();
}
async function close() {
  await button("关闭").click();
  await page
    .getByRole("dialog", { name: "资产详情" })
    .waitFor({ state: "hidden" });
}
async function waitUse(a, n) {
  await page.waitForFunction(
    () => !document.querySelector(".asset-usage button:disabled"),
  );
  assert.equal(await uses(a), n);
}
try {
  await page.goto(app.url + "/#assets");
  await page.locator(".asset-card").first().waitFor();
  assert.equal((await app.repository.read()).revision, initial.revision);
  // 切片 1.1：卡片计次改为封面数字，“从未使用”一行已去掉。
  // #93：次数改在显示屏 .ac2-uses（「0次」），按页签分开数：Prompt 2 张；演示里的 2 个工作流不在资产仓库出现。
  // #93 第二批：Skill 页只读 my-skills（测试 fixture 下为空），演示里的 2 个 Skill 资产不再出现，Skill 页没有次数显示屏；
  // 它们的计次改在详情里核对（下面 open(skill) 走全局搜索）。
  const zeros = async () => (await page.locator(".ac2-uses").allInnerTexts()).map((t) => t.replace(/\s/g, ""));
  assert.equal(await typeTab(page, "Prompt").getAttribute("aria-pressed"), "true");
  assert.deepEqual(await zeros(), Array(2).fill("0次"));
  await typeTab(page, "Skill").click();
  assert.deepEqual(await zeros(), []);
  for (const s of initial.assets.filter((a) => a.type === "Skill"))
    assert.equal(await page.getByRole("button", { name: `查看 ${current(s).title}`, exact: true }).count(), 0, "Skill 资产不在 Skill 页出现");
  for (const tab of ["Prompt", "Design", "Skill"]) {
    await typeTab(page, tab).click();
    for (const w of initial.assets.filter((a) => a.type === "Workflow"))
      assert.equal(await page.getByRole("button", { name: `查看 ${current(w).title}`, exact: true }).count(), 0, `${tab} 页不应出现工作流`);
  }
  assert.equal((await app.repository.read()).revision, initial.revision, "切页签不写主库");
  await open(prompt);
  await button("复制全文").click();
  await page.getByText("使用记录已保存", { exact: true }).waitFor();
  await waitUse(prompt, 1);
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    current(prompt).content,
  );
  await button("好用").click();
  await page.getByLabel("反馈备注（可选）").fill("结构清楚，输出可用");
  await button("取消反馈").click();
  assert.equal((await records()).length, 1);
  await button("好用").click();
  await page.getByLabel("反馈备注（可选）").fill("结构清楚，输出可用");
  await button("保存反馈").click();
  await page.getByText("反馈已保存", { exact: true }).waitFor();
  assert.equal((await records()).length, 2);
  await page
    .locator(".cover-stage")
    .getByText("完全体", { exact: true })
    .waitFor();
  await button("需改进").click();
  await button("保存反馈").click();
  await page
    .locator(".cover-stage")
    .getByText("成熟期", { exact: true })
    .waitFor();
  await button("好用").click();
  await page
    .getByLabel("反馈备注（可选）")
    .fill("路径：/Users/example/private");
  await button("保存反馈").click();
  await page.getByText(/反馈请只填写效果评价/).waitFor();
  assert.equal((await records()).length, 3);
  assert.equal(
    await page.evaluate(() =>
      Object.values(sessionStorage).join("").includes("/Users/example/private"),
    ),
    false,
  );
  await button("取消反馈").click();
  await button("好用").click();
  await page
    .getByLabel("反馈备注（可选）")
    .fill("效果 4/5 分，A/B 两版都试过；json/yaml；v1/v2；token: 省了很多");
  await button("保存反馈").click();
  await page.getByText("反馈已保存", { exact: true }).waitFor();
  assert.equal((await records()).length, 4);
  console.log(
    "PASS 旧主库零写入迁移、复制成功、反馈保存/取消/隐私拒绝、正负向阶段",
  );

  await page.evaluate(() => {
    window.realCopy = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = async () => {
      throw Error("denied");
    };
  });
  await button("复制全文").click();
  await page.getByText(/无法访问剪贴板/).waitFor();
  assert.equal(await uses(), 1);
  await page.evaluate(() => {
    navigator.clipboard.writeText = () =>
      new Promise((resolve) => {
        window.finishCopy = resolve;
      });
  });
  await button("复制全文").click();
  assert.equal(await button("好用").isDisabled(), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog", { name: "资产详情" }).count(), 1);
  await page.evaluate(() => window.finishCopy());
  await waitUse(prompt, 2);
  await page.evaluate(() => {
    navigator.clipboard.writeText = window.realCopy;
  });
  console.log("PASS 剪贴板拒绝不计；复制等待期间反馈锁与 Escape 关闭保护");

  await page.route("**/api/asset-activity", async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "lost response" }),
    });
  });
  await button("复制全文").click();
  await waitUse(prompt, 3);
  assert.equal(await button("查询记录").count(), 0);
  await page.unroute("**/api/asset-activity");
  console.log("PASS 已写入但响应丢失，按同 ID 查询找回且不重复计次");

  await page.route("**/api/asset-activity*", (route) => route.abort());
  await button("复制全文").click();
  await detail.getByText(/记录结果未知/).waitFor();
  assert.equal(await button("补记记录").count(), 0);
  assert.equal(await uses(), 3);
  const pendingUse = await page.evaluate(
    (id) => JSON.parse(sessionStorage.getItem(`workbench-activity-${id}`)),
    prompt.id,
  );
  await page.reload();
  await open(prompt);
  await detail.getByText(/记录结果未知/).waitFor();
  await page.unroute("**/api/asset-activity*");
  await button("查询记录").click();
  await button("补记记录").waitFor();
  await button("补记记录").click();
  await waitUse(prompt, 4);
  assert.equal(
    (await records()).find((r) => r.id === pendingUse.id).usedAt,
    pendingUse.usedAt,
  );
  console.log("PASS 未知结果禁重试，刷新保留 ID，查询不存在后补记");

  let conflict = true;
  await page.route("**/api/asset-activity", async (route) => {
    if (conflict) {
      conflict = false;
      const state = await app.repository.read();
      await app.repository.write({
        ...state,
        notes: [
          ...state.notes,
          {
            id: "concurrent",
            text: "合成并发编辑",
            at: new Date().toISOString(),
          },
        ],
      });
    }
    await route.continue();
  });
  await button("复制全文").click();
  await button("补记记录").waitFor();
  assert.equal(await uses(), 4);
  await button("补记记录").click();
  await waitUse(prompt, 5);
  await page.unroute("**/api/asset-activity");
  console.log("PASS revision 冲突不覆盖，查询后补记同一动作");

  const count = (await records()).length;
  const downloading = page.waitForEvent("download");
  await button("导出").click();
  await (await downloading).cancel();
  assert.equal((await records()).length, count);
  await close();
  await typeTab(page, "Prompt").click(); // #93：最近使用排序在 Prompt 页核对
  await page.getByLabel("排序方式").selectOption("used");
  assert.equal(
    await page.locator(".asset-card h3").first().innerText(),
    current(prompt).title,
  );
  await open(skill);
  await page.evaluate(() => {
    window.realCopy = navigator.clipboard.writeText.bind(navigator.clipboard);
  });
  await button("复制本机安装口令").click();
  await page.getByText("口令已复制 · 未验证安装", { exact: true }).waitFor();
  await waitUse(skill, 1);
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw Error("denied");
    };
  });
  await button("复制本机安装口令").click();
  await page.getByText(/复制失败：/).waitFor();
  assert.equal(await uses(skill), 1);
  await page.route("**/api/deliveries", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "合成生成失败" }),
    }),
  );
  await button("复制本机安装口令").click();
  await page
    .getByRole("alert")
    .getByText(/合成生成失败/)
    .waitFor();
  assert.equal(await uses(skill), 1);
  await page.unroute("**/api/deliveries");
  await page.evaluate(() => {
    navigator.clipboard.writeText = window.realCopy;
  });
  await close();
  await open(workflow);
  await button("复制流程说明").click();
  await page.getByText("使用记录已保存", { exact: true }).waitFor();
  await waitUse(workflow, 1);
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw Error("denied");
    };
  });
  await button("复制流程说明").click();
  await page.getByText(/剪贴板不可用/).waitFor();
  assert.equal(await uses(workflow), 1);
  console.log("PASS 导出取消不计、最近使用排序、Skill/Workflow 成功与失败");

  await close();
  await open(prompt);
  await page.route("**/api/asset-activity", async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "lost feedback response" }),
    });
  });
  await page.route("**/api/asset-activity?*", (route) => route.abort());
  const feedbackCount = (await records()).filter(
    (r) => r.kind === "feedback",
  ).length;
  await button("好用").click();
  await page.getByLabel("反馈备注（可选）").fill("输入/输出都稳定");
  await button("保存反馈").click();
  await detail.getByText(/记录结果未知/).waitFor();
  assert.equal(await button("补记记录").count(), 0);
  await page.unroute("**/api/asset-activity?*");
  await page.unroute("**/api/asset-activity");
  await button("查询记录").click();
  await page.getByText("反馈已保存", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("反馈备注（可选）").count(), 0);
  assert.equal(
    (await records()).filter((r) => r.kind === "feedback").length,
    feedbackCount + 1,
  );
  await close();
  await open(skill);
  await page.evaluate(() => {
    navigator.clipboard.writeText = window.realCopy;
  });
  await page.route("**/api/deliveries/copied", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "lost transient receipt" }),
    }),
  );
  await button("复制本机安装口令").click();
  await page.getByText(/剪贴板已复制，但服务未确认记录状态/).waitFor();
  await waitUse(skill, 2);
  assert.equal(await button("查询记录").count(), 0);
  await page.unroute("**/api/deliveries/copied");
  console.log(
    "PASS 反馈未知结果查询后清草稿；Skill 临时确认失败不丢持久计次；补记保留 usedAt",
  );

  await mkdir("test-results/usage", { recursive: true });
  for (const width of [1440, 430, 393, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await button("好用").click();
    await page.getByLabel("反馈备注（可选）").fill("合成评价".repeat(80));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    for (const name of ["保存反馈", "取消反馈"])
      assert.ok((await button(name).boundingBox()).height >= 44);
    assert.deepEqual(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze()
      ).violations,
      [],
    );
    await page
      .locator(".asset-usage")
      .screenshot({ path: `test-results/usage/feedback-${width}.png` });
    await button("取消反馈").click();
  }
  assert.deepEqual(errors, []);
  console.log("PASS 使用反馈桌面与四种窄屏、长备注、44px、axe、无页面错误");
} catch (error) {
  console.error(error);
  await page.screenshot({
    path: "test-results/usage-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
  await app.close();
}

// Fresh synthetic stores isolate recovery branches from the primary usage flow.
const recoveryBrowser = await chromium.launch();
try {
  for (const scenario of [
    "revoked",
    "archived",
    "committed-revoked",
    "committed-archived",
    "delivery-unknown",
    "query-unknown",
    "late-commit",
    "delivery-http-unknown",
    "delivery-malformed-unknown",
    "final-query-unknown",
    "feedback-archived",
    "feedback-reload-unknown",
  ]) {
    const isolated = await fixture();
    const state = await isolated.repository.write(seed(), { initialize: true });
    const a = state.assets.find(
      (a) =>
        a.type ===
        (scenario.includes("archived") || scenario.startsWith("feedback")
          ? "Prompt"
          : "Skill"),
    );
    const p = await recoveryBrowser.newPage({
      reducedMotion: "reduce",
      permissions: ["clipboard-write"],
    });
    p.setDefaultTimeout(5000);
    await p.addInitScript(() => {
      window.__successFeedback = 0;
      addEventListener("guiji:data-caught", () => window.__successFeedback++);
    });
    const recoveryDetail = p.getByRole("dialog", { name: "资产详情", exact: true });
    const b = (name) => (name.startsWith("查看 ")
      ? p
      : p.getByRole("dialog", { name: "资产详情", exact: true })
    ).getByRole("button", { name, exact: true });
    const key = `workbench-activity-${a.id}`;
    const pending = () =>
      p.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), key);
    let payload,
      failed = false;
    const auth = await fetch(isolated.url + "/api/session", {
      headers: { "X-Workbench-Client": "1" },
    }).then((r) => r.json());
    const api = (path, body) =>
      fetch(isolated.url + "/api" + path, {
        method: "POST",
        headers: {
          "X-Workbench-Token": auth.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    try {
      await p.goto(isolated.url + "/#assets");
      await openFrom(p, a); // #93 第二批：Skill 资产从全局搜索打开
      await p.route("**/api/asset-activity", async (route) => {
        payload = route.request().postDataJSON();
        failed = true;
        if (scenario.startsWith("committed"))
          assert.equal((await route.fetch()).status(), 200);
        if (scenario.includes("revoked"))
          assert.equal(
            (await api("/deliveries/revoke", { id: payload.deliveryId }))
              .status,
            200,
          );
        if (scenario.includes("archived")) {
          const now = await isolated.repository.read();
          await isolated.repository.write({
            ...now,
            assets: now.assets.map((entry) =>
              entry.id === a.id ? { ...entry, archived: true } : entry,
            ),
          });
        }
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "synthetic lost response" }),
        });
      });
      if (scenario === "delivery-unknown")
        await p.route("**/api/deliveries?*", (route) =>
          failed ? route.abort() : route.continue(),
        );
      if (
        scenario === "delivery-http-unknown" ||
        scenario === "delivery-malformed-unknown"
      )
        await p.route("**/api/deliveries?*", (route) =>
          failed
            ? route.fulfill({
                status: scenario === "delivery-http-unknown" ? 410 : 200,
                contentType: "application/json",
                body: JSON.stringify(
                  scenario === "delivery-http-unknown"
                    ? { error: "synthetic unavailable query" }
                    : [{}],
                ),
              })
            : route.continue(),
        );
      if (scenario === "final-query-unknown") {
        let reads = 0;
        await p.route("**/api/asset-activity?*", (route) =>
          ++reads === 2 ? route.abort() : route.continue(),
        );
      }
      if (
        scenario === "query-unknown" ||
        scenario === "feedback-reload-unknown"
      )
        await p.route("**/api/asset-activity?*", (route) => route.abort());
      if (scenario === "late-commit")
        await p.route("**/api/deliveries?*", async (route) => {
          if (!failed) return route.continue();
          // The first ID query was absent; another client commits before the final query.
          assert.equal((await api("/asset-activity", payload)).status, 200);
          assert.equal(
            (await api("/deliveries/revoke", { id: payload.deliveryId }))
              .status,
            200,
          );
          await route.continue();
        });
      if (scenario.startsWith("feedback")) {
        await b("好用").click();
        await p.getByLabel("反馈备注（可选）").fill("合成反馈草稿 A/B");
        await b("保存反馈").click();
      } else
        await b(a.type === "Skill" ? "复制本机安装口令" : "复制全文").click();
      if (scenario.startsWith("committed") || scenario === "late-commit") {
        await p.getByText("使用记录已保存", { exact: true }).waitFor();
        assert.equal(await pending(), null);
        assert.equal(
          (await isolated.repository.read()).assetActivity.length,
          1,
        );
      } else if (scenario === "feedback-reload-unknown") {
        await recoveryDetail.getByText(/记录结果未知/).waitFor();
        assert.deepEqual(Object.keys(await pending()).sort(), [
          "assetId",
          "id",
        ]);
        await p.reload();
        await openFrom(p, a); // #93
        await recoveryDetail.getByText(/记录结果未知/).waitFor();
        await p.unroute("**/api/asset-activity?*");
        await p.unroute("**/api/asset-activity");
        await p.evaluate(() => { window.__successFeedback = 0; });
        await b("查询记录").click();
        await p.getByText(/尚未找到反馈记录/).waitFor();
        assert.equal(await p.evaluate(() => window.__successFeedback), 0, "未找到反馈记录不播放成功反馈");
        assert.equal(await b("补记记录").count(), 0);
        await b("暂不保存此记录").click();
        await b("好用").click();
        await p.getByLabel("反馈备注（可选）").fill("重新填写的合成反馈");
        await b("保存反馈").click();
        await p.getByText("反馈已保存", { exact: true }).waitFor();
        assert.equal(
          (await isolated.repository.read()).assetActivity.length,
          1,
        );
      } else if (scenario === "feedback-archived") {
        await p.getByText(/资产不存在或已归档，本次记录未保存/).waitFor();
        assert.equal(await p.evaluate(() => window.__successFeedback), 0, "已归档且记录未保存不播放成功反馈");
        assert.equal(
          await p.getByLabel("反馈备注（可选）").inputValue(),
          "合成反馈草稿 A/B",
        );
        assert.equal(await b("补记记录").count(), 0);
        assert.equal(await pending(), null);
        assert.equal(
          (await isolated.repository.read()).assetActivity?.length || 0,
          0,
        );
        await b("取消反馈").click();
      } else if (scenario.endsWith("unknown")) {
        await recoveryDetail.getByText(/记录结果未知/).waitFor();
        const before = await pending();
        assert.equal(await b("补记记录").count(), 0);
        assert.equal(
          (await isolated.repository.read()).assetActivity?.length || 0,
          0,
        );
        await p.unroute("**/api/deliveries?*");
        await p.unroute("**/api/asset-activity?*");
        await p.unroute("**/api/asset-activity");
        await b("查询记录").click();
        await b("补记记录").click();
        await p.getByText("使用记录已保存", { exact: true }).waitFor();
        const saved = (await isolated.repository.read()).assetActivity[0];
        assert.equal(saved.id, before.id);
        assert.equal(saved.usedAt, before.usedAt);
      } else {
        await p.getByText(/复制已成功，但.*本次记录未保存/).waitFor();
        assert.equal(await b("补记记录").count(), 0);
        assert.equal(await b("查询记录").count(), 0);
        assert.equal(await pending(), null);
        assert.equal(
          (await isolated.repository.read()).assetActivity?.length || 0,
          0,
        );
      }
      console.log("PASS M1 recovery", scenario);
    } finally {
      await p.close();
      await isolated.close();
    }
  }
} finally {
  await recoveryBrowser.close();
}

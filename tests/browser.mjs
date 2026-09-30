import { fixture } from "./fixture.mjs";
const app = await fixture();
import { createRequire } from "node:module";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { zipSync, strToU8, unzipSync, strFromU8 } from "fflate";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const passed = [];
const ok = (s) => {
  passed.push(s);
  console.log("PASS", s);
};
const go = async (id) => {
  await page.goto(app.url + "/#" + id);
  await page.locator(".page-heading").waitFor();
};
const close = async () =>
  page.getByRole("button", { name: "关闭", exact: true }).first().click();
try {
  await go("assets");
  assert.equal(await page.locator(".asset-card").count(), 6);
  await page.screenshot({
    path: "test-results/01-assets-desktop.png",
    fullPage: true,
  });
  ok("冷启动：六份演示资产、无控制台异常");
  await page.getByRole("button", { name: "Prompts 2", exact: true }).click();
  assert.equal(await page.locator(".asset-card").count(), 2);
  await page.getByRole("button", { name: "全部 6", exact: true }).click();
  // 切片 1.1：收藏改为置顶。置顶项排第一、数量行计数；取消后恢复，不影响后续步骤。
  await page.getByRole("button", { name: "置顶 把经验，留在知识里", exact: true }).click();
  await page.getByRole("button", { name: "取消置顶 把经验，留在知识里", exact: true }).waitFor();
  assert.equal(await page.locator(".asset-card").count(), 6);
  assert.equal(await page.locator(".asset-card h3").first().innerText(), "把经验，留在知识里");
  assert.match(await page.locator(".collection-meta").innerText(), /置顶 1/);
  await page.getByRole("button", { name: "取消置顶 把经验，留在知识里", exact: true }).click();
  await page.getByRole("button", { name: "置顶 把经验，留在知识里", exact: true }).waitFor();
  assert.doesNotMatch(await page.locator(".collection-meta").innerText(), /置顶/);
  await page.getByLabel("在资产中搜索").fill("复盘");
  // 1.3 起搜索覆盖正文：标题命中「一次真正有用的复盘」，正文命中「把经验，留在知识里」。
  assert.equal(await page.locator(".asset-card").count(), 2);
  await page.getByLabel("在资产中搜索").fill("");
  ok("分类、置顶和搜索过滤");
  await page.getByRole("button", { name: "新建资产", exact: true }).click();
  await page.getByRole("button", { name: "Prompt", exact: true }).click();
  await page.getByLabel("名称", { exact: true }).fill("测试：我的提示词");
  await page.getByLabel("一句话说明").fill("验证创建、版本和持久化");
  await page.getByLabel("提示词全文").fill("这是第一版。");
  await page.getByLabel("标签", { exact: true }).fill("测试，个人");
  await page.getByRole("button", { name: "保存资产", exact: true }).click();
  await page
    .getByRole("button", { name: "查看 测试：我的提示词", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "查看 测试：我的提示词", exact: true })
    .click();
  assert.match(await page.locator(".content-preview").innerText(), /第一版/);
  ok("Prompt 创建并刷新后保留");
  await page.getByRole("button", { name: "复制全文", exact: true }).click();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    "这是第一版。",
  );
  ok("全文复制真实写入剪贴板");
  await page.getByRole("button", { name: "编辑资产", exact: true }).click();
  await page.getByLabel("提示词全文").fill("这是第二版。");
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await page.getByRole("button", { name: "版本记录 2", exact: true }).click();
  await page.getByRole("button", { name: "恢复此版本", exact: true }).click();
  await page
    .getByRole("button", { name: "确认恢复为新版本", exact: true })
    .click();
  await page.getByRole("button", { name: "版本记录 3", exact: true }).waitFor();
  await page.getByRole("button", { name: "内容预览", exact: true }).click();
  assert.equal(
    await page.locator(".content-preview").innerText(),
    "这是第一版。",
  );
  await page.screenshot({
    path: "test-results/02-asset-drawer.png",
    fullPage: false,
  });
  ok("编辑追加版本，历史恢复生成第三版");
  await page.getByRole("button", { name: "归档资产", exact: true }).click();
  await page.getByRole("button", { name: "版本归档", exact: true }).click();
  await page.getByRole("button", { name: "恢复资产", exact: true }).click();
  await page.getByRole("button", { name: /^资产仓库/ }).click();
  await page
    .getByRole("button", { name: "查看 测试：我的提示词", exact: true })
    .waitFor();
  ok("归档与恢复保留内容和版本");
  const packageBytes = zipSync({
    "sample/SKILL.md": strToU8("# Sample\n完整包测试"),
    "sample/references/中文.md": strToU8("参考文件"),
    "sample/assets/binary.bin": new Uint8Array([0, 1, 2, 255]),
  });
  await page.getByRole("button", { name: "新建资产", exact: true }).click();
  await page.getByLabel("名称", { exact: true }).fill("测试完整 Skill");
  await page.locator("input[type=file]").setInputFiles({
    name: "sample.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(packageBytes),
  });
  await page.getByText("已包含 3 个文件", { exact: true }).waitFor();
  await page.getByRole("button", { name: "保存资产", exact: true }).click();
  await page
    .getByRole("button", { name: "查看 测试完整 Skill", exact: true })
    .click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出完整 Skill 包", exact: true })
    .click();
  const d = await downloaded;
  const bytes = await readFile(await d.path());
  const output = unzipSync(bytes);
  assert.equal(Object.keys(output).length, 3);
  assert.equal(strFromU8(output["sample/references/中文.md"]), "参考文件");
  assert.deepEqual(
    Array.from(output["sample/assets/binary.bin"]),
    [0, 1, 2, 255],
  );
  await close();
  ok("ZIP 导入导出：中文路径与二进制文件完整往返");
  await page.getByRole("button", { name: "新建资产", exact: true }).click();
  const invalid = zipSync({ "README.md": strToU8("no skill") });
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(invalid),
  });
  await page
    .getByRole("alert")
    .getByText(/没有找到/)
    .waitFor();
  await close();
  ok("缺少 SKILL.md 的包明确拒绝");
  await go("notes");
  await page.getByLabel("随手记内容").fill("一个值得保留的想法。");
  await page.getByRole("button", { name: "留下这个想法" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "已保存本地随手记" })
    .waitFor();
  await page.getByText("一个值得保留的想法。", { exact: true }).waitFor();
  await page.reload();
  await page.getByText("一个值得保留的想法。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("随手记内容").fill("修改后的想法。");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await page.getByText("修改后的想法。", { exact: true }).waitFor();
  ok("随手记创建、编辑、刷新持久化");
  await go("projects");

  await page.getByRole("button", { name: /已关联 1/ }).waitFor();
  assert.equal(await page.locator(".project-discovery-row").count(), 3);
  assert.equal(app.calls.projects, 1);
  await page.getByRole("button", { name: /已关联 1/ }).click();
  assert.equal(await page.locator(".project-discovery-row").count(), 1);
  await page.getByRole("button", { name: /全部 3/ }).click();
  await page.screenshot({
    path: "test-results/03-projects.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: /已关联 1/ }).waitFor();
  assert.equal(app.calls.projects, 1);
  await page.getByRole("button", { name: "扫描目录", exact: true }).click();
  await page.getByLabel("本地项目目录（每行一个绝对路径）").waitFor();
  assert.match(
    await page.getByLabel("本地项目目录（每行一个绝对路径）").inputValue(),
    /fixture/,
  );
  await close();
  ok("项目首次自动扫描、同源关联、筛选、持久化；刷新不重复扫描");
  await go("agents");
  await page.getByRole("button", { name: /已检测 2/ }).waitFor();
  assert.equal(await page.locator(".agent-discovery-card").count(), 2);
  assert.equal(app.calls.agents, 1);
  await page.getByRole("button", { name: /配置痕迹 1/ }).click();
  assert.equal(await page.locator(".agent-discovery-card").count(), 1);
  await page.getByRole("button", { name: /已检测 2/ }).click();
  await page.getByRole("button", { name: "上下文接力" }).click();
  await page.getByLabel("当前目标").fill("接续测试");
  await page.getByLabel("已确认事实与成果指针").fill("测试通过");
  await page.getByLabel("唯一下一步").fill("检查报告");
  await page.getByRole("button", { name: "复制接力包" }).click();
  assert.match(
    await page.evaluate(() => navigator.clipboard.readText()),
    /检查报告/,
  );
  await close();
  await page.screenshot({ path: "test-results/04-agents.png", fullPage: true });
  ok("Agent 自动检测、配置痕迹区分与人工编写接力包");
  await go("night");
  await page.getByLabel("允许处理的内容").fill("只读检查指定资料");
  await page.getByRole("button", { name: "保存计划草稿" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "夜间计划已保存为草稿" })
    .waitFor();
  await page.reload();
  await page.getByLabel("允许处理的内容").waitFor();
  assert.equal(
    await page.getByLabel("允许处理的内容").inputValue(),
    "只读检查指定资料",
  );
  await page.screenshot({ path: "test-results/05-night.png", fullPage: true });
  ok("夜间计划只保存草稿，刷新保留");
  await go("knowledge");
  await page.getByRole("heading", { name: "尚未连接知识源" }).waitFor();
  await page.getByRole("button", { name: "连接知识源", exact: true }).click();
  await page.getByLabel("目录绝对路径", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("checkbox", { name: "我确认仅只读访问此目录" })
      .isChecked(),
    false,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "确认连接", exact: true })
      .isDisabled(),
    true,
  );
  await close();
  await page.screenshot({
    path: "test-results/06-knowledge.png",
    fullPage: true,
  });
  ok("知识库未连接状态、明确目录与未勾选的只读确认");
  await go("references");
  await page.getByRole("button", { name: "保存参考", exact: true }).click();
  await page.getByLabel("参考名称").fill("Apple 设计参考");
  await page.getByLabel("来源链接").fill("https://www.apple.com/");
  await page.getByLabel("值得学习的地方").fill("留白与排版层级");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "保存参考", exact: true })
    .click();
  await page.getByRole("heading", { name: "Apple 设计参考" }).waitFor();
  ok("参考资料本地保存与安全链接");
  await page.keyboard.press("Meta+k");
  await page.getByLabel("全局搜索").fill("我的提示词");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /测试：我的提示词/ })
    .click();
  await page.getByRole("dialog", { name: "资产详情" }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  ok("全局搜索快捷键、详情跳转、Escape 关闭");
  await go("settings");
  await page.getByLabel("提供商").fill("测试提供商");
  await page.getByLabel("模型 ID").fill("test-model");
  await page.getByRole("button", { name: "保存配置草稿" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "模型配置草稿已保存" })
    .waitFor();
  await page.reload();
  await page.getByLabel("模型 ID").waitFor();
  assert.equal(await page.getByLabel("模型 ID").inputValue(), "test-model");
  await page.getByRole("button", { name: "移除示例", exact: true }).click();
  await page.getByRole("button", { name: "确认移除", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "已移除未被引用的示例" })
    .waitFor();
  await go("assets");
  assert.equal(await page.locator(".asset-card").count(), 2);
  ok("配置草稿保存；清除演示保留用户资产");
  const fresh = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await fresh.newPage();
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(app.url + "/#assets");
  await mobile.getByRole("heading", { name: "资产仓库", exact: true }).waitFor();
  await mobile.screenshot({
    path: "test-results/07-assets-mobile.png",
    fullPage: true,
  });
  for (const id of [
    "assets",
    "agents",
    "projects",
    "knowledge",
    "notes",
    "night",
    "references",
    "history",
    "settings",
  ]) {
    await mobile.goto(app.url + "/#" + id);
    await mobile.locator(".page-heading").waitFor();
    assert.equal(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `overflow: ${id}`,
    );
  }
  await mobile.getByRole("button", { name: "打开导航" }).click();
  await mobile.getByRole("button", { name: /^资产仓库/ }).click();
  await mobile.getByRole("button", { name: "新建资产", exact: true }).click();
  assert.equal(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await mobile.screenshot({
    path: "test-results/08-create-mobile.png",
    fullPage: false,
  });
  await mobile.keyboard.press("Escape");
  ok("390px 窄屏：九个页面无横向溢出，移动导航与弹窗可用");
  await go("assets");
  await page.getByRole("button", { name: "新建资产", exact: true }).click();
  await page.getByLabel("名称", { exact: true }).fill("未保存的草稿");
  await page.keyboard.press("Meta+k");
  assert.equal(await page.getByRole("dialog").count(), 1);
  assert.equal(
    await page.getByLabel("名称", { exact: true }).inputValue(),
    "未保存的草稿",
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(
      () => !!document.activeElement.closest("[role=dialog]"),
    ),
    true,
  );
  await page.keyboard.press("Escape");
  ok("编辑弹窗内 Cmd+K 不叠开搜索，焦点保留在单一弹窗");
  await go("notes");
  const stale = await context.newPage();
  stale.on("pageerror", (e) => errors.push(e.message));
  await stale.goto(app.url + "/#notes");
  await stale.getByLabel("随手记内容").waitFor();
  await page.getByLabel("随手记内容").fill("主标签新增：必须保留");
  await page.getByRole("button", { name: "留下这个想法" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "已保存本地随手记" })
    .waitFor();
  await stale.getByLabel("随手记内容").fill("旧标签未保存：不能覆盖");
  await stale.getByRole("button", { name: "留下这个想法" }).click();
  await stale
    .getByRole("alert")
    .filter({ hasText: "另一个页面已更新" })
    .waitFor();
  assert.equal(
    await stale.getByLabel("随手记内容").inputValue(),
    "旧标签未保存：不能覆盖",
  );
  await page.reload();
  await page
    .locator(".note-card")
    .filter({ hasText: "主标签新增：必须保留" })
    .waitFor();
  await stale.close();
  ok("多标签冲突阻止覆盖，失败时保留表单，已保存数据不丢失");
  await go("references");
  await page.getByRole("button", { name: "保存参考", exact: true }).click();
  await page.getByLabel("参考名称").fill("存储失败验证");
  await page.getByLabel("来源链接").fill("https://example.com");
  await page.route("**/api/workspace", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "保存失败：模拟磁盘不可写" }),
        })
      : route.continue(),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "保存参考", exact: true })
    .click();
  await page.getByRole("alert").filter({ hasText: "保存失败" }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 1);
  assert.equal(await page.getByLabel("参考名称").inputValue(), "存储失败验证");
  assert.equal(
    await page.getByRole("status").filter({ hasText: "请填写有效" }).count(),
    0,
  );
  ok("存储故障显示真实原因，不关闭表单或误报链接错误");
  assert.deepEqual(errors, []);
  ok("所有验证路径无浏览器 JavaScript 异常");
  await writeFile(
    "test-results/browser-report.json",
    JSON.stringify({ at: new Date().toISOString(), passed, errors }, null, 2),
  );
} finally {
  await browser.close();
  await app.close();
}

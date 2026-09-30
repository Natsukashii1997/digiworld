// 路线 v3 5.5 银饰计划 + 4.3 智能体角色卡（云端提前开发）：
// 欣赏墙上传/删除/恢复、收藏格品类与填格、抠图不可用时手动上传剪影 PNG 并显示白色描边、
// 角色卡编辑与持久化、派活推荐（只推荐不指派、不发请求）、44px、axe、390 无横溢。
// 图片全部用 canvas 现场合成的小图；云端（Linux）上自动抠图按设计返回“不可用”。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { fixture } from "./fixture.mjs";
import { seed } from "../src/store.js";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await fixture();
const initial = {
  ...seed(),
  projects: [
    {
      id: "p-wb",
      name: "个人工作台",
      goal: "资产与 Agent 管理",
      next: "交给 Codex 复核切片 1.3",
      location: "",
      status: "进行中",
    },
  ],
};
await app.repository.write(initial, { initialize: true });
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);

async function open(width, hash = "silver", height = 1000) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(`${width} ${e.message}`));
  await page.goto(`${app.url}/#${hash}`);
  await page.locator(".page-heading").waitFor();
  return page;
}
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
async function atLeast44(locator, name) {
  const box = await locator.boundingBox();
  assert.ok(box, `${name} 不可见`);
  assert.ok(
    box.width >= 44 && box.height >= 44,
    `${name} 点击区域 ${box.width}x${box.height}，应至少 44px`,
  );
}
async function axe(page, label) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    result.violations.map(
      (v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target).join(" ")}`,
    ),
    [],
  );
}
async function until(check, label) {
  for (let i = 0; i < 50; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`等待超时：${label}`);
}
async function noOverflow(page, label) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  assert.ok(overflow <= 0, `${label} 横向溢出 ${overflow}px`);
}
// 在页面里用 canvas 合成图片：photo 为不透明底色 + 图形；cutout 为透明底 + 不透明圆（模拟抠好的主体）。
async function synth(page, kind, type = "image/png") {
  const dataUrl = await page.evaluate(
    ({ kind, type }) => {
      const c = document.createElement("canvas");
      c.width = 96;
      c.height = 96;
      const g = c.getContext("2d");
      if (kind === "photo") {
        g.fillStyle = "#335";
        g.fillRect(0, 0, 96, 96);
      }
      g.fillStyle = "#c0c0c0";
      g.beginPath();
      g.arc(48, 48, 26, 0, Math.PI * 2);
      g.fill();
      return c.toDataURL(type, 0.9);
    },
    { kind, type },
  );
  return Buffer.from(dataUrl.split(",")[1], "base64");
}
const silverState = async () => (await app.repository.read()).silver;
const wallSection = (page) => page.getByRole("region", { name: "欣赏墙" });
const gridSection = (page) => page.getByRole("region", { name: "收藏格" });
const fillDialog = (page) => page.getByRole("dialog", { name: "填入收藏格" });
const detailDialog = (page) => page.getByRole("dialog", { name: "收藏详情" });

try {
  const page = await open(1440);
  await page.getByRole("heading", { name: "银饰计划", level: 1 }).waitFor();
  const heading = await page.locator(".page-heading").innerText();
  assert.match(heading, /可用/);
  assert.doesNotMatch(await page.locator("main").innerText(), /尚未开发，这个页面不会执行任何动作/);
  await wallSection(page).getByText("欣赏墙还是空的").waitFor();
  ok("银饰计划改为可用：页头标注“可用”，欣赏墙与收藏格为空状态");

  // 1. 欣赏墙：上传 jpg，填写作者、来源、链接、备注
  const wall = wallSection(page);
  await wall.getByLabel("欣赏图片").setInputFiles({
    name: "moon.jpg",
    mimeType: "image/jpeg",
    buffer: await synth(page, "photo", "image/jpeg"),
  });
  await wall.getByLabel("作者").fill("林设计");
  await wall.getByLabel("来源", { exact: true }).fill("小红书");
  await wall.getByLabel("来源链接（可选）").fill("https://example.com/moon");
  await wall.getByLabel("备注").fill("喜欢这个弧度");
  await atLeast44(button(wall, "加入欣赏墙"), "加入欣赏墙");
  await button(wall, "加入欣赏墙").click();
  const card = wall.locator(".silver-wall-card").first();
  await card.getByText("林设计").waitFor();
  await until(
    () => card.locator("img").evaluate((img) => img.complete && img.naturalWidth > 0),
    "欣赏图加载",
  );
  assert.equal(await card.getByRole("link", { name: "小红书" }).getAttribute("href"), "https://example.com/moon");
  const stored1 = await silverState();
  assert.equal(stored1.wall.length, 1);
  assert.match(stored1.wall[0].image, /^[a-f0-9]{64}\.jpg$/);
  assert.equal(stored1.wall[0].author, "林设计");
  assert.equal(await wall.getByLabel("作者").inputValue(), "", "提交后表单清空");
  ok("欣赏墙上传 jpg：图片按内容寻址存入数据目录，作者、来源链接、备注显示并入库");

  // 不合规文件：伪装成 png 的文本被服务端按文件头拒绝；超过 8 MB 在前端拦下
  await wall.getByLabel("欣赏图片").setInputFiles({
    name: "fake.png",
    mimeType: "image/png",
    buffer: Buffer.from("definitely not an image"),
  });
  await button(wall, "加入欣赏墙").click();
  await wall.getByRole("alert").getByText(/jpg、png 或 webp/).waitFor();
  const big = Buffer.alloc(8 * 1024 * 1024 + 1);
  await wall.getByLabel("欣赏图片").setInputFiles({ name: "big.png", mimeType: "image/png", buffer: big });
  await button(wall, "加入欣赏墙").click();
  await wall.getByRole("alert").getByText(/8 MB/).waitFor();
  assert.equal((await silverState()).wall.length, 1);
  ok("伪装图片被按文件头拒绝、超过 8 MB 被拦下，都不入库");

  // 删除进回收区，再恢复
  await button(wall, "删除 林设计 的作品").click();
  await wall.getByText("欣赏墙还是空的").waitFor();
  assert.ok((await silverState()).wall[0].deletedAt);
  const recycle = page.getByRole("region", { name: "回收区" });
  await recycle.locator("summary").click();
  await button(recycle, "恢复 欣赏图：林设计").click();
  await wall.locator(".silver-wall-card").getByText("林设计").waitFor();
  assert.equal((await silverState()).wall[0].deletedAt, undefined);
  ok("欣赏图删除进回收区，恢复后回到墙上");

  // 2. 收藏格：设定品类与目标数量
  const grid = gridSection(page);
  await grid.getByText("还没有设定收藏目标").waitFor();
  await grid.getByLabel("品类名称").fill("项链");
  await grid.getByLabel("目标数量").fill("3");
  await button(grid, "添加品类").click();
  await grid.getByLabel("品类名称").fill("戒指");
  await grid.getByLabel("目标数量").fill("2");
  await button(grid, "添加品类").click();
  const necklace = grid.locator(".silver-category", { has: page.getByRole("heading", { name: "项链" }) });
  await necklace.getByText("已填 0 / 3").waitFor();
  assert.equal(await necklace.locator(".silver-cell.empty").count(), 3);
  await atLeast44(button(necklace, "填入 项链 第 1 格"), "空格按钮");
  await button(necklace, "增加 项链 目标").click();
  await necklace.getByText("已填 0 / 4").waitFor();
  await button(necklace, "减少 项链 目标").click();
  await necklace.getByText("已填 0 / 3").waitFor();
  const cats = (await silverState()).categories;
  assert.deepEqual(cats.map((c) => [c.name, c.target]), [["项链", 3], ["戒指", 2]]);
  ok("收藏格：添加项链 3、戒指 2，显示空格；目标可增减并入库");

  // 填格：上传实物图 + 名称、购入时间、价格
  await button(necklace, "填入 项链 第 1 格").click();
  const fill = fillDialog(page);
  await fill.getByLabel("实物图").setInputFiles({
    name: "real.jpg",
    mimeType: "image/jpeg",
    buffer: await synth(page, "photo", "image/jpeg"),
  });
  await fill.getByLabel("名称").fill("月光项链");
  await fill.getByLabel("购入时间").fill("2026-09-01");
  await fill.getByLabel("价格（元，可选）").fill("399.5");
  await button(fill, "保存").click();
  await fill.waitFor({ state: "detached" });
  await page.getByRole("status").getByText(/自动抠图不可用/).waitFor();
  await necklace.getByText("已填 1 / 3").waitFor();
  const filled = button(necklace, "查看 月光项链");
  await filled.waitFor();
  await filled.getByText("无剪影").waitFor();
  const item = (await silverState()).items[0];
  assert.equal(item.name, "月光项链");
  assert.equal(item.boughtAt, "2026-09-01");
  assert.equal(item.price, 399.5);
  assert.equal(item.silhouette, undefined);
  ok("填格：实物图、名称、购入时间、价格入库；本平台自动抠图不可用时如实提示，格子显示原图并标“无剪影”");

  // 手动上传剪影：非 PNG 被拒；透明 PNG 显示白色描边剪影
  await filled.click();
  const detail = detailDialog(page);
  await detail.getByText("2026-09-01").waitFor();
  await detail.getByText("¥399.5").waitFor();
  await detail.getByLabel("手动上传剪影 PNG").setInputFiles({
    name: "cut.jpg",
    mimeType: "image/jpeg",
    buffer: await synth(page, "photo", "image/jpeg"),
  });
  await detail.getByRole("alert").getByText(/PNG/).waitFor();
  await detail.getByLabel("手动上传剪影 PNG").setInputFiles({
    name: "cut.png",
    mimeType: "image/png",
    buffer: await synth(page, "cutout"),
  });
  await detail.locator("canvas.silver-outline[data-state='ready']").waitFor();
  await button(detail, "关闭").click();
  await detail.waitFor({ state: "detached" });
  const outline = necklace.locator("canvas.silver-outline[data-state='ready']");
  await outline.waitFor();
  const pixels = await outline.evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let white = 0,
      clear = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) clear++;
      else if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) white++;
    }
    return { white, clear };
  });
  assert.ok(pixels.white > 50, `描边白色像素 ${pixels.white}`);
  assert.ok(pixels.clear > 50, `剪影外透明像素 ${pixels.clear}`);
  const withCut = (await silverState()).items[0];
  assert.match(withCut.silhouette, /^[a-f0-9]{64}\.png$/);
  assert.equal(withCut.silhouetteSource, "manual");
  ok("手动上传剪影：非 PNG 被拒；透明 PNG 入库并在格子里画出白色描边剪影");

  // 刷新后一致
  await page.reload();
  await page.locator(".page-heading").waitFor();
  await gridSection(page).locator(".silver-category", { has: page.getByRole("heading", { name: "项链" }) }).getByText("已填 1 / 3").waitFor();
  await gridSection(page).locator("canvas.silver-outline[data-state='ready']").waitFor();
  await wallSection(page).locator(".silver-wall-card").getByText("林设计").waitFor();
  ok("刷新后欣赏墙、收藏格与剪影保持一致");

  // 品类删除进回收区并恢复
  const grid2 = gridSection(page);
  await button(grid2, "删除品类 戒指").click();
  await until(async () => !(await grid2.getByRole("heading", { name: "戒指" }).count()), "戒指品类移除");
  const recycle2 = page.getByRole("region", { name: "回收区" });
  await recycle2.locator("summary").click();
  await button(recycle2, "恢复 品类：戒指").click();
  await grid2.getByRole("heading", { name: "戒指" }).waitFor();
  ok("品类删除进回收区，恢复后格子回来");

  // 已填格移入回收区：格子变回空格，恢复后回来
  await button(grid2, "查看 月光项链").click();
  await button(detailDialog(page), "移入回收区").click();
  await detailDialog(page).waitFor({ state: "detached" });
  const neck2 = grid2.locator(".silver-category", { has: page.getByRole("heading", { name: "项链" }) });
  await neck2.getByText("已填 0 / 3").waitFor();
  await button(recycle2, "恢复 收藏：月光项链").click();
  await neck2.getByText("已填 1 / 3").waitFor();
  ok("已填格移入回收区后空出格子，恢复后回到原品类");

  await axe(page, "silver-1440");
  await page.screenshot({ path: "test-results/silver-1440.png", fullPage: true });
  ok("银饰计划 1440 axe 无违规");

  // 3. 智能体群：角色卡
  await page.goto(`${app.url}/#agents`);
  const roles = page.getByRole("region", { name: "角色卡" });
  await roles.waitFor();
  const cardOf = (name) => roles.locator(".role-card", { has: page.getByRole("heading", { name, exact: true }) });
  for (const [name, tier] of [
    ["Codex", "主力"],
    ["Claude Code", "主力"],
    ["Hermes", "主力"],
    ["OpenClaw", "附属"],
    ["豆包工作", "附属"],
  ])
    await cardOf(name).getByText(tier, { exact: true }).waitFor();
  assert.equal(await roles.locator(".role-card").count(), 5);
  await cardOf("Codex").getByText("个人工作台").waitFor();
  await cardOf("Codex").getByText(/推断/).first().waitFor();
  assert.match(await cardOf("Claude Code").innerText(), /常驻项目\s*(—|未推断出)/);
  await cardOf("Hermes").getByText("草拟默认").waitFor();
  ok("角色卡：主力 3 个 + 附属 2 个；Codex 常驻项目由已登记项目的交接字段推断，其余留空；未编辑卡标注草拟");

  // 编辑 Hermes
  await atLeast44(button(roles, "编辑 Hermes 角色卡"), "编辑角色卡");
  await button(roles, "编辑 Hermes 角色卡").click();
  const edit = page.getByRole("dialog", { name: "编辑角色卡：Hermes" });
  await edit.getByLabel("擅长关键词（用逗号或空格分隔）").fill("夜巡，监工 定时任务");
  await edit.getByLabel("成本").selectOption("low");
  await edit.getByLabel("常驻项目（用逗号分隔）").fill("读书笔记");
  await edit.getByLabel("备注").fill("跑在本机，适合后台");
  await button(edit, "保存角色卡").click();
  await edit.waitFor({ state: "detached" });
  await cardOf("Hermes").getByText("监工").waitFor();
  assert.equal(await cardOf("Hermes").getByText("草拟默认").count(), 0);
  const savedRoles = (await app.repository.read()).agentRoles;
  assert.deepEqual(savedRoles.map((r) => r.agentId), ["hermes"]);
  assert.deepEqual(savedRoles[0].strengths, ["夜巡", "监工", "定时任务"]);
  assert.equal(savedRoles[0].cost, "low");
  assert.deepEqual(savedRoles[0].projects, ["读书笔记"]);
  await page.reload();
  await page.getByRole("region", { name: "角色卡" }).waitFor();
  await cardOf("Hermes").getByText("跑在本机，适合后台").waitFor();
  ok("编辑 Hermes 角色卡：擅长、成本、常驻项目、备注入主库，刷新后保持");

  // 派活推荐：只推荐，不发任何请求
  const rec = page.getByRole("region", { name: "派活推荐" });
  await rec.getByText("只推荐，不指派、不执行").waitFor();
  const apiCalls = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) apiCalls.push(r.url());
  });
  await rec.getByLabel("任务描述").fill("今晚安排夜巡，顺便监工检查构建");
  await button(rec, "推荐人选").click();
  const picks = rec.locator(".role-pick");
  await picks.first().waitFor();
  assert.ok((await picks.count()) >= 1 && (await picks.count()) <= 2);
  assert.match(await picks.first().innerText(), /Hermes/);
  assert.match(await picks.first().innerText(), /命中擅长：夜巡、监工/);
  await rec.getByLabel("任务描述").fill("写一首诗 xyzzy");
  await button(rec, "推荐人选").click();
  await rec.getByText(/没有匹配的擅长关键词/).waitFor();
  assert.equal(await rec.locator(".role-pick").count(), 0);
  assert.deepEqual(apiCalls, [], "推荐不应发出任何请求");
  ok("派活推荐：按擅长关键词推荐 1–2 个并写理由；无命中如实说明；全程不发请求、不指派");

  await axe(page, "agents-roles-1440");
  await roles.screenshot({ path: "test-results/agent-roles-1440.png" });
  await page.context().close();

  // 4. 390 宽
  const narrow = await open(390, "silver", 844);
  await gridSection(narrow).locator(".silver-cell").first().waitFor();
  await noOverflow(narrow, "390 #silver");
  await atLeast44(button(wallSection(narrow), "加入欣赏墙"), "390 加入欣赏墙");
  await atLeast44(button(gridSection(narrow), "添加品类"), "390 添加品类");
  await axe(narrow, "silver-390");
  await narrow.screenshot({ path: "test-results/silver-390.png", fullPage: true });
  await button(gridSection(narrow), "查看 月光项链").click();
  await noOverflow(narrow, "390 收藏详情");
  await button(detailDialog(narrow), "关闭").click();
  await narrow.goto(`${app.url}/#agents`);
  await narrow.getByRole("region", { name: "角色卡" }).waitFor();
  await noOverflow(narrow, "390 #agents");
  await atLeast44(button(narrow, "推荐人选"), "390 推荐人选");
  await axe(narrow, "agents-390");
  ok("390 宽：银饰计划与角色卡无横向溢出，控件 44px，axe 无违规");

  assert.deepEqual(errors, []);
  console.log("silver-agents-browser: all passed");
} finally {
  await browser.close();
  await app.close();
}

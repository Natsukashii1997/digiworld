// #93 第二批（用户 2026-11-19）：资产仓库 Skill 页只读展示 my-skills 登记的 skill。
// 合成 home（临时目录）+ 假 git 记录 + 假调用记录，不读真实 my-skills。验：
// 以 links.tsv 为准展示、原 Skill 资产不再出现但数据保留；分类芯片与改分类、置顶存进 skillMeta；
// NEW / HOT / UPD 点亮、只给 Codex 的显示「–」；复制调用名只写剪贴板、不记数码世界使用记录；
// 只有置顶没有删除；「刷新」后新登记的多一颗蛋；新建对话框只给 Prompt / 设计；my-skills 一个字节不改。只验电脑宽度。
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { fixture } from "./fixture.mjs";
import { seed, makeAsset } from "../src/store.js";
import { axe } from "./ui-v14-checks.mjs";

const DAY = 864e5;
const iso = (d) => new Date(Date.now() - d * DAY).toISOString();
const day = (d) => iso(d).slice(0, 10);

const home = await realpath(await mkdtemp(join(tmpdir(), "assets-skill-home-")));
const root = join(home, "Documents", "ChatGPT", "个人", "work", "my-skills");
async function addSkill(name, description, version, targets) {
  await mkdir(join(root, "skills", name), { recursive: true });
  if (description !== null)
    await writeFile(join(root, "skills", name, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n${version ? `metadata:\n  version: "${version}"\n` : ""}---\n`);
  for (const t of targets) await appendFile(join(root, "links.tsv"), `${name}\t~/.${t}/skills\n`);
}
await mkdir(root, { recursive: true });
await writeFile(join(root, "links.tsv"), "# 合成登记\n");
await addSkill("decision-review", "第一性原理拆问题，先找反方再决策", "1.1.0", ["claude"]);
await addSkill("deploy-checklist", "上线前核对部署与备份", null, ["codex"]);
await addSkill("weekly-retro", "周复盘与知识沉淀", "0.2.0", ["claude", "agents"]);
await addSkill("ghost-skill", null, null, ["claude"]);
const kit = join(home, "Library", "Application Support", "agent-kit");
await mkdir(kit, { recursive: true });
await writeFile(join(kit, "skill-usage.jsonl"), Array.from({ length: 6 }, (_, i) =>
  JSON.stringify({ time: iso(i + 1), session: `s${i}`, cwd: "/synthetic", skill: "decision-review" })).join("\n") + "\n");
const log = [
  `@${day(2)}`, "M\tskills/decision-review/SKILL.md", "",
  `@${day(3)}`, "A\tskills/weekly-retro/SKILL.md", "",
  `@${day(40)}`, "A\tskills/decision-review/SKILL.md", "A\tskills/deploy-checklist/SKILL.md", "",
].join("\n");
const snapshot = async () => {
  const files = (await readdir(root, { recursive: true })).sort();
  return Promise.all(files.map(async (f) => [f, await readFile(join(root, f)).catch(() => null)]));
};

const app = await fixture({ discovery: { mySkills: { home, git: async () => log } } });
const oldSkill = makeAsset({ type: "Skill", title: "手动上传的旧 Skill", description: "旧说明", content: "", tags: [], source: "个人创建", files: [], installUrl: "https://github.com/example/skills/tree/main/old" });
const prompt = makeAsset({ type: "Prompt", title: "一条提示词", description: "", content: "正文", tags: [], source: "个人创建", files: [] });
const state = await app.repository.write({ ...seed(), assets: [oldSkill, prompt] }, { initialize: true });
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);
const card = (page, name) => page.locator(".ac2-skill", { has: page.locator("h3", { hasText: new RegExp(`^${name}$`) }) });
const names = (page) => page.locator(".ac2-skill h3").allInnerTexts();
const saved = () => app.repository.read();

try {
  const before = await snapshot();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(app.url + "/#assets");
  await page.locator(".ac2").first().waitFor();
  const tabs = page.getByRole("group", { name: "资产类型" });
  await tabs.getByRole("button", { name: /^Skill\s*4$/ }).waitFor();
  // 导航计数 = Prompt 1 + Design 0 + my-skills 4（旧 Skill 资产不再计入）。
  assert.equal(await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: /资产仓库/ }).innerText().then((t) => t.match(/\d+/)?.[0]), "5");
  await tabs.getByRole("button", { name: /^Skill/ }).click();
  await card(page, "decision-review").waitFor();
  // 默认按最近更新：decision-review(2 天) → weekly-retro(3 天) → deploy-checklist(40 天) → ghost-skill(无日期)。
  assert.deepEqual(await names(page), ["decision-review", "weekly-retro", "deploy-checklist", "ghost-skill"]);
  assert.equal(await page.getByText("手动上传的旧 Skill").count(), 0, "原 Skill 资产不在 Skill 页显示");
  ok("Skill 页以 links.tsv 为准，旧 Skill 资产不显示");

  // 卡片内容：名称等宽 + 荧光笔、description、Claude / Codex 标签、版本 · 日期、只有置顶没有删除。
  const dr = card(page, "decision-review");
  assert.equal(await dr.locator(".ac2-text").innerText(), "第一性原理拆问题，先找反方再决策");
  assert.deepEqual(await dr.locator(".ac2-agents span").allInnerTexts(), ["Claude"]);
  assert.deepEqual(await card(page, "weekly-retro").locator(".ac2-agents span").allInnerTexts(), ["Claude", "Codex"]);
  assert.equal(await dr.locator(".ac2-from").innerText(), `v1.1.0 · ${Number(day(2).slice(5, 7))}-${day(2).slice(8, 10)}`);
  assert.equal(await card(page, "deploy-checklist").locator(".ac2-from").innerText().then((t) => t.startsWith("未定版本 · ")), true);
  assert.equal(await card(page, "ghost-skill").locator(".ac2-text").innerText(), "没读到 SKILL.md 的说明。");
  assert.equal(await card(page, "ghost-skill").locator(".ac2-from").innerText(), "未定版本 · 日期未知");
  assert.equal(await page.locator(".ac2-skill .asset-delete").count(), 0, "Skill 只读，没有删除");
  assert.equal(await dr.locator("h3").evaluate((el) => getComputedStyle(el).fontFamily.includes("mono") || getComputedStyle(el).fontFamily.includes("Menlo")), true);
  assert.equal(await page.locator(".ac2-skill .holo-scene.holo-tint").count(), 4, "全息蛋按分类色染色");
  ok("卡片内容与只读操作");

  // 次数与标识：decision-review 6 次 → HOT；首次 40 天前、2 天前有提交 → UPD；weekly-retro 3 天前首次 → NEW；
  // deploy-checklist 只给 Codex、0 次 → 「–」。IDLE 要攒满 30 天调用记录（这里只有 6 天），不点亮。
  assert.equal((await dr.locator(".ac2-uses").innerText()).replace(/\s+/g, ""), "6次");
  assert.deepEqual(await dr.locator(".ac2-badge").allInnerTexts(), ["HOT", "UPD"]);
  assert.deepEqual(await card(page, "weekly-retro").locator(".ac2-badge").allInnerTexts(), ["NEW"]);
  assert.equal((await card(page, "deploy-checklist").locator(".ac2-uses").innerText()).replace(/\s+/g, ""), "–次");
  assert.equal(await card(page, "deploy-checklist").locator(".ac2-badge").count(), 0);
  ok("次数与 NEW / HOT / UPD、Codex 未记录显示 –");

  // 分类芯片：自动归组（decision-review→思考决策、deploy-checklist→本机运维、weekly-retro→复盘与知识、ghost-skill→待归类）。
  assert.deepEqual((await page.locator(".ac2-chips button").allInnerTexts()).map((t) => t.replace(/\s+/g, "")),
    ["全部4", "思考决策1", "复盘与知识1", "本机运维1", "待归类1"]);
  await page.locator(".ac2-chips").getByRole("button", { name: /^待归类/ }).click();
  assert.deepEqual(await names(page), ["ghost-skill"]);
  await page.getByLabel("ghost-skill 的分类").selectOption({ label: "开发工程" });
  await page.locator(".ac2-chips").getByRole("button", { name: /^开发工程/ }).waitFor();
  assert.deepEqual((await saved()).skillMeta, { "ghost-skill": { category: "dev" } });
  await page.locator(".ac2-chips").getByRole("button", { name: /^全部/ }).click();
  ok("分类芯片与改分类存进 skillMeta");

  // 置顶：排到最前；取消后 skillMeta 里只留分类。
  await page.getByRole("button", { name: "置顶 deploy-checklist", exact: true }).click();
  await page.getByRole("button", { name: "取消置顶 deploy-checklist", exact: true }).waitFor();
  assert.equal((await names(page))[0], "deploy-checklist");
  assert.deepEqual((await saved()).skillMeta["deploy-checklist"], { pinned: true });
  await page.getByRole("button", { name: "取消置顶 deploy-checklist", exact: true }).click();
  await page.getByRole("button", { name: "置顶 deploy-checklist", exact: true }).waitFor();
  assert.deepEqual((await saved()).skillMeta, { "ghost-skill": { category: "dev" } });
  ok("置顶存进 skillMeta，取消后清掉");

  // 复制调用名：剪贴板是 /名称；不写数码世界的使用记录。
  const activityBefore = (await saved()).assetActivity?.length || 0;
  await page.getByRole("button", { name: "复制调用名 decision-review", exact: true }).click();
  await page.waitForFunction(() => navigator.clipboard.readText().then((t) => t === "/decision-review"));
  assert.equal((await saved()).assetActivity?.length || 0, activityBefore);
  assert.match(await page.getByRole("button", { name: "复制调用名 decision-review", exact: true }).getAttribute("title"), /\$decision-review/);
  ok("复制调用名只写剪贴板");

  // 只读页：没有「新建」，换成「刷新」；在 my-skills 新登记一个，点刷新就多一颗蛋。
  assert.equal(await page.locator(".asset-heading-actions").getByRole("button", { name: "新建" }).count(), 0);
  await addSkill("new-skill", "新登记的工具", "0.1.0", ["claude"]);
  await page.locator(".asset-heading-actions").getByRole("button", { name: "刷新" }).click();
  await card(page, "new-skill").waitFor();
  await tabs.getByRole("button", { name: /^Skill\s*5$/ }).waitFor();
  ok("刷新后新登记的 skill 出现");

  await axe(page, "Skill 页 1440");

  // 新建对话框只给 Prompt / 设计。
  await tabs.getByRole("button", { name: /^Prompt/ }).click();
  await page.locator(".asset-heading-actions").getByRole("button", { name: "新建" }).click();
  const dialog = page.getByRole("dialog", { name: "新建资产" });
  assert.deepEqual(await dialog.getByRole("radiogroup", { name: "资产类型" }).getByRole("radio").allInnerTexts(), ["Prompt", "设计"]);
  await dialog.getByRole("button", { name: "取消" }).click();
  ok("新建只给 Prompt / 设计");

  // 旧 Skill 资产数据保留；my-skills 只多了测试自己加的 new-skill，没被页面改动。
  const final = await saved();
  assert.deepEqual(final.assets.find((a) => a.id === oldSkill.id), state.assets.find((a) => a.id === oldSkill.id));
  const after = await snapshot();
  const added = new Set(["links.tsv", "skills/new-skill", "skills/new-skill/SKILL.md"]);
  assert.deepEqual(after.filter(([f]) => !added.has(f)), before.filter(([f]) => !added.has(f)), "页面不写 my-skills");
  ok("旧 Skill 资产保留、my-skills 未被改动");

  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
  await app.close();
  await rm(home, { recursive: true, force: true });
}
console.log("PASS assets-skill: my-skills 只读展示、分类置顶、标识、复制调用名、刷新、旧数据保留");

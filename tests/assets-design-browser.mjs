// #93 第三批（用户 2026-11-19）：Design 页两种形式。验：
// 顶部说明 + 固定调用指令模板（默认展开，以第一条设计 Skill 为例）+ 按形式筛选；
// 设计 Skill 卡显示效果图、GitHub 地址、「复制调用指令」（按模板生成并计次）；设计 Prompt「复制全文」原样复制；
// 没有效果图显示占位；旧版 ZIP 设计 Skill 仍能显示、仍走交付；
// 新建设计 Skill（名字 + 地址 + 子目录 + 上传效果图）保存后卡片封面就是这张图，图存在 design-images；
// GitHub 地址不合规时报错不保存；编辑设计 Prompt 补一张效果图生成新版本。只验电脑宽度。
import assert from "node:assert/strict";
import { readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { fixture } from "./fixture.mjs";
import { seed, makeAsset, current } from "../src/store.js";
import { designCallText } from "../src/design-asset.js";
import { createNoteImages } from "../server/note-images.mjs";
import { axe } from "./ui-v14-checks.mjs";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const app = await fixture();
const dataDir = await realpath(app.repository.directory);
const cover = (await createNoteImages(dataDir, { folder: "design-images", label: "效果图" }).store({ data: new Uint8Array(PNG) })).id;
const linked = makeAsset({ type: "Design", title: "anti-template-ui", description: "防模板化的前端设计。", content: "", tags: [], source: "个人创建", files: [],
  design: { kind: "skill", skillName: "anti-template-ui", repo: "https://github.com/example-org/anti-template-ui", path: "skills/anti-template-ui", image: cover } });
const prompt = makeAsset({ type: "Design", title: "像素硬件风", description: "深墨蓝底、像素图标。", content: "请用像素硬件风生成页面。\n不要渐变大标题。", tags: [], source: "个人创建", files: [],
  design: { kind: "prompt" } });
const legacy = makeAsset({ type: "Design", title: "旧海报包", description: "", content: "", tags: [], source: "个人创建",
  files: [{ path: "poster/SKILL.md", text: true, mode: 0o644, data: "---\nname: poster-studio\n---\n# Poster" }], design: { kind: "skill" } });
linked.versions[0].at = linked.createdAt = new Date(Date.now() - 3 * 864e5).toISOString();
await app.repository.write({ ...seed(), assets: [linked, prompt, legacy] }, { initialize: true });
const browser = await chromium.launch();
const errors = [];
const ok = (s) => console.log("PASS", s);
const card = (page, title) => page.locator(".ac2-design", { has: page.locator("h3", { hasText: new RegExp(`^${title}$`) }) });
const titles = (page) => page.locator(".ac2-design h3").allInnerTexts();
const saved = () => app.repository.read();
const byTitle = async (title) => (await saved()).assets.find((a) => current(a).title === title);

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(app.url + "/#assets");
  const tabs = page.getByRole("group", { name: "资产类型" });
  await tabs.getByRole("button", { name: /^Design\s*3$/ }).click();
  await card(page, "anti-template-ui").waitFor();

  // 顶部：说明、默认展开的调用指令模板（以第一条登记地址的设计 Skill 为例）、按形式筛选。
  await page.locator(".ac2-design-intro", { hasText: "新建设计时选一种" }).waitFor();
  assert.equal(await page.locator(".ac2-calltpl").getAttribute("open"), "");
  assert.match(await page.locator(".ac2-calltpl summary").innerText(), /以 anti-template-ui 为例/);
  assert.equal(await page.locator(".ac2-calltpl pre").innerText(), designCallText(current(linked)));
  assert.deepEqual((await page.getByRole("group", { name: "按形式筛选" }).getByRole("button").allInnerTexts()).map((t) => t.replace(/\s+/g, "")),
    ["全部3", "设计Skill2", "设计Prompt1"]);
  ok("顶部说明、调用指令模板与形式筛选");

  // 卡片：效果图封面、形式标签、GitHub 地址、来源与复制按钮文字；没图时占位；旧版 ZIP 标旧版。
  const lk = card(page, "anti-template-ui");
  await page.waitForFunction(() => [...document.querySelectorAll(".ac2-shot-img")].some((img) => img.complete && img.naturalWidth > 0));
  assert.equal(await lk.locator(".ac2-shot-img").getAttribute("alt"), "anti-template-ui 效果图");
  assert.equal(await lk.locator(".ac2-cat").innerText(), "设计 Skill");
  assert.equal(await lk.locator(".ac2-repo").innerText(), "github.com/example-org/anti-template-ui · skills/anti-template-ui");
  assert.equal(await lk.locator(".ac2-from").innerText(), "从 GitHub 安装");
  assert.equal(await lk.locator(".ac2-text").innerText(), "防模板化的前端设计。");
  const pr = card(page, "像素硬件风");
  assert.match(await pr.locator(".ac2-noimg").innerText(), /还没有效果图/);
  assert.equal(await pr.locator(".ac2-cat").innerText(), "设计 Prompt");
  assert.equal(await pr.locator(".ac2-from").innerText(), "我确认过的");
  assert.equal(await pr.locator(".ac2-repo").count(), 0);
  assert.equal(await card(page, "旧海报包").locator(".ac2-cat").innerText(), "设计 Skill · ZIP 包（旧版）");
  await card(page, "旧海报包").getByRole("button", { name: "复制生图提示词 旧海报包", exact: true }).waitFor();
  ok("卡片：效果图、形式、地址、来源；没图占位；旧版 ZIP 照旧");

  // 复制：设计 Skill 是按模板生成的调用指令，设计 Prompt 是原文；两次都记一次使用。
  await lk.getByRole("button", { name: "复制调用指令 anti-template-ui", exact: true }).click();
  const callText = designCallText(current(linked));
  await page.waitForFunction((want) => navigator.clipboard.readText().then((t) => t === want), callText);
  await pr.getByRole("button", { name: "复制全文 像素硬件风", exact: true }).click();
  await page.waitForFunction(() => navigator.clipboard.readText().then((t) => t === "请用像素硬件风生成页面。\n不要渐变大标题。"));
  for (let i = 0; i < 20 && ((await saved()).assetActivity || []).filter((r) => r.action === "copy-design").length < 2; i++) await page.waitForTimeout(200);
  assert.deepEqual(((await saved()).assetActivity || []).filter((r) => r.action === "copy-design").map((r) => r.assetId).sort(), [linked.id, prompt.id].sort());
  ok("复制调用指令 / 复制全文，均计次");

  // 按形式筛选。
  await page.getByRole("group", { name: "按形式筛选" }).getByRole("button", { name: /^设计 Prompt/ }).click();
  assert.deepEqual(await titles(page), ["像素硬件风"]);
  await page.getByRole("group", { name: "按形式筛选" }).getByRole("button", { name: /^全部/ }).click();
  ok("按形式筛选");

  await axe(page, "Design 页 1440");

  // 新建设计 Skill：GitHub 地址不合规时报错不保存；改对后保存，封面就是上传的图。
  await page.locator(".asset-heading-actions").getByRole("button", { name: "新建" }).click();
  const dialog = page.getByRole("dialog", { name: "新建资产" });
  await dialog.getByRole("radiogroup", { name: "资产类型" }).getByRole("radio", { name: "设计" }).click();
  const kinds = dialog.getByRole("radiogroup", { name: "设计形式" });
  assert.deepEqual(await kinds.getByRole("radio").allInnerTexts(), ["设计 Prompt", "设计 Skill"]);
  assert.equal(await kinds.getByRole("radio", { name: "设计 Prompt" }).getAttribute("aria-checked"), "true", "新建默认设计 Prompt");
  assert.equal(await dialog.getByLabel("选择 Skill ZIP 文件").count(), 0, "设计不再上传 ZIP");
  await kinds.getByRole("radio", { name: "设计 Skill" }).click();
  assert.equal(await dialog.getByRole("textbox", { name: "设计 Prompt 正文" }).count(), 0, "设计 Skill 不填正文");
  await dialog.getByLabel("Skill 名称").fill("poster-kit");
  assert.equal(await dialog.getByLabel("名称", { exact: true }).inputValue(), "poster-kit", "名称跟着 skill 名填好");
  await dialog.getByLabel("GitHub 地址").fill("https://gitlab.com/example-org/poster-kit");
  await dialog.getByLabel("仓库子目录（可选）").fill("/skills/poster-kit/");
  await dialog.getByLabel("风格说明").fill("16 色像素海报。");
  await dialog.getByLabel("选择效果图").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG });
  await dialog.locator(".design-image-preview img").waitFor();
  await dialog.getByRole("button", { name: /保存/ }).click();
  await dialog.getByText(/GitHub 地址需是仓库链接/).waitFor();
  assert.equal(await byTitle("poster-kit"), undefined, "地址不合规不保存");
  await dialog.getByLabel("GitHub 地址").fill("https://github.com/example-org/poster-kit");
  await dialog.getByRole("button", { name: /保存/ }).click();
  await card(page, "poster-kit").locator(".ac2-shot-img").waitFor();
  const created = current(await byTitle("poster-kit"));
  assert.deepEqual(created.design, { kind: "skill", skillName: "poster-kit", repo: "https://github.com/example-org/poster-kit", path: "skills/poster-kit", image: cover });
  assert.equal(created.content, "");
  assert.deepEqual(created.files, []);
  assert.deepEqual(await readdir(join(dataDir, "design-images")), [cover]);
  ok("新建设计 Skill：地址校验、子目录规范化、效果图做封面");

  // 编辑设计 Prompt：补一张效果图，存成新版本，原版本保留。
  await pr.locator(".card-open").click();
  const detail = page.getByRole("dialog", { name: "资产详情" });
  await detail.getByRole("button", { name: "复制全文" }).waitFor();
  await detail.getByRole("button", { name: "编辑资产" }).click();
  const edit = page.getByRole("dialog", { name: /编辑资产/ });
  assert.equal(await edit.getByRole("radiogroup", { name: "设计形式" }).getByRole("radio", { name: "设计 Prompt" }).getAttribute("aria-checked"), "true");
  assert.equal(await edit.getByRole("textbox", { name: "设计 Prompt 正文" }).inputValue(), "请用像素硬件风生成页面。\n不要渐变大标题。");
  await edit.getByLabel("选择效果图").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG });
  await edit.locator(".design-image-preview img").waitFor();
  await edit.getByRole("button", { name: /保存/ }).click();
  await edit.waitFor({ state: "detached" });
  const revised = await byTitle("像素硬件风");
  assert.equal(revised.versions.length, 2);
  assert.deepEqual(current(revised).design, { kind: "prompt", image: cover });
  assert.equal(revised.versions[0].design.image, undefined);
  ok("编辑设计 Prompt 补效果图，生成新版本");

  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
  await app.close();
}
console.log("PASS assets-design: Design 页两种形式、调用指令、效果图、新建与编辑");

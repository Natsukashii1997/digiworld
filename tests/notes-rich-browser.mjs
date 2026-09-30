// 路线 v3 切片 1.4：随手记富文本（无序、有序、任务列表，五色字）+ 炼入焚决；只存本应用，渲染时转义。
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
const AT = "2026-09-30T08:00:00.000Z";
const app = await fixture();
const initial = seed();
initial.scrolls = [
  {
    id: "scroll-ling",
    name: "灵感",
    pinned: false,
    createdAt: AT,
    entries: [
      { id: "entry-old", text: "已有条目", tags: [], uses: 0, createdAt: AT },
    ],
  },
  { id: "scroll-xin", name: "心法", pinned: false, createdAt: AT, entries: [] },
];
initial.notes = [
  { id: "legacy-note", text: "- 旧笔记不是列表\n第二行", at: AT },
];
await app.repository.write(initial, { initialize: true });
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch();
const errors = [];
const requests = [];
const ok = (s) => console.log("PASS", s);

async function open(width, height = 1000) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(`${width} ${e.message}`));
  page.on("dialog", (d) => {
    errors.push(`${width} 意外弹窗 ${d.message()}`);
    d.dismiss();
  });
  page.on("request", (r) => requests.push(`${r.method()} ${new URL(r.url()).pathname}`));
  await page.goto(app.url + "/#notes");
  await page.getByLabel("随手记内容").waitFor();
  return page;
}
const button = (page, name) => page.getByRole("button", { name, exact: true });
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
const select = (page, start, end) =>
  page.getByLabel("随手记内容").evaluate(
    (el, [a, b]) => {
      el.focus();
      el.setSelectionRange(a, b);
    },
    [start, end],
  );
const value = (page) => page.getByLabel("随手记内容").inputValue();
const notes = async () => (await app.repository.read()).notes;
const scrolls = async () => (await app.repository.read()).scrolls;

try {
  const page = await open(1440);
  const toolbar = page.getByRole("toolbar", { name: "随手记格式" });
  for (const name of ["无序列表", "有序列表", "任务列表", "红色", "蓝色", "绿色", "黄色", "灰色"])
    await atLeast44(toolbar.getByRole("button", { name, exact: true }), name);
  ok("格式工具栏：三种列表与五种字色，按钮不小于 44px");

  // 工具栏把选中的行变为列表，把选中文字包成字色。
  const editor = page.getByLabel("随手记内容");
  await editor.fill("买菜\n做饭");
  await select(page, 0, 5);
  await toolbar.getByRole("button", { name: "无序列表", exact: true }).click();
  assert.equal(await value(page), "- 买菜\n- 做饭");
  await editor.fill("买菜\n做饭");
  await select(page, 0, 5);
  await toolbar.getByRole("button", { name: "有序列表", exact: true }).click();
  assert.equal(await value(page), "1. 买菜\n2. 做饭");
  await editor.fill("买菜");
  await select(page, 1, 1);
  await toolbar.getByRole("button", { name: "任务列表", exact: true }).click();
  assert.equal(await value(page), "- [ ] 买菜");
  const colors = { 红色: "red", 蓝色: "blue", 绿色: "green", 黄色: "yellow", 灰色: "gray" };
  for (const [label, key] of Object.entries(colors)) {
    await editor.fill("重点在这");
    await select(page, 0, 2);
    await toolbar.getByRole("button", { name: label, exact: true }).click();
    assert.equal(await value(page), `[重点]{${key}}在这`, label);
  }
  // 键盘：工具栏按钮可以用 Tab 到达并用空格触发。
  await editor.fill("键盘行");
  await select(page, 0, 3);
  await toolbar.getByRole("button", { name: "任务列表", exact: true }).focus();
  await page.keyboard.press("Space");
  assert.equal(await value(page), "- [ ] 键盘行");
  ok("工具栏按选区生成列表与字色标记，键盘可触发");

  // 五种格式 + XSS 字符串，保存后刷新一致。
  const xss = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>`;
  const rich = [
    "今日想法",
    "- 无序甲",
    "- 无序乙",
    "1. 有序一",
    "2. 有序二",
    "- [ ] 待办一",
    "- [x] 已办二",
    "[红字]{red}、[蓝字]{blue}、[绿字]{green}、[黄字]{yellow}、[灰字]{gray}",
    xss,
  ].join("\n");
  await editor.fill(rich);
  await button(page, "留下这个想法").click();
  await page.getByRole("status").filter({ hasText: "已保存本地随手记" }).waitFor();
  const card = () => page.locator(".note-card").filter({ hasText: "今日想法" });
  const check = async () => {
    const c = card();
    assert.deepEqual(await c.locator("ul.note-ul > li").allInnerTexts(), ["无序甲", "无序乙"]);
    assert.deepEqual(await c.locator("ol.note-ol > li").allInnerTexts(), ["有序一", "有序二"]);
    assert.deepEqual(
      await c.locator("ul.note-tasks input[type=checkbox]").evaluateAll((els) =>
        els.map((el) => [el.getAttribute("aria-label"), el.checked]),
      ),
      [
        ["待办一", false],
        ["已办二", true],
      ],
    );
    for (const [, key] of Object.entries(colors))
      assert.equal(await c.locator(`.ink-${key}`).count(), 1, key);
    assert.equal(await c.locator(".ink-red").innerText(), "红字");
    assert.equal(await c.locator(".ink-gray").innerText(), "灰字");
    // XSS：原样作为文字显示，没有生成元素、没有执行。
    assert.ok((await c.innerText()).includes(xss));
    assert.equal(await c.locator("img, script").count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
  };
  await check();
  const saved = (await notes()).find((n) => n.text.startsWith("今日想法"));
  assert.equal(saved.format, "md1");
  assert.equal(saved.text, rich);
  await page.reload();
  await card().waitFor();
  await check();
  // 旧随手记（无格式）按纯文本显示，不被解释成列表。
  const legacy = page.locator(".note-card").filter({ hasText: "旧笔记不是列表" });
  assert.equal(await legacy.locator("li").count(), 0);
  assert.match(await legacy.innerText(), /- 旧笔记不是列表/);
  ok("五种格式保存后刷新一致；旧随手记仍是纯文本；XSS 字符串被转义、未执行");

  // 任务勾选持久。
  const todo = card().getByRole("checkbox", { name: "待办一" });
  await atLeast44(todo.locator("xpath=.."), "任务勾选区域");
  await todo.check();
  await until(
    async () => (await notes()).find((n) => n.id === saved.id).text.includes("- [x] 待办一"),
    "勾选保存",
  );
  await card().getByRole("checkbox", { name: "已办二" }).uncheck();
  await until(
    async () => (await notes()).find((n) => n.id === saved.id).text.includes("- [ ] 已办二"),
    "取消勾选保存",
  );
  await page.reload();
  await card().waitFor();
  assert.equal(await card().getByRole("checkbox", { name: "待办一" }).isChecked(), true);
  assert.equal(await card().getByRole("checkbox", { name: "已办二" }).isChecked(), false);
  ok("任务勾选与取消勾选保存后刷新一致");

  // 炼入焚决：有选中文字时只炼选中的部分。
  const refineButtons = card().getByRole("button", { name: "炼入焚决", exact: true });
  await atLeast44(refineButtons, "炼入焚决按钮");
  await card()
    .locator("ol.note-ol > li")
    .first()
    .evaluate((li) => {
      const range = document.createRange();
      range.selectNodeContents(li);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
  await refineButtons.click();
  const dialog = page.getByRole("dialog", { name: "炼入焚决" });
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /有序一/);
  assert.doesNotMatch(await dialog.innerText(), /无序甲/);
  await dialog.getByLabel("目标卷").selectOption({ label: "灵感" });
  await dialog.getByRole("button", { name: "炼入", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  await card().locator(".note-refined").filter({ hasText: "已炼 · 灵感" }).waitFor();
  assert.equal(await card().getByRole("button", { name: "炼入焚决" }).count(), 0);
  let stored = await scrolls();
  let ling = stored.find((s) => s.id === "scroll-ling");
  assert.deepEqual(ling.entries.map((e) => e.text), ["已有条目", "有序一"]);
  let note = (await notes()).find((n) => n.id === saved.id);
  assert.deepEqual(
    [note.refined.scrollId, note.refined.entryId],
    ["scroll-ling", ling.entries[1].id],
  );
  ok("选中文字炼入“灵感”：焚决新增条目，随手记标记已炼并显示卷名");

  // 没有选中文字时炼入整条（去掉字色标记，保留列表符号）。
  await editor.fill("整条炼入\n- [重点]{red}一句");
  await button(page, "留下这个想法").click();
  const whole = page.locator(".note-card").filter({ hasText: "整条炼入" });
  await whole.waitFor();
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await whole.getByRole("button", { name: "炼入焚决", exact: true }).click();
  await dialog.waitFor();
  await dialog.getByLabel("目标卷").selectOption({ label: "心法" });
  await dialog.getByRole("button", { name: "炼入", exact: true }).click();
  await whole.locator(".note-refined").filter({ hasText: "已炼 · 心法" }).waitFor();
  stored = await scrolls();
  assert.deepEqual(
    stored.find((s) => s.id === "scroll-xin").entries.map((e) => e.text),
    ["整条炼入\n- 重点一句"],
  );
  await page.reload();
  await whole.locator(".note-refined").filter({ hasText: "已炼 · 心法" }).waitFor();
  await card().locator(".note-refined").filter({ hasText: "已炼 · 灵感" }).waitFor();
  ok("无选中时整条炼入“心法”；刷新后两边状态一致");

  // 资产仓库的焚决卷能看到炼入的条目（焚决已迁入资产仓库，切片 1.3b）。
  await page.goto(app.url + "/#assets");
  await page.getByRole("group", { name: "资产类型" }).getByRole("button", { name: /^焚决/ }).click();
  await button(page, "打开卷 灵感").click();
  await page
    .getByRole("dialog", { name: "焚决详情" })
    .locator(".scroll-entry", { hasText: "有序一" })
    .waitFor();
  ok("资产仓库焚决卷显示炼入的条目");

  // 只存本应用：整个过程只调用本机主库接口，不触达知识库写入。
  assert.deepEqual(
    requests.filter((r) => /\/api\/knowledge/.test(r)),
    [],
  );
  await page.goto(app.url + "/#notes");
  await page.getByLabel("随手记内容").waitFor();
  assert.equal(await page.getByText(/写入 Obsidian/).count(), 0);
  ok("没有请求知识库写入，页面不再提示写入 Obsidian");

  await axe(page, "notes-1440");
  ok("axe 1440 无违规");
  await page.screenshot({ path: "test-results/notes-rich-1440.png", fullPage: false });

  const narrow = await open(390, 844);
  await narrow.locator(".note-card").first().waitFor();
  const overflow = await narrow.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  assert.ok(overflow <= 0, `390 宽横向溢出 ${overflow}px`);
  await atLeast44(
    narrow.getByRole("toolbar", { name: "随手记格式" }).getByRole("button", { name: "灰色", exact: true }),
    "390 灰色按钮",
  );
  await axe(narrow, "notes-390");
  await narrow.screenshot({ path: "test-results/notes-rich-390.png", fullPage: false });
  ok("390 宽无横向溢出，axe 无违规");

  assert.deepEqual(errors, []);
  console.log("notes-rich-browser: all passed");
} finally {
  await browser.close();
  await app.close();
}

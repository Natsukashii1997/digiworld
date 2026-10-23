// 路线 v3 切片 1.4：随手记富文本（无序、有序、任务列表，五色字）+ 炼入焚决；只存本应用，渲染时转义。
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { fixture } from "./fixture.mjs";
import {enterNew175,editor175,select175,replace175,post175,color175,visible175} from "./notes-editor-helpers175.mjs";
import {plainText} from "../src/rich-note.js";
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
  await page.locator(".notes-v16 .sn-wall").waitFor();
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
const select=select175;
const notes = async () => (await app.repository.read()).notes;
const scrolls = async () => (await app.repository.read()).scrolls;

try {
  const page = await open(1440);
  await enterNew175(page);
  const toolbar = page.getByRole("toolbar", { name: "随手记格式" });
  for (const name of ["无序列表", "有序列表", "任务列表", "红色", "蓝色", "绿色", "黄色", "灰色"])
    await atLeast44(toolbar.getByRole("button", { name, exact: true }), name);
  ok("格式工具栏：三种列表与五种字色，按钮不小于 44px");

  // 真实可见选区操作，保存后精确 md1 回读；每轮新草稿避免继承格式。
  const editor=editor175(page);
  async function checkFormat(text,tool,expected,start=0,end=text.length){
    await replace175(page,text);await select(page,start,end);await toolbar.getByRole('button',{name:tool,exact:true}).click();
    await post175(page);assert.equal((await notes())[0].text,expected);assert.equal((await notes())[0].format,'md1');await enterNew175(page);
  }
  await checkFormat('买菜\n做饭','无序列表','- 买菜\n- 做饭');
  await checkFormat('买菜\n做饭','有序列表','1. 买菜\n2. 做饭');
  await checkFormat('买菜','任务列表','- [ ] 买菜',1,1);
  const colors={红色:'red',蓝色:'blue',绿色:'green',黄色:'yellow',灰色:'gray'};
  for(const [label,key]of Object.entries(colors)){await replace175(page,'重点在这');await select(page,0,2);await color175(page,label);await post175(page);assert.equal((await notes())[0].text,`[重点]{${key}}在这`,label);await enterNew175(page);}
  await replace175(page,'键盘行');await select(page,0,3);await toolbar.getByRole('button',{name:'任务列表',exact:true}).focus();await page.keyboard.press('Space');await post175(page);assert.equal((await notes())[0].text,'- [ ] 键盘行');
  ok('三列表、五色与键盘操作由实际编辑器生成，主库精确回读');
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
  const base=await app.repository.read();await app.repository.write({...base,notes:[{id:'rich-synthetic175',at:AT,text:rich,format:'md1'},...base.notes]});await page.reload();
  await page.locator('[data-note-id="rich-synthetic175"]').waitFor();
  await page.locator('[data-note-id="rich-synthetic175"] .sn-body').click();await button(page,'保存修改').click();
  const card = () => page.locator(".sn[data-note-id]").filter({ hasText: "今日想法" });
  const check = async () => {
    const c = card();
    assert.deepEqual(await c.locator("ul.sn-ul > li [data-note-text]").allInnerTexts(), ["无序甲", "无序乙"]);
    assert.deepEqual(await c.locator("ol.sn-ol > li [data-note-text]").allInnerTexts(), ["有序一", "有序二"]);
    assert.deepEqual(
      await c.locator("ul.sn-task input[type=checkbox]").evaluateAll((els) =>
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
  const legacy = page.locator(".sn[data-note-id]").filter({ hasText: "旧笔记不是列表" });
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
  const refineName=/^炼入焚决：今日想法/;
  const refineButtons=card().getByRole('button',{name:refineName});await card().hover();await atLeast44(refineButtons,'炼入焚决按钮');
  await refineButtons.click();const dialog=page.getByRole('dialog',{name:'炼入焚决'});await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await refineButtons.evaluate(e=>e===document.activeElement),true,'Esc回焦真实炼入入口');
  await card().locator('ol.sn-ol > li [data-note-text]').first().evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);window.getSelection().removeAllRanges();window.getSelection().addRange(r);});
  await refineButtons.click();await dialog.waitFor();assert.match(await dialog.innerText(),/有序一/);assert.doesNotMatch(await dialog.innerText(),/无序甲/);
  await dialog.getByLabel("目标卷").selectOption({ label: "灵感" });
  await dialog.getByRole("button", { name: "炼入", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  await card().locator(".sn-refined").filter({ hasText: "灵感" }).waitFor();
  assert.equal(await card().getByRole("button", { name: refineName }).count(), 0, "已炼后不再有炼入");
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
  const wholeBase=await app.repository.read();await app.repository.write({...wholeBase,notes:[{id:'whole-synthetic175',at:AT,text:'整条炼入\n- [重点]{red}一句',format:'md1'},...wholeBase.notes]});await page.reload();
  const whole=page.locator('.sn[data-note-id="whole-synthetic175"]');await whole.waitFor();await page.evaluate(()=>window.getSelection().removeAllRanges());await whole.hover();await whole.getByRole('button',{name:/^炼入焚决：整条炼入/}).click();
  await dialog.waitFor();
  await dialog.getByLabel("目标卷").selectOption({ label: "心法" });
  await dialog.getByRole("button", { name: "炼入", exact: true }).click();
  await whole.locator(".sn-refined").filter({ hasText: "心法" }).waitFor();
  stored = await scrolls();
  assert.deepEqual(
    stored.find((s) => s.id === "scroll-xin").entries.map((e) => e.text),
    ["整条炼入\n- 重点一句"],
  );
  await page.reload();
  await whole.locator(".sn-refined").filter({ hasText: "心法" }).waitFor();
  await card().locator(".sn-refined").filter({ hasText: "灵感" }).waitFor();
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
  // 资产仓库的卷详情抽屉还开着：整页重新载入随手记，再逐张展开“更多”。
  await page.goto("about:blank");
  await page.goto(app.url + "/#notes");
  await page.locator(".notes-v16 .sn-wall").waitFor();
  assert.equal(await page.locator('.page-bounds').count(),0);
  const cards=await page.locator('.sn[data-note-id]').count();assert.equal(cards,12);assert.equal(await page.getByRole('button',{name:/^更多操作：|^写入 Obsidian：/}).count(),0);
  assert.equal(requests.filter(r=>/\/api\/capabilities\/vault\/(apply|rollback|preview-note|preview-profile)/.test(r)).length,0);
  await legacy.hover();await legacy.getByRole('button',{name:/^复制：/}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'- 旧笔记不是列表\n第二行');
  ok('本机边界与取消入口精确验证，真实复制原文，知识库/Vault写入零请求');
  await axe(page, "notes-1440");
  ok("axe 1440 无违规");
  await page.screenshot({ path: "test-results/notes-rich-1440.png", fullPage: false });

  const narrow = await open(390, 844);
  await narrow.locator(".sn[data-note-id]").first().waitFor();
  const overflow = await narrow.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  assert.ok(overflow <= 0, `390 宽横向溢出 ${overflow}px`);
  await enterNew175(narrow);await narrow.getByRole("button",{name:"字色",exact:true}).click();
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

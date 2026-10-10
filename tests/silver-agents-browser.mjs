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
import { createCutout } from "../server/silver-cutout.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
// 本脚本测“自动抠图不可用 → 手动上传剪影”路径，注入不可用的抠图器，避免在 macOS 上调用真实 Vision。
const app = await fixture({ discovery: { silverCutout: createCutout({ platform: "linux" }) } });
const initial = {
  ...seed(),
  silver:{wall:[],items:[],categories:[{id:"legacy-ring",name:"戒指",target:2,createdAt:"2026-09-01T00:00:00Z",deletedAt:"2026-09-02T00:00:00Z"}]},
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
const wallSection = (page) => page.getByRole("region", { name: "灵感墙" });
const gridSection = (page) => page.getByRole("region", { name: "收藏格" });
const fillDialog = (page) => page.getByRole("dialog", { name: "收录一件" });
const detailDialog = (page) => page.getByRole("dialog", { name: "收藏详情" });

try {
  const page = await open(1440);
  await page.getByRole('heading',{name:'银饰计划',level:1}).waitFor();
  assert.match(await page.locator('.page-heading').innerText(),/可用/);
  assert.doesNotMatch(await page.locator('main').innerText(),/尚未开发，这个页面不会执行任何动作/);
  const wall=wallSection(page),grid=gridSection(page);
  await button(wall,'加第一张灵感').waitFor();
  assert.equal(await grid.locator('.cat').count(),4);assert.equal(await grid.locator('.slot').count(),13);
  assert.deepEqual((await silverState()).wall,[]);assert.equal((await silverState()).categories.length,1,'开页不写迁移');
  assert.equal(await page.getByRole('button',{name:'添加品类',exact:true}).count(),0);
  ok('固定四类空图鉴；开页不新增/迁移数据');
  await button(page,'加灵感').click();
  const form=page.getByRole('dialog',{name:'加灵感',exact:true});
  await form.getByLabel('欣赏图').setInputFiles({name:'moon.jpg',mimeType:'image/jpeg',buffer:await synth(page,'photo','image/jpeg')});
  await form.getByLabel('作者 / 品牌').fill('林设计');await form.getByLabel('来源',{exact:true}).fill('小红书');await form.getByLabel('来源链接',{exact:true}).fill('https://example.com/moon');await form.getByLabel('备注').fill('喜欢这个弧度');
  await atLeast44(button(form,'加到灵感墙'),'加到灵感墙');await button(form,'加到灵感墙').click();await form.waitFor({state:'detached'});
  const card=wall.locator('.hero-card .pc');await until(()=>card.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0),'欣赏图加载');await card.click();
  const wallDetail=page.getByRole('dialog',{name:'灵感详情'});await wallDetail.getByRole('link',{name:/小红书/}).waitFor();assert.equal(await wallDetail.getByRole('link',{name:/小红书/}).getAttribute('href'),'https://example.com/moon');await wallDetail.getByText('喜欢这个弧度',{exact:true}).waitFor();await button(wallDetail,'关闭').click();
  const stored1=await silverState();assert.equal(stored1.wall.length,1);assert.match(stored1.wall[0].image,/^[a-f0-9]{64}\.jpg$/);assert.equal(stored1.wall[0].author,'林设计');assert.equal(stored1.wall[0].source,'小红书');assert.equal(stored1.wall[0].note,'喜欢这个弧度');
  await button(page,'加灵感').click();assert.equal(await form.getByLabel('作者 / 品牌').inputValue(),'','成功关闭后重开表单为空');
  ok('真实jpg内容寻址；来源链接、作者和备注保存、表单重开清空');
  await form.getByLabel('欣赏图').setInputFiles({name:'fake.png',mimeType:'image/png',buffer:Buffer.from('definitely not an image')});await button(form,'加到灵感墙').click();await form.getByRole('alert').getByText(/jpg、png 或 webp/).waitFor();
  await form.getByLabel('欣赏图').setInputFiles({name:'big.png',mimeType:'image/png',buffer:Buffer.alloc(8*1024*1024+1)});await button(form,'加到灵感墙').click();await form.getByRole('alert').getByText(/8 MB/).waitFor();assert.equal((await silverState()).wall.length,1);await button(form,'关闭').click();
  ok('伪装图片与8MB+1拒绝、不入库');
  await card.click();await button(wallDetail,'移到回收区').click();await wallDetail.waitFor({state:'detached'});await button(wall,'加第一张灵感').waitFor();assert.ok((await silverState()).wall[0].deletedAt);
  const recycle=page.locator('details.recycle');await recycle.locator('summary').click();await button(recycle.locator('.silver-recycle-row',{hasText:'林设计'}),'恢复').click();await wall.getByRole('button',{name:'林设计 · 未命名灵感',exact:true}).waitFor();assert.equal((await silverState()).wall[0].deletedAt,undefined);assert.equal((await silverState()).wall[0].id,stored1.wall[0].id);
  ok('灵感同ID回收恢复');
  const help=page.getByRole('dialog',{name:'这页怎么用'}),necklace=grid.locator('.cat',{has:page.getByText('项链',{exact:true})});
  async function changeTarget(name,n){await button(page,'这页怎么用').click();const input=help.getByLabel(name,{exact:true});await input.fill(String(n));await input.press('Tab');await until(async()=> (await silverState()).targets?.[name==='项链'?'necklace':'ring']===n,'目标落库');await button(help,'关闭').click();}
  await changeTarget('项链',3);await changeTarget('戒指',2);assert.equal(await necklace.locator('.slot.default').count(),3);await atLeast44(necklace.locator('.slot.default').first(),'空格按钮');await changeTarget('项链',4);assert.equal(await necklace.locator('.slot.default').count(),4);await changeTarget('项链',3);assert.equal(await necklace.locator('.slot.default').count(),3);
  assert.deepEqual((await silverState()).targets,{necklace:3,ring:2});assert.equal((await silverState()).categories.length,1);
  ok('固定类目标3→4→3及戒指2持久化；不增categories');
  await necklace.locator('.slot.default').first().click();const fill=fillDialog(page);await fill.getByLabel('实物图').setInputFiles({name:'real.jpg',mimeType:'image/jpeg',buffer:await synth(page,'photo','image/jpeg')});await fill.getByLabel('名称').fill('月光项链');await fill.getByLabel('购入时间').fill('2026-09-01');await fill.getByLabel('价格（元，可选）').fill('399.5');await button(fill,'保存').click();await fill.waitFor({state:'detached'});await page.getByRole('status').getByText(/自动抠图不可用/).waitFor();await necklace.getByText('1/3',{exact:true}).waitFor();
  const filled=necklace.getByRole('button',{name:'项链：月光项链（已收录，待补剪影）',exact:true});await filled.waitFor();assert.equal(await filled.innerText(),'','格内无文字，fallback在ARIA明说');const item=(await silverState()).items[0];assert.equal(item.name,'月光项链');assert.equal(item.boughtAt,'2026-09-01');assert.equal(item.price,399.5);assert.equal(item.silhouette,undefined);assert.equal(item.categoryKey,'necklace');assert.equal(item.categoryId,undefined);
  ok('实物、日期、精确价格与新key保存；自动抠图不可用如实提示');
  await filled.click();const detail=detailDialog(page);await detail.getByText('2026-09-01',{exact:true}).waitFor();await detail.getByText('¥399.5',{exact:true}).waitFor();await detail.getByLabel('手动上传剪影 PNG').setInputFiles({name:'cut.jpg',mimeType:'image/jpeg',buffer:await synth(page,'photo','image/jpeg')});await detail.getByRole('alert').getByText(/PNG/).waitFor();await detail.getByLabel('手动上传剪影 PNG').setInputFiles({name:'cut.png',mimeType:'image/png',buffer:await synth(page,'cutout')});await detail.locator("canvas.silver-outline[data-state='ready']").waitFor();await button(detail,'关闭').click();await detail.waitFor({state:'detached'});
  const outline=necklace.locator("canvas.silver-outline[data-state='ready']");await outline.waitFor();const pixels=await outline.evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let white=0,clear=0;for(let i=0;i<d.length;i+=4){if(d[i+3]===0)clear++;else if(d[i]>240&&d[i+1]>240&&d[i+2]>240)white++;}return{white,clear};});assert.ok(pixels.white>50,`描边白色像素 ${pixels.white}`);assert.ok(pixels.clear>50,`剪影外透明像素 ${pixels.clear}`);const withCut=(await silverState()).items[0];assert.match(withCut.silhouette,/^[a-f0-9]{64}\.png$/);assert.equal(withCut.silhouetteSource,'manual');
  ok('手动PNG严校验、白像素>50、透明>50原阈值保持');
  await page.reload();await page.locator('.page-heading').waitFor();await gridSection(page).getByText('1/3',{exact:true}).waitFor();await gridSection(page).locator("canvas.silver-outline[data-state='ready']").waitFor();await wallSection(page).locator('.hero-card').getByText(/林设计/).waitFor();
  ok('刷新后来源、计数与真实剪影一致');
  await button(page,'这页怎么用').click();await help.getByText(/已回收的旧四类/).click();await button(help,'恢复戒指原品类').click();await until(async()=>!(await silverState()).categories[0].deletedAt,'旧品类恢复');assert.equal((await silverState()).categories[0].id,'legacy-ring');assert.equal((await silverState()).categories[0].target,2);assert.equal((await silverState()).items[0].categoryKey,'necklace');await button(help,'关闭').click();
  ok('已回收旧四类原ID/target历史恢复；新增key不迁移');
  const grid2=gridSection(page);await grid2.getByRole('button',{name:'项链：月光项链',exact:true}).click();await button(detailDialog(page),'移入回收区').click();await detailDialog(page).waitFor({state:'detached'});const neck2=grid2.locator('.cat',{has:page.getByText('项链',{exact:true})});await neck2.getByText('0/3',{exact:true}).waitFor();const recycle2=page.locator('details.recycle');await recycle2.locator('summary').click();await button(recycle2.locator('.silver-recycle-row',{hasText:'月光项链'}),'恢复').click();await neck2.getByText('1/3',{exact:true}).waitFor();assert.equal((await silverState()).items[0].id,item.id);assert.equal((await silverState()).items[0].silhouette,withCut.silhouette);assert.equal((await silverState()).items[0].price,399.5);
  ok('藏品回收/恢复原ID、价格、剪影保持');
  await axe(page,'silver-1440');await page.screenshot({path:'test-results/silver-1440.png',fullPage:true});ok('银饰1440 axe无违规');

  // 3. 智能体群：角色卡
  await page.goto(`${app.url}/#agents`);
  const roles = page.getByRole("region", { name: "角色卡" });
  await roles.waitFor();
  const character={Codex:"机械邪龙兽","Claude Code":"机械暴龙兽",Hermes:"亚古兽",OpenClaw:"加布兽","豆包工作":"豆包工作"};
  const cardOf = (name) => roles.locator(".archive", {has:page.getByRole("heading",{name:character[name],exact:true})});
  // UI v14e：上方名册选角色，下方只显示所选角色的档案；读某张卡前先在名册里选中它。
  const pick = (name) =>
    roles.getByRole("radiogroup", { name: "接力目标" }).getByRole("radio", { name: new RegExp(`^${name}`) }).click();
  for (const [name, tier] of [
    ["Codex", "主力"],
    ["Claude Code", "主力"],
    ["Hermes", "主力"],
    ["OpenClaw", "主力"],
    ["豆包工作", "伙伴"],
  ]) {
    await pick(name);
    assert.match(await cardOf(name).locator(".stage-plate").innerText(),new RegExp(tier));
  }
  assert.equal(await roles.getByRole("radiogroup", { name: "接力目标" }).getByRole("radio").count(), 5);
  assert.equal(await roles.locator(".archive").count(), 1);
  await pick("Codex");
  await cardOf("Codex").getByText("个人工作台").waitFor();
  await cardOf("Codex").getByText(/推断/).first().waitFor();
  await pick("Claude Code");
  assert.match(await cardOf("Claude Code").innerText(), /常驻项目\s*(—|未推断出)/);
  await pick("Hermes");
  await cardOf("Hermes").getByText("草拟默认").waitFor();
  ok("角色卡：主力 4 个 + 伙伴 1 个；Codex 常驻项目由已登记项目的交接字段推断，其余留空；未编辑卡标注草拟");

  // 编辑 Hermes
  // 编辑按钮的可访问名不含 Agent 名（避免与发现卡片的 /Codex/ 入口重名），Agent 名作为描述读出。
  const editHermes = button(cardOf("Hermes"), "编辑角色卡");
  assert.equal(await editHermes.getAttribute("aria-describedby"), "role-name-hermes");
  assert.equal(await page.getByRole("button", { name: /Codex|Hermes|Claude Code|OpenClaw|豆包/ }).filter({ hasText: "编辑角色卡" }).count(), 0);
  await atLeast44(editHermes, "编辑角色卡");
  await editHermes.click();
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
  await pick("Hermes");
  await cardOf("Hermes").getByText("跑在本机，适合后台").waitFor();
  ok("编辑 Hermes 角色卡：擅长、成本、常驻项目、备注入主库，刷新后保持");

  assert.equal(await page.getByRole("region",{name:"派活推荐"}).count(),0);
  assert.equal(await page.getByRole("button",{name:"推荐人选"}).count(),0);
  assert.equal(await page.getByLabel("任务描述",{exact:true}).count(),0);
  ok("用户取消派活推荐：输入、结果与推荐按钮全部不存在；角色编辑仍保持");

  await axe(page, "agents-roles-1440");
  await roles.screenshot({ path: "test-results/agent-roles-1440.png" });
  await page.context().close();

  // 4. 390 宽
  const narrow = await open(390, "silver", 844);
  await gridSection(narrow).locator(".slot").first().waitFor();
  await noOverflow(narrow, "390 #silver");
  await atLeast44(button(narrow, "加灵感"), "390 加入欣赏墙");
  await atLeast44(button(narrow, "收录一件"), "390 添加品类");
  await axe(narrow, "silver-390");
  await narrow.screenshot({ path: "test-results/silver-390.png", fullPage: true });
  await button(gridSection(narrow), "项链：月光项链").click();
  await noOverflow(narrow, "390 收藏详情");
  await button(detailDialog(narrow), "关闭").click();
  await narrow.goto(`${app.url}/#agents`);
  await narrow.getByRole("region", { name: "角色卡" }).waitFor();
  await noOverflow(narrow, "390 #agents");
  await atLeast44(button(narrow, "上下文接力"), "390 上下文接力");
  await axe(narrow, "agents-390");
  ok("390 宽：银饰计划与角色卡无横向溢出，控件 44px，axe 无违规");

  assert.deepEqual(errors, []);
  console.log("silver-agents-browser: all passed");
} finally {
  await browser.close();
  await app.close();
}

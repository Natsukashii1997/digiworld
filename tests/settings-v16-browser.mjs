import assert from 'node:assert/strict';import {chromium} from 'playwright';import {mkdir} from 'node:fs/promises';
import {settingsFixture,settingsRoutes} from './settings-v16-fixture.mjs';import {geometry,axe} from './ui-v14-checks.mjs';
const app=await settingsFixture(),browser=await chromium.launch(),errors=[],out=process.env.GUIJI_TEST_RESULTS||'test-results/settings-v16';await mkdir(out,{recursive:true});
async function open(width,reducedMotion='reduce'){const c=await browser.newContext({viewport:{width,height:1000},reducedMotion,timezoneId:'Asia/Shanghai'}),p=await c.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>{assert.equal(new URL(r.request().url()).origin,app.url);return r.continue();});await settingsRoutes(p);await p.goto(app.url+'/#settings');await line(p,'model').getByText('关闭 · 从未使用',{exact:true}).waitFor();return p;}
// 能力抽屉读历史期间会拦 Esc（现版行为），读完再关
async function shut(p){for(let i=0;i<50&&await p.getByRole('dialog').count();i++){await p.keyboard.press('Escape');await p.waitForTimeout(200);}assert.equal(await p.getByRole('dialog').count(),0,'抽屉应能关闭');}
const line=(p,id)=>p.locator(`[data-line=${id}]`),sw=(p,id)=>line(p,id).getByRole('switch');
try{for(const width of [320,375,390,393,430,1440]){const p=await open(width);
 // 一页 10 行自检，夜间不入设置；5 枚开关（4 项能力 + AI HOT）
 assert.equal(await p.locator('[data-line]').count(),10);assert.equal(await line(p,'night').count(),0);assert.equal(await p.getByRole('switch').count(),5);
 await geometry(p,'main','设置'+width);await axe(p,'设置'+width);await p.screenshot({path:`${out}/设置-${width}.png`,fullPage:true});
 // 键盘：开关可聚焦，Enter 打开预览抽屉，Esc 关闭回到开关
 await sw(p,'vault').focus();await p.keyboard.press('Enter');await p.getByRole('dialog').getByRole('button',{name:'将关闭Vault 写入'}).waitFor();await shut(p);assert.equal(await p.evaluate(()=>document.activeElement?.closest('[data-line]')?.dataset.line),'vault','焦点回到开关');
 assert.equal(await p.getByText('模型连接意向草稿',{exact:true}).count(),0);await p.context().close();}
// 计数含 AI HOT（夹具里网络访问开着），结论与计数一致
let p=await open(1440);assert.equal(await line(p,'aihot').getAttribute('class'),'st-line net done');
assert.equal(await p.locator('.st-tally.bad svg').getAttribute('aria-label'),'要处理 1');assert.equal(await p.locator('.st-verdict').innerText(),'还有 1 项要处理');
// 开关只打开对应能力的预览抽屉；不确认就关掉，状态与存储都不变
for(const [id,label] of [['vault','Vault 写入'],['agent','Agent 配置写入'],['model','模型请求'],['daemon','工作台常驻']]){await sw(p,id).click();const d=p.getByRole('dialog',{name:'配置授权能力'});await d.getByRole('button',{name:'将关闭'+label}).waitFor();await shut(p);assert.equal(await sw(p,id).getAttribute('aria-checked'),'false',id);}
assert.deepEqual((await app.repository.read()).model,{provider:'合成提供商',model:'保留旧草稿',endpoint:'https://example.test/v1'},'取消草稿UI不删除旧数据');
await sw(p,'model').click();await p.getByRole('button',{name:'将关闭模型请求'}).waitFor();await p.getByRole('button',{name:'管理凭据…'}).click();await p.getByRole('dialog',{name:'配置模型连接'}).waitFor();await shut(p);
await sw(p,'daemon').click();await p.getByRole('button',{name:'将关闭工作台常驻'}).waitFor();await p.getByRole('button',{name:'查看服务状态…'}).click();await p.getByRole('dialog',{name:'配置常驻服务'}).waitFor();await shut(p);
await sw(p,'aihot').click();await p.getByRole('dialog',{name:'配置网络访问'}).waitFor();await shut(p);
await line(p,'deliver').getByRole('button',{name:'添加目标'}).click();await p.getByRole('dialog',{name:'资产交付目标'}).getByRole('radio',{name:'Codex',exact:true}).waitFor();await shut(p);
await p.getByRole('button',{name:'导入备份'}).click();await p.getByRole('dialog',{name:'数据与备份'}).waitFor();await shut(p);
// 下载恢复包：调用同一个完整备份请求，成功后重读存储状态
const calls=[];p.on('request',r=>{const u=new URL(r.url()).pathname;if(['/api/full-backup/download','/api/storage/status'].includes(u))calls.push(r.method()+' '+u);});
const [download]=await Promise.all([p.waitForEvent('download'),line(p,'backup').getByRole('button',{name:'下载恢复包'}).click()]);await download.path();
await line(p,'backup').getByRole('button',{name:'下载恢复包'}).waitFor();assert.deepEqual(calls.slice(0,2),['POST /api/full-backup/download','GET /api/storage/status']);await line(p,'backup').getByText('刚刚下载过恢复包 · 请确认已存到磁盘',{exact:true}).waitFor();assert.match(await line(p,'backup').getAttribute('class'),/\bok\b/,'下载成功后按真实结果翻 ✓');
await p.context().close();
// 「知道了」按记录编号记住；同编号刷新后仍记住，新记录再亮
let usageId='u-1';const usage=r=>r.fulfill({json:{capabilities:{daemon:{id:usageId,at:'2026-10-20T01:00:00.000Z',outcome:'unknown'}}}});
p=await open(1440);await p.route('**/api/capability-usage',usage);await p.reload();
await line(p,'daemon').getByRole('button',{name:'知道了'}).click();await line(p,'daemon').getByText('已看过',{exact:true}).waitFor();assert.match(await line(p,'daemon').getAttribute('class'),/\bok\b/);
await p.reload();await line(p,'daemon').getByText('已看过',{exact:true}).waitFor();
usageId='u-2';await p.reload();await line(p,'daemon').getByRole('button',{name:'知道了'}).waitFor();assert.match(await line(p,'daemon').getAttribute('class'),/\bwarn\b/);
await p.context().close();
// 动效：开页逐行跑出（点点点），结束后全部到位；重新自检重放
p=await open(1440,'no-preference');await p.getByRole('button',{name:'重新自检'}).click();await p.locator('.st-line.typing').first().waitFor();await p.locator('.st-post-head').getByText('自检完成 · 10 项',{exact:true}).waitFor();
assert.equal(await p.locator('.st-line.done').count(),10);assert.equal(await p.locator('.st-verdict').innerText(),'全部正常');await p.context().close();
// 项目扫描：设置与项目空间两处入口同源，阈值持久化
p=await open(1440);const scan=()=>line(p,'scan').getByRole('button',{name:'调整',exact:true});await scan().click();let d=p.getByRole('dialog');await d.getByLabel('黄色提醒（天）').fill('2');await d.getByLabel('红色提醒（天）').fill('5');await d.getByRole('button',{name:'保存未存档提醒'}).click();await p.getByText('未存档提醒阈值已保存',{exact:true}).waitFor();await p.keyboard.press('Escape');
await line(p,'scan').getByText(/未存档 黄 2 \/ 红 5 天/).waitFor();
await p.goto(app.url+'/?projects-v16#projects');await p.getByRole('button',{name:'项目空间设置',exact:true}).click();d=p.getByRole('dialog');assert.equal(await d.getByLabel('黄色提醒（天）').inputValue(),'2');assert.equal(await d.getByLabel('红色提醒（天）').inputValue(),'5');await d.getByLabel('停滞阈值（天）').fill('12');await d.getByRole('button',{name:'保存阈值',exact:true}).click();await p.getByText('停滞阈值已保存为 12 天',{exact:true}).waitFor();await p.keyboard.press('Escape');
await p.goto(app.url+'/#settings');await line(p,'scan').getByText(/停滞 12 天/).waitFor();await p.reload();await line(p,'scan').getByText(/停滞 12 天 · 未存档 黄 2 \/ 红 5 天/).waitFor();
// 外部阈值更新→本页保存扫描，不能用新revision写回旧停滞天数。
await scan().click();d=p.getByRole('dialog');await app.repository.updateConnections(c=>({...c,projectStallDays:40}));await d.getByRole('button',{name:'保存并扫描',exact:true}).click();await p.getByText('扫描目录已保存并读取',{exact:true}).waitFor();assert.equal(await d.getByLabel('停滞阈值（天）').inputValue(),'40');
await d.getByLabel('黄色提醒（天）').fill('3');await d.getByLabel('红色提醒（天）').fill('6');await d.getByRole('button',{name:'保存未存档提醒',exact:true}).click();await p.getByText('未存档提醒阈值已保存',{exact:true}).waitFor();assert.equal((await app.repository.read()).connections.projectStallDays,40);
// 已改草稿不能静默重基线：保持草稿、锁定、显式回读。
await d.getByLabel('停滞阈值（天）').fill('9');await app.repository.updateConnections(c=>({...c,projectStallDays:50}));await d.getByRole('button',{name:'保存并扫描',exact:true}).click();await d.getByText(/其他入口已更改正在编辑/).waitFor();assert.equal(await d.getByLabel('停滞阈值（天）').inputValue(),'9');assert(await d.getByRole('button',{name:'保存阈值',exact:true}).isDisabled());await d.getByRole('button',{name:'重新读取设置',exact:true}).click();await p.waitForFunction(()=>document.querySelector('input[type=number]')?.value==='50');
// 同一事件双击、Esc：只启动一次且抽屉保留。
let release,requests=0;const gate=new Promise(r=>release=r);await p.route('**/api/scan/projects',async route=>{requests++;await gate;await route.continue();});const observed=p.waitForRequest(r=>r.url().endsWith('/api/scan/projects'));await d.getByRole('button',{name:'保存并扫描',exact:true}).evaluate(e=>{e.click();e.click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});await observed;assert.equal(await d.count(),1);assert.equal(requests,1);release();await d.getByRole('button',{name:'保存并扫描',exact:true}).waitFor();await p.unroute('**/api/scan/projects');await p.keyboard.press('Escape');
await p.context().close();assert.deepEqual(errors,[]);console.log('PASS 设置自检10行/键盘/6宽/44px/axe/开关只开预览/下载同源重读/知道了按编号/逐行动效/双入口同源/阈值持久化');}finally{await browser.close();await app.close();}

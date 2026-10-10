import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {knowledge193Fixture} from './knowledge-v16-fixture.mjs';
import {geometry,axe} from './ui-v14-checks.mjs';
import {sameEventClickAndEscape} from './ui-capability-browser-guards.mjs';
const out=process.env.GUIJI_TEST_RESULTS||'test-results/knowledge-clip';
await mkdir(out,{recursive:true});
const app=await knowledge193Fixture({staticRoot:process.env.GUIJI_TEST_DIST});
const browser=await chromium.launch(),errors=[],excerpt='交接时提示词带上 CURRENT 与接力规则。';
let debugPage;
const original=await readFile(join(app.roots[0],'方法/接力提示词.md'),'utf8');
try{
 for(const width of [390,320]){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
  let page=await context.newPage();debugPage=page;const b=name=>page.getByRole('button',{name,exact:true});
  const listen=()=>page.on('pageerror',e=>errors.push(e.message));listen();
  await page.goto(app.url+'/#knowledge');await page.getByRole('searchbox',{name:'跨库检索',exact:true}).fill('接力');await page.getByRole('searchbox',{name:'跨库检索',exact:true}).press('Enter');await page.locator('.kh-results .kh-res').filter({hasText:'本机笔记/方法/接力提示词.md'}).click();
  await page.getByRole('region',{name:'剪藏为待整理候选',exact:true}).waitFor();
  await page.getByLabel('原文摘录（最多 2000 字）').fill(excerpt);await b('预览来源与保存位置').click();await page.getByRole('region',{name:'剪藏确认预览'}).waitFor();await page.getByLabel('我已核对来源、摘录及本机待整理位置').check();
  let calls=0;await page.route('**/api/knowledge/clip/confirm',async route=>{calls++;const response=await route.fetch();assert.equal(response.status(),200);await route.abort();});
  await sameEventClickAndEscape(page,b('确认保存待整理候选'),'/api/knowledge/clip/confirm');await page.getByRole('alert').filter({hasText:'保存结果待核对'}).waitFor();assert.equal(calls,1);
  const tasks=(await app.workspace()).knowledgeTasks;assert.equal(tasks.filter(t=>!t.archived).length,1);const task=tasks.at(-1);
  await page.close();page=await context.newPage();debugPage=page;listen();await page.goto(app.url+'/#knowledge');await b('核对剪藏是否保存').click();await b('查询原编号').waitFor();
  const peer=await context.newPage();await peer.goto(app.url+'/#knowledge');await peer.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('workbench:knowledge-clip:pending:v2:'))localStorage.removeItem(key);});await peer.close();
  await b('查询原编号').click();await page.getByText('本机没有需要核对的剪藏。',{exact:true}).waitFor();assert.equal(calls,1);await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
  await page.locator('.ib-open').click();await page.locator(`[data-item-id="knowledge-task-${task.id}"] button`).click();await page.getByRole('region',{name:'本机待整理候选'}).waitFor();
  await geometry(page,'[role=dialog]',`${width}知识候选`);await axe(page,`${width}知识候选`);await page.screenshot({path:join(out,`clip-${width}.png`),fullPage:true});
  await page.getByLabel('我已核对，暂不继续整理这份候选').check();await page.route('**/api/knowledge/tasks/archive',async route=>{const response=await route.fetch();assert.equal(response.status(),200);await route.abort();});await b('归档并退出待处理').click();await b('核对归档状态').click();await page.getByText('已归档。候选内容仍保留在工作台本机主库及备份内。',{exact:true}).waitFor();assert.equal((await app.workspace()).knowledgeTasks.find(t=>t.id===task.id).archived,true);
  await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();await page.locator('.ib-open').click();assert.equal(await page.locator(`[data-item-id="knowledge-task-${task.id}"]`).count(),0);assert.equal(await readFile(join(app.roots[0],'方法/接力提示词.md'),'utf8'),original);
  await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(join(out,'report.json'),JSON.stringify({flows:['preview+confirm saves existing-schema candidate once','lost response survives new tab; peer clear does not strand original pointer','Inbox opens candidate; archive lost response resolves by read-back and exits Inbox','source bytes unchanged; 320/390 geometry+axe'],errors},null,2));console.log('knowledge-clip-browser PASS');
}catch(error){if(debugPage&&!debugPage.isClosed()){console.log((await debugPage.locator('body').innerText()).slice(-5000));await debugPage.screenshot({path:join(out,'failure.png'),fullPage:true});}throw error;}finally{await browser.close();await app.close();}

import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';
const out=resolve(process.env.GUIJI_TEST_RESULTS||'work/collection-get-browser');await mkdir(out,{recursive:true});
const before=process.env.GET_BEFORE==='1',real=process.env.GET_REAL_FIXTURE;
const provider=real?JSON.parse(await readFile(resolve(real,'xhs-detail.json'),'utf8')):null;
const note=syntheticNote(945,{title:provider?.title||'GET完整整理阅读',content:'原帖正文保持在同一张卡片中。'});
const tail='解析最后一段可以直接滚动阅读和搜索';
const body=(provider?.content||'# 核心结论\n\n'+Array.from({length:30},(_,i)=>`## 第${i+1}节\n\n${'完整提炼内容保留到本地，便于后续检索和Agent读取。'.repeat(6)}\n\n- **重点**：独立保存原内容和GET整理。`).join('\n\n'))+'\n\n'+tail+'\n\n<script>window.BAD=1</script>\n\n[危险链接](javascript:alert(1))\n\n![不要自动加载](https://evil.example/tracker.png)\n\n| 要点 | 说明 |\n| --- | --- |\n| 保存 | 同卡片完整正文 |';
let complete=before,submissions=0;
const app=await collectionFixture({getPollMs:20,getClient:{session:async()=>({binding:'fixture',create:async()=>{submissions++;return {taskId:'task-ui'};},progress:async()=>complete?{status:'success',noteId:'1924043523523615136'}:{status:'processing'},detail:async()=>({title:provider?.title||'整理后的知识',content:body,sourceUrl:note.sourceUrl})})}});
const browser=await chromium.launch();
try {
 await app.api('/notes/import',{note,mode:'get',operationId:crypto.randomUUID()});
 for(let i=0;i<100;i++){if((await app.api('/notes')).notes.length)break;await new Promise(r=>setTimeout(r,10));}
 for(const width of [1440,390,320]) {
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'}),page=await context.newPage();const external=[];
  await page.route('**/*',route=>{if(route.request().url().startsWith(app.url))return route.continue();external.push(route.request().url());return route.abort();});
  await page.goto(app.url+'/#learning');await page.getByRole('button',{name:'阅读收藏：'+note.title}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();
  if(before){await page.screenshot({path:resolve(out,`before-${width}.png`)});await context.close();continue;}
  const tab=dialog.getByRole('radio',{name:'Get笔记解析',exact:true});await tab.click();
  if(!complete){await dialog.getByText('GET正在整理内容',{exact:true}).waitFor();await page.screenshot({path:resolve(out,`processing-${width}.png`)});complete=true;}
  await dialog.getByText('GET解析已保存',{exact:true}).waitFor();assert.equal(await tab.getAttribute('aria-checked'),'true');
  assert.equal(await dialog.getByRole('button',{name:/^(上一页|下一页)$/}).count(),0);
  assert.equal(await dialog.locator('script').count(),0);assert.equal(await dialog.locator('a[href^="javascript:"]').count(),0);assert.equal(await dialog.locator('img[src*="evil.example"]').count(),0);assert.equal(await page.evaluate(()=>window.BAD),undefined);
  assert.ok((await dialog.locator('.collection-get-markdown').innerText()).includes(tail));
  await page.screenshot({path:resolve(out,`get-top-${width}.png`)});
  await dialog.getByText(tail,{exact:true}).scrollIntoViewIfNeeded();assert.ok(await dialog.getByText(tail,{exact:true}).isVisible());await page.screenshot({path:resolve(out,`get-end-${width}.png`)});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await dialog.locator('.collection-reader-info').evaluate(e=>e.scrollTop=0);await tab.focus();await page.keyboard.press('ArrowRight');assert.equal(await dialog.getByRole('radio',{name:'内容文稿',exact:true}).getAttribute('aria-checked'),'true');
  await page.keyboard.press('Escape');await page.getByLabel('搜索收藏').fill(tail);await page.getByRole('button',{name:'阅读收藏：'+note.title}).waitFor();await context.close();console.log('PASS GET continuous reader, live update, safe Markdown, keyboard/search',width);
 }
 assert.equal(submissions,1);
}finally{await browser.close();await app.close();}

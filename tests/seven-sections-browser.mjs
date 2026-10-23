import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './fixture.mjs';
const out=process.env.GUIJI_TEST_RESULTS || 'test-results/seven-sections';await mkdir(out,{recursive:true});
const app=await fixture(), browser=await chromium.launch(), errors=[], checks=[];
// UI v18（用户 2026-10-23 定 B 稿）：按主线排序，首页改叫“基地”。
const kept=[['home','基地'],['notes','随手记'],['learning','个人收藏'],['assets','资产仓库'],['projects','项目空间'],['references','逆向工程'],['settings','设置']];
try{
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(10000);
  p.on('pageerror',e=>errors.push(e.message));const retiredReads=[];
  p.on('request',r=>{if(new URL(p.url()).hash!=='#settings' && /\/api\/(agent-health\/history|calendar\/(status|todos)|capabilities\/vault\/pending-notes|night-v2\/morning-reports|aihot)(?:\?|$)/.test(r.url()))retiredReads.push(r.url());});
  await p.route('**/api/collection/notes',r=>r.fulfill({json:{notes:[],revision:1}}));
  for(const [id,label]of kept){
   await p.goto(app.url+'/#'+id);await p.locator('.crumbs strong').filter({hasText:label}).waitFor();await p.locator('.main-content').waitFor();
   assert.deepEqual(await p.locator('.nav-item > span').allTextContents(),kept.map(x=>x[1]));
   assert.equal(await p.locator('.topbar-inbox').count(),0);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0,id+' overflow '+width);
   if(['home','settings','projects'].includes(id))await p.screenshot({path:join(out,`${id}-${width}.png`),fullPage:true});
  }
  await p.getByRole('button',{name:'搜索',exact:true}).click();
  const search=p.getByRole('dialog',{name:'搜索工作台',exact:true});
  for(const label of ['智能体群','协同','夜巡','知识仓库','日历','AI HOT','存档点','待处理','能力体检'])assert.equal(await search.getByRole('button',{name:label,exact:true}).count(),0,label);
  assert.equal(await search.getByText('去知识仓库查询').count(),0);await p.keyboard.press('Escape');
  for(const id of ['inbox','agents','health','collab','night','knowledge','calendar','aihot','history','night/morning/demo','night/report/demo/slot','night/morning/%']){
   await p.goto(app.url+'/#'+id);await p.locator('.page-home .hx').waitFor();assert.equal(new URL(p.url()).hash,'#home',id);
  }
  await p.goto(app.url+'/#scrolls');await p.getByRole('group',{name:'资产类型',exact:true}).getByRole('button',{name:/焚决/}).waitFor();assert.equal(new URL(p.url()).hash,'#assets');
  assert.deepEqual(retiredReads,[],'removed modules must not load');checks.push({width,retiredRoutes:12,keptPages:7});await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(join(out,'results.json'),JSON.stringify({checks,errors},null,2));console.log('PASS 7 pages + 12 retired routes + search + no retired requests at 3 widths');
}finally{await browser.close();await app.close();}

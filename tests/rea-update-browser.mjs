import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {fixture} from './fixture.mjs';
import {fakeUpdate} from './fake-rea-update.mjs';
import {seed} from '../src/store.js';
import {axe,settle} from './ui-v14-checks.mjs';
const out='work/reverse467/stage3-ui';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch(),errors=[];
const button=(p,name)=>p.getByRole('button',{name,exact:true});
async function shot(p,name){await p.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await p.screenshot({path:join(out,name+'.png'),fullPage:false});}
async function geometry(p){await settle(p);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);for(const c of await p.locator('[role="dialog"] button').all()){if(!await c.isVisible())continue;const b=await c.boundingBox();await c.scrollIntoViewIfNeeded();assert.equal(await c.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'更新模态控件不能被背景遮挡');assert.ok(b.width>=43.5&&b.height>=43.5);}await axe(p,'update');}
try{
 for(const width of [1440,390,320])for(const mode of ['ok','network','syncing','adaptation','write-fail','mismatch']){
  const fake=fakeUpdate(),app=await fixture({reverse:{execute:fake.execute},reaUpdate:fake});let context;
  try{
   const state=seed();state.reverseRecords=[];state.assets=[];await app.repository.write(state,{initialize:true});
   context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
   await p.route('**/*',r=>{assert.equal(new URL(r.request().url()).origin,new URL(app.url).origin);return r.continue();});
   await p.goto(app.url+'/#references');await button(p,'检查更新').waitFor();assert.equal(fake.control.network,0);
   fake.control.mode=mode;await button(p,'检查更新').click();
   if(['network','syncing'].includes(mode)){await p.getByRole('dialog',{name:'REA 更新预演'}).waitFor();await p.getByText(mode==='network'?'合成网络不可达':'发布同步中：npm尚无同版本',{exact:true}).waitFor();assert.equal(fake.control.yes,0);await shot(p,'update-'+mode+'-'+width);await geometry(p);continue;}
   await button(p,'一键更新').waitFor();await button(p,'一键更新').click();const dialog=p.getByRole('dialog',{name:'REA 更新预演'});await dialog.waitFor();
   if(mode==='adaptation'){await p.getByText('适配检查未通过；禁止更新',{exact:true}).waitFor();assert.equal(await button(p,'确认更新').count(),0);await shot(p,'update-adaptation-'+width);await geometry(p);continue;}
   await button(p,'确认更新').waitFor();await p.getByText('预演完成，尚未写入Agent配置',{exact:true}).waitFor();assert.equal(fake.control.yes,0);
   if(mode==='ok'){await shot(p,'update-preview-'+width);await geometry(p);}
   await button(p,'确认更新').click();await p.getByText(mode==='ok'?'两客户端及Skill版本已对齐。请重启Claude Code和Codex。':mode==='mismatch'?'回读不一致：先核对备份与两个客户端，勿重复更新':'写入结果待核对：合成部分写入失败',{exact:true}).waitFor();
   assert.equal(fake.control.yes,1);await shot(p,'update-'+mode+'-'+width);await geometry(p);
   if(mode==='ok'){assert.equal(await p.locator('.gear-scr b').textContent(),'6.5.0');await button(dialog,'关闭预演').click();await p.reload();await p.locator('.gear-scr b').getByText('6.5.0').waitFor();}
   else{await button(dialog,'查询结果').click();await p.getByText('回读不一致；更新可能只完成一部分，请按备份位置人工核对后再查询',{exact:true}).waitFor();assert.equal(fake.control.yes,1);await p.reload();await p.getByRole('dialog').waitFor();assert.equal(fake.control.yes,1);}
  }finally{await context?.close();await app.close();}
 }
 assert.deepEqual(errors,[]);console.log('REA update 1440/390/320: preview, confirm, readback, refresh, network/sync/adaptation/write/mismatch states passed; no real network/config');
}finally{await browser.close();}

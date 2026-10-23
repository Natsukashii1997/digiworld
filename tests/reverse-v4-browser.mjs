import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { fixture } from './fixture.mjs';
import { reverseV16Fixture } from './reverse-v16-fixture.mjs';
import { prepareReplica,confirmReplica } from '../src/reverse-recipe.js';
import { generateRecipeSkill } from '../src/reverse-skill.js';
import { seed,makeAsset } from '../src/store.js';
import { axe,settle } from './ui-v14-checks.mjs';
const out=process.env.REVERSE_V4_SCREENSHOTS || 'work/reverse467/stage2-ui';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch(),errors=[];
const button=(p,name)=>p.getByRole('button',{name,exact:true});
async function geometry(p,label){
 await settle(p);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,label+'横向溢出');
 for(const c of await p.locator('main button,main summary,[role="dialog"] button,[role="dialog"] input,[role="dialog"] select,[role="dialog"] textarea').all()){
  if(!await c.isVisible())continue;
  const b=await c.evaluate(e=>(['radio','checkbox','file'].includes(e.type)?e.closest('label'):e).getBoundingClientRect().toJSON());
  assert.ok(b.width>=43.5&&b.height>=43.5,label+'命中区 '+await c.textContent()+' '+JSON.stringify(b));
 }
}
async function snap(p,name){
 if(!name.startsWith('running-'))await p.locator('.toast').waitFor({state:'hidden',timeout:8000});
 await p.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
 await p.screenshot({path:join(out,name+'.png'),fullPage:!await p.getByRole('dialog').count()});
}
async function open(app,width){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(12000);
 p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{window.syntheticCopies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async s=>{if(window.copyFails)throw Error('合成复制失败');window.syntheticCopies.push(s);}}});});
 await p.route('**/*',r=>{if(!['about:','blob:','data:'].includes(new URL(r.request().url()).protocol))assert.equal(new URL(r.request().url()).origin,new URL(app.url).origin,'不访问外网');return r.continue();});
 await p.goto(app.url+'/#references');await p.locator('.bench').waitFor();return p;
}
try{
 for(const width of (process.env.REVERSE_V4_LEGACY_ONLY?[]:[1440,390,320])){
  const app=await fixture();let p;
  try{
   const initial=seed();initial.reverseSettings={threshold:90,executor:"rea"};initial.assets=[];initial.reverseRecords=[];initial.references=[];await app.repository.write(initial,{initialize:true});
   const target=join(app.directory,'ui.asar');await fs.writeFile(target,'synthetic bytes');
   p=await open(app,width);await snap(p,'empty-'+width);await geometry(p,'empty '+width);
   await button(p,'投入参照物').first().click();const dialog=p.getByRole('dialog');
   await dialog.getByLabel('标题',{exact:true}).fill('复制块的富格式剪贴板');
   await dialog.getByLabel('本机绝对路径',{exact:true}).fill(target);
   await dialog.getByLabel('想弄懂的功能',{exact:true}).fill('复制块时富格式怎样进入剪贴板');
   await dialog.getByLabel('线索词',{exact:false}).fill('copy, clipboard');
   await dialog.getByLabel('我拥有或获准分析该软件').check();await button(dialog,'检查路径').click();await dialog.getByText('路径检查通过；尚未运行REA').waitFor();await snap(p,'software-input-'+width);await geometry(p,'input '+width);
   await button(dialog,'投入参照物').click();await dialog.waitFor({state:'hidden'});await snap(p,'pending-'+width);
   await button(p,'开始取证').click();await button(p,'停止').waitFor();await snap(p,'running-'+width);
   await button(p,'重新取证').waitFor();await p.locator('.term-state.done').waitFor();await p.locator('.pack-out').waitFor();await snap(p,'software-'+width);await geometry(p,'complete '+width);
   const pack=await p.getByTestId('replica-pack').textContent();await button(p,'展开任务包').click();assert.equal(await p.getByTestId('replica-pack').textContent(),pack);
   await button(p,'复制任务包').click();assert.equal(await p.evaluate(()=>window.syntheticCopies.at(-1)),pack);await button(p,'收起任务包').click();
   await button(p,'存成 Skill').click();await p.getByRole('dialog',{name:'存成 Skill · 预览'}).waitFor();await snap(p,'skill-preview-'+width);await geometry(p,'skill preview '+width);
   await button(p,'确认保存').click();await p.getByRole('dialog',{name:'已存 Skill',exact:true}).waitFor();await button(p.getByRole('dialog'),'关闭').click();
   assert.equal((await app.repository.read()).assets.length,1);await button(p,'查看已存 Skill').click();await button(p.getByRole('dialog'),'关闭').click();assert.equal((await app.repository.read()).assets.length,1);
   // User stop is a persisted state, not just hiding the terminal.
   await button(p,'重新取证').click();await button(p,'停止').waitFor();await button(p,'停止').click();await p.getByText(/^已停止/).waitFor();await snap(p,'stopped-'+width);assert.equal(await p.locator('.pack-out').count(),1);
   await p.reload();await p.locator('.bench').waitFor();await p.getByText(/^已停止/).waitFor();
   const fail=join(app.directory,'fail.asar');await fs.writeFile(fail,'synthetic');
   await button(p,'投入参照物').first().click();const failed=p.getByRole('dialog');await failed.getByLabel('标题',{exact:true}).fill('失败样本');await failed.getByLabel('本机绝对路径',{exact:true}).fill(fail);await failed.getByLabel('想弄懂的功能',{exact:true}).fill('失败恢复');await failed.getByLabel('我拥有或获准分析该软件').check();await button(failed,'检查路径').click();await failed.getByText('路径检查通过；尚未运行REA').waitFor();await button(failed,'投入参照物').click();await failed.waitFor({state:'hidden'});await button(p,'开始取证').click();await p.getByText(/SYNTHETIC_BAD_TARGET/).first().waitFor();await snap(p,'failed-'+width);assert.equal(await p.locator('.pack-out').count(),0);await geometry(p,'failed '+width);
   // Artwork follows the same output line without a terminal.
   await button(p,'投入参照物').first().click();const art=p.getByRole('dialog');await art.getByRole('radio',{name:'作品',exact:true}).check();await art.getByLabel('标题',{exact:true}).fill('作品文字原件');await art.getByLabel('贴文字',{exact:true}).fill('先给结论，再给理由。\n这是合成原件。');await art.getByLabel('你看重的点',{exact:true}).fill('清晰的节奏');await button(art,'投入参照物').click();await art.waitFor({state:'hidden'});
   await p.getByRole('heading',{name:'作品文字原件',exact:true}).waitFor();assert.equal(await p.locator('.term').count(),0);await snap(p,'artwork-no-image-'+width);await geometry(p,'art '+width);await axe(p,'v4 '+width);
   await p.context().close();p=null;
  }finally{if(p)await p.context().close();await app.close();}
 }
 // Original screenshots, legacy fixed Skill, and immutable history.
 const legacy=await reverseV16Fixture();let p;
 try{
  const initial=await legacy.repository.read();initial.reverseSettings={threshold:90,executor:"rea"};let fn=initial.reverseRecords.find(r=>r.type==='FN');
  const path=join(legacy.directory,'ui-legacy.asar');await fs.writeFile(path,'synthetic');
  fn.material.target={kind:'electron',path,feature:'旧功能',authorized:true};
  fn=confirmReplica(fn,{...prepareReplica(fn,{text:'合成已验证旧复刻',media:fn.referenceMedia}),scores:{interaction:5,copy:5},checks:fn.recipe.blocks.find(b=>b.kind==='acceptance').cases.map(c=>({id:c.id,result:true}))});initial.reverseRecords[initial.reverseRecords.findIndex(r=>r.id===fn.id)]=fn;
  const fixed=makeAsset({...generateRecipeSkill(fn),type:'Skill',title:'旧软件固定Skill'});initial.assets.push(fixed);fn.forge={assetId:fixed.id,versionId:fixed.versions[0].id,at:new Date().toISOString(),replicaId:fn.replicas.at(-1).id};await legacy.repository.write(initial);
  const before=await legacy.repository.read();p=await open(legacy,1440);
  await p.locator('.orig-shots img').first().waitFor();assert.ok(await p.locator('.orig-shots img').first().evaluate(e=>e.complete&&e.naturalWidth>0));
  await p.getByTestId('replica-pack').waitFor();assert.ok((await p.getByTestId('replica-pack').textContent()).includes(legacy.directory));
  await snap(p,'artwork-1440');await p.setViewportSize({width:390,height:1000});await snap(p,'artwork-390');
  await p.getByRole('radio',{name:'打开逆向记录 先给结论，再给理由'}).click();await button(p,'查看已存 Skill').click();await p.getByRole('dialog',{name:'已存 Skill',exact:true}).waitFor();await button(p.getByRole('dialog'),'关闭').click();
  assert.deepEqual((await legacy.repository.read()).reverseRecords,before.reverseRecords);assert.equal((await legacy.repository.read()).assets.length,before.assets.length);
  await p.locator('.reverse-history summary').click();assert.equal(await p.locator('.reverse-history button').count(),0);await snap(p,'history-readonly-390');
  await p.getByRole('radio',{name:'打开逆向记录 炉子 · 上下文接力'}).click();assert.equal(await p.locator('.pack-out').count(),0);await button(p,'查看已存 Skill').click();await p.getByRole('dialog',{name:'已存 Skill',exact:true}).waitFor();await button(p.getByRole('dialog'),'关闭').click();
  await button(p,'开始取证').click();await p.locator('.term-state.done').waitFor();await p.locator('.pack-out').waitFor();assert.ok((await p.getByTestId('replica-pack').textContent()).includes(path));assert.equal((await legacy.repository.read()).assets.length,before.assets.length);
 }finally{if(p)await p.context().close();await legacy.close();}
 assert.deepEqual(errors,[]);console.log(process.env.REVERSE_V4_LEGACY_ONLY?'reverse-v4 legacy FN screenshots, completed pack and fixed Skill passed':'reverse-v4 browser 1440/390/320 flow, screenshots, clipboard, Skill and legacy passed');
}finally{await browser.close();}

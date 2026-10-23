import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {fixture} from './fixture.mjs';
import {createAiProcess} from '../server/reverse-ai-process.mjs';
import {seed} from '../src/store.js';
import {createSpecimen} from '../src/reverse-recipe.js';
import {axe,settle} from './ui-v14-checks.mjs';
const out=process.env.REVERSE_AI_SCREENSHOTS||'work/reverse490/ui',before=process.env.REVERSE_AI_BEFORE==='1';await fs.mkdir(out,{recursive:true});
const fake=fileURLToPath(new URL('./fake-ai.mjs',import.meta.url)),execute=createAiProcess({commands:Object.fromEntries(['codex','claude'].map(e=>[e,{command:process.execPath,prefix:[fake,e]}]))});
const browser=await chromium.launch(),errors=[];
const button=(p,name)=>p.getByRole('button',{name,exact:true});
async function shot(p,name){if(!name.startsWith('running-'))await p.locator('.toast').waitFor({state:'hidden',timeout:10000});if(!name.startsWith('menu-'))await p.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});await settle(p);await p.screenshot({path:join(out,name+'.png'),fullPage:!name.startsWith('menu-')});}
async function geometry(p){await settle(p);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);for(const c of await p.locator('.term button,.pack-versions select,.reverse-executor-menu button,.reverse-conclusions button').all()){if(!await c.isVisible())continue;const r=await c.boundingBox();assert.ok(r.width>=43.5&&r.height>=43.5,await c.textContent()+JSON.stringify(r));}}
try{for(const width of [1440,390,320]){
 let mode='success';const app=await fixture({reverse:{executeAi:async(e,options)=>{options.onLine('阶段 · 读取目标和证据');await delay(900,null,{signal:options.signal});return execute(e,{...options,prompt:mode});}}});let context;
 try{
  const path=join(app.directory,'fixture.asar');await fs.writeFile(path,'synthetic');const state=seed();state.assets=[];state.reverseRecords=[createSpecimen({type:'FN',title:'剪贴板逆推 · 合成小应用',target:{kind:'electron',path,feature:'复制与剪贴板怎样连接',clues:['copy'],authorized:true}})];await app.repository.write(state,{initialize:true});
  context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{window.copies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async s=>window.copies.push(s)}});});await p.route('**/*',r=>{assert.equal(new URL(r.request().url()).origin,new URL(app.url).origin);return r.continue();});
  await p.goto(app.url+'/#references');await p.locator('.term').waitFor();await shot(p,'pending-'+width);if(before)continue;assert.ok(await p.locator('.executor-trigger img').evaluate(e=>e.complete&&e.naturalWidth>0));
  let selector=button(p,'选择执行器：Codex');await selector.focus();await selector.press('ArrowDown');const menu=p.getByRole('menu',{name:'逆推执行器'});await menu.waitFor();assert.equal(await p.getByRole('menuitemradio',{name:'Codex',exact:true}).evaluate(e=>e===document.activeElement),true);await p.keyboard.press('End');assert.equal(await p.getByRole('menuitemradio',{name:/仅 REA/}).evaluate(e=>e===document.activeElement),true);await p.keyboard.press('Home');await p.keyboard.press('ArrowDown');await geometry(p);for(const img of await menu.locator('img').all())assert.ok(await img.evaluate(e=>e.complete&&e.naturalWidth>0));await shot(p,'menu-'+width);await p.keyboard.press('Escape');assert.equal(await selector.evaluate(e=>e===document.activeElement),true);
  await selector.click();await p.getByRole('menuitemradio',{name:'Claude Code',exact:true}).click();await button(p,'选择执行器：Claude Code').waitFor();await p.reload();await button(p,'选择执行器：Claude Code').waitFor();
  await button(p,'选择执行器：Claude Code').click();await p.getByRole('menuitemradio',{name:'Codex',exact:true}).click();await button(p,'选择执行器：Codex').waitFor();await button(p,'开始逆推').click();await button(p,'停止').waitFor();await shot(p,'running-'+width);await geometry(p);
  await p.locator('.term-state.done').waitFor();await p.getByRole('region',{name:'逆推结论'}).waitFor();await shot(p,'success-'+width);await geometry(p);assert.ok(await p.getByRole('heading',{name:'未知项',exact:true}).count());
  const firstPack=await p.getByTestId('replica-pack').textContent(),firstId=await p.getByLabel('任务包版本',{exact:true}).inputValue();await button(p,'复制任务包').click();assert.equal(await p.evaluate(()=>window.copies.at(-1)),firstPack);
  const evidence=p.locator('.reverse-conclusions').getByRole('button',{name:/查看完整证据/}).first();await evidence.click();await p.getByRole('dialog',{name:'完整证据 ID'}).waitFor();await p.keyboard.press('Escape');assert.equal(await evidence.evaluate(e=>e===document.activeElement),true);
  await button(p,'存成 Skill').click();await button(p,'确认保存').click();await p.getByRole('dialog',{name:'已存 Skill',exact:true}).waitFor();await button(p.getByRole('dialog'),'关闭').click();const saved=(await app.repository.read()).assets[0];
  mode='empty';await button(p,'选择执行器：Codex').click();await p.getByRole('menuitemradio',{name:'Claude Code',exact:true}).click();await button(p,'开始逆推').click();await button(p,'停止').waitFor();await p.locator('.term-state.done').waitFor();await p.waitForFunction(id=>document.querySelector('select[aria-label="任务包版本"]')?.value!==id,firstId);assert.notEqual(await p.getByTestId('replica-pack').textContent(),firstPack);await button(p,'存成 Skill').waitFor();assert.equal(await p.getByRole('heading',{name:'未知项',exact:true}).count(),0);
  await p.getByLabel('任务包版本',{exact:true}).selectOption(firstId);await button(p,'查看已存 Skill').waitFor();assert.equal(await p.getByTestId('replica-pack').textContent(),firstPack);await shot(p,'rollback-'+width);assert.deepEqual((await app.repository.read()).assets[0],saved);
  mode='invalid';await button(p,'开始逆推').click();await button(p,'停止').waitFor();await p.locator('.term-error').filter({hasText:'AI结果无效'}).waitFor();await shot(p,'failed-'+width);await geometry(p);assert.equal(await p.getByTestId('replica-pack').textContent(),firstPack);
  mode='success';await button(p,'开始逆推').click();await button(p,'停止').waitFor();await button(p,'停止').click();await p.getByText(/^已停止/).waitFor();assert.equal(await p.getByTestId('replica-pack').textContent(),firstPack);
  await axe(p,'AI reverse '+width);
 }finally{await context?.close();await app.close();}
}assert.deepEqual(errors,[]);console.log(before?'AI before 1440/390/320 captured':'AI 1440/390/320 menu keyboard/focus/44px/default/persistence, run/success/failure/stop, evidence, copy, Skill and version rollback passed');}finally{await browser.close();}

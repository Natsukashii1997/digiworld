import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {seed} from '../src/store.js';
import {createSpecimen} from '../src/reverse-recipe.js';
import {axe,settle} from './ui-v14-checks.mjs';
const before=process.env.REVERSE_REPAIR_BEFORE==='1';
const {fixture}=await import(before?'../work/reverse474/before/tests/fixture.mjs':'./fixture.mjs');
const {createReaProcess}=await import(before?'../work/reverse474/before/server/reverse-process.mjs':'../server/reverse-process.mjs');
const out=process.env.REVERSE_REPAIR_SCREENSHOTS||'work/reverse474/after-ui';await fs.mkdir(out,{recursive:true});
const execute=createReaProcess({command:process.execPath,prefix:[fileURLToPath(new URL('./fake-rea.mjs',import.meta.url)),...(before?['--doctor-bytes=100']:[])]});
const browser=await chromium.launch(),errors=[];
async function shot(p,name){await p.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await p.screenshot({path:join(out,name+'.png'),fullPage:!await p.getByRole('dialog').count()});}
async function geometry(p){await settle(p);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);for(const c of await p.locator('.term button,.term summary,[role="dialog"] button').all()){if(!await c.isVisible())continue;const b=await c.boundingBox();assert.ok(b.width>=43.5&&b.height>=43.5,await c.textContent());}await axe(p,'repair terminal');}
try{
 for(const width of [1440,390,320]){
  const app=await fixture({reverse:{execute},reaUpdate:{execute}});let context;
  try{
   const path=join(app.directory,'ui.asar');await fs.writeFile(path,'synthetic');const state=seed();state.reverseSettings={threshold:90,executor:"rea"};state.assets=[];state.reverseRecords=[createSpecimen({type:'FN',title:'剪贴板取证 · 合成小应用',target:{kind:'electron',path,feature:'复制与剪贴板怎样连接',clues:['copy','clipboard'],authorized:true}})];await app.repository.write(state,{initialize:true});
   context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
   await p.addInitScript(()=>{window.syntheticCopies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async s=>{if(window.copyFails)throw Error('合成剪贴板不可用');window.syntheticCopies.push(s);}}});});
   await p.route('**/*',r=>{assert.equal(new URL(r.request().url()).origin,new URL(app.url).origin);return r.continue();});
   await p.goto(app.url+'/#references');await p.getByRole('button',{name:'开始取证',exact:true}).click();await p.getByRole('button',{name:'停止',exact:true}).waitFor();
   if(!before)await p.getByText('解析源文件 2 / 3',{exact:true}).waitFor();
   await shot(p,'running-'+width);await p.locator('.term-state.done').waitFor();await shot(p,'completed-'+width);
   if(before)continue;
   const term=p.getByLabel('取证日志',{exact:true}),text=await term.innerText();assert.ok(text.includes('$ rea analyze-javascript-application "ui.asar"'));assert.ok(text.includes('seed=string:"copy"'));assert.ok(!text.includes('rea-agents@'));assert.ok(!text.includes('trace-0-input.json'));assert.ok(text.includes('模块 0 · JS 文件 3'));assert.equal(text.match(/解析源文件/g)?.length,1);assert.ok(text.includes('解析源文件 3 / 3'));
   const ev='ev_'+'a'.repeat(64),evidence=term.getByRole('button',{name:'查看完整证据 ID '+ev}).first();assert.equal(await evidence.textContent(),'ev_'+'a'.repeat(12));assert.equal(await evidence.getAttribute('title'),ev);assert.ok(!text.includes(ev));
   await evidence.focus();await evidence.press('Enter');const dialog=p.getByRole('dialog',{name:'完整证据 ID',exact:true});await dialog.waitFor();assert.equal(await dialog.locator('code').textContent(),ev);await shot(p,'evidence-'+width);await geometry(p);await p.evaluate(()=>window.copyFails=true);await dialog.getByRole('button',{name:'复制完整证据 ID'}).click();await dialog.getByRole('alert').getByText('合成剪贴板不可用').waitFor();await shot(p,'evidence-copy-failed-'+width);await p.evaluate(()=>window.copyFails=false);await dialog.getByRole('button',{name:'复制完整证据 ID'}).click();assert.equal(await dialog.getByRole('alert').count(),0);assert.equal(await p.evaluate(()=>window.syntheticCopies.at(-1)),ev);await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await evidence.evaluate(e=>e===document.activeElement),true);
   await p.locator('.term-details summary').click();await p.locator('.term-details pre').waitFor();const detail=await p.locator('.term-details pre').textContent();assert.ok(detail.includes('rea-agents@6.4.0'));assert.ok(detail.includes('trace-0-input.json'));await shot(p,'details-'+width);await geometry(p);await p.locator('.term-details summary').click();
   const pack=await p.getByTestId('replica-pack').textContent();assert.ok(pack.includes(ev));assert.ok(pack.includes('JS 文件 3'));await p.reload();await p.locator('.term-state.done').waitFor();assert.equal(await p.getByLabel('取证日志',{exact:true}).innerText(),text);
  }finally{await context?.close();await app.close();}
 }
 assert.deepEqual(errors,[]);console.log(before?'R2 baseline screenshots captured at 1440/390/320':'R1/R2 terminal 1440/390/320: large doctor, compact commands, live progress, full evidence keyboard/copy, argv details and refresh passed');
}finally{await browser.close();}

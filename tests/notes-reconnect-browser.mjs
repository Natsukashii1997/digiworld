import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const app=await fixture(),browser=await chromium.launch(),output=process.env.NOTES_RECONNECT_RESULTS;
const state=seed(),note={id:'reconnect-note',at:'2026-10-22T00:00:00Z',text:'已有便签正文保持',format:'md1',title:'连接恢复合成验证'};state.notes=[note];await app.repository.write(state,{initialize:true});
if(output)await mkdir(output,{recursive:true});const results=[];
async function open(records=[]){
 const context=await browser.newContext({viewport:{width:368,height:600},reducedMotion:'reduce'}),page=await context.newPage();
 await page.addInitScript(records=>{
  window.fixtureRecovery={version:1,rootIdentity:'a'.repeat(64),records};window.fixtureSaves=0;
  window.webkit={messageHandlers:{floatingNotes:{postMessage:async({action,value})=>{
   if(action==='loadDrafts')return structuredClone(window.fixtureRecovery);
   if(action==='saveDrafts'){window.fixtureSaves++;window.fixtureRecovery=structuredClone(value);return true;}
   if(action==='activateNote')return false;return true;
  }}}};
 },records);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));return {context,page,errors};
}
try{
 for(const delayed of [false,true,'identity']){
  const {context,page,errors}=await open(),writes=[];page.on('request',r=>{if(r.url().includes('/api/')&&!['GET','HEAD'].includes(r.method()))writes.push(r.method());});
  if(delayed==='identity'){const response=await fetch(app.url+'/api/session',{headers:{'X-Workbench-Client':'1'}});const value=await response.json();await page.route('**/api/session',r=>r.fulfill({json:{...value,dataRootIdentity:null}}));}else if(delayed)await page.route('**/api/session',r=>r.abort('failed'));
  await page.goto(app.url+'/?floatingNotes=1#/float');
  if(delayed==='identity')await page.getByRole('alert').waitFor();
  if(delayed){await page.getByRole('button',{name:'重试',exact:true}).waitFor();await page.unroute('**/api/session');await page.getByRole('button',{name:'重试',exact:true}).click();}
  await page.locator('[data-note-id="reconnect-note"]').waitFor();assert.equal(await page.getByRole('button',{name:'新建普通便签',exact:true}).isEnabled(),true);
  assert.match(await page.locator('.sn-body').innerText(),/已有便签正文保持/);assert.equal(await page.getByRole('button',{name:'重试',exact:true}).count(),0);
  assert.deepEqual(writes,[]);assert.equal(await page.evaluate(()=>window.fixtureSaves),0);assert.equal(await page.evaluate(()=>window.fixtureRecovery.rootIdentity),'a'.repeat(64));assert.deepEqual(errors,[]);
  if(output)await page.screenshot({path:join(output,delayed?'retry.png':'initial.png')});results.push({scenario:delayed==='identity'?'Retry refetches initially missing identity':delayed?'Retry after first connection fails':'old empty native recovery opens immediately',pass:true,noWrites:true});await context.close();
 }
 const record={...note,text:'未保存草稿不能串库',base:{text:note.text,format:'md1',title:note.title},dirty:true};
 const {context,page,errors}=await open([record]);let notesReads=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/notes')notesReads++;});await page.goto(app.url+'/?floatingNotes=1#/float');await page.getByRole('button',{name:'重试',exact:true}).waitFor();await page.getByRole('button',{name:'重试',exact:true}).click();assert.equal(await page.getByRole('button',{name:'新建普通便签',exact:true}).isEnabled(),false);assert.equal(notesReads,0);assert.deepEqual(await page.evaluate(()=>window.fixtureRecovery.records),[record]);assert.equal(await page.evaluate(()=>window.fixtureSaves),0);assert.deepEqual(errors,[]);await context.close();results.push({scenario:'nonempty draft refuses different root and stays intact',pass:true});
 assert.deepEqual((await app.repository.read()).notes,[note]);if(output)await writeFile(join(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await app.close();}

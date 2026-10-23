import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './fixture.mjs';
import {noteContent} from '../src/note-image-model.js';
import {seed} from '../src/store.js';
import {editor175,replace175} from './notes-editor-helpers175.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=await fixture(),browser=await chromium.launch(),output=process.env.FLOAT_NOTES_RESULTS;
const state=seed();state.notes=[];await app.repository.write(state,{initialize:true});
const {token}=await(await fetch(app.url+'/api/session',{headers:{'X-Workbench-Client':'1'}})).json();
const api=async(path,input)=>{const r=await fetch(app.url+'/api'+path,{method:input?'PUT':'GET',headers:{'X-Workbench-Token':token,'Content-Type':'application/json'},...(input?{body:JSON.stringify(input)}:{})});assert.equal(r.status,200);return r.json();};
const context=await browser.newContext({viewport:{width:368,height:600},reducedMotion:'reduce'}),p=await context.newPage(),errors=[];
p.on('pageerror',e=>errors.push(e.message));if(output)await mkdir(output,{recursive:true});
const shot=async name=>{if(output)await p.screenshot({path:join(output,name+'.png')});};
const until=async fn=>{for(let i=0;i<80;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}assert.fail('condition timed out');};
try{
 await p.goto(app.url+'/#/float');await p.getByText('还没有便签',{exact:true}).waitFor();assert.equal(await p.locator('.app-shell').count(),0);await shot('A-empty');
 await p.keyboard.press('Meta+n');await editor175(p).waitFor();await replace175(p,'合成自动保存中文便签');await p.waitForTimeout(400);
 const recovery=await p.evaluate(()=>JSON.parse(localStorage.getItem('floating-notes-recovery-v1')));assert.equal(recovery.records[0].text,'合成自动保存中文便签');await shot('D-new-draft');
 await until(async()=>(await api('/notes')).notes.some(n=>n.text==='合成自动保存中文便签'));await p.locator('.sn-state').getByText('已保存',{exact:true}).waitFor();assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('floating-notes-recovery-v1')).records.length),0);
 await p.keyboard.press('Meta+Enter');await editor175(p).waitFor({state:'detached'});await shot('B-saved');
 const note=(await api('/notes')).notes[0];await p.locator('[data-note-id="'+note.id+'"] .sn-body').click();await replace175(p,'我的不同版本');
 await api('/notes/'+note.id,{id:note.id,at:note.at,text:'别处的不同版本',format:'md1',base:noteContent(note)});
 await p.getByText('这条在数码世界里也改过了',{exact:true}).waitFor();assert.equal(await p.getByRole('toolbar').count(),0);await shot('I-conflict');
 await p.getByRole('button',{name:'两条都留',exact:true}).click();await p.getByRole('group',{name:'便签正文：我的不同版本',exact:true}).waitFor();await until(async()=>(await api('/notes')).notes.length===2);const kept=(await api('/notes')).notes;assert.equal(kept.length,2);assert.ok(kept.some(n=>n.text==='别处的不同版本'));assert.ok(kept.some(n=>n.text==='我的不同版本'));await p.getByRole('group',{name:'便签正文：别处的不同版本',exact:true}).waitFor();
 await shot('B-saved');
 let release;const held=new Promise(r=>release=r);await p.route('**/api/notes/*',async r=>{if(r.request().method()==='PUT')await held;await r.continue();});
 await p.keyboard.press('Meta+n');await replace175(p,'保存中仍能继续输入');await p.locator('.sn-state').getByText('保存中…',{exact:true}).waitFor();await shot('F-saving');await replace175(p,'慢保存期间的新字');release();await until(async()=>(await api('/notes')).notes.some(n=>n.text==='慢保存期间的新字'));await p.unroute('**/api/notes/*');assert.match(await editor175(p).innerText(),/慢保存期间的新字/);await p.keyboard.press('Meta+Enter');
 // Service rejects the write; a successful ID query proves it was not committed.
 await p.route('**/api/notes/*',async r=>{if(r.request().method()==='PUT')await r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'合成拒绝'})});else await r.continue();});
 await p.keyboard.press('Meta+n');await replace175(p,'关闭后仍保留的草稿');await p.getByText('没保存上，内容还在这里。',{exact:true}).waitFor();await shot('H-failed');
 await p.route('**/api/notes',r=>r.abort('failed'));await p.reload();await editor175(p).waitFor();assert.match(await editor175(p).innerText(),/关闭后仍保留的草稿/);await p.locator('.sn-state').getByText('草稿已留在本机',{exact:true}).waitFor();await shot('G-restored-draft');await p.unroute('**/api/notes');await p.unroute('**/api/notes/*'); // No focus/online event: the local service recovering must trigger bounded reconnect.
 await until(async()=>(await api('/notes')).notes.some(n=>n.text==='关闭后仍保留的草稿'));
 // Server commit precedes browser write-readback acceptance; finish the recovery scenario first.
 await p.locator('.sn-state').getByText('已保存',{exact:true}).waitFor();await until(async()=>!(await p.evaluate(()=>JSON.parse(localStorage.getItem('floating-notes-recovery-v1')).records)).length);
 await p.keyboard.press('Meta+Enter');await editor175(p).waitFor({state:'detached'});
 // Commit succeeds but both reply and follow-up GET are lost: retain ID, then query without a second PUT.
 await p.keyboard.press('Meta+n');await editor175(p).waitFor();const unknownId=await p.locator('.sn.is-edit').getAttribute('data-note-id');let puts=0;assert.ok(unknownId);const unknownRequests=[];let recoveredGet=false,recovering=false;const onUnknownRequest=request=>{if(new URL(request.url()).pathname==='/api/notes/'+unknownId)unknownRequests.push(request.method());};const onUnknownResponse=response=>{if(recovering&&new URL(response.url()).pathname==='/api/notes/'+unknownId&&response.request().method()==='GET'&&response.status()===200)recoveredGet=true;};p.on('request',onUnknownRequest);p.on('response',onUnknownResponse);
 await p.route('**/api/notes/*',async route=>{if(route.request().url().split('/').pop()!==unknownId){await route.continue();return;}if(route.request().method()==='PUT'){puts++;await route.fetch();await route.abort('failed');}else await route.abort('failed');});
 await replace175(p,'结果未知只查询同一个编号');await p.locator('.sn-state').getByText('正在核对是否已保存…',{exact:true}).waitFor();await shot('K-result-unknown');assert.equal(puts,1);assert.ok((await api('/notes/'+unknownId)).note);recovering=true;await p.unroute('**/api/notes/*');await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await p.locator('.sn-state').getByText('已保存',{exact:true}).waitFor();assert.equal((await api('/notes')).notes.filter(n=>n.text==='结果未知只查询同一个编号').length,1);assert.equal(unknownRequests.filter(method=>method==='PUT').length,1,'恢复完成前只提交一次PUT');assert.ok(recoveredGet,'恢复通过同一ID的成功GET确认');p.off('request',onUnknownRequest);p.off('response',onUnknownResponse);await p.keyboard.press('Meta+Enter');await editor175(p).waitFor({state:'detached'});
 const long='这是供测试使用的中文长段落，保留每一行输入并确保便签可以展开。\n'.repeat(25);await api('/notes/long-note',{id:'long-note',at:new Date().toISOString(),text:long,format:'md1',base:null});await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await p.locator('[data-note-id="long-note"]').waitFor();await shot('C-long-Chinese');await p.locator('[data-note-id="long-note"]').getByRole('button',{name:'展开全文'}).click();assert.equal(await p.locator('[data-note-id="long-note"] .fn-truncated').count(),0);
 await p.locator('[data-note-id="long-note"] .sn-body').click();await shot('E-long-edit-supplement');await p.keyboard.press('Escape');await p.getByRole('button',{name:'打开便签栏'}).waitFor();await p.getByRole('button',{name:'打开便签栏'}).click();assert.match(await editor175(p).innerText(),/这是供测试/);
 await p.keyboard.press('Meta+Enter');await editor175(p).waitFor({state:'detached'});await p.getByRole('group',{name:'便签正文：我的不同版本',exact:true}).click();await shot('E-edit-existing');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);console.log('PASS empty/new/edit/autosave/readback/conflict/keep-both/slow-save/recovery/long-Chinese/keyboard/no-overflow');
 // An existing float window holds recovery ownership. Closing it allows Retry in the second window.
 const duplicate=await context.newPage();await duplicate.goto(app.url+'/#/float');await duplicate.getByRole('alert').getByText('便签栏已在另一窗口打开，请在那里继续。',{exact:true}).waitFor();await p.close();await duplicate.getByRole('button',{name:'重试',exact:true}).click();await duplicate.getByRole('button',{name:'写一条'}).waitFor();await duplicate.close();console.log('PASS unknown-result query and duplicate-window lock retry');
 // Recovery was read before a failed first identity request; service recovery needs no focus event.
 const boot=await browser.newContext({viewport:{width:368,height:600}}),bp=await boot.newPage();
 await bp.addInitScript(value=>localStorage.setItem('floating-notes-recovery-v1',JSON.stringify(value)),{version:1,rootIdentity:recovery.rootIdentity,records:[{id:'boot-offline-note',at:new Date().toISOString(),text:'首次连接失败仍自动补存',format:'md1',base:null,dirty:true,phase:'draft'}]});
 await bp.route('**/api/session',r=>r.abort('failed'));await bp.goto(app.url+'/#/float');await editor175(bp).waitFor();assert.match(await editor175(bp).innerText(),/首次连接失败/);assert.equal((await api('/notes/boot-offline-note')).note,null);await bp.unroute('**/api/session');await until(async()=>(await api('/notes/boot-offline-note')).note?.text==='首次连接失败仍自动补存');await boot.close();console.log('PASS initial offline recovery reconnects without focus');
 // First connection unavailable, using a separate isolated browser profile.
 const offline=await browser.newContext({viewport:{width:368,height:600},reducedMotion:'reduce'}),q=await offline.newPage();await q.route('**/api/session',r=>r.abort('failed'));await q.goto(app.url+'/#/float');await q.getByText('数码世界还没有启动，写过的草稿都在本机',{exact:true}).waitFor();if(output)await q.screenshot({path:join(output,'J-service-unavailable.png')});await offline.close();console.log('PASS unavailable service state');
}finally{await browser.close();await app.close();}

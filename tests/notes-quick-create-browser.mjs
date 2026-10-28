import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
import {createNoteDoc,storedEditorContent} from '../src/note-document.js';
const out=process.env.NOTES_QUICK_RESULTS||'work/notes591/quick';await mkdir(out,{recursive:true});
const app=await fixture(),browser=await chromium.launch(),results=[];
const types=[['plain','普通便签','p'],['todo','待办事项','task'],['timeline','时间轴','timeline']];
const editor=p=>p.getByRole('textbox',{name:'随手记内容',exact:true});
const title=p=>p.getByRole('textbox',{name:'便签标题',exact:true});
async function stored(predicate){for(let i=0;i<60;i++){const notes=(await app.repository.read()).notes;if(predicate(notes))return notes;await new Promise(r=>setTimeout(r,100));}assert.fail('自动保存未回读到预期便签');}
async function run(name,fn){
 const initial=seed(),doc=createNoteDoc('plain');doc.lines[0].runs=[{text:'原有便签正文'}];initial.notes=[{id:'existing',at:'2026-10-20T00:00:00Z',...storedEditorContent(doc),title:'原有便签'}];
 const old=await app.repository.read();await app.repository.write({...initial,revision:old?.revision||0},{initialize:!old});
 const ctx=await browser.newContext({viewport:{width:368,height:760},reducedMotion:'reduce'}),p=await ctx.newPage(),errors=[];p.setDefaultTimeout(7000);p.on('pageerror',e=>errors.push(e.message));
 try{await fn(p,ctx);assert.deepEqual(errors,[]);results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});await p.screenshot({path:`${out}/${name}-failed.png`});}finally{await ctx.close();await writeFile(out+'/results.json',JSON.stringify(results,null,2));}
}
async function open(p){await p.goto(app.url+'/#/float');await p.locator('[data-note-id=existing]').waitFor();}
async function checkTitle(el,editing=false){const style=await el.evaluate(e=>({align:getComputedStyle(e).textAlign,weight:getComputedStyle(e).fontWeight,height:e.getBoundingClientRect().height}));assert.equal(style.align,'center');assert.equal(style.weight,'700');if(editing){assert.equal(style.height,32);const spacing=await el.evaluate(e=>({hostGap:getComputedStyle(e.parentElement).gap,titleGap:e.nextElementSibling.getBoundingClientRect().top-e.getBoundingClientRect().bottom}));assert.equal(spacing.hostGap,'8px','正文及工具栏原有间距保持');assert.equal(spacing.titleGap,4,'仅标题与正文间距缩小');}}
try{
 for(const [type,label,kind] of types)await run(type+'-create-save-reopen-title',async p=>{
  await open(p);await p.getByRole('button',{name:'新建'+label,exact:true}).click();await editor(p).waitFor();
  assert.equal(await editor(p).locator('.sn-line-'+kind).count(),1);await title(p).fill(label+'标题');await checkTitle(title(p),true);
  await (type==='plain'?editor(p):editor(p).locator('[data-note-text]')).click();await p.keyboard.insertText(label+'正文');
  if(type==='timeline')await p.getByLabel('事件时间',{exact:true}).fill('2026-10-22T09:00');
  const notes=await stored(ns=>ns.some(n=>n.title===label+'标题'&&n.text.includes(label+'正文'))),note=notes.find(n=>n.title===label+'标题');assert.equal(note.type,type);
  await p.keyboard.press('Meta+Enter');await editor(p).waitFor({state:'detached'});await p.getByRole('button',{name:'收起便签栏'}).click();await p.getByRole('button',{name:'打开便签栏'}).click();await p.reload();
  const card=p.locator(`[data-note-id="${note.id}"]`);await card.waitFor();await checkTitle(card.getByRole('heading',{name:label+'标题'}));assert.equal(await card.locator('.sn-line-'+kind).count(),1);
  if(type==='timeline')assert.equal(await card.locator('time[datetime="2026-10-22T09:00"]').count(),1);
  await card.getByRole('heading').click();await checkTitle(title(p),true);assert.equal(await title(p).inputValue(),label+'标题');
  await p.screenshot({path:`${out}/${type}-editing.png`});
 });
 await run('full-row-default-and-keyboard',async p=>{
  await open(p);assert.equal(await p.getByRole('combobox',{name:'新便签类型'}).count(),0);
  await p.getByRole('button',{name:'新建普通便签',exact:true}).click();await editor(p).waitFor();assert.equal(await editor(p).locator('.sn-line-p').count(),1);
  await title(p).fill('默认普通');await p.keyboard.press('Meta+Enter');await editor(p).waitFor({state:'detached'});await p.keyboard.press('Meta+n');await editor(p).waitFor();assert.equal(await editor(p).locator('.sn-line-p').count(),1);
  await title(p).fill('快捷普通');await stored(ns=>ns.some(n=>n.title==='快捷普通'&&n.type==='plain'));
 });
 await run('switch-keeps-current-draft',async p=>{
  await open(p);await p.getByRole('button',{name:'新建普通便签',exact:true}).click();await title(p).fill('切换前草稿');await editor(p).click();await p.keyboard.insertText('马上切换也保留');
  await p.getByRole('button',{name:'新建待办事项',exact:true}).click();await p.locator('.sn.is-edit .sn-line-task').waitFor();await title(p).fill('切换后待办');await stored(ns=>ns.some(n=>n.title==='切换前草稿'&&n.text==='马上切换也保留')&&ns.some(n=>n.title==='切换后待办'&&n.type==='todo'));
  await p.locator('.sn.is-edit .sn-state').filter({hasText:/^已保存$/}).waitFor();await p.reload();await p.getByRole('heading',{name:'切换前草稿'}).waitFor();await p.getByRole('heading',{name:'切换后待办'}).waitFor();
 });
 await run('invalid-time-keeps-editor',async p=>{
  await open(p);await p.getByRole('button',{name:'新建时间轴',exact:true}).click();await title(p).fill('日期待修正');const id=await p.locator('.sn.is-edit').getAttribute('data-note-id');await p.getByLabel('事件时间',{exact:true}).fill('');
  await p.getByRole('button',{name:'新建普通便签',exact:true}).click();assert.equal(await p.locator('.sn.is-edit').getAttribute('data-note-id'),id);assert.equal(await p.getByLabel('事件时间',{exact:true}).inputValue(),'');assert.ok((await p.getByRole('alert').allTextContents()).some(t=>t.includes('事件时间')));
  await p.getByLabel('事件时间',{exact:true}).fill('2026-10-22T10:00');await p.getByRole('button',{name:'新建普通便签',exact:true}).click();await p.locator('.sn.is-edit .sn-line-p').waitFor();await stored(ns=>ns.some(n=>n.title==='日期待修正'&&n.rich.lines[0].when==='2026-10-22T10:00'));
 });
 await run('confirmation-and-composition-protection',async p=>{
  await open(p);await p.locator('[data-note-id=existing]').getByRole('button',{name:'删除便签',exact:true}).click();await p.getByRole('alertdialog').waitFor();
  for(const [,label] of types)assert.equal(await p.getByRole('button',{name:'新建'+label,exact:true}).isDisabled(),true);
  await p.getByRole('button',{name:'取消',exact:true}).click();await p.getByRole('button',{name:'新建普通便签',exact:true}).click();await title(p).fill('中文草稿');const id=await p.locator('.sn.is-edit').getAttribute('data-note-id');
  await title(p).dispatchEvent('compositionstart');await p.getByRole('button',{name:'新建待办事项',exact:true}).click();assert.equal(await p.locator('.sn.is-edit').getAttribute('data-note-id'),id);await title(p).dispatchEvent('compositionend',{data:''});
 });
 await run('composition-started-while-switch-waits',async p=>{
  await p.addInitScript(()=>{window.webkit={messageHandlers:{floatingNotes:{postMessage:async({action})=>{if(action==='loadDrafts')return null;if(action==='activateNote')return false;if(action==='saveDrafts'&&window.pauseNextDraft){window.pauseNextDraft=false;await new Promise(resolve=>{window.resumeDraftSave=resolve;});window.draftReleaseFinished=true;}return true;}}}};});
  await open(p);await p.getByRole('button',{name:'新建普通便签',exact:true}).click();await title(p).fill('延迟中的中文草稿');await stored(ns=>ns.some(n=>n.title==='延迟中的中文草稿'));const id=await p.locator('.sn.is-edit').getAttribute('data-note-id');
  await p.evaluate(()=>{window.pauseNextDraft=true;});await p.getByRole('button',{name:'新建待办事项',exact:true}).click();await p.waitForFunction(()=>!!window.resumeDraftSave);await title(p).dispatchEvent('compositionstart');await p.evaluate(()=>window.resumeDraftSave());await p.waitForFunction(()=>window.draftReleaseFinished);await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await p.locator('.sn.is-edit').getAttribute('data-note-id'),id,'等待保存期间重新开始中文输入，不得切走编辑器');assert.equal(await title(p).inputValue(),'延迟中的中文草稿');await title(p).dispatchEvent('compositionend',{data:''});
 });
 await run('widths-and-read-title',async p=>{
  await open(p);for(const width of [320,368,430]){
   await p.setViewportSize({width,height:760});const geometry=await p.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};return {panel:box(document.querySelector('.fn-panel')),pad:box(document.querySelector('.fn-panel .sn-type-tiles')),tiles:[...document.querySelectorAll('.fn-panel .sn-type-tile')].map(box),card:box(document.querySelector('.sn')),controls:[...document.querySelectorAll('.fn-hd button')].map(box),overflow:document.documentElement.scrollWidth>innerWidth};});
   assert.equal(geometry.overflow,false);assert.ok(Math.abs(geometry.pad.w-geometry.card.w)<1);assert.ok(Math.abs(geometry.pad.x-geometry.card.x)<1);assert.equal(geometry.controls.length,2);for(const t of geometry.tiles){assert.ok(t.x>=geometry.panel.x&&t.right<=geometry.panel.right+.5);assert.ok(t.h>=44);}
   for(const b of geometry.controls){assert.ok(b.x>=geometry.panel.x&&b.right<=geometry.panel.right+.5);assert.ok(b.w>=44&&b.h>=44);}
   for(let i=0;i<geometry.controls.length;i++)for(let j=i+1;j<geometry.controls.length;j++){const a=geometry.controls[i],b=geometry.controls[j];assert.ok(Math.min(a.right,b.right)-Math.max(a.x,b.x)<=.5||Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)<=.5);}
   await checkTitle(p.getByRole('heading',{name:'原有便签',exact:true}));await p.screenshot({path:`${out}/bar-${width}.png`});
  }
  await p.getByRole('button',{name:'新建待办事项',exact:true}).focus();await p.keyboard.press('Enter');await p.locator('.sn.is-edit .sn-line-task').waitFor();
 });
}finally{await browser.close();await app.close();}
console.log(JSON.stringify(results));if(results.some(r=>!r.pass))process.exitCode=1;

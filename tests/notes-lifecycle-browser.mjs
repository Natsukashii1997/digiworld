import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
import {createNoteDoc,addTimelineEvent,storedEditorContent} from '../src/note-document.js';

const out=process.env.NOTES_LIFECYCLE_RESULTS||'work/notes585/lifecycle';
await mkdir(out,{recursive:true});
const app=await fixture(),initial=seed();
let timeline=addTimelineEvent(createNoteDoc('timeline'),'2026-10-20T09:00','时间轴正文');
initial.notes=[
 {id:'plain',at:'2026-10-20T00:00:00Z',type:'plain',title:'普通标题',text:'普通正文',format:'md1'},
 {id:'todo',at:'2026-10-20T00:00:00Z',type:'todo',title:'待办标题',text:'- [ ] 待办正文',format:'md1'},
 {id:'timeline',at:'2026-10-20T00:00:00Z',...storedEditorContent(timeline),title:'时间轴标题'},
];
await app.repository.write(initial,{initialize:true});
const browser=await chromium.launch(),results=[];
async function run(name,fn,{native=false}={}){
 const context=await browser.newContext({viewport:{width:1000,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
 if(native)await page.addInitScript(()=>{
  window.floatingNoteWindow={pinned:true};
  window.nativeCalls=[];
  window.webkit={messageHandlers:{floatingNotes:{async postMessage(message){
   window.nativeCalls.push(message);const key='native-draft-'+(new URLSearchParams(location.search).get('noteId')||'bar');
   if(message.action==='loadDrafts')return JSON.parse(localStorage.getItem(key)||'null');
   if(message.action==='saveDrafts'){localStorage.setItem(key,JSON.stringify(message.value));return true;}
   if(message.action==='activateNote')return true;
   return true;
  }}}};
 });
 try{await fn(page);assert.deepEqual(errors,[]);results.push({name,pass:true});}
 catch(e){results.push({name,pass:false,error:e.message,errors});await page.screenshot({path:out+'/'+name+'.png'});}
 finally{await context.close();await writeFile(out+'/results.json',JSON.stringify(results,null,2));}
}
const editor=p=>p.getByRole('textbox',{name:'随手记内容',exact:true});
const title=p=>p.getByRole('textbox',{name:'便签标题',exact:true});
const note=async id=>(await app.repository.read()).notes.find(n=>n.id===id);
async function stored(id,predicate){for(let i=0;i<50;i++){if(predicate(await note(id)))return;await new Promise(r=>setTimeout(r,100));}assert.ok(predicate(await note(id)),'保存后主库内容不符合预期');}
try{
 for(const type of ['plain','todo','timeline']){
  await run(type+'-wall-create-edit-reopen',async p=>{
   await p.goto(app.url+'/#notes');await p.getByRole('combobox',{name:'新便签类型'}).selectOption(type);await p.getByRole('button',{name:'记一条新念头',exact:true}).click();
   await title(p).fill(type+'新增');await (type==='plain'?editor(p):editor(p).locator('[data-note-text]').first()).click();await p.keyboard.insertText(type+'正文');
   if(type==='timeline')await p.getByLabel('事件时间',{exact:true}).fill('2026-10-22T10:00');
   await p.getByRole('button',{name:'贴上',exact:true}).click();await editor(p).waitFor({state:'detached'});
   const added=(await app.repository.read()).notes.find(n=>n.title===type+'新增');assert.equal(added.type,type);
   await p.reload();const card=p.locator(`[data-note-id="${added.id}"]`);await card.getByRole('heading',{name:type+'新增'}).click();
   await title(p).fill(type+'已编辑');await editor(p).locator('[data-note-text]').first().click();await p.keyboard.press('End');await p.keyboard.insertText('追加');
   if(type==='todo')await editor(p).getByRole('checkbox').check();
   if(type==='timeline')await p.getByLabel('事件时间',{exact:true}).fill('2026-10-19T08:30');
   await p.getByRole('button',{name:'保存修改',exact:true}).click();await editor(p).waitFor({state:'detached'});await p.reload();
   await card.getByRole('heading',{name:type+'已编辑'}).waitFor();assert.match((await note(added.id)).text,/追加/);
   if(type==='todo')assert.match((await note(added.id)).text,/- \[x\]/);
   if(type==='timeline')assert.equal((await note(added.id)).rich.lines[0].when,'2026-10-19T08:30');
  });
  await run(type+'-single-immediate-close-reopen',async p=>{
   await p.goto(app.url+`/?noteId=${type}#/float`);await title(p).fill(type+'单窗编辑');await editor(p).locator('[data-note-text]').first().click();await p.keyboard.press('End');await p.keyboard.insertText('单窗追加');
   const flushed=await p.evaluate(()=>window.floatingNotesHost.prepareCollapse());assert.equal(flushed.ok,true);
   await p.reload();await stored(type,n=>n.title===type+'单窗编辑'&&n.text.includes('单窗追加'));assert.equal(await title(p).inputValue(),type+'单窗编辑');
   assert.equal(await p.getByRole('button',{name:'置顶便签',exact:true}).count(),0);
   assert.equal(await p.getByRole('button',{name:'独立浮动便签',exact:true}).count(),0);
  },{native:true});
 }
 await run('single-readonly-checkbox',async p=>{
  await p.goto(app.url+'/?noteId=todo#/float');await title(p).waitFor();await p.getByRole('button',{name:'关闭便签窗口',exact:true}).focus();await p.keyboard.press('Meta+Enter');await editor(p).waitFor({state:'detached'});
  const before=await note('todo');await p.getByRole('checkbox').check();await stored('todo',n=>n.text!==before.text&&n.text.startsWith('- [x]'));
 },{native:true});
 await run('bar-handoff-releases-editor',async p=>{
  await p.goto(app.url+'/#/float');await p.locator('[data-note-id=plain]').getByRole('group').click();await editor(p).waitFor();
  const result=await p.evaluate(()=>window.floatingNotesHost.prepareNoteOpen('plain'));assert.equal(result.ok,true);await editor(p).waitFor({state:'detached'});
  const stored=await p.evaluate(()=>JSON.parse(localStorage.getItem('floating-notes-recovery-v1')));assert.equal(stored.records.length,0);
 });
 await run('handoff-new-composition-keeps-editor',async p=>{
  await p.goto(app.url+'/#/float');await p.locator('[data-note-id=plain]').getByRole('group').click();await editor(p).waitFor();
  let release,started;const held=new Promise(r=>release=r),saving=new Promise(r=>started=r);
  await p.route('**/api/notes/plain',async route=>{if(route.request().method()==='PUT'){started();await held;}await route.continue();});
  await title(p).fill('准备分窗');const opening=p.evaluate(()=>window.floatingNotesHost.prepareNoteOpen('plain'));
  await saving;await title(p).dispatchEvent('compositionstart',{data:''});release();assert.equal((await opening).ok,false);assert.equal(await editor(p).count(),1);
  await title(p).dispatchEvent('compositionend',{data:''});
 });
 await run('title-composition-close-protection',async p=>{
  await p.goto(app.url+'/?noteId=plain#/float');await title(p).dispatchEvent('compositionstart',{data:''});
  assert.deepEqual(await p.evaluate(()=>window.floatingNotesHost.prepareCollapse()),{ok:false,reason:'composition'});
  await title(p).fill('中文标题');await p.waitForTimeout(1200);assert.notEqual((await note('plain')).title,'中文标题');await title(p).dispatchEvent('compositionend',{data:'中文标题'});
  await stored('plain',n=>n.title==='中文标题');assert.equal((await p.evaluate(()=>window.floatingNotesHost.prepareCollapse())).ok,true);
 },{native:true});
 await run('timeline-invalid-date-outside',async p=>{
  await p.goto(app.url+'/#notes');await p.locator('[data-note-id=timeline]').getByRole('heading').click();await p.getByLabel('事件时间',{exact:true}).fill('');
  await p.getByRole('heading',{name:'随手记',exact:true}).click();assert.equal(await editor(p).count(),1);assert.ok((await p.getByRole('alert').allTextContents()).some(t=>t.includes('事件时间')));
  await p.getByLabel('事件时间',{exact:true}).fill('2026-10-18T10:00');await p.getByRole('button',{name:'保存修改'}).click();await stored('timeline',n=>n.rich.lines[0].when==='2026-10-18T10:00');
 });
 await run('remote-refresh-resets-undo',async p=>{
  await p.goto(app.url+'/?noteId=plain#/float');await editor(p).click();await p.keyboard.press('Meta+a');await p.keyboard.insertText('本窗已经保存');await stored('plain',n=>n.text==='本窗已经保存');
  const remote=await app.repository.read();remote.notes=remote.notes.map(n=>n.id==='plain'?{...n,text:'别处最新正文'}:n);await app.repository.write(remote,{expectedRevision:remote.revision});
  await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await p.waitForFunction(()=>document.querySelector('[aria-label="随手记内容"]')?.textContent.includes('别处最新正文'));
  await editor(p).click();await p.keyboard.press('Meta+z');assert.equal((await editor(p).innerText()).trim(),'别处最新正文');await p.waitForTimeout(1200);assert.equal((await note('plain')).text,'别处最新正文');
 });
 await run('pending-image-close-preserved',async p=>{
  await p.goto(app.url+'/?noteId=plain#/float');await editor(p).waitFor();
  let release;const held=new Promise(r=>release=r);await p.route('**/api/note-images',async route=>{await held;await route.continue();});
  await editor(p).evaluate(el=>{
   el.focus();const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;canvas.getContext('2d').fillRect(0,0,8,8);
   const data=new DataTransfer();data.items.add(new File([Uint8Array.from(atob(canvas.toDataURL().split(',')[1]),c=>c.charCodeAt(0))],'isolated.png',{type:'image/png'}));
   el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
  });
  await p.getByRole('status').filter({hasText:'正在保存图片'}).waitFor();const closed=p.evaluate(()=>window.floatingNotesHost.prepareCollapse());release();assert.equal((await closed).ok,true);
  await p.reload();await p.locator('img.sn-note-image').waitFor();assert.equal((await note('plain')).images.length,1);
 },{native:true});
}finally{await browser.close();await app.close();}
console.log(JSON.stringify(results,null,2));assert.ok(results.every(r=>r.pass),'便签生命周期回归失败');

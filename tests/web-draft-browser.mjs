import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
import {createNoteDoc,storedEditorContent} from '../src/note-document.js';
import {targetFixture} from './target-fixture.mjs';
import {openSettingsDrawer} from './settings-entry.mjs';
const openTarget=p=>openSettingsDrawer(p,'资产交付目标');
const browser=await chromium.launch(),results=[];
const editor=p=>p.getByRole('textbox',{name:'随手记内容',exact:true}),title=p=>p.getByRole('textbox',{name:'便签标题',exact:true});
async function run(name,fn,{target=false}={}){
 const app=target?await targetFixture():await fixture(),context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
 if(!target){const state=seed();state.notes=['plain','todo','timeline'].map(type=>({id:type,at:'2026-10-22T00:00:00Z',...storedEditorContent(createNoteDoc(type)),title:'原'+type,text:type==='plain'?'原正文':type==='todo'?'- [ ] 原正文':storedEditorContent(createNoteDoc(type)).text}));await app.repository.write(state,{initialize:true});}
 try{await fn(page,app,context);assert.deepEqual(errors,[]);results.push(name);console.log('PASS '+name);}finally{await context.close();await app.close();}
}
async function roundtrip(p,app){await p.getByRole('button',{name:'世界总览',exact:true}).click();await p.getByRole('button',{name:/^随手记 \d/}).click();await title(p).waitFor();await p.reload();await title(p).waitFor();}
try{
 for(const type of ['plain','todo','timeline'])await run(type+' raw draft navigation/reload/close',async(p,app,c)=>{
  await p.goto(app.url+'/#notes');await p.getByRole('button',{name:{plain:'新建普通便签',todo:'新建待办事项',timeline:'新建时间轴'}[type],exact:true}).click();await title(p).fill(type+'草稿');await editor(p).evaluate(el=>{el.focus();const r=document.createRange();r.selectNodeContents(el.querySelector('[data-note-text]'));r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);});await p.keyboard.insertText(type+'正文');
  if(type==='todo')await editor(p).getByRole('checkbox').check();if(type==='timeline')await p.getByLabel('事件时间',{exact:true}).fill('2026-10-25T10:30');
  await roundtrip(p,app);assert.equal(await title(p).inputValue(),type+'草稿');assert.match(await editor(p).innerText(),new RegExp(type+'正文'));
  if(type==='todo')assert.equal(await editor(p).getByRole('checkbox').isChecked(),true);if(type==='timeline')assert.equal(await p.getByLabel('事件时间').inputValue(),'2026-10-25T10:30');
  await p.close();const next=await c.newPage();await next.goto(app.url+'/#notes');await title(next).waitFor();assert.equal(await title(next).inputValue(),type+'草稿');assert.equal((await app.repository.read()).notes.length,3);
 });
 for(const committed of [false,true])await run('unknown saved='+committed+' retains desired and original ID',async(p,app)=>{
  await p.goto(app.url+'/#notes');await p.getByRole('button',{name:'新建普通便签',exact:true}).click();await title(p).fill('原保存');await editor(p).fill('第一版');
  const ids=[];let fail=true;
  await p.route('**/api/workspace',async r=>{if(r.request().method()==='PUT'){ids.push(r.request().postDataJSON().state.notes[0].id);if(fail){if(committed)await r.fetch();return r.fulfill({status:503,json:{error:'合成未知结果'}});}}await r.continue();});
  await p.getByRole('button',{name:'贴上',exact:true}).click();await p.getByRole('button',{name:'返回失败输入',exact:true}).click();await editor(p).fill('第二版待保存');
  await roundtrip(p,app);assert.match(await editor(p).innerText(),/第二版待保存/);assert.equal(ids.length,1,'恢复只能查询');
  fail=false;await p.getByRole('button',{name:'贴上',exact:true}).click();await editor(p).waitFor({state:'detached'});assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);assert.equal((await app.repository.read()).notes.filter(n=>n.id===ids[0]).length,1);assert.equal((await app.repository.read()).notes.find(n=>n.id===ids[0]).text,'第二版待保存');
 });
 await run('IME blocks navigation, dual window lock and takeover',async(p,app,c)=>{
  await p.goto(app.url+'/#notes');await p.getByRole('button',{name:'新建普通便签',exact:true}).click();await title(p).fill('原窗草稿');await title(p).dispatchEvent('compositionstart',{data:''});await p.getByRole('button',{name:'世界总览',exact:true}).click();assert.match(p.url(),/#notes/);await title(p).dispatchEvent('compositionend',{data:'草稿'});
  const second=await c.newPage();await second.goto(app.url+'/#notes');await second.getByText(/这个入口正在另一窗口编辑/).waitFor();assert.equal(await second.getByRole('button',{name:'新建普通便签',exact:true}).isDisabled(),true);
  await p.close();await second.reload();await title(second).waitFor();assert.equal(await title(second).inputValue(),'原窗草稿');
 });
 await run('quota failure keeps input and blocks navigation until next successful write',async(p,app)=>{
  await p.goto(app.url+'/#home');const input=p.getByRole('textbox',{name:'记一笔'});await input.fill('原草稿');await p.evaluate(()=>{window.saveStorage=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.includes('web-draft'))throw Error('quota');return window.saveStorage.call(this,k,v);};});await input.fill('容量不足的新草稿');await p.getByRole('button',{name:/^随手记 \d/}).click();assert.match(p.url(),/#home/);assert.equal(await input.inputValue(),'容量不足的新草稿');await p.evaluate(()=>Storage.prototype.setItem=window.saveStorage);await input.fill('容量恢复后的草稿');await p.getByRole('button',{name:/^随手记 \d/}).click();await p.getByRole('button',{name:'世界总览',exact:true}).click();await p.waitForFunction(()=>document.querySelector('[aria-label="记一笔"]')?.value==='容量恢复后的草稿');
 });
 await run('pending image blocks leave; completed image remains in local draft after reopen',async(p,app)=>{
  await p.goto(app.url+'/#notes');await p.getByRole('button',{name:'新建普通便签',exact:true}).click();await title(p).fill('图片草稿');await editor(p).fill('图片旁正文');
  let release;const wait=p.waitForRequest(r=>r.url().endsWith('/api/note-images'));
  await p.route('**/api/note-images',async r=>{await new Promise(resolve=>release=resolve);await r.continue();});
  await editor(p).evaluate(el=>{el.focus();const r=document.createRange();r.selectNodeContents(el.querySelector('[data-note-text]'));r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;canvas.getContext('2d').fillRect(0,0,8,8);const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));const data=new DataTransfer();data.items.add(new File([bytes],'synthetic.png',{type:'image/png'}));el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});
  await wait;await p.getByRole('button',{name:'世界总览',exact:true}).click();assert.match(p.url(),/#notes/);release();await editor(p).locator('img').waitFor();await roundtrip(p,app);await editor(p).locator('img').waitFor();assert.equal(await editor(p).locator('img').count(),1);assert.equal((await app.repository.read()).notes.length,3);
 });
 await run('restore query locks failed-input editing until original result is known',async(p,app)=>{
  await p.goto(app.url+'/#notes');await p.getByRole('button',{name:'新建普通便签',exact:true}).click();await title(p).fill('恢复锁');await editor(p).fill('待核对');let fail=true,hold=false,release;
  await p.route('**/api/workspace',async r=>{if(r.request().method()==='PUT'&&fail){await r.fetch();return r.fulfill({status:503,json:{error:'lost'}});}if(r.request().method()==='GET'&&hold){hold=false;await new Promise(resolve=>release=resolve);}await r.continue();});
  await p.getByRole('button',{name:'贴上',exact:true}).click();await p.getByRole('button',{name:'返回失败输入',exact:true}).waitFor();await p.getByRole('button',{name:'世界总览',exact:true}).click();hold=true;await p.getByRole('button',{name:/^随手记 \d/}).click();await p.waitForTimeout(150);assert.equal(await p.getByRole('button',{name:'返回失败输入',exact:true}).isDisabled(),true);release();await p.getByRole('button',{name:'返回失败输入',exact:true}).waitFor({state:'detached'});assert.equal((await app.repository.read()).notes.filter(n=>n.title==='恢复锁').length,1);
 });
 await run('target draft reopens but requires fresh inspection',async(p,app)=>{
  await p.goto(app.url+'/#settings');await openTarget(p);let panel=p.getByRole('region',{name:'管理目标',exact:true});await panel.getByRole('button',{name:'检查版本与目标',exact:true}).click();await panel.getByRole('button',{name:'添加目标',exact:true}).click();await panel.getByLabel('目标名称',{exact:true}).fill('未保存的目标');await panel.getByRole('combobox',{name:'程序入口',exact:true}).selectOption('fixture-cli');await panel.getByRole('combobox',{name:'Home / Profile',exact:true}).selectOption('fixture-default');
  await p.reload();await openTarget(p);panel=p.getByRole('region',{name:'管理目标',exact:true});await panel.getByLabel('目标名称',{exact:true}).waitFor();assert.equal(await panel.getByLabel('目标名称',{exact:true}).inputValue(),'未保存的目标');assert.equal(await panel.getByRole('button',{name:'保存目标',exact:true}).isDisabled(),true);await panel.getByRole('button',{name:'检查版本与目标',exact:true}).click();await p.waitForFunction(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='保存目标')?.disabled===false);
 },{target:true});
 await run('home pending recovery is single-flight and cannot clear a later draft',async(p,app)=>{
  await p.goto(app.url+'/#home');await p.getByRole('textbox',{name:'记一笔'}).fill('上次首页输入');let saved=false,failRead=false,hold=false,release;let gets=0;
  await p.route('**/api/workspace',async r=>{
   if(r.request().method()==='PUT'){await r.fetch();saved=true;failRead=true;return r.fulfill({status:503,json:{error:'lost'}});}
   if(r.request().method()==='GET'&&saved){gets++;if(failRead)return r.fulfill({status:503,json:{error:'offline'}});if(hold){hold=false;await new Promise(resolve=>release=resolve);}}
   await r.continue();
  });
  await p.getByRole('button',{name:'保存随手记',exact:true}).click();await p.getByRole('button',{name:'核对并重试随手记',exact:true}).waitFor();await p.getByRole('button',{name:/^随手记 \d/}).click();failRead=false;hold=true;await p.getByRole('button',{name:'世界总览',exact:true}).click();await p.waitForTimeout(150);assert.equal(await p.getByRole('button',{name:'核对并重试随手记',exact:true}).isDisabled(),true);release();await p.getByRole('button',{name:'保存随手记',exact:true}).waitFor();await p.getByRole('textbox',{name:'记一笔'}).fill('之后的新草稿');await p.waitForTimeout(100);assert.equal(await p.getByRole('textbox',{name:'记一笔'}).inputValue(),'之后的新草稿');assert.equal((await app.repository.read()).notes.filter(n=>n.text==='上次首页输入').length,1);
 });
 console.log('PASS F01 '+results.length+' scenarios');
}finally{await browser.close();}

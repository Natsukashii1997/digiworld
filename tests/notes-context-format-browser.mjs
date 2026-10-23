import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
import {createNoteDoc,addTimelineEvent,storedEditorContent} from '../src/note-document.js';

const out=process.env.NOTES_CONTEXT_RESULTS||'work/notes587/context';
await mkdir(out,{recursive:true});
const app=await fixture(),initial=seed(),results=[];
const texts=['字色重点保留','高亮重点保留','字号重点保留','加粗重点保留','编号条目','项目条目','完成条目'];
function makeNote(type,id){
 let doc=createNoteDoc(type);
 if(type==='timeline'){
  doc.lines=[];
  for(let i=0;i<texts.length;i++)doc=addTimelineEvent(doc,`2026-10-20T0${i+1}:00`,texts[i]);
 }else doc.lines=texts.map((text,i)=>({id:`line-${id}-${i}`,kind:type==='todo'?'task':'p',...(type==='todo'?{checked:false}:{}),runs:[{text}]}));
 return {id,at:'2026-10-20T00:00:00Z',...storedEditorContent(doc),title:id};
}
initial.notes=['wall','bar','single'].flatMap(mode=>['plain','todo','timeline'].map(type=>makeNote(type,`${mode}-${type}`)));
await app.repository.write(initial,{initialize:true});
const browser=await chromium.launch();
const editor=p=>p.getByRole('textbox',{name:'随手记内容',exact:true});
const note=async id=>(await app.repository.read()).notes.find(n=>n.id===id);
async function until(fn){for(let i=0;i<60;i++){if(await fn())return;await new Promise(r=>setTimeout(r,80));}assert.fail('持久化结果未达到预期');}
async function openEditor(p,mode,id){
 await p.goto(app.url+(mode==='wall'?'/#notes':mode==='bar'?'/#/float':`/?noteId=${id}#/float`));
 if(mode==='wall')await p.locator(`[data-note-id="${id}"]`).getByRole('heading',{name:id,exact:true}).click();
 if(mode==='bar')await p.locator(`[data-note-id="${id}"]`).getByRole('heading',{name:id,exact:true}).click();
 await editor(p).waitFor();
}
async function select(p,index,start=0,end=texts[index].length){
 const line=editor(p).locator('[data-note-text]').nth(index);
 await line.scrollIntoViewIfNeeded();
 return line.evaluate((el,{start,end})=>{
  const root=el.closest('[contenteditable]');root.focus();
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  const point=offset=>{for(const node of nodes){if(offset<=node.length)return [node,offset];offset-=node.length;}return [nodes.at(-1),nodes.at(-1).length];};
  const range=document.createRange();range.setStart(...point(start));range.setEnd(...point(end));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
  const box=range.getBoundingClientRect();return {x:box.x+Math.min(5,box.width/2),y:box.y+box.height/2};
 },{start,end});
}
async function action(p,index,category,choice,{partial=false}={}){
 const point=await select(p,index,partial?2:0,partial?4:texts[index].length);
 await p.mouse.click(point.x,point.y,{button:'right'});
 const menu=p.getByRole('menu',{name:'便签编辑菜单',exact:true});await menu.waitFor();
 await menu.getByRole('menuitem',{name:category,exact:false}).click();
 await menu.getByRole('button',{name:choice,exact:true}).click();await menu.waitFor({state:'detached'});
}
function assertStored(n,type){
 assert.equal(n.type,type);assert.ok(n.rich,'应保存富文本结构');const lines=n.rich.lines;
 for(const [i,key,value] of [[0,'color','#ff6b6b'],[1,'highlight','#fff19a'],[2,'size',24],[3,'bold',true]]){
  assert.deepEqual(lines[i].runs.map(r=>[r.text,r[key]]),[[texts[i].slice(0,2),undefined],['重点',value],[texts[i].slice(4),undefined]],`${type} ${key} 只作用于选区`);
 }
 assert.equal(type==='timeline'?lines[4].listKind:lines[4].kind,'ol');
 assert.equal(type==='timeline'?lines[5].listKind:lines[5].kind,'ul');
 assert.equal(type==='timeline'?lines[6].listKind:lines[6].kind,'task');assert.equal(lines[6].checked,true);
 if(type==='timeline')assert.deepEqual(lines.map(l=>l.when),texts.map((_,i)=>`2026-10-20T0${i+1}:00`));
}
async function assertDOM(p,type){
 const spans=i=>editor(p).locator('[data-note-text]').nth(i).locator('span').filter({hasText:'重点'});
 assert.equal(await spans(0).evaluate(el=>getComputedStyle(el).color),'rgb(255, 107, 107)');
 assert.equal(await spans(1).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 241, 154)');
 assert.equal(await spans(2).evaluate(el=>getComputedStyle(el).fontSize),'24px');
 assert.equal(await spans(3).evaluate(el=>getComputedStyle(el).fontWeight),'700');
 const line=i=>editor(p).locator('[data-note-line]').nth(i);
 assert.equal((await line(4).locator(type==='timeline'?'.sn-event-list-prefix':'.sn-prefix').innerText()).trim(),'1.');
 assert.equal((await line(5).locator(type==='timeline'?'.sn-event-list-prefix':'.sn-prefix').innerText()).trim(),'•');
 assert.equal(await line(6).getByRole('checkbox').isChecked(),true);
 if(type==='timeline')assert.equal(await editor(p).getByLabel('事件时间',{exact:true}).count(),7);
}
try{
 for(const mode of ['wall','bar','single'])for(const type of ['plain','todo','timeline']){
  const id=`${mode}-${type}`,context=await browser.newContext({viewport:{width:1200,height:1100},reducedMotion:'reduce'}),p=await context.newPage(),errors=[];
  p.setDefaultTimeout(6000);p.on('pageerror',e=>errors.push(e.message));
  try{
   await openEditor(p,mode,id);
   for(const [index,category,choice] of [[0,'字体颜色','#ff6b6b'],[1,'高亮','#fff19a'],[2,'字号','24'],[3,'格式','加粗']])await action(p,index,category,choice,{partial:true});
   await action(p,4,'列表','有序编号');await action(p,5,'列表','无序编号');
   if(type==='todo')await action(p,6,'列表','无序编号');
   await action(p,6,'列表','复选框');await editor(p).locator('[data-note-line]').nth(6).getByRole('checkbox').check();
   if(mode==='wall'){await p.getByRole('button',{name:'保存修改',exact:true}).click();await editor(p).waitFor({state:'detached'});}
   else assert.equal((await p.evaluate(()=>window.floatingNotesHost.prepareCollapse())).ok,true);
   await until(async()=>{try{assertStored(await note(id),type);return true;}catch{return false;}});
   const saved=await note(id);assertStored(saved,type);
   await p.goto('about:blank');await openEditor(p,mode,id);await assertDOM(p,type);assertStored(await note(id),type);
   // A second edit and save must not strip styles while reading back the editable DOM.
   await p.getByRole('textbox',{name:'便签标题',exact:true}).fill(id+'-重开');
   if(mode==='wall')await p.getByRole('button',{name:'保存修改',exact:true}).click();
   else assert.equal((await p.evaluate(()=>window.floatingNotesHost.prepareCollapse())).ok,true);
   await until(async()=>(await note(id)).title===id+'-重开');assertStored(await note(id),type);assert.deepEqual(errors,[]);
   results.push({name:id,pass:true,formats:7,selectionPreserved:true,reopened:true,resaved:true});
  }catch(e){results.push({name:id,pass:false,error:e.message,errors});await p.screenshot({path:`${out}/${id}.png`,fullPage:true});}
  finally{await context.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
 }
 for(const type of ['plain','todo','timeline']){
  const id=`single-${type}`,context=await browser.newContext({viewport:{width:1000,height:1100},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(6000);
  try{
   await openEditor(p,'single',id);
   // Reopened styled text must keep its formatting when inserting in the middle.
   for(let i=0;i<4;i++){
    await select(p,i,3,3);await p.keyboard.insertText('新');
   }
   assert.equal((await p.evaluate(()=>window.floatingNotesHost.prepareCollapse())).ok,true);
   await until(async()=>(await note(id)).text.includes('重 新点'.replace(' ','')));
   const saved=await note(id);
   for(const [i,key,value]of [[0,'color','#ff6b6b'],[1,'highlight','#fff19a'],[2,'size',24],[3,'bold',true]]){
    assert.equal(saved.rich.lines[i].runs.find(r=>r.text.includes('新'))?.[key],value,`${type}: 重开后新增文字继承${key}`);
   }
   results.push({name:`${type}-edit-inherits-saved-format`,pass:true});
  }catch(e){results.push({name:`${type}-edit-inherits-saved-format`,pass:false,error:e.message});}
  finally{await context.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
 }
}finally{await browser.close();await app.close();}
console.log(JSON.stringify(results,null,2));assert.ok(results.every(r=>r.pass),'右键格式保存回归失败');

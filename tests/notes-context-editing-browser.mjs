import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
import {createNoteDoc,storedEditorContent} from '../src/note-document.js';

const out=process.env.NOTES_CONTEXT_EDIT_RESULTS||'work/notes587/editing';
await mkdir(out,{recursive:true});
const app=await fixture(),state=seed(),style={color:'#ff6b6b',highlight:'#fff19a',size:24,bold:true},results=[];
state.notes=['plain','todo','timeline'].map(type=>{
 const doc=createNoteDoc(type);doc.lines[0].runs=[{text:'甲乙',...style}];
 return {id:type,at:'2026-10-20T00:00:00Z',...storedEditorContent(doc),title:type};
});
await app.repository.write(state,{initialize:true});const browser=await chromium.launch();
const body=p=>p.getByRole('textbox',{name:'随手记内容',exact:true});
async function caret(p,offset){
 await body(p).evaluate((el,offset)=>{
  el.focus();const walker=document.createTreeWalker(el.querySelector('[data-note-text]'),NodeFilter.SHOW_TEXT);let node;
  while(walker.nextNode()){node=walker.currentNode;if(offset<=node.length)break;offset-=node.length;}
  getSelection().setBaseAndExtent(node,offset,node,offset);
 },offset);
}
async function menu(p,category,choice){
 await body(p).dispatchEvent('contextmenu',{clientX:180,clientY:200});
 const m=p.getByRole('menu',{name:'便签编辑菜单'});await m.getByRole('menuitem',{name:category,exact:false}).click();
 if(choice)await m.getByRole('button',{name:choice,exact:true}).click();
}
async function save(p,type){
 await p.getByRole('button',{name:'保存修改',exact:true}).click();await body(p).waitFor({state:'detached'});
 return (await app.repository.read()).notes.find(n=>n.id===type);
}
async function open(p,type){
 await p.goto(app.url+'/#notes');await p.locator(`[data-note-id="${type}"]`).getByRole('heading',{name:type,exact:true}).click();await body(p).waitFor();
}
try{
 for(const type of ['plain','todo','timeline']){
  const context=await browser.newContext({viewport:{width:1200,height:1000}}),p=await context.newPage();p.setDefaultTimeout(5000);
  try{
   await open(p,type);await caret(p,1);await p.keyboard.insertText('新');await menu(p,'格式');await p.keyboard.press('Escape');
   assert.equal(await body(p).count(),1,'Esc应只关闭菜单，不退出编辑和丢弃内容');
   assert.equal(await p.getByRole('menu',{name:'便签编辑菜单'}).count(),0);assert.match(await body(p).innerText(),/甲新乙/);
   await save(p,type);results.push({name:type+'-escape-keeps-editor',pass:true});
  }catch(e){results.push({name:type+'-escape-keeps-editor',pass:false,error:e.message});}
  await context.close();
 }
 for(const type of ['plain','todo','timeline']){
  const context=await browser.newContext({viewport:{width:1200,height:1000}}),p=await context.newPage();p.setDefaultTimeout(5000);
  try{
   await open(p,type);await caret(p,1);
   await body(p).evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中'}));});
   await p.waitForFunction(()=>document.querySelector('[aria-label="随手记内容"]')?.textContent.includes('中'));
   let saved=await save(p,type);const inserted=saved.rich.lines[0].runs.find(r=>r.text.includes('中'));for(const [key,value]of Object.entries(style))assert.equal(inserted[key],value,'中文输入应继承'+key);
   await open(p,type);await caret(p,1);await menu(p,'格式','清除格式');await p.keyboard.insertText('清');
   saved=await save(p,type);const cleared=saved.rich.lines[0].runs.find(r=>r.text.includes('清'));for(const key of Object.keys(style))assert.equal(cleared[key],undefined,'显式清除格式应优先于继承');
   await open(p,type);const end=await body(p).locator('[data-note-text]').innerText();await caret(p,end.length);await p.keyboard.insertText('续');
   saved=await save(p,type);const resumed=saved.rich.lines[0].runs.find(r=>r.text.includes('续'));for(const [key,value]of Object.entries(style))assert.equal(resumed[key],value,'移动光标后应继承目标位置的'+key);
   results.push({name:type+'-ime-clear-move-format',pass:true});
  }catch(e){results.push({name:type+'-ime-clear-move-format',pass:false,error:e.message});}
  await context.close();
 }
}finally{await browser.close();await app.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));assert.ok(results.every(r=>r.pass),'右键菜单编辑保护失败');

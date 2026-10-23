import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
import {parseStoredNote,storedEditorContent} from '../src/note-document.js';

const output=process.env.NOTES_NUMBERING_RESULTS||'test-results/notes-numbering';await mkdir(output,{recursive:true});
const app=await fixture(),state=seed();state.notes=['plain','todo','timeline'].map(type=>{
 const doc=parseStoredNote({type,title:'编号复验 '+type,text:'1. 甲\n2. 乙\n3. 丙\n4. 丁',format:'md1'});
 if(type==='timeline'){doc.rich=true;doc.lines=doc.lines.map((l,i)=>({...l,kind:'timeline',listKind:'ol',when:`2026-10-2${i+1}T09:00` }));}
 return {id:'number-'+type,at:'2026-10-21T01:00:00.000Z',...storedEditorContent(doc)};
});await app.repository.write(state,{initialize:true});
const browser=await (process.env.NOTES_NUMBERING_ENGINE==='webkit'?webkit:chromium).launch().catch(async error=>{await app.close();throw error;});const results=[];
const editor=p=>p.getByRole('textbox',{name:'随手记内容',exact:true});
async function point(p,line,offset,endLine=line,endOffset=offset){
 await editor(p).evaluate((el,{line,offset,endLine,endOffset})=>{
  el.focus();const rows=el.querySelectorAll('[data-note-line]');
  const position=(index,n)=>{const root=rows[index].querySelector('[data-note-text]'),walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node,last;while(node=walk.nextNode()){last=node;if(n<=node.length)return[node,n];n-=node.length;}return last?[last,last.length]:[root,0];};
  const a=position(line,offset),b=position(endLine,endOffset);getSelection().setBaseAndExtent(a[0],a[1],b[0],b[1]);
 },{line,offset,endLine,endOffset});
}
async function shown(p,type){return editor(p).locator(type==='timeline'?'.sn-event-list-prefix':'.sn-prefix').allTextContents().then(v=>v.map(x=>Number(x.trim().replace('.',''))));}
async function expectNumbers(p,type,expected){assert.deepEqual(await shown(p,type),expected);}
async function saved(id,p){await p.locator('.sn-state').getByText('已保存',{exact:true}).waitFor();return (await app.repository.read()).notes.find(n=>n.id===id);}
try{
 for(const type of ['plain','todo','timeline']){
  if(process.env.NOTES_NUMBERING_CASE==='zero')continue;
  const p=await browser.newPage({viewport:{width:368,height:600},reducedMotion:'reduce'});p.setDefaultTimeout(7000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  try{
   const id='number-'+type;await p.goto(app.url+'/?noteId='+id+'#/float');await editor(p).waitFor();
   await point(p,0,1);await p.keyboard.press('Enter');await p.keyboard.insertText('插入');await p.keyboard.press('Enter');
   await expectNumbers(p,type,[1,2,3,4,5,6]);
   await p.keyboard.press('Meta+z');await expectNumbers(p,type,[1,2,3,4,5]);
   await p.keyboard.press('Meta+Shift+z');await expectNumbers(p,type,[1,2,3,4,5,6]);
   await point(p,2,0,3,0);await p.keyboard.press('Backspace');await expectNumbers(p,type,[1,2,3,4,5]);
   // Split the list with the existing format button, then join it again.
   await point(p,2,0);await p.getByRole('button',{name:'无序列表',exact:true}).click();
   const marks=await editor(p).locator(type==='timeline'?'.sn-event-list-prefix':'.sn-prefix').allTextContents();assert.deepEqual(marks.map(s=>s.trim()),['1.','2.','•','1.','2.']);
   await p.getByRole('button',{name:'有序列表',exact:true}).click();await expectNumbers(p,type,[1,2,3,4,5]);
   const before=await saved(id,p);await p.reload();await editor(p).waitFor();await expectNumbers(p,type,[1,2,3,4,5]);
   assert.deepEqual((await app.repository.read()).notes.find(n=>n.id===id),before,'reopen must not rewrite the note');
   await p.screenshot({path:join(output,type+'.png')});assert.deepEqual(errors,[]);
   results.push({type,pass:true,covered:['middle-enter','undo-redo','delete-empty-item','split-join','save-reopen']});
  }catch(error){results.push({type,pass:false,error:error.stack});}
  finally{await p.close();}
 }
 const p=await browser.newPage({viewport:{width:368,height:600}});p.setDefaultTimeout(7000);
 try{
  await p.goto(app.url+'/#/float');await p.getByRole('button',{name:'新建普通便签',exact:true}).click();await editor(p).waitFor();
  await editor(p).evaluate(el=>{el.focus();const data=new DataTransfer();data.setData('text/html','<ol start="0"><li value="0"><b>零</b></li><li>一</li></ol>');data.setData('text/plain','0. 零\n1. 一');el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});
  await expectNumbers(p,'plain',[0,1]);
  const id=await editor(p).evaluate(el=>el.closest('[data-note-id]').dataset.noteId);const note=await saved(id,p);
  assert.equal(note.text,'0. 零\n1. 一');assert.equal(note.rich.lines[0].runs[0].bold,true);
  results.push({type:'html-zero-start',pass:true});
 }catch(error){results.push({type:'html-zero-start',pass:false,error:error.stack});}finally{await p.close();}
 await writeFile(join(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));assert.ok(results.every(x=>x.pass));
}finally{await browser.close();await app.close();}

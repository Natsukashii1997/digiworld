import test from 'node:test';
import assert from 'node:assert/strict';
import {editNote} from '../server/notes.mjs';
import {parseStoredNote,storedEditorContent} from '../src/note-document.js';
import * as editing from '../src/note-document.js';

test('三类便签的独立标题和正文通过同条保存重开，旧记录原样保留',()=>{
 const old={id:'old',at:'2026-10-20T00:00:00.000Z',text:'原来第一行\n- [x] 原勾选',format:'md1',refined:{scrollId:'s',entryId:'e',at:'2026-10-20T00:00:00.000Z'}};
 let notes=[old];
 for(const type of ['plain','todo','timeline']){
  const note={id:type,at:old.at,type,title:'独立标题',text:type==='todo'?'- [ ] 写报告':'正文',format:'md1'};
  notes=editNote(notes,type,{...note,base:null});
  assert.deepEqual(storedEditorContent(parseStoredNote(notes.find(n=>n.id===type))),{text:note.text,format:'md1',type,title:'独立标题'});
 }
 assert.deepEqual(notes.find(n=>n.id==='old'),old);
 assert.throws(()=>editNote(notes,'plain',{id:'plain',type:'plain',title:'覆盖',text:'正文',format:'md1',base:{text:'正文',format:'md1',type:'plain',title:'错误起点'}}),/新内容/);
});

test('选区样式保存重开、列表变更不丢样式，时间轴按手动日期排序',()=>{
 let doc=parseStoredNote({type:'plain',title:'我的便签',text:'第一行\n第二行',format:'md1'});
 const selection=editing.docSelection(doc,{line:0,offset:0},{line:0,offset:2});
 assert.equal(typeof editing.applyEditorStyle,'function','编辑器须支持独立范围样式');
 doc=editing.applyEditorStyle(doc,selection,{bold:true,color:'#9e2538',highlight:'#fff19a',size:20}).doc;
 doc=editing.applyEditorList(doc,selection,'ol').doc;
 const saved=storedEditorContent(doc),reopened=parseStoredNote(saved);
 assert.equal(reopened.lines[0].runs[0].bold,true);
 assert.equal(reopened.lines[0].runs[0].highlight,'#fff19a');
 assert.equal(reopened.lines[0].runs[1].bold,undefined);
 assert.equal(reopened.lines[0].kind,'ol');
 assert.deepEqual(storedEditorContent(reopened),saved);
 const timeline=editing.createNoteDoc('timeline');
 const next=editing.addTimelineEvent(timeline,'2027-02-02T10:30','后发生');
 const sorted=editing.addTimelineEvent(next,'2026-01-01T08:30','先发生');
 assert.equal(sorted.lines[0].runs[0].text,'先发生');
 assert.equal(parseStoredNote(storedEditorContent(sorted)).lines[0].when,'2026-01-01T08:30');
});

test('旧长便签只改标题时正文不截断，新增超长正文仍拒绝',()=>{
 const old={id:'long-old',at:'2026-10-20T00:00:00Z',text:'长'.repeat(20001)};
 const doc=parseStoredNote(old);doc.meta={title:'补充标题',type:'plain'};
 const updated=storedEditorContent(doc);
 const result=editNote([old],old.id,{id:old.id,...updated,base:{text:old.text}})[0];
 assert.equal(result.text,old.text);assert.equal(result.title,'补充标题');
 assert.throws(()=>editNote([],'new-long',{id:'new-long',at:old.at,...updated,base:null}),/过长/);
});

test('旧字色便签可加粗并保存，保持旧标记含义',()=>{
 const old={id:'legacy',at:'2026-10-20T00:00:00Z',text:'[旧字]{red}'};
 let doc=parseStoredNote(old);doc=editing.applyEditorStyle(doc,editing.docSelection(doc,{line:0,offset:0},{line:0,offset:2}),{bold:true}).doc;
 const saved=storedEditorContent(doc);assert.equal(saved.format,'md1');
 const next=editNote([old],old.id,{id:old.id,...saved,base:{text:old.text}})[0];
 assert.equal(parseStoredNote(next).lines[0].runs[0].bold,true);
});

test('同样式逐字输入压缩存储；0号与清除字色保真',()=>{
 let doc=editing.createNoteDoc();doc={...doc,rich:true,lines:[{...doc.lines[0],runs:Array.from({length:8001},()=>({text:'字',bold:true}))}]};
 const saved=storedEditorContent(doc);assert.equal(saved.rich.lines[0].runs.length,1);assert.equal(saved.text.length,8001);
 let zero=parseStoredNote({text:'0. 零',format:'md1'});zero=editing.applyEditorStyle(zero,editing.docSelection(zero,{line:0,offset:0},{line:0,offset:1}),{bold:true}).doc;
 assert.equal(parseStoredNote(storedEditorContent(zero)).lines[0].number,0);
 let ink=parseStoredNote({text:'[红]{red}'});ink=editing.applyEditorStyle(ink,editing.docSelection(ink,{line:0,offset:0},{line:0,offset:1}),{color:null}).doc;
 assert.equal(ink.lines[0].runs[0].ink,undefined);
});

test('无图片富文本粘贴保留样式并通过同一保存校验',()=>{
 const into=editing.createNoteDoc(),from=editing.createNoteDoc();from.lines[0].runs=[{text:'加粗片段',bold:true}];
 const doc=editing.insertEditorDoc(into,editing.docSelection(into),from).doc;
 const saved=storedEditorContent(doc);assert.equal(saved.rich.lines[0].runs[0].bold,true);assert.equal(saved.images,undefined);
 assert.equal(editNote([],'paste',{id:'paste',at:'2026-10-20T00:00:00Z',...saved,base:null})[0].text,'加粗片段');
});

test('时间轴节点列表保留日期，切换与复制粘贴不会退化成普通行',()=>{
 let doc=editing.createNoteDoc('timeline');const when=doc.lines[0].when;doc.lines[0].runs=[{text:'节点任务'}];
 doc=editing.applyEditorList(doc,editing.docSelection(doc),'task').doc;doc=editing.toggleEditorTask(doc,0);
 let saved=storedEditorContent(doc),again=parseStoredNote(saved);assert.equal(again.lines[0].kind,'timeline');assert.equal(again.lines[0].listKind,'task');assert.equal(again.lines[0].when,when);assert.equal(again.lines[0].checked,true);
 const source=editing.createNoteDoc('todo');source.lines[0].runs=[{text:'粘贴任务'}];again=editing.insertEditorDoc(again,editing.docSelection(again),source).doc;
 assert.equal(again.lines[0].kind,'timeline');assert.equal(storedEditorContent(again).rich.lines[0].when,when);
 const unordered=editing.setTimelineTime(again,0,'2027-01-01T12:00',{sort:false});assert.equal(storedEditorContent(unordered).rich.lines[0].when,'2027-01-01T12:00');
});

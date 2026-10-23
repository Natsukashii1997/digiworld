import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStoredNote,docSelection,replaceEditorText,visibleLine,storedEditorContent,deleteEditorText,applyEditorList,insertEditorDoc,setTimelineTime} from '../src/note-document.js';
import {noteClipboard} from '../src/note-clipboard.js';

const list=(type='plain',start=1)=>{
 const doc=parseStoredNote({text:['甲','乙','丙','丁'].map((s,i)=>`${start+i}. ${s}`).join('\n'),format:'md1',type});
 if(type==='timeline'){
  doc.rich=true;doc.lines=doc.lines.map((line,i)=>({...line,kind:'timeline',listKind:'ol',when:`2026-10-2${i+1}T09:00`,runs:[{text:visibleLine(line),bold:true,color:'#ff6b6b'}]}));
 }
 return doc;
};
const numbers=doc=>doc.lines.filter(l=>l.kind==='ol'||l.listKind==='ol').map(l=>l.number);

test('有序列表中间回车插入两项后，后续编号顺延且保存重开一致',()=>{
 let doc=parseStoredNote({text:'1. 原第一项\n2. 原第二项\n3. 原第三项\n4. 原第四项',format:'md1'});
 let result=replaceEditorText(doc,docSelection(doc,{line:0,offset:visibleLine(doc.lines[0]).length}),'\n新项目\n');
 doc=result.doc;
 assert.deepEqual(doc.lines.map(l=>l.number),[1,2,3,4,5,6]);
 const reopened=parseStoredNote(storedEditorContent(doc));
 assert.deepEqual(reopened.lines.map(l=>l.number),[1,2,3,4,5,6]);
 assert.equal(reopened.lines.map(visibleLine).join('\n'),'原第一项\n新项目\n\n原第二项\n原第三项\n原第四项');
});

for(const type of ['plain','todo','timeline']){
 test(`${type}中间插入与整项删除按顺序重排，正文/样式/日期不丢`,()=>{
  const original=list(type),initial=structuredClone(original);
  let result=replaceEditorText(original,docSelection(original,{line:0,offset:1}),'\n插入');
  assert.deepEqual(numbers(result.doc),[1,2,3,4,5]);
  const edited=deleteEditorText(result.doc,docSelection(result.doc,{line:1,offset:0},{line:2,offset:0})).doc;
  assert.deepEqual(numbers(edited),[1,2,3,4]);assert.deepEqual(edited.lines.map(visibleLine),['甲','乙','丙','丁']);
  assert.deepEqual(original,initial,'editing must not mutate the previous undo entry');
  const saved=storedEditorContent(result.doc),reopened=parseStoredNote(saved);
  assert.deepEqual(numbers(reopened),[1,2,3,4,5]);
  if(type==='timeline'){
   assert.deepEqual(reopened.lines.map(l=>l.when),[original.lines[0].when,...original.lines.map(l=>l.when)]);
   assert.equal(reopened.lines[2].runs[0].bold,true);assert.equal(reopened.lines[2].runs[0].color,'#ff6b6b');
  }
 });
 test(`${type}切换中项为无序后后半段重新编号，切回有序后合并连续`,()=>{
  let doc=list(type);doc=applyEditorList(doc,docSelection(doc,{line:1,offset:0}),'ul').doc;
  assert.deepEqual(numbers(doc),[1,1,2]);
  doc=applyEditorList(doc,docSelection(doc,{line:1,offset:0}),'ol').doc;
  assert.deepEqual(numbers(doc),[1,2,3,4]);
  doc=applyEditorList(doc,docSelection(doc,{line:1,offset:0}),'task').doc;
  assert.deepEqual(numbers(doc),[1,1,2]);
 });
 test(`${type}粘贴多行有序片段嵌入列表，后续顺延且复制一致`,()=>{
  const doc=list(type),incoming=parseStoredNote({text:'7. 粘贴甲\n9. 粘贴乙',format:'md1'});
  const next=insertEditorDoc(doc,docSelection(doc,{line:1,offset:0}),incoming).doc;
  assert.deepEqual(numbers(next),[1,2,3,4,5]);
  const copy=noteClipboard(next);assert.deepEqual([...copy.plain.matchAll(/(?:^|\n)(?:\d{4}-[^\n]+? )?(\d+)\. /g)].map(m=>Number(m[1])),[1,2,3,4,5]);
  assert.deepEqual(numbers(parseStoredNote(storedEditorContent(next))),[1,2,3,4,5]);
 });
}

test('删除首项或中间换行后编号收拢，空项Enter退出列表不会制造跳号',()=>{
 let doc=list();doc=deleteEditorText(doc,docSelection(doc,{line:0,offset:0},{line:1,offset:0})).doc;
 assert.deepEqual(numbers(doc),[1,2,3]);assert.deepEqual(doc.lines.map(visibleLine),['乙','丙','丁']);
 doc=deleteEditorText(doc,docSelection(doc,{line:0,offset:1}),false).doc;
 assert.deepEqual(numbers(doc),[1,2]);assert.deepEqual(doc.lines.map(visibleLine),['乙丙','丁']);
 const entered=replaceEditorText(doc,docSelection(doc,{line:0,offset:2}),'\n');
 doc=replaceEditorText(entered.doc,entered.selection,'\n').doc;
 assert.deepEqual(doc.lines.map(l=>l.kind),['ol','p','ol']);assert.deepEqual(numbers(doc),[1,1]);
});

test('显式0/7起始序号保留，仅调整受影响列表，读取/复制/纯文本编辑不迁移旧编号',()=>{
 for(const start of [0,7]){
  const doc=list('plain',start),next=replaceEditorText(doc,docSelection(doc,{line:0,offset:1}),'\n新增').doc;
  assert.deepEqual(numbers(next),Array.from({length:5},(_,i)=>start+i));
 }
 const raw='7. 甲\n9. 乙\n隔开\n1. 丙\n2. 丁',doc=parseStoredNote({text:raw,format:'md1'});
 assert.equal(storedEditorContent(doc).text,raw);assert.equal(noteClipboard(doc).plain,raw);
 assert.equal(storedEditorContent(replaceEditorText(doc,docSelection(doc,{line:0,offset:1}),'字').doc).text,raw.replace('甲','甲字'));
 const next=replaceEditorText(doc,docSelection(doc,{line:3,offset:1}),'\n新增').doc;
 assert.deepEqual(numbers(next),[7,9,1,2,3]);
});

test('时间轴日期重排和保存时排序同步编号，日期与文字一起移动',()=>{
 let doc=list('timeline');doc=setTimelineTime(doc,0,'2026-10-25T09:00');
 assert.deepEqual(doc.lines.map(visibleLine),['乙','丙','丁','甲']);assert.deepEqual(numbers(doc),[1,2,3,4]);
 doc=setTimelineTime(doc,3,'2026-10-20T09:00',{sort:false});
 const saved=parseStoredNote(storedEditorContent(doc));assert.deepEqual(saved.lines.map(visibleLine),['甲','乙','丙','丁']);assert.deepEqual(numbers(saved),[1,2,3,4]);
});

test('已有重复编号在列表结构变动时自动修正，超过9999则整次拒绝而不截断',()=>{
 const doc=parseStoredNote({text:'1. 甲\n2. 乙\n3. 新\n2. 丙\n3. 丁\n4. 尾',format:'md1'});
 const next=replaceEditorText(doc,docSelection(doc,{line:2,offset:1}),'\n新增').doc;assert.deepEqual(numbers(next),[1,2,3,4,5,6,7]);
 const limit=parseStoredNote({text:'9998. 甲\n9999. 乙',format:'md1'}),before=storedEditorContent(limit);
 assert.throws(()=>replaceEditorText(limit,docSelection(limit,{line:0,offset:1}),'\n新增'),/9999/);assert.deepEqual(storedEditorContent(limit),before);
});

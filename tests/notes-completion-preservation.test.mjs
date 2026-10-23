import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStoredNote,storedEditorContent,applyEditorList,docSelection,insertEditorDoc} from '../src/note-document.js';

test('已完成任务与普通段落一起转复选框时保留已有完成态',()=>{
 const doc=parseStoredNote({type:'todo',text:'- [x] 已完成\n普通段落',format:'md1'});
 const next=applyEditorList(doc,docSelection(doc,{line:0,offset:0},{line:1,offset:4}),'task').doc;
 assert.equal(next.lines[0].checked,true);assert.equal(next.lines[1].checked,false);
 assert.equal(parseStoredNote(storedEditorContent(next)).lines[0].checked,true);
});
test('粘贴普通富文本到已完成的时间轴任务不移除复选框和完成态',()=>{
 const doc=parseStoredNote({type:'timeline',text:'2026-10-20T10:00 - [x] 已完成',format:'md1',rich:{version:1,lines:[{kind:'timeline',when:'2026-10-20T10:00',listKind:'task',checked:true,runs:[{text:'已完成'}]}]}});
 const incoming=parseStoredNote({text:'补充',format:'md1'}),next=insertEditorDoc(doc,docSelection(doc,{line:0,offset:3}),incoming).doc;
 assert.equal(next.lines[0].listKind,'task');assert.equal(next.lines[0].checked,true);assert.equal(next.lines[0].when,'2026-10-20T10:00');
 assert.equal(parseStoredNote(storedEditorContent(next)).lines[0].checked,true);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {webDraftKey,openDraftRecord} from '../src/web-draft.js';
import {emptyNotesDraft,validNotesDraft} from '../src/note-drafts.js';
import {createNoteDoc,storedEditorContent,parseStoredNote} from '../src/note-document.js';
const memory=()=>{const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test('draft scopes isolate data roots and retain raw documents without normalizing old numbering',()=>{
 const storage=memory(),a=webDraftKey('a'.repeat(64),'notes'),b=webDraftKey('b'.repeat(64),'notes');
 const value=emptyNotesDraft();value.draft=parseStoredNote({text:'3. 第一项\n8. 第二项',format:'md1',title:'草稿'});value.editing='new';
 const record=openDraftRecord(storage,a,validNotesDraft);record.save(value);record.close();
 assert.deepEqual(openDraftRecord(storage,a,validNotesDraft).read(),value);
 assert.equal(openDraftRecord(storage,b,validNotesDraft).read(),null);
 assert.equal(storedEditorContent(value.draft).text,'3. 第一项\n8. 第二项');
});
test('draft readback errors do not erase the previous saved snapshot',()=>{
 const storage=memory(),key=webDraftKey('a'.repeat(64),'home'),record=openDraftRecord(storage,key);
 record.save({text:'原稿',attempt:null});storage.setItem=()=>{throw Error('quota');};
 assert.throws(()=>record.save({text:'新输入'}),/保留窗口/);assert.equal(openDraftRecord(storage,key).read().text,'原稿');
});
test('closed or stale owners cannot clear a newer draft',()=>{
 const storage=memory(),key=webDraftKey('a'.repeat(64),'home'),first=openDraftRecord(storage,key);first.save({text:'A'});
 const second=openDraftRecord(storage,key);second.save({text:'B'});
 assert.throws(()=>first.save({text:''}),/别处变化/);first.close();assert.throws(()=>first.save({text:''}),/页面已关闭/);
 assert.equal(openDraftRecord(storage,key).read().text,'B');
});
test('invalid drafts remain untouched and all three editor forms survive a round trip',()=>{
 const storage=memory(),key=webDraftKey('a'.repeat(64),'notes');storage.setItem(key,'{broken');
 assert.throws(()=>openDraftRecord(storage,key),/原内容已保留/);assert.equal(storage.getItem(key),'{broken');storage.removeItem(key);
 for(const type of ['plain','todo','timeline']){const value=emptyNotesDraft();value.newType=type;value.draft=createNoteDoc(type);value.newDrafts[type]=value.draft;const record=openDraftRecord(storage,key,validNotesDraft);record.save(value);assert.deepEqual(openDraftRecord(storage,key,validNotesDraft).read(),value);}
 assert.throws(()=>webDraftKey(null,'notes'),/无法核验/);
});

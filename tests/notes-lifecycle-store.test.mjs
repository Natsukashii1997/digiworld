import test from 'node:test';
import assert from 'node:assert/strict';
import {createFloatingNotes} from '../src/floating-notes-store.js';
import {editNote} from '../server/notes.mjs';
import {createNoteDoc,addTimelineEvent,storedEditorContent,parseStoredNote,applyEditorStyle,docSelection} from '../src/note-document.js';
import {noteContent} from '../src/note-image-model.js';
for(const type of ['plain','todo','timeline'])test(type+'全字段草稿恢复、并发冲突与回包丢失确认',async()=>{
 let doc=type==='timeline'?addTimelineEvent(createNoteDoc(type),'2026-10-20T10:00','节点'):parseStoredNote({type,text:type==='todo'?'- [x] 完成项':'正文',format:'md1'});
 doc.meta.title='初始标题';doc=applyEditorStyle(doc,docSelection(doc,{line:0,offset:0},{line:0,offset:2}),{bold:true}).doc;
 const base={id:'one',at:'2026-10-20T00:00:00Z',...storedEditorContent(doc)};
 let notes=[base],disk=null,puts=0,lose=false;
 const storage={load:async()=>structuredClone(disk),save:async v=>{disk=structuredClone(v);}};
 const api=async(path,value)=>{
  if(path==='/notes')return {notes:structuredClone(notes)};
  const id=path.split('/').at(-1);
  if(value){puts++;try{notes=editNote(notes,id,value);}catch(e){throw Object.assign(e,{noteConflict:true,currentNote:notes.find(n=>n.id===id)});}if(lose)throw Error('reply lost');}
  return {note:structuredClone(notes.find(n=>n.id===id)||null)};
 };
 const make=()=>createFloatingNotes({api,storage,identity:async()=>({dataRootIdentity:'a'.repeat(64)}),newId:()=>type+'-fork'});
 const first=make();await first.init();first.begin(base);first.change('one',{...noteContent(base),title:'未保存标题'});await first.persist();
 const reopened=make();await reopened.init();assert.equal(reopened.snapshot().records.one.title,'未保存标题');assert.deepEqual(reopened.snapshot().records.one.rich,base.rich);
 notes=[{...base,title:'其他窗口标题'}];await reopened.save('one');assert.equal(reopened.snapshot().records.one.phase,'conflict');
 lose=true;const count=puts;await reopened.keepBoth('one');assert.equal(puts,count+1);assert.equal(notes.length,2);assert.equal(disk.records.length,0);
 assert.deepEqual(noteContent(notes.find(n=>n.id===type+'-fork')),{...noteContent(base),title:'未保存标题'});assert.equal(notes.find(n=>n.id==='one').title,'其他窗口标题');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {notePaper} from '../src/note-paper.js';
import {parseStoredNote} from '../src/note-document.js';

test('white-text papers stay stable through content, format and ordering changes without mutating notes',()=>{
 const notes=Array.from({length:20},(_,i)=>({id:'synthetic-paper-'+i,text:'白字便签'})),before=structuredClone(notes),papers=new Map(notes.map(n=>[n.id,notePaper(n.id,parseStoredNote(n))]));
 assert.equal(new Set(papers.values()).size,5);
 for(const n of [...notes].reverse()){
  assert.equal(notePaper(n.id,parseStoredNote({...n,text:'更新白字正文\n1. 列表',format:'md1'})),papers.get(n.id));
  assert.ok(['red','blue','green','yellow','gray'].includes(papers.get(n.id)));
 }
 assert.deepEqual(notes,before);
});
test('existing first-ink papers and legacy ink are preserved',()=>{
 for(const color of ['red','blue','green','yellow','gray']){
  assert.equal(notePaper('same-id',parseStoredNote({format:'md1',text:`普通字\n[字色]{${color}}\n[后续]{red}`})),color);
  assert.equal(notePaper('same-id',parseStoredNote({text:`[旧字色]{${color}}`})),color);
 }
});

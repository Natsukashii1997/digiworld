import {createNoteDoc,boundedDoc} from './note-document.js';
import {validNoteMeta} from './note-types.js';
export function emptyNotesDraft(){return {newType:'plain',editing:null,draft:createNoteDoc(),newDraft:createNoteDoc(),newDrafts:{},editBase:null,failure:null};}
function validDoc(doc){
 if(!doc||!Array.isArray(doc.lines)||!doc.lines.length||!validNoteMeta(doc.meta||{}))return false;
 if(!['plain','md1'].includes(doc.mode)||doc.lines.some(l=>!['p','ul','ol','task','timeline'].includes(l.kind)||!Array.isArray(l.runs)))return false;
 try{boundedDoc(doc);return true;}catch{return false;}
}
export function validNotesDraft(value){
 if(!value||!['plain','todo','timeline'].includes(value.newType)||!(value.editing===null||typeof value.editing==='string')||!validDoc(value.draft)||!validDoc(value.newDraft)||!value.newDrafts||Object.keys(value.newDrafts).some(k=>!['plain','todo','timeline'].includes(k))||!Object.values(value.newDrafts).every(validDoc))return false;
 if(value.editBase&&!(typeof value.editBase.id==='string'&&typeof value.editBase.text==='string'))return false;
 const f=value.failure;
 return !f||(['new','edit'].includes(f.kind)&&typeof f.id==='string'&&f.note?.id===f.id&&typeof f.note.text==='string'&&validDoc(f.doc)&&(!f.desired||validDoc(f.desired)));
}

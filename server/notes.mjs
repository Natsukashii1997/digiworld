import {validNoteRich} from '../src/note-rich.js';
import { failure } from './repository.mjs';
import {noteContent,validNoteImages} from '../src/note-image-model.js';
import { NOTE_MAX } from '../src/rich-note.js';
import {validNoteMeta,hasNoteContent} from '../src/note-types.js';
const ID=/^[a-zA-Z0-9_-]{1,100}$/;
const CONTROL=/[\x00-\x08\x0b-\x1f\x7f]/;
const sameContent=(a,b)=>JSON.stringify(noteContent(a))===JSON.stringify(noteContent(b));
export function noteId(id){if(typeof id!=='string'||!ID.test(id))throw failure('便签编号无效');return id;}
export function deleteNote(notes,id,input){
 noteId(id);
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='base')||!input.base||typeof input.base!=='object'||Array.isArray(input.base)||typeof input.base.text!=='string'||!validNoteMeta(input.base)||!validNoteRich(input.base)||!validNoteImages(input.base.images))throw failure('缺少删除前的便签内容');
 const current=notes.find(n=>n.id===id);
 if(!current)return notes;
 if(!sameContent(current,input.base))throw Object.assign(failure('便签已在别处修改，请核对后再删除',409),{noteConflict:true,currentNote:current});
 return notes.filter(n=>n.id!==id);
}
export function editNote(notes,id,input){
 noteId(id);
 const current=notes.find(n=>n.id===id);
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['id','text','at','format','images','base','type','title','rich'].includes(k))||input.id!==id)throw failure('便签提交包含不支持的字段');
 if(!validNoteMeta(input)||!validNoteRich(input))throw failure('便签类型或标题无效');
 if(typeof input.text!=='string'||(input.base===null&&!hasNoteContent(input))||(input.text.length>NOTE_MAX&&!(current?.text===input.text&&input.text.length<=1000000&&!input.format&&!input.rich))||CONTROL.test(input.text))throw failure('便签正文为空、过长或包含控制字符');
 if(!validNoteImages(input.images))throw failure('图片引用无效');
 if(input.format!==undefined&&input.format!=='md1')throw failure('便签格式无效');
 if(input.base!==null&&(!input.base||typeof input.base!=='object'||Array.isArray(input.base)||Object.keys(input.base).some(k=>!['text','format','images','type','title','rich'].includes(k))||!validNoteMeta(input.base)||!validNoteRich(input.base)||!validNoteImages(input.base.images)||typeof input.base.text!=='string'||input.base.text.length>1000000||(input.base.format!==undefined&&input.base.format!=='md1')))throw failure('缺少编辑起点');
 // A lost reply is reconciled with the same identity and content, before comparing the edit base.
 if(current&&sameContent(current,input))return notes;
 if(input.base===null){
  if(current)throw Object.assign(failure('这条便签在别处有不同内容',409),{noteConflict:true,currentNote:current});
  if(typeof input.at!=='string'||input.at.length>40||!Number.isFinite(Date.parse(input.at)))throw failure('便签时间无效');
  return [{id,at:input.at,...noteContent(input)},...notes];
 }
 if(!current||!sameContent(current,input.base))throw Object.assign(failure('这条便签在别处有新内容',409),{noteConflict:true,currentNote:current||null});
 const updated={...current,...noteContent(input)};for(const key of ['type','title','rich'])if(input[key]===undefined)delete updated[key];if(!input.images?.length)delete updated.images;
 if(input.format)updated.format=input.format;else delete updated.format;
 return notes.map(n=>n.id===id?updated:n);
}
// 阶段 2：归档是孵化去向之一。只改 archivedAt；已是目标状态时原样返回（重放不推进版本）。
export function archiveNote(notes,id,input,at){
 noteId(id);
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='archived')||typeof input.archived!=='boolean')throw failure('归档请求无效');
 const current=notes.find(n=>n.id===id);
 if(!current)throw failure('便签不存在或已删除',404);
 if(input.archived===(current.archivedAt!==undefined))return notes;
 return notes.map(n=>{if(n.id!==id)return n;const {archivedAt,...rest}=n;return input.archived?{...rest,archivedAt:at}:rest;});
}

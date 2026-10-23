import {NOTE_IMAGE_ID,IMAGE_CHAR,imageMarker,validNoteImages} from './note-image-model.js';
export const STYLE_KEYS=['bold','italic','underline','strike','color','highlight','size'];
export const TEXT_COLORS=['#e9eeff','#ff6b6b','#6fb0ff','#a6e36e','#ffd166','#c4a7e7','#8b98b8','#263238'];
export const HIGHLIGHTS=['#fff19a','#c5edf7','#ffd4dc','#cfecc7','#e0d4fa'];
const inkColors={red:'#a62f3a',blue:'#245e9e',green:'#296b3b',yellow:'#865c10',gray:'#65717a'};
export const validHex=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,allowed)=>object(value)&&Object.keys(value).every(k=>allowed.includes(k));
export function validWhen(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return false;
 const date=new Date(value+'Z');return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,16)===value;
}
export function richText(rich){
 return rich.lines.map(line=>{
  const listPrefix={p:'',ul:'- ',ol:`${line.number??1}. `,task:`- [${line.checked?'x':' '}] `}[line.listKind||'p'];
  const prefix={p:'',ul:'- ',ol:`${line.number??1}. `,task:`- [${line.checked?'x':' '}] `,timeline:line.when?`${line.when} ${listPrefix}`:''}[line.kind];
  return prefix+line.runs.map(run=>run.imageId?imageMarker(run.imageId):run.ink?run.text.split(/([\[\]])/).map(t=>!t||t==='['||t===']'?t:`[${t}]{${run.ink}}`).join(''):run.text).join('');
 }).join('\n');
}
export function validNoteRich(note){
 if(note?.rich===undefined)return true;
 const r=note.rich;
 if(!keys(r,['version','lines'])||r.version!==1||!Array.isArray(r.lines)||!r.lines.length||r.lines.length>2000||!validNoteImages(note.images))return false;
 let runs=0;const ids=new Set();
 for(const line of r.lines){
  if(!keys(line,['id','kind','number','checked','when','listKind','runs'])||!['p','ul','ol','task','timeline'].includes(line.kind)||!Array.isArray(line.runs)||!line.runs.length)return false;
  if(line.id!==undefined&&(typeof line.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(line.id)))return false;
  if(line.id!==undefined){if(ids.has(line.id))return false;ids.add(line.id);}
  if(line.listKind!==undefined&&(line.kind!=='timeline'||!['p','ul','ol','task'].includes(line.listKind)))return false;
  if(line.number!==undefined&&(!Number.isInteger(line.number)||line.number<0||line.number>9999))return false;
  if(line.checked!==undefined&&typeof line.checked!=='boolean')return false;
  if(line.when!==undefined&&!validWhen(line.when)||line.kind==='timeline'&&!validWhen(line.when))return false;
  for(const run of line.runs){
   if(++runs>8000||!keys(run,['text','ink','imageId',...STYLE_KEYS])||typeof run.text!=='string'||/[\n\r\x00-\x08\x0b-\x1f\x7f]/.test(run.text))return false;
   if(run.ink!=null&&!Object.hasOwn(inkColors,run.ink))return false;
   if(run.imageId!==undefined&&(!NOTE_IMAGE_ID.test(run.imageId)||run.text!==IMAGE_CHAR||!note.images?.includes(run.imageId)))return false;
   if(['bold','italic','underline','strike'].some(k=>run[k]!==undefined&&typeof run[k]!=='boolean'))return false;
   if(['color','highlight'].some(k=>run[k]!==undefined&&!validHex(run[k])))return false;
   if(run.size!==undefined&&![12,14,16,18,20,24,28,32].includes(run.size))return false;
  }
 }
 return JSON.stringify(r).length<=180000&&note.text===richText(r)&&note.format==='md1';
}
function compactRuns(runs){
 const result=[];
 for(const run of runs.length?runs:[{text:''}]){
  const next=Object.fromEntries(['text','ink','imageId',...STYLE_KEYS].filter(k=>run[k]!==undefined&&run[k]!==null).map(k=>[k,run[k]]));
  const previous=result.at(-1),sameStyle=previous&&!previous.imageId&&!next.imageId&&['ink',...STYLE_KEYS].every(k=>previous[k]===next[k]);
  if(sameStyle)previous.text+=next.text;else result.push(next);
 }
 return result;
}
export function richOf(doc){
 return {version:1,lines:doc.lines.map(l=>({
  id:l.id,kind:l.kind,...((l.kind==='ol'||l.listKind==='ol')?{number:l.number}:{}),...((l.kind==='task'||l.listKind==='task')?{checked:!!l.checked}:{}),
  ...(l.kind==='timeline'?{when:l.when,...(l.listKind?{listKind:l.listKind}:{})}:{}),runs:compactRuns(l.runs)
 }))};
}
export const needsRich=doc=>!!doc.rich||doc.lines.some(l=>l.kind==='timeline'||l.runs.some(r=>STYLE_KEYS.some(k=>r[k]!==undefined)));
export function runStyle(run){
 return {color:run.color||inkColors[run.ink],backgroundColor:run.highlight,fontSize:run.size?`${run.size}px`:undefined,fontWeight:run.bold?700:undefined,fontStyle:run.italic?'italic':undefined,textDecoration:[run.underline?'underline':'',run.strike?'line-through':''].filter(Boolean).join(' ')||undefined};
}

// md1↔受限行文档。来源仅内存，未改行逐字返回；不规范化旧前缀/空行。
import { INKS, NOTE_MAX } from './rich-note.js';
const colors = new Set(INKS.map(([key])=>key));
let sequence = 0;
const identity = () => `line-${++sequence}`;
const semantic = l => JSON.stringify([l.kind,l.number,l.checked,l.runs.map(r=>[r.text,r.ink||null])]);
const textOf = l => l.runs.map(r=>r.text).join('');
export const visibleLine = textOf;
// 旧便签可能存有嵌套字色 [[文字]{blue}其余]{red}：由内向外展开为相邻片段，内层颜色优先。
// 只用于显示与编辑起点；未改动的行仍按原文写回。
const markPattern = /\[([^[\]\n]+)\]\{(red|blue|green|yellow|gray)\}/;
function inkRuns(body) {
  const marks=[];let text=body,m;
  while ((m=markPattern.exec(text))) { marks.push({content:m[1],ink:m[2],raw:m[0]}); text=text.slice(0,m.index)+`\uE000${marks.length-1}\uE001`+text.slice(m.index+m[0].length); }
  const runs=[];
  const expand=(part,ink,top)=>{for (const piece of part.split(/(\uE000\d+\uE001)/)) {
    if (!piece) continue;
    const ref=/^\uE000(\d+)\uE001$/.exec(piece);
    if (!ref) { runs.push({text:piece,ink}); continue; }
    const mark=marks[ref[1]];
    if (top && !mark.content.includes('\uE000')) runs.push({text:mark.content,ink:mark.ink,raw:mark.raw}); else expand(mark.content,mark.ink,false);
  }};
  expand(text,null,true);
  return runs.length?runs:[{text:'',ink:null}];
}
export function parseEditorDoc(text, format = undefined) {
  const rich = format === 'md1' || format === 'legacy-ink';
  if (typeof text !== 'string' || text.length > (rich?NOTE_MAX:1000000)) throw Error('随手记长度超出对应格式上限');
  const mode = rich ? 'md1' : 'plain';
  return { mode, lines: text.split('\n').map(raw=> {
    let kind='p',prefix='',body=raw,number=1,checked=false,m;
    if (format==='md1') {
      if ((m=/^(- \[( |x|X)\] ?)(.*)$/.exec(raw))) { kind='task';prefix=m[1];body=m[3];checked=m[2]!==' '; }
      else if ((m=/^([-*] )(.*)$/.exec(raw))) { kind='ul';prefix=m[1];body=m[2]; }
      else if ((m=/^(\d{1,4}\. )(.*)$/.exec(raw))) { kind='ol';prefix=m[1];body=m[2];number=Number.parseInt(prefix); }
    }
    const runs=mode==='md1'?inkRuns(body):[{text:body,ink:null}];
    const line={ id:identity(),kind,number,checked,runs };
    line.source={raw,prefix,kind,number,checked,semantic:semantic(line)};
    return line;
  }) };
}
// 旧便签曾直接保存字色标记而没有format。只恢复其行内字色，
// 不把旧纯文的列表前缀重新解释，也不在读取时迁移或写回原文。
export function parseStoredNote(note) {
  const text=note?.text||'';
  const legacy=note?.format==null && text.length<=NOTE_MAX && /\[[^[\]\n]+\]\{(?:red|blue|green|yellow|gray)\}/.test(text);
  const doc=parseEditorDoc(text,legacy?'legacy-ink':note?.format);
  if(legacy)doc.legacyInk=true;
  return doc;
}
function prefixOf(line) {
  const old=line.source;
  if (old && line.kind===old.kind && (line.kind!=='ol'||line.number===old.number) && (line.kind!=='task'||line.checked===old.checked)) return old.prefix;
  if (old && line.kind==='task' && old.kind==='task') return old.prefix.replace(/^(- \[)[ xX](\] ?)$/, '$1'+(line.checked?'x':' ')+'$2');
  return ({p:'',ul:'- ',ol:`${line.number||1}. `,task:`- [${line.checked?'x':' '}] `})[line.kind];
}
export function serializeEditorDoc(doc) {
  return doc.lines.map(l=> {
    if (l.source?.semantic===semantic(l)) return l.source.raw;
    const body=l.runs.map(r=> {
      if (!r.ink || !colors.has(r.ink)) return r.text;
      if (r.raw && new RegExp('^\\[([^\\[\\]\\n]+)\\]\\{'+r.ink+'\\}$').exec(r.raw)?.[1]===r.text) return r.raw;
      // 协议无转义：方括号保持文字，仅可表示子段着色。
      return r.text.split(/([\[\]])/).map(t=>!t||t==='['||t===']'?t:`[${t}]{${r.ink}}`).join('');
    }).join('');
    return prefixOf(l)+body;
  }).join('\n');
}
export function boundedDoc(doc) {
  const value=serializeEditorDoc(doc);
  if (doc.lines.some(l=>l.kind==='ol'&&(!Number.isInteger(l.number)||l.number<0||l.number>9999))) throw Error('有序编号上限9999，可切换段落后继续');
  if (value.length>NOTE_MAX) throw Error('单条随手记最多20000字（含格式标记）');
  if (/[\x00-\x08\x0b-\x1f\x7f]/.test(value)) throw Error('正文含不支持的控制字符');
  return doc;
}
export function docSelection(doc, anchor={line:0,offset:0}, focus=anchor) {
  const point=p=> {const line=Math.max(0,Math.min(doc.lines.length-1,p.line)),text=textOf(doc.lines[line]);let offset=Math.max(0,Math.min(text.length,p.offset));if(offset>0&&/[\uD800-\uDBFF]/.test(text[offset-1])&&/[\uDC00-\uDFFF]/.test(text[offset]))offset--;return {line,offset};};
  const a=point(anchor),f=point(focus),forward=a.line<f.line||a.line===f.line&&a.offset<=f.offset;
  return {anchor:a,focus:f,start:forward?a:f,end:forward?f:a,collapsed:a.line===f.line&&a.offset===f.offset};
}
function slices(runs,start,end=Infinity) {
  const result=[];let index=0;
  for(const run of runs) {const next=index+run.text.length,lo=Math.max(start,index),hi=Math.min(end,next);if(hi>lo)result.push({...run,text:run.text.slice(lo-index,hi-index),raw:lo===index&&hi===next?run.raw:undefined});index=next;}
  return result;
}
const plainRuns=(text,ink)=>text ? text.split(/([\[\]])/).filter(Boolean).map(t=>({text:t,ink:t==='['||t===']'?null:ink||null})) : [];
export function replaceEditorText(doc,selection,text,ink=null,{shortcut=false}={}) {
  const sel=docSelection(doc,selection.anchor,selection.focus),a=doc.lines[sel.start.line],b=doc.lines[sel.end.line];
  if (text==='\n' && sel.collapsed && textOf(a)==='' && a.kind!=='p') {
    const lines=doc.lines.map((l,i)=>i===sel.start.line?{...l,kind:'p',source:undefined}:l),next={...doc,lines};
    return {doc:boundedDoc(next),selection:docSelection(next,{line:sel.start.line,offset:0}),typingInk:ink};
  }
  const segments=String(text).split('\n'),before=slices(a.runs,0,sel.start.offset),after=slices(b.runs,sel.end.offset);
  const made=segments.map((seg,i)=>({...a,id:i===0?a.id:identity(),runs:[...(i===0?before:[]),...plainRuns(seg,ink),...(i===segments.length-1?after:[])],source:i===0?a.source:undefined,number:a.kind==='ol'?a.number+i:a.number,checked:i===0?a.checked:false}));
  const lines=[...doc.lines.slice(0,sel.start.line),...made,...doc.lines.slice(sel.end.line+1)];
  const point={line:sel.start.line+made.length-1,offset:segments.length===1?sel.start.offset+segments[0].length:segments.at(-1).length};
  let next={...doc,mode:ink?'md1':doc.mode,lines};
  if(shortcut && sel.collapsed && made.length===1 && a.kind==='p' && text===' ' && textOf(made[0])==='1. ' && point.offset===3) {
    lines[sel.start.line]={...made[0],kind:'ol',number:1,runs:[],source:undefined};next={...doc,mode:'md1',lines};point.offset=0;
  }
  return {doc:boundedDoc(next),selection:docSelection(next,point),typingInk:ink};
}
export function applyEditorInk(doc,selection,requested,currentTypingInk=null) {
  if(!colors.has(requested))throw Error('不支持的字色');
  const sel=docSelection(doc,selection.anchor,selection.focus);
  if(sel.collapsed)return {doc,selection:sel,typingInk:currentTypingInk===requested?null:requested};
  const covered=doc.lines.flatMap((line,i)=> i<sel.start.line||i>sel.end.line?[]:slices(line.runs,i===sel.start.line?sel.start.offset:0,i===sel.end.line?sel.end.offset:Infinity));
  const representable=covered.filter(r=>r.text.replace(/[\[\]]/g,''));
  const ink=representable.length && representable.every(r=>r.ink===requested)?null:requested;
  const lines=doc.lines.map((l,i)=> {
    if(i<sel.start.line||i>sel.end.line)return l;
    const lo=i===sel.start.line?sel.start.offset:0,end=i===sel.end.line?sel.end.offset:textOf(l).length;
    return {...l,runs:[...slices(l.runs,0,lo),...slices(l.runs,lo,end).flatMap(r=>plainRuns(r.text,ink)),...slices(l.runs,end)]};
  });
  return {doc:boundedDoc({...doc,mode:'md1',lines}),selection:sel,typingInk:ink};
}
export function applyEditorList(doc,selection,kind) {
  if(!['ul','ol','task'].includes(kind))throw Error('不支持的列表');
  const sel=docSelection(doc,selection.anchor,selection.focus),end=sel.end.offset===0&&sel.end.line>sel.start.line?sel.end.line-1:sel.end.line;
  const off=doc.lines.slice(sel.start.line,end+1).every(l=>l.kind===kind);
  const lines=doc.lines.map((l,i)=>i<sel.start.line||i>end?l:{...l,kind:off?'p':kind,number:i-sel.start.line+1,checked:false,source:undefined});
  return {doc:boundedDoc({...doc,mode:'md1',lines}),selection:sel};
}
export function toggleEditorTask(doc,index) {
  if(doc.lines[index]?.kind!=='task')return doc;
  const lines=doc.lines.map((l,i)=>i===index?{...l,checked:!l.checked}:l);
  return boundedDoc({...doc,lines});
}
export function deleteEditorText(doc,selection,backward=true,typingInk=null) {
  const retain = result => ({...result,typingInk});
  let sel=docSelection(doc,selection.anchor,selection.focus);
  if(!sel.collapsed)return retain(replaceEditorText(doc,sel,''));
  const p={...sel.start},line=doc.lines[p.line],value=textOf(line);
  const segments=[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(value)];
  const inside=segments.find(x=>p.offset>x.index&&p.offset<x.index+x.segment.length);
  if(backward && p.offset===0 && line.kind!=='p') {
    const lines=doc.lines.map((l,i)=>i===p.line?{...l,kind:'p',source:undefined}:l),next={...doc,lines};
    return retain({doc:boundedDoc(next),selection:docSelection(next,p)});
  }
  let other={...p};
  if(inside){p.offset=backward?inside.index+inside.segment.length:inside.index;other.offset=backward?inside.index:inside.index+inside.segment.length;return retain(replaceEditorText(doc,docSelection(doc,p,other),''));}
  if(backward) {
    if(p.offset>0) {const points=[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(value)].map(x=>x.index);other.offset=points.filter(x=>x<p.offset).at(-1)??0;}
    else if(p.line>0)other={line:p.line-1,offset:textOf(doc.lines[p.line-1]).length};else return retain({doc,selection:sel});
  } else {
    if(p.offset<value.length){const points=[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(value)].map(x=>x.index);other.offset=points.find(x=>x>p.offset)??value.length;}
    else if(p.line<doc.lines.length-1)other={line:p.line+1,offset:0};else return retain({doc,selection:sel});
  }
  return retain(replaceEditorText(doc,docSelection(doc,p,other),''));
}
export const hasNoteTask = note => /^\s*- \[[ xX]\](?: |$|[^\r\n])/m.test(note.text);
export function noteTilt(id) {let h=0;for(const c of String(id))h=(Math.imul(h,31)+c.charCodeAt(0))|0;return ((h>>>0)%201-100)/100;}
export const sortedNotes = notes => notes.map((note,i)=>({note,i})).sort((a,b)=>Date.parse(b.note.at)-Date.parse(a.note.at)||a.i-b.i).map(x=>x.note);

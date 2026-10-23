import {runStyle} from './note-rich.js';
import {visibleLine} from './note-document.js';
import {clipboardImages} from './note-images.js';
import {hostMessage,isNative} from './floating-notes-bridge.js';

const inks={red:'#ff6b6b',blue:'#6fb0ff',green:'#a6e36e',yellow:'#ffd166',gray:'#8b98b8'};
const escape=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const rtfText=text=>Array.from({length:text.length},(_,i)=>{const n=text.charCodeAt(i),c=text[i];return /[\\{}]/.test(c)?'\\'+c:n>127?`\\u${n>32767?n-65536:n}?`:c==='\t'?'\\tab ':c;}).join('');
function listPrefix(line,tab=false){const gap=tab?'\t':' ';const kind=line.kind==='timeline'?line.listKind||'p':line.kind;return {p:'',ol:`${line.number??1}.`+gap,ul:'•'+gap,task:(tab?(line.checked?'☑':'☐'):(line.checked?'[x]':'[ ]'))+gap}[kind]||'';}
function prefix(line,tab=false){return (line.kind==='timeline'?line.when.replace('T',' ')+(tab?'\t':' '):'')+listPrefix(line,tab);}
function noteRTF(doc,images,placeholders=false){
 const palette=[...new Set([...Object.values(inks),...doc.lines.flatMap(l=>l.runs.flatMap(r=>[r.color,r.highlight].filter(Boolean)))])],colors=palette.map(hex=>{const n=Number.parseInt(hex.slice(1),16);return `\\red${n>>16}\\green${n>>8&255}\\blue${n&255};`;}).join('');
 const lines=doc.lines.map((line,index)=>{
  const marker=prefix(line,true);
  const body=line.runs.map(run=>{if(run.imageId){if(placeholders)return rtfText('\uFFFC');const image=images[run.imageId];if(!image)throw Error('图片复制准备未完成');const width=Math.min(image.width,600),height=image.height*width/image.width;return `{\\pict\\${image.kind==='jpg'?'jpegblip':'pngblip'}\\picw${image.width}\\pich${image.height}\\picwgoal${Math.round(width*15)}\\pichgoal${Math.round(height*15)} ${image.hex}}`;}return `{\\cf${palette.indexOf(run.color||inks[run.ink])+1}${run.highlight?'\\highlight'+(palette.indexOf(run.highlight)+1):''}${run.bold?'\\b':''}${run.italic?'\\i':''}${run.underline?'\\ul':''}${run.strike?'\\strike':''}${run.size?'\\fs'+run.size*2:''} ${rtfText(run.text)}}`;}).join('');
  return `\\pard${line.kind==='p'?'':'\\li360\\fi-360\\tx360'} ${rtfText(marker)}${(line.kind==='task'||line.listKind==='task')&&line.checked?'\\strike ':''}${body}\\strike0${index<doc.lines.length-1?'\\par':''}\n`;
 }).join('');
 // Explicit visible prefixes keep discontinuous numbering and task boxes in Cocoa editors.
 return `{\\rtf1\\ansi\\deff0\\uc1{\\fonttbl{\\f0 Helvetica;}}{\\colortbl;${colors}}\\f0\\fs28\n${lines}}`;
}
// Export the semantic document, never the card DOM (which includes controls and clipping).
export function noteClipboard(doc,images={}){
 if(doc.meta?.title)doc={...doc,meta:{},lines:[{kind:'p',runs:[{text:doc.meta.title,bold:true,size:20}]},...doc.lines]};
 const plain=doc.lines.map(line=>prefix(line)+line.runs.map(r=>r.imageId?'[图片]':r.text).join('')).join('\n');
 const body=line=>line.runs.map(run=>run.imageId?(()=>{const image=images[run.imageId];if(!image)throw Error('图片复制准备未完成');return `<img src="${image.dataURL}" alt="图片" style="display:block;max-width:100%;height:auto" width="${Math.min(image.width,600)}">`;})():(()=>{const css=runStyle(run);if(run.ink&&!run.color)css.color=inks[run.ink];const style=Object.entries(css).filter(([,v])=>v!==undefined).map(([k,v])=>`${k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}:${v}`).join(';');return style?`<span style="${style}">${escape(run.text)}</span>`:escape(run.text);})()).join('')||'<br>';
 const blocks=[];
 for(let i=0;i<doc.lines.length;){
  const line=doc.lines[i];
  if(line.kind==='timeline'){blocks.push(`<p style="margin:0;white-space:pre-wrap"><small>${escape(line.when.replace('T',' '))}</small><br>${escape(listPrefix(line))}${body(line)}</p>`);i++;continue;}
  if(line.kind==='p'){blocks.push(`<p style="margin:0;white-space:pre-wrap">${body(line)}</p>`);i++;continue;}
  const kind=line.kind,items=[];
  while(i<doc.lines.length&&doc.lines[i].kind===kind){const item=doc.lines[i++];items.push(`<li${kind==='ol'?` value="${item.number}"`:''}${kind==='task'?' style="list-style:none"':''}>${kind==='task'?`<span>${item.checked?'☑':'☐'}</span> `:''}<span${item.checked&&kind==='task'?' style="text-decoration:line-through"':''}>${body(item)}</span></li>`);}
  const tag=kind==='ol'?'ol':'ul';blocks.push(`<${tag}${kind==='ol'?` start="${line.number}"`:''} style="margin:0;padding-left:${kind==='task'?'0':'1.5em'};white-space:pre-wrap">${items.join('')}</${tag}>`);
 }
 const html=`<!doctype html><html><head><meta charset="utf-8"></head><body><div style="font-family:sans-serif;font-size:14px;line-height:1.65">${blocks.join('')}</div></body></html>`,rtf=noteRTF(doc,images);
 if(plain.length>1000000||html.length>8000000||rtf.length>16000000)throw Error('便签太长，无法一次复制格式');
 const attachments=[];let location=0;
 for(const line of doc.lines){location+=prefix(line,true).length;for(const run of line.runs){if(run.imageId){const image=images[run.imageId];attachments.push({location,kind:image.kind,data:image.dataURL.split(',')[1]});}location+=run.text.length;}location++;}
 return {plain,html,rtf,...(attachments.length?{attachments,rtfdSource:noteRTF(doc,images,true)}:{})};
}

export async function copyNote(getDoc){
 const value=Promise.resolve().then(getDoc).then(async doc=>noteClipboard(doc,await clipboardImages(doc)));
 if(isNative()){const result=await hostMessage('copyRich',await value);if(result!==true)throw Error('未能写入剪贴板，请重试');return;}
 if(!navigator.clipboard?.write||!globalThis.ClipboardItem){await value;throw Error('当前环境无法复制格式，请使用桌面随手记');}
 // Start the clipboard write in the click gesture; resolve editor flushing inside the item.
 await navigator.clipboard.write([new ClipboardItem({
  'text/plain':value.then(({plain})=>new Blob([plain],{type:'text/plain'})),
  'text/html':value.then(({html})=>new Blob([html],{type:'text/html'}))
 })]);
}

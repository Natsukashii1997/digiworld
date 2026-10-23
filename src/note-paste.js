import {createNoteDoc} from './note-document.js';
import {validHex} from './note-rich.js';
// Parse inert clipboard HTML, whitelist only text styles and list semantics.
// No images/links/scripts or URLs are loaded from pasted HTML.
export function pastedHTML(html){
 if(typeof html!=='string'||html.length>1000000)throw Error('粘贴内容过长');
 const body=new DOMParser().parseFromString(html,'text/html').body;
 const lines=[];let current=null;
 const row=(kind='p',extra={})=>{current={kind,number:1,checked:false,runs:[],...extra};lines.push(current);};
 const numberAttribute=(node,key,fallback)=>{const raw=node.getAttribute(key);if(raw===null||!/^\d+$/.test(raw.trim()))return fallback;const value=Number(raw);return Number.isInteger(value)&&value>=0&&value<=9999?value:fallback;};
 const hex=value=>{
  if(validHex(value))return value.toLowerCase();
  const m=/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value||'');
  return m?'#'+m.slice(1,4).map(n=>Math.max(0,Math.min(255,Number(n))).toString(16).padStart(2,'0')).join(''):undefined;
 };
 function read(node,style={},list=null){
  if(node.nodeType===3){if(!node.textContent)return;if(!current)row();current.runs.push({text:node.textContent.replaceAll('\r','').replaceAll('\n',' '),...style});return;}
  if(node.nodeType!==1||['SCRIPT','STYLE','META','IFRAME','OBJECT','SVG'].includes(node.tagName))return;
  if(node.tagName==='BR'){row(current?.kind||'p');return;}
  if(node.tagName==='IMG'){if(!current)row();current.runs.push({text:'[图片]'});return;}
  const next={...style},css=node.style;
  if(['B','STRONG'].includes(node.tagName)||Number(css.fontWeight)>=600||css.fontWeight==='bold')next.bold=true;
  if(['I','EM'].includes(node.tagName)||css.fontStyle==='italic')next.italic=true;
  if(node.tagName==='U'||css.textDecoration?.includes('underline'))next.underline=true;
  if(['S','STRIKE','DEL'].includes(node.tagName)||css.textDecoration?.includes('line-through'))next.strike=true;
  if(hex(css.color))next.color=hex(css.color);
  if(hex(css.backgroundColor))next.highlight=hex(css.backgroundColor);
  if(css.fontSize?.endsWith('px')){const size=Number.parseFloat(css.fontSize);if(size>=10&&size<=48)next.size=[12,14,16,18,20,24,28,32].reduce((best,n)=>Math.abs(n-size)<Math.abs(best-size)?n:best,14);}
  let sublist=list;
  if(['UL','OL'].includes(node.tagName))sublist={kind:node.tagName==='OL'?'ol':'ul',number:numberAttribute(node,'start',1)};
  if(node.tagName==='LI'){const checkbox=node.querySelector('input[type=checkbox]'),number=numberAttribute(node,'value',list?.number??1);row(checkbox?'task':list?.kind||'ul',{number,checked:!!checkbox?.checked});if(list)list.number=number+1;}
  else if(['P','DIV','H1','H2','H3','BLOCKQUOTE'].includes(node.tagName)&&current?.runs.length)row();
  for(const child of node.childNodes)read(child,next,sublist);
  if(['P','DIV','LI','H1','H2','H3','BLOCKQUOTE'].includes(node.tagName))current=null;
 }
 for(const child of body.childNodes)read(child);
 return {...createNoteDoc(),rich:true,lines:lines.length?lines:[{kind:'p',runs:[{text:''}]}]};
}

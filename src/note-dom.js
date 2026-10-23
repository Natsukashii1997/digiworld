import {STYLE_KEYS} from './note-rich.js';
// DOM仅桥接可见UTF16位置与受限文档，不把HTML写回主库。
import { docSelection, visibleLine, boundedDoc } from './note-document.js';
import {IMAGE_CHAR} from './note-image-model.js';
const lineElements=root=>[...root.querySelectorAll('[data-note-line]')];
function lineFor(root,node,offset) {
  const element=node?.nodeType===1?node:node?.parentElement;
  const own=element?.closest('[data-note-line]');
  if(own&&root.contains(own))return {element:own,node,offset};
  if(node?.nodeType===1&&root.contains(node)) {
    const child=node.childNodes[Math.min(offset,node.childNodes.length-1)],target=child?.nodeType===1?child:child?.parentElement;
    const candidates=target?.matches('[data-note-line]')?[target]:[...target?.querySelectorAll('[data-note-line]')||[]];
    const line=offset>=node.childNodes.length?(candidates.at(-1)||lineElements(root).at(-1)):(candidates[0]||lineElements(root).at(-1));
    return line?{element:line,node:line.querySelector('[data-note-text]'),offset:offset>=node.childNodes.length?Infinity:0}:null;
  }
  return null;
}
function units(node){if(node.nodeType===3)return node.textContent.length;if(node.nodeType===1&&node.hasAttribute('data-note-ui'))return 0;if(node.nodeType===1&&node.hasAttribute('data-note-image'))return 1;return [...node.childNodes].reduce((n,c)=>n+units(c),0);}
function position(root,node,offset,doc) {
  const found=lineFor(root,node,offset);if(!found)return null;
  const all=lineElements(root),line=all.indexOf(found.element),text=found.element.querySelector('[data-note-text]');if(line<0||!text)return null;
  let count=0;
  if(found.offset===Infinity)count=visibleLine(doc.lines[line]).length;
  else if(text.contains(found.node)){const range=root.ownerDocument.createRange();range.selectNodeContents(text);try{range.setEnd(found.node,found.offset);count=units(range.cloneContents());}catch{count=0;}}
  else if(found.node===found.element){const textIndex=[...found.element.childNodes].indexOf(text);count=found.offset>textIndex?visibleLine(doc.lines[line]).length:0;}
  return {line,offset:count};
}
export function captureBookmark(root,doc) {
  const selection=root?.ownerDocument.defaultView.getSelection();
  if(!selection?.rangeCount||!root.contains(selection.anchorNode)||!root.contains(selection.focusNode))return null;
  const anchor=position(root,selection.anchorNode,selection.anchorOffset,doc),focus=position(root,selection.focusNode,selection.focusOffset,doc);
  return anchor&&focus?docSelection(doc,anchor,focus):null;
}
export function bookmarkFromRange(root,doc,range){if(!range||!root.contains(range.startContainer)||!root.contains(range.endContainer))return null;const a=position(root,range.startContainer,range.startOffset,doc),b=position(root,range.endContainer,range.endOffset,doc);return a&&b?docSelection(doc,a,b):null;}
function domPoint(root,point) {
  const element=lineElements(root)[point.line]?.querySelector('[data-note-text]');if(!element)return null;
  const nodes=[];const collect=n=>{if(n.nodeType===3){nodes.push({node:n,length:n.textContent.length});return;}if(n.nodeType!==1||n.hasAttribute('data-note-ui'))return;if(n.hasAttribute('data-note-image')){nodes.push({node:n,length:1,atom:true});return;}for(const c of n.childNodes)collect(c);};for(const c of element.childNodes)collect(c);
  let remain=point.offset;
  for(const item of nodes){if(remain<=item.length){if(item.atom)return[item.node.parentNode,[...item.node.parentNode.childNodes].indexOf(item.node)+(remain>0?1:0)];return[item.node,remain];}remain-=item.length;}
  const last=nodes.at(-1);return last?(last.atom?[last.node.parentNode,[...last.node.parentNode.childNodes].indexOf(last.node)+1]:[last.node,last.length]):[element,0];
}
export function restoreBookmark(root,doc,bookmark,{focus=true}={}) {
  if(!root||!bookmark)return;
  const sel=docSelection(doc,bookmark.anchor,bookmark.focus),a=domPoint(root,sel.anchor),f=domPoint(root,sel.focus);if(!a||!f)return;
  if(focus)root.focus({preventScroll:true});
  const selection=root.ownerDocument.defaultView.getSelection();selection.setBaseAndExtent(a[0],a[1],f[0],f[1]);
}
function runsFrom(element,images) {
  const parts=[];
  function read(node,ink=null,style={}) {
    if(node.nodeType===3){if(node.textContent)parts.push({text:node.textContent,ink,...style});return;}
    if(node.nodeType!==1||node.hasAttribute('data-note-ui'))return;
    if(node.hasAttribute('data-note-image')){const imageId=node.dataset.noteImage;if(!images?.includes(imageId))throw Error('图片引用需要重新确认，原草稿已保留');parts.push({text:IMAGE_CHAR,ink:null,imageId});return;}
    if(node.tagName==='BR')return;
    const next=node.dataset.ink&&['red','blue','green','yellow','gray'].includes(node.dataset.ink)?node.dataset.ink:ink;
    let styles={...style};try{const data=JSON.parse(node.dataset.noteStyle||'{}');for(const key of STYLE_KEYS)if(data[key]!==undefined)styles[key]=data[key];}catch{}
    for(const child of node.childNodes)read(child,next,styles);
  }
  read(element);return parts.length?parts:[{text:'',ink:null}];
}
export function docFromDOM(root,base) {
  const existing=new Map(base.lines.map(l=>[l.id,l])),all=lineElements(root);
  if(all.length!==base.lines.length)throw Error('输入结构需要重新确认，原草稿已保留');
  const lines=all.map((element,index)=>{
    const old=existing.get(element.dataset.noteLine)||base.lines[index],text=element.querySelector('[data-note-text]');
    if(!text)throw Error('输入结构需要重新确认，原草稿已保留');
    const runs=runsFrom(text,base.images);
    // 没有语义变化的行沿用精确来源，包括相邻同色色段的原始分割。
    if(runs.map(r=>r.text).join('')===visibleLine(old) && JSON.stringify(runs.map(r=>[r.text,r.ink,r.imageId||null,...STYLE_KEYS.map(k=>r[k]??null)]))===JSON.stringify(old.runs.map(r=>[r.text,r.ink||null,r.imageId||null,...STYLE_KEYS.map(k=>r[k]??null)])))return old;
    return {...old,runs};
  });
  if(lines.every((line,index)=>line===base.lines[index]))return base;
  return boundedDoc({...base,lines});
}

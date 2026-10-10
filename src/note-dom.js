// DOM仅桥接可见UTF16位置与受限文档，不把HTML写回主库。
import { docSelection, visibleLine, boundedDoc } from './note-document.js';
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
function position(root,node,offset,doc) {
  const found=lineFor(root,node,offset);if(!found)return null;
  const all=lineElements(root),line=all.indexOf(found.element),text=found.element.querySelector('[data-note-text]');if(line<0||!text)return null;
  let count=0;
  if(found.offset===Infinity)count=visibleLine(doc.lines[line]).length;
  else if(text.contains(found.node)){const range=root.ownerDocument.createRange();range.selectNodeContents(text);try{range.setEnd(found.node,found.offset);count=range.toString().length;}catch{count=0;}}
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
  const walker=root.ownerDocument.createTreeWalker(element,4),nodes=[];let node;
  while((node=walker.nextNode()))nodes.push(node);
  let remain=point.offset;
  for(const n of nodes){if(remain<=n.textContent.length)return [n,remain];remain-=n.textContent.length;}
  return nodes.length?[nodes.at(-1),nodes.at(-1).textContent.length]:[element,0];
}
export function restoreBookmark(root,doc,bookmark,{focus=true}={}) {
  if(!root||!bookmark)return;
  const sel=docSelection(doc,bookmark.anchor,bookmark.focus),a=domPoint(root,sel.anchor),f=domPoint(root,sel.focus);if(!a||!f)return;
  if(focus)root.focus({preventScroll:true});
  const selection=root.ownerDocument.defaultView.getSelection();selection.setBaseAndExtent(a[0],a[1],f[0],f[1]);
}
function runsFrom(element) {
  const parts=[];
  function read(node,ink=null) {
    if(node.nodeType===3){if(node.textContent)parts.push({text:node.textContent,ink});return;}
    if(node.nodeType!==1||node.hasAttribute('data-note-ui'))return;
    if(node.tagName==='BR')return;
    const next=node.dataset.ink&&['red','blue','green','yellow','gray'].includes(node.dataset.ink)?node.dataset.ink:ink;
    for(const child of node.childNodes)read(child,next);
  }
  read(element);return parts.length?parts:[{text:'',ink:null}];
}
export function docFromDOM(root,base) {
  const existing=new Map(base.lines.map(l=>[l.id,l])),all=lineElements(root);
  if(all.length!==base.lines.length)throw Error('输入结构需要重新确认，原草稿已保留');
  const lines=all.map((element,index)=>{
    const old=existing.get(element.dataset.noteLine)||base.lines[index],text=element.querySelector('[data-note-text]');
    if(!text)throw Error('输入结构需要重新确认，原草稿已保留');
    const runs=runsFrom(text);
    // 没有语义变化的行沿用精确来源，包括相邻同色色段的原始分割。
    if(runs.map(r=>r.text).join('')===visibleLine(old) && JSON.stringify(runs.map(r=>[r.text,r.ink]))===JSON.stringify(old.runs.map(r=>[r.text,r.ink||null])))return old;
    return {...old,runs};
  });
  if(lines.every((line,index)=>line===base.lines[index]))return base;
  return boundedDoc({...base,lines});
}

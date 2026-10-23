import React,{useEffect,useRef,useState} from 'react';
import {TEXT_COLORS,HIGHLIGHTS} from './note-rich.js';
const menus=[['color','字体颜色'],['highlight','高亮'],['format','格式'],['size','字号'],['list','列表']];
export function NoteContextMenu({position,onClose,onAction}){
 const root=useRef(null),[submenu,setSubmenu]=useState('');
 useEffect(()=>{
  const close=e=>{if(!root.current?.contains(e.target))onClose();};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();onClose();}};
  document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};
 },[onClose]);
 const action=(name,value)=>{onAction(name,value);onClose();};
 return <div ref={root} role="menu" aria-label="便签编辑菜单" className="sn-context" style={{left:Math.max(8,Math.min(position.x,innerWidth-236)),top:Math.max(8,Math.min(position.y,innerHeight-480))}} onPointerDown={e=>e.preventDefault()} onContextMenu={e=>e.preventDefault()}>
  <div className="sn-context-basics">{[['cut','剪切'],['copy','复制'],['paste','粘贴'],['selectAll','全选']].map(([key,label])=><button role="menuitem" key={key} onClick={()=>action(key)}>{label}</button>)}</div>
  {menus.map(([key,label])=><React.Fragment key={key}>
   <button role="menuitem" aria-haspopup="menu" aria-expanded={submenu===key} onClick={()=>setSubmenu(submenu===key?'':key)}>{label}<span>›</span></button>
   {submenu===key&&<div className={'sn-context-options '+(['color','highlight'].includes(key)?'swatches':'')} role="group" aria-label={label+'选项'}>
    {['color','highlight'].includes(key)?<><button title="恢复默认" aria-label="恢复默认" onClick={()=>action(key,null)}>×</button>{(key==='color'?TEXT_COLORS:HIGHLIGHTS).map(value=><button key={value} style={{background:value}} aria-label={value} title={value} onClick={()=>action(key,value)}/>)}</>:null}
    {key==='format'&&[['bold','加粗'],['italic','斜体'],['underline','下划线'],['strike','删除线'],['clear','清除格式']].map(([value,text])=><button key={value} onClick={()=>action(value)}>{text}</button>)}
    {key==='size'&&[12,14,16,18,20,24,28,32].map(value=><button key={value} onClick={()=>action('size',value)}>{value}</button>)}
    {key==='list'&&[['ol','有序编号'],['ul','无序编号'],['task','复选框']].map(([value,text])=><button key={value} onClick={()=>action('list',value)}>{text}</button>)}
   </div>}
  </React.Fragment>)}
  <div className="sn-context-basics"><button role="menuitem" onClick={()=>action('undo')}>撤销</button><button role="menuitem" onClick={()=>action('redo')}>重做</button></div>
 </div>;
}

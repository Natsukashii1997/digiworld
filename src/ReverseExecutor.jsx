import codexLogo from './brands/codex.png';
import claudeLogo from './brands/claude-code.png';
import React,{useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ChevronDown,Check} from 'lucide-react';
import {EXECUTORS,EXECUTOR_NAMES} from './reverse-ai.js';
function Logo({executor}){return executor==='rea'?<span className="executor-rea" aria-hidden="true">REA</span>:<img alt="" src={executor==='codex'?codexLogo:claudeLogo} width="22" height="22"/>;}
export function ReverseExecutor({value,disabled,onChange}){
 const [open,setOpen]=useState(false),[position,setPosition]=useState({}),trigger=useRef(null),menu=useRef(null),id=useId();
 function close(focus=true){setOpen(false);if(focus)trigger.current?.focus({preventScroll:true});}
 function place(){const r=trigger.current.getBoundingClientRect(),width=Math.min(260,innerWidth-24),height=menu.current?.offsetHeight||180;setPosition({left:Math.max(12,Math.min(r.right-width,innerWidth-width-12)),top:Math.max(12,r.bottom+height+6<innerHeight?r.bottom+6:r.top-height-6),width});}
 function show(){place();setOpen(true);}
 useEffect(()=>{if(!open)return;place();menu.current?.children[EXECUTORS.indexOf(value)]?.focus({preventScroll:true});const outside=e=>{if(!menu.current?.contains(e.target)&&!trigger.current?.contains(e.target))close(false);};const scroll=()=>{const r=trigger.current?.getBoundingClientRect();if(!r||r.bottom<0||r.top>innerHeight)close();else place();};document.addEventListener('pointerdown',outside);window.addEventListener('resize',scroll);window.addEventListener('scroll',scroll,true);return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',scroll);window.removeEventListener('scroll',scroll,true);};},[open]);
 useEffect(()=>{if(disabled&&open)close(false);},[disabled,open]);
 function keyboard(e){const items=[...menu.current.children],index=items.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();close();}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?2:(index+(e.key==='ArrowDown'?1:-1)+3)%3].focus();}else if(e.key==='Tab')close();}
 return <><button ref={trigger} className="executor-trigger" type="button" aria-label={'选择执行器：'+EXECUTOR_NAMES[value]} aria-haspopup="menu" aria-controls={open?id:undefined} aria-expanded={open} disabled={disabled} onClick={()=>open?close():show()} onKeyDown={e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();show();}}}><Logo executor={value}/><span>{EXECUTOR_NAMES[value]}</span><ChevronDown size={14}/></button>{open&&createPortal(<div id={id} ref={menu} role="menu" aria-label="逆推执行器" className="reverse-executor-menu" style={position} onKeyDown={keyboard}>{EXECUTORS.map(executor=><button key={executor} type="button" role="menuitemradio" aria-checked={value===executor} tabIndex={-1} onClick={()=>{close();onChange(executor);}}><Logo executor={executor}/><span>{EXECUTOR_NAMES[executor]}{executor==='rea'&&<small>不用额度</small>}</span>{value===executor&&<Check size={16}/>}</button>)}</div>,document.body)}</>;
}

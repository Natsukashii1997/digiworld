import React,{useEffect,useRef,useState} from 'react';
import {Copy,Check} from 'lucide-react';
import {copyNote} from './note-clipboard.js';

export function NoteCopyButton({getDoc,disabled=false}){
 const [state,setState]=useState(''),timer=useRef(null),alive=useRef(true),busy=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;clearTimeout(timer.current);};},[]);
 async function copy(){if(busy.current)return;busy.current=true;clearTimeout(timer.current);setState('复制中…');try{await copyNote(getDoc);if(alive.current)setState('已复制（含格式）');}catch(error){if(alive.current)setState(error.message||'复制失败，请重试');}finally{busy.current=false;if(alive.current)timer.current=setTimeout(()=>setState(''),3500);}}
 return <span className="sn-copy-wrap"><button type="button" className="sn-ico sn-copy" aria-label="复制便签（含格式）" title="复制便签（含格式）" disabled={disabled||state==='复制中…'} onPointerDown={e=>{e.preventDefault();e.stopPropagation();}} onClick={copy}>{state==='已复制（含格式）'?<Check size={16}/>:<Copy size={16}/>}</button><span className="sn-copy-status" role="status">{state}</span></span>;
}

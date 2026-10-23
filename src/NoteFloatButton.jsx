import React,{useState} from 'react';
import {ExternalLink} from 'lucide-react';
import {hostMessage,isNative} from './floating-notes-bridge.js';
export function NoteFloatButton({id,beforeOpen}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function open(){
  if(busy)return;setBusy(true);setError('');
  try{await beforeOpen?.();if(isNative())await hostMessage('openNote',{id});else window.location.href='digitalworld-notes://note/'+encodeURIComponent(id);}
  catch(e){setError(e.message||'请先保存这张便签，再独立打开');}
  finally{setBusy(false);}
 }
 return <span className="sn-float-wrap"><button className="sn-ico" type="button" aria-label="独立浮动便签" title="独立浮动便签" disabled={busy} onPointerDown={e=>e.preventDefault()} onClick={open}><ExternalLink size={16}/></button>{error&&<span role="alert" className="sn-float-error">{error}</span>}</span>;
}

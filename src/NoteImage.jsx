import React,{useEffect,useState} from 'react';
import {readNoteImage} from './note-images.js';
export function NoteImage({id}){
 const [value,setValue]=useState({}),[retry,setRetry]=useState(0);
 useEffect(()=>{let live=true,url;const abort=new AbortController();setValue({});readNoteImage(id,abort.signal).then(image=>{if(!live)return;url=URL.createObjectURL(image.blob);setValue({url});}).catch(e=>{if(live)setValue({error:e.message});});return()=>{live=false;abort.abort();if(url)URL.revokeObjectURL(url);};},[id,retry]);
 return value.url?<img className="sn-note-image" src={value.url} alt="便签图片" draggable={false}/>:<span data-note-ui className="sn-image-message">{value.error?<><span>图片暂时无法读取</span><button type="button" aria-label="重试读取图片" onClick={e=>{e.stopPropagation();setRetry(n=>n+1);}}>重试</button></>:'正在读取图片…'}</span>;
}

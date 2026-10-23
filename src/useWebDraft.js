import {useEffect,useRef,useState} from 'react';
import {session} from './api.js';
import {openDraftRecord,webDraftKey} from './web-draft.js';
import {registerPageGuard} from './navigation-guard.js';

export function useWebDraft(scope,validate){
 const controller=useRef(null),validateRef=useRef(validate),unsafe=useRef(false);validateRef.current=validate;
 const [state,setState]=useState({ready:false,value:null,error:''});
 const fail=error=>{setState(v=>({...v,error:error.message}));};
 useEffect(()=>{
  let live=true,release;
  setState({ready:false,value:null,error:''});unsafe.current=false;
  (async()=>{
   const {dataRootIdentity}=await session();if(!live)return;
   const key=webDraftKey(dataRootIdentity,scope);
   if(!navigator.locks?.request)throw Error('当前浏览器无法保护多窗口草稿，请保留窗口并换用数码世界桌面入口。');
   await navigator.locks.request(key,{ifAvailable:true},async lock=>{
    if(!live)return;
    if(!lock)throw Error('这个入口正在另一窗口编辑，请在那里继续，或关闭该窗口后重新打开。');
    const record=openDraftRecord(localStorage,key,value=>validateRef.current(value));
    controller.current=record;setState({ready:true,value:record.read(),error:''});
    await new Promise(resolve=>{release=resolve;});record.close();
   });
  })().catch(error=>{if(live)fail(error);});
  return()=>{live=false;controller.current?.close();controller.current=null;release?.();};
 },[scope]);
 useEffect(()=>registerPageGuard(()=>unsafe.current?'草稿尚未安全留在本机，请保留当前窗口并处理提示。':''),[]);
 return {...state,save(value){
  try{if(!controller.current)throw Error('草稿尚未准备好，请稍后再试。');const sequence=controller.current.save(value);unsafe.current=false;setState(v=>v.error?{...v,error:''}:v);return sequence;}
  catch(error){unsafe.current=true;fail(error);throw error;}
 }};
}

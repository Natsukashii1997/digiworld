'use client';

import { useEffect, useRef, useState } from 'react';
import { DeskView } from './components/DeskView';
import { useApp } from './lib/store';
import { getNotes, getNotesRevision } from './lib/xhs-client';

export default function Home({noteJump}: {noteJump?:{id:string;key:string}|null}) {
  const { dispatch } = useApp();
  const [loadedJumpKey,setLoadedJumpKey]=useState<string|null>(null);
  const notesSignatureRef = useRef('');
  const notesRevisionRef = useRef('');

  useEffect(() => {
    let cancelled = false,inFlight=false;
    let pending:AbortController|null=null;

    const load = async (showLoading = false) => {
      if(inFlight)return;
      inFlight=true;
      const controller=new AbortController();pending=controller;
      let rejectRead:(reason:Error)=>void=()=>{};
      const interrupted=new Promise<never>((_,reject)=>{rejectRead=reject;});
      const onAbort=()=>rejectRead(new Error('读取已中止'));
      controller.signal.addEventListener('abort',onAbort,{once:true});
      const timeout=window.setTimeout(()=>controller.abort(),8000);
      if (showLoading) dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const revision = await Promise.race([getNotesRevision(controller.signal),interrupted]);
        if (cancelled) return;
        if (!showLoading && revision && revision === notesRevisionRef.current) {
          dispatch({type:'SET_ERROR',payload:null});
          setLoadedJumpKey(noteJump?.key||null);
          return;
        }
        const notes = await Promise.race([getNotes(controller.signal),interrupted]);
        if (cancelled) return;
        notesRevisionRef.current = revision;
        const signature = JSON.stringify(notes);
        if (signature !== notesSignatureRef.current) {
          notesSignatureRef.current = signature;
          dispatch({ type: 'SET_NOTES', payload: notes });
        }
        if (!cancelled) {dispatch({type:'SET_ERROR',payload:null});setLoadedJumpKey(noteJump?.key||null);}
      } catch(error) {
        if (!cancelled) dispatch({ type: 'SET_ERROR', payload: controller.signal.aborted?'收藏读取超时，正在等待重新连接。':error instanceof Error?error.message:'加载失败' });
      } finally {
        window.clearTimeout(timeout);controller.signal.removeEventListener('abort',onAbort);pending=null;inFlight=false;
        if (showLoading && !cancelled) dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    void load(true);
    const intervalId = window.setInterval(() => void load(), 2000);

    return () => {
      cancelled = true;pending?.abort();
      window.clearInterval(intervalId);
    };
  }, [dispatch,noteJump?.key]);

  return <DeskView noteJump={noteJump} loadedJumpKey={loadedJumpKey} />;
}

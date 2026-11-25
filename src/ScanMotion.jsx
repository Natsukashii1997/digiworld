import React,{useEffect,useLayoutEffect,useRef} from 'react';
import {installScreenMotion,routeReveal,revealPanel,scanReveal} from './scan-motion.js';
import {SCAN} from './motion-tokens.js';
import './scan-motion.css';
export function useScanMotion(ref,key){useEffect(installScreenMotion,[]);useLayoutEffect(()=>routeReveal(ref.current),[ref,key]);}
export function usePanelScan(ref){useLayoutEffect(()=>revealPanel(ref.current),[ref]);}
export function useReadScan(ref,pending,ready){
 const wasPending=useRef(false);
 useLayoutEffect(()=>{const completed=wasPending.current&&!pending&&ready;wasPending.current=!!pending;if(completed)return scanReveal(ref.current,{duration:SCAN.read,kind:'read'});},[ref,pending,ready]);
}
// 标记留在结果容器中；只有调用方确认读取成功，才显现内容。
// 读取失败、切页或关闭面板都不把卸载当作成功。
export function ReadReveal({pending,ready,target}){
 const ref=useRef(null),wasPending=useRef(false);
 useLayoutEffect(()=>{
  const completed=wasPending.current&&!pending&&ready;
  wasPending.current=!!pending;
  if(!completed)return;
  try{
   const parent=ref.current?.parentElement;
   const result=typeof target==='function'?target(parent):typeof target==='string'?parent?.querySelector(target):parent;
   return scanReveal(result,{duration:SCAN.read,kind:'read'});
  }catch{}
 },[pending,ready,target]);
 return <span ref={ref} className="read-reveal-marker" hidden aria-hidden="true"/>;
}
export function Reading({mini=false,label='读取中'}){
 return <span className={'reading'+(mini?' reading-mini':'')} role="status" aria-label={label}>
  <svg className="reading-matrix" viewBox={`0 0 ${mini?77:397} ${mini?7:47}`} aria-hidden="true">{/* 同一列的点本来就共用一个延迟：按列成组动画（40 组而不是 200 个点），画面不变（#127） */}{Array.from({length:mini?8:40},(_,c)=><g className="reading-col" key={c} style={{'--reading-delay':(c*900/(mini?8:40))+'ms'}}>{Array.from({length:mini?1:5},(_,r)=><rect className="reading-dot" key={r} x={c*10} y={r*10} width="7" height="7"/>)}</g>)}</svg>
  {mini?<span className="sr-only">{label}</span>:<><span className="reading-label" aria-hidden="true">READING · 读取中</span><span className="sr-only">{label}</span></>}
 </span>;
}

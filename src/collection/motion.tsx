import React, { forwardRef, useSyncExternalStore } from 'react';
import { motion as originalMotion, AnimatePresence } from 'framer-motion';

const subscribeMotion = (notify:()=>void) => {
  const query=window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change',notify);
  return ()=>query.removeEventListener('change',notify);
};
const motionPreference = ()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const palette:Record<string,string> = {
  'EBE9E4':'--bg-2','FDFCFA':'--panel-2','EAE7E0':'--panel','F4F2ED':'--panel','F5F3EE':'--panel','E8E5DE':'--panel-3','171715':'--bg',
  '829987':'--cyan','6B8799':'--cyan','B89A52':'--yellow','D9B366':'--yellow','CC8C73':'--orange','8BA882':'--lcd','9B8EA0':'--violet',
  '7A95A8':'--cyan','C4A882':'--yellow','A67C52':'--orange','6E9478':'--lcd','8B9AB5':'--violet','7B8F6E':'--lcd','B5849B':'--pink','B07856':'--orange','6E8E7A':'--lcd','5E7FA3':'--cyan',
  'B56A5B':'--red','8F5146':'--red','4F6254':'--lcd','5E7564':'--lcd','627567':'--lcd',
};
function themed(value:unknown,key:string):unknown {
  if (typeof value!=='string') return value;
  if (key==='fontFamily') return 'var(--sans)';
  if (key==='letterSpacing') return 0;
  return value.replace(/#([a-f0-9]{8}|[a-f0-9]{6})\b/gi,(_,hex)=>{
    const token=palette[hex.slice(0,6).toUpperCase()] || (key==='color' ? '--text' : '--panel-2');
    if (hex.length===8) return `color-mix(in srgb, var(${token}) ${Math.round(parseInt(hex.slice(6),16)/255*100)}%, transparent)`;
    return `var(${token})`;
  }).replace(/rgba\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\)/g,(_,r,g,b,a)=>{
    const token = key==='color' ? '--text-2' : key==='border' || key==='borderTop' || key==='borderBottom' || key==='borderRight' ? '--cyan' : Number(r)>150 ? '--bg' : '--panel-3';
    return `color-mix(in srgb, var(${token}) ${Math.round(Number(a)*100)}%, transparent)`;
  });
}
function styleOf(style:any) {
  if (!style) return style;
  return Object.fromEntries(Object.entries(style).map(([key,value])=>[key,themed(value,key)]));
}
const final = (value:any):any => value && typeof value==='object' ? Object.fromEntries(Object.entries(value).map(([key,item])=>[key,Array.isArray(item)?item[item.length-1]:item])) : value;
// 减少动效时连退场里单独写的 transition 也去掉，一律瞬间到位（#127）。
const still = (value:any):any => { const x=final(value); if (!x || typeof x!=='object') return x; const { transition, ...rest } = x; return rest; };
const cache=new Map<string,any>();
export const motion = new Proxy({} as typeof originalMotion,{get(_target,key:string){
  if (!cache.has(key)) {
    const Original=(originalMotion as any)[key];
    cache.set(key,forwardRef<any,any>(function ThemedMotion(props,ref){
      const reduced=useSyncExternalStore(subscribeMotion,motionPreference,()=>true);
      const next={...props,style:styleOf(props.style)};
      if (reduced) Object.assign(next,{initial:false,animate:still(props.animate),exit:still(props.exit),transition:{duration:0,delay:0,repeat:0},whileHover:undefined,whileTap:undefined,layout:false});
      return <Original {...next} ref={ref}/>;
    }));
  }
  return cache.get(key);
}});
export { AnimatePresence, styleOf };

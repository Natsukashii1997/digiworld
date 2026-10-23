import React,{useEffect,useRef} from 'react';
import {REA_CHROME_DEBUG_COMMAND} from './reverse-recipe.js';
const path=url=>{try{const u=new URL(url);return u.pathname+u.search+u.hash;}catch{return url;}};
export function ReversePrecheck({value,busy,onChoose,onCopy}){
 const heading=useRef(null);useEffect(()=>{heading.current?.focus();},[value]);
 const unavailable=value.status==='unavailable';
 return <div className="reverse-precheck" aria-label="网站预检结果"><p tabIndex={-1} ref={heading} className="precheck-heading" role="status">
  {value.status==='multiple'?'调试 Chrome 中有多个相同网址的标签页，请只保留一个该网址的标签页。':unavailable?value.message||'无法连接调试 Chrome。':<>调试 Chrome 当前打开的是：{value.candidates.slice(0,2).map(p=>`${p.path}（标题：${p.title}）`).join('、')}；与目标 <b>{path(value.targetUrl)}</b> 不一致。</>}
 </p><small>预检未启动 AI，不消耗模型额度。</small>
 {value.status==='mismatch'&&<><ul>{value.candidates.map(p=><li key={p.targetId}><span><code>{p.path}</code><small>{p.title}</small></span><button disabled={busy} onClick={()=>onChoose(p)}>改用这个页面</button></li>)}</ul><p className="hint">也可以去 Chrome 里切到目标页，再点开始。此处最多显示 10 个同站页面。</p></>}
 {unavailable&&<div className="rea-web-help hint"><p>先用独立资料目录打开调试 Chrome，再打开目标网址；不要使用日常资料目录，取证后关闭窗口。</p><code>{REA_CHROME_DEBUG_COMMAND}</code><button disabled={busy} onClick={()=>onCopy(REA_CHROME_DEBUG_COMMAND)}>复制 Chrome 调试命令</button></div>}
 </div>;
}
export function ReverseClues({version,target,busy,onAdd}){
 const clues=version.result.clues;if(!clues?.length)return null;
 return <div className="reverse-ai-clues" aria-label="AI 用到的线索词"><p>AI 用到的线索词</p><ul>{clues.map(clue=>{const original=version.target.clues?.includes(clue),saved=target.clues?.includes(clue);return <li key={clue}><span><code>{clue}</code><small>{original?'标本已有':'AI 补充'}</small></span><button disabled={busy||saved||(target.clues?.length||0)>=8} onClick={()=>onAdd(clue)}>{saved?(original?'标本已有':'已加入标本'):'加入标本'}</button></li>;})}</ul>{(target.clues?.length||0)>=8&&<small>标本线索词已达 8 个上限。</small>}</div>;
}

// 共用发车控件；调用方持有准备快照、复制/留痕及打开应用的状态。
import React from 'react';
import {ArrowRight,ChevronDown,ChevronUp,Copy} from 'lucide-react';
import {Button} from './components.jsx';
import {useReducedMotion} from './v14.jsx';
import {desktopAgentLabel} from './desktop-agents.js';
export function RelayLaunch({mode='agents',open,onPreview,busy,blocked=false,prepared,picked,targetName,character,copy,children,extra,onPromptChange,copied=false}) {
 const reduced=useReducedMotion(),project=mode==='projects',collab=mode==='collab';
 return <section className={project?'pj-launch':`launch m-panel${open?' open':''}`} aria-label="发车">
  <div className={project?'pj-launch-row':'launch-main'}>
   {children}
   <button type="button" className={project?'pj-toggle':'prompt-toggle'} aria-expanded={open} aria-controls="relay-prompt" aria-label={project?"预览口令":undefined} disabled={busy} onClick={onPreview}>
    {open?<ChevronUp size={16}/>:<ChevronDown size={16}/>}<span className="en">PROMPT</span>{project?'预览口令':collab?' 预览':'预览提示词'}
   </button>
   {!collab&&<span className={project?'pj-meta':'launch-meta'}><b>{(prepared?.prompt.length||0).toLocaleString('zh-CN')}</b> 字 · 打开 {desktopAgentLabel(picked,targetName)} 后粘贴发送</span>}
   <span className={project?'pj-launch-act':'launch-actions'}>
    <Button secondary disabled={busy||!prepared||blocked} onClick={()=>copy(false)}><Copy size={16}/>{project?'只复制':collab&&copied?'已复制':'只复制提示词'}</Button>
    <Button className={project?'pj-go-big':'go'} disabled={busy||!prepared||blocked} onClick={()=>copy(true)}>带到 <b key={picked} className={`${collab?'relay-target-name ':''}${reduced?'':'flip'}`}>{character}</b> 继续<ArrowRight size={17}/></Button>
   </span>{extra}
  </div>
  {open&&prepared&&<>{collab?<label className="relay-editor"><span>提示词，可直接编辑</span><textarea className="prompt" id="relay-prompt" aria-label="提示词" value={prepared.prompt} disabled={busy} onChange={e=>onPromptChange(e.target.value)}/></label>:<pre className="prompt" id="relay-prompt" aria-label="口令预览" tabIndex={0}>{prepared.prompt}</pre>}
   {prepared.redactions>0&&<p className="relay-redactions">已隐去 {prepared.redactions} 段疑似凭据</p>}
   {!project&&!collab&&prepared.nextStatus!=='ok'&&<small className="relay-next-state">{prepared.nextStatus==='unreadable'?'项目 CURRENT 读取受阻，未生成唯一下一步':'未读到已登记项目的唯一下一步，未据会话推测'}</small>}
   {!project&&!collab&&<Button secondary className="mobile-copy" disabled={busy} onClick={()=>copy(false)}>只复制提示词</Button>}
  </>}
 </section>;
}

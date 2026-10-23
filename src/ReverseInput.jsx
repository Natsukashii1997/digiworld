import React, { useRef, useState } from 'react';
import { Button, Dialog } from './components.jsx';
import { request } from './api.js';
import { createSpecimen, REA_CHROME_DEBUG_COMMAND } from './reverse-recipe.js';
import { uid } from './store.js';

export function ReverseInput({state,save,notify,onClose,onCreated,referenceOnly=false}) {
  const [category,setCategory]=useState('software'),[type,setType]=useState('TXT'),[kind,setKind]=useState('electron');
  const [title,setTitle]=useState(''),[path,setPath]=useState(''),[url,setUrl]=useState(''),[feature,setFeature]=useState(''),[clues,setClues]=useState(''),[cdp,setCdp]=useState('http://127.0.0.1:9222');
  const [text,setText]=useState(''),[why,setWhy]=useState(''),[authorized,setAuthorized]=useState(false),[media,setMedia]=useState([]);
  const [error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),lock=useRef(false);
  const software=category==='software'&&!referenceOnly;
  async function guarded(action) {
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{await action();}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
  }
  async function checkPath(){const result=await request('/reverse/target/check',{path});if(!result.exists)throw Error('目标不存在');if(result.kind==='app'&&!result.appAsarExists)throw Error('此.app缺少app.asar，请选择实际.asar或已解包目录');setStatus('路径检查通过；尚未运行REA');return result;}
  const upload=files=>guarded(async()=>{
    const added=[];for(const file of files){if(file.size>8*1024*1024)throw Error('单张图片不能超过8 MB');added.push(await request('/reverse/media',{data:new Uint8Array(await file.arrayBuffer())}));}
    setMedia(previous=>[...new Map([...previous,...added].map(m=>[m.path,m])).values()]);
  });
  return <Dialog title={referenceOnly?'保存参考':'投入参照物'} drawer recoverFocus onClose={()=>!busy&&onClose()}>
    <form className="asset-form reverse-input-v4" onSubmit={e=>{e.preventDefault();guarded(async()=>{
      if(referenceOnly){const u=new URL(url);if(!['http:','https:'].includes(u.protocol))throw Error('请使用http(s)链接');if(await save({...state,references:[{id:uid(),title:title.trim(),url:u.href,note:why},...(state.references||[])]})){notify('参考资料已保存');onClose();}return;}
      if(software&&kind==='electron')await checkPath();
      const target=software?{kind,...(kind!=='web'?{path}:{url,cdpEndpoint:cdp}),feature,clues:clues.split(/[,，、]/).map(v=>v.trim()).filter(Boolean),authorized}:undefined;
      const record=createSpecimen({type:software?'FN':type,title,text:software?'':text,url:software?'':url,why,media:software?[]:media,target});
      if(await save({...state,reverseRecords:[record,...(state.reverseRecords||[])]})){onCreated(record.id);notify('参照物已投入');onClose();}
    });}}>
      {!referenceOnly&&<fieldset disabled={busy}><legend>参照物</legend><div className="rea-methods">
        {[['software','软件'],['artwork','作品']].map(([v,label])=><label key={v}><input type="radio" name="category" checked={category===v} onChange={()=>{setCategory(v);setError('');}}/>{label}</label>)}
      </div></fieldset>}
      <label>标题<input maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} required={referenceOnly} disabled={busy}/></label>
      {software?<fieldset className="rea-fields" disabled={busy}><legend>软件取证</legend>
        <label>目标类型<select value={kind} onChange={e=>{setKind(e.target.value);setStatus('');}}><option value="electron">Electron 应用</option><option value="web">网站</option><option value="local">本机文件或目录（原生 Codex）</option></select></label>
        {kind!=='web'?<><label>本机绝对路径<input required maxLength={4096} value={path} onChange={e=>{setPath(e.target.value);setStatus('');}} placeholder="/Applications/Example.app"/></label>
          {kind==='electron'&&<Button secondary disabled={busy||!path} onClick={()=>guarded(checkPath)}>检查路径</Button>}{status&&<p role="status" className="hint">{status}</p>}{kind==='local'&&<p className="hint">可投入原生程序、托管代码、安装包、固件等，由 Codex 按 REA 原生能力选择分析方法。</p>}</>:<>
          <label>网站网址<input required type="url" maxLength={2000} value={url} onChange={e=>setUrl(e.target.value)}/></label>
          <label>Chrome 调试端点<input required value={cdp} onChange={e=>setCdp(e.target.value)}/></label>
          <div className="rea-web-help hint"><p>先用独立资料目录打开 Chrome 调试窗口，再打开目标网址。不要使用日常资料目录，取证后关闭窗口。</p><code>{REA_CHROME_DEBUG_COMMAND}</code>
            <Button secondary onClick={()=>guarded(async()=>{await navigator.clipboard.writeText(REA_CHROME_DEBUG_COMMAND);notify('Chrome 调试命令已复制');})}>复制 Chrome 调试命令</Button></div>
        </>}
        <label>想弄懂的功能<textarea required maxLength={500} value={feature} onChange={e=>setFeature(e.target.value)}/></label>
        <label>线索词（可选）<input maxLength={650} value={clues} onChange={e=>setClues(e.target.value)} placeholder="copy、clipboard"/><small>可不填；AI 会根据“想弄懂”自动定线索词。已有线索可用逗号分开，最多 8 个。</small></label>
        <label><input type="checkbox" required checked={authorized} onChange={e=>setAuthorized(e.target.checked)}/>我拥有或获准分析该软件</label>
      </fieldset>:<>
        {!referenceOnly&&<label>作品类型<select value={type} onChange={e=>setType(e.target.value)} disabled={busy}><option value="TXT">文字 TXT</option><option value="IMG">图片 IMG</option><option value="WEB">网页截图 WEB</option><option value="FN">功能截图 FN</option></select></label>}
        <label>来源链接<input type="url" maxLength={2000} value={url} onChange={e=>setUrl(e.target.value)} required={referenceOnly} disabled={busy}/><small>仅保存链接，不自动抓取正文</small></label>
        {!referenceOnly&&<><label>贴文字<textarea rows={6} maxLength={50000} value={text} onChange={e=>setText(e.target.value)} disabled={busy}/></label>
          <div className="re-drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();upload([...e.dataTransfer.files]);}}><label>拖入本机截图<input type="file" aria-label="参照截图" accept="image/png,image/jpeg,image/webp" multiple disabled={busy} onChange={e=>upload([...e.target.files])}/></label><small>单张不超过8 MB · 只存本机</small>
            {media.map((m,i)=><p key={m.path}>截图 {i+1} · {m.size} 字节 <button type="button" className="text-btn" disabled={busy} onClick={()=>setMedia(media.filter(x=>x.path!==m.path))}>移除引用</button></p>)}</div></>}
      </>}
      <label>你看重的点<textarea maxLength={500} value={why} onChange={e=>setWhy(e.target.value)} disabled={busy}/></label>
      {error&&<p className="inline-error" role="alert">{error}</p>}
      <Button type="submit" disabled={busy}>{busy?'正在保存…':referenceOnly?'保存参考':'投入参照物'}</Button>
    </form>
  </Dialog>;
}

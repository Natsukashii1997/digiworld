import { flyData } from './data-flight.js';
// 仅资产详情抽屉使用；明确点击才核验本机来源，不后台读取来源目录。
import React,{useRef,useState} from 'react';import {request} from './api.js';import {Button} from './components.jsx';
export function SkillSourceUpdate({asset,adoptState,notify}){
 const [preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false);
 async function run(adopting=false){if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   if(adopting){const result=await request('/skill-source-updates/adopt',{token:preview.token,revision:preview.revision});adoptState(result.state);flyData();setPreview(null);notify(result.alreadyAdopted?'已记录过此来源采用确认':'已记录本人采用确认；个人版本未替换');}
   else setPreview(await request('/skill-source-updates/check',{assetId:asset.id}));
  }catch(e){setError(e.message||'来源更新核验失败');}finally{lock.current=false;setBusy(false);}
 }
 return <section className="context-preview" aria-label="Skill 来源更新">
  <strong>来源更新与采用确认</strong>
  <p className="detail-footnote">核验来源的最新版本；“已采用”只记录你的确认，不自动替换个人版本，也不表示已安装到 Agent。</p>
  <div className="heading-actions"><Button secondary disabled={busy} type="button" onClick={()=>run(false)}>核验来源更新</Button>
   {preview?.token&&<Button disabled={busy} type="button" onClick={()=>run(true)}>确认已采用此来源</Button>}</div>
  {preview&&<div role="status"><p>{preview.status==='updated'?'来源有新版，尚未确认采用':preview.status==='current'?'来源与当前采用基线一致':`待接入数据：${preview.reason}`}</p>
   {preview.source&&<><p className="reference-identity">{preview.source.title} · {preview.source.kind==='derived'?`v${preview.source.number}.0（${preview.source.versionId}）`:preview.source.location}</p>
    {preview.source.fingerprint&&<code className="context-hash">当前来源指纹 · {preview.source.fingerprint}</code>}</>}
   {preview.lastAdoption&&<p className="detail-footnote">最近本人确认：{preview.lastAdoption.at}；对应个人版本 {preview.lastAdoption.assetVersionId}</p>}</div>}
  {error&&<p className="inline-error" role="alert">{error}</p>}
 </section>;
}

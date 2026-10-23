import {ReverseNative} from './ReverseNative.jsx';
import {ReverseExecutor} from './ReverseExecutor.jsx';
import {currentPackVersion,matchingPackVersions,EXECUTOR_NAMES} from './reverse-ai.js';
import React, { useEffect, useRef, useState } from 'react';
import { Plus, Copy, Trash2, RotateCcw, ExternalLink } from 'lucide-react';
import { PageHeading, Button, Dialog } from './components.jsx';
import { request,writeState } from './api.js';
import {saveSpecimenTarget} from './reverse-target-actions.js';
import {ReversePrecheck,ReverseClues} from './ReversePrecheck.jsx';
import { ReverseInput } from './ReverseInput.jsx';
import { ReaUpdate } from './ReaUpdate.jsx';
import { buildReplicaPack, currentRun, isSoftware, reverseState, currentSkill, runMatchesTarget } from './reverse-v4.js';
import { deleteRecord, restoreRecord } from './reverse.js';
import './reverse-v16.css';
import './reverse-v4.css';

const code = r => isSoftware(r)?r.material.target.kind.toUpperCase():r.type||'TXT';
const source = r => r.material?.target?.path||r.material?.target?.url||r.material?.url||'本机原件';
const short = r => 'RE-'+r.id.replaceAll('-','').slice(0,4).toUpperCase();
const labels={running:'运行中',completed:'完成',failed:'失败',stopped:'已停止',interrupted:'已中断'};
function TerminalText({text,onEvidence}) {
  return text.split(/(ev_[a-f0-9]{64})(?![a-f0-9])/).map((part,index)=>/^ev_[a-f0-9]{64}$/.test(part)
    ? <button key={index} className="term-evidence" title={part} aria-label={'查看完整证据 ID '+part} onClick={()=>onEvidence(part)}>{part.slice(0,15)}</button>
    : part);
}
function OriginalImage({media,index}) {
  const [url,setUrl]=useState(''),[error,setError]=useState('');
  useEffect(()=>{let live=true,objectUrl;request('/reverse/media/read',media).then(r=>{objectUrl=URL.createObjectURL(new Blob([r.data],{type:r.type}));if(live)setUrl(objectUrl);else URL.revokeObjectURL(objectUrl);}).catch(e=>live&&setError(e.message));return()=>{live=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[media.path]);
  return url?<img src={url} alt={'原件截图 '+(index+1)}/>:<p role="status">{error||'正在读取原件…'}</p>;
}
function History({record}) {
  const data={...(record.recipe?{配方:record.recipe}:{}),...(record.recipeReply?{配方回复:record.recipeReply}:{}),
    ...(record.replicas?.length?{复刻与评分:record.replicas}:{}),...(record.variations?.length?{变体:record.variations}:{}),
    ...(record.replicaDraft?{复刻草稿:record.replicaDraft}:{}),...(record.imports?.length?{旧导入:record.imports}:{}),
    ...(record.reply?{旧回复:record.reply}:{}),...(record.pack?{旧任务包:record.pack}:{}),...(record.forge?{旧固定Skill:record.forge}:{})};
  if(!Object.keys(data).length)return null;
  return <details className="reverse-history"><summary>历史复刻记录（只读）</summary><pre>{JSON.stringify(data,null,2)}</pre></details>;
}
export function ReverseV16({state,save,notify,adoptState,onSelect,reverseJump,referenceJump}) {
  const [selected,setSelected]=useState(reverseJump?.id||null),[filter,setFilter]=useState('全部'),[drawer,setDrawer]=useState(''),[help,setHelp]=useState(false);
  const [runState,setRunState]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[expanded,setExpanded]=useState(false),[preview,setPreview]=useState(null),[saved,setSaved]=useState(null);
  const [webPrecheck,setWebPrecheck]=useState(null),[nativeBusy,setNativeBusy]=useState(false);
  const [resolvedPack,setResolvedPack]=useState(null),[evidenceId,setEvidenceId]=useState(null);
  const lock=useRef(false),terminal=useRef(null),requestId=useRef(null);
  const rows=(state.reverseRecords||[]).filter(r=>!r.deletedAt),visible=rows.filter(r=>filter==='全部'||(filter==='软件')===isSoftware(r));
  const record=visible.find(r=>r.id===selected)||visible[0];
  const localRun=runState?.recordId===record?.id?runState:null;
  const run=runMatchesTarget(record,localRun?.run)?localRun.run:currentRun(record),shown=record&&run?{...record,reaRuns:[...(record.reaRuns||[]).filter(r=>r.id!==run.id),run]}:record;
  const executor=state.reverseSettings?.executor||'codex',version=currentPackVersion(record),versions=matchingPackVersions(record),result=version&&version.executor!=='rea'?version.result:null;
  const basePack=shown?buildReplicaPack(shown):'',pack=record?.referenceMedia?.length?(resolvedPack?.recordId===record.id?resolvedPack.pack:''):basePack,software=isSoftware(record),running=run?.status==='running';
  async function refresh(){const next=await request('/workspace');adoptState(next);return next;}
  useEffect(()=>{setExpanded(false);setPreview(null);setSaved(null);setEvidenceId(null);setError('');requestId.current=null;setWebPrecheck(null);},[record?.id]);
  const packNode=useRef(null),packJumped=useRef(null),referenceNodes=useRef(new Map()),referencesNode=useRef(null);
  useEffect(()=>{
    if(!reverseJump || packJumped.current===reverseJump.key)return;
    if(!rows.some(r=>r.id===reverseJump.id)){packJumped.current=reverseJump.key;notify('当前任务包已删除或不可用，请重新搜索。','warning');return;}
    if(filter!=='全部')setFilter('全部');
    if(record?.id!==reverseJump.id){setSelected(reverseJump.id);return;}
    if(!packNode.current)return;
    packJumped.current=reverseJump.key;setExpanded(true);
    packNode.current.scrollIntoView({block:'center'});packNode.current.focus({preventScroll:true});
  },[reverseJump?.key,record?.id,filter,pack]);
  useEffect(()=>{
    if(!referenceJump)return;
    const node=referenceNodes.current.get(referenceJump.id);
    if(node){referencesNode.current.open=true;node.scrollIntoView({block:'center'});node.focus({preventScroll:true});}
  },[referenceJump?.key]);
  useEffect(()=>{setWebPrecheck(null);},[record?.id,JSON.stringify(record?.material?.target)]);
  useEffect(()=>{
    if(!record||!software||executor==='codex')return;let live=true,timer;
    async function poll(){try{
      const result=await request('/reverse/runs/query?recordId='+encodeURIComponent(record.id));
      if(!live)return;setRunState({...result,recordId:record.id});
      if(result.run?.status!=='running')await refresh();
      if(live)timer=setTimeout(poll,result.run?.status==='running'?500:3000);
    }catch(e){if(live){setError(e.message+' 恢复连接后会继续回读日志。');timer=setTimeout(poll,2000);}}}
    poll();return()=>{live=false;clearTimeout(timer);};
  },[record?.id,software,running,executor]);
  useEffect(()=>{if(!record?.referenceMedia?.length)return;let live=true;setResolvedPack(null);request('/reverse/pack?recordId='+record.id).then(v=>live&&setResolvedPack(v)).catch(e=>live&&setError(e.message));return()=>{live=false;};},[record?.id,record?.updatedAt,basePack]);
  useEffect(()=>{if(running&&terminal.current)terminal.current.scrollTop=terminal.current.scrollHeight;},[run?.sequence,running]);
  async function guarded(action){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action();}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}}
  async function begin(current,revision){
    const check=current.material.target.kind==='electron'?await request('/reverse/target/check',{path:current.material.target.path}):{};
    requestId.current ||= crypto.randomUUID();
    const result=await request('/reverse/runs/start',{recordId:current.id,requestId:requestId.current,checkId:check.checkId,expectedRevision:revision,executor});
    requestId.current=null;
    if(result.precheck){setWebPrecheck({...result.precheck,target:current.material.target});return;}
    setWebPrecheck(null);setRunState({...result,recordId:current.id});await refresh();terminal.current?.focus();
  }
  async function evidence(){await guarded(async()=>{
    if(running){const result=await request('/reverse/runs/stop',{recordId:record.id,runId:run.id});setRunState({...result,recordId:record.id});await refresh();return;}
    if(requestId.current){const checked=await request('/reverse/runs/query?recordId='+record.id+'&runId='+requestId.current);if(checked.run){setRunState({...checked,recordId:record.id});requestId.current=null;await refresh();return;}if(checked.busy)throw Error('上次请求仍在核对，请稍后再点开始查询结果；不会重复启动');}
    const latest=await refresh(),current=latest.reverseRecords.find(r=>r.id===record.id&&!r.deletedAt);
    if(!current||JSON.stringify(current.material.target)!==JSON.stringify(record.material.target))throw Error('参照物已变化，请核对后再开始');
    await begin(current,latest.revision);
  });}
  async function choosePage(page){await guarded(async()=>{
    if(!webPrecheck||webPrecheck.recordId!==record.id||!webPrecheck.candidates.some(p=>p.url===page.url&&p.targetId===page.targetId))throw Error('预检已变化，请重新开始');
    const next=await saveSpecimenTarget({read:()=>request('/workspace'),write:writeState,recordId:record.id,expectedRevision:webPrecheck.revision,expectedTarget:webPrecheck.target,patch:{url:page.url}});
    adoptState(next);setRunState(null);setPreview(null);setSaved(null);setWebPrecheck(null);
    await begin(next.reverseRecords.find(r=>r.id===record.id),next.revision);
  });}
  async function addClue(clue){await guarded(async()=>{
    if(!result?.clues?.includes(clue))throw Error('该词不属于当前AI结果');
    const next=await saveSpecimenTarget({read:()=>request('/workspace'),write:writeState,recordId:record.id,expectedRevision:state.revision,expectedTarget:record.material.target,patch:{clues:[...new Set([...(record.material.target.clues||[]),clue])]}});
    adoptState(next);setPreview(null);setSaved(null);notify('线索词已加入标本并回读');
  });}
  async function skillPreview(){await guarded(async()=>{
    const known=await request('/reverse/skill/query?recordId='+record.id);
    if(known.saved){setSaved(known);if(known.state)adoptState(known.state);return;}
    const latest=await refresh(),result=await request('/reverse/skill/preview',{recordId:record.id,expectedRevision:latest.revision});
    if(result.saved)setSaved(result);else setPreview(result);
  });}
  const keyboard=(e)=>{if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const index=visible.findIndex(r=>r.id===record.id);const next=e.key==='Home'?0:e.key==='End'?visible.length-1:(index+(['ArrowDown','ArrowRight'].includes(e.key)?1:-1)+visible.length)%visible.length;setSelected(visible[next].id);e.currentTarget.parentElement.children[next]?.focus();};
  return <>
    <PageHeading page="references" help={<button className="page-help" aria-label="逆向工程说明" onClick={()=>setHelp(true)}>?</button>} action={<div className="v3-act"><ReaUpdate/><Button onClick={()=>setDrawer('input')}><Plus size={16}/>投入参照物</Button></div>}/>
    <div className="re-layout reverse-four">
      <aside className="rail" aria-label="标本架"><div className="rail-filter simple" role="group" aria-label="筛选">{['全部','软件','作品'].map(label=><button key={label} aria-pressed={filter===label} onClick={()=>setFilter(label)}>{label}<span>{label==='全部'?rows.length:rows.filter(r=>(label==='软件')===isSoftware(r)).length}</span></button>)}</div>
        <div className="rail-list" role="radiogroup" aria-label="参照物">{visible.map(r=><button key={r.id} className={'rec'+(r.id===record?.id?' on':'')} role="radio" aria-checked={r.id===record?.id} tabIndex={r.id===record?.id?0:-1} onKeyDown={keyboard} onClick={()=>setSelected(r.id)} aria-label={'打开逆向记录 '+r.title}>
          <span className="rec-type"><span className="en">{code(r)}</span></span><b>{r.title}</b><span className="en-meta">{isSoftware(r)&&r.material.target.kind==='electron'?r.material.target.path.split('/').at(-1):source(r)} · {new Date(r.createdAt).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'})}</span><span className={'dot '+(reverseState(r)==='已存 Skill'?'done':reverseState(r)==='任务包就绪'?'verify':'todo')}>{reverseState(r)}</span>
        </button>)}</div>
        <details className="reverse-secondary" ref={referencesNode}><summary>参考与回收</summary><Button secondary onClick={()=>setDrawer('reference')}>保存参考</Button>
          {(state.references||[]).map(r=><p key={r.id} tabIndex={-1} ref={node=>{if(node)referenceNodes.current.set(r.id,node);else referenceNodes.current.delete(r.id);}}><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a><small>{r.note}</small></p>)}
          {(state.reverseRecords||[]).filter(r=>r.deletedAt).map(r=><p key={r.id}>{r.title}<button className="text-btn" disabled={busy} onClick={()=>guarded(async()=>{const latest=await refresh();await save({...latest,reverseRecords:restoreRecord(latest.reverseRecords,r.id)});})}><RotateCcw size={14}/>恢复</button></p>)}
        </details>
      </aside>
      <div className="re-main">{record?<div className="bench m-screen">
        <div className="sp-head"><span className="en">SPECIMEN · {code(record)}</span><h2>{record.title}</h2><span className="sp-meta">{source(record)} · {run?.summary?.sha256?'SHA '+run.summary.sha256.slice(0,8)+' · ':''}{short(record)}</span>
          <p className="sp-want"><b>{software?'想弄懂':'看重点'}</b>{software?record.material.target.feature:record.why||'按原件复刻'}{software&&(record.material.target.clues||[]).map(c=><span key={c} className="seed">{c}</span>)}</p></div>
        {software&&executor==='codex'?<ReverseNative key={record.id} record={record} state={state} adoptState={adoptState} notify={notify} onBusy={setNativeBusy} onExecutor={value=>guarded(async()=>{const latest=await refresh();await save({...latest,reverseSettings:{threshold:90,...latest.reverseSettings,executor:value}});})}/>:software?<section className="term" aria-label="REA取证终端"><div className="term-bar"><span className="en">{run&&run.executor&&run.executor!=='rea'?EXECUTOR_NAMES[run.executor]+' · 逆推终端':'REA · 取证终端'}</span><span className={'term-state '+(running?'run':run?.status==='completed'?'done':'idle')}>{labels[run?.status]||'待开始'}{run?.finishedAt?' · '+Math.max(0,Math.round((Date.parse(run.finishedAt)-Date.parse(run.startedAt))/1000))+' 秒':''}</span><div className="term-actions"><ReverseExecutor value={running?(run.executor||'rea'):executor} disabled={busy||running||nativeBusy} onChange={value=>guarded(async()=>{const latest=await refresh();await save({...latest,reverseSettings:{threshold:90,...latest.reverseSettings,executor:value}});})}/><button disabled={busy} onClick={evidence}>{busy?'正在核对…':running?'停止':executor!=='rea'?'开始逆推':run?'重新取证':'开始取证'}</button></div></div><p className="term-context">{executor==='rea'?'仅 REA 取证 · 不用额度':`将使用 ${EXECUTOR_NAMES[executor]} 额度 · 仅分析，不修改项目`}</p>
          {webPrecheck?.recordId===record.id&&JSON.stringify(webPrecheck.target)===JSON.stringify(record.material.target)&&<ReversePrecheck value={webPrecheck} busy={busy} onChoose={choosePage} onCopy={text=>guarded(async()=>{await navigator.clipboard.writeText(text);notify('Chrome 调试命令已复制');})}/>}
          <pre className="term-body" ref={terminal} tabIndex={0} aria-label="取证日志">{!run?(executor==='rea'?'点击开始取证，在本机运行 REA。不会调用模型。\n':'点击开始逆推，AI 将调用本机 REA 分析，并生成复刻任务包。\n'):run.log.map(l=><React.Fragment key={l.seq}><span className={l.text.startsWith('!')?'warn':l.text.startsWith('✓')?'ok':l.text.startsWith('$')?'command':'dim'}><TerminalText text={l.text} onEvidence={id=>{setError('');setEvidenceId(id);}}/></span>{'\n'}</React.Fragment>)}{run?.truncated&&<span className="warn">! 较早日志超过上限，已省略。{'\n'}</span>}{running&&<span className="cursor" aria-label="正在运行"/>}</pre>
          {run?.log.some(l=>l.detail)&&<details className="term-details"><summary>完整命令（{run.log.filter(l=>l.detail).length}）</summary><pre tabIndex={0} aria-label="完整命令详情">{run.log.filter(l=>l.detail).map(l=>l.detail).join('\n\n')}</pre></details>}
          {run?.error&&<p className="term-error" role="status">{run.error.kind}{run.error.code?' · '+run.error.code:''}：{run.error.message}</p>}
          {localRun?.persistencePending&&<p role="alert">结果写盘未确认，请检查磁盘；本次不会重复执行。</p>}
          {run?.status==='completed'&&localRun?.rawAvailable===false&&<p className="term-error">原始证据在此数据目录不可用（不随备份）；摘要与日志保留。</p>}
        </section>:<section className="orig" aria-label="作品原件"><span className="en">ORIGINAL · 原件</span>
          {!!record.referenceMedia?.length&&<div className="orig-shots">{record.referenceMedia.map((m,i)=><OriginalImage key={m.path} media={m} index={i}/>)}</div>}
          {record.material?.text&&<pre className="original-text">{record.material.text}</pre>}{!record.material?.text&&!record.referenceMedia?.length&&<p>未附截图或正文；原件为来源链接，复刻前需确认可访问。</p>}
          {record.material?.url&&<a href={record.material.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>打开来源</a>}
        </section>}
        {result&&!version?.nativeSource&&<section className="reverse-conclusions" aria-label="逆推结论"><ReverseClues version={version} target={record.material.target} busy={busy||running} onAdd={addClue}/><h3>逆推结论 <small>{EXECUTOR_NAMES[version.executor]} · 未经复刻验证</small></h3>{result.conclusions.length?result.conclusions.map((c,i)=><div className="conclusion-row" key={i}><span className={'conclusion-mark '+(c.mark==='推断'?'inferred':'')}>{c.mark}</span><p>{c.text}<span className="conclusion-evidence">{c.evidence.map(id=><TerminalText key={id} text={id} onEvidence={setEvidenceId}/>)}</span></p></div>):<p>未形成有证据编号的结论。</p>}{!!result.unknowns.length&&<div className="reverse-unknowns"><h4>未知项</h4>{result.unknowns.map(u=><p key={u.id}><b>{u.id}</b> {u.text}</p>)}</div>}</section>}
        {pack&&<section className="pack-out" aria-labelledby="reverse-pack-title"><div className="pack-top"><span className="en">TASK PACK</span><h3 id="reverse-pack-title">复刻任务包</h3><small>{pack.length.toLocaleString()} 字{version?.nativeSource?' · 原生回复固定版本':result?' · '+result.conclusions.length+' 条结论':software?' · 静态取证摘要':''}</small></div>
          {versions.length>0&&<div className="pack-versions"><label>任务包版本<select aria-label="任务包版本" value={version?.id||''} disabled={busy||running||nativeBusy} onChange={e=>{const versionId=e.target.value;guarded(async()=>{const latest=await refresh();adoptState(await request('/reverse/pack/select',{recordId:record.id,versionId,expectedRevision:latest.revision}));setPreview(null);setSaved(null);});}}>{versions.map((v,i)=><option key={v.id} value={v.id}>{i+1} · {EXECUTOR_NAMES[v.executor]} · {new Date(v.at).toLocaleString('zh-CN')}</option>)}</select></label><small>保留最近 8 个成功版本；已存 Skill 独立保留。</small></div>}
          <pre className={'pack-pre'+(expanded?' expanded':'')} data-testid="replica-pack" ref={packNode} tabIndex={-1}>{pack}</pre><button className="text-btn pack-expand" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'收起任务包':'展开任务包'}</button>
          <div className="pack-act"><Button disabled={busy} onClick={()=>guarded(async()=>{await navigator.clipboard.writeText(pack);notify('TRANSFER OK');})}><Copy size={16}/>复制任务包</Button>{record.type&&<button className="text-act" disabled={busy} onClick={skillPreview}>{currentSkill(record)?'查看已存 Skill':'存成 Skill'}</button>}<span className="hint">拿去 Codex 或 Claude Code 里粘贴即可</span></div>
        </section>}
        {!pack&&(record.savedSkill||record.forge)&&<button className="text-btn" disabled={busy} onClick={skillPreview}>查看已存 Skill</button>}
        {error&&<p className="inline-error" role="alert">{error}</p>}
        {!!(record.packSkills?.length||record.savedSkill)&&<details className="reverse-secondary"><summary>历史固定 Skill</summary>{[...(record.savedSkill?[record.savedSkill]:[]),...(record.packSkills||[])].map(p=><p key={p.assetId}><button className="text-btn" onClick={()=>onSelect(state.assets.find(a=>a.id===p.assetId))}>打开固定 Skill · {new Date(p.at).toLocaleString('zh-CN')}</button></p>)}</details>}
        <History record={record}/>
        <details className="reverse-secondary"><summary>参照物操作</summary><button className="text-btn" disabled={busy||running||nativeBusy} onClick={()=>guarded(async()=>{const latest=await refresh();await save({...latest,reverseRecords:deleteRecord(latest.reverseRecords,record.id)});})}><Trash2 size={14}/>移入回收区</button></details>
      </div>:<div className="bench m-screen bench-empty"><span className="en">SPECIMEN</span><h2>{rows.length?'当前筛选没有参照物':'投入第一件参照物'}</h2><p>软件在本机取证；文字和截图直接生成复刻任务包。</p><Button onClick={()=>rows.length?setFilter('全部'):setDrawer('input')}>{rows.length?'显示全部':'投入参照物'}</Button></div>}</div>
    </div>
    {drawer&&<ReverseInput state={state} save={save} notify={notify} onClose={()=>setDrawer('')} onCreated={id=>{setSelected(id);setFilter('全部');}} referenceOnly={drawer==='reference'}/>}
    {evidenceId&&<Dialog title="完整证据 ID" recoverFocus onClose={()=>{setEvidenceId(null);setError('');}}><code className="reverse-evidence-id">{evidenceId}</code>{error&&<p role="alert">{error}</p>}<Button disabled={busy} onClick={()=>guarded(async()=>{await navigator.clipboard.writeText(evidenceId);notify('完整证据 ID 已复制');})}>复制完整证据 ID</Button></Dialog>}
    {help&&<Dialog title="逆向工程" onClose={()=>setHelp(false)}><p>投入参照物。Codex 使用桌面自带的原生运行程序：选择相同工作目录、模型与权限，可连续追问并处理原生审批；选定回复后保存任务包。Claude Code 与仅 REA 保留原有取证流程；作品直接查看任务包。</p><p>存成 Skill 会先预览，再保存为资产仓库中的固定版本，标记“未经复刻验证”。不会自动安装。REA原始证据只留本机，不随备份。</p></Dialog>}
    {preview&&<Dialog title="存成 Skill · 预览" drawer recoverFocus onClose={()=>!busy&&setPreview(null)}><h2>{preview.title}</h2><p>未经复刻验证 · {preview.files.length} 个文本文件 · {preview.mediaCount} 张图片。保存到资产仓库，不安装到 Agent。</p><pre className="reverse-skill-preview">{preview.content}</pre><ul>{preview.files.map(f=><li key={f.path}>{f.path} · {f.bytes} 字节</li>)}</ul>{error&&<p role="alert">{error}</p>}<Button disabled={busy} onClick={()=>guarded(async()=>{const result=await request('/reverse/skill/confirm',{recordId:preview.recordId,token:preview.token,packVersionId:preview.packVersionId});if(!result.saved)throw Error('保存结果未确认，请先查询');adoptState(result.state);setPreview(null);setSaved(result);notify('固定 Skill 已保存并回读');})}>确认保存</Button><Button secondary disabled={busy} onClick={()=>guarded(async()=>{const result=await request('/reverse/skill/query?recordId='+preview.recordId+(preview.packVersionId?'&packVersionId='+preview.packVersionId:''));if(result.saved){adoptState(result.state);setSaved(result);setPreview(null);}else setError('尚未保存；可核对后确认。');})}>查询保存结果</Button></Dialog>}
    {saved&&<Dialog title="已存 Skill" onClose={()=>setSaved(null)}><p>{saved.title} · 固定版本已回读</p><p>{saved.legacy?'旧版复刻记录绑定的固定Skill。':'未经复刻验证。'}{!saved.unchanged&&'当前任务包已变化，此处保留的是早前固定版本。'}</p><Button onClick={()=>{onSelect(saved.state.assets.find(a=>a.id===saved.saved.assetId));setSaved(null);}}>打开资产</Button></Dialog>}
  </>;
}

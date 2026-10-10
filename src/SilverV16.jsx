// 派单175：品牌灵感墙、固定四类图鉴与来源心愿。媒体与抠图沿用已验本机流程。
import React, { useEffect, useRef, useState } from 'react';
import { Plus, Heart, Trash2, RotateCcw, ArrowRight, Pencil, X, ImagePlus } from 'lucide-react';
import { PageHeading, Button, Dialog } from './components.jsx';
import { Photo, Outline, FilePick, upload, DetailDialog } from './Silver.jsx';
import { useReducedMotion } from './v14.jsx';
import { request } from './api.js';
import { silverOf, ACCEPT, LIMITS, addWall, update, remove, restore, parsePrice } from './silver.js';
import { SILVER_TYPES, fixedCollectionsOf, itemCategory, legacyCategoriesOf, wallGroupsOf, featuredWallOf, wallNumbersOf, addWish, addFixedItem, setTarget, wishesOf, cancelWish, restoreWish } from './silver-v16.js';
import ring from './silver-sprites/sil-ring.png';
import necklace from './silver-sprites/sil-necklace.png';
import bangle from './silver-sprites/sil-bangle.png';
import pendant from './silver-sprites/sil-pendant.png';
import './silver-v16.css';
const silhouettes={ring,necklace,bangle,pendant},anchors=[[3,4],[22,13],[42,2],[11,55],[33,57]],angles=[-5,4,-2,6];
const number = n=>String(n).padStart(3,'0');
function useAlive(){const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);return alive;}
const date = value=>{const d=new Date(value);return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;};
function WallForm({ silver, record, initialFile, commit, onClose }) {
  const [fields,setFields]=useState({name:record?.name||'',author:record?.author||'',source:record?.source||'',sourceUrl:record?.sourceUrl||'',note:record?.note||''}),[file,setFile]=useState(initialFile||null),[error,setError]=useState(''),[busy,setBusy]=useState(false);const lock=useRef(false),alive=useAlive();
  async function submit(e) {
    e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try {
      if(fields.sourceUrl && !/^https?:$/.test(new URL(fields.sourceUrl).protocol))throw Error('来源链接只接受http或https');
      const photo=file?await upload(file,'photo'):null;if(!alive.current)return;
      if(!record && !photo)throw Error('请先选择图片');
      const next=record?update(silver,'wall',record.id,{...fields,image:photo?.file||record.image,sourceUrl:fields.sourceUrl||undefined}):addWall(silver,{...fields,image:photo.file});
      if(!record && fields.name.trim())next.wall[0]={...next.wall[0],name:fields.name.trim()};
      if(await commit(next))onClose();else setError('尚未确认保存，输入已保留，请核对页面提示');
    } catch(err) {setError(err.message||'保存失败');} finally {lock.current=false;if(alive.current)setBusy(false);}
  }
  return <Dialog title={record?'编辑灵感':'加灵感'} drawer onClose={()=>!lock.current&&onClose()}><form className="asset-form" onSubmit={submit}>
    <FilePick title="欣赏图" hint="jpg、png、webp，单张不超过8 MB" file={file} onFile={setFile} accept={ACCEPT} disabled={busy}/>
    {record&&!file&&<Photo file={record.image} alt="当前灵感图" className="silver-edit-photo"/>}
    {[['name','名称',LIMITS.itemName],['author','作者 / 品牌',LIMITS.author],['source','来源',LIMITS.source],['sourceUrl','来源链接',LIMITS.url]].map(([key,label,max])=><label key={key}>{label}<input value={fields[key]} maxLength={max} disabled={busy} onChange={e=>setFields({...fields,[key]:e.target.value})}/></label>)}
    <label>备注<textarea value={fields.note} maxLength={LIMITS.note} disabled={busy} onChange={e=>setFields({...fields,note:e.target.value})}/></label>
    {error&&<p role="alert" className="inline-error">{error}</p>}<Button disabled={busy}>{busy?'保存中…':record?'保存修改':'加到灵感墙'}</Button>
  </form></Dialog>;
}
function FillForm({ silver, initialKey, initialWish, commit, onClose, notify, onFilled }) {
  const [key,setKey]=useState(initialKey||'ring'),[wishId,setWishId]=useState(initialWish||''),[file,setFile]=useState(null),[name,setName]=useState(''),[boughtAt,setBoughtAt]=useState(''),[price,setPrice]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false),alive=useAlive();
  const pending=fixedCollectionsOf(silver).find(t=>t.key===key)?.wishes||[];
  async function submit(e) {
    e.preventDefault();if(lock.current)return;setError('');if(!name.trim())return setError('请填写名称');const parsed=parsePrice(price);if(parsed===null)return setError('价格需要是非负数，最多两位小数');lock.current=true;setBusy(true);
    try {
      if(wishId&&!pending.some(w=>w.id===wishId))throw Error('心愿已实现或不可用，请重新选择');const photo=await upload(file,'photo');if(!alive.current)return;let cut;
      try{cut=await request('/silver/cutout',{file:photo.file});}catch(err){cut={status:'unavailable',reason:err.message||'抠图服务没有响应'};}
      if(!alive.current)return;const {silver:next,item}=addFixedItem(silver,key,{image:photo.file,name,boughtAt:boughtAt||undefined,price:parsed,note},{wishId:wishId||undefined});
      const result=cut.status==='ok'?update(next,'items',item.id,{silhouette:cut.file,silhouetteSource:'auto'}):next;
      if(!await commit(result)){setError('没保存上，藏品与心愿都未在界面推进；输入已保留');return;}
      onFilled(item.id);onClose();
      if(cut.status==='ok')notify(`已收录「${item.name}」，并自动生成了剪影`);else notify(`已收录「${item.name}」。自动抠图不可用：${cut.reason}。可在详情里手动上传剪影 PNG。`,'warning');
    }catch(err){setError(err.message||'保存失败');}finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  return <Dialog title="收录一件" drawer onClose={()=>!lock.current&&onClose()}><form className="asset-form" onSubmit={submit}>
    <label>品类<select value={key} disabled={busy} onChange={e=>{setKey(e.target.value);setWishId('');}}>{SILVER_TYPES.map(t=><option key={t.key} value={t.key}>{t.name}</option>)}</select></label>
    <FilePick compact title="实物图" hint="jpg、png、webp，单张不超过8 MB" file={file} onFile={setFile} accept={ACCEPT} disabled={busy}/>
    <label>名称<input value={name} maxLength={LIMITS.itemName} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
    <div className="form-row"><label>购入时间<input type="date" value={boughtAt} disabled={busy} onChange={e=>setBoughtAt(e.target.value)}/></label><label>价格（元，可选）<input inputMode="decimal" value={price} disabled={busy} onChange={e=>setPrice(e.target.value)}/></label></div>
    <label>备注<textarea value={note} maxLength={LIMITS.note} disabled={busy} onChange={e=>setNote(e.target.value)}/></label>
    {!!pending.length&&<label>实现了这个心愿<select value={wishId} disabled={busy} onChange={e=>setWishId(e.target.value)}><option value="">这件与心愿无关</option>{pending.map(w=><option key={w.id} value={w.id}>{silver.wall.find(r=>r.id===w.wallId)?.name||silver.wall.find(r=>r.id===w.wallId)?.author||'未命名灵感'}{silver.wall.find(r=>r.id===w.wallId)?.deletedAt?'（来源在回收区）':''}</option>)}</select></label>}
    {error&&<p className="inline-error" role="alert">{error}</p>}<Button disabled={busy}>{busy?'保存中…':'保存'}</Button>
  </form></Dialog>;
}
function WishForm({ silver, source, commit, onClose, notify }) {
  const [key,setKey]=useState('ring'),[error,setError]=useState(''),[busy,setBusy]=useState(false);const lock=useRef(false),alive=useAlive();
  async function submit(e){e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const result=addWish(silver,{wallId:source.id,categoryKey:key});if(!result.added){notify(result.wish.fulfilledItemId?'这条心愿已经实现':'这条心愿已经在图鉴里');onClose();return;}if(await commit(result.silver)){notify('心愿已加入图鉴');onClose();}else setError('尚未确认保存，心愿仍在界面保留，请核对页面提示');}catch(err){setError(err.message);}finally{lock.current=false;if(alive.current)setBusy(false);}}
  return <Dialog title="想要同款" drawer onClose={()=>!lock.current&&onClose()}><form className="asset-form" onSubmit={submit}><p>{source.name||source.author||'这张灵感图'}</p><label>品类<select value={key} disabled={busy} onChange={e=>setKey(e.target.value)}>{SILVER_TYPES.map(t=><option key={t.key} value={t.key}>{t.name}</option>)}</select></label>{error&&<p role="alert" className="inline-error">{error}</p>}<Button disabled={busy}>加入心愿</Button></form></Dialog>;
}
function WallDetail({ silver, record, numbers, commit, onClose, onWish, onEdit, onOther, origin }) {
  const photo=useRef(null),reduced=useReducedMotion(),[busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false),animation=useRef(null),ghost=useRef(null);
  useEffect(()=>{
    if(!origin?.node||reduced)return;
    const from=origin.rect,to=photo.current?.getBoundingClientRect();if(!to)return;
    const node=origin.node.cloneNode(true);node.classList.add('silver-flight-card');node.removeAttribute('aria-label');node.setAttribute('aria-hidden','true');node.removeAttribute('tabindex');node.disabled=true;Object.assign(node.style,{position:'fixed',inset:'auto',left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`,transform:'none',zIndex:201,pointerEvents:'none',margin:0,transformOrigin:'0 0'});const wrapper=document.createElement('div');wrapper.className='silver-v16 silver-flight';Object.assign(wrapper.style,{position:'fixed',inset:'0',zIndex:201,pointerEvents:'none'});wrapper.append(node);document.body.append(wrapper);ghost.current=wrapper;
    const run=node.animate([{transform:'none',opacity:1},{transform:`translate(${to.left-from.left}px,${to.top-from.top}px) scale(${to.width/from.width},${to.height/from.height})`,opacity:0}],{duration:420,easing:'cubic-bezier(.2,.8,.2,1)'});animation.current=run;run.finished.catch(()=>{}).finally(()=>wrapper.remove());return()=>{run.cancel();wrapper.remove();};
  },[record.id,reduced]);
  const group=silver.wall.filter(w=>!w.deletedAt&&w.id!==record.id&&w.author.trim().normalize('NFC').toLowerCase()===record.author.trim().normalize('NFC').toLowerCase());
  return <Dialog title="灵感详情" onClose={()=>!lock.current&&onClose()} recoverFocus><div className="silver-wall-sheet sheet"><div ref={photo} className="sheet-photo"><Photo file={record.image} alt={record.name||record.author||'灵感图'}/></div><div className="sheet-info"><span className="en">INSPIRATION · {record.author||'未署名'} · No.{number(numbers.get(record.id))}</span><h2>{record.name||'未命名灵感'}</h2><dl><div><dt>收进来的</dt><dd className="mono">{date(record.createdAt)}</dd></div><div><dt>来源</dt><dd>{record.sourceUrl?<a href={record.sourceUrl} target="_blank" rel="noreferrer">{record.source||'来源链接'} ↗</a>:record.source||'—'}</dd></div><div><dt>备注</dt><dd>{record.note||'—'}</dd></div></dl><div className="sheet-act"><Button disabled={busy} onClick={()=>onWish(record)}><Heart size={16}/>想要同款</Button><Button secondary disabled={busy} onClick={()=>onEdit(record)}><Pencil size={16}/>编辑</Button><button type="button" className="silver-sheet-recycle" disabled={busy} onClick={async()=>{if(lock.current)return;lock.current=true;setBusy(true);try{if(await commit(remove(silver,'wall',record.id)))onClose();else setError('尚未确认保存，请核对页面提示；原记录仍在界面保留');}finally{lock.current=false;setBusy(false);}}}><Trash2 size={16}/>移到回收区</button></div>{error&&<p className="inline-error" role="alert">{error}</p>}{!!group.length&&<div className="sheet-more"><span className="en">SAME BRAND · 同一堆</span><div className="mini">{group.map(w=><button key={w.id} aria-label={`打开灵感：${w.name||w.author} · No.${number(numbers.get(w.id))}`} disabled={busy} onClick={e=>onOther(w,e.currentTarget)}><Photo file={w.image} alt=""/></button>)}</div></div>}</div></div></Dialog>;
}
function Help({ silver, commit, onClose }) {
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);const lock=useRef(false),others=legacyCategoriesOf(silver),types=fixedCollectionsOf(silver);const history=silver.categories.filter(c=>c.deletedAt&&SILVER_TYPES.some(t=>t.name===c.name));
  return <Dialog title="这页怎么用" onClose={()=>!lock.current&&onClose()}><div className="asset-form"><p>加灵感，把喜欢的作品放上墙；点品牌堆展开，点卡片看详情。想要同款先选品类，收录实物时可实现心愿。照片只存本机，不进备份，也不上传。</p><fieldset><legend>目标数量</legend>{types.map(t=><label key={t.key}>{t.name}<input type="number" min="1" max="999" defaultValue={t.target} disabled={busy} onBlur={async e=>{const target=Number(e.target.value);if(target===t.target||lock.current)return;lock.current=true;setBusy(true);try{if(!await commit(setTarget(silver,t.key,target)))throw Error('尚未确认目标保存，请核对页面提示');}catch(err){setError(err.message);e.target.value=t.target;}finally{lock.current=false;setBusy(false);}}}/></label>)}</fieldset><details><summary>其他品类 · 只读（{others.length}）</summary>{others.length?others.map(c=><section key={c.id}><h3>{c.name}{c.deletedAt?'（已回收）':''} · 目标{c.target}</h3>{c.items.map(i=><div key={i.id} className="legacy-silver"><Photo file={i.image} alt={i.name}/><p>{i.name}{i.deletedAt?'（已回收）':''} · {i.boughtAt||'未填日期'} · {i.price===undefined?'未填价格':`¥${i.price}`}<br/>{i.note||'无备注'}</p>{i.silhouette&&<Outline file={i.silhouette} label={i.name}/>}</div>)}</section>):<p>没有其他品类。</p>}<p>这里保留旧品类与记录，不改名、不合并、不删除。固定四类的主计数不含这些品类。</p></details>{history.length>0&&<details><summary>已回收的旧四类（{history.length}）</summary>{history.map(c=><section key={c.id}><h3>{c.name} · 原目标{c.target}</h3><p>{silver.items.filter(i=>i.categoryId===c.id).map(i=>i.name+(i.deletedAt?'（已回收）':'')).join('、')||'没有藏品'}</p><Button secondary disabled={busy} onClick={async()=>{if(lock.current)return;lock.current=true;setBusy(true);try{if(!await commit(restore(silver,'categories',c.id)))setError('尚未确认恢复，请核对页面提示');}finally{lock.current=false;setBusy(false);}}}>恢复{c.name}原品类</Button></section>)}</details>}{error&&<p role="alert" className="inline-error">{error}</p>}</div></Dialog>;
}
function WishDetail({silver,wish,source,commit,onClose,onFill}) {
 const lock=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function cancel(){if(lock.current)return;lock.current=true;setBusy(true);try{if(await commit(cancelWish(silver,wish.id)))onClose();else setError('尚未确认保存，请核对页面提示；心愿仍在界面保留');}finally{lock.current=false;setBusy(false);}}
 return <Dialog title="心愿详情" onClose={()=>!lock.current&&onClose()}><div className="asset-form"><h2>{SILVER_TYPES.find(t=>t.key===wish.categoryKey)?.name} · {source?.name||source?.author||'未命名灵感'}</h2>{source&&<Photo file={source.image} alt="心愿来源" className="silver-wish-photo"/>}<p>{source?.deletedAt?'来源已在回收区，原关联仍保留。':'来源灵感保存在欣赏墙。'}</p>{wish.deletedAt?<p>这条心愿已取消；原记录与关联仍保留，可在回收区恢复。</p>:wish.fulfilledItemId?<p>这条心愿已实现{silver.items.find(i=>i.id===wish.fulfilledItemId)?.deletedAt?'，关联藏品已在回收区；恢复原藏品即可重新点亮。':'。'}</p>:<Button disabled={busy} onClick={onFill}>收录一件，实现心愿</Button>}<Button secondary disabled={busy||!!wish.deletedAt} onClick={cancel}>取消心愿</Button>{error&&<p role="alert" className="inline-error">{error}</p>}</div></Dialog>;
}
export function SilverV16({ state, save, notify }) {
  const silver=silverOf(state),groups=wallGroupsOf(silver),featured=featuredWallOf(silver),numbers=wallNumbersOf(silver),collections=fixedCollectionsOf(silver);
  const [fan,setFan]=useState(null),[wallForm,setWallForm]=useState(null),[fill,setFill]=useState(null),[detail,setDetail]=useState(null),[itemId,setItemId]=useState(null),[wishSource,setWishSource]=useState(null),[wishDetail,setWishDetail]=useState(null),[help,setHelp]=useState(false),[cutout,setCutout]=useState(null),[lit,setLit]=useState(null),[error,setError]=useState('');const origin=useRef(null),reduced=useReducedMotion(),lock=useRef(false);
  const alive=useAlive();
  useEffect(()=>{let live=true;request('/silver/status').then(s=>live&&setCutout(s.cutout),()=>live&&setCutout({available:false,reason:'检查失败'}));return()=>{live=false;};},[]);
  useEffect(()=>{if(!lit)return;const timer=setTimeout(()=>setLit(null),700);return()=>clearTimeout(timer);},[lit]);
  async function commit(next){if(lock.current||!alive.current)return false;lock.current=true;try{return await save({...state,silver:next});}finally{lock.current=false;}}
  function openWall(record,node){origin.current={node,rect:node.getBoundingClientRect()};setDetail(record.id);}
  const selected=silver.wall.find(w=>w.id===detail),item=silver.items.find(i=>i.id===itemId),wish=wishesOf(silver).find(w=>w.id===wishDetail),wishWall=wish&&silver.wall.find(w=>w.id===wish.wallId);
  const total=collections.reduce((n,t)=>n+t.items.length,0),target=collections.reduce((n,t)=>n+t.target,0),deleted=[...silver.wall.filter(w=>w.deletedAt).map(r=>['wall',r]),...silver.items.filter(i=>i.deletedAt&&itemCategory(silver,i)).map(r=>['items',r]),...wishesOf(silver).filter(w=>w.deletedAt).map(r=>['wishes',r])];
  return <div className="silver-v16"><PageHeading page="silver" description="只给自己看的银饰图鉴。" help={<button className="silver-help" aria-label="这页怎么用" onClick={()=>setHelp(true)}>?</button>} action={<><Button secondary onClick={()=>setWallForm({})}><ImagePlus size={16}/>加灵感</Button><Button onClick={()=>setFill({})}><Plus size={16}/>收录一件</Button></>}/><ul className="page-bounds"><li>图片只存本机</li><li>不进备份，也不上传</li></ul>
    <section className="wall" aria-label="灵感墙" onDragOver={e=>{if(e.dataTransfer.types.includes("Files"))e.preventDefault();}} onDrop={e=>{e.preventDefault();const file=e.dataTransfer.files?.[0];if(file&&!lock.current)setWallForm({file});}}><div className={`canvas${featured?'':' empty'}`} style={{'--wall-bands':Math.max(1,Math.ceil(groups.length/5))}}>
      {groups.map((g,index)=>{const opened=fan===g.key,records=opened?g.records:g.preview,[x,y]=anchors[index%5];return <div className={`pile${opened?' fan':''}`} key={g.key} style={{'--x':`${x}%`,'--y':`${y*7+700*Math.floor(index/5)}px`,'--fan-count':records.length}}><div className="pile-cards" style={opened?{'--fan-width':`${records.length*181}px`}:undefined}>{(opened?records:[...records].reverse()).map((record,j)=>{const k=opened?j:records.length-1-j;return <button className="pc" key={record.id} style={{'--k':k,'--r':`${angles[k%4]}deg`}} aria-label={`${g.name} 第 ${g.records.indexOf(record)+1} 张${opened?'，打开详情':'，展开品牌堆'}`} aria-expanded={opened} onClick={e=>opened?openWall(record,e.currentTarget):setFan(g.key)}><Photo file={record.image} alt=""/><span className="pc-cap mono">SILVER / {number(numbers.get(record.id))}</span></button>;})}</div><span className="pile-cap"><b className="mono">{g.name}</b><span className="mono">× {g.records.length}</span>{opened&&<button className="text-button" onClick={()=>setFan(null)}>收起</button>}</span></div>;})}
      {featured?<div className="hero-card" style={{'--x':'66%','--y':'9%'}}><span className="no-tag"><span className="en">No.</span>{number(numbers.get(featured.id))}</span><button className="pc big" aria-label={`${featured.author||'未署名'} · ${featured.name||'未命名灵感'}`} onClick={e=>openWall(featured,e.currentTarget)}><Photo file={featured.image} alt=""/><span className="pc-cap mono">{featured.author||'未署名'} / {number(numbers.get(featured.id))}</span></button><button className="bubble" onClick={()=>setWishSource(featured)}><Heart size={18}/>想要同款<span className="mono">→ 品类</span></button></div>:<><div className="pile ghost" style={{"--x":"40%","--y":"20%"}}><div className="pile-cards"><button className="pc ghost" aria-label="加第一张灵感" onClick={()=>setWallForm({})}><ImagePlus size={28}/></button><button className="pc ghost" style={{"--k":1,"--r":"5deg"}} aria-label="添加一张灵感" onClick={()=>setWallForm({})}/></div></div><p className="canvas-empty">看到喜欢的银饰，拖进来；同一个品牌会自动叠成一堆。</p></>}
    </div></section>
    <div className="rule" aria-hidden="true"><i/><span className="gem"/><i/></div><section className="dex case" aria-label="收藏格"><div className="case-head"><b className="mono-big">{String(total).padStart(2,'0')}<small>/ {target}</small></b><span className="cap">已收录</span></div><div className="cats">{collections.map(t=><div className="cat" key={t.key}><div className="cat-label"><b>{t.name}</b><span className="mono">{t.items.length}/{t.target}</span></div><div className="slots" aria-label={`${t.name}收藏格`}>{t.cells.map(cell=>{
      const label=cell.item?`${t.name}：${cell.item.name}${cell.item.silhouette?'':'（已收录，待补剪影）'}`:cell.wish?`${t.name} 心愿：${silver.wall.find(w=>w.id===cell.wish.wallId)?.author||'未署名'} 同款`:`${t.name}：待收录，点击上传`;
      return <button className={`slot ${cell.item?'filled':cell.wish?'wish':'default'}${cell.item?.id===lit?' is-lit':''}`} aria-label={label} key={cell.item?.id||cell.wish?.id||`empty-${cell.index}`} onClick={()=>cell.item?setItemId(cell.item.id):cell.wish?setWishDetail(cell.wish.id):setFill({key:t.key})}>{cell.item?cell.item.silhouette?<Outline file={cell.item.silhouette} label={cell.item.name} max={60} decorative/>:<Photo file={cell.item.image} alt="" className="sil collected-photo"/>:<img className="sil" src={silhouettes[t.key]} alt=""/>}</button>;
    })}</div></div>)}</div></section>
    {!!wishesOf(silver).length&&<details className="silver-wish-history"><summary>心愿记录 <span className="mono">{wishesOf(silver).length}</span></summary>{wishesOf(silver).map(w=><button className="text-button" key={w.id} onClick={()=>setWishDetail(w.id)}>{SILVER_TYPES.find(t=>t.key===w.categoryKey)?.name} · {silver.wall.find(r=>r.id===w.wallId)?.name||silver.wall.find(r=>r.id===w.wallId)?.author||'未命名灵感'} · {w.deletedAt?'已取消':w.fulfilledItemId?'已实现':'待实现'}</button>)}</details>}
    <details className="recycle"><summary><RotateCcw size={16}/>回收区 <span className="mono">{deleted.length}</span></summary>{deleted.length?deleted.map(([list,r])=><div className="silver-recycle-row" key={list+r.id}><span>{r.name||r.author||`${SILVER_TYPES.find(t=>t.key===r.categoryKey)?.name}心愿`}</span><Button secondary onClick={async()=>{setError('');try{await commit(list==='wishes'?restoreWish(silver,r.id):restore(silver,list,r.id));}catch(err){setError(err.message);}}}>恢复</Button></div>):<p>回收区是空的。</p>}{error&&<p className="inline-error" role="alert">{error}</p>}</details>
    {help&&<Help silver={silver} commit={commit} onClose={()=>setHelp(false)}/>}{wallForm&&<WallForm silver={silver} record={wallForm.id?wallForm:null} initialFile={wallForm.file} commit={commit} onClose={()=>setWallForm(null)}/>}{fill&&<FillForm silver={silver} initialKey={fill.key} initialWish={fill.wishId} commit={commit} onClose={()=>setFill(null)} notify={notify} onFilled={id=>setLit(reduced?null:id)}/>}
    {selected&&<WallDetail key={selected.id} silver={silver} record={selected} numbers={numbers} origin={origin.current} commit={commit} onClose={()=>setDetail(null)} onWish={r=>{setDetail(null);setWishSource(r);}} onEdit={r=>{setDetail(null);setWallForm(r);}} onOther={openWall}/>}
    {item&&<DetailDialog silver={silver} item={item} cutout={cutout} onWish={id=>{setItemId(null);setWishDetail(id);}} commit={commit} notify={notify} onClose={()=>setItemId(null)}/>}
    {wishSource&&<WishForm silver={silver} source={wishSource} commit={commit} notify={notify} onClose={()=>setWishSource(null)}/>}
    {wish&&<WishDetail key={wish.id} silver={silver} wish={wish} source={wishWall} commit={commit} onClose={()=>setWishDetail(null)} onFill={()=>{setWishDetail(null);setFill({key:wish.categoryKey,wishId:wish.id});}}/>}
  </div>;
}

import {NOTE_TYPES,noteTitle,hasNoteContent} from './note-types.js';
import {createNoteDoc,editorSignature,noteTilt} from './note-document.js';
import {NoteActions} from './NoteActions.jsx';
import {notePaper} from './note-paper.js';
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Pin,Minus,ArrowUpRight,StickyNote,ListTodo,Clock3} from 'lucide-react';
import {Pixel} from './Pixel.jsx';
import {useReducedMotion} from './v14.jsx';
import {NoteEditor,NoteLines} from './NoteEditor.jsx';
import {parseStoredNote,serializeEditorDoc,boundedDoc,sortedNotes,toggleEditorTask,storedEditorContent} from './note-document.js';
import {plainText} from './rich-note.js';
import {request,session} from './api.js';
import {createFloatingNotes} from './floating-notes-store.js';
import {recoveryStorage,hostMessage,isNative} from './floating-notes-bridge.js';
import './notes-v16.css';
import './floating-notes.css';
import './notes-types.css';
const stamp=value=>new Date(value).toLocaleString('en-US',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).replace(',','');
const content=storedEditorContent;
async function timedRequest(path,data,method){const abort=new AbortController();let timer;try{return await Promise.race([request(path,data,method,true,{signal:abort.signal}),new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('正在核对是否已保存…'));},15000);})]);}finally{clearTimeout(timer);}}
const typeIcons={plain:StickyNote,todo:ListTodo,timeline:Clock3};
const labels={saved:'已保存',saving:'保存中…',draft:'草稿已留在本机',failed:'没保存上',unknown:'正在核对是否已保存…',conflict:'需要你选一下'};
function ReadNote({note,onEdit,onToggle}){
 const doc=parseStoredNote(note),body=useRef(null),[long,setLong]=useState(false),[expanded,setExpanded]=useState(false);
 useLayoutEffect(()=>{const el=body.current;if(!el)return;const observer=new ResizeObserver(()=>setLong(el.scrollHeight>162));observer.observe(el);setLong(el.scrollHeight>162);return()=>observer.disconnect();},[note.text]);
 return <><div ref={body} className={'sn-body'+(long&&!expanded?' fn-truncated':'')} role="group" aria-label={'便签正文：'+plainText(note.text).slice(0,40)} tabIndex={0} onClick={e=>{if(!e.target.closest('input,label,button')&&!window.getSelection()?.toString())onEdit();}} onKeyDown={e=>{if(e.target===e.currentTarget&&e.key==='Enter'){e.preventDefault();onEdit();}}}><NoteLines doc={doc} onToggle={index=>onToggle(toggleEditorTask(doc,index))}/></div>{long&&<button className="sn-more" onClick={()=>setExpanded(v=>!v)}>{expanded?'收起全文':'展开全文'}</button>}</>;
}
export default function FloatingNotes(){
 const singleId=new URLSearchParams(location.search).get('noteId');
 const opening=useRef(false);
 const reduced=useReducedMotion();
 const [snapshot,setSnapshot]=useState({notes:[],records:{},ready:false,online:false}),[active,setActive]=useState(null),[doc,setDoc]=useState(null),[pinned,setPinned]=useState(!singleId&&!!window.floatingNoteWindow?.pinned),[message,setMessage]=useState(''),[collapsed,setCollapsed]=useState(false);
 const [deleting,setDeleting]=useState(null),deleteBusy=useRef(false);
 const forkOpening=useRef(false),live=useRef(true),initialized=useRef(null),editor=useRef(null),ime=useRef(false),timers=useRef({server:new Map()}),latest=useRef({active,doc});latest.current={active,doc,deleting};
 const [controller]=useState(()=>createFloatingNotes({api:timedRequest,storage:recoveryStorage(),identity:()=>session({retryUnbound:true}),protect:id=>id===latest.current.active&&(ime.current||editor.current?.isImporting()),onChange:value=>{if(live.current)setSnapshot(value);}}));
 const problem=e=>{if(live.current)setMessage(e.message||'暂时没保存上，内容仍在这里。');};
 function save(id){if(id===latest.current.active&&ime.current){clearTimeout(timers.current.server.get(id));timers.current.server.set(id,setTimeout(()=>save(id),1000));return Promise.resolve();}return controller.save(id).then(()=>{const r=controller.snapshot().records[id];if(r?.dirty&&r.phase==='draft'&&(r.base!==null||hasNoteContent(r))&&controller.snapshot().online)timers.current.server.set(id,setTimeout(()=>save(id).catch(problem),1000));}).catch(problem);}
 function changed(id,next){try{controller.change(id,content(next));if(id===latest.current.active)setDoc(next);clearTimeout(timers.current.local);clearTimeout(timers.current.server.get(id));timers.current.local=setTimeout(()=>controller.persist().catch(problem),300);timers.current.server.set(id,setTimeout(()=>save(id),1000));}catch(e){problem(e);}}
 async function flushLocal(){if(ime.current)return {ok:false,reason:'composition'};try{await editor.current?.flush();await controller.persist();for(const [id,r]of Object.entries(controller.snapshot().records))if(r.dirty||r.sent)save(id);return {ok:true};}catch(e){problem(e);return {ok:false,reason:'storage'};}}
 async function prepareNoteOpen(id){
  if(singleId)return {ok:false,message:'请从便签栏打开'};
  if(!controller.snapshot().ready)return {ok:false,pending:true};
  if(id===latest.current.active&&ime.current)return {ok:false,message:'中文输入尚未完成'};
  try{if(id===latest.current.active)await editor.current?.flush();await controller.persist();await controller.save(id);if(id===latest.current.active&&(ime.current||editor.current?.isImporting()))throw Error('输入尚未完成，请稍后再独立打开');const record=controller.snapshot().records[id];if(record&&(record.dirty||record.sent||record.phase==='conflict'))throw Error('请先保存这张便签，再独立打开');controller.finish(id);if(latest.current.active===id){latest.current={active:null,doc:null};setActive(null);setDoc(null);}await controller.persist();return {ok:true};}catch(e){problem(e);return {ok:false,message:e.message};}
 }
 async function collapse(){const result=await flushLocal();if(result.ok){if(isNative())await hostMessage('collapse');else setCollapsed(true);}}
 async function open(note,type='plain'){if(opening.current||deleting||ime.current||!controller.snapshot().ready||singleId&&!note)return;if(note&&controller.snapshot().records[note.id]?.deleteBase){openDelete(note);return;}opening.current=true;const previous=latest.current.active;try{if(!singleId&&note&&isNative()&&await hostMessage('activateNote',{id:note.id}))return;await editor.current?.flush();await controller.persist();if(!singleId&&note&&isNative()&&await hostMessage('activateNote',{id:note.id}))return;if(ime.current||editor.current?.isImporting()||deleteBusy.current||latest.current.deleting||latest.current.active!==previous)return;const old=latest.current.active;if(old){save(old);controller.finish(old);}const id=controller.begin(note);setActive(id);const entry=controller.snapshot().records[id];const next=note?parseStoredNote(entry):createNoteDoc(type);setDoc(next);if(!note)changed(id,next);setMessage('');}catch(e){problem(e);}finally{opening.current=false;}}
 async function finish(next){const id=latest.current.active;if(!id)return;changed(id,next);try{await controller.persist();setActive(null);setDoc(null);await save(id);controller.finish(id);}catch(e){problem(e);}}
 async function resolve(id,both){try{if(ime.current)return;await controller.persist();if(both){const nextId=await controller.keepBoth(id);if(singleId&&nextId){setActive(nextId);setDoc(parseStoredNote(controller.snapshot().records[nextId]));}else{setActive(null);setDoc(null);}}else{await controller.useRemote(id);setActive(null);setDoc(null);}setMessage('');}catch(e){problem(e);}}
 async function openDelete(note){
  if(deleteBusy.current||deleting)return;
  const pendingDelete=controller.snapshot().records[note.id];if(pendingDelete?.deleteBase){setDeleting({id:note.id,note:structuredClone(pendingDelete),stage:'unknown'});return;}
  if(ime.current||editor.current?.isImporting()){setMessage('输入或图片尚未保存，请稍后删除。');return;}
  deleteBusy.current=true;
  try{
   if(note.id===latest.current.active)await editor.current?.flush();
   clearTimeout(timers.current.server.get(note.id));await controller.persist();await controller.save(note.id);
   const state=controller.snapshot(),r=state.records[note.id];
   if(ime.current||editor.current?.isImporting()||r&&(r.dirty||r.sent||r.phase==='conflict'))throw Error('请先保存并核对这条便签，再删除。');
   const expected=r||state.notes.find(n=>n.id===note.id);if(!expected)throw Error('这条便签已在别处删除。');
   setDeleting({id:note.id,note:structuredClone(expected),stage:'confirm'});setMessage('');
  }catch(e){problem(e);}finally{deleteBusy.current=false;}
 }
 async function remove(){
  if(!deleting||deleteBusy.current)return;deleteBusy.current=true;setDeleting(v=>({...v,busy:true}));
  try{
   if(latest.current.active===deleting.id){latest.current={active:null,doc:null};setActive(null);setDoc(null);}
   const result=await controller.remove(deleting.id,deleting.note,{queryOnly:deleting.stage==='unknown'});
   if(result==='deleted'){if(latest.current.active===deleting.id){setActive(null);setDoc(null);}setDeleting(null);setMessage('已删除这条便签');}
   else if(result==='changed'){setDeleting(null);setMessage('便签已在别处修改，未继续删除；请核对新内容。');await controller.refresh();}
   else setDeleting(v=>({...v,busy:false,stage:result==='unknown'?'unknown':'confirm',error:result==='unknown'?'删除结果尚未确认，请查询结果。':'便签仍在本机，删除未完成。'}));
  }catch(e){problem(e);setDeleting(null);}finally{deleteBusy.current=false;}
 }
 async function retry(){await controller.refresh();for(const [id,r]of Object.entries(controller.snapshot().records))if(r.dirty||r.sent)await save(id);}
 useEffect(()=>{live.current=true;document.documentElement.classList.add('floating-notes-page');initialized.current??=controller.init();initialized.current.then(()=>{if(!live.current)return;const state=controller.snapshot();const first=singleId?(state.records[singleId]||Object.values(state.records).find(r=>r.forkedFrom===singleId)||state.notes.find(n=>n.id===singleId)):Object.values(state.records)[0];if(first?.deleteBase){setDeleting({id:first.id,note:structuredClone(first),stage:'unknown'});}else if(singleId&&first){const id=controller.begin(first);setActive(id);setDoc(parseStoredNote(controller.snapshot().records[id]));}else if(first){setActive(first.id);setDoc(parseStoredNote(first));}for(const r of Object.values(controller.snapshot().records))if(r.phase!=='conflict')save(r.id);});
 const refresh=()=>retry(),online=()=>retry();window.addEventListener('focus',refresh);window.addEventListener('online',online);
 return()=>{live.current=false;document.documentElement.classList.remove('floating-notes-page');window.removeEventListener('focus',refresh);window.removeEventListener('online',online);clearTimeout(timers.current.local);for(const timer of timers.current.server.values())clearTimeout(timer);};},[]);
 // 点到正在编辑的那张卡片之外才保存退出；卡片内的冲突、复制、删除按钮不算，类型按钮自己处理切换也不算（用户 2026-10-28）。
 const downTarget=useRef(null);useEffect(()=>{const down=e=>{downTarget.current=e.target;};document.addEventListener('pointerdown',down,true);return()=>document.removeEventListener('pointerdown',down,true);},[]);
 useEffect(()=>{window.floatingNotesHost={prepareCollapse:flushLocal,prepareNoteOpen,focus:()=>{setCollapsed(false);controller.refresh();},composition:()=>ime.current};return()=>{delete window.floatingNotesHost;};});
 useEffect(()=>{const r=snapshot.records[active];if(!singleId||active===singleId||!r||r.dirty||r.sent||forkOpening.current)return;forkOpening.current=true;(async()=>{controller.finish(active);await controller.persist();if(isNative()){await hostMessage('openNote',{id:active});await hostMessage('collapse');const original=controller.snapshot().notes.find(n=>n.id===singleId);if(original){const originalId=controller.begin(original);setActive(originalId);setDoc(parseStoredNote(controller.snapshot().records[originalId]));}else{setActive(null);setDoc(null);}}else location.replace('/?noteId='+encodeURIComponent(active)+'#/float');})().catch(problem).finally(()=>{forkOpening.current=false;});},[snapshot,active,singleId]);
 useEffect(()=>{if(!active||ime.current)return;const r=snapshot.records[active];if(!r){if(snapshot.ready){setActive(null);setDoc(null);}return;}if(r.dirty||r.sent||r.phase==='conflict')return;const next=parseStoredNote(r);if(doc&&editorSignature(doc)!==editorSignature(next))setDoc(next);},[snapshot,active]);
 const needsReconnect=Object.values(snapshot.records).some(r=>r.dirty||r.sent);
 useEffect(()=>{if(snapshot.online||!snapshot.recoveryReady||!needsReconnect)return;let cancelled=false,timer,delay=2000;const attempt=async()=>{try{await retry();}catch(e){problem(e);}if(!cancelled&&!controller.snapshot().online){delay=Math.min(delay*2,30000);timer=setTimeout(attempt,delay);}};timer=setTimeout(attempt,delay);return()=>{cancelled=true;clearTimeout(timer);};},[snapshot.online,snapshot.recoveryReady,needsReconnect]);
 const entries=Object.values(snapshot.records),states=entries.map(r=>r.phase),phase=['conflict','failed','unknown','saving','draft'].find(s=>states.includes(s))||'saved';
 useEffect(()=>{hostMessage('status',{phase,pinned})?.catch?.(problem);},[phase,pinned]);
 const merged=new Map(snapshot.notes.map(n=>[n.id,n]));for(const r of entries)if(r.dirty||r.deleteBase||r.id===active)merged.set(r.id,r);
 const notes=sortedNotes([...merged.values()]).filter(n=>!singleId||n.id===(active||singleId));
 const status=snapshot.storageError||message||snapshot.error||(!snapshot.online&&!snapshot.ready?'等待连接数码世界':(phase==='conflict'?`${states.filter(s=>s==='conflict').length} 条需要你选一下`:phase==='failed'?`${states.filter(s=>s==='failed').length} 条没保存上`:phase==='draft'?'草稿已留在本机，连上后自动保存':phase==='saved'?(notes.length?'已保存 · '+new Date(snapshot.savedAt||Date.now()).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}):'与数码世界随手记同步'):labels[phase]));
 function deleteKey(e){if(deleting&&e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!deleting.busy)setDeleting(null);}}
 function key(e){if(deleting&&e.key==='Escape'){e.preventDefault();if(!deleting.busy)setDeleting(null);return;}if(e.defaultPrevented||(e.nativeEvent||e).isComposing||ime.current)return;if(e.metaKey&&e.key==='Enter'&&latest.current.active){e.preventDefault();editor.current?.flush().then(finish).catch(problem);}else if(e.metaKey&&e.key.toLowerCase()==='n'){e.preventDefault();if(!singleId)open();}else if(e.key==='Escape'){e.preventDefault();collapse();}else if(['ArrowDown','ArrowUp'].includes(e.key)&&!e.target.closest('[contenteditable],input,textarea')){const cards=[...document.querySelectorAll('.fn-scroll [role="group"][tabindex="0"]')],index=cards.indexOf(e.target),next=cards[index+(e.key==='ArrowDown'?1:-1)];if(next){e.preventDefault();next.focus();}}}
 useEffect(()=>{window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
 function card(note){const r=snapshot.records[note.id],editing=active===note.id,conflict=r?.phase==='conflict',display=parseStoredNote(note),tone=notePaper(note.id,display);
 return <article key={note.id} data-note-id={note.id} className={`sn tone-${tone}${editing?' is-edit':''}${r?.phase==='failed'?' is-failed':''}${conflict?' is-conflict':''}`} style={{'--tilt':reduced||editing?'0deg':noteTilt(note.id)+'deg'}}><i className="sn-tape" aria-hidden="true"/><header><time className="sn-time">{stamp(note.at)}</time>{r?.dirty&&r.phase==='draft'&&<span className="sn-chip">草稿</span>}<NoteActions getDoc={()=>{if(editing){if(ime.current)throw Error("中文输入尚未完成");return editor.current?.flush()||doc;}return display;}} onDelete={()=>openDelete(note)} disabled={!!deleting}/>{singleId&&<div className="fn-single-controls"><button className="fn-icon" aria-label="关闭便签窗口" onClick={collapse}><Minus size={17}/></button></div>}</header>
 {deleting?.id===note.id&&<div className="sn-alert amber" role="alertdialog" aria-label="删除便签确认"><span className="grow">{deleting.error||'删除这条便签？'}</span><span className="acts"><button className="sn-btn red" disabled={deleting.busy} onClick={remove}>{deleting.busy?'正在核对…':deleting.stage==='unknown'?'查询删除结果':'确认删除'}</button><button className="sn-btn" disabled={deleting.busy} onClick={()=>setDeleting(null)}>取消</button></span></div>}
 {conflict&&<><div className="sn-alert amber" role="alert">这条在数码世界里也改过了</div><div className="sn-other"><b>别处的版本 · {r.current?stamp(r.current.at):'已移除'}</b><span>{r.current?plainText(r.current.text):'这条便签已在别处删除。'}</span></div><div className="sn-mine">我的版本</div></>}
 {!editing&&note.title?.trim()&&<h3 className="sn-title" onClick={()=>open(note)}>{note.title}</h3>}

 {editing&&doc?<NoteEditor key={note.id} value={doc} busy={deleting?.id===note.id} onChange={next=>changed(note.id,next)} onPost={singleId?async next=>{changed(active,next);await controller.persist();await save(active);}:finish} onCancel={collapse} onOutside={singleId?undefined:next=>{if(!downTarget.current?.closest?.('.sn.is-edit,.sn-type-tiles'))finish(next);}} onImeChange={value=>{ime.current=value;hostMessage('composition',value)?.catch?.(problem);}} controlRef={editor} toolbarVariant={conflict?'hidden':'compact'} toolbarEnd={<span className={'sn-state '+(r?.phase||'saved')} role="status">{labels[r?.phase||'saved']}</span>}/>:<ReadNote note={note} onEdit={()=>open(note)} onToggle={async next=>{try{if(deleting)return;if(!singleId&&isNative()&&await hostMessage('activateNote',{id:note.id}))return;const id=controller.begin(note);changed(id,next);}catch(e){problem(e);}}}/>}
 {r?.phase==='failed'&&<div className="sn-alert red" role="alert"><span className="grow">没保存上，内容还在这里。</span><span className="acts"><button className="sn-btn red" onClick={()=>save(note.id)}>重试</button><button className="sn-btn" onClick={()=>navigator.clipboard.writeText(plainText(note.text)).catch(problem)}>复制文字</button></span></div>}
 {conflict&&<div className="fn-conflict-actions"><div className="acts"><button className="sn-btn pri" onClick={()=>resolve(note.id,true)}>两条都留</button><button className="sn-btn" onClick={()=>resolve(note.id,false)}>用别处的</button></div></div>}
 </article>;}
 if(singleId)return <main onKeyDownCapture={deleteKey} className="notes-v16 fn-panel fn-single" aria-label="独立便签"><div className="fn-scroll">{notes.map(card)}{(!snapshot.ready||snapshot.storageError)&&<div className="fn-empty"><p role="alert">{snapshot.storageError||'正在连接数码世界，草稿保留在本机。'}</p><button className="sn-btn" onClick={retry}>重新连接</button></div>}{snapshot.ready&&!notes.length&&<p role="status">这张便签已被移除。</p>}{message&&<p role="alert">{message}</p>}</div></main>;
 if(collapsed)return <main className="fn-standalone-collapsed"><button onClick={()=>{setCollapsed(false);controller.refresh();}}>打开便签栏</button></main>;
 return <main onKeyDownCapture={deleteKey} className="notes-v16 fn-panel" aria-label="桌面随手记"><header className="fn-hd" onPointerDown={e=>{if(!e.target.closest('button'))hostMessage('dragPanel')?.catch?.(problem);}}><Pixel sprite="mark_pencil" size={14}/><h3>随手记</h3><span className="n">{notes.length||'0'}</span><span className="sp"/><button className={'fn-icon'+(pinned?' on':'')} aria-label="钉住便签栏" aria-pressed={pinned} onClick={()=>setPinned(v=>!v)}><Pin size={17}/></button><button className="fn-icon" aria-label="收起便签栏" onClick={collapse}><Minus size={17}/></button></header>
 <div className="fn-scroll">{snapshot.ready&&<div className="sn-type-tiles" role="group" aria-label="按类型新建">{NOTE_TYPES.map(([type,label])=>{const Icon=typeIcons[type];return <button key={type} type="button" className={'sn-type-tile t-'+type} aria-label={'新建'+label} title={type==='plain'?'新建'+label+' · ⌘N':'新建'+label} disabled={!!deleting} onClick={()=>open(undefined,type)}><Icon size={17}/>{label.replace(/便签|事项/,'')}</button>;})}</div>}
 {(!snapshot.online&&!snapshot.ready||snapshot.storageError)&&<div className="fn-empty"><Pixel sprite="mark_pencil" size={40}/><b>数码世界还没有启动，写过的草稿都在本机</b>{(snapshot.storageError||snapshot.error)&&<span role="alert">{snapshot.storageError||snapshot.error}</span>}<button className="sn-btn" onClick={retry}>重试</button></div>}
 {notes.map(card)}{snapshot.ready&&!notes.length&&<div className="fn-empty"><Pixel sprite="mark_pencil" size={40}/><b>还没有便签</b><span>写下的每一条，也会出现在<br/>数码世界的随手记里。</span></div>}
 </div><footer className="fn-ft" data-s={!snapshot.online&&!snapshot.ready?'draft':phase}><i className="lamp" aria-hidden="true"/><span className="msg" role="status" title={status}>{status}</span>{phase==='failed'&&<button className="retry" onClick={retry}>重试</button>}<a className="open" href="/#notes" target="_blank" rel="noreferrer" onClick={e=>{if(isNative()){e.preventDefault();hostMessage('openMain')?.catch?.(problem);}}}>在数码世界打开<ArrowUpRight size={14}/></a></footer></main>;
}

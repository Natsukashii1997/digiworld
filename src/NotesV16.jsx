import { flyData } from './data-flight.js';
import { motionOrigin } from './scan-motion.js';
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Plus,Copy,Flame,Trash2} from 'lucide-react';
import {PageHeading,Button,Dialog} from './components.jsx';
import {NoteEditor,NoteLines} from './NoteEditor.jsx';
import {RefineDialog} from './WorkspacePages.jsx';
import {parseEditorDoc,parseStoredNote,serializeEditorDoc,boundedDoc,hasNoteTask,noteTilt,sortedNotes,toggleEditorTask} from './note-document.js';
import {captureBookmark} from './note-dom.js';
import {visibleLine} from './note-document.js';
import {plainText,NOTE_MAX} from './rich-note.js';
import {scrollsOf,addEntry} from './scrolls.js';
import {uid,now} from './store.js';
import {copy} from './Assets.jsx';
import {request} from './api.js';
import {useReducedMotion} from './v14.jsx';
import './notes-v16.css';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const stamp=value=>new Date(value).toLocaleString('en-US',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).replace(',','');
function selectedText(body,doc){const s=captureBookmark(body,doc);if(!s||s.collapsed)return '';return doc.lines.slice(s.start.line,s.end.line+1).map((l,i)=>visibleLine(l).slice(i===0?s.start.offset:0,i===s.end.line-s.start.line?s.end.offset:undefined)).join('\n').trim();}
function NoteCard({note,scrolls,onEdit,onToggle,onRefine,onDelete,notify,navigate,failed,reduced,motion}) {
 const body=useRef(null),captured=useRef(null),[expanded,setExpanded]=useState(false),[long,setLong]=useState(false),doc=parseStoredNote(note),tone=doc.lines.flatMap(l=>l.runs).find(r=>r.ink)?.ink||'plain';
 useLayoutEffect(()=>{const el=body.current;if(!el)return;const update=()=>setLong(el.scrollHeight>220);update();const observer=new ResizeObserver(update);observer.observe(el);return()=>observer.disconnect();},[note.text]);
 const whole=doc.mode==='md1'?plainText(note.text):note.text,title=whole.split('\n').find(line=>line.trim())?.trim().slice(0,80)||'未命名念头',scroll=scrolls.find(s=>s.id===note.refined?.scrollId&&!s.deletedAt);
 return <article className={`sn tone-${tone}${long&&!expanded?' is-long':''}${failed?' is-failed':''}${motion?' sn-motion-'+motion:''}`} style={{'--tilt':reduced?'0deg':noteTilt(note.id)+'deg'}} data-note-id={note.id}>
 <i className="sn-tape" aria-hidden="true"/><header><time className="sn-time" dateTime={note.at}>{stamp(note.at)}</time>{note.refined&&<button className="sn-refined" disabled={!scroll} aria-label={`查看已炼入的卷：${scroll?.name||'原卷'}`} onClick={()=>navigate('scrolls',{scrollId:note.refined.scrollId})}><span className="sn-seal"><Flame size={13}/><b>{scroll?.name||'原卷已回收'}</b></span></button>}</header>
 <div ref={body} className="sn-body" tabIndex={0} role="group" aria-label={`随手记正文：${whole.slice(0,40)}`} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onEdit(note);}}} onClick={e=>{if(e.target.closest('button,input,label,[data-note-ui]')||selectedText(body.current,doc))return;onEdit(note);}}><NoteLines doc={doc} onToggle={onToggle}/></div>
 {long&&<button className="sn-more" onClick={()=>setExpanded(v=>!v)}>{expanded?'收起全文':'展开全文'}</button>}
 <footer className="sn-act"><button className="sn-ico" aria-label={`复制：${title}（${note.id}）`} onClick={()=>copy(whole,notify)}><Copy size={16}/></button>{!note.refined&&<button className="sn-ico fire" aria-label={`炼入焚决：${title}（${note.id}）`} onPointerDown={()=>{captured.current=selectedText(body.current,doc);}} onClick={e=>{const text=e.detail===0?selectedText(body.current,doc):(captured.current??selectedText(body.current,doc));captured.current=null;onRefine(text||whole.trim(),!!text);}}><Flame size={16}/></button>}<button className="sn-ico delete" aria-label={`删除：${title}（${note.id}）`} onClick={()=>onDelete(note)}><Trash2 size={16}/></button></footer>
 </article>;
}
export function NotesV16({state,save,adoptState,notify,navigate}) {
 const [help,setHelp]=useState(false),[filter,setFilter]=useState('all'),[editing,setEditing]=useState(null),[draft,setDraft]=useState(()=>parseEditorDoc('')),[newDraft,setNewDraft]=useState(()=>parseEditorDoc('')),[ime,setIme]=useState(false),[optimistic,setOptimistic]=useState({}),[failure,setFailure]=useState(null),[busy,setBusy]=useState(false),[refining,setRefining]=useState(null),[refineBusy,setRefineBusy]=useState(false),[deleting,setDeleting]=useState(null),[motions,setMotions]=useState({});
 const motionTimers=useRef(new Map()),imeRef=useRef(false),editBase=useRef(null),lock=useRef(false),live=useRef(true),wall=useRef(null),reduced=useReducedMotion(),latest=useRef(state);latest.current=state;
 useEffect(()=>{live.current=true;return()=>{live.current=false;for(const timer of motionTimers.current.values())clearTimeout(timer);};},[]);
 const scrolls=scrollsOf(state),fresh=editing==='new',shown=sortedNotes(state.notes.map(n=>optimistic[n.id]||n)).filter(n=>filter==='all'||filter==='refined'?filter==='all'||!!n.refined:hasNoteTask(n));
 function start(note){if(lock.current||imeRef.current)return;if(failure&&failure.id!==note?.id){notify('先核对或重试失败输入，再编辑另一条。','warning');return;}if(fresh)setNewDraft(draft);editBase.current=note?structuredClone(note):null;setEditing(note?note.id:'new');setDraft(parseStoredNote(note));}
 function cancel(){if(lock.current)return;setEditing(null);if(fresh)setNewDraft(draft);else setDraft(newDraft);}
 function markMotion(id,kind){if(!kind)return;clearTimeout(motionTimers.current.get(id));setMotions(old=>({...old,[id]:kind}));motionTimers.current.set(id,setTimeout(()=>{if(live.current)setMotions(old=>{const next={...old};delete next[id];return next;});},kind==='task'?240:700));}
 function accepted(attempt,actual){if(!live.current)return;setFailure(null);setEditing(null);markMotion(attempt.id,attempt.kind==='new'?'land':attempt.motion);if(attempt.kind==='new'){setDraft(parseEditorDoc(''));setNewDraft(parseEditorDoc(''));}else setDraft(newDraft);notify('已保存本地随手记');flyData(attempt.source||motionOrigin());if(actual)adoptState?.(actual);}
 async function send(attempt,base=latest.current){if(lock.current)return;lock.current=true;attempt={...attempt,source:motionOrigin()};setBusy(true);if(attempt.kind==='edit')setOptimistic(old=>({...old,[attempt.id]:attempt.note}));try{const next={...base,notes:attempt.kind==='new'?[attempt.note,...base.notes]:base.notes.map(n=>n.id===attempt.id?attempt.note:n)};if(await save(next,{motion:false}))accepted(attempt);else if(live.current){setEditing(null);setFailure(attempt);}}finally{lock.current=false;if(live.current){setBusy(false);setOptimistic(old=>{const next={...old};delete next[attempt.id];return next;});}}}
 async function post(doc=draft){if(lock.current||imeRef.current)return;if(failure&&(editing===failure.id||fresh&&failure.kind==='new'))return retry(doc);const existing=fresh?null:editBase.current;if(existing&&serializeEditorDoc(doc)===existing.text&&doc.mode===parseStoredNote(existing).mode){setEditing(null);return;}let text;try{text=serializeEditorDoc(boundedDoc(doc));}catch(e){notify(e.message,'warning');return;}if(!text.trim())return;const original=fresh?null:editBase.current;if(!fresh&&!same(latest.current.notes.find(n=>n.id===editing),original)){notify('这条记录已被其他页面修改；当前输入已保留，请核对后再保存。','error');return;}if(!fresh&&!original)return;if(original&&text===original.text&&doc.mode===parseStoredNote(original).mode){setEditing(null);return;}
 const note={...(original||{}),id:original?.id||uid(),at:original?.at||now(),text};if(doc.mode==='md1'&&!(doc.legacyInk&&doc.lines.every(l=>l.kind==='p')))note.format='md1';else if(!original?.format)delete note.format;
 await send({kind:fresh?'new':'edit',id:note.id,before:original,note,doc});}
 async function retry(desired){if(lock.current||imeRef.current||!failure)return;let attempt=failure;lock.current=true;setBusy(true);let loaded;try{loaded=await request('/workspace');if(!live.current)return;const actual=loaded.notes.find(n=>n.id===attempt.id);if(same(actual,attempt.note)){
 if(!desired||serializeEditorDoc(desired)===attempt.note.text){accepted(attempt,loaded);return;}
 attempt={...attempt,kind:'edit',before:actual};
 }else if(attempt.kind==='new'?!!actual:!same(actual,attempt.before)){notify('这条记录已被其他页面修改；失败输入仍保留，请核对后重新编辑。','error');return;}}catch(e){notify(e.message,'error');return;}finally{lock.current=false;if(live.current)setBusy(false);}if(live.current&&loaded){if(desired){try{boundedDoc(desired);const note={...attempt.note,text:serializeEditorDoc(desired)};if(desired.mode==='md1'&&!(desired.legacyInk&&desired.lines.every(l=>l.kind==='p')))note.format='md1';else if(!attempt.before?.format)delete note.format;attempt={...attempt,note,doc:desired};}catch(e){notify(e.message,'warning');return;}}await send(attempt,loaded);}}
 async function toggle(note,index){if(lock.current||imeRef.current||failure){if(failure)notify('先核对或重试失败输入，再修改任务。','warning');return;}let doc;try{doc=toggleEditorTask(parseStoredNote(note),index);}catch(e){notify(e.message,'warning');return;}await send({kind:'edit',id:note.id,before:note,note:{...note,text:serializeEditorDoc(doc)},doc,motion:'task'});}
 function openDelete(note){if(lock.current||imeRef.current||failure||editing){notify('请先完成当前编辑或核对失败输入，再删除便签。','warning');return;}setDeleting({note,stage:'confirm'});}
 async function readDeleteResult(note){
  try{
   const loaded=await request('/workspace');
   if(!live.current)return;
   adoptState?.(loaded);
   const actual=loaded.notes.find(item=>item.id===note.id);
   if(!actual){setDeleting(null);notify('已删除这条随手记');}
   else if(!same(actual,note)){setDeleting(null);notify('便签已被其他页面修改，未继续删除；请核对新内容。','warning');}
   else setDeleting({note,stage:'confirm',error:'便签仍在本机，删除未完成。可以重新尝试。'});
  }catch{if(live.current){setDeleting({note,stage:'unknown'});notify('删除结果暂时无法核对，请先查询结果，不要重复删除。','warning');}}
 }
 async function remove(){
  if(lock.current||!deleting||deleting.stage==='unknown')return;
  const note=deleting.note;
  lock.current=true;setBusy(true);
  try{
   let base;
   try{base=await request('/workspace');}
   catch{if(live.current)setDeleting({note,stage:'confirm',error:'本机数据暂时无法读取，未执行删除。请重试。'});return;}
   if(!live.current)return;
   adoptState?.(base);
   const actual=base.notes.find(item=>item.id===note.id);
   if(!actual){setDeleting(null);notify('这条随手记已删除');return;}
   if(!same(actual,note)){setDeleting(null);notify('便签已变化，未执行删除；请核对后再试。','warning');return;}
   await save({...base,notes:base.notes.filter(item=>item.id!==note.id)});
   await readDeleteResult(note);
  }
  finally{lock.current=false;if(live.current)setBusy(false);}
 }
 async function checkDelete(){if(lock.current||!deleting)return;lock.current=true;setBusy(true);try{await readDeleteResult(deleting.note);}finally{lock.current=false;if(live.current)setBusy(false);}}
 async function refine(scrollId){if(lock.current||imeRef.current||failure||!refining)return;lock.current=true;setRefineBusy(true);try{const base=latest.current,note=base.notes.find(n=>n.id===refining.note.id);if(!same(note,refining.note)){notify('原随手记已变化，请重新选择要炼入的内容。','error');return;}const {scrolls:next,entry}=addEntry(scrollsOf(base),scrollId,refining.text);const at=now();if(await save({...base,scrolls:next,notes:base.notes.map(n=>n.id===note.id?{...n,refined:{scrollId,entryId:entry.id,at}}:n)})){if(live.current){setRefining(null);markMotion(note.id,'stamp');}notify(`已炼入「${next.find(s=>s.id===scrollId).name}」`);}}finally{lock.current=false;if(live.current)setRefineBusy(false);}}
 useLayoutEffect(()=>{const root=wall.current;if(!root)return;let timer;const layout=()=>{clearTimeout(timer);timer=setTimeout(()=>{for(const child of root.children){const content=child.firstElementChild;const height=content?.getBoundingClientRect().height||0;child.style.gridRowEnd=`span ${Math.ceil((height+(parseFloat(getComputedStyle(root).rowGap)||0))/(8+(parseFloat(getComputedStyle(root).rowGap)||0)))}`;}},0);};const observer=new ResizeObserver(layout);for(const child of root.children)if(child.firstElementChild)observer.observe(child.firstElementChild);layout();return()=>{clearTimeout(timer);observer.disconnect();};},[shown.map(n=>n.id).join('|'),editing,filter,failure]);
 const editor=<NoteEditor value={draft} onImeChange={value=>{imeRef.current=value;setIme(value);}} onChange={doc=>{setDraft(doc);if(fresh)setNewDraft(doc);}} onPost={post} onCancel={cancel} busy={busy} newNote={fresh} onOutside={fresh?undefined:doc=>post(doc)}/>;
 return <div className="notes-v16"><PageHeading page="notes" description="先把念头记下来；值得反复用的，炼入焚决。" help={<button className="sn-help" aria-label="这页怎么用" onClick={()=>setHelp(true)}>?</button>}/><ul className="page-bounds"><li>只存本机</li></ul><div className="sn-page"><div className="sn-filter" role="group" aria-label="随手记筛选">{[['all','全部',state.notes.length],['tasks','待办',state.notes.filter(hasNoteTask).length],['refined','已炼',state.notes.filter(n=>n.refined).length]].map(([key,label,n])=><button className={filter===key?'on':''} key={key} aria-pressed={filter===key} disabled={busy||ime} onClick={()=>{if(lock.current||imeRef.current)return;if(editing&&!fresh)post();setFilter(key);}}>{label}<b>{n}</b></button>)}</div>
 {failure&&<div className="sn-save-failure" role="alert"><span>没保存上，已退回原文 · 失败输入仍保留。</span><Button secondary disabled={busy} onClick={()=>retry()}>核对并重试</Button><button className="text-button" disabled={busy} onClick={()=>{if(lock.current||imeRef.current)return;setDraft(failure.doc);editBase.current=failure.before;setEditing(failure.kind==='new'?'new':failure.id);}}>返回失败输入</button></div>}
 <div className={`sn-wall${shown.length<=4?' compact':''}`} ref={wall}>
 <div className={'sn-cell sn-new'+(fresh?' editing':'')}><div className={'sn-pad'+(fresh?' editing':'')}>{fresh?editor:<button className="sn-pad-enter" aria-label="记一条新念头" onClick={()=>{if(!lock.current&&!imeRef.current){if(failure&&failure.kind!=='new'){notify('先核对或重试失败输入，再记新念头。','warning');return;}setDraft(newDraft);setEditing('new');}}}><span className="sn-pad-hint"><Plus size={18}/>一个念头、一个问题……</span><span className="sn-pad-key">⌘↵ 贴上</span></button>}</div></div>
 {shown.map(note=><div className={'sn-cell'+(editing===note.id?' editing':'')} key={note.id}>{editing===note.id?<article className="sn sn-pad editing" data-note-id={note.id}><i className="sn-tape" aria-hidden="true"/><header><time className="sn-time">{stamp(note.at)}</time></header>{editor}</article>:<NoteCard note={note} scrolls={scrolls} reduced={reduced} motion={motions[note.id]} onEdit={start} onToggle={index=>toggle(note,index)} onDelete={openDelete} onRefine={(text,partial)=>{if(lock.current||imeRef.current||failure){if(failure)notify('先核对或重试失败输入，再炼入。','warning');return;}setRefining({note,text:text.slice(0,NOTE_MAX),partial});}} notify={notify} navigate={navigate} failed={failure?.id===note.id}/>}</div>)}
 </div>{!shown.length&&state.notes.length>0&&<p className="empty-line">没有符合这个筛选的随手记。</p>}
 </div>{help&&<Dialog title="这页怎么用" onClose={()=>setHelp(false)}><p>点空白便签记新念头，点正文原地编辑。三种列表为无序、有序和任务列表；五色为红、蓝、绿、黄、灰；输入“1.”后空格可开始有序列表。字色与列表直接显示；⌘↵贴上，旧便签点外面保存，Esc取消。勾选任务会保存在本机；便签右下角可删除整条记录，值得反复用的内容可选中后炼入焚决。</p></Dialog>}{refining&&<RefineDialog draft={refining} scrolls={scrolls} busy={refineBusy} navigate={navigate} onClose={()=>{if(!lock.current)setRefining(null);}} onConfirm={refine}/>}{deleting&&<Dialog title="删除随手记" onClose={()=>{if(!lock.current)setDeleting(null);}} recoverFocus><p>删除整条便签：<strong>{plainText(deleting.note.text).split('\n').find(line=>line.trim())?.slice(0,80)||'未命名念头'}</strong></p>{deleting.note.refined&&<p>已炼入焚决的内容会留在原卷中。</p>}{deleting.stage==='unknown'?<p role="alert">删除结果尚未确认。可以稍后关闭；再次删除前会先核对本机数据，不会盲目重放。</p>:deleting.error?<p role="alert">{deleting.error}</p>:null}<div className="form-actions"><Button secondary disabled={busy} onClick={()=>setDeleting(null)}>{deleting.stage==='unknown'?'稍后核对':'取消'}</Button>{deleting.stage==='unknown'?<Button disabled={busy} onClick={checkDelete}>核对删除结果</Button>:<Button className="sn-delete-confirm" disabled={busy} onClick={remove}>{busy?'删除中…':deleting.error?'重试删除':'确认删除'}</Button>}</div></Dialog>}</div>;
}

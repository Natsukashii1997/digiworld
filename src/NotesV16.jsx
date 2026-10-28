import {createNoteDoc} from './note-document.js';
import {emptyNotesDraft,validNotesDraft} from './note-drafts.js';
import {useWebDraft} from './useWebDraft.js';
import {registerPageGuard} from './navigation-guard.js';
import {NoteActions} from './NoteActions.jsx';
import {NOTE_TYPES,noteTitle,noteType,hasNoteContent} from './note-types.js';
import {notePaper} from './note-paper.js';
import { flyData } from './data-flight.js';
import { motionOrigin } from './scan-motion.js';
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Copy,Flame,Egg,StickyNote,ListTodo,Clock3} from 'lucide-react';
import {PageHeading,Button,Dialog} from './components.jsx';
import {NoteEditor,NoteLines} from './NoteEditor.jsx';
import {RefineDialog} from './WorkspacePages.jsx';
import {HatchPanel,RouteBadges} from './HatchPanel.jsx';
import {captureRouteIndex} from './capture-routes.js';
import {parseEditorDoc,parseStoredNote,serializeEditorDoc,boundedDoc,hasNoteTask,noteTilt,sortedNotes,toggleEditorTask,storedEditorContent} from './note-document.js';
import {captureBookmark} from './note-dom.js';
import {visibleLine} from './note-document.js';
import {imagePlainText,noteContent} from './note-image-model.js';
import {plainText,NOTE_MAX} from './rich-note.js';
import {scrollsOf,addEntry} from './scrolls.js';
import {uid,now} from './store.js';
import {request} from './api.js';
import {copy} from './Assets.jsx';
import {useReducedMotion} from './v14.jsx';
import './notes-v16.css';
import './notes-types.css';
const typeIcons={plain:StickyNote,todo:ListTodo,timeline:Clock3};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const stamp=value=>new Date(value).toLocaleString('en-US',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).replace(',','');
function selectedText(body,doc){const s=captureBookmark(body,doc);if(!s||s.collapsed)return '';return doc.lines.slice(s.start.line,s.end.line+1).map((l,i)=>visibleLine(l).slice(i===0?s.start.offset:0,i===s.end.line-s.start.line?s.end.offset:undefined)).join('\n').trim();}
function NoteCard({note,scrolls,routes,onEdit,onToggle,onRefine,onHatch,onDelete,notify,navigate,failed,reduced,motion}) {
 const body=useRef(null),captured=useRef(null),[expanded,setExpanded]=useState(false),[long,setLong]=useState(false),doc=parseStoredNote(note),tone=notePaper(note.id,doc);
 useLayoutEffect(()=>{const el=body.current;if(!el)return;const update=()=>setLong(el.scrollHeight>220);update();const observer=new ResizeObserver(update);observer.observe(el);return()=>observer.disconnect();},[note.text]);
 const whole=imagePlainText(doc.mode==='md1'?plainText(note.text):note.text,note.images),title=whole.split('\n').find(line=>line.trim())?.trim().slice(0,80)||'未命名念头',scroll=scrolls.find(s=>s.id===note.refined?.scrollId&&!s.deletedAt);
 return <article className={`sn tone-${tone}${long&&!expanded?' is-long':''}${failed?' is-failed':''}${motion?' sn-motion-'+motion:''}`} style={{'--tilt':reduced?'0deg':noteTilt(note.id)+'deg'}} data-note-id={note.id}>
 <i className="sn-tape" aria-hidden="true"/><header><time className="sn-time" dateTime={note.at}>{stamp(note.at)}</time>{note.refined&&<button className="sn-refined" disabled={!scroll} aria-label={`查看已炼入的卷：${scroll?.name||'原卷'}`} onClick={()=>navigate('scrolls',{scrollId:note.refined.scrollId})}><span className="sn-seal"><Flame size={13}/><b>{scroll?.name||'原卷已回收'}</b></span></button>}<NoteActions getDoc={()=>doc} onDelete={()=>onDelete(note)} deleteLabel={`删除：${title}（${note.id}）`}/></header>
 <RouteBadges routes={routes} scrolls={scrolls} skip={['scroll']}/>
 {note.title?.trim()&&<h3 className="sn-title" onClick={()=>onEdit(note)}>{note.title}</h3>}<div ref={body} className="sn-body" tabIndex={0} role="group" aria-label={`随手记正文：${whole.slice(0,40)}`} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onEdit(note);}}} onClick={e=>{if(e.target.closest('button,input,label,[data-note-ui]')||selectedText(body.current,doc))return;onEdit(note);}}><NoteLines doc={doc} onToggle={onToggle}/></div>
 {long&&<button className="sn-more" onClick={()=>setExpanded(v=>!v)}>{expanded?'收起全文':'展开全文'}</button>}
 <footer className="sn-act"><button className="sn-ico" aria-label={`复制：${title}（${note.id}）`} onClick={()=>copy(whole,notify)}><Copy size={16}/></button>{!note.refined&&<button className="sn-ico fire" aria-label={`炼入焚决：${title}（${note.id}）`} onPointerDown={()=>{captured.current=selectedText(body.current,doc);}} onClick={e=>{const text=e.detail===0?selectedText(body.current,doc):(captured.current??selectedText(body.current,doc));captured.current=null;onRefine(text||whole.trim(),!!text);}}><Flame size={16}/></button>}<button className="sn-ico hatch" aria-label={`孵化：${title}（${note.id}）`} onClick={()=>onHatch(whole.trim(),note.title?.trim()||title.replace(/^[-*]\s+|^\d+\.\s+|^\[[ x]\]\s+/,''))}><Egg size={16}/></button></footer>
 </article>;
}
export function NotesV16({state,save,adoptState,notify,navigate,noteJump,onHatchAsset}) {
 const recovery=useWebDraft('notes',validNotesDraft),[form,setForm]=useState(emptyNotesDraft),formRef=useRef(form),hydrated=useRef(false);
 const {editing,draft,newDraft,failure}=form;
 const [help,setHelp]=useState(false),[filter,setFilter]=useState('all'),[ime,setIme]=useState(false),[optimistic,setOptimistic]=useState({}),[busy,setBusy]=useState(false),[refining,setRefining]=useState(null),[refineBusy,setRefineBusy]=useState(false),[deleting,setDeleting]=useState(null),[motions,setMotions]=useState({});
 const newDrafts=useRef({}),motionTimers=useRef(new Map()),editorRef=useRef(null),imeRef=useRef(false),editBase=useRef(null),lock=useRef(false),live=useRef(true),wall=useRef(null),reduced=useReducedMotion(),latest=useRef(state);latest.current=state;
 const [hatching,setHatching]=useState(null);
 function snapshotForm(patch={}){return {...formRef.current,newDrafts:newDrafts.current,editBase:editBase.current,...patch};}
 function updateForm(patch){const next=snapshotForm(patch);formRef.current=next;setForm(next);if(hydrated.current)try{recovery.save(next);}catch{}}
 const setEditing=value=>updateForm({editing:value}),setDraft=value=>{const f=formRef.current.failure,editing=formRef.current.editing;updateForm({draft:value,...(f&&(editing===f.id||editing==='new'&&f.kind==='new')?{failure:{...f,desired:value}}:{})});},setNewDraft=value=>updateForm({newDraft:value}),setFailure=value=>updateForm({failure:value});
 useLayoutEffect(()=>{
  if(!recovery.ready||hydrated.current)return;hydrated.current=true;
  const value=recovery.value||emptyNotesDraft();newDrafts.current=value.newDrafts;editBase.current=value.editBase;
  const restored=value;formRef.current=restored;setForm(restored);
  if(value.failure){lock.current=true;setBusy(true);request('/workspace').then(actual=>{if(!live.current)return;const found=actual.notes.find(n=>n.id===value.failure.id);if(same(found,value.failure.note)&&!value.failure.desired)accepted(value.failure,actual);else {if(found&&same(found,value.failure.note)){editBase.current=found;updateForm({});}adoptState?.(actual);}}).catch(()=>{}).finally(()=>{lock.current=false;if(live.current)setBusy(false);});}
 },[recovery.ready]);
 useEffect(()=>registerPageGuard(()=>imeRef.current?'中文输入尚未完成，请先确认输入。':editorRef.current?.isImporting()?'图片正在保存，请稍后再切换页面。':''),[]);
 useEffect(()=>{live.current=true;return()=>{live.current=false;for(const timer of motionTimers.current.values())clearTimeout(timer);};},[]);
 // 阶段 2：去向筛选由目标侧引用推导（capture-routes.js）。
 const routeIndex=captureRouteIndex(state),routesOf=n=>routeIndex.routes('note',n.id),ROUTE_FILTERS={pending:n=>routeIndex.pending('note',n.id),delivered:n=>routesOf(n).some(r=>r.to==='project'&&!r.relayedAt),relayed:n=>routesOf(n).some(r=>r.to==='project'&&r.relayedAt),hatched:n=>routesOf(n).some(r=>r.to==='asset'),archived:n=>routesOf(n).some(r=>r.to==='archive')};
 const scrolls=scrollsOf(state),fresh=editing==='new',shown=sortedNotes(state.notes.map(n=>optimistic[n.id]||n)).filter(n=>filter==='all'||(ROUTE_FILTERS[filter]?ROUTE_FILTERS[filter](n):filter==='refined'?!!n.refined:filter==='tasks'?noteType(n)==='todo'||hasNoteTask(n):noteType(n)===filter));
 const lastJump=useRef(null);
 useEffect(()=>{
  if(!noteJump||lastJump.current===noteJump.key||editing||ime||busy||failure||deleting||refining||editorRef.current?.isImporting()||!recovery.ready)return;
  if(!state.notes.some(n=>n.id===noteJump.id)){lastJump.current=noteJump.key;notify('这条便签已被移除，请重新搜索。','warning');return;}
  if(filter!=='all'){setFilter('all');return;}
  const frame=requestAnimationFrame(()=>{const card=[...(wall.current?.querySelectorAll('[data-note-id]')||[])].find(el=>el.dataset.noteId===noteJump.id);if(!card)return;lastJump.current=noteJump.key;card.scrollIntoView({block:'center'});card.querySelector('.sn-body,[contenteditable],input')?.focus({preventScroll:true});});
  return()=>cancelAnimationFrame(frame);
 },[noteJump?.key,noteJump?.id,filter,state.notes,editing,ime,busy,failure,deleting,refining,recovery.ready]);
 function importing(){if(!editorRef.current?.isImporting())return false;notify('图片正在保存，请稍后再操作。','warning');return true;}
 const actualEdit=state.notes.find(n=>n.id===editing),editChanged=!!(editing&&!fresh&&editBase.current&&(!actualEdit||!same(noteContent(actualEdit),noteContent(editBase.current))));
 if(editing&&!fresh&&editBase.current&&!shown.some(n=>n.id===editing))shown.unshift(editBase.current);
 function start(note){if(!recovery.ready||importing())return;if(lock.current||imeRef.current)return;if(editChanged){notify('当前输入已保留，请先处理这条便签的冲突。','warning');return;}if(failure&&failure.id!==note?.id){notify('先核对或重试失败输入，再编辑另一条。','warning');return;}if(fresh)setNewDraft(draft);editBase.current=note?structuredClone(note):null;setEditing(note?note.id:'new');setDraft(parseStoredNote(note));}
 function create(type){if(!recovery.ready||importing()||lock.current||imeRef.current)return;if(editing&&!fresh)return;if(failure){if(failure.kind!=='new'){notify('先核对或重试失败输入，再记新便签。','warning');return;}setDraft(failure.desired||failure.doc);setEditing('new');return;}if(fresh)newDrafts.current[noteType(draft.meta)]=draft;else if(newDraft)newDrafts.current[noteType(newDraft.meta)]=newDraft;const next=newDrafts.current[type]||createNoteDoc(type);setNewDraft(next);setDraft(next);editBase.current=null;setEditing('new');}
 function cancel(){if(importing())return;if(lock.current)return;setEditing(null);if(fresh)setNewDraft(draft);else setDraft(newDraft);}
 function markMotion(id,kind){if(!kind)return;clearTimeout(motionTimers.current.get(id));setMotions(old=>({...old,[id]:kind}));motionTimers.current.set(id,setTimeout(()=>{if(live.current)setMotions(old=>{const next={...old};delete next[id];return next;});},kind==='task'?240:700));}
 function accepted(attempt,actual){if(!live.current)return;setFailure(null);setEditing(null);markMotion(attempt.id,attempt.kind==='new'?'land':attempt.motion);if(attempt.kind==='new'){delete newDrafts.current[noteType(attempt.doc.meta)];setDraft(createNoteDoc());setNewDraft(createNoteDoc());}else setDraft(newDraft);notify('已保存本地随手记');flyData(attempt.source||motionOrigin());if(actual)adoptState?.(actual);}
 async function send(attempt,base=latest.current){if(lock.current||!recovery.ready)return;try{const pending=snapshotForm({failure:attempt});recovery.save(pending);formRef.current=pending;setForm(pending);}catch{return;}lock.current=true;attempt={...attempt,source:motionOrigin()};setBusy(true);if(attempt.kind==='edit')setOptimistic(old=>({...old,[attempt.id]:attempt.note}));try{const next={...base,notes:attempt.kind==='new'?[attempt.note,...base.notes]:base.notes.map(n=>n.id===attempt.id?attempt.note:n)};if(await save(next,{motion:false,base})){accepted(attempt);return true;}else if(live.current){setEditing(null);setFailure(attempt);}}finally{lock.current=false;if(live.current){setBusy(false);setOptimistic(old=>{const next={...old};delete next[attempt.id];return next;});}}}
 async function post(doc=draft){if(importing())return;if(lock.current||imeRef.current)return;if(failure&&(editing===failure.id||fresh&&failure.kind==='new'))return retry(doc);const existing=fresh?null:editBase.current;if(existing&&same(noteContent(storedEditorContent(doc,{validate:false})),noteContent(existing))){setEditing(null);return true;}let text;try{text=serializeEditorDoc(boundedDoc(doc));}catch(e){notify(e.message,'warning');return;}if(fresh&&!hasNoteContent(storedEditorContent(doc)))return;const original=fresh?null:editBase.current;if(!fresh&&!same(latest.current.notes.find(n=>n.id===editing),original)){notify('这条记录已被其他页面修改；当前输入已保留，请核对后再保存。','error');return;}if(!fresh&&!original)return;if(original&&same(noteContent(storedEditorContent(doc)),noteContent(original))){setEditing(null);return true;}
 const note={...(original||{}),id:original?.id||uid(),at:original?.at||now(),...storedEditorContent(doc)};const savedImages=storedEditorContent(doc).images;if(savedImages)note.images=savedImages;else delete note.images;if(storedEditorContent(doc).format==='md1')note.format='md1';else if(!original?.format)delete note.format;
 return send({kind:fresh?'new':'edit',id:note.id,before:original,note,doc});}
 async function retry(desired){desired=desired||failure?.desired;if(importing())return;if(lock.current||imeRef.current||!failure)return;let attempt=failure;lock.current=true;setBusy(true);let loaded;try{loaded=await request('/workspace');if(!live.current)return;const actual=loaded.notes.find(n=>n.id===attempt.id);if(same(actual,attempt.note)){
 if(!desired||same(noteContent(storedEditorContent(desired)),noteContent(attempt.note))){accepted(attempt,loaded);return;}
 attempt={...attempt,kind:'edit',before:actual};
 }else if(attempt.kind==='new'?!!actual:!same(actual,attempt.before)){notify('这条记录已被其他页面修改；失败输入仍保留，请核对后重新编辑。','error');return;}}catch(e){notify(e.message,'error');return;}finally{lock.current=false;if(live.current)setBusy(false);}if(live.current&&loaded){if(desired){try{boundedDoc(desired);const note={...attempt.note,...storedEditorContent(desired)};const savedImages=storedEditorContent(desired).images;if(savedImages)note.images=savedImages;else delete note.images;if(storedEditorContent(desired).format==='md1')note.format='md1';else if(!attempt.before?.format)delete note.format;attempt={...attempt,note,doc:desired};}catch(e){notify(e.message,'warning');return;}}await send(attempt,loaded);}}
 async function toggle(note,index){if(!recovery.ready)return;if(editChanged){notify('当前输入已保留，请先处理这条便签的冲突。','warning');return;}if(lock.current||imeRef.current||failure){if(failure)notify('先核对或重试失败输入，再修改任务。','warning');return;}let doc;try{doc=toggleEditorTask(parseStoredNote(note),index);}catch(e){notify(e.message,'warning');return;}await send({kind:'edit',id:note.id,before:note,note:{...note,...storedEditorContent(doc)},doc,motion:'task'});}
 async function deleteEditing(note){
  if(importing()||lock.current||imeRef.current||failure||editChanged)return;
  try{const next=await editorRef.current.flush();if(!await post(next))return;const loaded=await request('/workspace');adoptState?.(loaded);const actual=loaded.notes.find(n=>n.id===note.id);if(!actual)return;
   if(!same(noteContent(actual),noteContent(storedEditorContent(next)))){notify('便签已在别处修改，请核对后再删除。','warning');return;}
   setDeleting({note:actual,stage:'confirm'});
  }catch(e){notify(e.message,'warning');}
 }
 function openDelete(note){if(!recovery.ready||importing())return;if(lock.current||imeRef.current||failure||editing){notify('请先完成当前编辑或核对失败输入，再删除便签。','warning');return;}setDeleting({note,stage:'confirm'});}
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
   await save({...base,notes:base.notes.filter(item=>item.id!==note.id)},{base});
   await readDeleteResult(note);
  }
  finally{lock.current=false;if(live.current)setBusy(false);}
 }
 async function checkDelete(){if(lock.current||!deleting)return;lock.current=true;setBusy(true);try{await readDeleteResult(deleting.note);}finally{lock.current=false;if(live.current)setBusy(false);}}
 async function refine(scrollId){if(lock.current||imeRef.current||failure||!refining)return;lock.current=true;setRefineBusy(true);try{const base=latest.current,note=base.notes.find(n=>n.id===refining.note.id);if(!same(note,refining.note)){notify('原随手记已变化，请重新选择要炼入的内容。','error');return;}const {scrolls:next,entry}=addEntry(scrollsOf(base),scrollId,refining.text);const at=now();if(await save({...base,scrolls:next,notes:base.notes.map(n=>n.id===note.id?{...n,refined:{scrollId,entryId:entry.id,at}}:n)},{base})){if(live.current){setRefining(null);markMotion(note.id,'stamp');}notify(`已炼入「${next.find(s=>s.id===scrollId).name}」`);}}finally{lock.current=false;if(live.current)setRefineBusy(false);}}
 useLayoutEffect(()=>{const root=wall.current;if(!root)return;let timer;const layout=()=>{clearTimeout(timer);timer=setTimeout(()=>{for(const child of root.children){const content=child.firstElementChild;const height=content?.getBoundingClientRect().height||0;child.style.gridRowEnd=`span ${Math.ceil((height+(parseFloat(getComputedStyle(root).rowGap)||0))/(8+(parseFloat(getComputedStyle(root).rowGap)||0)))}`;}},0);};const observer=new ResizeObserver(layout);for(const child of root.children)if(child.firstElementChild)observer.observe(child.firstElementChild);layout();return()=>{clearTimeout(timer);observer.disconnect();};},[shown.map(n=>n.id).join('|'),editing,filter,failure]);
 async function keepEdit(){if(importing())return;if(lock.current||imeRef.current)return;let text;try{text=serializeEditorDoc(boundedDoc(draft));}catch(error){notify(error.message,'warning');return;}if(!hasNoteContent(storedEditorContent(draft)))return;const note={id:uid(),at:now(),...storedEditorContent(draft)};await send({kind:'new',id:note.id,before:null,note,doc:draft});}
 const copyEditor=()=>{if(imeRef.current)throw Error("中文输入尚未完成");return editorRef.current?.flush()||draft;};
 const editor=<NoteEditor controlRef={editorRef} value={draft} onImeChange={value=>{imeRef.current=value;setIme(value);}} onChange={doc=>{setDraft(doc);if(fresh)setNewDraft(doc);}} onPost={post} onCancel={cancel} busy={busy||!recovery.ready} newNote={fresh} onOutside={fresh?undefined:doc=>post(doc)}/>;
 return <div className="notes-v16"><PageHeading page="notes" description="先把念头记下来，再孵化：投递到项目、孵成资产、收入焚决或归档。" action={<div className="sn-type-tiles" role="group" aria-label="按类型新建">{NOTE_TYPES.map(([type,label])=>{const Icon=typeIcons[type];return <button key={type} type="button" className={'sn-type-tile t-'+type} aria-label={'新建'+label} disabled={busy||ime||!recovery.ready} onClick={()=>create(type)}><Icon size={18}/>{label}</button>;})}</div>} help={<button className="sn-help" aria-label="这页怎么用" onClick={()=>setHelp(true)}>?</button>}/><div className="sn-page"><div className="sn-filter" role="group" aria-label="随手记筛选">{[['all','全部',state.notes.length],['plain','普通',state.notes.filter(n=>noteType(n)==='plain').length],['tasks','待办',state.notes.filter(n=>noteType(n)==='todo'||hasNoteTask(n)).length],['timeline','时间轴',state.notes.filter(n=>noteType(n)==='timeline').length],['refined','已炼',state.notes.filter(n=>n.refined).length],['pending','待孵化',state.notes.filter(ROUTE_FILTERS.pending).length],['delivered','已投递',state.notes.filter(ROUTE_FILTERS.delivered).length],['relayed','已交代',state.notes.filter(ROUTE_FILTERS.relayed).length],['hatched','已孵成',state.notes.filter(ROUTE_FILTERS.hatched).length],['archived','已归档',state.notes.filter(ROUTE_FILTERS.archived).length]].map(([key,label,n])=><button className={filter===key?'on':''} key={key} aria-pressed={filter===key} disabled={busy||ime} onClick={()=>{if(importing()||lock.current||imeRef.current)return;if(editing&&!fresh)post();setFilter(key);}}>{label}<b>{n}</b></button>)}</div>
 {recovery.error&&<div className="sn-save-failure" role="alert">{recovery.error}</div>}
 {failure&&<div className="sn-save-failure" role="alert"><span>保存结果待核对，输入仍保留。</span><Button secondary disabled={busy} onClick={()=>retry()}>核对并重试</Button><button className="text-button" disabled={busy} onClick={()=>{if(lock.current||imeRef.current)return;setDraft(failure.desired||failure.doc);editBase.current=failure.before;setEditing(failure.kind==='new'?'new':failure.id);}}>返回失败输入</button></div>}
 <div className={`sn-wall${shown.length<=4?' compact':''}`} ref={wall}>
 {/* 用户 2026-10-28 选样稿 3：新建胶囊在标题行右边，新便签只在编辑时占墙上第一格。 */}{fresh&&<div className="sn-cell sn-new editing"><div className="sn-pad editing">{editor}</div></div>}
 {shown.map(note=><div className={'sn-cell'+(editing===note.id?' editing':'')} key={note.id}>{editing===note.id?<article className={"sn sn-pad editing tone-"+notePaper(note.id,draft)} data-note-id={note.id}><i className="sn-tape" aria-hidden="true"/><header><time className="sn-time">{stamp(note.at)}</time><NoteActions getDoc={copyEditor} disabled={busy||ime||!!failure||editChanged} onDelete={()=>deleteEditing(note)}/></header>{editChanged&&<div className="sn-save-failure" role="alert"><span>这条记录已被其他页面修改或删除，当前输入已保留。</span><Button secondary disabled={busy||ime} onClick={keepEdit}>另存为新便签</Button><button className="text-button" disabled={busy||ime} onClick={()=>{if(importing())return;setFailure(null);setEditing(null);setDraft(newDraft);}}>用别处的</button></div>}{editor}</article>:<NoteCard note={note} scrolls={scrolls} routes={routesOf(note)} onHatch={(text,title)=>{if(lock.current||imeRef.current||failure){if(failure)notify('先核对或重试失败输入，再孵化。','warning');return;}setHatching({kind:'note',id:note.id,title,text});}} reduced={reduced} motion={motions[note.id]} onEdit={start} onToggle={index=>toggle(note,index)} onDelete={openDelete} onRefine={(text,partial)=>{if(lock.current||imeRef.current||failure){if(failure)notify('先核对或重试失败输入，再炼入。','warning');return;}setRefining({note,text:text.slice(0,NOTE_MAX),partial});}} notify={notify} navigate={navigate} failed={failure?.id===note.id}/>}</div>)}
 </div>{!shown.length&&state.notes.length>0&&<p className="empty-line">没有符合这个筛选的随手记。</p>}
 </div>{help&&<Dialog title="这页怎么用" onClose={()=>setHelp(false)}><p>点空白便签记新念头，点正文原地编辑。三种列表为无序、有序和任务列表；五色为红、蓝、绿、黄、灰；输入“1.”后空格可开始有序列表。字色与列表直接显示；⌘↵贴上，旧便签点外面保存，Esc取消。勾选任务会保存在本机；便签右上角可删除整条记录，值得反复用的内容可选中后炼入焚决。便签右下角的蛋打开孵化面板：投递到存档槽里的项目、孵成资产、收入焚决或归档。</p></Dialog>}{hatching&&<HatchPanel capture={hatching} routes={routeIndex.routes('note',hatching.id)} projects={state.connections?.projects||[]} scrolls={scrolls} adoptState={adoptState} notify={notify} navigate={navigate} onHatchAsset={onHatchAsset} onRefine={c=>{const note=state.notes.find(n=>n.id===c.id);if(note)setRefining({note,text:c.text.slice(0,NOTE_MAX),partial:false});}} onClose={()=>setHatching(null)}/>}{refining&&<RefineDialog draft={refining} scrolls={scrolls} busy={refineBusy} navigate={navigate} onClose={()=>{if(!lock.current)setRefining(null);}} onConfirm={refine}/>}{deleting&&<Dialog title="删除随手记" onClose={()=>{if(!lock.current)setDeleting(null);}} recoverFocus><p>删除整条便签：<strong>{plainText(deleting.note.text).split('\n').find(line=>line.trim())?.slice(0,80)||'未命名念头'}</strong></p>{deleting.note.refined&&<p>已炼入焚决的内容会留在原卷中。</p>}{deleting.stage==='unknown'?<p role="alert">删除结果尚未确认。可以稍后关闭；再次删除前会先核对本机数据，不会盲目重放。</p>:deleting.error?<p role="alert">{deleting.error}</p>:null}<div className="form-actions"><Button secondary disabled={busy} onClick={()=>setDeleting(null)}>{deleting.stage==='unknown'?'稍后核对':'取消'}</Button>{deleting.stage==='unknown'?<Button disabled={busy} onClick={checkDelete}>核对删除结果</Button>:<Button className="sn-delete-confirm" disabled={busy} onClick={remove}>{busy?'删除中…':deleting.error?'重试删除':'确认删除'}</Button>}</div></Dialog>}</div>;
}

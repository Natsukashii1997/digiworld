import {validNoteRich} from './note-rich.js';
import {noteMeta,validNoteMeta,hasNoteContent} from './note-types.js';
// The recovery store contains only unfinished work. state.notes remains authoritative.
import {noteContent as content,validNoteImages} from './note-image-model.js';
const same=(a,b)=>JSON.stringify(content(a))===JSON.stringify(content(b));
const MAX_DRAFTS=100,MAX_BYTES=1500000;
const validDeleteBase=b=>b===undefined||b&&typeof b==='object'&&!Array.isArray(b)&&typeof b.text==='string'&&b.text.length<=1000000&&validNoteMeta(b)&&validNoteRich(b)&&validNoteImages(b.images);
const valid=r=>r&&validDeleteBase(r.deleteBase)&&/^[a-zA-Z0-9_-]{1,100}$/.test(r.id)&&typeof r.text==='string'&&(r.text.length<=20000||r.text.length<=1000000&&!r.format&&!r.rich&&r.base?.text===r.text)&&typeof r.at==='string'&&validNoteRich(r)&&validNoteRich(r.base)&&validNoteRich(r.sent)&&validNoteRich(r.current)&&validNoteMeta(r.current||{})&&validNoteMeta(r)&&validNoteMeta(r.base||{})&&validNoteMeta(r.sent||{})&&validNoteImages(r.images)&&validNoteImages(r.base?.images)&&validNoteImages(r.sent?.images)&&validNoteImages(r.current?.images)&&(r.format===undefined||r.format==='md1')&&(r.base===null||typeof r.base?.text==='string');
export function createFloatingNotes({api,storage,identity,newId=()=>crypto.randomUUID(),onChange=()=>{},protect=()=>false}){
 let refreshGeneration=0,initializing=null,savedAt=null,notes=[],records={},rootIdentity=null,online=false,error='',storageError='',loaded=false,bound=false,serial=Promise.resolve();
 const pending=new Map();
 const snapshot=()=>({savedAt,notes:[...notes],records:structuredClone(records),online,error,storageError,recoveryReady:loaded,ready:loaded&&bound});
 const emit=()=>onChange(snapshot());
 function persist(){
  if(!loaded||!rootIdentity)return Promise.resolve();
  const value={version:1,rootIdentity,records:Object.values(records).filter(r=>r.dirty||r.sent||r.deleteBase).map(r=>({...r,phase:r.sent?'unknown':r.phase}))};
  const encoded=JSON.stringify(value);if(value.records.length>MAX_DRAFTS||encoded.length>MAX_BYTES){storageError='本机草稿区已满，请先保存已有便签。';emit();return Promise.reject(Error(storageError));}
  const task=serial.catch(()=>{}).then(()=>storage.save(value));serial=task;
  return task.then(()=>{storageError='';emit();},()=>{storageError='草稿暂时无法留在本机，请保留窗口并重试。';emit();throw Error(storageError);});
 }
 async function connect(){
  const generation=++refreshGeneration;
  const session=await identity();if(!/^[a-f0-9]{64}$/.test(session.dataRootIdentity||''))throw Error('暂时无法核对本机数据，请稍后重试。');
  if(rootIdentity&&rootIdentity!==session.dataRootIdentity)throw Error('本机资料位置已变化，草稿已保留，请回到原工作台核对。');
  rootIdentity=session.dataRootIdentity;bound=true;const result=await api('/notes');if(generation!==refreshGeneration)return;notes=result.notes;for(const [id,r]of Object.entries(records)){if(r.dirty||r.sent||r.deleteBase||r.phase==='conflict'||pending.has(id)||protect(id))continue;const actual=notes.find(n=>n.id===id);if(!actual){delete records[id];continue;}records[id]={...r,...content(actual),base:content(actual)};for(const key of ['type','title','rich','format','images'])if(actual[key]===undefined)delete records[id][key];}savedAt=new Date().toISOString();online=true;error='';
 }
 async function refresh(){if(!loaded)return init();try{await connect();}catch(e){online=false;error=e.message;}emit();}
 function init(){if(initializing)return initializing;initializing=initialize().finally(()=>initializing=null);return initializing;}
 // Only unfinished work belongs to the recovery root. Empty recovery metadata
 // must not lock a new app session out of an otherwise healthy workspace.
 async function initialize(){
  try{const recovered=await storage.load();if(recovered){if(recovered.version!==1||!Array.isArray(recovered.records)||recovered.records.length>MAX_DRAFTS||(recovered.records.length>0&&!/^[a-f0-9]{64}$/.test(recovered.rootIdentity||''))||!recovered.records.every(valid)||JSON.stringify(recovered).length>MAX_BYTES)throw Error('本机草稿需要核对，原文件已保留。');if(recovered.records.length)rootIdentity=recovered.rootIdentity;for(const r of recovered.records)records[r.id]={...r,dirty:!r.deleteBase,phase:r.sent||r.deleteBase?'unknown':'draft'};}loaded=true;}
  catch(e){storageError=e.message;emit();return;}
  await refresh();
 }
 function begin(note){if(!loaded||!bound)throw Error('请先连接数码世界。');const id=note?.id||newId();if(records[id])return id;if(Object.values(records).filter(r=>r.dirty||r.sent).length>=MAX_DRAFTS)throw Error('请先保存已有草稿。');records[id]={id,at:note?.at||new Date().toISOString(),text:note?.text||'',...noteMeta(note),...(note?.rich?{rich:structuredClone(note.rich)}:{}),...(note?.images?.length?{images:[...note.images]}:{}),...(note?.format?{format:note.format}:!note?{format:'md1'}:{}),base:content(note),dirty:false,phase:'saved'};emit();return id;}
 function change(id,value){const r=records[id];if(!r)throw Error('便签尚未打开');if(r.deleteBase)throw Error('请先查询删除结果，再继续编辑。');if(typeof value.text!=='string'||(value.text.length>20000&&!(value.text.length<=1000000&&!value.format&&!value.rich&&r.base?.text===value.text)))throw Error('便签内容超过上限');if(!validNoteImages(value.images))throw Error('图片引用无效');if(!validNoteMeta(value)||!validNoteRich(value))throw Error('便签类型或标题无效');for(const key of ['type','title','rich']){if(value[key]!==undefined)r[key]=value[key];else delete r[key];}r.text=value.text;if(value.images?.length)r.images=[...value.images];else delete r.images;if(value.format)r.format=value.format;else delete r.format;r.dirty=r.base===null&&!r.sent&&!hasNoteContent(r)?false:!same(r,r.base);if(r.phase!=='conflict'&&!r.sent)r.phase=r.dirty?'draft':'saved';emit();}
 async function accept(id,sent,actual){
  const r=records[id];if(!r)return;refreshGeneration++;notes=[actual,...notes.filter(n=>n.id!==id)];r.base=content(actual);delete r.sent;delete r.current;r.dirty=!same(r,actual);r.phase=r.dirty?'draft':'saved';savedAt=new Date().toISOString();online=true;error='';await persist();emit();
 }
 async function reconcile(id){
  const r=records[id],sent=r?.sent;if(!sent)return true;
  try{const {note:actual}=await api('/notes/'+encodeURIComponent(id));online=true;
   if(actual&&same(actual,sent)){await accept(id,sent,actual);return false;}
   if(same(actual,sent.base)){delete r.sent;r.phase='draft';await persist();return true;}
   delete r.sent;r.phase='conflict';r.current=actual;r.dirty=true;await persist();emit();return false;
  }catch(e){r.phase='unknown';online=false;error=e.message;await persist();emit();return false;}
 }
 async function performSave(id){
  let r=records[id];if(!r||r.deleteBase||(!r.dirty&&!r.sent)||r.phase==='conflict')return;
  if(!bound){await refresh();if(!bound)return;}
  if(r.sent&&!await reconcile(id))return;
  if(!online&&!r.sent){r.phase='draft';await persist();emit();return;}
  r=records[id];if(!r?.dirty||r.base===null&&!hasNoteContent(r))return;
  const sent={id,at:r.at,...content(r),base:r.base};r.sent=sent;r.phase='saving';
  await persist();emit();
  try{
   await api('/notes/'+encodeURIComponent(id),sent,'PUT');
   const {note:actual}=await api('/notes/'+encodeURIComponent(id));
   if(actual&&same(actual,sent))await accept(id,sent,actual);
   else{r.phase='conflict';r.current=actual;delete r.sent;await persist();}
  }catch(e){
   if(e.noteConflict){r.phase='conflict';r.current=e.currentNote;delete r.sent;await persist();}
   else{r.phase='unknown';emit();const retryable=await reconcile(id);if(retryable){r.phase='failed';await persist();}}
  }
  emit();
 }
 function save(id){if(pending.has(id))return pending.get(id);const task=performSave(id).finally(()=>pending.delete(id));pending.set(id,task);return task;}
 async function flush(){await persist();await Promise.all(Object.keys(records).map(id=>save(id)));}
 async function keepBoth(id){
  const r=records[id];if(!r||r.phase!=='conflict')return;
  const newNoteId=newId();if(records[newNoteId])throw Error('便签编号重复，请重试');
  records[newNoteId]={id:newNoteId,forkedFrom:r.forkedFrom||id,at:new Date().toISOString(),...content(r),base:null,dirty:true,phase:'draft'};
  // Persist the new identity and remove the old conflicting operation in one recovery snapshot.
  notes=notes.filter(n=>n.id!==id);if(r.current)notes.unshift(r.current);delete records[id];await persist();emit();await save(newNoteId);return newNoteId;
 }
 async function useRemote(id){
  if(pending.has(id))await pending.get(id);
  const {note}=await api('/notes/'+encodeURIComponent(id));notes=notes.filter(n=>n.id!==id);if(note)notes.unshift(note);delete records[id];await persist();emit();
 }
 async function remove(id,expected,{queryOnly=false}={}){
  if(pending.has(id))await pending.get(id);
  let r=records[id];
  if(!loaded||!bound||protect(id)||r&&(r.dirty||r.sent||r.phase==='conflict')||r&&!same(r,expected))throw Error('请先保存并核对这条便签，再删除。');
  if(r?.base===null&&!notes.some(n=>n.id===id)){
   delete records[id];await persist();emit();return 'deleted';
  }
  const alreadySent=!!r?.deleteBase;
  if(!queryOnly&&!alreadySent){
   if(!r){begin(expected);r=records[id];}
   r.deleteBase=content(expected);r.phase='unknown';await persist();emit();
   try{await api('/notes/'+encodeURIComponent(id),{base:content(expected)},'DELETE');}catch{/* Always read back; a lost reply must never trigger a second deletion. */}}
  let actual;
  try{({note:actual}=await api('/notes/'+encodeURIComponent(id)));}catch{return 'unknown';}
  if(actual){const result=same(actual,expected)?'present':'changed';if(r){delete r.deleteBase;r.phase='saved';}await persist();await refresh();return result;}
  refreshGeneration++;notes=notes.filter(n=>n.id!==id);delete records[id];savedAt=new Date().toISOString();await persist();emit();return 'deleted';
 }
 function finish(id){if(records[id]&&!records[id].dirty&&!records[id].sent&&!['unknown','conflict'].includes(records[id].phase)&&!pending.has(id)){delete records[id];emit();}}
 return {init,refresh,begin,change,save,persist,flush,keepBoth,useRemote,remove,finish,snapshot};
}

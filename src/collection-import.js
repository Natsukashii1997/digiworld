import {openDraftRecord,webDraftKey} from './web-draft.js';

const valid=value=>value===null || (value && /^[a-f0-9-]{36}$/.test(value.id) && ['unknown','saved'].includes(value.phase) && typeof value.at==='string' && (value.phase!=='saved'||typeof value.noteId==='string'));
const issue=(message,phase='unknown')=>Object.assign(Error(message),{importPhase:phase});

// Store only the receipt identity, never a dragged payload or signed media URL.
export function createCollectionImport({call,identity,storage,locks,newId=()=>crypto.randomUUID(),delay=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now()}){
 async function access(fn){
  const {dataRootIdentity}=await identity(),key=webDraftKey(dataRootIdentity,'collection-import');
  if(!locks?.request)throw issue('当前浏览器无法保护收藏核对记录，请保留原页面。','storage');
  return locks.request(key,{ifAvailable:true},async lock=>{
   if(!lock)throw issue('上次收藏仍在核对，请稍后点击核对；不会重复导入。');
   const record=openDraftRecord(storage,key,valid);
   try{return await fn(record);}finally{record.close();}
  });
 }
 async function resolve(record,operation,poll){
  let pending=record.read();
  const get=()=>call(`/operations/${pending.id}`);
  if(!operation && pending.phase!=='saved'){
   try{operation=await get();}catch{throw issue('收藏结果待核对，原操作编号已保留。请恢复连接后核对，不要重复导入。');}
  }
  const deadline=now()+40*60*1000;
  while(poll && operation?.status==='processing' && now()<deadline){
   await delay(800);
   try{operation=await get();}catch{throw issue('连接中断，收藏结果待核对；原操作编号已保留。');}
  }
  if(operation?.status==='complete'){
   pending={...pending,phase:'saved',noteId:operation.noteId,created:operation.created};record.save(pending);
  }else if(['failed','interrupted'].includes(operation?.status)){
   record.save(null);throw issue(operation.error||'这次收藏未完成，可以重新拖入。','failed');
  }else if(pending.phase!=='saved')throw issue(operation?.status==='processing'?'上次收藏仍在处理，请稍后核对。':'收藏结果待核对，原操作编号已保留。');
  try{
   const payload=await call('/notes'),workspace=await call('/desk-workspace');
   const note=payload.notes.find(n=>n.id===pending.noteId);
   return {notes:payload.notes,note:note||null,workspace,created:pending.created,operationId:pending.id};
  }catch{throw issue('收藏已保存，内容回读尚未完成。请恢复连接后核对上次收藏。','saved');}
 }
 return {
  pending:()=>access(record=>record.read()),
  begin:input=>access(async record=>{
   // A pending attempt always wins over new input, including after a reload.
   if(record.read())throw issue('上次收藏结果尚待核对；本次拖入未提交。请先核对上次收藏，再重新拖入。');
   const pending={id:newId(),phase:'unknown',at:new Date(now()).toISOString()};record.save(pending);
   let operation;try{operation=await call('/notes/import',{input,operationId:pending.id});}catch(error){if(error.operationNotStarted===true){record.save(null);throw issue(error.message,'failed');}/* Otherwise query the original receipt only. */}
   return resolve(record,operation,true);
  }),
  resume:()=>access(record=>record.read()?resolve(record,null,false):null),
  acknowledge:id=>access(record=>{if(record.read()?.id===id)record.save(null);}),
 };
}

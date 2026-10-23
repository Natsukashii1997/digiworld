import {openDraftRecord,webDraftKey} from './web-draft.js';
const validId=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
const valid=v=>v===null||(v&&validId(v.id)&&typeof v.at==='string');
const pending=()=>Error('上次恢复结果待核对，请查询原操作，不要重复恢复。');

// Only the operation identity is persisted. ZIP bytes and preview tokens never
// enter browser storage. Reopening only queries; it cannot replay a restore.
export function createFullBackupRecovery({call,identity,storage,locks}){
 async function access(fn){
  const {dataRootIdentity}=await identity(),key=webDraftKey(dataRootIdentity,'full-backup-restore');
  if(!locks?.request)throw Error('当前浏览器无法保护恢复记录，请保留原页面。');
  return locks.request(key,{ifAvailable:true},async lock=>{
   if(!lock)throw pending();
   const record=openDraftRecord(storage,key,valid);
   try{return await fn(record);}finally{record.close();}
  });
 }
 async function query(id){
  try{
   const result=await call(`/full-backup/operations/${id}`);
   if(result?.operationId===id&&['complete','processing','interrupted','unknown'].includes(result.status))return result;
  }catch{/* The original ID remains the only recovery route. */}
  return {operationId:id,status:'unknown'};
 }
 return {
  resume:()=>access(record=>record.read()?query(record.read().id):null),
  begin:preview=>access(async record=>{
   if(record.read())throw pending();
   if(!validId(preview.operationId))throw Error('恢复预览缺少有效编号，请重新选择文件。');
   record.save({id:preview.operationId,at:new Date().toISOString()});
   try{
    const result=await call('/full-backup/restore',{token:preview.token,operationId:preview.operationId});
    if(result?.operationId===preview.operationId&&['complete','processing','interrupted','unknown'].includes(result.status))return result;
   }catch(error){if(error.operationNotStarted===true){record.save(null);throw error;}}
   return query(preview.operationId);
  }),
  acknowledge:id=>access(async record=>{
   if(record.read()?.id!==id)throw pending();
   const result=await query(id);
   if(!['complete','interrupted'].includes(result.status))throw pending();
   record.save(null);
  }),
 };
}

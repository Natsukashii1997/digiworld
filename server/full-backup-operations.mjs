import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {basename,dirname,join,resolve} from 'node:path';
import {createConfigJournal} from './config-journal.mjs';
import {FULL_BACKUP_LIMITS} from '../src/full-backup-contract.js';

export const RESTORE_MARKER='.workbench-restore.json';
export const restoreId=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const bad=()=>Object.assign(Error('恢复记录或目录身份无法核验，请保留原操作编号核对'),{status:503,unknownResult:true});
const safe=p=>typeof p==='string'&&p.length>0&&p.length<=1024&&!/[\\\0]/.test(p)&&p.split('/').every(v=>v&&v!=='.'&&v!=='..');
const digest=raw=>createHash('sha256').update(raw).digest('hex');

// This recovery-only identity survives a volume's transient device number
// changing after a reboot. Real directory replacement changes inode/birthtime.
export async function readRestoreScope(directory,filesystem=fs){
 const root=resolve(directory),before=await filesystem.lstat(root);
 if(!before.isDirectory()||before.isSymbolicLink()||before.uid!==process.getuid?.()||before.mode&0o022||(await filesystem.realpath(root))!==root)throw bad();
 const after=await filesystem.lstat(root);
 if(!after.isDirectory()||after.isSymbolicLink()||['dev','ino','birthtimeMs','uid'].some(k=>before[k]!==after[k]))throw bad();
 return digest(JSON.stringify([root,after.ino,after.birthtimeMs,after.uid]));
}

// The immutable plan is synced before any target write. A receipt alone is not
// success: result lookup also verifies the owned target and every archived file.
export function createRestoreOperations(directory){
 const root=resolve(directory);
 const identity=()=>readRestoreScope(root);
 function validate(row){
  if(!row||row.schema!==1||!restoreId(row.id)||!hash(row.rootIdentity)||!hash(row.archiveSha)||!hash(row.manifestSha)||
    row.target!==join(dirname(root),`${basename(root)}-恢复-${row.id}`)||
    !Array.isArray(row.files)||row.files.length>FULL_BACKUP_LIMITS.files||
    !Number.isFinite(Date.parse(row.at))||!hash(row.tokenSha))throw bad();
  let size=0;const paths=new Set();
  for(const f of row.files){
   if(!safe(f?.path)||f.path===RESTORE_MARKER||!hash(f.sha256)||!Number.isSafeInteger(f.size)||f.size<0||paths.has(f.path))throw bad();
   paths.add(f.path);size+=f.size;
  }
  if(size>FULL_BACKUP_LIMITS.dataBytes||row.manifestSha!==digest(JSON.stringify(row.files)))throw bad();
  return row;
 }
 const journal=createConfigJournal(root,{folder:'restore-operations',validate,label:'恢复',readLimit:FULL_BACKUP_LIMITS.manifestBytes});
 async function get(id){
  if(!restoreId(id))throw Object.assign(Error('恢复操作编号无效'),{status:400});
  const row=await journal.get(id);
  if(row&&row.rootIdentity!==await identity())throw bad();
  return row;
 }
 async function safeFile(target,path){
  const parts=path.split('/');let dir=target;
  for(const part of parts.slice(0,-1)){
   dir=join(dir,part);const s=await fs.lstat(dir);
   if(!s.isDirectory()||s.isSymbolicLink()||(await fs.realpath(dir))!==dir)throw bad();
  }
  const file=await fs.open(join(target,path),constants.O_RDONLY|constants.O_NOFOLLOW);
  if(!(await file.stat()).isFile()){await file.close();throw bad();}
  return file;
 }
 return {
  scope:identity,
  target:id=>join(dirname(root),`${basename(root)}-恢复-${id}`),
  get,
  marker:row=>({schema:1,id:row.id,archiveSha:row.archiveSha,manifestSha:row.manifestSha}),
  async prepare({id,bytes,token,manifest,mainDatabase,at}){
   const row={schema:1,id,target:join(dirname(root),`${basename(root)}-恢复-${id}`),rootIdentity:await identity(),archiveSha:digest(bytes),tokenSha:digest(token),manifestSha:digest(JSON.stringify(manifest.files)),files:manifest.files,mainDatabase:mainDatabase?{revision:mainDatabase.revision}:null,at};
   return journal.prepare(row);
  },
  complete:(id,at)=>journal.complete(id,at),
  async result(id,{running=false}={}){
   const row=await get(id);
   if(running)return {operationId:id,status:'processing'};
   if(!row)return {operationId:id,status:'unknown'};
   let stat;
   try{stat=await fs.lstat(row.target);}catch(e){if(e.code==='ENOENT')return {operationId:id,status:row.completedAt?'unknown':'interrupted',target:row.target};throw e;}
   try{
    if(!stat.isDirectory()||stat.isSymbolicLink()||(await fs.realpath(row.target))!==row.target)throw bad();
    const markerFile=await safeFile(row.target,RESTORE_MARKER);let marker;
    try{if((await markerFile.stat()).size>4096)throw bad();marker=JSON.parse(await markerFile.readFile('utf8'));}finally{await markerFile.close();}
    if(marker.schema!==1||marker.id!==id||marker.archiveSha!==row.archiveSha||marker.manifestSha!==row.manifestSha)throw bad();
    for(const f of row.files){
     const file=await safeFile(row.target,f.path);
     try{
      const before=await file.stat();if(before.size!==f.size)throw bad();
      const h=createHash('sha256');for await(const chunk of file.createReadStream({autoClose:false}))h.update(chunk);
      const after=await file.stat();if(h.digest('hex')!==f.sha256||before.mtimeMs!==after.mtimeMs||before.size!==after.size)throw bad();
     }finally{await file.close();}
    }
    return {operationId:id,status:'complete',target:row.target,verified:row.files.length,mainDatabase:row.mainDatabase};
   }catch{return {operationId:id,status:'unknown',target:row.target};}
  },
 };
}

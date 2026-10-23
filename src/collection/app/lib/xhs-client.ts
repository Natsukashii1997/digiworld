import { flyData } from '../../../data-flight.js';
import { motionOrigin } from '../../../scan-motion.js';
import { copyText } from '../../../data-flight.js';
import { request, session } from '../../../api.js';
import {createCollectionImport} from '../../../collection-import.js';
import type { Note } from '../types/xiaohongshu';

export type AgentClient = 'codex' | 'claude';
export type LocalServiceHealth = { ok:boolean; source:'sidecar'; };
export type LocalSetupInfo = { extension:{available:boolean;path:string;version:string;};agent:{available:boolean;serverPath:string;nodePath:string;dataDirectory:string;clients:Record<AgentClient,{available:boolean}>;};native?:{ocr:boolean;video:boolean}; };
let deskRevision = 0;
let mutation = Promise.resolve();
const serialize = <T>(operation:()=>Promise<T>):Promise<T> => { const result=mutation.then(operation); mutation=result.catch(()=>{}); return result; };
const call = (path:string,data?:unknown,method?:string,signal?:AbortSignal)=>request('/collection'+path,data,method,true,{signal});
const normalize = (note:any):Note => ({...note,savedAt:new Date(note.savedAt),likes:note.likes||0,collects:note.collects||0,comments:note.comments||0,content:note.content||'',rawContent:note.rawContent||note.content||'',imageUrls:note.imageUrls||[],author:note.author||{name:'未知作者'},tags:note.tags||[]});
export async function getNotes(signal?:AbortSignal):Promise<Note[]> { const result=await call('/notes',undefined,undefined,signal); return result.notes.map(normalize); }
export async function getNotesRevision(signal?:AbortSignal):Promise<string> { return (await call('/notes/version',undefined,undefined,signal)).revision; }
export async function getLocalServiceHealth():Promise<LocalServiceHealth> { try {return await call('/health');}catch{return {ok:false,source:'sidecar'};} }
export async function getLocalSetupInfo():Promise<LocalSetupInfo> { return call('/setup'); }
export async function getDeskWorkspace() { const result=await call('/desk-workspace'); deskRevision=result.revision; return result; }
export function saveDeskWorkspace(workspace:unknown, expectedRevision?:number) {
  const source=motionOrigin();
  return serialize(async()=>{
    const result=await call('/desk-workspace',{workspace,expectedRevision:expectedRevision??deskRevision},'PUT'); deskRevision=result.revision;
    flyData(source);
    return result;
  });
}
export function updateNoteCategories(updates:Record<string,string>) {
  const source=motionOrigin();return serialize(async()=>{const result=await call('/notes/categories',{updates},'PATCH');const notes=result.notes.map(normalize);flyData(source);return notes;});
}
export function undoNoteAutoGroup(note:Note) {
  const assignmentId=note.autoGroup?.assignmentId;
  if(!assignmentId)throw new Error('没有可撤销的自动进组记录');
  return serialize(async()=>{
    const path=`/notes/${encodeURIComponent(note.id)}/auto-group`;
    const readStatus=()=>call(path+'/'+encodeURIComponent(assignmentId)).catch(()=>{throw new Error('撤销结果待核对，请恢复连接后再点撤销核对记录');});
    // Every explicit attempt reads the receipt before writing, including after lost responses or reloads.
    let result=await readStatus();
    if(result.status!=='undone') {
      if(result.status!=='active')throw new Error('这条收藏已被手动调整，撤销不会覆盖当前分组');
      try {result=await call(path+'/undo',{assignmentId});}
      catch(error) {
        const status=await readStatus();
        if(status.status!=='undone')throw error;
        result=status;
      }
    }
    deskRevision=result.workspace.revision;
    return {...result,notes:result.notes.map(normalize)};
  });
}
let importer:ReturnType<typeof createCollectionImport>|undefined;
const imports=()=>importer ||= createCollectionImport({call,identity:session,storage:localStorage,locks:navigator.locks});
const normalizedImport=(result:any)=>result?{...result,notes:result.notes.map(normalize),note:result.note?normalize(result.note):null}:null;
export async function importSharedNote(input:string) {await mutation;return normalizedImport(await imports().begin(input));}
export async function resumeSharedImport() {await mutation;return normalizedImport(await imports().resume());}
export const pendingSharedImport=()=>imports().pending();
export const acknowledgeSharedImport=(id:string)=>imports().acknowledge(id);
export function deleteStoredNote(id:string) { return serialize(async()=>{const result=await call(`/notes/${encodeURIComponent(id)}`,undefined,'DELETE');const workspace=await getDeskWorkspace();return {...result,workspace,notes:result.notes.map(normalize)};}); }
export type RecycleItem = { recycleId:string; noteId:string; title:string; deletedAt:string; category:string; path:string; folder:string; status:'pending'|'planned'|'organized'|'restoring'|'missing'|'incomplete'; canRestore:boolean; activeConflict:boolean; mediaCount:number; bytes:number; error:string; };
export type RecycleList = { rootPath:string; items:RecycleItem[]; revision:number; notes:Note[]; workspace:any; };
export const getRecycle = async ():Promise<RecycleList> => {const result=await call('/recycle');return {...result,notes:result.notes.map(normalize)};};
export const adoptRecycleRevision = (revision:number) => { deskRevision=revision; };
export function organizeRecycle() { return serialize(async()=>{const result=await call('/recycle/organize',{});deskRevision=result.workspace.revision;return {...result,notes:result.notes.map(normalize)};}); }
export function restoreRecycledNote(id:string) { return serialize(async()=>{const result=await call(`/recycle/${encodeURIComponent(id)}/restore`,{});deskRevision=result.workspace.revision;return {...result,notes:result.notes.map(normalize)};}); }
export const openRecycleFolder = (id?:string) => call(id?`/recycle/${encodeURIComponent(id)}/open`:'/recycle/open',{});
export async function openBrowserExtensionSetup() { const info=await getLocalSetupInfo(); return {ok:true,path:info.extension.path,message:'插件文件夹已准备好，请在 Chrome 扩展页加载并完成配对'}; }
export async function pairExtension() { return call('/extension/pair',{}); }
export async function revokeExtension() { return call('/extension/revoke',{}); }
export async function connectLocalAgent(client:AgentClient) {
  const info=await getLocalSetupInfo();
  const configuration={mcpServers:{'digital-world-collection':{command:info.agent.nodePath,args:[info.agent.serverPath],env:{COLLECTION_DATA_DIRECTORY:info.agent.dataDirectory}}}};
  await copyText(JSON.stringify(configuration,null,2));
  return {ok:true,message:`${client==='codex'?'Codex':'Claude Code'} 收藏 MCP 配置已复制；尚未写入该客户端配置`};
}
export function formatNumber(value:number):string {return value>=10000 ? (value/10000).toFixed(1)+'w' : value>=1000 ? (value/1000).toFixed(1)+'k' : String(value);}
export function formatDate(value:Date):string {const days=Math.floor((Date.now()-value.getTime())/86400000);return days===0?'今天':days===1?'昨天':days<7?`${days}天前`:`${value.getMonth()+1}月${value.getDate()}日`;}

export const retryGetAnalysis = (id:string,jobId:string) => call(`/notes/${encodeURIComponent(id)}/get-analysis/retry`,{jobId});

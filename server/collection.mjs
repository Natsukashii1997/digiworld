import fs from 'node:fs/promises';
import { constants, createReadStream, existsSync } from 'node:fs';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { failure } from './repository.mjs';
import { normalizeImportedNote, parseDraggedNoteInput, parseDraggedCardInput, extractSharedNoteUrl, extractNoteIdFromUrl, noteFromSharedText } from './collection/lib/note-import.mjs';
import { resolveAnonymousNote } from './collection/lib/anonymous-note-resolver.mjs';
import { localizeNoteMedia, isAllowedRemoteImageUrl } from './collection/lib/media-import.mjs';
import { localizeNoteVideo, reanalyzeStoredNoteVideo } from './collection/lib/video-import.mjs';
import { inferCategoryFromNote } from './collection/lib/category-inference.mjs';
import {matchCocktailGroup,synchronizeAutoGroups,invalidateAutoGroups,noteWithAutoGroup} from './collection/lib/cocktail-grouping.mjs';
import { ensureDeskState,categoryForGroup,LOOSE_GROUP_ID } from '../src/collection/app/lib/desk-workspace.mjs';
import { createCollectionRecycle } from './collection/recycle.mjs';
import { createGetClient } from './collection/get-client.mjs';
import { createGetAnalysisWorker,newGetAnalysis,cancelledGetAnalysis } from './collection/get-analysis.mjs';
import { createCoverRepair } from './collection/cover-repair.mjs';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const mediaTypes = { '.jpg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.avif':'image/avif', '.gif':'image/gif', '.heic':'image/heic', '.heif':'image/heif', '.mp4':'video/mp4' };
const empty = () => ({ schema:1, revision:0, notes:[], trash:[], desk:{groups:[],noteGroupMap:{},knownNoteIds:[]}, operations:[], extensionHash:'', categories:{} });
const safeError = error => String(error?.message || '收藏处理失败').replace(/https?:\/\/\S+/g, '[来源地址]').slice(0, 400);
function publicNote(note) {
  const cleanUrl = value => {
    try { const url = new URL(value); url.search = ''; url.hash = ''; return url.toString(); } catch { return value; }
  };
  return { ...note, coverUrl:String(note.coverUrl||'').startsWith('/collection-media/')?note.coverUrl:'',sourceImageUrls:(note.sourceImageUrls || []).map(cleanUrl), sourceVideoUrl:cleanUrl(note.sourceVideoUrl || ''),mediaError:note.mediaError?safeError({message:note.mediaError}):'',videoError:note.videoError?safeError({message:note.videoError}):'',imageOcr:(note.imageOcr||[]).map(item=>({...item,error:item.error?safeError({message:item.error}):''})), author:{...note.author,avatar:''} };
}
function deskInput(value) {
  if (!value || !Array.isArray(value.groups) || value.groups.length > 100 || !value.noteGroupMap || typeof value.noteGroupMap !== 'object' || Array.isArray(value.noteGroupMap)) throw failure('分组数据格式不正确', 400);
  const ids = new Set();
  for (const group of value.groups) {
    if (typeof group.id!=='string' || !group.id || group.id.length>100 || /[\u0000-\u001f]/.test(group.id) || ids.has(group.id) || typeof group.name !== 'string' || !group.name.trim() || group.name.length > 80 || !['auto','custom'].includes(group.kind)) throw failure('分组字段不正确', 400);
    ids.add(group.id);
  }
  if (Object.keys(value.noteGroupMap).length > 10000) throw failure('分组映射过多', 400);
  return { groups:value.groups.map(g=>({id:g.id,name:g.name.trim(),kind:g.kind,...(g.sourceCategory ? {sourceCategory:String(g.sourceCategory).slice(0,80)} : {})})), noteGroupMap:value.noteGroupMap, knownNoteIds:Array.isArray(value.knownNoteIds) ? value.knownNoteIds.slice(0,10000) : [] };
}

export function createCollection(repository, { directory = repository.directory, clock = ()=>new Date(), fetchImpl=fetch, ocrRunner, analyzer, platform, runOpen, recycleCheckpoint, getClient=createGetClient(), getPollMs } = {}) {
  const root = join(resolve(directory), 'collection'), statePath = join(root,'state.json');
  let queue = Promise.resolve(), rootIdentity;
  const jobs = new Map();
  const busyVersions = new Set();
  const now = () => new Date(clock()).toISOString();
  const serialized = operation => { const result = queue.then(operation); queue = result.catch(()=>{}); return result; };
  async function guard(create = false) {
    const data = await fs.lstat(directory);
    if (!data.isDirectory() || data.isSymbolicLink()) throw failure('收藏数据目录身份无效',409);
    const identity = `${data.dev}:${data.ino}:${data.birthtimeMs}`;
    if (rootIdentity && rootIdentity !== identity) throw failure('收藏数据根已变化，请刷新',409);
    rootIdentity ||= identity;
    if (create) await fs.mkdir(root, {recursive:true,mode:0o700});
    try {
      const info = await fs.lstat(root);
      if (!info.isDirectory() || info.isSymbolicLink() || await fs.realpath(root) !== join(await fs.realpath(directory),'collection')) throw failure('收藏目录不能是链接',409);
    } catch(error) { if (error.code !== 'ENOENT') throw error; }
  }
  async function read() {
    await guard();
    let handle;
    try {
      handle = await fs.open(statePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      const info = await handle.stat();
      if (!info.isFile() || info.nlink !== 1 || info.size > 64*1024*1024) throw failure('收藏文件身份或大小异常',409);
      const envelope = JSON.parse(await handle.readFile('utf8'));
      if (envelope.sha256 !== hash(JSON.stringify(envelope.state)) || envelope.state?.schema !== 1 || !Array.isArray(envelope.state.notes) || !Array.isArray(envelope.state.operations)) throw failure('收藏数据校验失败，未清空原库',409);
      return envelope.state;
    } catch(error) { if (error.code === 'ENOENT') return empty(); throw error; }
    finally { await handle?.close(); }
  }
  async function write(value) {
    await guard(true);
    const state = { ...synchronizeAutoGroups(value), revision:value.revision+1 }, raw = JSON.stringify({sha256:hash(JSON.stringify(state)),state});
    if (Buffer.byteLength(raw) > 64*1024*1024) throw failure('收藏库超过64MB元数据上限',413);
    const temporary = join(root,`.state-${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await fs.open(temporary, 'wx',0o600); await handle.writeFile(raw); await handle.sync(); await handle.close(); handle = null;
      await guard(); await fs.rename(temporary,statePath);
      const parent = await fs.open(root,'r'); try { await parent.sync(); } finally { await parent.close(); }
      const result = await read();
      if (result.revision !== state.revision || hash(JSON.stringify(result)) !== hash(JSON.stringify(state))) throw failure('收藏写后回读不一致',409);
      return result;
    } finally { await handle?.close(); await fs.rm(temporary,{force:true}); }
  }
  // archived：阶段 2 归档标记，按条目 ID 单独存（同 categories），重导入同一条不会丢。
  const notesResponse = state => ({notes:state.notes.map(note=>noteWithAutoGroup(note,state)), revision:state.revision, lastImportedAt:state.notes[0]?.savedAt || null, archived:state.archived || {}});
  function groupNewNote(state, note) {
    const desk={...state.desk,noteGroupMap:{...state.desk.noteGroupMap,[note.id]:LOOSE_GROUP_ID}};
    const autoGroups={...(state.autoGroups || {})};
    const protectedNote=state.categories[note.id] || autoGroups[note.id] || state.trash.some(item=>item.id===note.id);
    const match=protectedNote ? null : matchCocktailGroup(note,desk.groups);
    if (!match) return {note,desk,autoGroups};
    autoGroups[note.id]={id:randomUUID(),...match,at:now(),status:'active',previousCategory:note.category};
    desk.noteGroupMap[note.id]=match.groupId;
    return {note:{...note,category:categoryForGroup(desk,match.groupId)},desk,autoGroups};
  }
  async function status(id, owner='page') {
    const state = await serialized(read), operation = state.operations.find(x=>x.id===id && x.owner===owner);
    if (!operation) throw failure('没有找到本次收藏操作',404);
    if (operation.status==='processing' && !jobs.has(id)) return {...operation,status:'interrupted',error:'服务曾中断，本次未确认完成；可以重新导入'};
    return operation;
  }
  async function normalize(body) {
    const dragged = body.note || parseDraggedNoteInput(body.input), card = dragged ? null : parseDraggedCardInput(body.input);
    if (dragged) return normalizeImportedNote(dragged);
    if (card) { if(card.id.startsWith('douyin-')) throw new Error('请在抖音网页打开作品详情，再用收藏插件按钮点击或拖入'); const resolved=await resolveAnonymousNote(card.sourceUrl,{expectedNoteId:card.id,fetchImpl}); return normalizeImportedNote({...resolved,title:resolved.title || card.title}); }
    try { return noteFromSharedText(body.input); }
    catch(error) {
      const sourceUrl = extractSharedNoteUrl(body.input), id = extractNoteIdFromUrl(sourceUrl);
      if (!id || id.startsWith('douyin-')) throw error;
      return normalizeImportedNote(await resolveAnonymousNote(sourceUrl,{expectedNoteId:id,fetchImpl}));
    }
  }
  async function performImport(body, operationId, owner, inputHash) {
    let version;
    try {
      const note = await normalize(body);
      if (!/^(?:[a-f0-9]{24}|douyin-\d{15,25})$/.test(note.id)) throw failure('笔记ID无效',400);
      if (note.type==='video' && !note.sourceVideoUrl) throw failure('没有读取到视频地址，请在详情播放后再收藏',400);
      note.coverUrl = isAllowedRemoteImageUrl(note.coverUrl) ? note.coverUrl : '';
      version = randomBytes(16).toString('hex');
      const mediaDirectory = join(root,'versions',version,'media');
      await guard(true);
      for (const part of [join(root,'versions'),join(root,'versions',version),mediaDirectory]) {
        await fs.mkdir(part,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
        const info=await fs.lstat(part); if (!info.isDirectory() || info.isSymbolicLink()) throw failure('媒体目录不能是链接',409);
      }
      const publicBaseUrl = `/collection-media/${version}`;
      const images = await localizeNoteMedia(note,{mediaDirectory,publicBaseUrl,fetchImpl,...(ocrRunner ? {ocrRunner} : {})});
      const models=join(root,'models');await fs.mkdir(models,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
      const modelInfo=await fs.lstat(models);if(!modelInfo.isDirectory()||modelInfo.isSymbolicLink())throw failure('模型目录不能是链接',409);
      const imported = await localizeNoteVideo(images,{mediaDirectory,publicBaseUrl,modelDirectory:models,deadline:Date.now()+30*60*1000,fetchImpl,...(analyzer ? {analyzer} : {})});
      const result = await serialized(async()=>{
        const state = await read(), previous = state.notes.find(x=>x.id===note.id);
        const intent=state.operations.find(x=>x.id===operationId && x.owner===owner);
        if((state.noteDeletionRevisions?.[note.id] || 0)>(intent?.startRevision || 0))throw failure('这条收藏在导入期间已删除，本次导入已取消',409);
        let stored = publicNote({...imported,origin:note.origin,mediaVersion:version,category:state.categories[note.id] || previous?.category || inferCategoryFromNote(imported),savedAt:now(),...(previous?.getAnalysis?{getAnalysis:previous.getAnalysis}:body.mode==='get'?{getAnalysis:newGetAnalysis(note.sourceUrl,now())}:{})});
        const grouping=previous ? {note:stored,desk:state.desk,autoGroups:state.autoGroups} : groupNewNote(state,stored);
        stored=grouping.note;
        const notes = [stored,...state.notes.filter(x=>x.id!==stored.id)];
        if (notes.length>10000) throw failure('收藏数量达到上限',413);
        const operation = {id:operationId,owner,inputHash,status:'complete',at:now(),noteId:stored.id,created:!previous,mediaStatus:stored.mediaStatus,videoStatus:stored.videoStatus};
        await write({...state,notes,autoGroups:grouping.autoGroups,desk:ensureDeskState(grouping.desk,notes),operations:[...state.operations.filter(x=>x.id!==operationId),operation].slice(-500)});
        return operation;
      });
      getWorker.wake();
      return result;
    } catch(error) {
      const recovery=await serialized(async()=>{
        const state = await read();
        const committed=state.operations.find(x=>x.id===operationId && x.owner===owner && x.status==='complete');
        if (committed || (version && state.notes.some(n=>n.mediaVersion===version))) return committed || {id:operationId,status:'unknown',error:'写入状态待核对，媒体已保留'};
        const operation = {id:operationId,owner,inputHash,status:'failed',at:now(),error:safeError(error)};
        await write({...state,operations:[...state.operations.filter(x=>x.id!==operationId),operation].slice(-500)});
        return operation;
      }).catch(()=>({id:operationId,status:'unknown',error:'无法确认写入结果，媒体已保留，请刷新核对'}));
      if (version && recovery.status==='failed') await fs.rm(join(root,'versions',version),{recursive:true,force:true});
      return recovery;
    } finally { jobs.delete(operationId); }
  }
  async function startImport(body, owner='page') {
    const operationId = body.operationId;
    if (!/^[a-f0-9-]{36}$/.test(operationId || '') || (typeof body.input !== 'string' && !body.note) || JSON.stringify(body).length>2*1024*1024) throw Object.assign(failure('收藏输入或操作编号无效',400),{operationNotStarted:true});
    if(body.mode!==undefined && !['direct','get'].includes(body.mode))throw Object.assign(failure('收藏模式无效',400),{operationNotStarted:true});
    const inputHash = hash(JSON.stringify({input:body.input,note:body.note,...(body.mode==='get'?{mode:'get'}:{})}));
    const existing = await serialized(async()=>{
      const state = await read(), previous = state.operations.find(x=>x.id===operationId);
      if (previous) { if (previous.inputHash!==inputHash || previous.owner!==owner) throw failure('操作编号已用于其他收藏',409); return previous; }
      if (jobs.size>=3) throw Object.assign(failure('已有收藏正在处理，请稍后重试',429),{operationNotStarted:true});
      const operation = {id:operationId,owner,inputHash,status:'processing',at:now(),startRevision:state.revision+1};
      await write({...state,operations:[...state.operations,operation].slice(-500)}); return null;
    });
    if (existing) return await status(operationId,owner);
    const promise = performImport(body,operationId,owner,inputHash);
    jobs.set(operationId,promise); void promise.catch(()=>{});
    return {id:operationId,status:'processing'};
  }
  async function saveDesk(body) {
    const desk = deskInput(body.workspace);
    return serialized(async()=>{
      const state = await read();
      if (body.expectedRevision!==state.revision) throw failure('收藏已变化，请重新读取后再保存分组',409);
      const valid = new Set(state.notes.map(x=>x.id));
      const groupIds = new Set(desk.groups.map(x=>x.id)); groupIds.add('loose'); groupIds.add('__loose__');
      for (const [id,group] of Object.entries(desk.noteGroupMap)) if (!valid.has(id) || typeof group !== 'string' || !groupIds.has(group)) throw failure('分组引用已失效',409);
      const updates={};
      const notes=state.notes.map(note=>{const category=categoryForGroup(desk,desk.noteGroupMap[note.id]);if(category && (desk.noteGroupMap[note.id]!==state.desk.noteGroupMap[note.id] || category!==note.category)){updates[note.id]=category;return {...note,category};}return note;});
      const moved=state.notes.filter(note=>desk.noteGroupMap[note.id]!==state.desk.noteGroupMap[note.id]).map(note=>note.id);
      const result = await write({...invalidateAutoGroups(state,moved),notes,categories:{...state.categories,...updates},desk:ensureDeskState(desk,notes)});
      return {...result.desk,revision:result.revision};
    });
  }
  async function categories(body) {
    return serialized(async()=>{
      const state = await read();
      if (!body.updates || typeof body.updates!=='object' || Array.isArray(body.updates) || Object.keys(body.updates).length>1000) throw failure('分类更新格式无效',400);
      const updates = {};
      for (const [id,value] of Object.entries(body.updates)) {
        if (!state.notes.some(n=>n.id===id) || typeof value!=='string' || !value.trim() || value.length>80) throw failure('分类更新字段无效',400);
        updates[id]=value.trim();
      }
      const changed=state.notes.filter(note=>updates[note.id] && updates[note.id]!==note.category).map(note=>note.id);
      return notesResponse(await write({...invalidateAutoGroups(state,changed),categories:{...state.categories,...updates},notes:state.notes.map(n=>updates[n.id] ? {...n,category:updates[n.id]} : n)}));
    });
  }
  async function archive(id, body) {
    if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>k!=='archived') || typeof body.archived!=='boolean') throw failure('归档请求无效',400);
    return serialized(async()=>{
      const state=await read();
      if (!state.notes.some(n=>n.id===id)) throw failure('收藏不存在或已删除',404);
      const archived={...(state.archived || {})};
      if (body.archived===(archived[id]!==undefined)) return notesResponse(state);
      if (body.archived) archived[id]=now(); else delete archived[id];
      return notesResponse(await write({...state,archived}));
    });
  }
  async function remove(id) {
    return serialized(async()=>{
      const state = await read(), note = state.notes.find(x=>x.id===id);
      if (!note) throw failure('收藏不存在',404);
      const notes = state.notes.filter(x=>x.id!==id);
      const result = await write({...state,notes,noteDeletionRevisions:{...state.noteDeletionRevisions,[id]:state.revision+1},trash:[...state.trash,{...note,...(note.getAnalysis?{getAnalysis:cancelledGetAnalysis(note.getAnalysis,now())}:{}),recycleId:randomUUID(),deletedAt:now(),deletedGroupId:state.desk.noteGroupMap[id]}],desk:ensureDeskState(state.desk,notes)});
      return {...notesResponse(result),deletedId:id};
    });
  }
  function autoGroupReceipt(state,id,assignmentId) {
    if (!/^[a-f0-9-]{36}$/.test(assignmentId || '')) throw failure('自动进组凭据无效',400);
    const assignment=state.autoGroups?.[id];
    if (!assignment || assignment.id!==assignmentId) throw failure('自动进组记录已变化，请刷新核对',409);
    return assignment;
  }
  function autoGroupResponse(state,assignment) {
    return {...notesResponse(state),assignmentId:assignment.id,status:assignment.status,workspace:{...state.desk,revision:state.revision}};
  }
  async function autoGroupStatus(id,assignmentId) {
    return serialized(async()=>{const state=await read();return autoGroupResponse(state,autoGroupReceipt(state,id,assignmentId));});
  }
  async function undoAutoGroup(id,body) {
    return serialized(async()=>{
      const state=await read(), assignment=autoGroupReceipt(state,id,body?.assignmentId);
      if (assignment.status==='undone') return autoGroupResponse(state,assignment);
      if (jobs.size || busyVersions.size) throw failure('收藏导入或视频分析正在处理，请完成后再撤销',409);
      if (assignment.status!=='active' || state.desk.noteGroupMap[id]!==assignment.groupId) throw failure('这条收藏已被手动调整，撤销不会覆盖当前分组',409);
      if (!state.notes.some(note=>note.id===id)) throw failure('收藏已不存在，不能撤销',404);
      const category=assignment.previousCategory || '待分类';
      const notes=state.notes.map(note=>note.id===id?{...note,category}:note);
      const desk=ensureDeskState({...state.desk,noteGroupMap:{...state.desk.noteGroupMap,[id]:LOOSE_GROUP_ID}},notes);
      const autoGroups={...state.autoGroups,[id]:{...assignment,status:'undone'}};
      const result=await write({...state,notes,desk,autoGroups,categories:{...state.categories,[id]:category}});
      return autoGroupResponse(result,autoGroups[id]);
    });
  }
  async function pairing() {
    const token = randomBytes(32).toString('hex');
    await serialized(async()=>{ const state=await read(); await write({...state,extensionHash:hash(token)}); });
    return {token};
  }
  async function clipOwner(token) {
    if (typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token)) throw failure('请先在收藏页配对Chrome插件',403);
    const state = await serialized(read), candidate=hash(token);
    if (!state.extensionHash || !timingSafeEqual(Buffer.from(candidate),Buffer.from(state.extensionHash))) throw failure('插件配对已失效，请重新配对',403);
    return candidate;
  }
  async function handleClip(request,response,url,body) {
    if (!/^\/api\/collection\/clip(?:\/status\/[a-f0-9-]{36}|\/capabilities)?$/.test(url.pathname)) return false;
    const origin = request.headers.origin;
    if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) throw failure('收藏剪藏接口仅允许配对插件',403);
    if (origin) { response.setHeader('Access-Control-Allow-Origin',origin); response.setHeader('Vary','Origin'); }
    response.setHeader('Access-Control-Allow-Methods','POST,GET,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers','Content-Type,X-Collection-Token');
    response.setHeader('Access-Control-Allow-Private-Network','true');
    response.setHeader('Cache-Control','no-store');
    if (request.method==='OPTIONS') { response.writeHead(204); response.end(); return true; }
    const owner = await clipOwner(request.headers['x-collection-token']);
    let payload;
    if(request.method==='GET' && url.pathname==='/api/collection/clip/capabilities')payload={getAnalysis:true,version:'1.2.0'};
    else if (request.method==='POST' && url.pathname==='/api/collection/clip') {
      if (!String(request.headers['content-type']||'').startsWith('application/json')) throw failure('请使用JSON收藏请求',415);
      if (Number(request.headers['content-length'])>2*1024*1024) throw failure('收藏输入过大',413);
      payload=await startImport(await body(request),owner);
    }
    else if (request.method==='GET' && url.pathname.includes('/status/')) payload=await status(url.pathname.split('/').pop(),owner);
    else throw failure('剪藏请求方法无效',405);
    const {inputHash:unused,owner:privateOwner,...publicResult}=payload;
    response.writeHead(200,{'Content-Type':'application/json'}); response.end(JSON.stringify(publicResult)); return true;
  }
  async function sendMedia(request,response,pathname) {
    const match = pathname.match(/^\/collection-media\/([a-f0-9]{32})\/media\/((?:[a-f0-9]{24}|douyin-\d{15,25}))\/(\d{2}\.(?:avif|gif|heic|heif|jpg|png|webp)|video\.mp4)$/);
    if (!match || request.method!=='GET') return false;
    const [,version,id,name]=match, state=await serialized(read);
    if (!state.notes.some(n=>n.id===id && n.mediaVersion===version)) throw failure('收藏媒体不存在',404);
    await guard();
    const directoryPath=join(root,'versions',version,'media',id);
    for (const part of [join(root,'versions'),join(root,'versions',version),join(root,'versions',version,'media'),directoryPath]) {
      const info=await fs.lstat(part); if (!info.isDirectory() || info.isSymbolicLink()) throw failure('媒体目录身份异常',409);
    }
    const path=join(directoryPath,name), handle=await fs.open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    try {
      const info=await handle.stat();
      if (!info.isFile() || info.nlink!==1 || info.size===0 || info.size>600*1024*1024) throw failure('媒体文件身份异常',409);
      let start=0,end=info.size-1,statusCode=200;
      if (request.headers.range) {
        const range=request.headers.range.match(/^bytes=(\d+)-(\d*)$/);
        if (!range) throw failure('媒体范围无效',416);
        start=Number(range[1]); end=range[2] ? Math.min(Number(range[2]),end) : end;
        if (start>end || start>=info.size) throw failure('媒体范围超出文件',416);
        statusCode=206; response.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);
      }
      response.writeHead(statusCode,{'Content-Type':mediaTypes[extname(name)],'Content-Length':end-start+1,'Cache-Control':'private, max-age=3600','Accept-Ranges':'bytes'});
      await new Promise((resolveStream,reject)=>{
        const stream=createReadStream(path,{fd:handle.fd,autoClose:false,start,end});
        stream.on('error',reject); response.on('close',()=>{stream.destroy();resolveStream();}); stream.on('end',resolveStream);stream.pipe(response);
      });
    } finally { await handle.close(); }
    return true;
  }
  async function manual(body) {
    let url; try { url=new URL(body.url); } catch { throw failure('链接无效',400); }
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || String(body.title || '').length>300) throw failure('链接格式无效',400);
    for(const key of [...url.searchParams.keys()])if(/^(?:xsec_token|token|signature|sign|utm_.+|fbclid)$/i.test(key))url.searchParams.delete(key);
    url.hash='';
    return serialized(async()=>{
      const state=await read(), id=hash(url.toString()).slice(0,24), previous=state.notes.find(n=>n.id===id);
      if (previous) return {...notesResponse(state),note:previous,created:false};
      const note={id,sourceUrl:url.toString(),origin:body.origin==='aihot'?'aihot':'manual',title:String(body.title||'未命名收藏'),content:String(body.summary||'').slice(0,20000),rawContent:String(body.summary||'').slice(0,20000),author:{name:body.origin==='aihot'?'AI HOT':'手动收藏'},category:'待分类',tags:[],savedAt:now(),type:'normal',imageUrls:[],coverUrl:'',mediaStatus:'none',videoStatus:'none'};
      const grouping=groupNewNote(state,note), notes=[grouping.note,...state.notes];
      const result=await write({...state,notes,autoGroups:grouping.autoGroups,desk:ensureDeskState(grouping.desk,notes)});
      return {...notesResponse(result),note:noteWithAutoGroup(grouping.note,result),created:true};
    });
  }
  async function clearLegacy(expectedRevision) {
    const state=await repository.read();
    if (state.revision!==expectedRevision) throw failure('主库已变化，请刷新后清除旧记录',409);
    return repository.updateLearning(()=>({folders:[],books:[],links:[]}),{expectedRevision});
  }
  async function setup() {
    return {extension:{available:true,path:join(sourceDirectory,'../browser-extension/collection'),version:'1.2.0'},agent:{available:true,serverPath:join(sourceDirectory,'collection-mcp.mjs'),nodePath:process.execPath,dataDirectory:root,clients:{codex:{available:true},claude:{available:true}}},native:{ocr:process.platform==='darwin',video:existsSync(join(sourceDirectory,'collection/native/kankan-video-analyzer'))}};
  }
  const getWorker=createGetAnalysisWorker({read,write,serialized,client:getClient,now,pollMs:getPollMs});
  async function retryGet(id,body) {
    const result=await serialized(async()=>{
      const state=await read(),note=state.notes.find(n=>n.id===id),job=note?.getAnalysis;
      if(!job || body.jobId!==job.jobId || !job.canRetry || !['failed','paused'].includes(job.status))throw failure('GET状态已变化或结果未知，请刷新核对',409);
      if((job.attempts?.length || 0)>=100)throw failure('GET重试记录已达上限，请保留记录并核对',409);
      const next=job.status==='paused'?{...job,status:job.noteId?'fetching':'pending',error:'',canRetry:false,updatedAt:now()}:{...newGetAnalysis(note.sourceUrl,now()),attempts:[...(job.attempts || []),Object.fromEntries(['jobId','taskId','noteId','status','error','requestedAt','updatedAt'].filter(key=>job[key]!==undefined).map(key=>[key,job[key]]))]};
      return notesResponse(await write({...state,notes:state.notes.map(n=>n.id===id?{...n,getAnalysis:next}:n)}));
    });
    getWorker.wake();return result;
  }
  const recycle = createCollectionRecycle({ root, read, write, guard, serialized, busyVersions, platform, runOpen, checkpoint:recycleCheckpoint });
  const repairCover=createCoverRepair({root,read,write,guard,serialized,busyVersions,publicNote,fetchImpl,ocrRunner});
  return { start:()=>getWorker.start(),close:()=>getWorker.close(),retryGet,read:()=>serialized(read), notes:()=>serialized(async()=>notesResponse(await read())), desk:()=>serialized(async()=>{const state=await read();return {...state.desk,revision:state.revision};}), health:async()=>({ok:true,source:'sidecar'}), startImport,status,saveDesk,categories,archive,remove,autoGroupStatus,undoAutoGroup,pairing,handleClip,sendMedia,manual,clearLegacy,setup,recycle,repairCover,
    async revokePairing(){await serialized(async()=>{const state=await read();await write({...state,extensionHash:''});});return {ok:true};},
    async reanalyze(id){const note=await serialized(async()=>{const state=await read(),value=state.notes.find(n=>n.id===id);if(!value?.mediaVersion)throw failure('没有本地视频',404);if(busyVersions.has(value.mediaVersion))throw failure('视频正在分析中',409);busyVersions.add(value.mediaVersion);return value;});try{const result=await reanalyzeStoredNoteVideo(note,{mediaDirectory:join(root,'versions',note.mediaVersion,'media'),publicBaseUrl:`/collection-media/${note.mediaVersion}`,modelDirectory:join(root,'models'),deadline:Date.now()+30*60*1000,fetchImpl,...(analyzer?{analyzer}:{})});return await serialized(async()=>{const current=await read();if(current.notes.find(n=>n.id===id)?.mediaVersion!==note.mediaVersion)throw failure('视频已变化，请重新读取',409);const analysis=Object.fromEntries(['videoDuration','transcriptText','transcriptSegments','transcriptEngine','videoStatus','videoError'].map(key=>[key,result[key]]));return notesResponse(await write({...current,notes:current.notes.map(n=>n.id===id?publicNote({...n,...analysis}):n)}));});}finally{busyVersions.delete(note.mediaVersion);}},
  };
}

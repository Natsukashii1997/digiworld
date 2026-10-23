import {randomUUID} from 'node:crypto';
import {extractNoteIdFromUrl} from './lib/note-import.mjs';
import {GetError,getSourceUrl} from './get-client.mjs';

const active=new Set(['queued','submitting','pending','processing','fetching']);
export function newGetAnalysis(sourceUrl,at) {
  return {jobId:randomUUID(),provider:'GET',sourceUrl:getSourceUrl(sourceUrl),status:'queued',requestedAt:at,updatedAt:at};
}
export function cancelledGetAnalysis(value,at) {
  return value && value.status!=='ready'?{...value,status:'cancelled',error:'收藏已删除，解析已停止',canRetry:false,updatedAt:at}:value;
}
// All transitions use the collection transaction; network work never holds its lock.
export function createGetAnalysisWorker({read,write,serialized,client,now,pollMs=10000}) {
  let timer,running,enabled=false;
  async function update(job,patch) {
    return serialized(async()=>{
      const state=await read(),note=state.notes.find(n=>n.id===job.localId && n.getAnalysis?.jobId===job.jobId && extractNoteIdFromUrl(n.sourceUrl)===extractNoteIdFromUrl(job.sourceUrl));
      if(!note || note.getAnalysis.status==='cancelled')return null;
      if(Object.entries(patch).every(([key,value])=>note.getAnalysis[key]===value))return {...note.getAnalysis,noteIdLocal:note.id};
      const value={...note.getAnalysis,...patch,updatedAt:now()};
      await write({...state,notes:state.notes.map(n=>n.id===note.id?{...n,getAnalysis:value}:n)});
      return value;
    });
  }
  async function step(job) {
    let phase=job.status;
    try {
      const session=await client.session();
      if(job.binding && job.binding!==session.binding)throw new GetError('GET应用已变化，请恢复原接入配置后继续查询');
      if(phase==='queued') {
        // Durable intent before POST. A crash with no taskId is never replayed.
        if(!await update(job,{status:'submitting',binding:session.binding,error:'',canRetry:false}))return;
        phase='submitting';
        const result=await session.create({sourceUrl:job.sourceUrl,requestId:job.jobId});
        await update(job,result.noteId?{status:'fetching',noteId:result.noteId}:{status:'pending',taskId:result.taskId});
        return;
      }
      if(phase==='pending' || phase==='processing') {
        const result=await session.progress(job.taskId);
        if(result.status==='failed') {await update(job,{status:'failed',error:'GET未能解析此链接，可重试GET解析',canRetry:true});return;}
        if(result.status!=='success') {await update(job,{status:result.status});return;}
        const saved=await update(job,{status:'fetching',noteId:result.noteId});
        if(!saved)return;
        job={...job,...saved};phase='fetching';
      }
      if(phase==='fetching') {
        const result=await session.detail(job.noteId);
        if(!extractNoteIdFromUrl(result.sourceUrl) || extractNoteIdFromUrl(result.sourceUrl)!==extractNoteIdFromUrl(job.sourceUrl))throw new GetError('GET返回的来源与这条收藏不一致，未写入解析');
        await update(job,{status:'ready',title:result.title,content:result.content,noteUrl:'https://www.biji.com/note/'+job.noteId,completedAt:now(),error:'',canRetry:false});
      }
    } catch(error) {
      const message=error instanceof GetError?error.message:'GET暂时不可用，请在解析页核对';
      if(phase==='submitting')await update(job,{status:error instanceof GetError && error.kind==='rejected'?'failed':'unknown',error:message,canRetry:error instanceof GetError && error.kind==='rejected'});
      else await update(job,{status:phase==='queued'?'failed':'paused',error:message,canRetry:true});
    }
  }
  async function run() {
    const state=await serialized(read);
    for(const note of state.notes) {
      if(!enabled)break;
      const job=note.getAnalysis;
      if(job?.status==='submitting'){await update({...job,localId:note.id},{status:'unknown',error:'提交时服务中断，结果待核对；不会自动重提',canRetry:false});continue;}
      if(job && active.has(job.status))await step({...job,localId:note.id});
    }
  }
  function wake() {
    if(!enabled || running)return;
    clearTimeout(timer);
    running=run().catch(()=>{}).finally(()=>{running=null;if(enabled){timer=setTimeout(wake,pollMs);timer.unref?.();}});
  }
  return {
    wake,
    async start() {
      if(enabled)return;
      await serialized(async()=>{const state=await read();let changed=false;const notes=state.notes.map(note=>{if(note.getAnalysis?.status!=='submitting')return note;changed=true;return {...note,getAnalysis:{...note.getAnalysis,status:'unknown',error:'提交时服务中断，结果待核对；不会自动重提',canRetry:false,updatedAt:now()}};});if(changed)await write({...state,notes});}).catch(()=>{});
      enabled=true;wake();
    },
    async close() {enabled=false;clearTimeout(timer);await running;},
  };
}

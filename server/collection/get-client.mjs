import {extractNoteIdFromUrl} from './lib/note-import.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';

const exec = promisify(execFile);
const BASE = 'https://openapi.biji.com/open/api/v1';
export function getSourceUrl(value) {
  let id;try{id=extractNoteIdFromUrl(value);}catch{return '';}if(!id)return '';
  if(!id.startsWith('douyin-'))return 'https://www.xiaohongshu.com/explore/'+id;
  return 'https://www.douyin.com/'+(new URL(value).pathname.startsWith('/note/')?'note/':'video/')+id.slice(7);
}
export class GetError extends Error {
  constructor(message, kind='query') { super(message); this.kind=kind; }
}
async function credentials() {
  try {
    const read=async account=>(await exec('/usr/bin/security',['find-generic-password','-s','digital-world-get-notes','-a',account,'-w'],{timeout:5000,maxBuffer:4096})).stdout.trim();
    const clientId=await read('client-id'),key=await read('api-key');
    if (!/^cli_[a-zA-Z0-9]+$/.test(clientId) || !/^[\x21-\x7e]{20,1024}$/.test(key)) throw new Error();
    return {clientId,key};
  } catch { throw new GetError('GET接入未配置或钥匙串不可用，请完成本机接入配置','rejected'); }
}
const remoteId=value=>typeof value==='string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
export function createGetClient({fetchImpl=fetch,readCredentials=credentials}={}) {
  return {async session() {
    const {clientId,key}=await readCredentials();
    async function request(path,body) {
      let response,payload;
      try {
        response=await fetchImpl(BASE+path,{method:body?'POST':'GET',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000),headers:{Authorization:key,'X-Client-ID':clientId,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
        // Bound untrusted responses without putting headers, URLs, or raw errors in logs.
        const reader=response.body.getReader();let size=0;const chunks=[];
        try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4*1024*1024)throw new Error();chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
        payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch { throw new GetError('GET请求结果待核对，请保留当前记录','unknown'); }
      if (!response.ok || payload.success!==true) {
        const rawCode=payload.error?.code ?? payload.code;
        const code=/^\d{1,6}$/.test(String(rawCode))?String(rawCode):'';
        const rejected=response.status>=400 && response.status<500 && response.status!==408;
        throw new GetError(code==='10004'?'GET授权已失效，请更新本机接入配置':code==='10008'?'GET应用缺少读取或新增笔记权限':code==='10201'?'GET账户当前不可用，请核对账户状态':`GET未完成请求${code?'（'+code+'）':''}`,rejected?'rejected':'unknown');
      }
      return payload.data;
    }
    return {
      binding:createHash('sha256').update(clientId).digest('hex'),
      async create({sourceUrl,requestId}) {
        const data=await request('/resource/note/save',{note_type:'link',link_url:sourceUrl,client_request_id:requestId});
        if(remoteId(data?.note_id))return {noteId:data.note_id};
        const taskId=Array.isArray(data?.tasks) && data.tasks.length===1?data.tasks[0]?.task_id:null;
        if(!remoteId(taskId))throw new GetError('GET提交结果缺少任务编号，待核对','unknown');
        return {taskId};
      },
      async progress(taskId) {
        if(!remoteId(taskId))throw new GetError('GET任务编号无效');
        const data=await request('/resource/note/task/progress',{task_id:taskId});
        if(!['pending','processing','success','failed'].includes(data?.status))throw new GetError('GET任务状态无法识别');
        if(data.status==='success' && !remoteId(data.note_id))throw new GetError('GET完成结果缺少笔记编号');
        return {status:data.status,...(data.status==='success'?{noteId:data.note_id}:{})};
      },
      async detail(noteId) {
        if(!remoteId(noteId))throw new GetError('GET笔记编号无效');
        const data=await request('/resource/note/detail?id='+encodeURIComponent(noteId)),note=data?.note;
        if(String(note?.note_id ?? note?.id)!==noteId)throw new GetError('GET笔记编号不匹配');
        if(typeof note?.content!=='string' || !note.content.trim() || Buffer.byteLength(note.content)>512*1024 || typeof note.title!=='string' || note.title.length>1000)throw new GetError('GET整理正文为空或超过本机保存上限');
        const sourceUrl=getSourceUrl(note.web_page?.url || '');
        return {title:note.title,content:note.content,sourceUrl};
      },
    };
  }};
}

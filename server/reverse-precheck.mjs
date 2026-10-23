import {mkdtemp,mkdir,rm,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {browserTargets} from './reverse-json.mjs';
import {filterRelayText} from '../src/relay-prompt.js';
import {reaError,safeLine} from './reverse-process.mjs';

// Passive metadata only; all executors use this before creating a paid run.
export async function precheckBrowserTarget(target,{directory,execute,getVersion,signal:parentSignal,timeoutMs=15000}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(reaError('timeout','网站预检超过15秒，请检查调试 Chrome 后重试')),timeoutMs);
 const signal=parentSignal?AbortSignal.any([parentSignal,controller.signal]):controller.signal;
 let folder;
 const base={targetUrl:safeLine(target.url,2000),candidates:[]};
 try{
  signal.throwIfAborted();
  const {version}=await getVersion({signal});signal.throwIfAborted();
  if(!version)throw reaError('version','REA注册版本不一致或未知，请先检查REA');
  await mkdir(directory,{recursive:true,mode:0o700});const s=await lstat(directory);if(!s.isDirectory()||s.isSymbolicLink())throw reaError('disk','预检目录身份无效');
  folder=await mkdtemp(join(directory,'web-check-'));
  const origin=new URL(target.url).origin,output=join(folder,'targets.json');
  await execute(version,['list-browser-targets',target.cdpEndpoint||'http://127.0.0.1:9222','--allowed-origins',origin],output,{signal});
  const pages=(await browserTargets(output,{signal})).filter(t=>{
   if(t.type!=='page'||typeof t.url!=='string'||t.url.length>2000||typeof t.target_id!=='string'||!t.target_id||t.target_id.length>500||/[\x00-\x1f\x7f]/.test(t.target_id)||filterRelayText(t.target_id).count)return false;
   try{const u=new URL(t.url);return u.origin===origin&&!u.username&&!u.password&&!/\s/.test(t.url)&&!filterRelayText(t.url).count;}catch{return false;}
  }).map(t=>({targetId:t.target_id,url:t.url,title:safeLine(typeof t.title==='string'?t.title:'未命名页面',200).replace(/[\r\n\t]/g,' '),path:new URL(t.url).pathname+new URL(t.url).search+new URL(t.url).hash}));
  signal.throwIfAborted();
  const matches=pages.filter(p=>p.url===target.url),status=matches.length===1?'ready':matches.length>1?'multiple':pages.length?'mismatch':'unavailable';
  return {...base,status,version,candidates:pages.slice(0,10),...(matches.length===1?{targetId:matches[0].targetId}:{}),...(pages.length?{}:{message:'调试 Chrome 中没有可用的同站页面，请打开目标网址后重试。'})};
 }catch(error){
  if(parentSignal?.aborted)throw parentSignal.reason;
  return {...base,status:'unavailable',message:safeLine((signal.aborted?signal.reason:error)?.message||'无法连接调试 Chrome，请检查本机调试端点。')};
 }finally{clearTimeout(timer);if(folder)await rm(folder,{recursive:true,force:true});}
}

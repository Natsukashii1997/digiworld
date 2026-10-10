import fs from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createConfigJournal} from './config-journal.mjs';
import {CONTENT_AGENTS} from './agent-contents.mjs';
import {failure} from './repository.mjs';
export function createHealthAudit(repository,contents,{clock=Date.now}={}) {
  const root=resolve(repository.directory);let binding=null;
  async function store(){
    const before=await fs.lstat(root),canonical=await fs.realpath(root),id=[before.dev,before.ino,before.birthtimeMs].join(':');
    if(!before.isDirectory()||before.isSymbolicLink()||binding&&(binding.id!==id||binding.path!==canonical))throw failure('体检数据目录身份已变化',503);
    const after=await fs.lstat(root);
    if(after.isSymbolicLink()||[after.dev,after.ino,after.birthtimeMs].join(':')!==id)throw failure('体检数据目录核验期间变化',503);
    if(!binding)binding={id,path:canonical,journal:createConfigJournal(canonical,{folder:'health-audits',label:'能力体检',readLimit:512*1024,validate:validateHealthAudit})};
    return binding.journal;
  }
  let busy=false;
  return {
    async history(){const rows=(await (await store()).list()).filter(r=>r.completedAt);return {at:rows[0]?.at||null,items:rows[0]?.results||[],loaded:rows.length>0};},
    async inspect(input={}){
      if(!input || typeof input!=="object" || Array.isArray(input) || Object.keys(input).length)throw failure('体检只接受已登记Agent，不接受任意路径');
      if(busy)throw failure('体检正在进行',409);busy=true;
      try {
        const journal=await store();if((await journal.list()).length>=500)throw failure('体检回执达到500条上限，未执行新检查',409);
        const state=await repository.read(),known=new Set([...(state.connections?.agents||[]).filter(a=>a.status==='detected'||a.status==='config_only').map(a=>a.id),...(state.connections?.agentTargets||[]).map(a=>a.agentId)]);
        const at=new Date(clock()).toISOString(),results=[];
        for(const def of CONTENT_AGENTS.filter(a=>known.has(a.id))){
          try {const x=await contents.inspect({agentId:def.id});results.push({agentId:def.id,name:def.name,at:x.at||at,status:'checked',health:x.health,scope:['Skill入口与链接','仓库版本差异','配置/插件元数据'],unread:['MCP配置正文','凭据','私人会话','实际运行效果'],groups:Object.fromEntries(['skills','plugins','configs'].map(k=>[k,{status:x.groups[k].status,count:x.groups[k].items.length}])),truncated:!!x.truncated});}
          catch {results.push({agentId:def.id,name:def.name,at,status:'unknown',health:null,error:'能力体检读取失败，不能下结论',scope:[],unread:['所有内容']});}
        }
        const record={schema:1,id:randomUUID(),at,results};await journal.prepare(record);await journal.complete(record.id,at);return {at,items:results,loaded:true};
      }finally{busy=false;}
    }
  };
}

const exact=(x,keys)=>x && typeof x==='object' && !Array.isArray(x) && Object.keys(x).length===keys.length && keys.every(k=>Object.hasOwn(x,k));
const instant=x=>typeof x==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x) && Number.isFinite(Date.parse(x));
export function validateHealthAudit(row) {
  const fail=()=>{throw failure('体检记录无效；结果未知，未执行新检查',503);};
  if(!exact(row,['schema','id','at','results']) || row.schema!==1 || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(row.id) || !instant(row.at) || !Array.isArray(row.results) || row.results.length>CONTENT_AGENTS.length)fail();
  const seen=new Set();
  for(const x of row.results) {
    const fields=x?.status==='checked'?['agentId','name','at','status','health','scope','unread','groups','truncated']:['agentId','name','at','status','health','error','scope','unread'];
    if(!exact(x,fields) || !['checked','unknown'].includes(x.status) || seen.has(x.agentId) || !CONTENT_AGENTS.some(a=>a.id===x.agentId&&a.name===x.name) || !instant(x.at))fail();
    seen.add(x.agentId);
    for(const k of ['scope','unread'])if(!Array.isArray(x[k]) || x[k].length>10 || x[k].some(t=>typeof t!=='string'||t.length>100||/[\x00-\x1f\x7f]/.test(t)))fail();
    if(x.status==='unknown') {if(x.health!==null || typeof x.error!=='string'||x.error.length>200)fail();continue;}
    if(!exact(x.health,['brokenLinks','drift','unreadable']) || Object.values(x.health).some(n=>!Number.isSafeInteger(n)||n<0) || typeof x.truncated!=='boolean' || !exact(x.groups,['skills','configs','plugins']))fail();
    for(const g of Object.values(x.groups))if(!exact(g,['status','count']) || !['ok','present','missing','blocked','unreadable','not_read'].includes(g.status) || !Number.isSafeInteger(g.count)||g.count<0)fail();
  }
  return row;
}

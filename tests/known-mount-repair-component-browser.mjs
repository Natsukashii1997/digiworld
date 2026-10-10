// Synthetic component/browser boundary: real repair service, journals, pending
// hook and request client; random local port and throwaway target directories.
// No workbench production server, data directory, Agent Home or 5178 is used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createKnownMountRepair} from '../server/known-mount-repair.mjs';
import {createConfigJournal} from '../server/config-journal.mjs';
import {digest} from '../server/repository.mjs';
import {normaliseFiles} from '../server/agent-write.mjs';
import {readLocalSkill} from '../server/skill-files.mjs';
import {makeAsset,current} from '../src/store.js';

const project='/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench';
const here=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(join(project,'package.json'));
const {build}=require('esbuild'),{chromium}=require('playwright');
const {geometry,axe}=await import(join(project,'tests/ui-v14-checks.mjs'));
const stamp='2026-10-07T10:00:00.000Z';
const id=s=>JSON.stringify([s.dev,s.ino,s.birthtimeMs,s.uid]);
const programId=s=>[s.dev,s.ino,s.birthtimeMs,s.uid,s.size,s.mtimeMs].join(':');
const signature=t=>digest(JSON.stringify([t.agentId,t.program.path,t.program.kind,t.home.id,t.home.path,t.bindingId||null]));
const output=process.env.GUIJI_TEST_RESULTS||join(here,'test-results/known-mount-repair-component');
await fs.mkdir(output,{recursive:true});

async function synthetic(){
  const base=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'guiji-repair-browser-')));
  const data=join(base,'database'),home=join(base,'independent-home'),skills=join(home,'skills'),program=join(base,'synthetic-cli');
  for(const path of [data,home,skills])await fs.mkdir(path,{mode:0o700});
  await fs.writeFile(program,'SYNTHETIC CLI',{mode:0o600});
  const asset=makeAsset({type:'Skill',title:'合成固定 Skill',files:[{path:'SKILL.md',text:true,data:'---\nname: synthetic-repair\n---\n# 固定版本\n',mode:0o600}]});
  const pkg=normaliseFiles(current(asset).files),to=join(skills,pkg.name);
  const target={id:'target-codex',agentId:'codex',bindingId:'binding-one',label:'合成 Codex',program:{path:program,kind:'CLI'},home:{id:'synthetic-home',path:home,label:'合成 Home'}};
  const homeIdentity=id(await fs.lstat(home)),programIdentity=programId(await fs.lstat(program));
  const originalId=randomUUID(),captureId=randomUUID();
  await fs.mkdir(to,{mode:0o700});const directoryIdentity=id(await fs.lstat(to));await fs.rmdir(to);
  const original={schema:1,id:originalId,kind:'publish',targetId:target.id,targetSignature:signature(target),homeSignature:digest(homeIdentity),programSignature:digest(programIdentity),name:pkg.name,from:null,to,beforeHash:null,afterHash:pkg.hash,directoryIdentity:null,mode:0o700,at:stamp,restores:null,assetId:asset.id,versionId:current(asset).id,sourceTargetId:null,sourceSignature:null,sourceHash:null,generation:1,captureId};
  const journal=createConfigJournal(data,{folder:'agent-write-operations',validate:v=>v,label:'合成原发布'});
  await journal.prepare(original);await journal.complete(originalId,stamp);
  await journal.prepare({...original,id:captureId,kind:'ownership',restores:null,directoryIdentity,captureId:null});
  const state={revision:1,assets:[asset],connections:{agentTargets:[target]}};
  let queue=Promise.resolve();
  const repository={directory:data,read:async()=>structuredClone(state),withSnapshot(_o,fn){
    const next=queue.then(()=>fn(structuredClone(state)));queue=next.catch(()=>{});return next;
  }};
  const settings={get:async()=>({enabled:true,generation:1}),assertEnabled:async()=>({enabled:true,generation:1})};
  const receiptId=randomUUID();
  const adapters={readAgentRepairSkill:readLocalSkill,inspectAgentInventory:async()=>({errors:[],truncated:false,homes:[{id:target.home.id,path:home,source:'合成独立目录',status:'present',identity:id(await fs.lstat(home)),errors:[]}]}),inspectAgentPrograms:async()=>[{path:program,kind:'CLI',status:'present',identity:programId(await fs.lstat(program))}],inspectSkillAdmission:async q=>({...q,status:'approved',receiptId}),assertSkillAdmission:async q=>({...q,status:'approved'})};
  const manager=()=>createKnownMountRepair(repository,{settings,adapters,checkMetadata:async()=>{}});
  return{base,to,state,originalId,manager,close:()=>fs.rm(base,{recursive:true,force:true})};
}

async function start(f){
  const dir=await fs.mkdtemp(join(tmpdir(),'guiji-repair-ui-'));
  const entry=join(dir,'entry.jsx'),bundle=join(dir,'app.js');
  await fs.writeFile(entry,`import React,{useEffect,useRef,useState} from 'react';\nimport{createRoot}from'react-dom/client';\nimport{KnownMountRepair}from ${JSON.stringify(join(here,'src/KnownMountRepair.jsx'))};\nfunction App(){const[open,setOpen]=useState(true),busy=useRef(false);useEffect(()=>{const key=e=>{if(e.key==='Escape'&&!busy.current)setOpen(false)};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)},[]);return open?<div role="dialog" aria-label="合成 Skill 修复"><KnownMountRepair originalId={window.ORIGINAL_ID} revision={1} onBusy={value=>busy.current=value}/></div>:<p>已关闭</p>}createRoot(document.getElementById('root')).render(<App/>);`);
  await build({entryPoints:[entry],outfile:bundle,bundle:true,platform:'browser',format:'esm',jsx:'automatic',nodePaths:[join(project,'node_modules')],plugins:[{name:'repair-ui-adapters',setup(b){
    b.onResolve({filter:/^\.\/components\.jsx$/},a=>a.importer.endsWith('KnownMountRepair.jsx')?{path:'stub-button',namespace:'repair-stub'}:undefined);
    b.onLoad({filter:/.*/,namespace:'repair-stub'},()=>({contents:'export function Button({children,secondary,...props}){return <button {...props}>{children}</button>}',loader:'jsx',resolveDir:join(project,'src')}));
    b.onResolve({filter:/^\.\/(api|useAgentPending)\.js$/},a=>a.importer.endsWith('KnownMountRepair.jsx')?{path:join(project,'src',a.path.slice(2))}:undefined);
  }}]});
  const js=await fs.readFile(bundle);
  let manager=f.manager(),calls={authorize:0,apply:0};
  const server=createServer(async(req,res)=>{
    const send=(code,value,type='application/json')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store'});res.end(type==='application/json'?JSON.stringify(value):value);};
    const path=new URL(req.url,'http://127.0.0.1').pathname;
    if(path==='/')return send(200,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>合成 Skill 修复</title><style>body{margin:0;padding:12px;background:#fff;color:#111;font:16px/1.5 system-ui} [role=dialog]{max-width:620px;margin:auto;border:1px solid #777;padding:12px;box-sizing:border-box} button,summary{min-height:44px;min-width:44px;margin:3px;padding:7px;background:#eee;color:#111;border:1px solid #555;border-radius:5px}label{display:block;min-height:44px;box-sizing:border-box;padding:8px}input[type=checkbox]{width:20px;height:20px}code{overflow-wrap:anywhere;white-space:normal}p,li{overflow-wrap:anywhere}details{max-width:100%}</style><div id="root"></div><script>window.ORIGINAL_ID=${JSON.stringify(f.originalId)}</script><script type="module" src="/app.js"></script></html>`,'text/html');
    if(path==='/app.js')return send(200,js,'text/javascript');
    if(path==='/api/session')return send(200,{token:'synthetic-token',dataRootIdentity:'a'.repeat(64)});
    if(path.startsWith('/api/capabilities/agent/repair-')){
      const action=path.slice('/api/capabilities/agent/repair-'.length);if(!['preview','authorize','apply','check','resume','cancel'].includes(action))return send(404,{error:'unknown action'});
      if(action==='authorize')calls.authorize++;if(action==='apply')calls.apply++;
      let body='';for await(const chunk of req)body+=chunk;
      try{return send(200,await manager[action](JSON.parse(body)));}catch(e){return send(e.status||500,{error:e.message});}
    }
    return send(404,{error:'synthetic route denied'});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  assert.notEqual(server.address().port,5178);
  return{url,calls,restart:()=>{manager=f.manager();},close:async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}};
}

const browser=await chromium.launch({headless:true});
async function context(){const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await c.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.syntheticCopiedId=text;}}});});await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());return c;}
async function opened(c,app){const p=await c.newPage();await p.goto(app.url);await p.getByRole('button',{name:'预览原发布记录与缺失目录'}).waitFor();return p;}
async function authorize(p){await p.getByRole('button',{name:'预览原发布记录与缺失目录'}).click();await p.getByRole('region',{name:'修复预览'}).waitFor();await p.getByRole('checkbox').check();await p.getByRole('button',{name:'单独授权本次修复'}).click();}
try{
  // Same-event double click and Escape share the parent's synchronous busy ref.
  {
    const f=await synthetic(),app=await start(f),c=await context();
    try{
      const p=await opened(c,app);await p.getByRole('button',{name:'预览原发布记录与缺失目录'}).click();await p.getByRole('checkbox').check();
      await p.route('**/api/capabilities/agent/repair-authorize',async r=>{await new Promise(resolve=>setTimeout(resolve,250));const response=await r.fetch();assert.equal(response.status(),200);await r.abort('failed');});
      await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='单独授权本次修复');b.click();b.click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
      assert.equal(await p.getByRole('dialog',{name:'合成 Skill 修复'}).count(),1);
      await p.getByRole('alert').filter({hasText:'本地服务连接中断'}).waitFor();assert.equal(app.calls.authorize,1);
      await p.close();app.restart();
      const next=await opened(c,app);await next.getByRole('button',{name:'查询原编号并复验字节'}).click();await next.getByRole('button',{name:'恢复本次授权预览'}).waitFor();
      await next.getByRole('button',{name:'复制完整原编号'}).click();
      assert.equal(await next.evaluate(()=>window.syntheticCopiedId),await next.getByText('查看完整原编号').locator('..').locator('code').textContent());
      await next.getByRole('button',{name:'恢复本次授权预览'}).click();await next.getByRole('region',{name:'修复预览'}).waitFor();
      for(const width of [390,320]){await next.setViewportSize({width,height:844});await geometry(next,'[role=dialog]',`修复 ${width}`);await axe(next,`修复 ${width}`);await next.screenshot({path:join(output,`repair-authorized-${width}.png`),fullPage:true});}
      f.state.revision++;
      await next.getByRole('button',{name:'查询原编号并复验字节'}).click();await next.getByRole('button',{name:'恢复本次授权预览'}).click();
      await next.getByRole('alert').filter({hasText:'主库版本已变化'}).waitFor();
      await next.getByRole('button',{name:'取消尚未执行的本次授权'}).click();
      await next.getByText('本次修复授权已取消，未重建目录').waitFor();
      assert.equal(await next.getByText('待查原编号：').count(),0);
      assert.equal(await fs.access(f.to).then(()=>true,()=>false),false);
    }finally{await c.close();await app.close();await f.close();}
  }
  // Apply response loss must resolve the original id; no second apply.
  {
    const f=await synthetic(),app=await start(f),c=await context();
    try{
      const p=await opened(c,app);await authorize(p);await p.getByText('已授权；目录尚未重建。').waitFor();
      await p.getByRole('checkbox').check();
      await p.route('**/api/capabilities/agent/repair-apply',async r=>{const response=await r.fetch();assert.equal(response.status(),200);await r.abort('failed');});
      await p.getByRole('button',{name:'确认重建缺失的独立目录'}).click();
      await p.getByRole('alert').filter({hasText:'本地服务连接中断'}).waitFor();
      await p.close();app.restart();
      const next=await opened(c,app);await next.getByRole('button',{name:'查询原编号并复验字节'}).click();
      await next.getByText('独立 Skill 目录字节已复验').waitFor();
      assert.equal(app.calls.apply,1);assert.equal(await fs.access(f.to).then(()=>true,()=>false),true);
    }finally{await c.close();await app.close();await f.close();}
  }
  console.log('known-mount-repair-browser: synthetic doubleclick/Escape, resume, cancel, apply-loss/check, 320/390 geometry+axe passed');
}finally{await browser.close();}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createWorkflowDeploy} from '../server/workflow-deploy.mjs';
import {makeAsset,current} from '../src/store.js';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const targetIdentity=s=>[s.dev,s.ino,s.birthtimeMs,s.uid,s.size,s.mtimeMs].join(':');
const homeIdentity=s=>[s.dev,s.ino,s.birthtimeMs,s.uid].join(':');
async function fixture(t,{skill=false,filesystem=fs}={}){
  const base=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'guiji-workflow-synthetic-')));
  const database=join(base,'database'),workspace=join(base,'project-workspace'),home=join(base,'independent-home'),program=join(base,'synthetic-cli');
  for(const path of [database,workspace,home])await fs.mkdir(path,{mode:0o700});
  await fs.writeFile(program,'SYNTHETIC CLI NEVER EXECUTE',{mode:0o600});
  const prompt=makeAsset({type:'Prompt',title:'合成提示',content:'原字节\r\nPrompt'});
  const dependency=skill?makeAsset({type:'Skill',title:'合成技能',files:[{path:'SKILL.md',text:true,data:'---\nname: synthetic\n---\n# 合成\n',mode:0o600}]}):prompt;
  const flow=makeAsset({type:'Workflow',title:'合成流程',content:'先判断再实施。'});
  current(flow).references=[{assetId:dependency.id,versionId:current(dependency).id}];
  const target={schema:1,id:'synthetic-target',agentId:'codex',bindingId:'binding-one',label:'合成 Codex',program:{path:program,kind:'CLI'},home:{id:'synthetic-home',path:home,label:'合成独立 Home'}};
  const project={id:'synthetic-project',name:'合成项目',localPaths:[workspace],locations:[{path:workspace,status:'present'}]};
  const state={revision:1,assets:[dependency,flow],connections:{agentTargets:[target],projects:[project]}};
  let queue=Promise.resolve();
  const repository={directory:database,read:async()=>structuredClone(state),withSnapshot:(_o,fn)=>{
    const current=queue.then(()=>fn(structuredClone(state)));
    queue=current.catch(()=>{});
    return current;
  }};
  const adapters={checkWorkflowDeployMetadata:async()=>{},inspectAgentInventory:async()=>({errors:[],truncated:false,homes:[{id:target.home.id,path:home,status:'present',source:'合成独立目录',identity:homeIdentity(await fs.lstat(home)),errors:[]}]}),inspectAgentPrograms:async()=>[{path:program,kind:'CLI',status:'present',identity:targetIdentity(await fs.lstat(program))}]};
  let now=Date.parse('2026-10-07T12:00:00.000Z');
  const manager=()=>createWorkflowDeploy(repository,{adapters,clock:()=>now,filesystem});
  const input=()=>({assetId:flow.id,versionId:current(flow).id,targetId:target.id,projectId:project.id,workspacePath:workspace,revision:state.revision});
  t.after(async()=>fs.rm(base,{recursive:true,force:true}));
  return{base,database,workspace,home,program,prompt,dependency,flow,target,project,state,repository,adapters,manager,input,advance:ms=>{now+=ms;}};
}
const authorize=p=>({token:p.token,operationId:p.operationId,confirmed:true});
const query=p=>({operationId:p.operationId,assetId:p.assetId,versionId:p.versionId});

test('固定 Prompt 包：独立授权后只创建项目工作区副本，字节与绑定回读；无原生采用结论',async t=>{
  const f=await fixture(t),api=f.manager(),p=await api.preview(f.input());
  assert.equal(p.adoption,'unverified');assert.match(p.scope,/独立副本/);
  assert.ok(p.changes.some(c=>c.path.endsWith('/workflow.md')&&c.beforeHash===null));
  await assert.rejects(api.apply(authorize(p)),/授权/);
  assert.equal((await fs.readdir(f.workspace)).length,0);
  assert.equal((await api.authorize(authorize(p))).status,'authorized');
  const result=await api.apply(authorize(p));assert.equal(result.status,'matches_after');assert.equal(result.adoption,'unverified');
  const manifest=JSON.parse(await fs.readFile(join(p.path,'manifest.json'),'utf8'));
  assert.equal(manifest.workflow.assetId,f.flow.id);
  const copied=await fs.readFile(join(p.path,'assets/prompts',f.prompt.id,current(f.prompt).id+'.md'));
  assert.equal(sha(copied),p.changes.find(c=>c.path.endsWith(current(f.prompt).id+'.md')).afterHash);
  assert.equal((await fs.stat(join(p.path,'workflow.md'))).mode&0o777,0o600);
  assert.equal((await f.manager().check(query(p))).status,'matches_after');
  assert.deepEqual(await fs.readdir(f.home),[]);
  assert.deepEqual((await f.repository.read()).assets,f.state.assets);
  await fs.mkdir(join(p.path,'unexpected'),{mode:0o700});
  assert.equal((await api.check(query(p))).status,'changed');
});

test('固定 Skill 无准入记录默认拒绝；有同字节准入回执仅作非激活副本',async t=>{
  const f=await fixture(t,{skill:true});
  await assert.rejects(f.manager().preview(f.input()),/准入审核/);
  assert.deepEqual(await fs.readdir(f.workspace),[]);
  f.adapters.skillAdmission=async q=>({approved:true,sha256:q.sha256});
  const api=f.manager(),p=await api.preview(f.input());
  assert.equal(p.dependencies[0].type,'Skill');assert.match(p.dependencies[0].status,/非激活/);
  await api.authorize(authorize(p));assert.equal((await api.apply(authorize(p))).status,'matches_after');
  assert.deepEqual(await fs.readdir(f.home),[]);
});

test('缺依赖、工作区冲突、目标绑定变化和同版目录占用均拒绝',async t=>{
  const f=await fixture(t),api=f.manager();
  const [missing]=f.state.assets.splice(0,1);
  await assert.rejects(api.preview(f.input()),/缺失|引用/);
  f.state.assets.unshift(missing);
  f.project.identityConflict=true;
  await assert.rejects(api.preview(f.input()),/冲突/);
  f.project.identityConflict=false;
  const p=await api.preview(f.input());await api.authorize(authorize(p));
  f.target.bindingId='binding-two';
  await assert.rejects(api.apply(authorize(p)),/身份已变化|重新预览/);
  f.target.bindingId='binding-one';
  await fs.mkdir(p.path,{mode:0o700});
  await assert.rejects(api.apply(authorize(p)),/占用|已有|其它内容/);
  assert.equal((await fs.readdir(p.path)).length,0);
});

test('目标写中断为未知；重启只按原编号检查，不重放缺失文件',async t=>{
  let fail=false;
  const filesystem=new Proxy(fs,{get(o,k){if(k==='open')return async(path,...args)=>{if(fail&&String(path).endsWith('/workflow.md')){fail=false;throw Error('SYNTHETIC_LOST_WRITE');}return o.open(path,...args);};return o[k];}});
  const f=await fixture(t,{filesystem}),api=f.manager(),p=await api.preview(f.input());
  await api.authorize(authorize(p));fail=true;
  const result=await api.apply(authorize(p));assert.equal(result.status,'unknown');
  const before=await fs.readdir(p.path);
  const restarted=f.manager();assert.notEqual((await restarted.check(query(p))).status,'matches_after');
  await assert.rejects(restarted.resume(query(p)),/不能恢复/);
  assert.deepEqual(await fs.readdir(p.path),before);
  assert.equal((await api.apply(authorize(p))).status,'changed');
});

test('子目录被换成链接时停止写入，不跟随链接写入外部目录',async t=>{
  let outside='',injected=false;
  const filesystem=new Proxy(fs,{get(o,k){if(k==='mkdir')return async(path,...args)=>{
    const result=await o.mkdir(path,...args);
    if(outside&&!injected&&String(path).endsWith('/assets')){
      injected=true;await fs.rename(path,path+'-old');await fs.symlink(outside,path);
    }
    return result;
  };return o[k];}});
  const f=await fixture(t,{filesystem});outside=join(f.base,'outside');await fs.mkdir(outside,{mode:0o700});
  const api=f.manager(),p=await api.preview(f.input());await api.authorize(authorize(p));
  assert.equal((await api.apply(authorize(p))).status,'unknown');
  assert.deepEqual(await fs.readdir(outside),[]);
  assert.notEqual((await f.manager().check(query(p))).status,'matches_after');
});

test('查无授权时持久封闭原编号；迟到授权与落地在同一主库锁内拒绝',async t=>{
  const f=await fixture(t),api=f.manager(),p=await api.preview(f.input());
  const closed=await api.check(query(p));assert.equal(closed.status,'not_started');assert.equal(closed.closed,true);
  assert.equal((await f.manager().check(query(p))).closed,true);
  await assert.rejects(api.authorize(authorize(p)),/封闭/);
  await assert.rejects(api.apply(authorize(p)),/封闭/);
  assert.deepEqual(await fs.readdir(f.workspace),[]);
});

test('回读时文件被替换成符号链接：不会跟随链接读取外部文件',async t=>{
  let swap=false,watched='',outside='';
  const filesystem=new Proxy(fs,{get(o,k){if(k==='lstat')return async(path,...args)=>{
    const info=await o.lstat(path,...args);
    if(swap&&path===watched){swap=false;await fs.rename(path,path+'.original');await fs.symlink(outside,path);}
    return info;
  };return o[k];}});
  const f=await fixture(t,{filesystem}),api=f.manager(),p=await api.preview(f.input());
  await api.authorize(authorize(p));assert.equal((await api.apply(authorize(p))).status,'matches_after');
  watched=join(p.path,'workflow.md');outside=join(f.base,'outside.txt');await fs.writeFile(outside,'SYNTHETIC OUTSIDE CONTENT',{mode:0o600});swap=true;
  const result=await f.manager().check(query(p));assert.notEqual(result.status,'matches_after');
  assert.equal(await fs.readFile(outside,'utf8'),'SYNTHETIC OUTSIDE CONTENT');
});

test('授权完成后重启可只恢复原编号预览；预览超时或包漂移拒绝旧确认',async t=>{
  const f=await fixture(t),api=f.manager(),p=await api.preview(f.input());
  await api.authorize(authorize(p));
  const resumed=await f.manager().resume(query(p));assert.equal(resumed.operationId,p.operationId);assert.equal(resumed.authorized,true);
  f.advance(300001);
  await assert.rejects(api.apply(authorize(p)),/过期/);
  const fresh=await f.manager().resume(query(p));
  f.state.assets.find(a=>a.id===f.prompt.id).versions[0].content='改变固定引用';
  await assert.rejects(f.manager().resume(query(p)),/变化/);
  assert.equal((await fs.readdir(f.workspace)).length,0);
  assert.ok(fresh.token);
});

test('固定引用变化后可取消未落地授权；持久封闭后迟到确认不得落地',async t=>{
  const f=await fixture(t),api=f.manager(),p=await api.preview(f.input());
  assert.equal((await api.authorize(authorize(p))).status,'authorized');
  f.state.assets.find(a=>a.id===f.prompt.id).versions[0].content='引用已变化';
  await assert.rejects(f.manager().resume(query(p)),/变化/);
  assert.equal((await f.manager().check(query(p))).status,'authorized');
  const cancelled=await f.manager().cancel({...query(p),confirmed:true});
  assert.deepEqual({status:cancelled.status,closed:cancelled.closed},{status:'cancelled',closed:true});
  assert.equal((await f.manager().check(query(p))).status,'cancelled');
  await assert.rejects(api.apply(authorize(p)),/封闭/);
  await assert.rejects(api.authorize(authorize(p)),/封闭/);
  assert.deepEqual(await fs.readdir(f.workspace),[]);
});

test('取消与迟到部署由主库队列串行；已准备部署不能取消',async t=>{
  const f=await fixture(t),api=f.manager(),p=await api.preview(f.input());
  await api.authorize(authorize(p));
  const cancellation=api.cancel({...query(p),confirmed:true});
  const delayedApply=api.apply(authorize(p));
  assert.equal((await cancellation).status,'cancelled');
  await assert.rejects(delayedApply,/封闭/);
  assert.deepEqual(await fs.readdir(f.workspace),[]);

  const second=await api.preview(f.input());await api.authorize(authorize(second));
  assert.equal((await api.apply(authorize(second))).status,'matches_after');
  await assert.rejects(api.cancel({...query(second),confirmed:true}),/不能取消/);
  assert.equal((await api.check(query(second))).status,'matches_after');
});

test('取消响应丢失后重启只查原编号；取消不接受其他资产版本',async t=>{
  const f=await fixture(t),api=f.manager(),p=await api.preview(f.input());
  await api.authorize(authorize(p));
  await assert.rejects(api.cancel({...query(p),assetId:'other',confirmed:true}),/不属于/);
  await api.cancel({...query(p),confirmed:true}); // 模拟浏览器没有收到响应
  const restarted=f.manager();
  assert.deepEqual({status:(await restarted.check(query(p))).status,closed:(await restarted.check(query(p))).closed},{status:'cancelled',closed:true});
  await assert.rejects(restarted.resume(query(p)),/封闭/);
});

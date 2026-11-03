import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';import {setTimeout as delay} from 'node:timers/promises';
import {openRepository} from '../server/repository.mjs';import {createReverseRunner} from '../server/reverse-runner.mjs';import {createReaProcess} from '../server/reverse-process.mjs';import {createAiProcess} from '../server/reverse-ai-process.mjs';import {seed} from '../src/store.js';import {createSpecimen} from '../src/reverse-recipe.js';import {createReverseSkillV4} from '../server/reverse-skill-v4.mjs';import {validateReverseRecords} from '../server/schema.mjs';import {assetDeleteBlockers} from '../server/asset-delete.mjs';import {generateReplicaSkill} from '../src/reverse-v4.js';import {buildReplicaPack} from '../src/reverse-v4.js';
const fake=fileURLToPath(new URL('./fake-ai.mjs',import.meta.url));
const executeAi=createAiProcess({commands:Object.fromEntries(['codex','claude'].map(x=>[x,{command:process.execPath,prefix:[fake,x]}]))});
export async function setupAi(options={}){
 const directory=await realpath(await mkdtemp(join(tmpdir(),'ai-runner-'))),path=join(directory,'target.asar');await writeFile(path,'synthetic');
 const repository=await openRepository(directory),state=seed();const record=createSpecimen({type:'FN',target:{kind:'electron',path,feature:'copy',authorized:true,clues:[]}});state.reverseRecords=[record];await repository.write(state,{initialize:true});
 const runner=await createReverseRunner({repository,execute:createReaProcess({command:process.execPath,prefix:[fileURLToPath(new URL('./fake-rea.mjs',import.meta.url))]}),executeAi,...options});
 return {directory,repository,record,runner,async start(executor){const {checkId}=await runner.check({path});return runner.start({executor,recordId:record.id,requestId:randomUUID(),checkId,expectedRevision:(await repository.read()).revision});},async close(){await runner.close();await repository.close();await rm(directory,{recursive:true,force:true});}};
}
export async function finished(app){for(let i=0;i<400;i++){const q=await app.runner.query({recordId:app.record.id});if(q.run?.status!=='running'&&!q.busy)return q.run;await delay(15);}throw Error('hung');}
test('REA→AI原子留旧包，失败不覆盖，版本可回退且普通保存不能伪写',async()=>{
 let bad=false;const app=await setupAi({executeAi:(executor,opts)=>executeAi(executor,{...opts,...(bad?{prompt:'invalid'}:{})})});
 try{
  await app.start('rea');assert.equal((await finished(app)).status,'completed');const first=(await app.repository.read()).reverseRecords[0],old=buildReplicaPack(first);
  await app.start('codex');const run=await finished(app);assert.equal(run.status,'completed',JSON.stringify(run.error));assert.equal(run.executor,'codex');
  let state=await app.repository.read(),r=state.reverseRecords[0];assert.equal(r.packVersions.length,2);assert.match(buildReplicaPack(r),/合成复刻/);
  await app.runner.selectVersion({recordId:r.id,versionId:first.activePackVersionId,expectedRevision:state.revision});state=await app.repository.read();assert.equal(buildReplicaPack(state.reverseRecords[0]),old);
  bad=true;await app.start('claude');assert.equal((await finished(app)).status,'failed');state=await app.repository.read();assert.equal(buildReplicaPack(state.reverseRecords[0]),old);
  state.reverseRecords[0].packVersions[0].result.pack='forged';await assert.rejects(app.repository.write(state));
 }finally{await app.close();}
});

test('运行裁剪后REA证据与Skill保留，八版本切旧再生成仍可回切，固定资产不可变',async()=>{
 let bad=false;const app=await setupAi({executeAi:(e,o)=>executeAi(e,{...o,...(bad?{prompt:'invalid'}:{})})});
 try{
  await app.start('rea');await finished(app);const original=(await app.repository.read()).reverseRecords[0],oldId=original.activePackVersionId;
  bad=true;for(let i=0;i<8;i++){await app.start('codex');await finished(app);}
  let state=await app.repository.read(),r=state.reverseRecords[0];assert.ok(!r.reaRuns.some(x=>x.id===oldId));assert.ok(generateReplicaSkill(r).files.some(f=>f.path==='evidence.json'));
  const svc=createReverseSkillV4({repository:app.repository}),p=await svc.preview({recordId:r.id,expectedRevision:state.revision}),saved=await svc.confirm({recordId:r.id,token:p.token,packVersionId:oldId});const oldAsset=structuredClone(saved.state.assets.find(a=>a.id===saved.saved.assetId));
  bad=false;for(let i=0;i<7;i++){await app.start(i%2?'claude':'codex');await finished(app);}
  state=await app.repository.read();await app.runner.selectVersion({recordId:r.id,versionId:oldId,expectedRevision:state.revision});await app.start('claude');await finished(app);
  state=await app.repository.read();r=state.reverseRecords[0];assert.equal(r.packVersions.length,8);assert.ok(r.packVersions.some(v=>v.id===oldId));assert.deepEqual(state.assets.find(a=>a.id===oldAsset.id),oldAsset);assert.ok(!assetDeleteBlockers(state,oldAsset.id).some(x=>x.kind==='reverse'));
  const nextPreview=await svc.preview({recordId:r.id,expectedRevision:state.revision});assert.ok(nextPreview.token);
  await app.runner.selectVersion({recordId:r.id,versionId:oldId,expectedRevision:state.revision});await assert.rejects(svc.confirm({recordId:r.id,token:nextPreview.token,packVersionId:nextPreview.packVersionId}),/版本已变化/);
  const queried=await svc.query({recordId:r.id,packVersionId:oldId});assert.equal(queried.saved.assetId,oldAsset.id);
 }finally{await app.close();}
});
test('导入AI成功必须绑定完整结果，版本选择要求revision与存在的记录',async()=>{
 const app=await setupAi();try{
  await app.start('codex');await finished(app);const state=await app.repository.read(),r=state.reverseRecords[0];
  for(const change of [v=>delete v.packVersions,v=>v.reaRuns[0].packVersionId='missing',v=>v.packVersions[0].executor='claude',v=>v.packVersions[0].target.feature='wrong']){const altered=structuredClone(r);change(altered);assert.throws(()=>validateReverseRecords([altered]));}
  await assert.rejects(app.runner.selectVersion({recordId:r.id,versionId:r.activePackVersionId}),/revision/);
  await assert.rejects(app.runner.selectVersion({recordId:'missing',versionId:r.activePackVersionId,expectedRevision:state.revision}),/不存在/);
  assert.match(r.reaRuns[0].log.at(-1).text,/用量/);
 }finally{await app.close();}
});
test('AI超时、REA与更新互斥、重启中断和原请求幂等',async()=>{
 let externalBusy=false;const app=await setupAi({aiTimeoutMs:180,externalBusy:()=>externalBusy,executeAi:(e,o)=>executeAi(e,{...o,prompt:'tree'})});
 try{
  externalBusy=true;await assert.rejects(app.start('codex'),/已有取证/);externalBusy=false;
  const {run}=await app.start('codex');assert.equal((await app.runner.start({recordId:app.record.id,requestId:run.id,executor:'codex'})).reused,true);await assert.rejects(app.start('rea'),/已有取证/);assert.equal((await finished(app)).error.kind,'timeout');
  await app.repository.updateReverse(records=>records.map(r=>({...r,reaRuns:[{...run,id:'crashed',status:'running'}]})));await app.runner.close();let calls=0;const reopened=await createReverseRunner({repository:app.repository,executeAi:async()=>{calls++;throw Error('must not run');}});assert.equal((await reopened.query({recordId:app.record.id})).run.status,'interrupted');assert.equal(calls,0);await reopened.close();
 }finally{await app.close();}
});

test('确认期间切换版本不能误存或误回另一份固定Skill',async()=>{
 const app=await setupAi();try{
  const svc=createReverseSkillV4({repository:app.repository});await app.start('codex');await finished(app);let state=await app.repository.read();const recordId=app.record.id,b=state.reverseRecords[0].activePackVersionId;
  let preview=await svc.preview({recordId,expectedRevision:state.revision});await svc.confirm({recordId,token:preview.token,packVersionId:b});
  await app.start('claude');await finished(app);state=await app.repository.read();const a=state.reverseRecords[0].activePackVersionId;preview=await svc.preview({recordId,expectedRevision:state.revision});
  const update=app.repository.updateReverseSkill.bind(app.repository);let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  app.repository.updateReverseSkill=async fn=>{enter();await gate;return update(fn);};
  const confirm=svc.confirm({recordId,token:preview.token,packVersionId:a});const rejected=assert.rejects(confirm,/版本已变化/);await entered;await app.runner.selectVersion({recordId,versionId:b,expectedRevision:state.revision});release();await rejected;
  state=await app.repository.read();await app.runner.selectVersion({recordId,versionId:a,expectedRevision:state.revision});state=await app.repository.read();preview=await svc.preview({recordId,expectedRevision:state.revision});
  app.repository.updateReverseSkill=async fn=>{const result=await update(fn);await app.runner.selectVersion({recordId,versionId:b,expectedRevision:result.revision});return result;};
  const saved=await svc.confirm({recordId,token:preview.token,packVersionId:a});assert.equal(saved.saved.packVersionId,a);assert.equal((await app.repository.read()).reverseRecords[0].activePackVersionId,b);
 }finally{await app.close();}
});

test('AI运行经正式runner传递目标保护范围，缓存内目标拒绝且不改目标',async()=>{
 const home=await realpath(await mkdtemp(join(tmpdir(),'ai-runner-home-'))),target=join(home,'.npm/fixture.asar');await mkdir(join(home,'.npm'));await writeFile(target,'synthetic');
 const app=await setupAi({executeAi:createAiProcess({home,commands:{codex:{command:process.execPath,prefix:[fake,'codex']}}})});
 try{
  await app.repository.updateReverse(records=>records.map(r=>({...r,material:{...r.material,target:{...r.material.target,path:target}}})));
  const {checkId}=await app.runner.check({path:target});
  await app.runner.start({recordId:app.record.id,executor:'codex',requestId:randomUUID(),checkId,expectedRevision:(await app.repository.read()).revision});
  const run=await finished(app);assert.equal(run.status,'failed');assert.equal(run.error.kind,'permission');assert.match(run.error.message,/重叠/);
  const {readFile}=await import('node:fs/promises');assert.equal(await readFile(target,'utf8'),'synthetic');
 }finally{await app.close();await rm(home,{recursive:true,force:true});}
});

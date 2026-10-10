import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {openRepository} from '../server/repository.mjs';import {createSkillSourceUpdates} from '../server/skill-source-updates.mjs';import {validateState,validateHistory} from '../server/schema.mjs';import {mergeBackup} from '../server/merge.mjs';import {seed,makeAsset,current,revise} from '../src/store.js';
const files=[{path:'SKILL.md',data:'---\nname: synthetic-source\n---\n测试',text:true,mode:0o644}],AT='2026-10-04T08:00:00.000Z';
function assets(){const parent=makeAsset({type:'Skill',title:'合成来源',files}),old=current(parent),source=revise(parent,{content:'新版',files});const child={...makeAsset({type:'Skill',title:'合成个人版',files}),origin:{kind:'derived',assetId:parent.id,versionId:old.id}};const local={...makeAsset({type:'Skill',title:'本机来源合成',files}),origin:{kind:'local',location:'/synthetic/skill',fingerprint:'a'.repeat(64),capturedAt:AT}};return{source,child,local};}
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'wb-adoption-synthetic-')),repo=await openRepository(dir);try{const {source,child,local}=assets();await repo.write(seed(),{initialize:true});await repo.updateAssets(()=>[source,child,local],{expectedRevision:(await repo.read()).revision});await fn({repo,source,child,local});}finally{await repo.close();await rm(dir,{recursive:true,force:true});}}
test('采用确认：派生来源新版提示、专用追加回读、不替换任何资产/来源版本',()=>fixture(async({repo,source,child})=>{
 const service=createSkillSourceUpdates(repo,{localReader:()=>assert.fail('派生来源不得读取本机文件')});const before=await repo.read(),preview=await service.check({assetId:child.id});assert.equal(preview.status,'updated');assert.equal(preview.source.versionId,current(source).id);
 const result=await service.adopt({token:preview.token,revision:preview.revision});assert.equal(result.record.sourceVersionId,current(source).id);assert.deepEqual(result.state.assets,before.assets);assert.equal(result.state.skillSourceAdoptions.length,1);assert.equal((await repo.read()).skillSourceAdoptions[0].id,result.record.id);
 const replay=await service.adopt({token:preview.token,revision:preview.revision});assert.equal(replay.alreadyAdopted,true);assert.equal(replay.state.revision,result.state.revision);assert.equal((await service.check({assetId:child.id})).status,'current');
}));
test('采用确认：本机来源显式安全注入，预览后漂移/过期不写入',()=>fixture(async({repo,local})=>{
 let fingerprint='b'.repeat(64),clock=Date.parse(AT),calls=0;const service=createSkillSourceUpdates(repo,{clock:()=>clock,localReader:async location=>{calls++;assert.equal(location,'/synthetic/skill');return{location,fingerprint,name:'合成源'};}});
 assert.equal(calls,0);const preview=await service.check({assetId:local.id});assert.equal(calls,1);assert.equal(preview.status,'updated');fingerprint='c'.repeat(64);const before=await repo.read();await assert.rejects(service.adopt({token:preview.token,revision:preview.revision}),/来源已变化/);assert.deepEqual(await repo.read(),before);
 const expired=await service.check({assetId:local.id});clock+=300001;await assert.rejects(service.adopt({token:expired.token,revision:expired.revision}),/过期/);assert.deepEqual(await repo.read(),before);
 await assert.rejects(service.check({assetId:local.id,path:'/arbitrary'}),/请求格式/);
}));
test('采用确认：写前主库漂移、个人新版本、未知来源如实阻断',()=>fixture(async({repo,source,child})=>{
 const service=createSkillSourceUpdates(repo);const preview=await service.check({assetId:child.id}),before=await repo.read();await repo.updateAssets(a=>a.map(item=>item.id===child.id?revise(item,{title:'个人新版本'}):item),{expectedRevision:before.revision});const after=await repo.read();await assert.rejects(service.adopt({token:preview.token,revision:preview.revision}),/主库已变化/);assert.deepEqual(await repo.read(),after);
 await repo.updateAssets(a=>a.map(item=>item.id===source.id?{...item,archived:true}:item),{expectedRevision:after.revision});const missing=await service.check({assetId:child.id});assert.equal(missing.status,'unavailable');assert.equal(missing.token,undefined);
}));
test('采用确认：schema旧库兼容、非法字段拒绝、普通写入不能伪造/改写/删历史',()=>fixture(async({repo,child})=>{
 assert.doesNotThrow(()=>validateState(seed()));const service=createSkillSourceUpdates(repo),preview=await service.check({assetId:child.id}),result=await service.adopt({token:preview.token,revision:preview.revision});const state=result.state;
 const forged={...state,skillSourceAdoptions:[...state.skillSourceAdoptions,{...result.record,id:'forged'}]};assert.throws(()=>validateHistory(state,forged),/专用操作/);await assert.rejects(repo.write(forged),/专用操作/);
 for(const next of [{...state,skillSourceAdoptions:[]},{...state,skillSourceAdoptions:[{...result.record,at:AT}]}])assert.throws(()=>validateHistory(state,next,{allowSkillSourceAdoptions:true}),/历史不可/);
 assert.throws(()=>validateState({...state,skillSourceAdoptions:[{...result.record,installed:true}]}),/字段/);assert.throws(()=>validateState({...state,skillSourceAdoptions:[{...result.record,sourceAssetId:'wrong'}]}),/来源版本/);
}));
test('采用确认：备份只追加并保留顺序，同ID冲突不导入',()=>fixture(async({repo,child})=>{
 const service=createSkillSourceUpdates(repo),preview=await service.check({assetId:child.id}),result=await service.adopt({token:preview.token,revision:preview.revision}),state=result.state;
 const copy={...state,skillSourceAdoptions:[{...result.record,id:'backup-copy'}]};const merged=mergeBackup(state,copy);assert.equal(merged.summary.skillSourceAdoptionsAdded,1);assert.deepEqual(merged.state.skillSourceAdoptions,[result.record,copy.skillSourceAdoptions[0]]);assert.doesNotThrow(()=>validateHistory(state,merged.state,{allowSkillSourceAdoptions:true}));
 const conflict={...state,skillSourceAdoptions:[{...result.record,at:AT}]};assert.throws(()=>mergeBackup(state,conflict),/存在冲突/);assert.deepEqual((await repo.read()).skillSourceAdoptions,state.skillSourceAdoptions);
}));

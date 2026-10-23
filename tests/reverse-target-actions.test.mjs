import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {openRepository} from '../server/repository.mjs';import {seed} from '../src/store.js';import {createSpecimen} from '../src/reverse-recipe.js';
import {saveSpecimenTarget} from '../src/reverse-target-actions.js';import {packTargetMatches,currentPackVersion} from '../src/reverse-ai.js';import {currentRun} from '../src/reverse-v4.js';
const target={kind:'web',url:'https://example.test/community',feature:'交接',clues:['copy'],authorized:true};
test('改用页面复用revision保存并独立回读，旧revision/写后变化不能继续开跑',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'reverse-target-action-')),repo=await openRepository(directory);try{
  const input=seed(),r=createSpecimen({type:'FN',target});input.reverseRecords=[r];await repo.write(input,{initialize:true});const before=await repo.read();let reads=0;
  const args={read:async()=>{reads++;return repo.read();},write:s=>repo.write(s),recordId:r.id,expectedRevision:before.revision,expectedTarget:target,patch:{url:'https://example.test/agents'}};
  const saved=await saveSpecimenTarget(args);assert.equal(reads,2);assert.equal(saved.reverseRecords[0].material.target.url,'https://example.test/agents');assert.equal(saved.revision,before.revision+1);
  await assert.rejects(saveSpecimenTarget(args),/已变化/);
  await assert.rejects(saveSpecimenTarget({...args,expectedRevision:saved.revision,expectedTarget:saved.reverseRecords[0].material.target,patch:{url:'https://example.test/community'},write:async s=>{const result=await repo.write(s);const intervened=await repo.read();intervened.reverseRecords[0].material.target.url='https://example.test/changed';await repo.write(intervened);return result;}}),/回读未确认/);
 }finally{await repo.close();await rm(directory,{recursive:true,force:true});}
});
test('连续采纳已分析线索保留AI结果包和终端，其他目标改动仍失效且历史不改写',()=>{
 const v={id:'run1',executor:'codex',target,result:{clues:['copy','migrate','handoff']}};const original=JSON.stringify(v);
 const record={material:{target:{...target,clues:['copy','migrate','handoff']}},packVersions:[v],activePackVersionId:v.id,reaRuns:[{id:v.id,packVersionId:v.id,status:'completed',executor:'codex',target}]};
 assert.equal(packTargetMatches(v,record.material.target),true);assert.equal(currentPackVersion(record),v);assert.equal(currentRun(record).id,v.id);assert.equal(JSON.stringify(v),original);
 for(const changed of [{...target,clues:['copy','unknown']},{...target,clues:['migrate']},{...target,url:'https://example.test/agents'},{...target,feature:'其他'},{...target,cdpEndpoint:'http://127.0.0.1:9333'}])assert.equal(packTargetMatches(v,changed),false);
 assert.equal(packTargetMatches({...v,executor:'rea'},record.material.target),false);assert.equal(packTargetMatches({...v,result:{}},record.material.target),false);
});

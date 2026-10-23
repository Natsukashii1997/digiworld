import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStableIdentityReader, observationForRegistration} from '../server/directory-identity.mjs';
import {projectDirectory} from '../server/project-context.mjs';
test('卷UUID+inode+纳秒创建时间稳定，dev变化只改变操作stamp',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'wb-stable-id-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));let dev=10;
 const filesystem={...fs,lstat:async(p,o)=>{const v=await fs.lstat(p,o);v.dev=o?.bigint?BigInt(dev):dev;return v;}};
 const volumeUuid=async()=> '11111111-2222-3333-4444-555555555555';
 const a=await projectDirectory([root],root,{identityVersion:2,filesystem,volumeUuid});dev=11;
 const b=await projectDirectory([root],root,{identityVersion:2,filesystem,volumeUuid});
 assert.equal(a.identity,b.identity);assert.equal(a.stableStamp,b.stableStamp);assert.notEqual(a.stamp,b.stamp);
 const other=await projectDirectory([root],root,{identityVersion:2,filesystem,volumeUuid:async()=> '21111111-2222-3333-4444-555555555555'});assert.notEqual(a.identity,other.identity);
});
test('未知卷身份拒绝；inode或创建时间变化不能沿用稳定身份',async()=>{let ino=100n,birthtimeNs=1000001n;
 const filesystem={lstat:async(_,o)=>({isDirectory:()=>true,isSymbolicLink:()=>false,dev:o?.bigint?1n:1,ino:o?.bigint?ino:Number(ino),birthtimeMs:o?.bigint?birthtimeNs/1000000n:Number(birthtimeNs)/1e6,birthtimeNs})};
 const read=()=>createStableIdentityReader({filesystem,volumeUuid:async()=> '11111111-2222-3333-4444-555555555555'})('/fixture');const a=await read();ino++;assert.notEqual((await read()).identity,a.identity);ino--;birthtimeNs++;assert.notEqual((await read()).identity,a.identity);
 await assert.rejects(createStableIdentityReader({filesystem,volumeUuid:async()=>''})('/fixture'),/卷/);
});
test('旧登记按旧算法比较，扫描不会静默升级；明确确认才采用v2',()=>{const observed={identity:'new',identityVersion:2,legacyIdentity:'old'};assert.equal(observationForRegistration(observed,{identity:'old'}).identity,'old');assert.equal(observationForRegistration(observed,{identity:'old'}).identityVersion,undefined);assert.equal(observationForRegistration(observed,{identity:'old'},true).identityVersion,2);assert.equal(observationForRegistration(observed,{identity:'new',identityVersion:2}).identity,'new');});

test('旧登记不升级且正常Git关联变化不被v1/v2差异冻结，真替换继续阻断',async()=>{
 const {mergeProjects}=await import('../server/discovery.mjs');const old={id:'old',name:'project',localPaths:['/fixture/project'],repoKey:'owner/old',locations:[{path:'/fixture/project',identity:'a'.repeat(64),status:'present'}]};
 const local={...old,id:'local',repoKey:'owner/new'};const observation={path:'/fixture/project',status:'present',identityVersion:2,identity:'b'.repeat(64),legacyIdentity:'a'.repeat(64)};
 const result=mergeProjects([old],[local],[],{locations:[observation]});assert.equal(result[0].id,'old');assert.equal(result[0].repoKey,'owner/new');assert.equal(result[0].locations[0].identity,old.locations[0].identity);assert.equal(result[0].locations[0].identityVersion,undefined);
 const replaced=mergeProjects([old],[local],[],{locations:[{...observation,legacyIdentity:'c'.repeat(64)}]});assert.equal(replaced[0].repoKey,'owner/old');assert.equal(replaced[0].locations[0].status,'changed');
});

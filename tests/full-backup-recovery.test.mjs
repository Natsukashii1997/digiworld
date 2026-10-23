import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import * as fs from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
import {parse} from '../src/serialization.js';

async function session(app){return fetch(app.url+'/api/session',{headers:{'X-Workbench-Client':'1'}}).then(r=>r.json());}
async function json(app,path,data){const {token}=await session(app);const r=await fetch(app.url+'/api/full-backup/'+path,{method:data===undefined?'GET':'POST',headers:{'X-Workbench-Token':token,'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});return {status:r.status,body:parse(await r.text())};}
test('超过旧75MiB的恢复包经实际HTTP直接下载上传并完整恢复图片和历史',async t=>{
 const app=await fixture();let target;t.after(async()=>{await app.close();if(target)await fs.rm(target,{recursive:true,force:true});});await app.repository.write(seed(),{initialize:true});await app.repository.write(await app.repository.read());
 const payload=randomBytes(76*1024*1024),hash=createHash('sha256').update(payload).digest('hex');await fs.mkdir(join(app.directory,'note-images'));await fs.writeFile(join(app.directory,'note-images',hash+'.png'),payload);
 const {token}=await session(app);const downloaded=await fetch(app.url+'/api/full-backup/download',{method:'POST',headers:{'X-Workbench-Token':token,'Content-Type':'application/json'},body:'{}'});assert.equal(downloaded.status,200);assert.equal(downloaded.headers.get('content-type'),'application/zip');const bytes=new Uint8Array(await downloaded.arrayBuffer());assert.ok(bytes.length>75*1024*1024);
 const uploaded=await fetch(app.url+'/api/full-backup/upload',{method:'POST',headers:{'X-Workbench-Token':token,'Content-Type':'application/zip'},body:bytes});assert.equal(uploaded.status,200);const preview=await uploaded.json();target=preview.target;
 const result=await json(app,'restore',{token:preview.token,operationId:preview.operationId});assert.equal(result.status,200);assert.equal(result.body.target,target);const restored=await fs.readFile(join(target,'note-images',hash+'.png'));assert.equal(createHash('sha256').update(restored).digest('hex'),hash);assert.equal((await fs.readdir(join(target,'snapshots'))).length,2);
});

test('恢复编号在预览时固定，丢失完成回执后可由重建服务只读确认且不重复恢复',async t=>{
 const {createFullBackup}=await import('../server/full-backup.mjs');
 const app=await fixture();let target;t.after(async()=>{await app.close();if(target)await fs.rm(target,{recursive:true,force:true});});await app.repository.write(seed(),{initialize:true});
 const original=createFullBackup(app.repository,{afterRename:()=>{throw Error('simulated lost completion');}});
 const {bytes}=await original.create();const preview=await original.preview({bytes});target=preview.target;
 assert.match(preview.operationId,/^[a-f0-9-]{36}$/);
 await assert.rejects(original.restore({token:preview.token,operationId:preview.operationId}),/simulated|结果待核对/);
 original.close();const reopened=createFullBackup(app.repository);
 const before=await fs.readdir(join(app.directory,'restore-operations'));
 const result=await reopened.operation(preview.operationId);assert.equal(result.status,'complete');assert.equal(result.target,target);assert.ok(result.verified>0);
 assert.deepEqual(await fs.readdir(join(app.directory,'restore-operations')),before,'查询不补写回执');
 const repeated=await reopened.restore({token:preview.token,operationId:preview.operationId});assert.equal(repeated.status,'complete');assert.equal(repeated.target,target);
 await fs.writeFile(join(target,'CURRENT.json'),'tampered');assert.equal((await reopened.operation(preview.operationId)).status,'unknown','目标存在不能证明完整恢复');
});

test('已准备但未提交的恢复能查到中断；既有目标或链接不伪报成功',async t=>{
 const {createFullBackup}=await import('../server/full-backup.mjs');const {createRestoreOperations}=await import('../server/full-backup-operations.mjs');const {inspectBackup}=await import('../server/full-backup.mjs');
 const app=await fixture();let target;t.after(async()=>{await app.close();if(target)await fs.rm(target,{recursive:true,force:true});});await app.repository.write(seed(),{initialize:true});const service=createFullBackup(app.repository),{bytes}=await service.create(),p=await service.preview({bytes});target=p.target;
 const {manifest,mainDatabase}=inspectBackup(bytes),operations=createRestoreOperations(app.directory);await operations.prepare({id:p.operationId,bytes,token:p.token,manifest,mainDatabase,at:new Date().toISOString()});
 assert.equal((await service.operation(p.operationId)).status,'interrupted');await fs.mkdir(target);assert.equal((await service.operation(p.operationId)).status,'unknown');await fs.rm(target,{recursive:true});await fs.symlink(app.directory,target);assert.equal((await service.operation(p.operationId)).status,'unknown');await fs.unlink(target);
 assert.equal((await service.restore({operationId:p.operationId,token:p.token})).status,'interrupted');await assert.rejects(fs.stat(target),{code:'ENOENT'});
});
test('同编号并发确认只执行一次；编号绑定原预览，HTTP重连仅查询',async t=>{
 const {createFullBackup}=await import('../server/full-backup.mjs');const app=await fixture();let target;t.after(async()=>{await app.close();if(target)await fs.rm(target,{recursive:true,force:true});});await app.repository.write(seed(),{initialize:true});let release,entered;const gate=new Promise(r=>release=r),reached=new Promise(r=>entered=r);let commits=0;
 const service=createFullBackup(app.repository,{afterRename:async()=>{commits++;entered();await gate;}});const {bytes}=await service.create(),p=await service.preview({bytes});target=p.target;const input={operationId:p.operationId,token:p.token},first=service.restore(input);await reached;assert.equal((await service.restore(input)).status,'processing');release();assert.equal((await first).status,'complete');assert.equal(commits,1);await assert.rejects(service.restore({...input,token:'wrong'}),/不一致/);
 const result=await json(app,'operations/'+p.operationId);assert.equal(result.status,200);assert.equal(result.body.status,'complete');assert.equal(result.body.target,target);
});
test('备份容量校验拒绝伪造stored大小和超限源文件，尚未分配大文件内存',async t=>{
 const {packDirectory,inspectBackup,BACKUP_FORMAT}=await import('../server/full-backup.mjs');const {zipSync,strToU8}=await import('fflate');const {FULL_BACKUP_LIMITS}=await import('../src/full-backup-contract.js');
 const raw=strToU8(JSON.stringify({format:BACKUP_FORMAT,schema:1,totalBytes:0,files:[]}));const zip=zipSync({'manifest.json':raw},{level:0});const buf=Buffer.from(zip);for(let i=0;i<buf.length-46;i++)if(buf.readUInt32LE(i)===0x02014b50){buf.writeUInt32LE(1,i+24);break;}
 assert.throws(()=>inspectBackup(buf),/大小/);
 const directory=await fs.mkdtemp(join((await import('node:os')).tmpdir(),'backup-limit-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const file=await fs.open(join(directory,'oversize.bin'),'w');await file.truncate(FULL_BACKUP_LIMITS.dataBytes+1);await file.close();await assert.rejects(packDirectory(directory),e=>e.status===413);
});
test('恢复记录专用scope跨设备号变化保持，真实换目录则隔离',async()=>{
 const {readRestoreScope}=await import('../server/full-backup-operations.mjs');let dev=1,ino=10;const stat=()=>({dev,ino,birthtimeMs:123,uid:process.getuid(),mode:0o700,isDirectory:()=>true,isSymbolicLink:()=>false});const fake={lstat:async()=>stat(),realpath:async p=>p};const before=await readRestoreScope('/fixture/data',fake);dev=9;assert.equal(await readRestoreScope('/fixture/data',fake),before);ino=11;assert.notEqual(await readRestoreScope('/fixture/data',fake),before);
});

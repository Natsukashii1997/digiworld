import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
import {parse,stringify} from '../src/serialization.js';

async function call(app,data){const s=await fetch(app.url+'/api/session',{headers:{'X-Workbench-Client':'1'}}).then(r=>r.json());const r=await fetch(app.url+'/api/scan/projects',{method:'POST',headers:{'X-Workbench-Token':s.token,'Content-Type':'application/json'},body:stringify(data)});return {status:r.status,body:parse(await r.text())};}

test('两个窗口保存扫描范围：旧草稿在扫描前被拒绝，刷新按最新根',async t=>{
 const scanned=[];let remote=0;const app=await fixture({discovery:{scanGitHub:async()=>{remote++;return {items:[],status:'connected',login:'fixture',message:'',truncated:false,at:new Date().toISOString()};},scanLocalProjects:async roots=>{scanned.push(roots);return {items:[],errors:[],truncated:false,at:new Date().toISOString()};}}});t.after(()=>app.close());await app.repository.write(seed(),{initialize:true});
 await call(app,{});const old=(await app.repository.read()).connections.roots;
 const saved=await call(app,{roots:['/fixture/new'],expectedRoots:old});assert.equal(saved.status,200);
 const count=scanned.length,remoteCount=remote;const stale=await call(app,{roots:['/fixture/old-draft'],expectedRoots:old});assert.equal(stale.status,409);assert.equal(scanned.length,count,'冲突不触发本地扫描');assert.equal(remote,remoteCount,'冲突不触发远端扫描');assert.deepEqual((await app.repository.read()).connections.roots,['/fixture/new']);
 const noBase=await call(app,{roots:['/fixture/no-base']});assert.equal(noBase.status,409);
 await app.repository.updateConnections(c=>({...c,projectStallDays:11}));assert.equal((await call(app,{roots:['/fixture/new'],expectedRoots:['/fixture/new']})).status,200,'无关revision不误报范围冲突');
 assert.equal((await call(app,{})).status,200);assert.deepEqual(scanned.at(-1),['/fixture/new']);
});

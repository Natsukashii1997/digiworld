import test from 'node:test';import assert from 'node:assert/strict';
import {permissionRows,savepointThresholds,lastCapabilityUse,calendarPermissionLabel} from '../src/settings-v16.js';
import {settingsData} from './settings-v16-fixture.mjs';import {validateState} from '../server/schema.mjs';import {projectStatusFixture} from './project-status-fixture.mjs';
import {pendingItems} from '../src/pending.js';
test('设置保留核心与历史授权，未知不冒充关闭',()=>{
 const state=settingsData().state;
 let rows=permissionRows(state,null,null);
 assert.deepEqual(rows.map(r=>r.id),['vault','knowledge','calendar','agent','model','daemon']);
 assert.equal(rows.find(r=>r.id==='model').status,'读取中…');
 rows=permissionRows(state,{error:'failed'},null);
 assert.equal(rows.find(r=>r.id==='model').status,'未知');
 rows=permissionRows(state,{enabled:{}},null,{}, {capabilities:{agent:null,model:null,daemon:null}});
 assert.equal(rows.find(r=>r.id==='agent').last,'从未使用');
 assert.equal(lastCapabilityUse({items:[]}), '从未使用');
 assert.equal(lastCapabilityUse({error:'bad'}), '读取失败 · 未知');
 assert.deepEqual(savepointThresholds(),{warn:1,danger:3});
});
test('未存档阈值校验：成对整数且黄小于红，旧库默认不重写',()=>{const s=settingsData().state;validateState(s);for(const [warn,danger] of [[0,3],[1,366],[2,2],[3,1],[1.5,3],['1',3],[1,undefined]])assert.throws(()=>validateState({...s,connections:{...s.connections,projectSavepointWarnDays:warn,projectSavepointDangerDays:danger}}),/未存档阈值/);validateState({...s,connections:{...s.connections,projectSavepointWarnDays:2,projectSavepointDangerDays:5}});});
test('同源阈值持久回读/旧调用保留/过期revision拒绝',async()=>{const a=await projectStatusFixture();try{const ws=await a.workspace();const saved=await a.call('/project-status/settings',{stallDays:7,savepointWarnDays:2,savepointDangerDays:5,revision:ws.revision});assert.equal(saved.status,200);assert.deepEqual(savepointThresholds(saved.body.connections),{warn:2,danger:5});assert.equal((await a.call('/project-status/settings',{stallDays:8,savepointWarnDays:1,savepointDangerDays:3,revision:ws.revision})).status,409);const only=await a.call('/project-status/settings',{savepointWarnDays:3,savepointDangerDays:6,revision:saved.body.revision});assert.equal(only.status,200);assert.equal(only.body.connections.projectStallDays,7);const old=await a.call('/project-status/settings',{stallDays:8,revision:only.body.revision});assert.equal(old.status,200);assert.deepEqual(savepointThresholds(old.body.connections),{warn:3,danger:6});assert.deepEqual(savepointThresholds((await a.workspace()).connections),{warn:3,danger:6});const bad=await a.call('/project-status/settings',{stallDays:8,savepointWarnDays:4,savepointDangerDays:2,revision:old.body.revision});assert.equal(bad.status,400);}finally{await a.close();}});

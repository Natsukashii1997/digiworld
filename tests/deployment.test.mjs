// 合入时放 tests/deployment.test.mjs。无文件/外网写入；全部资产均为合成。
import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';import {makeAsset,current,revise} from '../src/store.js';
import {buildWorkflowDeploymentBundle} from '../src/workflow-references.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const pointer=a=>({assetId:a.id,versionId:current(a).id});
function fixture(){
 const p=makeAsset({type:'Prompt',title:'合成提示词',content:'保留\r\n原文🙂'});
 const s=makeAsset({type:'Skill',title:'合成技能',files:[{path:'demo',data:[],text:false,directory:true,mode:0o755},{path:'demo/SKILL.md',data:'---\nname: synthetic-skill\n---\n合成说明',text:true,mode:0o644},{path:'demo/run.sh',data:'#!/bin/sh\nprintf synthetic',text:true,mode:0o755},{path:'demo/blob.bin',data:[0,255,128,1],text:false}]});
 const w=makeAsset({type:'Workflow',title:'合成工作流',content:'按顺序核对',references:[pointer(p),pointer(s)]});return{p,s,w};
}
function zipAttrs(bytes){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),map=new Map();for(let i=0;i<bytes.length-46;i++)if(view.getUint32(i,true)===0x02014b50){const n=view.getUint16(i+28,true);map.set(strFromU8(bytes.subarray(i+46,i+46+n)),view.getUint32(i+38,true));i+=45+n+view.getUint16(i+30,true)+view.getUint16(i+32,true);}return map;}
test('部署包：固定版本展开成目录，字节/权限/清单哈希精确保留',async()=>{
 const {p,s,w}=fixture(),before=structuredClone([p,s,w]);const bytes=await buildWorkflowDeploymentBundle(w,current(w),[p,s,w]);const entries=unzipSync(bytes),root=`workflow-${w.id}-${current(w).id}`,manifest=JSON.parse(strFromU8(entries[root+'/manifest.json']));
 assert.equal(manifest.kind,'workflow-deployment');assert.equal(manifest.references[1].path,`assets/skills/${s.id}/${current(s).id}`);
 assert.ok(!Object.keys(entries).some(path=>path.endsWith('.zip')));
 for(const file of manifest.files){const content=entries[root+'/'+file.path+(file.directory?'/':'')];assert.equal(content.length,file.size);assert.equal(file.sha256,file.directory?null:hash(content));}
 assert.equal(strFromU8(entries[`${root}/assets/prompts/${p.id}/${current(p).id}.md`]),current(p).content);
 assert.deepEqual([...entries[`${root}/assets/skills/${s.id}/${current(s).id}/demo/blob.bin`]],[0,255,128,1]);
 const attrs=zipAttrs(bytes);assert.equal((attrs.get(`${root}/assets/skills/${s.id}/${current(s).id}/demo/run.sh`)>>>16)&0o777,0o755);assert.equal((attrs.get(`${root}/assets/skills/${s.id}/${current(s).id}/demo/`)>>>16)&0o170000,0o40000);
 assert.equal(manifest.files.find(f=>f.path.endsWith('blob.bin')).mode,null);assert.deepEqual([p,s,w],before);
});
test('部署包：上游更新仍导出固定旧版，清单与流程路径一致',async()=>{
 const {p,s,w}=fixture(),old=current(p),updated=revise(p,{title:'新版',content:'新原文'});const entries=unzipSync(await buildWorkflowDeploymentBundle(w,current(w),[updated,s,w])),root=`workflow-${w.id}-${current(w).id}`;
 assert.equal(strFromU8(entries[`${root}/assets/prompts/${p.id}/${old.id}.md`]),old.content);assert.ok(strFromU8(entries[root+'/workflow.md']).includes(`assets/prompts/${p.id}/${old.id}.md`));assert.ok(!Object.keys(entries).some(path=>path.includes(current(updated).id)));
});
test('部署包：无引用也生成完整工作流文件夹',async()=>{const w=makeAsset({type:'Workflow',title:'独立流程',content:'合成流程'});const entries=unzipSync(await buildWorkflowDeploymentBundle(w,current(w),[w]));assert.equal(Object.keys(entries).length,3);});
test('部署包：缺失/归档/非法版本/危险 Skill 不生成半包',async()=>{
 const {p,s,w}=fixture();await assert.rejects(buildWorkflowDeploymentBundle(w,current(w),[s,w]),/引用资产已缺失/);await assert.rejects(buildWorkflowDeploymentBundle(w,current(w),[{...p,archived:true},s,w]),/已归档/);await assert.rejects(buildWorkflowDeploymentBundle({...w,archived:true},current(w),[p,s,w]),/已归档/);await assert.rejects(buildWorkflowDeploymentBundle(w,{id:'missing'},[p,s,w]),/版本已缺失/);
 const unsafe=structuredClone(s);current(unsafe).files.push({path:'../escape',data:'x',text:true});await assert.rejects(buildWorkflowDeploymentBundle(w,current(w),[p,unsafe,w]),/不安全路径/);
});
test('部署包：大小写/Unicode目录冲突与25MiB预算严格拒绝',async()=>{
 const {p,s,w}=fixture();const clone=structuredClone(s);clone.id=s.id.toUpperCase();if(clone.id===s.id)clone.id='CASE';clone.versions[0].id=current(s).id+'b';current(w).references.push(pointer(clone));await assert.rejects(buildWorkflowDeploymentBundle(w,current(w),[p,s,clone,w]),/冲突/);
 const {p:huge,s:normal,w:flow}=fixture();current(huge).content='x'.repeat(25*1024*1024);await assert.rejects(buildWorkflowDeploymentBundle(flow,current(flow),[huge,normal,flow]),/25 MiB/);
});

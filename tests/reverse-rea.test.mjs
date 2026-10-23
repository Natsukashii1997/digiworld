import test from "node:test";
import assert from "node:assert/strict";
import { createSpecimen } from "../src/reverse-recipe.js";
import { validateReverseRecords } from "../server/schema.mjs";
const target = { kind: "electron", path: "/Applications/Fixture.app", feature: "切换页签", authorized: true };
test("REA目标可独立创建FN并经主库回读，旧无目标记录不变", () => {
  const r = createSpecimen({ type: "FN", target });
  assert.deepEqual(r.material.target, target);
  validateReverseRecords([r]);
  const old = createSpecimen({ text: "原文字" });
  assert.deepEqual(old.material, { text: "原文字", url: "" });
  validateReverseRecords([old]);
});

import fs from "node:fs/promises";
import { fixture } from "./fixture.mjs";
import { parse, stringify } from "../src/serialization.js";
test("REA检查HTTP只读且保留鉴权，真实临时app/asar/目录/缺失/链接/非法路径", async () => {
 const app=await fixture();
 try {
  const root=app.directory, path=root+"/Fixture.app";
  await fs.mkdir(path+"/Contents/Resources",{recursive:true});
  await fs.writeFile(path+"/Contents/Resources/app.asar","synthetic-bytes");
  await fs.mkdir(root+"/unpacked");await fs.writeFile(root+"/plain.txt","synthetic");
  await fs.symlink(path,root+"/linked.app");
  const session=await (await fetch(app.url+"/api/session",{headers:{"x-workbench-client":"1"}})).json();
  const call=async(input,token=session.token)=>{
   const r=await fetch(app.url+"/api/reverse/target/check",{method:"POST",headers:{"x-workbench-token":token,"content-type":"application/json"},body:stringify(input)});
   return {status:r.status,data:parse(await r.text())};
  };
  const before=await fs.stat(path+"/Contents/Resources/app.asar");
  const result=await call({path});assert.equal(result.status,200);assert.equal(result.data.kind,"app");assert.equal(result.data.appAsarExists,true);
  assert.equal((await call({path:path+"/Contents/Resources/app.asar"})).data.kind,"asar");
  assert.equal((await call({path:root+"/unpacked"})).data.kind,"dir");
  assert.equal((await call({path:root+"/missing.app"})).data.exists,false);
  for(const input of [{path:"relative.app"},{path:root+"/linked.app"},{path:root+"/linked.app/Contents/Resources/app.asar"},{path:root+"/plain.txt"},{path,extra:true},{path:root+"/../escape"}]) assert.equal((await call(input)).status,400,JSON.stringify(input));
  assert.equal((await call({path},"invalid")).status,403);
  await fs.unlink(path+"/Contents/Resources/app.asar");
  assert.equal((await call({path})).data.appAsarExists,false);
  await fs.symlink(root+"/plain.txt",path+"/Contents/Resources/app.asar");
  assert.equal((await call({path})).status,400);
  assert.ok(before.size>0);
 } finally {await app.close();}
});

import { validateRecipe, parseRecipeReply, buildRecipeTask, recipeAgents, prepareReplica, confirmReplica, currentVerification } from "../src/reverse-recipe.js";
import { generateRecipeSkill } from "../src/reverse-skill.js";
import { fixtureRecipe } from "./reverse-v16-fixture.mjs";
import { checkReverseTarget } from "../server/reverse-target.mjs";
const ev="ev_"+"0123456789abcdef".repeat(4);
const fnRecipe=()=>({...fixtureRecipe("FN"),unknowns:[{id:"U-1",text:"服务端未观察"}]});
test("REA target严格校验：类型、路径、网址、授权、功能、长度、白名单",()=>{
 const bad=[{...target,path:"relative.asar"},{...target,path:"/a/../b"},{...target,path:"/a\n/b"},{...target,path:"/"},{...target,feature:""},{...target,feature:"x".repeat(501)},{...target,path:"/"+"x".repeat(4096)},{...target,authorized:false},{...target,authorized:"true"},{...target,kind:"native"},{...target,url:"https://example.test"},{...target,extra:1},null,{kind:"web",url:"file:///a",feature:"f",authorized:true},{kind:"web",url:"https://u:p@example.test",feature:"f",authorized:true},{kind:"web",url:"https://example.test/"+"x".repeat(2000),feature:"f",authorized:true}];
 for(const v of bad){assert.throws(()=>createSpecimen({type:"FN",text:"optional",target:v}));const r=createSpecimen({type:"FN",text:"optional"});r.material.target=v;assert.throws(()=>validateReverseRecords([r]));}
 for(const type of ["TXT","IMG","WEB"]) assert.throws(()=>createSpecimen({type,text:"optional",target}));
 const old=createSpecimen({text:"old"});delete old.type;old.material.target=target;assert.throws(()=>validateReverseRecords([old]));
 const web={kind:"web",url:"https://example.test/path",feature:"网页切换",authorized:true};validateReverseRecords([createSpecimen({type:"FN",target:web})]);
});
test("FN证据与未知项可选、严格白名单、上下限/重复拒绝，伙伴验证标记仍降级",()=>{
 const r=fnRecipe();r.blocks[0].evidence=[ev];r.blocks[1].evidence=[ev];r.blocks[0].mark="已验证";
 const parsed=parseRecipeReply(JSON.stringify({recipe:r}),"FN");assert.equal(parsed.ok,true);assert.equal(parsed.recipe.blocks[0].mark,"推断");assert.deepEqual(parsed.recipe.blocks[0].evidence,[ev]);
 const edge=fnRecipe();edge.blocks[0].evidence=Array.from({length:20},(_,i)=>"ev_"+i.toString(16).padStart(64,"0"));edge.unknowns=Array.from({length:50},(_,i)=>({id:"u"+i,text:"x".repeat(1000)}));validateRecipe(edge);
 for(const change of [x=>x.blocks[0].evidence=[ev,ev],x=>x.blocks[0].evidence=["ev_short"],x=>x.blocks[0].evidence=["ev_"+"A".repeat(64)],x=>x.blocks[0].evidence=["ev_"+"a".repeat(65)],x=>x.blocks[0].evidence=Array.from({length:21},(_,i)=>"ev_"+i.toString(16).padStart(64,"0")),x=>x.unknowns=[{id:"u",text:"a"},{id:"u",text:"b"}],x=>x.unknowns=[{id:"u",text:"x".repeat(1001)}],x=>x.unknowns=[{id:"u",text:""}],x=>x.unknowns=[{id:"../bad",text:"a"}],x=>x.unknowns=[{id:"u",text:"a",extra:1}],x=>x.unknowns=Array.from({length:51},(_,i)=>({id:"u"+i,text:"a"}))]) {const x=fnRecipe();change(x);assert.throws(()=>validateRecipe(x));}
 for(const type of ["TXT","IMG","WEB"]) {const x=fixtureRecipe(type);x.unknowns=[];assert.throws(()=>validateRecipe(x));delete x.unknowns;x.blocks[0].evidence=[];assert.throws(()=>validateRecipe(x));}
 validateRecipe(fixtureRecipe("FN"));
});
test("REA任务包、两本机伙伴与旧无target任务兼容；示例JSON语法可读但证据拒绝",()=>{
 const r=createSpecimen({type:"FN",target});const task=buildRecipeTask(r);
 for(const text of ["analyze_javascript_application","/Applications/Fixture.app/Contents/Resources/app.asar","record-and-continue",'"detail":"summary"',"inspect_analysis_view","trace_application_feature","没有 REA 工具就停下","不要贴REA原始输出","unknowns","evidence"])assert.ok(task.includes(text),text);
 assert.deepEqual(recipeAgents(r),["codex","claude-code"]);
 const sample=JSON.parse(task.match(/```json\s*([\s\S]*?)```/)[1]);
 assert.equal(sample.recipe.blocks[0].evidence[0],"ev_0123456789abcdef");
 assert.equal(parseRecipeReply(task,"FN").ok,false);
 assert.match(parseRecipeReply(task,"FN").error,/证据ID格式/);
 assert.match(buildRecipeTask(r,"replica"),/在我的项目里实现/);
 for(const path of ["/fixture/extracted","/fixture/app.asar"]){const x=createSpecimen({type:"FN",target:{...target,path}});assert.ok(buildRecipeTask(x).includes('"input_path":"'+path+'"'));}
 const web=createSpecimen({type:"FN",target:{kind:"web",url:"https://example.test",feature:"功能",authorized:true}});const w=buildRecipeTask(web);assert.match(w,/list_browser_targets/);assert.match(w,/不登录、不提交表单/);assert.match(w,/CDP/);assert.ok(!w.includes("analyze_javascript_application"));
 const old=createSpecimen({type:"FN",text:"old"});assert.ok(!buildRecipeTask(old).includes("REA"));assert.equal(recipeAgents(old).length,5);
});
function verified(targetValue=target){let r=createSpecimen({type:"FN",target:targetValue});r.recipe=fnRecipe();r.recipe.blocks[0].evidence=[ev];const a=prepareReplica(r,{text:"实现结果"});a.scores={interaction:5,copy:5};a.checks=a.checks.map(x=>({...x,result:true}));return confirmReplica(r,a);}
test("REA全快照可保存，目标或功能变更使旧达标失效且历史不丢；炼成保留边界",()=>{
 const r=verified();validateReverseRecords([r]);assert.ok(currentVerification(r));
 const skill=generateRecipeSkill(r);assert.match(skill.content,/取证方式：REA/);assert.match(skill.content,/Electron应用/);assert.match(skill.content,new RegExp(ev));assert.match(skill.content,/U-1：服务端未观察/);assert.match(skill.content,/不证明软件已完整还原/);
 for(const patch of [{path:"/Applications/Other.app"},{feature:"其他功能"}]){const x=structuredClone(r);Object.assign(x.material.target,patch);assert.equal(currentVerification(x),null);assert.throws(()=>generateRecipeSkill(x));assert.deepEqual(x.replicas,r.replicas);validateReverseRecords([x]);}
 const web=verified({kind:"web",url:"https://example.test/one",feature:"f",authorized:true});web.material.target.url="https://example.test/two";assert.equal(currentVerification(web),null);
});
test("REA检查只接触lstat；权限失败与检查期间链接替换不能说不存在或通过",async()=>{
 let calls=0;const directory={dev:1,ino:1,mode:0o40755,isSymbolicLink:()=>false,isDirectory:()=>true,isFile:()=>false};
 assert.deepEqual(await checkReverseTarget({path:"/unpacked"},{stat:async()=>{calls++;return directory;}}),{exists:true,kind:"dir"});assert.equal(calls,2);
 await assert.rejects(checkReverseTarget({path:"/unpacked"},{stat:async()=>{throw Object.assign(Error(),{code:"EACCES"});}}),/无法检查/);
 let count=0;await assert.rejects(checkReverseTarget({path:"/unpacked"},{stat:async()=>++count===1?directory:{...directory,isSymbolicLink:()=>true}}),/检查期间变化/);
});

test("空标题REA功能含制表符、回车、换行仍可保存，原功能逐字保留",()=>{
 const feature="切换\t页签\r保留草稿\n后续功能";
 const r=createSpecimen({type:"FN",target:{...target,feature}});
 validateReverseRecords([r]);assert.equal(r.material.target.feature,feature);assert.equal(r.title,"切换 页签 保留草稿");
});

test("网站REA任务先指导用户手动开独立Chrome调试窗口，并提供字面回环CDP端点",()=>{
 const r=createSpecimen({type:"FN",target:{kind:"web",url:"https://example.test",feature:"切换",authorized:true}});
 const task=buildRecipeTask(r);
 for(const text of ['--remote-debugging-port=9222','--user-data-dir="$HOME/.rea-chrome"','"cdp_endpoint":"http://127.0.0.1:9222"','独立','日常','关闭','不得自行启动'])assert.ok(task.includes(text),text);
 assert.ok(!buildRecipeTask(createSpecimen({type:"FN",target})).includes('--remote-debugging-port'));
});

test("证据只接收64位小写十六进制；16位示例与63/65位均被拒绝",()=>{
 for(const id of ["ev_0123456789abcdef","ev_"+"a".repeat(63),"ev_"+"a".repeat(65),"ev_"+"A".repeat(64)]){
  const recipe=fnRecipe();recipe.blocks[0].evidence=[id];const result=parseRecipeReply(JSON.stringify({recipe}),"FN");assert.equal(result.ok,false,id);assert.match(result.error,/证据ID格式/);
 }
 const recipe=fnRecipe();recipe.blocks[0].evidence=[ev];assert.equal(parseRecipeReply(JSON.stringify({recipe}),"FN").ok,true);
 const old=fnRecipe();validateRecipe(old);
});

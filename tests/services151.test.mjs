// 合入仓库时放 tests/，import 路径无需改。全部 I/O 都在 mkdtemp 目录，命令/模型/Vault 使用桩。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID,createHash } from "node:crypto";
import { createCalendar,createCalendarHelper } from "../server/calendar.mjs";
import { createStubHelper } from "./calendar-fixture.mjs";
import { createProjectActivity } from "../server/project-activity.mjs";
import { createKnowledgeTrends,buildKnowledgeTrend } from "../server/knowledge-trends.mjs";
import { measureDataDirectory,createStorageStatus } from "../server/storage-status.mjs";
import { createBackupRecords } from "../server/backup-records.mjs";
import { createConfigJournal } from "../server/config-journal.mjs";
import { validateBackupRecord } from "../server/backup-records.mjs";

const iso = (day,hour=0) => new Date(2026,9,day,hour).toISOString();
const now = new Date(2026,9,4,18).getTime();
const service = (run) => createCalendar({helper:createCalendarHelper({platform:"darwin",run})});
async function temporary(run) {
  const original = await fs.mkdtemp(join(tmpdir(),"wb-s151-synthetic-"));
  const directory = await fs.realpath(original);
  try { return await run(directory); }
  finally { await fs.rm(directory,{recursive:true,force:true}); }
}

test("全天创建/跨日修改保留回读、版本冲突与旧 timed payload", async () => {
  const stub = createStubHelper();
  const cal = service(stub.run);
  await cal.createBlock({title:"普通",start:iso(4,10),end:iso(4,11)});
  assert.deepEqual(stub.writes()[0].input,{title:"普通",start:iso(4,10),end:iso(4,11)});
  await assert.rejects(cal.createBlock({title:"旧上限",start:iso(4),end:iso(5,1)}),e=>e.status===400);
  const created = await cal.createBlock({title:"全天合成",start:iso(4),end:iso(7),allDay:true});
  assert.equal(created.check.matches,true);
  assert.equal(created.block.allDay,true);
  assert.equal(stub.writes().at(-1).input.allDay,true);
  const changed = await cal.updateBlock({id:created.block.id,expectedModified:created.block.modified,
    title:"跨日合成",start:iso(4,20),end:iso(6,8),allDay:false});
  assert.equal(changed.check.matches,true);
  assert.equal(changed.block.allDay,false);
  assert.equal(changed.block.end,iso(6,8));
  stub.external.editEvent(created.block.id,{title:"外部合成修改"});
  const conflict = await cal.updateBlock({id:created.block.id,expectedModified:changed.block.modified,
    title:"不应写入",start:iso(4),end:iso(5),allDay:true});
  assert.equal(conflict.conflict,true);
  assert.equal(conflict.block.title,"外部合成修改");
  assert.equal(stub.store.events.find(e=>e.id===created.block.id).allDay,false);
});

test("全天边界/flag严格校验，回读 flag 漂移和写入未知不假定成功", async () => {
  const stub = createStubHelper(); const cal = service(stub.run);
  for (const input of [
    {title:"非午夜",start:iso(4,1),end:iso(5),allDay:true},
    {title:"非布尔",start:iso(4),end:iso(5),allDay:"true"},
    {title:"超上限",start:iso(4),end:new Date(2026,10,20).toISOString(),allDay:true},
  ]) await assert.rejects(cal.createBlock(input),e=>e.status===400);
  assert.equal(stub.writes().length,0);
  const drift = service(async (command,input) => {
    const output = await stub.run(command,input);
    if (command === "create-event") {
      const value = JSON.parse(output.stdout); value.event.allDay = false;
      return {stdout:JSON.stringify(value)};
    }
    return output;
  });
  const result = await drift.createBlock({title:"flag漂移",start:iso(4),end:iso(5),allDay:true});
  assert.equal(result.check.matches,false);
  assert.deepEqual(result.check.differences,["allDay"]);
  const unknown = service(async (command,input) => {
    if (command === "create-event") throw Object.assign(new Error("synthetic timeout"),{killed:true});
    return stub.run(command,input);
  });
  await assert.rejects(unknown.createBlock({title:"未知",start:iso(4),end:iso(5),allDay:true}),
    e=>e.unknownResult===true && /未知/.test(e.message));
});

test("项目活动只取全部登记项目的 Git 时刻与 CURRENT 元数据，错误不等于零", async () => temporary(async directory => {
  const current = join(directory,"CURRENT.md");
  await fs.writeFile(current,"合成正文，不可读取");
  await fs.utimes(current,new Date(iso(3,12)),new Date(iso(3,12)));
  const calls = [];
  const repository = {read:async()=>({connections:{projects:[{id:"p1",active:true},{id:"p2"}]}})};
  const resolveRoot = async()=>({canonical:directory,path:"CURRENT.md",root:directory});
  const runGit = root => async args => {
    calls.push({root,args});
    return args[0] === "rev-parse" ? directory : [iso(3,1),iso(3,2),iso(4,1),iso(5),iso(1)].join("\n");
  };
  const filesystem = new Proxy(fs,{get(target,key) {
    if (key === "readFile") return ()=>{throw new Error("禁止读正文");};
    if (key === "open") return async (...args) => {
      const handle = await target.open(...args);
      return {stat:()=>handle.stat(),close:()=>handle.close(),read:()=>{throw new Error("禁止读正文");}};
    };
    return target[key];
  }});
  const activity = createProjectActivity(repository,{clock:()=>now,resolveRoot,runGit,filesystem});
  const result = await activity.inspect();
  assert.equal(result.items.length,2,"非 active 登记项目也查询");
  assert.deepEqual(new Set(calls.map(c=>c.args[0])),new Set(["rev-parse","log"]));
  const row = result.items[0].days.find(d=>d.date==="2026-10-03");
  assert.equal(row.git,2); assert.equal(row.current,1); assert.equal(row.total,3);
  assert.equal(result.items[0].days.find(d=>d.date==="2026-10-04").git,1,"未来提交不计");
  await assert.rejects(activity.inspect({path:"/outside"}),e=>e.status===400);
  const broken = createProjectActivity(repository,{clock:()=>now,resolveRoot,runGit:()=>async()=>{throw new Error("synthetic git failure");},filesystem});
  const unavailable = await broken.inspect();
  assert.equal(unavailable.items[0].state,"partial");
  assert(unavailable.items[0].days.every(d=>d.git===null && d.total===null));
}));

test("项目 CURRENT 符号链接/硬链接/根目录漂移均拒绝，正文永不读取", async () => temporary(async directory => {
  const outside = join(directory,"outside.md"), current = join(directory,"CURRENT.md");
  await fs.writeFile(outside,"synthetic private sentinel");
  const repository = {read:async()=>({connections:{projects:[{id:"p"}]}})};
  const runGit = ()=>async args => args[0]==="rev-parse" ? directory : "";
  const resolveRoot = async()=>({canonical:directory,path:"CURRENT.md"});
  const activity = createProjectActivity(repository,{clock:()=>now,runGit,resolveRoot});
  await fs.symlink(outside,current);
  assert.equal((await activity.inspect()).items[0].current.state,"error");
  await fs.unlink(current); await fs.link(outside,current);
  assert.equal((await activity.inspect()).items[0].current.state,"error");
  const invalid = createProjectActivity(repository,{clock:()=>now,runGit,resolveRoot:async()=>({canonical:directory,path:"../outside.md"})});
  assert.equal((await invalid.inspect()).items[0].current.state,"error");
  const project = join(directory,"project"), moved = join(directory,"moved");
  await fs.mkdir(project); await fs.writeFile(join(project,"CURRENT.md"),"仅合成");
  const drifting = createProjectActivity(repository,{clock:()=>now,
    resolveRoot:async()=>({canonical:project,path:"CURRENT.md"}),
    runGit:()=>async args => {
      if(args[0]==="rev-parse")return project;
      await fs.rename(project,moved); await fs.mkdir(project);
      return iso(4,1);
    }});
  const drifted = (await drifting.inspect()).items[0];
  assert.equal(drifted.current.state,"error"); assert.equal(drifted.git.state,"error");
  assert(drifted.days.every(point=>point.total===null && point.current===null));
}));

test("三区趋势只计真实回执/整理版本，旧日期无记录、已追踪空日为零", () => {
  const source = {id:"s",root:"/synthetic-vault"};
  const rules = [{pattern:"输入/**",zone:"input"},{pattern:"说明/**",zone:"profile"}];
  const task = {id:"task",createdAt:iso(2),evidence:[{sourceId:"s",root:source.root,path:"输入/a.md"}],
    candidates:[{id:"v1",receivedAt:iso(3,5)}]};
  const base = {row:{source,path:"说明/a.md",createdAt:iso(2),id:"operation"},applied:{at:iso(4,8)},rollbackStarted:null,rolledBack:null};
  const trend = buildKnowledgeTrend({source,rules,tasks:[task],records:[base],now});
  assert.equal(trend.zones.mine.find(d=>d.date==="2026-10-01").status,"unrecorded");
  assert.equal(trend.zones.mine.find(d=>d.date==="2026-10-01").total,null);
  assert.equal(trend.zones.mine.find(d=>d.date==="2026-10-02").total,0);
  assert.equal(trend.zones.input.find(d=>d.date==="2026-10-03").organized,1);
  assert.equal(trend.zones.profile.find(d=>d.date==="2026-10-04").written,1);
  for (const failed of [{...base,applied:null},{...base,rollbackStarted:{at:iso(4,9)}},{...base,rolledBack:{at:iso(4,9)}}]) {
    const excluded = buildKnowledgeTrend({source,rules,tasks:[],records:[failed],now});
    assert.equal(excluded.zones.profile.find(d=>d.date==="2026-10-04").written,0);
  }
  const unknown = buildKnowledgeTrend({source,rules,tasks:[task],records:[],journalAvailable:false,now});
  assert.equal(unknown.state,"partial"); assert(unknown.zones.input.every(d=>d.total===null));
});

test("趋势服务不扫描 Vault，未连源/记录读取错误如实呈现", async () => {
  let calls = 0;
  const state = {connections:{knowledgeSources:[{id:"s",root:"/synthetic-vault",kind:"obsidian"}]},knowledgeTasks:[]};
  const repository = {directory:"/synthetic-data",read:async()=>state};
  const trends = createKnowledgeTrends(repository,{clock:()=>now,journal:{list:async()=>{calls++;throw new Error("synthetic unreadable journal");}}});
  assert.equal((await trends.inspect()).state,"partial"); assert.equal(calls,1);
  await assert.rejects(trends.inspect({path:"/outside"}),e=>e.status===400);
  state.connections.knowledgeSources=[];
  assert.equal((await trends.inspect()).state,"unavailable"); assert.equal(calls,1);
});

test("目录大小只读 metadata，链接不跟随；访达仅接受数据目录内且注入命令", async () => temporary(async directory => {
  const data = join(directory,"data"), outside = join(directory,"outside");
  await fs.mkdir(data); await fs.mkdir(outside); await fs.writeFile(join(data,"a"),"abc");
  await fs.writeFile(join(outside,"secret"),"synthetic outside sentinel");
  await fs.symlink(outside,join(data,"link"));
  const noRead = new Proxy(fs,{get(target,key) {if(key==="readFile")return()=>{throw new Error("不读文件正文");}; return target[key];}});
  const measured = await measureDataDirectory(data,{filesystem:noRead});
  assert.equal(measured.bytes,3); assert.equal(measured.files,1); assert.equal(measured.skipped.length,1);
  const calls = [];
  const storage = createStorageStatus({directory:data},{platform:"darwin",filesystem:noRead,
    records:{latest:async()=>({state:"none"})},runOpen:async path=>calls.push(path)});
  const facts = await storage.status(); assert.equal(facts.size.bytes,3); assert.equal(facts.lastBackup.state,"none");
  for (const path of ["../outside",outside,"link/secret","a/../outside"]) await assert.rejects(storage.reveal({path}));
  assert.equal(calls.length,0);
  await storage.reveal(); assert.deepEqual(calls,[data]);
  const unsupported = createStorageStatus({directory:data},{platform:"linux",records:{latest:async()=>({state:"none"})},runOpen:()=>{throw new Error("禁止真实执行");}});
  await assert.rejects(unsupported.reveal(),e=>e.status===503);
}));

test("持久备份时间只来自完成回执；未完成/损坏记录不冒充成功", async () => temporary(async directory => {
  const records = createBackupRecords(directory,{clock:()=>now});
  assert.equal((await records.latest()).state,"none");
  const sha256 = createHash("sha256").update("synthetic archive").digest("hex");
  await records.record({sha256,bytes:17,files:2});
  const reopened = createBackupRecords(directory,{clock:()=>now+1000});
  assert.equal((await reopened.latest()).at,new Date(now).toISOString());
  const journal = createConfigJournal(directory,{folder:"backup-records",validate:validateBackupRecord,label:"备份"});
  await journal.prepare({schema:1,id:randomUUID(),kind:"full-backup",at:new Date(now+1000).toISOString(),sha256,bytes:17,files:2});
  const latest = await reopened.latest(); assert.equal(latest.at,new Date(now).toISOString()); assert.equal(latest.pending,1);
  await fs.writeFile(join(directory,"backup-records","unexpected.json"),"{}");
  await assert.rejects(reopened.latest(),e=>e.status===503);
}));

test("备份完成回执失败为未知，prepared 不升级成功；状态读取失败不当零", async () => temporary(async directory => {
  const filesystem = new Proxy(fs,{get(target,key) {
    if(key === "rename")return async (from,to) => {
      if(to.endsWith(".receipt.json"))throw new Error("synthetic receipt failure");
      return target.rename(from,to);
    };
    return target[key];
  }});
  const records = createBackupRecords(directory,{filesystem,clock:()=>now});
  const sha256 = createHash("sha256").update("synthetic").digest("hex");
  await assert.rejects(records.record({sha256,bytes:9,files:1}),e=>e.unknownResult===true);
  assert.equal((await records.latest()).state,"pending");
  const storage = createStorageStatus({directory},{platform:"darwin",records:{latest:async()=>{throw new Error("synthetic corrupt record");}},runOpen:()=>{throw new Error("must not run");}});
  assert.equal((await storage.status()).lastBackup.state,"unknown");
  const absent = createStorageStatus({directory:join(directory,"absent")},{records:{latest:async()=>({state:"none"})}});
  const facts = await absent.status(); assert.equal(facts.size.state,"unknown"); assert.equal(facts.size.bytes,undefined);
}));

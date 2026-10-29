// 合入 tests/；只使用 fixture 随机端口。路由数据全合成；宿主 Git/访达/知识读取均显式注入。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture } from "./fixture.mjs";
import { seed } from "../src/store.js";
import { geometry,axe,motion } from "./ui-v14-checks.mjs";
import { batch3Routes } from "./ui-v14-batch3-fixture.mjs";
import { openSettingsDrawer, openCapabilityMore, capabilitySwitch } from "./settings-entry.mjs";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
  "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const NOW = "2026-10-04T02:00:00.000Z";
const dates = Array.from({length:7},(_,i)=>`2026-${i<3?"09":"10"}-${String(i<3?28+i:i-2).padStart(2,"0")}`);
const errors = [],requests = [],forbidden = [],finder = [];
const deny = async () => { forbidden.push("宿主适配器"); throw new Error("合成测试未授权宿主操作"); };
const browser = await chromium.launch();
let app;

function data(long) {
  const state = seed(), title = long ? "合成项目长中文EnglishWithoutSpaces".repeat(20) : "合成活动项目";
  const source = {schema:1,id:"source-151",name:long ? "合成知识源"+"长中文English".repeat(5) : "合成知识源",
    kind:"obsidian",root:"/synthetic/vault",identity:"a".repeat(64),generation:"generation-151",connectedAt:NOW};
  state.connections = { roots:["/synthetic/projects"],
    projects:[{id:"project-151",name:title,localPaths:["/synthetic/projects/活动"],active:true,kind:"Git",repoKey:"",branch:"main"}],
    agents:[],github:{status:"not_connected",login:"",message:"",at:NOW},projectScannedAt:NOW,agentScannedAt:NOW,
    errors:[],truncated:false,knowledgeSources:[source] };
  const dayRows = Array.from({length:30},(_,i)=>({date:new Date(Date.UTC(2026,8,5+i)).toISOString().slice(0,10),git:i===28?2:0,current:i===28?1:0,total:i===28?3:0}));
  const trend = {at:NOW,sourceId:source.id,state:"ok",availableSince:"2026-10-02",
    meaning:long ? "本机留存记录：已确认且未撤回的写入与收到的整理版本；EnglishWithoutSpaces".repeat(6) : "本机留存记录，不是 Vault 全量修改历史。",
    zones:Object.fromEntries(["input","mine","profile"].map((zone,n)=>[zone,dates.map((date,i)=>({date,status:i<4?"unrecorded":"recorded",
      written:i<4?null:i===6?n+1:0,organized:i<4?null:i===5?1:0,total:i<4?null:i===6?n+1:i===5?1:0}))]))};
  const safety = {issues:[],checks:{git:{state:"repo"},remote:{state:"none"},dirty:{state:"ok",count:0},
    sensitive:{state:"ok",total:0,files:[]},visibility:{state:"private"}}};
  const project = {projectId:"project-151",name:title,root:long ? "/synthetic/长中英文NoSpace".repeat(10) : "/synthetic/projects/活动",
    current:{state:"ok",path:"CURRENT.md",modifiedAt:NOW,fields:{stateId:"P-SYNTHETIC-151",writer:"无",
      next:long ? "下一步长中文EnglishWithoutSpaces".repeat(15) : "确认合成活动",handoff:{text:"合成交接",href:"docs/synthetic.md"}}},
    activity:{state:"active",idleDays:0},safety};
  return {state,source,trend,project,dayRows,long};
}

async function open(width,route,input) {
  const context = await browser.newContext({viewport:{width,height:1000},timezoneId:"Asia/Shanghai",reducedMotion:"reduce",acceptDownloads:true});
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on("pageerror",e=>errors.push(e.message)); page.on("request",r=>requests.push(r.url()));
  await batch3Routes(page);
  // 只改合成会话展示文案，保留服务端随机会话令牌及真实临时目录绑定。
  if(input.long) await page.route("**/api/session",async r=>{
    const response=await r.fetch(),body=await response.json();
    await r.fulfill({response,json:{...body,directory:"/synthetic/长中文EnglishWithoutSpaces".repeat(16)}});
  });
  let partial = false,inspects = 0,statusReads = 0;
  const countedTrend = () => ({...input.trend,zones:Object.fromEntries(Object.entries(input.trend.zones).map(([zone,rows])=>[zone,rows.map((row,i)=>i===6?{...row,written:5,organized:1,total:6}:row)]))});
  const partialTrend = () => ({...input.trend,state:"partial",zones:Object.fromEntries(Object.entries(input.trend.zones).map(([zone,rows])=>[zone,rows.map(row=>({...row,status:"unknown",written:null,total:null}))]))});
  await page.route("**/api/knowledge/zones/summary",r=>r.fulfill({json:{latest:null,trend:input.trend,mcp:{url:null,error:"合成：未启用 MCP"}}}));
  await page.route("**/api/knowledge/zones/stats",r=>r.fulfill({json:{sourceId:input.source.id,sourceName:input.source.name,
    generation:input.source.generation,at:NOW,status:"complete",issues:0,rules:[],weekStart:"2026-09-28T16:00:00.000Z",
    zones:{input:{total:1,changedThisWeek:0},mine:{total:2,changedThisWeek:1},profile:{total:1,changedThisWeek:0}},files:[],trend:partial?partialTrend():countedTrend()}}));
  await page.route("**/api/project-status/inspect",r=>r.fulfill({json:{at:new Date(Date.parse(NOW)+ ++inspects *1000).toISOString(),
    stallDays:7,activeCount:1,softLimit:7,items:[input.project]}}));
  await page.route("**/api/project-github/panel",r=>r.fulfill({json:{at:NOW,items:[{projectId:"project-151",github:{state:"none"}}]}}));
  await page.route("**/api/project-status/activity",r=>r.fulfill({json:{at:NOW,items:[{projectId:"project-151",state:partial?"partial":"ok",
    days:input.dayRows.map(row=>partial?{...row,git:null,total:null}:row),
    note:"当前 HEAD 可达提交；CURRENT 只计最后一次修改，不能还原过去修改次数。"}]}}));
  await page.route("**/api/storage/status",r=>{statusReads++;return r.fulfill({json:{directory:"/synthetic/data",
    size:partial?{state:"unknown",reason:"合成读取失败，目录大小未知"}:{state:"ok",bytes:1234567,files:12,skipped:[{path:"link",reason:"符号链接不跟随"}]},
    lastBackup:partial?{state:"unknown",reason:"合成备份记录不可读取"}:{state:"ok",at:NOW,pending:1},finderAvailable:true}});});
  await page.goto(app.url+"/#"+route);
  await page.locator("main .page-heading").waitFor();
  return {page,partial:()=>{partial=true;},statusReads:()=>statusReads};
}

try {
  for(const long of [false,true]) {
    const input = data(long);
    app = await fixture({discovery:{
      projectActivity:{resolveRoot:deny,runGit:()=>deny},
      knowledgeTrends:{journal:{list:async()=>[]}},
      knowledgeFiles:{inspectRoot:deny,scan:deny,read:deny,current:deny},
      storageStatus:{platform:"darwin",runOpen:async path=>finder.push(path)},
      calendarHelper:{platform:"linux",run:deny},aihotFetch:deny,
    }});
    await app.repository.write({...input.state,connections:undefined},{initialize:true});
    await app.repository.updateConnections(()=>input.state.connections);
    for(const width of [320,390,1440]) for(const route of ["knowledge","projects","settings"]) {
      const {page,partial,statusReads} = await open(width,route,input);
      if(route === "knowledge") {
        const board = page.locator(".zone-board");
        await board.getByText(/09-28：无记录/).first().waitFor();
        assert.match(await board.innerText(),/10-02：0/);
        const counted = page.waitForResponse(r=>r.url().endsWith("/api/knowledge/zones/stats") && r.request().method()==="POST");
        await page.getByRole("button",{name:"统计三区",exact:true}).click();
        const response = await counted;
        assert.equal(response.status(),200,"统计请求实际成功");
        const result = await response.json();
        assert.equal(result.status,"complete");
        assert.equal(result.trend.zones.input.at(-1).total,6,"成功响应含新统计的趋势记录");
        await board.getByText(/10-04：6/).first().waitFor();
        assert.equal(await board.locator('.bars i[title="2026-10-04：6"]').count(),3,"三分区使用统计回读趋势，未保留旧摘要");
        assert.equal(await board.locator('.bars i[data-status="recorded"]').count(),9,"有记录日期没有变成无记录或未知");
        assert.match(await page.locator(".zone-share").innerText(),/统计于/);
        assert.match(await page.locator(".zone-share").innerText(),/共 4 篇/);
        assert.equal(await page.locator(".knowledge-v14 .inline-error").count(),0);
        assert.equal(await page.getByRole("button",{name:"统计三区",exact:true}).isEnabled(),true,"成功后解除忙碌");
        partial(); await page.getByRole("button",{name:"统计三区",exact:true}).click();
        await board.getByText(/10-04：未知/).first().waitFor();
        assert.equal(await board.locator('.bars i[data-status="unknown"]').count(),21,"回执未知不会画零值柱");
      }
      if(route === "projects") {
        const heat = page.locator(".pj-heat");
        await heat.waitFor(); assert.equal((await heat.locator(".sr-only").innerText()).split("；").filter(Boolean).length,30);
        assert.equal(await heat.locator("i").count(),30);
        assert.match(await heat.locator(".sr-only").innerText(),/2026-10-03：Git 2，CURRENT 1/);
        partial(); await page.getByRole("region",{name:"在推进项目",exact:true}).getByRole("button",{name:"刷新",exact:true}).click();
        await page.waitForFunction(()=>document.querySelector(".pj-heat .sr-only")?.textContent.includes("Git 未知")); assert.equal(await heat.locator('i[title*="未知"]').count(),30); assert.match(await heat.locator(".sr-only").innerText(),/2026-10-03：Git 未知，CURRENT 1/);
        assert.match(await heat.locator(".sr-only").innerText(),/Git 未知/);
      }
      if(route === "settings") {
        await openSettingsDrawer(page,"数据与备份");
        await page.getByText(/1,234,567 字节/).waitFor();
        await page.getByText(/另有 1 条未完成/).waitFor();
        const beforeFinder = finder.length;
        await page.getByRole("button",{name:"在访达中显示数据目录",exact:true}).click();
        await page.getByText("已请求访达显示数据目录",{exact:true}).waitFor();
        assert.equal(finder.length,beforeFinder+1,"只调用访达桩");
        assert.equal(finder.at(-1),app.repository.directory,"固定数据目录，无任意路径");
        const beforeReads = statusReads(); partial();
        const downloaded = page.waitForEvent("download");
        await page.getByRole("button",{name:"下载恢复包 ZIP",exact:true}).click(); await downloaded;
        await page.getByText("合成读取失败，目录大小未知",{exact:false}).waitFor();
        assert(statusReads()>beforeReads,"备份成功后重读目录与生成回执");
        assert.match(await page.locator("main").innerText(),/合成备份记录不可读取/);
      }
      try { await geometry(page,"main",`${route} ${width} long=${long}`); } catch (e) { console.log(await page.locator("main *").evaluateAll(es=>es.filter(e=>["hidden","clip"].includes(getComputedStyle(e).overflowX)&&e.scrollWidth>e.clientWidth+1).map(e=>({text:e.textContent,html:e.outerHTML,ancestor:e.parentElement.outerHTML.slice(0,1200)})))); throw e; }
      await axe(page,`${route} ${width} long=${long}`);
      await motion(page,"main"); await axe(page,`${route} reduce切换`);
      await page.context().close();
    }
    await app.close();app=null;
  }
  assert.deepEqual(errors,[]); assert.deepEqual(forbidden,[]);
  assert(requests.every(url=>/^http:\/\/127\.0\.0\.1:\d+\//.test(url)),"零外部请求");
  console.log("PASS 派单151数据UI：3页×320/390/1440×普通/长文本，44px逐元素/axe/运行中reduce；未知不当零，访达桩与备份回读。");
} finally { await browser.close();await app?.close(); }

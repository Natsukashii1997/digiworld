import {enterNew175,replace175,visible175,expandLong175} from "./notes-editor-helpers175.mjs";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {plainText} from "../src/rich-note.js";
import {fixture} from "./fixture.mjs";
import {batch2Data,batch2Routes,seedBatch2} from "./ui-v14-batch2-fixture.mjs";
import {geometry,axe,motion} from "./ui-v14-checks.mjs";
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||"/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
let app=await fixture();const browser=await chromium.launch(),errors=[];
const roots={aihot:".aihot-v16",learning:".learning-v14",notes:".notes-v16"};
const button=(p,name)=>p.getByRole("button",{name,exact:true});
async function open(width,route,data) {
 const c=await browser.newContext({viewport:{width,height:1000},reducedMotion:"reduce"});const p=await c.newPage();p.setDefaultTimeout(10000);p.on("pageerror",e=>errors.push(String(e)));await batch2Routes(p,data);await p.goto(app.url+"/#"+route);await p.locator(roots[route]).waitFor();if(route==="learning")await p.locator(".shelf-book").first().waitFor();if(route==="aihot")await p.locator(".ah-card").first().waitFor();return p;
}
try {
 for(const long of [false,true,"max-file-name"]) {
  const data=batch2Data(long);
  if(long==="max-file-name") {
   // 254 ASCII字节，合法文件名边界；连续宽字母不能靠分词解决。
   const name="W".repeat(250)+".pdf";
   data.shelf.books[0]={...data.shelf.books[0],name,path:name};
   data.state.learning.books[0]={...data.state.learning.books[0],name,path:name};
  }
  await app.close();app=await fixture();await seedBatch2(app,data);
  for(const width of [320,390,700,800,1024,1440]) for(const route of (long==="max-file-name"||width===700||width===800||width===1024 ? ["learning"] : Object.keys(roots))) {
   const p=await open(width,route,data);if(route==="notes")await expandLong175(p);await (route==="aihot"?aihotGeometry(p,width+route+" long="+long):geometry(p,roots[route],width+route+" long="+long));await axe(p,route);
   if(route==="aihot") {assert.equal(await p.locator(".ah-card").count(),3);assert.equal(await p.locator(".ah-more li").count(),2);assert.equal(await p.locator(".ah-hot li").count(),3);assert.equal(await p.getByRole("radiogroup",{name:"AI HOT 分类"}).count(),0);assert.equal(await p.locator(".ah-board a").count(),0);await axe(p,route);}
   if(route==="learning") {
    for(const card of await p.locator(".shelf-book").all()) {
      const dimensions=await card.evaluate(e=>{
       const book=e.getBoundingClientRect(),cover=e.querySelector(".shelf-cover").getBoundingClientRect();
       const radios=[...e.querySelectorAll('.status-picker [role="radio"]')].map(x=>x.getBoundingClientRect().top);
       return {book:book.width,cover:cover.width,height:cover.height,radios,
        title:e.querySelector('.shelf-cover strong').textContent,
        whole:e.querySelector('.shelf-main h3').textContent.replace(/\.(pdf|epub)$/i,''),
        overflow:e.querySelector('.shelf-cover').scrollHeight>e.querySelector('.shelf-cover').clientHeight+1,
        titleBottom:e.querySelector('.shelf-cover strong').getBoundingClientRect().bottom,
        footerTop:e.querySelector('.shelf-cover span').getBoundingClientRect().top,
        writing:getComputedStyle(e.querySelector("h3")).writingMode};
      });
      assert(dimensions.cover >= dimensions.book*.9,`${width} 封面至少书卡90% ${JSON.stringify(dimensions)}`);
      assert(Math.abs(dimensions.cover-dimensions.book)<=1,`${width} 封面与书卡等宽`);
      assert.equal(dimensions.writing,"horizontal-tb","书名横排");
      assert(Math.abs(dimensions.cover/dimensions.height-.75)<.01,`${width} 封面3:4 ${JSON.stringify(dimensions)}`);
      assert.equal(dimensions.title,dimensions.whole,"封面完整书名");
      assert.equal(dimensions.overflow,false,"完整长书名无垂直溢出");
      assert(dimensions.titleBottom<=dimensions.footerTop,"书名与文件类型不重叠");
      assert(dimensions.radios.every(y=>Math.abs(y-dimensions.radios[0])<1),`${width} 状态radio同一行`);
    }
    const covers=await p.locator('.shelf-book').evaluateAll(es=>Object.fromEntries(es.map(e=>[e.querySelector('h3').textContent,getComputedStyle(e.querySelector('.shelf-cover')).backgroundImage])));
    const g=p.getByRole("radiogroup",{name:"学习视图筛选"});await g.getByRole('radio',{name:'想学',exact:true}).click();
    assert.equal(await p.locator('.shelf-book').count(),1,'想学筛选仅一本');
    assert.equal(await p.locator('.shelf-book').evaluate(e=>getComputedStyle(e.querySelector('.shelf-cover')).backgroundImage),covers[await p.locator('.shelf-main h3').innerText()],'同一本书筛选前后配色不变');await g.getByRole("radio",{name:"在学",exact:true}).click();assert.equal(await p.locator(".shelf-book").count(),1);assert.equal(await p.locator(".learn-link").count(),0);await g.getByRole("radio",{name:"学完",exact:true}).click();assert.equal(await p.locator(".shelf-book").count(),0);await p.getByText("当前筛选没有书籍；未标记的书仍在全部视图。",{exact:true}).waitFor();await geometry(p,roots[route],"筛选空态");await g.getByRole("radio").first().click();await button(p,"添加链接").click();await geometry(p,".modal","链接表单");await axe(p,route);await p.getByRole("dialog").getByRole("button",{name:"取消",exact:true}).click();}
   if(route==="notes") {assert.equal(await p.locator(".sn[data-note-id]").count(),5);const names=await p.locator('.sn[data-note-id] footer button').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')));
    assert.ok(names.length>0);assert.equal(new Set(names).size,names.length,"逐条动作可访问名唯一");
    const note=data.state.notes[0],title=plainText(note.text).split("\n").find(x=>x.trim()).trim().slice(0,80);
    await p.locator(`[data-note-id="${note.id}"] .sn-body`).click();assert.equal(await p.locator(".sn-editable .ink-yellow").count(),1);assert.equal(await visible175(p),plainText(note.text).replaceAll("\n- [ ] ","\n").replaceAll("\n- ","\n"));await geometry(p,roots[route],"编辑");await p.keyboard.press("Escape");assert.equal((await app.repository.read()).notes.find(n=>n.id===note.id).text,note.text);}
   if(!long&&width===390)await motion(p,roots[route],route==="aihot" ? (page,_selector,label)=>aihotGeometry(page,label) : geometry);await p.context().close();
  }
 }
 const data=batch2Data();await app.close();app=await fixture();await seedBatch2(app,data);
 let p=await open(390,"aihot",data);await p.locator(".ah-star").first().click();await p.locator(".ah-star.on").first().waitFor();assert.equal(await p.locator(".ah-star.on").first().getAttribute("aria-pressed"),"true");const collected=(await app.repository.read()).learning.links.length;await p.locator(".ah-star.on").first().click();await p.locator(".toast").getByText("已收藏过，在学习成长的链接收藏里",{exact:true}).waitFor();assert.equal((await app.repository.read()).learning.links.length,collected);await p.context().close();
 p=await open(390,"learning",data);const g=p.getByRole("radiogroup",{name:"学习视图筛选"});await g.getByRole("radio",{name:"想学",exact:true}).click();await p.locator(".shelf-book").getByRole("radio",{name:"在学",exact:true}).press("Space");await p.waitForFunction(()=>document.activeElement?.closest(".learning-filter"));assert.equal(await p.locator(".shelf-book").count(),0);assert.equal((await app.repository.read()).learning.books[1].status,"learning");await p.context().close();
 p=await open(390,"notes",data);await enterNew175(p);await replace175(p,"失败保留的合成草稿");const before=(await app.repository.read()).notes;
 await p.route("**/api/workspace",r=>r.request().method()==="PUT"?r.fulfill({status:503,json:{error:"合成保存失败"}}):r.continue());await button(p,"贴上").click();await p.locator(".toast").waitFor();await button(p,"返回失败输入").click();assert.equal(await visible175(p),"失败保留的合成草稿");await p.keyboard.press("Escape");assert.deepEqual((await app.repository.read()).notes,before);
 await p.unroute("**/api/workspace");await p.evaluate(()=>{window.receipts=[];new MutationObserver(es=>{for(const e of es)for(const n of e.addedNodes)if(n.nodeType===1&&n.matches(".toast.tone-success"))window.receipts.push(n.textContent)}).observe(document.body,{childList:true,subtree:true})});await button(p,"核对并重试").click();await p.waitForFunction(()=>window.receipts.length>0);await p.locator(".toast.tone-success").waitFor({state:"detached"});await p.waitForTimeout(200);assert.deepEqual(await p.evaluate(()=>window.receipts),["完成已保存本地随手记"]);await enterNew175(p);assert.equal(await visible175(p),"");assert.equal((await app.repository.read()).notes.filter(n=>n.text==="失败保留的合成草稿").length,1);await p.context().close();
 assert.deepEqual(errors,[]);console.log("PASS 批次2：44px、320/390/1440逐元素边界/裁切、axe、运行中reduce、筛选/键盘/空态、失败保留及一次成功反馈");
}finally{await browser.close();await app.close();}

// 批准202允许摘要/条目标题省略；仍逐元素核对外边界、所有控件44px，装饰01不参与内容边界。
async function aihotGeometry(p,label) {
 assert.deepEqual(await p.evaluate(()=>[...document.querySelectorAll('.aihot-v16,.aihot-v16 *')].filter(e=>!e.closest('svg,.ah-ghost,.sr-only')&&e.checkVisibility()).flatMap(e=>{const b=e.getBoundingClientRect();return b.width&&(b.left<-.5||b.right>innerWidth+.5)?[e.tagName+'.'+e.className]:[]})),[],label);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,label);
 for(const c of await p.locator('.aihot-v16 button,.aihot-v16 a').all()){const b=await c.boundingBox();if(b)assert(b.width>=44&&b.height>=44,label+' 44px');}
}

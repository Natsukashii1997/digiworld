import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fixture } from './fixture.mjs';
import { seed, makeAsset, current } from '../src/store.js';
import { buildSkillZip, readSkillZip, fileBytes } from '../src/skill-package.js';
import { axe, geometry } from './ui-v14-checks.mjs';
const output = resolve(process.env.DESIGN_TEST_RESULTS || 'test-results/design');
await mkdir(output,{recursive:true});
const deny = () => { throw Error('本专项禁止真实来源'); };
const app = await fixture({discovery:{defaultRoots:()=>[],detectAgents:async()=>({items:[],errors:[],at:new Date().toISOString()}),scanLocalProjects:async()=>({items:[],errors:[],at:new Date().toISOString()}),skillSourceReader:deny,knowledgeFiles:{read:deny,write:deny}}});
const control = makeAsset({type:'Prompt',title:'参照卡片',description:'保留原有卡片与操作位置',content:'对照正文'});
await app.repository.write({...seed(),assets:[control],scrolls:[],agents:[],projects:[]},{initialize:true});
const files=[{path:'frame/SKILL.md',text:true,data:'---\nname: frame-studio\n---\n# Frame\nFull package',mode:0o644},{path:'frame/素材.bin',text:false,data:new Uint8Array([0,255,128,4]),mode:0o644},{path:'frame/参考.md',text:true,data:'保留中文引用',mode:0o644}];
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage();page.setDefaultTimeout(10000);
const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
const button=(root,name)=>root.getByRole('button',{name,exact:true});
const card=title=>page.locator('.asset-card').filter({has:button(page,`查看 ${title}`)});
const copy=title=>button(page,`复制生图提示词 ${title}`);
const clipboard=()=>page.evaluate(()=>navigator.clipboard.readText());
const read=()=>app.repository.read();
const uses=async()=> (await read()).assetActivity.filter(r=>r.kind==='use');
const usage=async(title,n)=>{await page.waitForFunction(({title,n})=>Array.from(document.querySelectorAll('.asset-card')).find(e=>e.querySelector(`[aria-label="查看 ${title}"]`))?.querySelector('.cover-uses')?.textContent===String(n),{title,n});};
const edit=()=>page.getByRole('dialog',{name:'编辑资产 · 保存为新版本',exact:true});
const detail=()=>page.getByRole('dialog',{name:'资产详情',exact:true});
try {
 await page.goto(app.url+'/#assets');await card('参照卡片').waitFor();
 await page.getByRole('group',{name:'资产类型',exact:true}).getByRole('button',{name:/^设计/}).click();
 await button(page,'新建').first().click();
 let form=page.getByRole('dialog',{name:'新建资产',exact:true});
 assert.equal(await form.getByRole('radio',{name:'设计',exact:true}).getAttribute('aria-checked'),'true');
 await form.getByRole('radio',{name:'Skill',exact:true}).click();
 await form.getByRole('radio',{name:/自建/}).click(); // 用户 2026-10-27：Skill 默认填安装地址，上传 ZIP 要选自建
 await form.getByLabel('选择 Skill ZIP 文件').setInputFiles({name:'frame.zip',mimeType:'application/zip',buffer:Buffer.from(buildSkillZip(files))});
 await form.getByText('已包含 3 个文件',{exact:true}).waitFor();
 await form.getByRole('radio',{name:'设计',exact:true}).click();
 assert.equal(await form.getByRole('textbox',{name:'调用的 Skill',exact:true}).count(),0,'跨类型上传也不要求调用名');
 await form.getByRole('textbox',{name:'名称',exact:true}).fill('画框设计');
 await form.getByRole('textbox',{name:'一句话说明',exact:true}).fill('统一的粉色像素画框');
 await form.getByRole('textbox',{name:'生图提示词',exact:true}).fill('生成一张粉色海报，留出标题区。');
 await form.getByLabel('选择 Skill ZIP 文件').setInputFiles({name:'frame.zip',mimeType:'application/zip',buffer:Buffer.from(buildSkillZip(files))});
 await form.getByText('已包含 3 个文件',{exact:true}).waitFor();
 assert.equal(await form.getByRole('textbox',{name:'生图提示词',exact:true}).inputValue(),'生成一张粉色海报，留出标题区。');
 assert.equal(await form.getByRole('textbox',{name:'调用的 Skill',exact:true}).count(),0);
 await page.screenshot({path:join(output,'new-skill-1440.png'),fullPage:true});
 await button(form,'保存资产').click();await form.waitFor({state:'hidden'});await card('画框设计').waitFor();
 let state=await read(),asset=state.assets.find(a=>a.type==='Design');const skillVersion=current(asset);
 assert.equal(skillVersion.files.length,3);assert.equal(skillVersion.design.kind,'skill');
 await copy('画框设计').click();await usage('画框设计',1);
 let text=await clipboard();assert.match(text,/已可用.*直接/);assert.match(text,/未安装/);assert.match(text,/frame-studio/);assert.match(text,/标题区/);
 assert.equal((await uses()).at(-1).action,'copy-design');assert.ok((await uses()).at(-1).deliveryId);
 assert.equal(await page.getByRole('dialog').count(),0);
 await button(page,'查看 画框设计').click();
 await button(detail(),'复制生图提示词').click();await detail().getByText('已使用 2 次',{exact:false}).waitFor();
 const downloaded=page.waitForEvent('download');await button(detail(),'导出完整 Skill 包').click();
 const pack=await downloaded, extracted=readSkillZip(new Uint8Array(await readFile(await pack.path())));
 for (const expected of files) { const actual=extracted.files.find(f=>f.path===expected.path); assert.ok(actual); assert.deepEqual(fileBytes(actual),fileBytes(expected)); assert.equal(actual.mode,expected.mode); } 
 assert.equal(await detail().getByRole('button',{name:'发布到 Skill 池',exact:true}).count(),0);
 await button(detail(),'编辑资产').click();await edit().waitFor();
 await edit().getByRole('combobox',{name:'内容形式',exact:true}).selectOption('prompt');
 assert.equal(await edit().getByRole('textbox',{name:'调用的 Skill',exact:true}).count(),0);
 await edit().getByRole('textbox',{name:'生图提示词',exact:true}).fill('生成一张蓝色封面，16:9。');
 await page.screenshot({path:join(output,'edit-prompt-1440.png'),fullPage:true});
 await button(edit(),'保存新版本').click();await edit().waitFor({state:'hidden'});
 if(await detail().count()) await button(detail(),'关闭').click();
 await copy('画框设计').click();await usage('画框设计',3);
 text=await clipboard();assert.match(text,/ChatGPT 默认的生图能力/);assert.doesNotMatch(text,/Skill|imagegen|frame-studio/);assert.match(text,/蓝色封面/);assert.doesNotMatch(text,/packages\/|未安装|完整包/);
 state=await read();asset=state.assets.find(a=>a.type==='Design');assert.equal(current(asset).files.length,0);assert.equal(asset.versions[0].files.length,3);assert.equal((await uses()).at(-1).deliveryId,undefined);
 await button(page,'查看 画框设计').click();await button(detail(),'历史2').or(detail().getByRole('button',{name:/^历史/})).first().click();
 await detail().getByRole('combobox',{name:'查看版本',exact:true}).selectOption(skillVersion.id);
 assert.equal(await detail().locator('.version-snapshot').getAttribute('open'),'','历史快照默认展开');
 await detail().locator('.history-fields dd').filter({hasText:'Skill 包'}).waitFor();
 assert.equal(await detail().getByText('调用的 Skill',{exact:true}).count(),0);
 await button(detail(),'恢复此版本').click();
 await button(detail(),'确认恢复为新版本').click();
 await page.waitForFunction(()=>document.querySelector('.detail-version')?.textContent==='v3.0');
 await button(detail(),'关闭').click();
 state=await read();asset=state.assets.find(a=>a.type==='Design');assert.deepEqual(current(asset).files,skillVersion.files);assert.deepEqual(current(asset).design,skillVersion.design);
 results.push('create-upload-preserves-requirements/complete-export/copy-both-forms/mode-switch/history-restore');
 // Add another design prompt through the same form, confirming the fixed icon is shared.
 await button(page,'新建').first().click();form=page.getByRole('dialog',{name:'新建资产',exact:true});
 await form.getByRole('combobox',{name:'内容形式',exact:true}).selectOption('prompt');
 await form.getByRole('textbox',{name:'名称',exact:true}).fill('海报提示词');
 await form.getByRole('textbox',{name:'一句话说明',exact:true}).fill('直接使用 ChatGPT 生图');
 assert.equal(await form.getByRole('textbox',{name:'调用的 Skill',exact:true}).count(),0);
 await form.getByRole('textbox',{name:'生图提示词',exact:true}).fill('为我的活动生成一张极简海报。');
 await button(form,'保存资产').click();await form.waitFor({state:'hidden'});await card('海报提示词').waitFor();
 await page.getByRole('group',{name:'资产类型',exact:true}).getByRole('button',{name:/^全部/}).click();
 for(const width of [1440,390,320]) {
   await page.setViewportSize({width,height:1000});await card('画框设计').scrollIntoViewIfNeeded();await page.mouse.move(0,0);await page.locator('.page-heading h1').click();
   const measurements=async title=>card(title).evaluate(el=>{
     const bounds=el.getBoundingClientRect();const rel=selector=>{const e=el.querySelector(selector),r=e.getBoundingClientRect();return {x:Math.round(r.x-bounds.x),y:Math.round(r.y-bounds.y),w:Math.round(r.width),h:Math.round(r.height)};};
     return {card:{w:Math.round(bounds.width),h:Math.round(bounds.height)},cover:rel('.cover'),copy:rel('.asset-copy'),pin:rel('.pin-button'),remove:rel('.asset-delete'),opacity:getComputedStyle(el.querySelector('.asset-copy')).opacity};
   });
   assert.deepEqual(await measurements('画框设计'),await measurements('参照卡片'),`${width}设计继承原卡片所有几何`);
   const glyphs=await page.locator('.type-Design.cover .pixel').count();
   assert.equal(glyphs,2);
   const svgs=await page.locator('.type-Design.cover .pixel').evaluateAll(els=>els.map(e=>e.innerHTML));assert.equal(svgs[0],svgs[1]);
   await card('画框设计').hover();assert.equal(await copy('画框设计').evaluate(el=>getComputedStyle(el).opacity),'1');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await geometry(page,'.asset-toolbar',`Design ${width}`);await axe(page,`Design ${width}`);
   await page.screenshot({path:join(output,`cards-${width}.png`),fullPage:true});
   await button(page,'查看 画框设计').click();await button(detail(),'编辑资产').click();
   await geometry(page,'[role=dialog]',`Design edit ${width}`);await axe(page,`Design edit ${width}`);
   await page.screenshot({path:join(output,`form-${width}.png`),fullPage:true});
   await button(edit(),'取消').click();if(await detail().count())await button(detail(),'关闭').click();
   results.push({width,geometry:'same-as-original',fixedIcon:true});
 }
 await page.setViewportSize({width:1440,height:1000});
 // Clipboard failure must not count.
 const before=(await uses()).length;
 await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('synthetic denied');};});
 await copy('海报提示词').click();await page.getByText('无法访问剪贴板，请选中文字后手动复制',{exact:true}).waitFor();assert.equal((await uses()).length,before);
 await page.reload();await card('画框设计').waitFor();
 // Unknown response after a successful commit: revoke the link before query; original record must still recover.
 let submitted;
 await page.route('**/api/asset-activity**',async route=>{
   if(route.request().method()==='POST'){submitted=route.request().postDataJSON();await route.fetch();return route.abort('connectionreset');}
   return route.abort('connectionreset');
 });
 await copy('画框设计').click();await page.locator('.toast').getByText('全文已复制，使用记录待核对',{exact:true}).waitFor();await card('画框设计').locator('.asset-copy-recovery').waitFor();
 await page.unroute('**/api/asset-activity**');
 const api=async(path,body)=>page.evaluate(async({path,body})=>{
   const {token}=await(await fetch('/api/session',{headers:{'X-Workbench-Client':'1'}})).json();
   const r=await fetch('/api'+path,{method:'POST',headers:{'X-Workbench-Token':token,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text());return r.json();
 },{path,body});
 await api('/deliveries/revoke',{id:submitted.deliveryId});
 await button(card('画框设计'),'查询记录').click();await card('画框设计').locator('.asset-copy-recovery').waitFor({state:'hidden'});
 assert.equal((await uses()).filter(r=>r.id===submitted.id).length,1);
 // Never committed + revoked link: stop recovery, do not write another record.
 await page.route('**/api/asset-activity**',route=>{
   if(route.request().method()==='POST'){submitted=route.request().postDataJSON();return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'synthetic uncommitted'})});}
   return route.abort('connectionreset');
 });
 await copy('画框设计').click();await page.locator('.toast').getByText('全文已复制，使用记录待核对',{exact:true}).waitFor();await card('画框设计').locator('.asset-copy-recovery').waitFor();
 await page.unroute('**/api/asset-activity**');await api('/deliveries/revoke',{id:submitted.deliveryId});
 await button(card('画框设计'),'查询记录').click();await card('画框设计').locator('.asset-copy-recovery').waitFor({state:'hidden'});
 assert.equal((await uses()).filter(r=>r.id===submitted.id).length,0);
 assert.equal(await copy('画框设计').isEnabled(),true);
 results.push('clipboard-failure/no-count/unknown-committed-recovery/unknown-revoked-no-retry');
 await page.goto(app.url+'/#home');await page.getByLabel('设计，2份',{exact:true}).waitFor();
 assert.ok((await page.locator('.hx-summary-list li').allTextContents()).some(text=>text.includes('设计 ·')));
 assert.deepEqual(errors,[]);
 console.log('PASS Design browser',JSON.stringify(results));
} catch(error) {await page.screenshot({path:join(output,'failure.png'),fullPage:true});throw error;}
finally {await writeFile(join(output,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();await app.close();}

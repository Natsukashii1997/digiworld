import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {targetFixture} from './target-fixture.mjs';
const out=process.env.GUIJI_TEST_RESULTS || 'test-results/settings-targets';await mkdir(out,{recursive:true});
const app=await targetFixture(),browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(10000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
const panel=p.getByRole('region',{name:'管理目标',exact:true});
async function open(){await p.goto(app.url+'/#settings');await p.getByRole('radio',{name:'资产交付目标',exact:true}).click();await panel.waitFor();}
try{
 await open();const before=await app.call('/workspace');
 await panel.getByRole('button',{name:'检查版本与目标',exact:true}).click();
 await panel.getByRole('button',{name:'添加目标',exact:true}).click();
 await panel.getByLabel('目标名称',{exact:true}).fill('个人 Codex');
 await p.getByRole('radio',{name:'Hermes',exact:true}).click();assert.equal(await panel.getByLabel('目标名称',{exact:true}).inputValue(),'个人 Codex');assert.equal(await p.getByRole('radio',{name:'Codex',exact:true}).getAttribute('aria-checked'),'true');
 await p.getByRole('radio',{name:'数据与备份',exact:true}).click();assert.equal(await p.getByRole('radio',{name:'资产交付目标',exact:true}).getAttribute('aria-checked'),'true');
 await panel.getByRole('combobox',{name:/^程序入口/}).selectOption('fixture-cli');await panel.getByRole('combobox',{name:/^Home \/ Profile/}).selectOption('fixture-default');
 let release;const gate=new Promise(r=>release=r);let requests=0;
 await p.route('**/api/agent-targets/save',async r=>{requests++;await gate;await r.continue();});
 const observed=p.waitForRequest(r=>r.url().endsWith('/api/agent-targets/save'));
 await panel.getByRole('button',{name:'保存目标',exact:true}).click();await observed;
 await p.getByRole('radio',{name:'Hermes',exact:true}).click();assert.equal(await p.getByRole('radio',{name:'Codex',exact:true}).getAttribute('aria-checked'),'true');
 release();await p.getByText('已保存管理目标；未修改 Agent 配置',{exact:true}).waitFor();await p.unroute('**/api/agent-targets/save');
 assert.equal(requests,1);let saved=await app.call('/workspace');assert.equal(saved.connections.agentTargets.length,1);assert.deepEqual(saved.assets,before.assets);assert.equal(await app.sourceUnchanged(),true);
 await p.reload();await p.getByRole('radio',{name:'资产交付目标',exact:true}).click();await panel.getByRole('region',{name:'个人 Codex',exact:true}).waitFor();
 assert.equal(await panel.getByText('编辑配置',{exact:true}).count(),0);
 await p.getByRole('radio',{name:'Hermes',exact:true}).click();await p.getByRole('radio',{name:'Codex',exact:true}).click();await panel.getByRole('region',{name:'个人 Codex',exact:true}).waitFor();
 for(const width of [1440,390,320]){await p.setViewportSize({width,height:1000});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);await p.screenshot({path:join(out,'targets-'+width+'.png'),fullPage:true});}
 assert.deepEqual(errors,[]);await writeFile(join(out,'results.json'),JSON.stringify({draftRetained:true,inFlightProtected:true,savedOnce:true,reloadVerified:true,sourceUnchanged:true,errors},null,2));console.log('PASS settings target registration, draft guard, in-flight guard, reload, source protected and 3 widths');
}finally{await context.close();await browser.close();await app.close();}

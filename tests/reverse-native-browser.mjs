import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {fixture} from './fixture.mjs';
import {fakeNative} from './fake-native.mjs';
import {seed} from '../src/store.js';
import {createSpecimen} from '../src/reverse-recipe.js';
import {axe} from './ui-v14-checks.mjs';
const out='work/reverse-native572/ui';await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[],errors=[];
async function shot(page,name){
 await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});
 await page.screenshot({path:join(out,name+'.png'),fullPage:true});
 if(name.endsWith('-320'))await page.screenshot({path:join(out,name+'-viewport.png')});
}
try {
 for(const width of [1440,390,320]){
  const fake=fakeNative(),app=await fixture({reverseNative:{connect:fake.connect}});
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  try{
   const state=seed();state.assets=[];state.reverseSettings={threshold:90,executor:'codex'};
   state.reverseRecords=[createSpecimen({type:'FN',title:'原生逆向合成程序',target:{kind:'local',path:join(app.directory,'fixture-bin'),feature:'识别程序与实现路径',authorized:true,clues:[]}})];
   await app.repository.write(state,{initialize:true});
   const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{assert.equal(new URL(route.request().url()).origin,new URL(app.url).origin);return route.continue();});
   await page.goto(app.url+'/#references');
   await page.getByLabel('规则目录（填写与 Codex 聊天相同的工作目录）').fill(app.directory);
   await page.getByRole('button',{name:'读取 Codex 设置',exact:true}).click();
   await page.getByText('已发现 REA Skill',{exact:false}).waitFor();
   await axe(page,'native settings '+width);await shot(page,`settings-${width}`);
   await page.getByRole('button',{name:'开始分析',exact:true}).click();
   await page.getByText('允许 REA 打开合成目标？',{exact:true}).waitFor();
   assert.match(await page.locator('.native-request').innerText(),/目标路径/);
   await page.getByLabel(/^授权记忆/).selectOption('session');
   await axe(page,'native approval '+width);await shot(page,`approval-${width}`);
   await page.getByRole('button',{name:'提交',exact:true}).click();
   await page.getByRole('button',{name:'保存这条回复为任务包',exact:true}).waitFor();
   await page.getByRole('button',{name:'保存这条回复为任务包',exact:true}).click();
   await page.getByRole('button',{name:'确认保存任务包',exact:true}).click();
   await page.locator('[data-testid=replica-pack]').waitFor();
   assert.match(await page.locator('[data-testid=replica-pack]').textContent(),/普通 Markdown/);
   const pack=(await app.repository.read()).reverseRecords[0].packVersions[0];
   assert.ok(pack.nativeSource.threadId);
   await page.getByLabel('分析要求 / 继续追问',{exact:true}).fill('继续说明证据限制');
   await page.getByRole('button',{name:'发送',exact:true}).click();
   await page.waitForFunction(()=>document.querySelectorAll('.native-message:not(.native-user)').length===2);
   await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.native-message:not(.native-user)').length===2);
   await page.getByRole('button',{name:'断开连接',exact:true}).click();
   await page.getByRole('button',{name:'重新连接并核对',exact:true}).click();
   await page.getByRole('button',{name:'断开连接',exact:true}).waitFor();
   assert.equal(fake.calls.filter(c=>c.method==='turn/start').length,2);
   assert.equal(fake.calls.filter(c=>c.id===17&&c.result).length,1);
   assert.equal(fake.calls.find(c=>c.id===17&&c.result).result._meta.persist,'session');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   for(const control of await page.locator('.native-session button,.native-session select,.native-session input').all()){
    if(!await control.isVisible())continue;
    const box=await control.boundingBox();assert.ok(box.height>=43.5&&box.width>=43.5,(await control.textContent())+JSON.stringify(box));
   }
   await axe(page,'native complete '+width);await shot(page,`complete-${width}`);
   await page.getByRole('button',{name:'选择执行器：Codex',exact:true}).click();
   await page.getByRole('menuitemradio',{name:'Claude Code',exact:true}).click();
   await page.getByRole('button',{name:'选择执行器：Claude Code',exact:true}).waitFor();
   assert.equal((await app.repository.read()).reverseSettings.executor,'claude');
   await page.getByRole('button',{name:'选择执行器：Claude Code',exact:true}).click();
   await page.getByRole('menuitemradio',{name:'Codex',exact:true}).click();
   await page.getByRole('button',{name:'重新连接并核对',exact:true}).waitFor();
   results.push(`${width}: settings, approval, fixed pack, followup, reload, reconnect, no replay, geometry, WCAG axe PASS`);
  }finally{await context.close();await app.close();}
 }
 assert.deepEqual(errors,[]);await writeFile(join(out,'results.json'),JSON.stringify(results,null,2));console.log(results.join('\n'));
}finally{await browser.close();}

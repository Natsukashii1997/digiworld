import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {fixture} from './fixture.mjs';
import {fakeNative} from './fake-native.mjs';
import {seed} from '../src/store.js';
import {createSpecimen} from '../src/reverse-recipe.js';
import {axe} from './ui-v14-checks.mjs';

const output=process.env.REA_DIALOG_OUTPUT||'work/reverse-adoption574/dialog-check';
await mkdir(output,{recursive:true});
const browser=await chromium.launch(),results=[];
try{
 for(const width of [1466,390,320]){
  const fake=fakeNative(),app=await fixture({reverseNative:{connect:fake.connect}});
  const context=await browser.newContext({viewport:{width,height:925},reducedMotion:'reduce'});
  try{
   const state=seed();state.assets=[];state.reverseSettings={threshold:90,executor:'codex'};
   state.reverseRecords=[createSpecimen({type:'FN',title:'原生任务包弹窗验收',target:{kind:'local',path:join(app.directory,'fixture-bin'),feature:'只读合成样本',authorized:true,clues:[]}})];
   await app.repository.write(state,{initialize:true});
   const page=await context.newPage();page.setDefaultTimeout(10000);
   await page.route('**/*',route=>{assert.equal(new URL(route.request().url()).origin,new URL(app.url).origin);return route.continue();});
   await page.goto(app.url+'/#references');
   await page.getByLabel('规则目录（填写与 Codex 聊天相同的工作目录）').fill(app.directory);
   await page.getByRole('button',{name:'读取 Codex 设置',exact:true}).click();
   await page.getByRole('button',{name:'开始分析',exact:true}).click();
   await page.getByRole('button',{name:'提交',exact:true}).click();
   const save=page.getByRole('button',{name:'保存这条回复为任务包',exact:true});
   await save.click();
   const dialog=page.getByRole('dialog',{name:'保存为固定任务包'});
   await dialog.waitFor();
   await page.screenshot({path:join(output,`preview-${width}.png`)});
   const hit=await dialog.evaluate(el=>{
    const header=el.querySelector('.dialog-top'),close=el.querySelector('.dialog-close');
    function visible(node){
     const r=node.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,top=document.elementFromPoint(x,y);
     return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},inViewport:x>=0&&x<innerWidth&&y>=0&&y<innerHeight,receivesPointer:!!top&&(node===top||node.contains(top)),topClass:top?.className?.baseVal||top?.className};
    }
    return {header:visible(header),close:visible(close)};
   });
   await writeFile(join(output,`hit-${width}.json`),JSON.stringify(hit,null,2));
   assert.ok(hit.header.inViewport&&hit.header.receivesPointer,`dialog header obscured at ${width}: ${JSON.stringify(hit.header)}`);
   assert.ok(hit.close.inViewport&&hit.close.receivesPointer,`dialog close obscured at ${width}: ${JSON.stringify(hit.close)}`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await axe(page,`native pack dialog ${width}`);
   await dialog.getByRole('button',{name:'关闭',exact:true}).click();
   await dialog.waitFor({state:'detached'});
   assert.equal(((await app.repository.read()).reverseRecords[0].packVersions||[]).length,0);
   await save.click();await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
   assert.equal(((await app.repository.read()).reverseRecords[0].packVersions||[]).length,0);
   await save.click();await dialog.getByRole('button',{name:'确认保存任务包',exact:true}).click();
   await page.locator('[data-testid=replica-pack]').waitFor();
   assert.equal((await app.repository.read()).reverseRecords[0].packVersions.length,1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   results.push({width,header:true,close:true,escape:true,save:true,axe:true});
  }finally{await context.close();await app.close();}
 }
 await writeFile(join(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}

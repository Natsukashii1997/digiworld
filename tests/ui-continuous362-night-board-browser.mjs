// 派单362：实际夜巡组件，隔离合成计划；布局、拖动提示、触屏点选与事实读数。
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {nightV2Fixture} from './night-v2-fixture.mjs';
import {NIGHT_V2_PRESETS,addSlot,nightV2Of} from '../src/night-v2-model.js';
const out=process.env.GUIJI_TEST_RESULTS||'test-results/continuous362-night-board';await mkdir(out,{recursive:true});
const browser=await chromium.launch(),errors=[],records=[],requests=[];
function prepare(count){return state=>{for(const [index,chip] of NIGHT_V2_PRESETS.slice(0,count).entries())state=addSlot(state,{chipId:chip.id,projectId:index?'demo-project':'',goal:['比较停止条件与真实回执','完成首页状态卡并核对恢复路径','检查日历拖动的边界','复核风险清单'][index],topic:index?'':'Agent loop停止条件',acceptance:['合成验收：交付与事实一致']},{id:`board-slot-${index+1}`});return state;};}
async function open(app,width,touch=false){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',timezoneId:'Asia/Shanghai',hasTouch:touch,isMobile:touch});const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const url=new URL(r.request().url());assert.equal(url.origin,new URL(app.url).origin,'禁止外连');requests.push(url.pathname);return r.continue();});
 await page.goto(app.url+'/#night');await page.getByTestId('night-library').waitFor();await page.waitForTimeout(300);return {context,page};
}
try{
 for(const count of [0,2,4]){
  const app=await nightV2Fixture({prepareState:prepare(count)});
  try{for(const width of [2560,1920,1440,1024,390,320]){
   const {context,page}=await open(app,width);
   try{
    const shape=await page.evaluate(()=>{
     const root=document.querySelector('.night-v16'),lib=root.querySelector('.nv-library'),bay=root.querySelector('.nv-bay'),row=root.querySelector('.nv-slots'),boxes=[...root.querySelectorAll('.nv-slot-well')].map(e=>e.getBoundingClientRect()),cards=[...lib.querySelectorAll('.nt-chip')].slice(0,3).map(e=>e.getBoundingClientRect());
     return {overflow:document.documentElement.scrollWidth-innerWidth,lib:{x:lib.offsetLeft,y:lib.offsetTop,width:lib.offsetWidth},bay:{x:bay.offsetLeft,y:bay.offsetTop,width:bay.offsetWidth,position:getComputedStyle(bay).position,top:getComputedStyle(bay).top},wells:boxes.map(r=>({x:r.x,y:r.y,width:r.width,height:r.height})),cards:cards.map(r=>({x:r.x,y:r.y})),row:{width:row.clientWidth,scrollWidth:row.scrollWidth}};
    });
    assert.equal(shape.overflow,0);assert(shape.wells.every(w=>Math.abs(w.height-220)<=1));assert(shape.wells.every(w=>Math.abs(w.y-shape.wells[0].y)<=1));assert(shape.wells.every(w=>Math.abs(w.width-shape.wells[0].width)<=1));
    assert(Math.abs(shape.cards[0].y-shape.cards[1].y)<=1&&shape.cards[2].y>shape.cards[0].y,'芯片库两列');
    if(width>1200){assert(Math.abs(shape.lib.width-332)<=1);assert(shape.lib.x<shape.bay.x);assert(Math.abs(shape.lib.y-shape.bay.y)<=2);assert.equal(shape.bay.position,'sticky');assert.equal(shape.bay.top,'76px');}
    else {assert(shape.bay.y<shape.lib.y,'主板在上、芯片库在下');assert(shape.row.scrollWidth>shape.row.width,'插槽局部横滑');}
    assert.equal(await page.locator('.nv-slot-hint b').filter({hasText:'点选芯片，也可拖入'}).count(),count<4?1:0);
    assert.equal(await page.locator('.nt-slot.vacant .nv-slot-hint svg').count(),4-count);
    assert.equal(await page.locator('.nv-chip-reverse').count(),count);await page.getByRole('img',{name:`插槽 ${count}`,exact:true}).waitFor();
    assert.equal(await page.locator('.nv-meters .nv-meter').count(),0,'预算细进度条已换成液晶读数');assert.match(await page.locator('.nv-meters').innerText(),/待检查/,'未知额度不伪装成0');
    if(count)assert.match(await page.locator('.nv-bay-top h2').innerText(),new RegExp(`今晚插了\\s*${count}\\s*枚芯片`));
    const small=await page.locator('.nv-bay button,.nv-library button').evaluateAll(elements=>elements.filter(e=>e.checkVisibility({checkOpacity:true})).map(e=>({label:e.getAttribute('aria-label'),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})).filter(r=>r.w<44||r.h<44));assert.deepEqual(small,[],'可用点击目标44px');
    if([1440,390].includes(width))assert.deepEqual((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()).violations,[]);
    await page.screenshot({path:join(out,`night-${count}-${width}.png`),fullPage:true});records.push({count,width,...shape});
   }finally{await context.close();}
  }assert.deepEqual(app.forbidden,[]);}finally{await app.close();}
 }
 for(const width of [1440,390]){
  const app=await nightV2Fixture({prepareState:prepare(2)}),{context,page}=await open(app,width,width===390);
  try{
   if(width===1440){
    await page.getByTestId('night-slot-1').focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('[data-testid="night-slot-1"] [data-chip-id]')?.dataset.chipId==='push');assert.equal(nightV2Of(await app.repository.read()).slots[0].chipId,'push','键盘换序写后回读');
    const transfer=await page.evaluateHandle(()=>new DataTransfer());const chip=page.locator('.nv-library [data-chip-id="test"]');await chip.dispatchEvent('dragstart',{dataTransfer:transfer});assert(await chip.evaluate(e=>e.classList.contains('nv-dragging')));
    for(const index of [1,4]){
     const invalid=page.getByTestId(`night-slot-${index}`);await invalid.dispatchEvent('dragover',{dataTransfer:transfer});assert.equal(await page.locator('.nv-drop-target').count(),0,'不在实际追加位置的槽不亮橙');await invalid.dispatchEvent('drop',{dataTransfer:transfer});assert.equal(await page.getByTestId('night-edit-drawer').count(),0,'无效库拖入不开编辑');assert.equal(nightV2Of(await app.repository.read()).slots.length,2);await chip.dispatchEvent('dragstart',{dataTransfer:transfer});
    }
    const target=page.getByTestId('night-slot-3');await target.dispatchEvent('dragover',{dataTransfer:transfer});assert(await target.evaluate(e=>e.classList.contains('nv-drop-target')));assert.equal(await target.locator('.nv-slot-well').evaluate(e=>getComputedStyle(e).borderColor),'rgb(255, 138, 36)');await page.screenshot({path:join(out,'drag-orange-1440.png'),fullPage:true});
    await target.dispatchEvent('drop',{dataTransfer:transfer});await page.getByTestId('night-edit-drawer').waitFor();await page.keyboard.press('Escape');assert.equal(nightV2Of(await app.repository.read()).slots.length,2,'拖入后仍须确认保存');assert.equal(await page.locator('.nv-dragging,.nv-drop-target').count(),0);await transfer.dispose();
   }else{
    const row=page.getByRole('region',{name:'今晚四个插槽，可横向滚动',exact:true});await row.focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(200);assert(await row.evaluate(e=>e.scrollLeft>0),'横滑区可由键盘触达');
    await page.route('**/api/night-v2/status',async r=>{const response=await r.fetch();await r.fulfill({response,json:{...(await response.json()),quotaEstimatePercent:9.5}});});await page.reload();await page.getByRole('img',{name:'本周额度约 9.5%',exact:true}).waitFor();
    await page.locator('.nv-library [data-chip-id="review"]').tap();const editor=page.getByTestId('night-edit-drawer');await editor.waitFor();await editor.getByLabel('今晚目标').fill('触屏点选：核对合成风险边界');await editor.getByRole('button',{name:'插入今晚',exact:true}).tap();await editor.waitFor({state:'detached'});assert.equal(nightV2Of(await app.repository.read()).slots.length,3);await page.getByRole('img',{name:'插槽 3',exact:true}).waitFor();assert.match(await page.locator('.nv-bay-top h2').innerText(),/今晚插了\s*3\s*枚芯片/);await page.screenshot({path:join(out,'touch-insert-390.png'),fullPage:true});
   }
   assert.deepEqual(app.forbidden,[]);
  }finally{await context.close();await app.close();}
 }
 assert.deepEqual(errors,[]);assert(!requests.some(path=>/\/api\/capabilities\/night\/(run|tick|confirm)/.test(path)),'不启动旧夜巡执行');await writeFile(join(out,'report.json'),JSON.stringify({records,errors,requests},null,2));console.log('continuous362-night-board-browser: all passed');
}finally{await browser.close();}

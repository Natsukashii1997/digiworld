import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';

const before=process.env.COLLECTION_PLATE_PHASE==='before';
const out=process.env.GUIJI_TEST_RESULTS||'test-results/collection-plate375';await mkdir(out,{recursive:true});
const image=await readFile('tests/collection-assets/upstream-reference.jpg');
const app=await collectionFixture({fetchImpl:async()=>new Response(image,{headers:{'content-type':'image/jpeg'}})}),browser=await chromium.launch();
const groups=['多卡纸堆','单卡','一个很长很长的分组名称EnglishWithoutSpaces','空分组','下一行'].map((name,i)=>({id:'plate-'+i,name,kind:'custom'}));
const ids=Array.from({length:11},(_,i)=>syntheticNote(i+1).id),mapping=Object.fromEntries(ids.map((id,i)=>[id,groups[i<8?0:i===8?1:i===9?2:4].id]));
const errors=[],records=[];
async function until(check){for(let i=0;i<120;i++){if(await check())return;await new Promise(done=>setTimeout(done,50));}throw Error('Synthetic collection state did not converge');}
async function open(width){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{assert.equal(new URL(r.request().url()).origin,app.url);return r.continue();});
 await page.goto(app.url+'/#learning');await page.locator('.collection-group').first().waitFor();await page.waitForTimeout(400);return {context,page};
}
const group=(page,i)=>page.locator(`.collection-group[data-group-id="${groups[i].id}"]`);
async function shot(page,width,name){await page.waitForTimeout(200);if([390,1440].includes(width))await page.screenshot({path:join(out,name+'-'+width+'.png'),fullPage:true});}
async function geometry(page,name){
 await page.waitForTimeout(250);
 const current=(await app.api('/desk-workspace')).noteGroupMap;
 const result=await page.locator('.collection-canvas').evaluate((canvas,{current,name})=>{
  const rect=n=>{const b=n.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};};
  const cards=[...canvas.querySelectorAll('.collection-card-position')];
  const labels=[...canvas.querySelectorAll('.collection-group')].map(el=>{
   const b=rect(el),s=getComputedStyle(el),nm=el.querySelector('.collection-group-name'),mine=cards.filter(c=>current[c.dataset.noteId]===el.dataset.groupId).map(rect);
   const empty=canvas.querySelector(`[data-empty-group-id="${el.dataset.groupId}"]`);
   return {...b,id:el.dataset.groupId,expanded:el.getAttribute('aria-expanded')==='true',bottomOfCards:mine.length?Math.max(...mine.map(c=>c.bottom)):null,empty:empty?rect(empty):null,borderTop:parseFloat(s.borderTopWidth),background:s.backgroundColor,nameStyle:nm?{nowrap:getComputedStyle(nm).whiteSpace,overflow:getComputedStyle(nm).textOverflow,client:nm.clientWidth,scroll:nm.scrollWidth}:null,count:el.querySelector('.collection-group-count')?.textContent,arrow:!!el.querySelector('svg'),overlaps:cards.filter(c=>!c.hasAttribute('aria-hidden')).filter(c=>{const r=rect(c);return b.left<r.right&&b.right>r.left&&b.top<r.bottom&&b.bottom>r.top;}).map(c=>c.dataset.noteId)};
  });
  const controls=[...canvas.querySelectorAll('button,input,[role="button"]')].filter(n=>!n.closest('[inert]')).map(rect);
  return {name,width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,labels,controls,canvas:rect(canvas),categories:canvas.querySelectorAll('.collection-card-category').length};
 },{current,name});
 records.push(result);
 if(before)return;
 assert.equal(result.overflow,0,name+' has no page overflow');
 assert(result.controls.every(c=>c.width>=43.9&&c.height>=43.9),name+' preserves 44px controls');
 assert.equal(result.categories,0,name+' hides redundant grouped card labels');
 for(const label of result.labels){
  assert.equal(label.width,156);assert(label.height>=44);assert.equal(label.arrow,false);assert.equal(label.background,'rgba(0, 0, 0, 0)');
  assert.match(label.count,/^\d+$/);assert.equal(label.nameStyle.nowrap,'nowrap');assert.equal(label.nameStyle.overflow,'ellipsis');
  assert(label.bottom<=result.canvas.bottom+.5);
  if(label.bottomOfCards!==null){assert(label.top>=label.bottomOfCards+7.2,name+' plate stays below its own cards');if(label.expanded||name==='folded')assert(label.top-label.bottomOfCards<=9,name+' plate follows its actual lower edge');}
  if(label.expanded||name==='folded')assert.deepEqual(label.overlaps,[],name+' plate does not cover visible cards');
  if(label.empty){assert.equal(label.empty.width,156);assert.equal(label.empty.height,212);assert(Math.abs(label.top-label.empty.bottom-8)<.6);}
 }
 const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
}
try{
 for(let i=1;i<=11;i++)await app.importNote(syntheticNote(i,{title:'合成铭牌卡片 '+(i<=7?'目标 ':'')+i}));
 const desk=await app.api('/desk-workspace');await app.api('/desk-workspace',{workspace:{...desk,groups,noteGroupMap:mapping},expectedRevision:desk.revision},'PUT');
 for(const width of [1440,390,768,1024,1280,1920]){
  const {context,page}=await open(width);
  try{
   await geometry(page,'folded');await shot(page,width,'multi-stack');
   await group(page,1).click();await shot(page,width,'single');await group(page,1).click();
   await group(page,0).click();await geometry(page,'expanded');await shot(page,width,'expanded');await group(page,0).click();
   await group(page,2).click();await shot(page,width,'long-name');
   if(!before){const nm=await group(page,2).locator('.collection-group-name').evaluate(n=>({client:n.clientWidth,scroll:n.scrollWidth}));assert(nm.scroll>nm.client);}
   await group(page,2).click();await group(page,3).click();await shot(page,width,'empty');await group(page,3).click();
   const source=page.locator(`[data-note-id="${ids[8]}"] .desk-native-drag`),transfer=await page.evaluateHandle(()=>new DataTransfer());
   await source.dispatchEvent('dragstart',{dataTransfer:transfer});
   const target=before?group(page,3):page.locator(`[data-empty-group-id="${groups[3].id}"]`);
   await target.dispatchEvent('dragenter',{dataTransfer:transfer});await target.dispatchEvent('dragover',{dataTransfer:transfer});
   if(!before){await until(async()=>await target.evaluate(n=>n.classList.contains('is-drop-target')));assert.equal(await group(page,3).evaluate(n=>getComputedStyle(n).borderTopWidth),'2px');}
   await shot(page,width,'drop-hover');await source.dispatchEvent('dragend',{dataTransfer:transfer});await transfer.dispose();
   if(!before){await page.getByLabel('搜索收藏').fill('合成铭牌卡片');await until(async()=>await page.locator('.collection-card-category').count()===11);assert.equal(await page.locator('.collection-card-category').count(),11,'search keeps categories');}
  }finally{await context.close();}
 }
 if(!before){
  const chip=await open(390);
  try{
   await chip.page.locator('.collection-chips .collection-chip').filter({hasText:groups[0].name}).click();await chip.page.waitForTimeout(400);
   const entry=await chip.page.evaluate(ids=>({toolbarBottom:document.querySelector('.collection-toolbar').getBoundingClientRect().bottom,firstCardTop:Math.min(...[...document.querySelectorAll('.collection-card-position')].filter(n=>ids.includes(n.dataset.noteId)).map(n=>n.getBoundingClientRect().top)),height:innerHeight}),ids.slice(0,8));
   assert(entry.firstCardTop>=entry.toolbarBottom&&entry.firstCardTop<entry.height-212,'group chip reveals the first card row below the sticky toolbar');
   await chip.page.getByLabel('搜索收藏').fill('目标');
   await chip.page.locator('.collection-chips .collection-chip').filter({hasText:groups[0].name}).click();await chip.page.waitForTimeout(400);
   const search=await chip.page.evaluate(ids=>({toolbarBottom:document.querySelector('.collection-toolbar').getBoundingClientRect().bottom,firstCardTop:Math.min(...[...document.querySelectorAll('.collection-card-position')].filter(n=>ids.includes(n.dataset.noteId)).map(n=>n.getBoundingClientRect().top)),height:innerHeight}),ids.slice(0,7));
   records.push({name:'chip-search',width:390,...search});
   assert(search.firstCardTop>=search.toolbarBottom&&search.firstCardTop<search.height-212,'search chip reveals the first visible card even if the original first card is filtered out');
   assert.equal(await chip.page.locator('.collection-card-category').count(),7,'filtered search keeps card labels');
   await chip.page.getByLabel('搜索收藏').fill('');
   await chip.page.locator('.collection-chips .collection-chip').filter({hasText:groups[3].name}).click();await chip.page.waitForTimeout(400);
   const empty=await chip.page.locator(`[data-empty-group-id="${groups[3].id}"]`).evaluate(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom,toolbarBottom:document.querySelector('.collection-toolbar').getBoundingClientRect().bottom,height:innerHeight}));
   assert(empty.top>=empty.toolbarBottom&&empty.bottom<=empty.height,'empty group chip reveals its drop frame');
   records.push({name:'chip-scroll',width:390,entry,empty});
  }finally{await chip.context.close();}
  const {context,page}=await open(1440);
  try{
   await group(page,1).focus();await page.keyboard.press('Enter');assert.equal(await group(page,1).getAttribute('aria-expanded'),'true');
   await page.keyboard.press('Space');assert.equal(await group(page,1).getAttribute('aria-expanded'),'false');await page.keyboard.press('Enter');
   await page.getByRole('button',{name:'重命名分组：'+groups[1].name,exact:true}).click();
   await page.getByLabel('分组名称',{exact:true}).fill('铭牌改名');await page.getByLabel('分组名称',{exact:true}).press('Enter');
   await until(async()=>(await app.api('/desk-workspace')).groups.some(g=>g.id===groups[1].id&&g.name==='铭牌改名'));
   await page.reload();await group(page,1).waitFor();assert.equal(await group(page,1).locator('.collection-group-name').textContent(),'铭牌改名');
   await group(page,4).dragTo(group(page,1));await until(async()=>JSON.stringify((await app.api('/desk-workspace')).groups.map(g=>g.id))===JSON.stringify(['plate-0','plate-4','plate-1','plate-2','plate-3']));
   await group(page,1).click();
   await page.waitForTimeout(300);
   await page.locator(`[data-note-id="${ids[8]}"] .desk-native-drag`).dragTo(page.locator(`[data-empty-group-id="${groups[3].id}"]`),{sourcePosition:{x:78,y:180},targetPosition:{x:78,y:180}});
   await until(async()=>(await app.api('/desk-workspace')).noteGroupMap[ids[8]]===groups[3].id);
   await until(async()=>await page.locator(`[data-empty-group-id="${groups[3].id}"]`).count()===0);
   assert.equal(await group(page,3).locator('.collection-group-count').textContent(),'1');
   records.push({name:'interactions',keyboard:true,renamePersisted:true,groupReorderPersisted:true,emptyFrameDropPersisted:true});
   const current=await app.api('/desk-workspace'),externalGroup={id:'plate-external-empty',name:'外部拖入空框',kind:'custom'};
   await app.api('/desk-workspace',{workspace:{...current,groups:[...current.groups,externalGroup]},expectedRevision:current.revision},'PUT');
   await page.reload();await page.locator(`[data-empty-group-id="${externalGroup.id}"]`).waitFor();
   for(const [index,selector] of [[20,`[data-empty-group-id="${externalGroup.id}"]`],[21,`.collection-group[data-group-id="${externalGroup.id}"]`]]){
    const note=syntheticNote(index),payload='KANKAN_NOTE:'+JSON.stringify(note);
    const transfer=await page.evaluateHandle(value=>{const data=new DataTransfer();data.setData('application/x-kankan-note',value);data.setData('text/plain',value);return data;},payload);
    const target=page.locator(selector);await target.dispatchEvent('dragenter',{dataTransfer:transfer});await target.dispatchEvent('dragover',{dataTransfer:transfer});await target.dispatchEvent('drop',{dataTransfer:transfer});
    await until(async()=>(await app.api('/notes')).notes.some(n=>n.id===note.id));
    await until(async()=>await page.locator(`[data-note-id="${note.id}"]`).count()===1);
    await until(async()=>(await app.api('/desk-workspace')).noteGroupMap[note.id]==='loose');
    await transfer.dispose();
   }
   records.push({name:'external-drop',emptyFrameImport:true,plateImport:true,originalLooseAssignment:true});
  }catch(e){records.push({name:'interactions-failure',error:e.message});await page.screenshot({path:join(out,'interactions-failure.png'),fullPage:true});throw e;}
  finally{await context.close();}
 }
 assert.deepEqual(errors,[]);console.log('collection-plate375-browser: '+(before?'baseline captured':'all passed'));
}finally{await writeFile(join(out,'report.json'),JSON.stringify({before,records,errors},null,2));await browser.close();await app.close();}

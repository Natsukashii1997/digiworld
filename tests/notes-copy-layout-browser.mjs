import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
const output=process.env.NOTES_COPY_LAYOUT_RESULTS||'test-results/notes-copy-layout';await mkdir(output,{recursive:true});
const candidate=process.env.WORKBENCH_TEST_STATIC_ROOT;process.env.WORKBENCH_TEST_STATIC_ROOT=process.env.NOTES_COPY_BASELINE_DIST||'/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/wb-20261020-575-r1/dist';const original=await fixture();if(candidate)process.env.WORKBENCH_TEST_STATIC_ROOT=candidate;else delete process.env.WORKBENCH_TEST_STATIC_ROOT;const current=await fixture();
const state=seed(),at='2026-10-19T00:00:00Z';state.notes=[{id:'layout-rich',at,format:'md1',text:'[原有颜色]{red}\n7. 原有序号\n9. 非连续序号\n- 无序\n- [x] 完成'},{id:'layout-refined',at,text:'原有炼入按钮',refined:{scrollId:'layout-scroll',entryId:'layout-entry',at}}];state.scrolls=[{id:'layout-scroll',name:'原有很长很长的卷名验证',pinned:false,createdAt:at,entries:[]}];await original.repository.write(state,{initialize:true});await current.repository.write(state,{initialize:true});
const browser=await chromium.launch(),results=[];
const metrics=page=>page.locator('.sn[data-note-id]').evaluateAll(cards=>cards.map(card=>{const box=e=>{if(!e)return null;const b=e.getBoundingClientRect(),c=card.getBoundingClientRect();return [b.x-c.x,b.y-c.y,b.width,b.height].map(v=>Math.round(v*10)/10)};const style=getComputedStyle(card);return{id:card.dataset.noteId,card:[card.offsetWidth,card.offsetHeight],background:style.background,color:style.color,tape:getComputedStyle(card.querySelector('.sn-tape')).display,ink:[...card.querySelectorAll('[data-ink]')].map(e=>getComputedStyle(e).color),header:box(card.querySelector('header')),body:box(card.querySelector('.sn-body')),toolbar:box(card.querySelector('[role=toolbar]')),refined:box(card.querySelector('.sn-refined')),lists:[...card.querySelectorAll('.sn-line')].map(e=>[e.className,e.textContent])};}));
try{
 for(const [route,width,height]of [['#notes',320,1000],['#notes',1440,1000],['#/float',368,600]]){
  const pages=[];for(const app of [original,current]){const p=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});await p.goto(app.url+'/'+route);await p.locator('[data-note-id="layout-rich"]').waitFor();pages.push(p);}
  assert.deepEqual(await metrics(pages[1]),await metrics(pages[0]));results.push(route+' '+width+': original card/header/body geometry, paper/text colors, tape and list rendering unchanged');
  if(route==='#notes'){
   const hit=await pages[1].locator('.sn-refined').evaluate(e=>{const b=e.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('.sn-refined')===e;});assert.ok(hit,'copy must not cover old refined action center');
   for(const p of pages){await p.getByRole('button',{name:/^(记一条新念头|新建普通便签)$/}).click();}
   assert.equal(await pages[1].getByRole('textbox',{name:'便签标题'}).count(),1);for(const p of pages)await p.getByRole('textbox',{name:'随手记内容'}).press('Escape');results.push(route+' '+width+': original entry retained; title field remains functional');
  }
  for(const p of pages)await p.locator('[data-note-id="layout-rich"] .sn-body').click();const toolbar=pages[1].getByRole('toolbar',{name:'随手记格式'});for(const label of ['无序列表','有序列表','任务列表'])assert.equal(await toolbar.getByRole('button',{name:label,exact:true}).count(),1);results.push(route+' '+width+': original bottom toolbar and list controls retained');
  await pages[0].screenshot({path:output+'/'+(route==='#notes'?'before-wall-'+width:'before-native-368')+'.png',fullPage:route==='#notes'});await pages[1].screenshot({path:output+'/'+(route==='#notes'?'wall-'+width:'native-368')+'.png',fullPage:route==='#notes'});for(const p of pages)await p.close();
 }
 await writeFile(output+'/results.json',JSON.stringify(results,null,2));console.log(results.join('\n'));
}finally{await browser.close();await original.close();await current.close();}

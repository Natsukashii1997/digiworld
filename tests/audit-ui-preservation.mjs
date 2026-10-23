import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {fixture183,routes183} from './projects-v16-fixture.mjs';
const out='work/audit602/ui';await mkdir(out,{recursive:true});const b=await chromium.launch(),records=[];
try{
 for(const phase of ['before','after']){
  process.env.WORKBENCH_TEST_STATIC_ROOT=resolve(phase==='before'?'work/audit602/approved-dist':'work/audit602/candidate-dist');const app=await fixture183();
  const state=await app.repository.read();await app.repository.write({...state,notes:[{id:'audit-note',type:'plain',title:'保持现在的便签',text:'正文与排布不变',at:'2026-10-22T00:00:00Z'}]},{expectedRevision:state.revision});
  try{for(const width of [1440,390])for(const route of ['home','notes','learning','projects']){
   const c=await b.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),p=await c.newPage();await routes183(p,app);await p.goto(app.url+'/#'+route);await p.locator('main').waitFor();await p.waitForTimeout(1100);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route+' width '+width);
   const boxes=await p.locator('main h1, .sn-filter, .sn-pad, .sn[data-note-id], .pj-save').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {tag:el.className,x:r.x,y:r.y,w:r.width,h:r.height,font:s.fontFamily,size:s.fontSize,color:s.color,background:s.backgroundColor};}));
   if(phase==='after'){const violations=(await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa']).analyze()).violations;assert.deepEqual(violations,[],route+' accessibility');}
   const file=`${phase}-${route}-${width}.png`;await p.screenshot({path:out+'/'+file,fullPage:true});records.push({phase,route,width,boxes,file});await c.close();
  }}finally{await app.close();}
 }
 for(const after of records.filter(r=>r.phase==='after')){const before=records.find(r=>r.phase==='before'&&r.route===after.route&&r.width===after.width);assert.deepEqual(after.boxes,before.boxes,`${after.route} ${after.width} geometry/style unchanged`);}
 await writeFile(out+'/results.json',JSON.stringify(records,null,2));await writeFile(out+'/report.html','<!doctype html><meta charset="utf-8"><title>A批 UI 保持核验</title><style>body{font:16px system-ui;background:#101522;color:#eee}section{display:flex;gap:16px}img{width:48%;object-fit:contain;object-position:top}</style><h1>A批修复前后：原UI保持</h1>'+['home','notes','learning','projects'].flatMap(route=>[1440,390].map(width=>`<h2>${route} ${width}</h2><section><img src="before-${route}-${width}.png"><img src="after-${route}-${width}.png"></section>`)).join(''));console.log('PASS 16 before/after runtime screenshots, 8 geometry/style comparisons and candidate accessibility');
}finally{await b.close();}

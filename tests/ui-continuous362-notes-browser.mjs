import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
import {replace175} from './notes-editor-helpers175.mjs';
const out=process.env.GUIJI_TEST_RESULTS||'test-results/continuous362-notes';await mkdir(out,{recursive:true});
const app=await fixture(),browser=await chromium.launch(),errors=[],writes=[],records=[];
const state=seed();state.notes=[{id:'legacy',at:'2026-10-05T10:00:00.000Z',text:'- 旧记录不是列表\n[文字]{red}'},...Array.from({length:7},(_,i)=>({id:'extra-'+i,at:'2026-10-04T10:00:00.000Z',text:'合成普通笔记\n'+('按自然高度排布\n'.repeat(i+1))}))];await app.repository.write(state,{initialize:true});const before=(await app.repository.read()).notes;
try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='PUT'&&new URL(r.url()).pathname==='/api/workspace')writes.push(r.url());});
 await page.goto(app.url+'/#notes');const card=page.locator('[data-note-id="legacy"]');await card.waitFor();assert.match(await card.innerText(),/文字/);assert.doesNotMatch(await card.locator('.sn-body').innerText(),/\{red\}|\[文字\]/);assert.equal(await card.locator('li').count(),0);assert.equal(await card.locator('.ink-red').innerText(),'文字');
 await card.hover();await card.getByRole('button',{name:/^复制：/}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'- 旧记录不是列表\n文字');
 await card.locator('.sn-body').click();await page.getByRole('button',{name:'保存修改',exact:true}).click();await page.locator('.sn-cell.editing').waitFor({state:'detached'});
 assert.deepEqual((await app.repository.read()).notes,before,'打开并无改动保存，不迁移原文或format');
 const columns=await page.locator('.sn-wall').evaluate(e=>getComputedStyle(e).columnCount);assert.equal(columns,width===1440?'2':'auto');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.equal(overflow,0);await page.screenshot({path:join(out,'notes-'+width+'.png'),fullPage:true});records.push({width,columns,overflow});await context.close();
}assert.deepEqual(writes,[]);
const edit=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});edit.on('pageerror',e=>errors.push(e.message));await edit.goto(app.url+'/#notes');await edit.locator('[data-note-id="legacy"] .sn-body').click();await replace175(edit,'- 旧记录不是列表\n更新后仍是普通段落');await edit.getByRole('button',{name:'保存修改',exact:true}).click();await edit.locator('.sn-cell.editing').waitFor({state:'detached'});const changed=(await app.repository.read()).notes.find(n=>n.id==='legacy');assert.equal(changed.format,undefined,'只改旧字色便签的段落不把旧前缀迁成md1列表');assert.equal(await edit.locator('[data-note-id="legacy"] li').count(),0);await edit.close();
assert.deepEqual(errors,[]);await writeFile(join(out,'report.json'),JSON.stringify({records,writes,errors,legacyEdit:changed},null,2));console.log('continuous362-notes-browser: all passed');}finally{await browser.close();await app.close();}

import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
import {replace175,editor175,select175} from './notes-editor-helpers175.mjs';
const app=await fixture(),browser=await chromium.launch(),output=process.env.NOTES_COPY_RESULTS||'test-results/notes-copy';
await mkdir(output,{recursive:true});
const initial=seed(),text='[红]{red}[蓝]{blue}[绿]{green}[黄]{yellow}[灰]{gray}\n\n7. 七\n9. 九\n- 无序\n- [ ] 未办\n- [x] 已办\n<&🙂';
initial.notes=[{id:'copy-rich',at:'2026-10-19T00:00:00Z',format:'md1',text},{id:'copy-long',at:'2026-10-18T00:00:00Z',text:'长文\n'.repeat(500)}];await app.repository.write(initial,{initialize:true});
const results=[],errors=[];
try{
 const context=await browser.newContext({permissions:['clipboard-read','clipboard-write'],viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const clipboard=()=>page.evaluate(async()=>{const items=await navigator.clipboard.read(),result={};for(const type of items[0].types)result[type]=await (await items[0].getType(type)).text();return result;});
 for(const route of ['#notes','#/float']){
  await page.goto(app.url+'/?copyTest='+encodeURIComponent(route)+route);const card=page.locator('[data-note-id="copy-rich"]');await card.waitFor();const before=await app.repository.read();
  await card.getByRole('button',{name:'复制便签（含格式）',exact:true}).click();await card.getByRole('status').filter({hasText:'已复制（含格式）'}).waitFor();const copied=await clipboard();
  assert.ok(copied['text/plain'].includes('7. 七\n9. 九'));assert.ok(copied['text/html'].includes('value="9"'));assert.ok(copied['text/html'].includes('☑'));assert.ok(copied['text/html'].includes('#ff6b6b'));assert.ok(!copied['text/plain'].includes('{red}'));
  assert.deepEqual((await app.repository.read()).notes,before.notes);results.push(route+': actual clipboard HTML/plain, copy does not write notes');
  await page.evaluate(()=>{const target=document.createElement('div');target.id='rich-paste-target';target.contentEditable='true';target.setAttribute('aria-label','合成富文本粘贴目标');document.body.append(target);target.focus();});
  await page.keyboard.press('Meta+v');const target=page.locator('#rich-paste-target');await target.locator('ol').waitFor();assert.equal(await target.locator('ol li').count(),2);assert.ok((await target.innerText()).includes('☑'));assert.ok(await target.locator('[style*="color"]').count()>=5);await target.evaluate(e=>e.remove());results.push(route+': actual paste into rich text target retains lists/colors/task state');
  await page.locator('[data-note-id="copy-long"]').getByRole('button',{name:'复制便签（含格式）'}).click();await page.locator('[data-note-id="copy-long"] [role=status]').filter({hasText:'已复制（含格式）'}).waitFor();assert.equal((await clipboard())['text/plain'],'长文\n'.repeat(500));results.push(route+': collapsed long card copies full text');
  await card.locator('.sn-body').click();await replace175(page,'编辑未保存🙂');const revision=(await app.repository.read()).revision;
  await card.getByRole('button',{name:'复制便签（含格式）',exact:true}).click();await card.getByRole('status').filter({hasText:'已复制（含格式）'}).waitFor();assert.equal((await clipboard())['text/plain'],'编辑未保存🙂');assert.equal(await editor175(page).count(),1);assert.equal(await editor175(page).evaluate(e=>e===document.activeElement),true);if(route==='#notes')assert.equal((await app.repository.read()).revision,revision);results.push(route+': flushes live edits, preserves editor/focus, no outside-click save');
  await editor175(page).dispatchEvent('compositionstart',{data:''});const prior=(await clipboard())['text/plain'];const button=card.getByRole('button',{name:'复制便签（含格式）',exact:true});
  if(!await button.isDisabled()){await button.click();await card.getByRole('status').filter({hasText:'中文输入尚未完成'}).waitFor();}assert.equal((await clipboard())['text/plain'],prior);await editor175(page).dispatchEvent('compositionend',{data:''});await page.waitForTimeout(40);results.push(route+': IME refuses copying stale content');
  if(route==='#notes'){await editor175(page).press('Escape');}else{await page.getByRole('button',{name:'收起便签栏',exact:true}).click();await page.getByRole('button',{name:'打开便签栏',exact:true}).click();}
 }
 // Fresh context avoids the floating-page recovery lock and verifies denial is never called success.
 const denied=await browser.newContext({viewport:{width:320,height:800},reducedMotion:'reduce'}),p=await denied.newPage();await p.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{write:async()=>{throw Error('合成剪贴板拒绝');}}}));await p.goto(app.url+'/#notes');const rich=p.locator('[data-note-id="copy-rich"]');await rich.getByRole('button',{name:'复制便签（含格式）'}).click();await rich.getByRole('status').filter({hasText:'合成剪贴板拒绝'}).waitFor();assert.equal(await rich.getByText('已复制（含格式）',{exact:true}).count(),0);results.push('denied clipboard gives failure, never success');
 for(const width of [320,390,700,1440]){await p.setViewportSize({width,height:1000});for(const c of await p.locator('.sn[data-note-id]').all()){const bounds=await c.evaluate(e=>{const r=e.getBoundingClientRect(),b=e.querySelector('.sn-copy').getBoundingClientRect();return{w:b.width,h:b.height,left:b.left-r.left,right:r.right-b.right,top:b.top-r.top,bottom:r.bottom-b.bottom};});assert.ok(bounds.w>=44&&bounds.h>=44);assert.ok(bounds.right<35&&bounds.top<35,bounds);assert.ok(bounds.bottom>=0);}assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await p.setViewportSize({width:320,height:1000});await p.screenshot({path:output+'/notes-320.png',fullPage:true});results.push('320/390/700/1440: always-visible top-right 44px controls, no overflow');
 assert.deepEqual(errors,[]);await writeFile(output+'/results.json',JSON.stringify(results,null,2));console.log(results.join('\n'));
}finally{await browser.close();await app.close();}

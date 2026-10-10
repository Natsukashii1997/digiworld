import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
const browser=await chromium.launch(),app=await fixture(),out=process.env.GUIJI_TEST_RESULTS||'test-results/audit-navigation';
await mkdir(out,{recursive:true});
try {
 await app.repository.write(seed(),{initialize:true});
 for(const width of [320,390]) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(app.url+'/#settings');await page.locator('.settings-scroll-cue').waitFor();
  const settings=page.getByRole('radiogroup',{name:'设置分类',exact:true}),first=settings.getByRole('radio').first(),last=settings.getByRole('radio').last();
  await first.focus();await first.press('End');assert.equal(await last.evaluate(e=>document.activeElement===e),true);
  let box=await last.boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=width+1,'settings focused last item visible');
  await page.screenshot({path:join(out,`settings-navigation-${width}.png`),fullPage:true});
  await page.goto(app.url+'/#agents');await page.locator('.agent-scroll-cue').waitFor();
  const codex=page.locator('.cast [data-agent=codex]');await codex.focus();await codex.press('ArrowRight');await page.locator('.cast [data-agent=hermes]').press('ArrowRight');const openclaw=page.locator('.cast [data-agent=openclaw]');
  assert.equal(await openclaw.evaluate(e=>document.activeElement===e),true);assert.equal(await openclaw.getAttribute('aria-checked'),'true');box=await openclaw.boundingBox();await page.waitForFunction(()=>{const b=document.querySelector('.cast [data-agent=openclaw]').getBoundingClientRect();return b.x>=-1&&b.right<=innerWidth+1;},{},{timeout:2000}).catch(async e=>{console.log('settled',await page.evaluate(()=>({box:document.querySelector('.cast [data-agent=openclaw]').getBoundingClientRect().toJSON(),innerWidth,scrollLeft:document.querySelector('.cast').scrollLeft,selected:document.querySelector('.cast [aria-checked=true]')?.dataset.agent,scale:window.visualViewport.scale,snap:getComputedStyle(document.querySelector('.cast')).scrollSnapType,focused:document.activeElement?.dataset.agent})));await page.screenshot({path:join(out,`agent-focus-failed-${width}.png`),fullPage:true});throw e;});box=await openclaw.boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=width+1,'agent focused last item visible '+JSON.stringify(box));
  await page.getByText('左右滑动选伙伴 · 4 / 4',{exact:true}).waitFor();await page.screenshot({path:join(out,`agents-navigation-${width}.png`),fullPage:true});assert.deepEqual(errors,[]);await context.close();
 }
 console.log('audit-navigation-browser PASS: 320/390 cues, keyboard selection and visible focus');
}finally {await app.close();await browser.close();}

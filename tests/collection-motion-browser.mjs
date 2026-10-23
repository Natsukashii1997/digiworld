import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';
const app = await collectionFixture();
const browser = await chromium.launch();

try {
  await app.importNote(syntheticNote(1));
  for (const initial of ['no-preference', 'reduce']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: initial });
    const page = await context.newPage();
    await page.route('**/*', route => {
      assert.equal(new URL(route.request().url()).origin, app.url);
      return route.continue();
    });
    await page.goto(app.url + '/#learning');
    const moving = page.locator('.collection-card-breathe').first();
    await moving.waitFor();
    await page.waitForTimeout(2800);
    const sample = () => moving.evaluate(node => getComputedStyle(node).transform);
    const geometry=await page.locator('.collection-card-position').first().evaluate(node=>{
      const outer=new DOMMatrix(getComputedStyle(node).transform),float=new DOMMatrix(getComputedStyle(node.querySelector('.collection-card-breathe')).transform);
      return {rotation:Math.atan2(outer.b,outer.a),scale:Math.hypot(outer.a,outer.b),floatScale:Math.hypot(float.a,float.b)};
    });
    assert.ok(Math.abs(geometry.rotation)>0.01,'未分组卡片应保留原版确定性随机角度');
    assert.ok(Math.abs(geometry.scale-1)<0.0001&&Math.abs(geometry.floatScale-1)<0.0001,'卡片呼吸不得持续缩放字形');
    const a = await sample();
    await page.waitForTimeout(550);
    const b = await sample();
    await page.emulateMedia({ reducedMotion: initial === 'reduce' ? 'no-preference' : 'reduce' });
    await page.waitForTimeout(700);
    let c = await sample();
    await page.waitForTimeout(550);
    let d = await sample();
    // Loose cards retain a deterministic phase delay of up to 3s after motion resumes.
    // Observe actual movement within that bound instead of assuming it starts in 700ms.
    let resumedAfterMs=1250;
    if(initial==='reduce') {
      for(let i=0;i<40&&c===d;i++) {c=d;await page.waitForTimeout(100);d=await sample();resumedAfterMs+=100;}
    }
    console.log(JSON.stringify({ initial, a, b, c, d, resumedAfterMs }));
    if (initial === 'no-preference') {
      assert.notEqual(a, b, 'Baseline card must actually float');
      assert.equal(c, d, 'Runtime reduce must stop actual JS floating');
    } else {
      assert.equal(a, b, 'Initial reduce must be static');
      assert.notEqual(c, d, 'Runtime no-preference must restore floating');
    }
    await context.close();
  }
  console.log('PASS reduced-motion runtime transitions in both directions');
} finally {
  await browser.close();
  await app.close();
}

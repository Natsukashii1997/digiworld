import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './fixture.mjs';
import { seed } from '../src/store.js';
import { createScroll, addEntry } from '../src/scrolls.js';
import { axe } from './ui-v14-checks.mjs';

const out = process.env.SCROLL_NAMED_RESULTS || 'test-results/scrolls-named';
const before = process.env.SCROLL_NAMED_CAPTURE_ONLY === 'before';
await mkdir(out, {recursive:true});
const app = await fixture();
const made = createScroll([], '心法');
const old = addEntry(made.scrolls, made.scroll.id, '旧判断\n历史正文', ['旧标签', '保留']);
old.entry.uses = 3;
await app.repository.write({...seed(), scrolls:old.scrolls}, {initialize:true});
const browser = await chromium.launch();
const errors = [], metrics = [];
const saved = async () => (await app.repository.read()).scrolls[0];
try {
  for (const width of before ? [1440,390] : [1440,390,320]) {
    const context = await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
    const page = await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(app.url+'/#assets');
    await page.getByRole('button',{name:'打开卷 心法',exact:true}).click();
    const detail = page.getByRole('dialog',{name:'焚决详情'});
    await detail.waitFor();
    if (before) {
      await page.screenshot({path:join(out,`form-${width}.png`),fullPage:false});
      await context.close(); continue;
    }
    assert.equal(await detail.locator('.entry-composer input').count(),1);
    assert.equal(await detail.locator('.entry-composer textarea').count(),1);
    assert.equal(await detail.getByLabel('新条目名称').getAttribute('maxlength'),'60');
    assert.equal(await detail.getByLabel('新条目提示词全文').getAttribute('maxlength'),'20000');
    assert.equal(await detail.locator('.tag-filter,.entry-tags,[aria-label="新条目标签"]').count(),0);
    const geometry = await detail.locator('.entry-composer').evaluate(el=>({overflow:document.documentElement.scrollWidth>innerWidth,inputHeight:el.querySelector('input').getBoundingClientRect().height,buttonHeight:el.querySelector('button').getBoundingClientRect().height}));
    assert.equal(geometry.overflow,false);
    assert.ok(geometry.inputHeight>=44 && geometry.buttonHeight>=44);
    metrics.push({width,...geometry});
    await axe(page,`scroll-named-${width}`);
    await page.screenshot({path:join(out,`form-${width}.png`),fullPage:false});
    if (width !== 1440) {await context.close();continue;}
    const title = detail.getByLabel('新条目名称'),body=detail.getByLabel('新条目提示词全文'),add=detail.getByRole('button',{name:'加入此卷',exact:true});
    assert.equal(await add.isEnabled(),false);
    await title.fill('独立专用名称');assert.equal(await add.isEnabled(),false);
    await body.fill('   ');assert.equal(await add.isEnabled(),false);
    const full='  名称不属于复制正文\n第二行\n';
    await body.fill(full);await add.click();
    await detail.getByRole('heading',{name:'独立专用名称',exact:true}).waitFor();
    let record=(await saved()).entries.find(e=>e.name==='独立专用名称');
    assert.equal(record.text,full);assert.deepEqual(record.tags,[]);
    assert.equal(await title.inputValue(),'');assert.equal(await body.inputValue(),'');
    await detail.getByRole('button',{name:'复制条目：独立专用名称',exact:true}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.scroll-entry')].some(el=>el.querySelector('.entry-name')?.textContent==='独立专用名称' && el.querySelector('.entry-uses-count')?.textContent==='1'));
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),full);
    // 旧条目只有显示时派生名称，取消编辑不迁移，保存时补名且保留历史字段。
    await detail.getByRole('button',{name:'编辑条目：旧判断',exact:true}).click();
    assert.equal(await detail.getByLabel('编辑条目名称').inputValue(),'旧判断');
    assert.equal(await detail.getByLabel('编辑条目提示词全文').inputValue(),old.entry.text);
    await detail.getByLabel('编辑条目名称').fill('暂存候选');
    await detail.locator('.entry-edit').getByRole('button',{name:'取消',exact:true}).click();
    assert.equal('name' in (await saved()).entries[0],false);
    await detail.getByRole('button',{name:'编辑条目：旧判断',exact:true}).click();
    await detail.getByLabel('编辑条目名称').fill('证据校准');
    await detail.getByRole('button',{name:'保存条目',exact:true}).click();
    await detail.getByRole('heading',{name:'证据校准',exact:true}).waitFor();
    record=(await saved()).entries[0];
    assert.equal(record.id,old.entry.id);assert.equal(record.name,'证据校准');assert.equal(record.text,old.entry.text);assert.equal(record.uses,3);assert.deepEqual(record.tags,old.entry.tags);
    await detail.getByRole('button',{name:'关闭',exact:true}).click();
    const card=page.locator('.scroll-card');
    assert.deepEqual(await card.locator('.scroll-preview-heading h4').allTextContents(),['证据校准','独立专用名称']);
    assert.equal(await card.locator('.scroll-preview-tags,.card-tags').count(),0);
    await card.locator(`[data-scroll-entry-id="${record.id}"] .scroll-preview-copy`).click();
    await card.locator(`[data-scroll-entry-id="${record.id}"] .scroll-preview-uses`).filter({hasText:'4'}).waitFor();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),old.entry.text);
    await page.reload();await card.getByRole('heading',{name:'证据校准',exact:true}).waitFor();
    assert.equal((await saved()).entries[1].text,full);
    await page.getByLabel('在资产中搜索').fill('独立专用名称');assert.equal(await card.count(),1);
    await page.getByLabel('在资产中搜索').fill('旧标签');await card.waitFor({state:'detached'});
    await page.getByLabel('在资产中搜索').fill('');
    await page.getByRole('combobox',{name:'按标签筛选'}).selectOption({index:1});
    await page.getByRole('group',{name:'资产类型'}).getByRole('button',{name:/^焚决/}).click();
    await card.waitFor();assert.equal(await page.getByRole('combobox',{name:'按标签筛选'}).count(),0);
    await page.getByRole('group',{name:'资产类型'}).getByRole('button',{name:/^全部/}).click();
    assert.equal(await page.getByRole('combobox',{name:'按标签筛选'}).inputValue(),'');
    await context.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(join(out,'results.json'),JSON.stringify({before,metrics,errors},null,2));
  console.log('PASS 两框/必填/名称与正文分离/旧条目取消与补名/保留历史标签计次/内外复制/刷新/名称搜索/无标签筛选/三宽axe');
} finally {await browser.close();await app.close();}

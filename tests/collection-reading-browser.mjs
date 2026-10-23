import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';
const out=resolve(process.env.GUIJI_TEST_RESULTS||'work/collection-reading');await mkdir(out,{recursive:true});
const segments=Array.from({length:42},(_,i)=>({start:i*55,duration:40,text:`文稿第${i+1}段：${'这是完整保留的知识讲解，用于验证连续阅读。'.repeat(8)}${i===41?'末尾文稿可直接读到':''}`}));
const body='正文的连续阅读内容。'.repeat(310)+'正文终点可直接读到';
const app=await collectionFixture({fetchImpl:async url=>String(url).includes('missing')?new Response('missing',{status:404}):new Response('fixture',{headers:{'content-type':String(url).endsWith('.mp4')?'video/mp4':'image/png'}}),ocrRunner:async paths=>paths.map((path,i)=>({path,text:i===0?'封面页标题文字':`第${i+1}页内容文字`})),analyzer:async()=>({duration:2353.6,transcriptSegments:segments,speechError:'中间一段转写失败，当前文稿不完整'})});
const browser=await chromium.launch();
try {
 const video=syntheticNote(901,{type:'video',title:'长视频连续阅读',content:body,videoUrl:'https://video.xhscdn.com/fixture.mp4'});
 const empty=syntheticNote(902,{type:'video',title:'无文稿视频',content:'',videoUrl:'https://video.xhscdn.com/missing.mp4'});
 const image=syntheticNote(903,{title:'图文连续阅读',content:body,imageUrls:[1,2,3].map(i=>`https://image.xhscdn.com/reading-${i}.jpg`)});
 for(const n of [video,empty,image]){const result=await app.importNote(n);assert.equal(result.status,'complete',JSON.stringify(result));}
 for(const width of [1440,390]) {
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});const page=await context.newPage();await page.goto(app.url+'/#learning');
  await page.getByLabel('搜索收藏').fill(video.title);await page.getByRole('button',{name:'阅读收藏：'+video.title}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();
  await page.screenshot({path:resolve(out,`video-top-${width}.png`)});
  assert.equal(await dialog.getByRole('radio',{name:'图片文字',exact:true}).count(),0,'视频不显示封面OCR板块');
  assert.equal(await dialog.getByRole('button',{name:/^(上一页|下一页)$/}).count(),0,'阅读不分页');
  assert.equal(await dialog.locator('.collection-transcript-segment').count(),segments.length,'全部文稿段落可直接滚动');
  await dialog.getByText('中间一段转写失败，当前文稿不完整',{exact:true}).waitFor();
  const last=dialog.locator('.collection-transcript-segment').last();await last.scrollIntoViewIfNeeded();assert.ok(await last.isVisible());assert.match(await last.innerText(),/末尾文稿可直接读到/);
  await page.screenshot({path:resolve(out,`video-end-${width}.png`)});
  await dialog.locator('.collection-reader-info').evaluate(e=>e.scrollTop=0);assert.equal(await dialog.getByRole('radio',{name:/^(笔记正文|正文|内容文稿)$/}).count(),0,'视频只保留视频文稿');assert.equal(await dialog.getByText('正文终点可直接读到',{exact:false}).count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.keyboard.press('Escape');
  await page.getByLabel('搜索收藏').fill(empty.title);await page.getByRole('button',{name:'阅读收藏：'+empty.title}).click();await dialog.waitFor();assert.equal(await dialog.getByRole('radio',{name:'图片文字',exact:true}).count(),0);assert.equal(await dialog.getByText('图片识别：独有关键词像素收藏',{exact:false}).count(),0);await page.keyboard.press('Escape');
  await page.getByLabel('搜索收藏').fill(image.title);await page.getByRole('button',{name:'阅读收藏：'+image.title}).click();await dialog.waitFor();assert.equal(await dialog.getByRole('radio',{name:'内容文稿',exact:true}).getAttribute('aria-checked'),'true');assert.equal(await dialog.getByRole('radio',{name:/^(正文|图片文字)$/}).count(),0);assert.deepEqual(await dialog.locator('.collection-content-page-label').allInnerTexts(),['P2','P3'],'内容文稿按图分页，页码与画廊图号一致');assert.deepEqual(await dialog.locator('.collection-content-page .collection-reader-body').allInnerTexts(),['第2页内容文字','第3页内容文字'],'内容文稿去掉封面页文字且不含帖子正文');assert.equal(await dialog.getByRole('button',{name:/^(上一页|下一页)$/}).count(),0);await context.close();console.log('PASS continuous video/text and image OCR',width);
 }
} finally {await browser.close();await app.close();}

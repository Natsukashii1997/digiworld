import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';

// #107：收藏先存卡片、图片文字后台补。详情「内容文稿」识别中显示提示，识别完由页面轮询自动换成文字。
const out=resolve(process.env.GUIJI_TEST_RESULTS||'work/collection-ocr-pending');await mkdir(out,{recursive:true});
let open;const opened=new Promise(resolve=>{open=resolve;});
const app=await collectionFixture({ocrRunner:async paths=>{await opened;return paths.map(path=>({path,text:'后台补上的图片文字'}));}});
const browser=await chromium.launch();
try {
  const note=syntheticNote(907,{title:'后台识别图文',imageUrls:['https://image.xhscdn.com/p1.png']});
  assert.equal((await app.importNote(note,crypto.randomUUID(),{waitOcr:false})).mediaStatus,'pending');
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();
  await page.goto(app.url+'/#learning');
  await page.getByLabel('搜索收藏').fill(note.title);await page.getByRole('button',{name:'阅读收藏：'+note.title}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  await dialog.getByText('图片文字识别中…',{exact:true}).waitFor();
  assert.equal(await dialog.getByText('这条笔记没有识别到图片文字。').count(),0);
  await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:resolve(out,'pending-1440.png')});
  open();
  await dialog.getByText('后台补上的图片文字',{exact:true}).waitFor({timeout:10000});
  assert.equal(await dialog.getByText('图片文字识别中…').count(),0);
  await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:resolve(out,'ready-1440.png')});
  console.log('collection-ocr-pending-browser: ok',out);
} finally {open();await browser.close();await app.close();}

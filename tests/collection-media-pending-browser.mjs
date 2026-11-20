import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';

// #107 / #109：收藏先存卡片，图片文字和视频文稿由后台补。
// 详情里识别 / 转写中显示提示，补完由页面轮询自动换成内容。
const out=resolve(process.env.GUIJI_TEST_RESULTS||'work/collection-media-pending');await mkdir(out,{recursive:true});
let open;const opened=new Promise(resolve=>{open=resolve;});
const app=await collectionFixture({
  fetchImpl:async url=>new Response(Buffer.from('fixture'),{headers:{'content-type':String(url).endsWith('.mp4')?'video/mp4':'image/png'}}),
  ocrRunner:async paths=>{await opened;return paths.map(path=>({path,text:'后台补上的图片文字'}));},
  analyzer:async()=>{await opened;return {duration:2,transcriptSegments:[{start:0,duration:2,text:'后台补上的视频文稿'}]};},
});
const browser=await chromium.launch();
try {
  const image=syntheticNote(907,{title:'后台识别图文',imageUrls:['https://image.xhscdn.com/p1.png']});
  const video=syntheticNote(908,{title:'后台转写视频',type:'video',videoUrl:'https://video.xhscdn.com/v908.mp4'});
  assert.equal((await app.importNote(image,crypto.randomUUID(),{waitBackground:false})).mediaStatus,'pending');
  assert.equal((await app.importNote(video,crypto.randomUUID(),{waitBackground:false})).videoStatus,'pending');
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const page=await context.newPage();
  await page.goto(app.url+'/#learning');
  const dialog=page.getByRole('dialog');
  const openNote=async title=>{await page.getByLabel('搜索收藏').fill(title);await page.getByRole('button',{name:'阅读收藏：'+title}).click();await dialog.waitFor();};
  await openNote(image.title);
  await dialog.getByText('图片文字识别中…',{exact:true}).waitFor();
  assert.equal(await dialog.getByText('这条笔记没有识别到图片文字。').count(),0);
  await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:resolve(out,'image-pending-1440.png')});
  await page.keyboard.press('Escape');
  await openNote(video.title);
  await dialog.getByText('视频文稿转写中…',{exact:true}).waitFor();
  assert.equal(await dialog.getByText('这条视频没有识别到可转写的语音。').count(),0);
  assert.equal(await dialog.locator('video').count(),1,'转写中本地视频已可播放');
  await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:resolve(out,'video-pending-1440.png')});
  open();
  await dialog.getByText('后台补上的视频文稿',{exact:true}).waitFor({timeout:10000});
  assert.equal(await dialog.getByText('视频文稿转写中…').count(),0);
  await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:resolve(out,'video-ready-1440.png')});
  await page.keyboard.press('Escape');
  await openNote(image.title);
  await dialog.getByText('后台补上的图片文字',{exact:true}).waitFor({timeout:10000});
  await page.screenshot({path:resolve(out,'image-ready-1440.png')});
  console.log('collection-media-pending-browser: ok',out);
} finally {open();await browser.close();await app.close();}

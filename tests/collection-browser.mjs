import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';
const out=process.env.GUIJI_TEST_RESULTS||'test-results/collection';await mkdir(out,{recursive:true});
const image=await readFile('tests/collection-assets/upstream-reference.jpg');
const app=await collectionFixture({fetchImpl:async url=>{assert.ok(String(url).startsWith('https://image.xhscdn.com/'));return new Response(image,{headers:{'content-type':'image/jpeg'}});}}),browser=await chromium.launch(),errors=[];
async function open(width){const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>{assert.equal(new URL(route.request().url()).origin,app.url);return route.continue();});await page.goto(app.url+'/#learning');await page.getByRole('heading',{name:'收藏',level:1}).waitFor();await page.locator('.collection-canvas').waitFor();return page;}
async function axe(page,label){const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(result.violations.map(v=>({label,id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);}
async function noOverflow(page,label){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+'横向溢出');}
async function until(check){for(let i=0;i<100;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('状态未收敛');}
try {
  let page=await open(1440);await page.getByText('暂无收藏',{exact:true}).waitFor();await axe(page,'empty');await page.screenshot({path:join(out,'empty-1440.png')});await page.context().close();
  for(let i=1;i<=6;i++)assert.equal((await app.importNote(syntheticNote(i,{title:['一张值得反复阅读的编程开发笔记保留完整两行标题','白色相纸边框','工作流收藏','给未来自己的设计','像素世界中的日常','把想法收进画布'][i-1]}))).status,'complete');
  const desk=await app.api('/desk-workspace'),group={id:'custom:canvas-fixture',kind:'custom',name:'编程开发'};await app.api('/desk-workspace',{workspace:{...desk,groups:[...desk.groups,group],noteGroupMap:Object.fromEntries((await app.api('/notes')).notes.map((n,i)=>[n.id,i<4?group.id:'loose']))},expectedRevision:desk.revision},'PUT');
  await app.api('/notes/categories',{updates:Object.fromEntries((await app.api('/notes')).notes.map(n=>[n.id,'编程开发']))},'PATCH');
  const looseIds=Object.entries((await app.api('/desk-workspace')).noteGroupMap).filter(([,groupId])=>groupId==='loose').map(([id])=>id);
  for(const width of [320,375,390,430,1024,1440]) {
    page=await open(width);await page.locator('.collection-paper').first().waitFor();await noOverflow(page,'canvas '+width);
    const frames=await page.locator('.collection-paper').evaluateAll(nodes=>nodes.map(node=>({background:getComputedStyle(node).backgroundColor,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})));assert.ok(frames.every(f=>f.background==='rgb(255, 255, 255)'));assert.ok(frames.every(f=>f.width>120&&f.height>150));
    await until(async()=>await page.locator('.collection-paper img').evaluateAll(images=>images.length===6&&images.every(image=>image.complete&&image.naturalWidth>0)));
    assert.ok(await page.locator('.collection-paper img').evaluateAll(images=>images.length===6&&images.every(image=>image.complete&&image.naturalWidth>0)));
    const typography=await page.locator('.collection-paper').evaluateAll(nodes=>nodes.map(node=>{
      const category=node.querySelector('.collection-card-category'),title=node.querySelector('.collection-card-title'),image=node.querySelector('img');
      const labelStyle=category?getComputedStyle(category):null,titleStyle=getComputedStyle(title);
      return {category:category?.textContent.trim()??null,labelFont:labelStyle?parseFloat(labelStyle.fontSize):null,labelLine:labelStyle?parseFloat(labelStyle.lineHeight):null,labelHeight:category?.clientHeight,labelScroll:category?.scrollHeight,titleLine:parseFloat(titleStyle.lineHeight),titleHeight:title.clientHeight,filter:getComputedStyle(image).filter,paperHeight:node.clientHeight,paperScroll:node.scrollHeight};
    }));
    assert.equal(typography.filter(t=>t.category!==null).length,looseIds.length,'分组内不重复显示分类，游离卡片保留分类');
    assert.ok(typography.filter(t=>t.category!==null).every(t=>t.category==='编程开发'&&t.labelFont>=12&&t.labelLine>=18&&t.labelScroll<=t.labelHeight),'保留的分类字形不得被等高行盒裁剪');
    assert.ok(typography.every(t=>t.titleLine===19&&t.titleHeight===38&&t.filter==='none'&&t.paperHeight===212&&t.paperScroll<=t.paperHeight),'两行标题、原图和相纸边框应保留完整空间');
    const loose=page.locator(looseIds.map(id=>`.collection-card-position[data-note-id="${id}"]`).join(', '));
    const angles=await loose.evaluateAll(nodes=>nodes.map(node=>{const matrix=new DOMMatrix(getComputedStyle(node).transform);return Math.atan2(matrix.b,matrix.a);}));
    assert.ok(angles.every(angle=>Math.abs(angle)>0.01)&&Math.abs(angles[0]-angles[1])>0.05,'未分组笔记应错落旋转，不是方正网格');
    const hoverCard=loose.first(),geometry=()=>hoverCard.evaluate(node=>{const b=node.getBoundingClientRect(),m=new DOMMatrix(getComputedStyle(node).transform);return {width:b.width,height:b.height,rotation:Math.atan2(m.b,m.a),scale:Math.hypot(m.a,m.b)};});
    await hoverCard.scrollIntoViewIfNeeded();const before=await geometry();await hoverCard.hover();await page.waitForTimeout(250);const after=await geometry();
    assert.ok(Math.abs(before.width-after.width)<0.1&&Math.abs(before.height-after.height)<0.1&&Math.abs(before.rotation-after.rotation)<0.001&&Math.abs(after.scale-1)<0.001,'悬停保留倾斜与字形尺寸，只轻微抬起');
    await page.getByLabel('搜索收藏').hover();
    assert.ok(await page.getByRole('button',{name:'新建分组',exact:true}).evaluate(node=>node.closest('.collection-toolbar') && !node.closest('.collection-canvas')),'新建分组应在上沿控制轨，不浮盖卡片');
    await axe(page,'canvas '+width);await page.screenshot({path:join(out,'stack-'+width+'.png'),fullPage:true});
    await page.getByRole('button',{name:/分组：/}).first().click();await noOverflow(page,'expanded '+width);
    const groupLabel=await page.locator('.collection-group').first().evaluate(node=>({height:node.clientHeight,lines:[...node.querySelectorAll(':scope > div > div')].map(n=>getComputedStyle(n).whiteSpace)}));
    assert.ok(groupLabel.height<=54&&groupLabel.lines.every(value=>value==='nowrap'),'窄屏组名和计数不得换行增高并遮住卡片');
    const rename=page.getByRole('button',{name:/重命名分组：/}).first();
    assert.ok(await rename.evaluate(node=>{const button=node.getBoundingClientRect(),canvas=node.closest('.collection-canvas').getBoundingClientRect();return button.left>=canvas.left&&button.right<=canvas.right&&button.width>=44;}),'展开组签的编辑按钮必须完整位于画布内');
    await axe(page,'expanded '+width);await page.screenshot({path:join(out,'expanded-'+width+'.png'),fullPage:true});
    const first=page.locator('.collection-card-position').first();await first.scrollIntoViewIfNeeded();await first.click();const dialog=page.getByRole('dialog');await dialog.waitFor();await noOverflow(page,'reader '+width);await axe(page,'reader '+width);assert.match(await dialog.innerText(),/图片识别：独有关键词像素收藏/);await page.screenshot({path:join(out,'reader-'+width+'.png'),fullPage:true});await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
    await page.getByLabel('搜索收藏').fill('像素收藏');await until(async()=>await page.locator('.collection-paper').count()>0);assert.ok(await page.locator('.collection-paper').count());await page.getByLabel('搜索收藏').fill('不存在的关键词ABC');await until(async()=>await page.locator('.collection-paper').count()===0);await page.getByLabel('搜索收藏').fill('');
    await page.context().close();
  }
  page=await open(1440);await page.getByRole('button',{name:'新建分组'}).click();const input=page.getByLabel('分组名称',{exact:true});await input.fill('我的灵感');await page.getByRole('button',{name:'保存分组名称'}).click();await until(async()=>(await app.api('/desk-workspace')).groups.some(g=>g.name==='我的灵感'));await page.reload();await page.getByRole('button',{name:/分组：我的灵感/}).waitFor();
  let failDeskSave=true;
  await page.route('**/api/collection/desk-workspace',route=>route.request().method()==='PUT'&&failDeskSave?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'合成断网：草稿未保存'})}):route.continue());
  await page.getByRole('button',{name:'新建分组'}).click();await input.fill('断网草稿');await page.getByRole('button',{name:'保存分组名称'}).click();await page.getByRole('alert').filter({hasText:'合成断网'}).waitFor();assert.ok(!(await app.api('/desk-workspace')).groups.some(g=>g.name==='断网草稿'));
  await page.reload();await page.getByRole('button',{name:'恢复草稿',exact:true}).waitFor();failDeskSave=false;await page.getByRole('button',{name:'恢复草稿',exact:true}).click();await until(async()=>(await app.api('/desk-workspace')).groups.some(g=>g.name==='断网草稿'));assert.equal(await page.evaluate(()=>localStorage.getItem('digital-world:collection-draft:v2')),null);
  failDeskSave=true;await page.getByRole('button',{name:'新建分组'}).click();await input.fill('冲突草稿');await page.getByRole('button',{name:'保存分组名称'}).click();await page.getByRole('alert').filter({hasText:'合成断网'}).waitFor();const changed=await app.api('/desk-workspace');await app.api('/desk-workspace',{workspace:changed,expectedRevision:changed.revision},'PUT');await page.reload();await page.getByRole('button',{name:'恢复草稿',exact:true}).click();await page.getByRole('alert').filter({hasText:'不能覆盖'}).waitFor();assert.ok(!(await app.api('/desk-workspace')).groups.some(g=>g.name==='冲突草稿'));page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'丢弃草稿并读取',exact:true}).click();assert.ok(await page.getByRole('button',{name:'恢复草稿',exact:true}).count());page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'丢弃草稿并读取',exact:true}).click();await page.getByRole('button',{name:'恢复草稿',exact:true}).waitFor({state:'hidden'});failDeskSave=false;
  await page.getByRole('button',{name:'插件',exact:true}).click();await page.getByRole('dialog',{name:'浏览器插件'}).waitFor();await axe(page,'extension');await page.getByRole('button',{name:'生成插件配对码'}).click();await until(async()=>(await page.getByLabel('插件配对码').inputValue()).length===64);await page.getByRole('button',{name:'撤销插件配对'}).click();await page.getByText('配对已撤销',{exact:true}).waitFor();await page.keyboard.press('Escape');await page.context().close();
  // Execute the real XHS scripts against a synthetic SPA, without contacting XHS.
  const context=await browser.newContext(),xhs=await context.newPage(),a='1'.repeat(24),b='2'.repeat(24);await xhs.route('**/*',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><div id="detail-title">A旧DOM</div></body></html>'}));await xhs.goto('https://www.xiaohongshu.com/explore/'+a);
  await xhs.evaluate(id=>{window.__INITIAL_STATE__={note:{noteDetailMap:{[id]:{note:{noteId:id,title:'A原帖',desc:'A正文',imageList:[]}}}}};window.chrome={runtime:{sendMessage(_message,reply){reply({ok:true,status:'complete'});}}};},a);
  for(const file of ['card-drag-helpers.js','page-data.js','content.js'])await xhs.addScriptTag({content:await readFile('browser-extension/collection/'+file,'utf8')});await xhs.evaluate(()=>document.dispatchEvent(new CustomEvent('kankan-note-capture-request')));await xhs.waitForTimeout(100);assert.equal((await xhs.evaluate(()=>captureCurrentNote())).title,'A原帖');
  await xhs.evaluate(id=>history.pushState({},'', '/explore/'+id),b);await assert.rejects(xhs.evaluate(()=>captureCurrentNote()),/尚在加载/);await xhs.evaluate(id=>{window.__INITIAL_STATE__={note:{noteDetailMap:{[id]:{note:{noteId:id,title:'B新帖',desc:'B正文',imageList:[]}}}}};document.dispatchEvent(new CustomEvent('kankan-note-capture-request'));},b);await xhs.waitForTimeout(100);const captured=await xhs.evaluate(()=>captureCurrentNote());assert.equal(captured.id,b);assert.equal(captured.title,'B新帖');assert.equal(captured.content,'B正文');
  await xhs.evaluate(({a,b})=>{document.body.innerHTML=`<div data-note-id="${a}"><video src="https://video.xhscdn.com/A.mp4"></video></div>`;window.__INITIAL_STATE__={note:{noteDetailMap:{[b]:{note:{noteId:b,type:'video',title:'B视频',desc:'B正文',imageList:[]}}}}};document.dispatchEvent(new CustomEvent('kankan-note-capture-request'));},{a,b});await xhs.waitForTimeout(100);await assert.rejects(xhs.evaluate(()=>captureCurrentNote()),/没有读取到视频/);
  await xhs.evaluate(id=>{document.body.insertAdjacentHTML('beforeend',`<div data-note-id="${id}"><video src="https://video.xhscdn.com/B.mp4"></video><div class="desc"><a>#当前标签</a></div></div>`);},b);const videoCapture=await xhs.evaluate(()=>captureCurrentNote());assert.equal(videoCapture.videoUrl,'https://video.xhscdn.com/B.mp4');assert.ok(videoCapture.tags.includes('当前标签'));await context.close();
  assert.deepEqual(errors,[]);console.log('PASS collection canvas, white frames, stack/expand, six widths, OCR search, reader/focus, group persistence, pairing, XHS SPA A→B');
} finally {await browser.close();await app.close();}

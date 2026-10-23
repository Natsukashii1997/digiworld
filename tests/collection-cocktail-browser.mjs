import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {collectionFixture,syntheticNote} from './collection-fixture.mjs';

const out=process.env.GUIJI_TEST_RESULTS || 'test-results/collection-cocktail';
await mkdir(out,{recursive:true});
const picture=await readFile('tests/collection-assets/upstream-reference.jpg');
const app=await collectionFixture({fetchImpl:async url=>{assert.ok(String(url).startsWith('https://image.xhscdn.com/'));return new Response(picture,{headers:{'content-type':'image/jpeg'}});}});
const browser=await chromium.launch(),errors=[],records=[];
const group={id:'custom:cocktail',kind:'custom',name:'调酒'};
const other={id:'custom:other',kind:'custom',name:'我的配方'};
const note=syntheticNote(38311,{title:'莫吉托调酒教程：青柠与薄荷的经典配方，以及搅拌与用量的完整说明',tags:['调酒'],content:'朗姆酒45ml，青柠20ml，加入冰块并搅拌。'});
const undoName=`撤销「${note.title}」的自动进组`;
const until=async check=>{for(let i=0;i<100;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('状态未收敛');};
async function open(width,empty=false) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{assert.equal(new URL(route.request().url()).origin,app.url);return route.continue();});
  await page.goto(app.url+'/#learning');
  await page.getByRole('heading',{name:'收藏',level:1}).waitFor();
  await page.getByRole('button',{name:/分组：调酒/}).waitFor();
  if(!empty)await page.locator('.collection-paper').first().waitFor();
  return page;
}
async function inspect(page,label) {
  const geometry=await page.getByRole('button',{name:undoName,exact:true}).evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return {width:b.width,height:b.height,left:b.left,right:b.right};}));
  assert.ok(geometry.length>0 && geometry.every(b=>b.width>=44&&b.height>=44));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' page overflow');
  assert.ok(await page.locator('.collection-auto-group').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth)),label+' notice overflow');
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
  records.push({label,geometry,axeViolations:axe.violations.length});
}
async function checkUnknownUndo() {
  const input=syntheticNote(38318,{title:'金汤力鸡尾酒配方',tags:['鸡尾酒'],content:note.content});
  await app.importNote(input);
  const page=await open(375),name=`撤销「${input.title}」的自动进组`,requests=[];
  let phase='first';
  await page.route('**/api/collection/notes/*/auto-group/*',route=>{
    const method=route.request().method();requests.push(method);
    if(method==='POST' && phase==='first'){phase='unknown';return route.abort('failed');}
    if(phase==='unknown')return route.abort('failed');
    return route.continue();
  });
  await page.getByRole('button',{name,exact:true}).click();
  await page.getByRole('alert').filter({hasText:'撤销结果待核对'}).waitFor();
  assert.equal((await app.api('/desk-workspace')).noteGroupMap[input.id],group.id);
  await page.screenshot({path:join(out,'undo-unknown-375.png'),fullPage:true});
  const retryStart=requests.length;phase='recovery';
  await page.getByRole('button',{name,exact:true}).click();
  await until(async()=>(await app.api('/desk-workspace')).noteGroupMap[input.id]==='loose');
  assert.equal(requests[retryStart],'GET','未知结果后的下一次操作必须先查询');
  assert.equal(requests.filter(method=>method==='POST').length,2);
  records.push({label:'POST and receipt read unavailable; explicit retry queries before any write',requests});
  await page.context().close();
}
try {
 tests: {
  const empty=await app.api('/desk-workspace');
  await app.api('/desk-workspace',{workspace:{...empty,groups:[group,other]},expectedRevision:empty.revision},'PUT');
  if(process.env.GUIJI_UNDO_ONLY==='1'){await checkUnknownUndo();console.log('PASS unknown undo preflight');break tests;}
  const importPage=await open(1440,true);
  const dragNote=syntheticNote(38317,{title:'莫吉托调酒教程',tags:['调酒'],content:note.content});
  const transfer=await importPage.evaluateHandle(value=>{const data=new DataTransfer();data.setData('application/x-kankan-note',value);data.setData('text/plain',value);return data;},'KANKAN_NOTE:'+JSON.stringify(dragNote));
  await importPage.locator('.collection-desk').dispatchEvent('dragenter',{dataTransfer:transfer});
  await importPage.locator('.collection-import-feedback').waitFor();
  await importPage.locator('.collection-import-feedback').dispatchEvent('drop',{dataTransfer:transfer});
  await importPage.locator(`.collection-card-position[data-note-id="${dragNote.id}"]`).waitFor();
  await importPage.locator('.collection-import-feedback').waitFor({state:'hidden'});
  await new Promise(resolve=>setTimeout(resolve,600));
  assert.equal((await app.api('/desk-workspace')).noteGroupMap[dragNote.id],group.id,'画布真实拖入必须采用服务端自动进组');
  assert.ok((await app.api('/notes')).notes.find(item=>item.id===dragNote.id).autoGroup);
  await importPage.getByRole('button',{name:`撤销「${dragNote.title}」的自动进组`,exact:true}).waitFor();
  records.push({label:'actual external DataTransfer import preserves automatic group and undo'});
  await importPage.context().close();
  if(process.env.GUIJI_DRAG_ONLY==='1'){console.log('PASS actual external cocktail import');break tests;}
  await checkUnknownUndo();
  await app.importNote(note);
  const baseline=(await app.api('/notes')).notes[0].autoGroup;
  if(process.env.GUIJI_CAPTURE_BEFORE==='1') {
    const page=await open(1440);
    await page.screenshot({path:join(out,'before-1440.png'),fullPage:true});
    await page.getByRole('button',{name:undoName,exact:true}).waitFor({timeout:3000});
    await page.context().close();
  }
  for(const width of [320,375,390,393,430,1440]) {
    const page=await open(width);
    await page.getByRole('button',{name:undoName,exact:true}).waitFor();
    await inspect(page,'notice '+width);
    await page.screenshot({path:join(out,'notice-'+width+'.png'),fullPage:true});
    await page.locator('.collection-auto-group').first().screenshot({path:join(out,'notice-component-'+width+'.png')});
    await page.locator(`.collection-card-position[data-note-id="${note.id}"]`).click();
    const reader=page.getByRole('dialog',{name:note.title});
    await reader.waitFor();
    assert.ok(await reader.getByRole('button',{name:undoName,exact:true}).count());
    await inspect(page,'reader '+width);
    await page.screenshot({path:join(out,'reader-'+width+'.png'),fullPage:true});
    await reader.locator('.collection-auto-group').screenshot({path:join(out,'reader-component-'+width+'.png')});
    await page.keyboard.press('Escape');
    await page.reload();
    await page.getByRole('button',{name:undoName,exact:true}).waitFor();
    assert.equal((await app.api('/notes')).notes[0].autoGroup.assignmentId,baseline.assignmentId);
    await page.context().close();
  }
  const page=await open(1440);
  // A lost POST response is resolved through the persisted assignment status, never another POST.
  let undoPosts=0,statusReads=0;
  await page.route('**/api/collection/notes/*/auto-group/*',async route=>{
    if(route.request().method()==='POST') {undoPosts++;await route.fetch();return route.abort('failed');}
    statusReads++;return route.continue();
  });
  await page.getByRole('button',{name:undoName,exact:true}).focus();
  await page.keyboard.press('Enter');
  await until(async()=>(await app.api('/desk-workspace')).noteGroupMap[note.id]==='loose');
  await page.getByRole('button',{name:undoName,exact:true}).waitFor({state:'hidden'});
  assert.equal(undoPosts,1);assert.equal(statusReads,2);
  await page.reload();
  await page.locator(`.collection-card-position[data-note-id="${note.id}"]`).waitFor();
  assert.equal(await page.getByRole('button',{name:undoName,exact:true}).count(),0);
  await app.importNote(note);
  assert.equal((await app.api('/desk-workspace')).noteGroupMap[note.id],'loose');
  records.push({label:'keyboard undo, lost response, refresh and reimport',undoPosts,statusReads});
  await page.context().close();
  const retryNote=syntheticNote(38313,{...note,id:String(38313).padStart(24,'0'),sourceUrl:`https://www.xiaohongshu.com/explore/${String(38313).padStart(24,'0')}`,title:'玛格丽特鸡尾酒制作',tags:['调酒']});
  await app.importNote(retryNote);
  const retryName=`撤销「${retryNote.title}」的自动进组`;
  const retryPage=await open(1440);
  let failUndo=true,retryPosts=0;
  await retryPage.route('**/api/collection/notes/*/auto-group/undo',route=>{
    retryPosts++;
    return failUndo?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'合成断网：撤销未执行'})}):route.continue();
  });
  await retryPage.getByRole('button',{name:retryName,exact:true}).click();
  await retryPage.getByRole('alert').filter({hasText:'合成断网'}).waitFor();
  assert.equal((await app.api('/desk-workspace')).noteGroupMap[retryNote.id],group.id);
  assert.equal(retryPosts,1);
  assert.ok(await retryPage.getByRole('button',{name:retryName,exact:true}).isEnabled());
  await retryPage.screenshot({path:join(out,'undo-failed-1440.png'),fullPage:true});
  failUndo=false;
  await retryPage.getByRole('button',{name:retryName,exact:true}).click();
  await until(async()=>(await app.api('/desk-workspace')).noteGroupMap[retryNote.id]==='loose');
  assert.equal(retryPosts,2);
  records.push({label:'uncommitted undo failure and explicit retry',retryPosts});
  await retryPage.context().close();

  const manualNote=syntheticNote(38314,{...note,id:String(38314).padStart(24,'0'),sourceUrl:`https://www.xiaohongshu.com/explore/${String(38314).padStart(24,'0')}`,title:'经典马天尼配方',tags:['鸡尾酒']});
  await app.importNote(manualNote);
  const manualPage=await open(1440),manualName=`撤销「${manualNote.title}」的自动进组`;
  const assignment=(await app.api('/notes')).notes.find(item=>item.id===manualNote.id).autoGroup.assignmentId;
  let failDesk=true;
  await manualPage.route('**/api/collection/desk-workspace',route=>route.request().method()==='PUT'&&failDesk?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'合成断网：人工草稿未保存'})}):route.continue());
  await manualPage.getByRole('button',{name:'新建分组',exact:true}).click();
  assert.ok(await manualPage.getByRole('button',{name:manualName,exact:true}).isDisabled());
  await manualPage.getByRole('textbox',{name:'分组名称',exact:true}).fill('人工草稿');
  await manualPage.getByRole('button',{name:'保存分组名称',exact:true}).click();
  await manualPage.getByRole('alert').filter({hasText:'人工草稿未保存'}).waitFor();
  assert.ok(await manualPage.getByRole('button',{name:manualName,exact:true}).isDisabled());
  await manualPage.reload();
  await manualPage.getByRole('button',{name:'恢复草稿',exact:true}).waitFor();
  assert.ok(await manualPage.getByRole('button',{name:manualName,exact:true}).isDisabled());
  failDesk=false;
  await manualPage.getByRole('button',{name:'恢复草稿',exact:true}).click();
  await until(async()=>(await app.api('/desk-workspace')).groups.some(item=>item.name==='人工草稿'));
  await until(async()=>await manualPage.getByRole('button',{name:manualName,exact:true}).isEnabled());
  await manualPage.getByRole('button',{name:/分组：调酒/}).click();
  const nativeDrag=manualPage.locator(`.collection-card-position[data-note-id="${manualNote.id}"] .desk-native-drag`);
  await nativeDrag.dragTo(manualPage.locator(`.collection-group[data-group-id="${other.id}"]`));
  await until(async()=>(await app.api('/desk-workspace')).noteGroupMap[manualNote.id]===other.id);
  await assert.rejects(app.api(`/notes/${manualNote.id}/auto-group/undo`,{assignmentId:assignment}),{status:409});
  await app.importNote(manualNote);
  await manualPage.reload();
  assert.equal((await app.api('/desk-workspace')).noteGroupMap[manualNote.id],other.id);
  assert.equal(await manualPage.getByRole('button',{name:manualName,exact:true}).count(),0);
  records.push({label:'editing and recovered draft block undo; native manual drag remains after reimport'});
  await manualPage.context().close();
  assert.deepEqual(errors,[]);
  await writeFile(join(out,'results.json'),JSON.stringify({records,errors},null,2)+'\n');
  console.log('PASS cocktail notice/reader six widths, Axe, reload, keyboard undo and unknown-result recovery');
  }
} finally {await browser.close();await app.close();}

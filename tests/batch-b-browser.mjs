import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,rm,readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {settingsFixture} from './settings-v16-fixture.mjs';
import {openSettingsDrawer} from './settings-entry.mjs';
import {createNoteImages} from '../server/note-images.mjs';
import {openRepository} from '../server/repository.mjs';
import {imageMarker} from '../src/note-image-model.js';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const out=process.env.GUIJI_TEST_RESULTS||'test-results/batch-b';await mkdir(out,{recursive:true});
const browser=await chromium.launch(),app=await settingsFixture(),errors=[];let target,otherTarget;
const button=(p,name)=>p.getByRole('button',{name,exact:true});
async function pageFor(a=app){const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),p=await c.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>{assert.equal(new URL(r.request().url()).origin,a.url,'仅隔离本机服务');return r.continue();});return p;}
async function settings(p,tab){await p.goto(app.url+'/#settings');await openSettingsDrawer(p,tab);}
try{
 // Restore response is lost, then the tab reloads while the query is offline.
 const p=await pageFor();await settings(p,'数据与备份');
 const imageData=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=160;c.height=90;c.getContext('2d').fillRect(0,0,160,90);return c.toDataURL('image/png').split(',')[1];});const image=await createNoteImages(app.directory).store({data:new Uint8Array(Buffer.from(imageData,'base64'))});const before=await app.repository.read();before.notes.push({id:'restore-image',at:new Date().toISOString(),text:'图片保留'+imageMarker(image.id),images:[image.id]});await app.repository.write(before);await writeFile(join(app.directory,'large-synthetic.bin'),randomBytes(76*1024*1024));
 const download=await Promise.all([p.waitForEvent('download'),button(p,'下载恢复包 ZIP').click()]).then(v=>v[0]);const file=join(out,'restore.zip');await download.saveAs(file);await p.getByLabel('选择完整备份文件').setInputFiles(file);const dialog=p.getByRole('dialog',{name:'完整备份恢复预览'});await dialog.waitFor();target=await dialog.locator('code.storage-path').innerText();let restores=0;
 await p.route('**/api/full-backup/restore',async route=>{restores++;const response=await route.fetch();assert.equal(response.status(),200);await route.abort('connectionreset');});
 await p.route('**/api/full-backup/operations/*',route=>route.abort('connectionrefused'));
 await button(dialog,'恢复到新目录').click();await button(p,'查询上次恢复结果').waitFor();assert(await p.getByLabel('选择完整备份文件').isDisabled());await p.reload();await openSettingsDrawer(p,'数据与备份');await p.getByText(/恢复结果待核对，原操作编号已保留/).waitFor();assert(await p.getByLabel('选择完整备份文件').isDisabled());assert.equal(restores,1);
 await p.unroute('**/api/full-backup/operations/*');let expired=true,scopeCalls=0;await p.route('**/api/full-backup/scope',async r=>{scopeCalls++;if(expired){expired=false;await r.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'session expired'})});}else await r.continue();});await button(p,'查询上次恢复结果').click();await p.getByText(/已恢复到新目录并逐个校验/).waitFor();assert.equal(await p.locator('.full-backup-done code').innerText(),target);
 const restoredRepo=await openRepository(target);try{const restoredState=await restoredRepo.read();assert.equal(restoredState.notes.find(n=>n.id==='restore-image').images[0],image.id);}finally{await restoredRepo.close();}const restoredImage=await createNoteImages(target).read(image.id);const decoded=await p.evaluate(async bytes=>{const img=new Image();img.src='data:image/png;base64,'+bytes;await img.decode();return [img.naturalWidth,img.naturalHeight];},Buffer.from(restoredImage.data).toString('base64'));assert.deepEqual(decoded,[160,90]);console.log('PASS 76MiB浏览器文件选择恢复，真实PNG解码及便签引用保留');assert.equal(restores,1);assert.equal(scopeCalls,2,'认证过期仅刷新GET');await p.screenshot({path:join(out,'restore-reconnected.png')});
 for(const width of [320,390,1440]){await p.setViewportSize({width,height:1000});assert.equal(await p.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth)),0);await p.screenshot({path:join(out,`restore-${width}.png`)});}await p.context().close();console.log('PASS 丢响应→重开离线→恢复连接只查原次，未重复恢复；三宽无溢出');
 // Same-browser tabs can discover the other tab's completed operation without replaying.
 const left=await pageFor();await settings(left,'数据与备份');const right=await left.context().newPage();right.setDefaultTimeout(12000);await settings(right,'数据与备份');await left.getByLabel('选择完整备份文件').setInputFiles(file);await left.getByRole('dialog').waitFor();await right.getByLabel('选择完整备份文件').setInputFiles(file);const rd=right.getByRole('dialog');await rd.waitFor();otherTarget=await rd.locator('code.storage-path').innerText();await button(rd,'恢复到新目录').click();await right.getByText(/已恢复到新目录并逐个校验/).waitFor();let leftWrites=0;left.on('request',r=>{if(r.url().endsWith('/api/full-backup/restore'))leftWrites++;});await button(left.getByRole('dialog'),'恢复到新目录').click();await button(left,'查询上次恢复结果').waitFor();assert.equal(leftWrites,0);await button(left,'查询上次恢复结果').click();await left.getByText(/已恢复到新目录并逐个校验/).waitFor();assert.equal(await left.locator('.full-backup-done code').innerText(),otherTarget);await left.context().close();console.log('PASS 另一窗口先恢复，当前窗口被拦后可查原次，无重复POST');
 // Initial identity read failure retains a query entry, and retry clears the gate.
 const retry=await pageFor();let fail=true;await retry.route('**/api/full-backup/scope',r=>fail?r.abort('connectionrefused'):r.continue());await settings(retry,'数据与备份');await button(retry,'查询上次恢复结果').waitFor();assert(await retry.getByLabel('选择完整备份文件').isDisabled());fail=false;await button(retry,'查询上次恢复结果').click();await retry.waitForFunction(()=>!document.querySelector('input[aria-label="选择完整备份文件"]')?.disabled);await retry.context().close();console.log('PASS 初始化断连后原页重连，无需关闭重开');
 assert.deepEqual(errors,[]);console.log('batch-b-browser: all passed');
}finally{await browser.close();await app.close();if(target)await rm(target,{recursive:true,force:true});if(otherTarget)await rm(otherTarget,{recursive:true,force:true});}

import {expandLong175} from './notes-editor-helpers175.mjs';
import {installNoteVaultHost175} from './vault-note-host175.mjs';
import {installCapabilityRequestGuard,sameEventClickAndEscape} from './ui-capability-browser-guards.mjs';
// Vault新UI专项；所有新API均合成响应，真实Vault/Agent/访达/付费模型适配显式拒绝。
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
import {batch3Routes} from './ui-v14-batch3-fixture.mjs';
import {geometry,axe,motion} from './ui-v14-checks.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch(),errors=[],urls=[],forbidden=[],requestGuards=[];
const sha=x=>createHash('sha256').update(x).digest('hex'),AT='2026-10-04T02:00:00.000Z',PREFIX='/api/capabilities/vault';
const deny=async()=>{forbidden.push('禁止宿主适配');throw new Error('合成fixture禁止宿主动作');};
const button=(p,name)=>p.getByRole('button',{name,exact:true});
let app;
function data(long){
 const state=seed(),note={id:'vault-note-synthetic',text:long?'长中文EnglishWithoutSpaces'.repeat(80)+'\n合成第二行🙂':'## 合成随手记\n保留全文🙂',at:AT,format:'md1'};
 const original=long?'原中文EnglishWithoutSpaces'.repeat(35):'合成原段落',proposed=long?'新中文EnglishWithoutSpaces'.repeat(35):'合成新段落';
 const before='前文\n'+original+'\n后文',after='前文\n'+proposed+'\n后文';
 const proposal={schema:1,id:'vault-proposal-synthetic',sourceId:'vault-source-synthetic',path:'个人上下文/合成说明.md',original,proposed,reason:'合成修改建议',proposer:'Synthetic',baseSha256:sha(before),createdAt:AT,status:'confirmed',decidedAt:AT,confirmation:{baseSha256:sha(before),resultSha256:sha(after),confirmedAt:AT,write:'awaiting_local'}};
 state.assets=[];state.notes=[note];state.profileProposals=[proposal];state.revisionCandidates=[];state.reverseRecords=[];
 const connections={roots:[],projects:[],agents:[],agentScannedAt:AT,projectScannedAt:AT,errors:[],truncated:false,github:{status:'not_connected',login:'',message:'',at:AT},knowledgeSources:[{schema:1,id:proposal.sourceId,name:'合成Vault',kind:'obsidian',root:'/synthetic/vault',identity:'a'.repeat(64),generation:'synthetic-generation',connectedAt:AT}]};
 return {state,note,proposal,before,after,connections,filename:long?'长中文EnglishWithoutSpaces'.repeat(4)+'.md':'用户改名后的合成随手记.md'};
}
async function start(input){
 app=await fixture({discovery:{calendarHelper:{platform:'linux',run:deny},knowledgeFiles:{inspectRoot:deny,scan:deny,read:deny,current:deny},knowledgeTrends:{journal:{list:async()=>[]}},projectActivity:{resolveRoot:deny,runGit:()=>deny},storageStatus:{platform:'linux',runOpen:deny},learningMetadataReader:deny,aihotFetch:deny}});
 await app.repository.write({...input.state,profileProposals:[],connections:undefined},{initialize:true});await app.repository.updateConnections(()=>input.connections);const {decidedAt,confirmation,...proposal}=input.proposal;await app.repository.updateProfile(()=>({profileProposals:[{...proposal,status:'pending'}]}));await app.repository.updateProfile(()=>({profileProposals:[input.proposal]}));
}
async function open(width,route,input){
 const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(10000);
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>urls.push(r.url()));requestGuards.push(await installCapabilityRequestGuard(p,app.url));await batch3Routes(p);
 const state={enabled:route==='inbox',conflict:false,unknown:false,previewGate:null,applyGate:null,calls:[]},operationId=randomUUID();
 await p.route('**/api/capabilities/vault/**',async r=>{
  const path=new URL(r.request().url()).pathname.slice(PREFIX.length),body=r.request().method()==='GET'?undefined:r.request().postDataJSON();state.calls.push({path,body,method:r.request().method()});
  if(path==='/pending-notes')return r.fulfill({json:{noteIds:[],basis:'仅本机合成回执'}});
  if(path==='/status')return r.fulfill({json:{enabled:state.enabled,generation:'synthetic',options:{sourceId:input.proposal.sourceId,notesFolder:'合成子目录',profileFolders:['个人上下文']},sources:[{id:input.proposal.sourceId,name:'合成Vault'}]}});
  if(path==='/preview-note'||path==='/preview-profile'){
   assert.deepEqual(Object.keys(body).sort(),path==='/preview-note'?['filename','noteId']:['proposalId'],'预览只发保存ID/文件名，无正文或绝对路径');
   if(path==='/preview-note')assert.equal(body.noteId,input.note.id);else assert.equal(body.proposalId,input.proposal.id);
   if(state.previewGate)await state.previewGate;
   if(state.conflict)return r.fulfill({status:409,json:{error:'合成：同名文件已存在，请改名，不会覆盖。',operationNotStarted:true}});
   return r.fulfill({json:{token:'synthetic-preview-token',operationId,kind:path==='/preview-note'?'note':'profile',target:path==='/preview-note'?'合成子目录/'+body.filename:input.proposal.path,before:path==='/preview-note'?'':input.before,after:path==='/preview-note'?input.note.text:input.after,beforeSha256:path==='/preview-note'?'':sha(input.before),afterSha256:path==='/preview-note'?sha(input.note.text):sha(input.after),backup:'合成备份：先保存原文或不存在状态，再写并回读。'}});
  }
  if(path==='/apply'||path==='/rollback'){
   assert.deepEqual(Object.keys(body).sort(),['confirmed','operationId','token']);assert.equal(body.confirmed,true);assert.equal(body.operationId,operationId);
   if(state.applyGate)await state.applyGate;
   return r.fulfill({json:{operationId,status:path==='/rollback'?'rolled_back':state.unknown?'unknown':'verified',...(state.unknown?{reason:'合成写入或留痕结果未知，请先查询。'}:{})}});
  }
  if(path==='/check'){assert.deepEqual(body,{operationId});return r.fulfill({json:{operationId,status:'verified'}});}
  if(path==='/history')return r.fulfill({json:{items:[{operationId,kind:route==='inbox'?'profile':'note',sourceId:input.proposal.sourceId,recordId:route==='inbox'?input.proposal.id:input.note.id,path:route==='inbox'?input.proposal.path:'合成子目录/'+input.filename,beforeSha256:'',afterSha256:sha(input.note.text),at:AT,status:'unchecked'}]}});
  if(path==='/rollback-preview'){assert.deepEqual(body,{operationId});return r.fulfill({json:{token:'synthetic-rollback',operationId,action:'移除本次原样新文件',beforeSha256:sha(input.note.text),afterSha256:''}});}
  throw new Error('意外Vault API:'+path);
 });
 await p.goto(app.url+'/#'+route);if(route==='inbox')await p.getByRole('dialog',{name:'待处理',exact:true}).waitFor();else await p.locator('main .page-heading').waitFor();
 return {p,state,operationId};
}
async function assertUI(p,label){await geometry(p,'[role="dialog"]',label);await axe(p,label);}
function count(state,path){return state.calls.filter(x=>x.path===path).length;}
try{
 for(const long of [false,true])for(const width of [320,390]){
  const input=data(long);await start(input);let {p,state,operationId}=await open(width,'notes',input);
  assert.equal(await p.locator('main').getByRole('button',{name:/^更多操作：|^写入 Obsidian：/}).count(),0);
  assert.deepEqual(state.calls.map(c=>[c.path,c.method]),[['/pending-notes','GET']],'取消入口仍仅读本机回执');await expandLong175(p);await geometry(p,'main',`Vault取消入口 ${width} long=${long}`);await axe(p,'Vault随手记取消入口');
  const host=await installNoteVaultHost175(p,app.url);let entry=await host.mount(input.note.id);const openEntry=async()=>{entry=await host.mount(input.note.id);await entry.click();};assert.deepEqual(state.calls.map(c=>[c.path,c.method]),[['/pending-notes','GET']],'挂载真实组件不扫描目标');await geometry(p,'#synthetic-vault-note-host175','真实Entry');await axe(p,'真实Vault组件宿主');
  await openEntry();let dialog=p.getByRole('dialog',{name:'随手记写入 Obsidian',exact:true});await dialog.getByText(/Vault 写入默认关闭/).waitFor();
  assert.equal(count(state,'/status'),1);assert.deepEqual(state.calls.map(c=>c.path).sort(),['/pending-notes','/status'],'默认关只读本机回执与status');
  assert.equal(await button(dialog,'预览新建文件').count(),0);await assertUI(p,'默认关闭');
  await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await entry.evaluate(e=>e===document.activeElement),true,'关闭后回焦唯一Note入口');
  await openEntry();await dialog.getByText(/Vault 写入默认关闭/).waitFor();await button(dialog,'去设置 Vault 写入').click();await p.waitForURL('**/#settings');assert.equal(count(state,'/preview-note'),0);assert.equal(count(state,'/apply'),0);
  state.enabled=true;await p.goto(app.url+'/#notes');await openEntry();dialog=p.getByRole('dialog',{name:'随手记写入 Obsidian',exact:true});const filename=dialog.getByLabel('新文件名（.md）',{exact:true});await filename.waitFor();await filename.fill(input.filename);
  await filename.evaluate(e=>{window.vaultSubmits=0;e.form.addEventListener('submit',()=>window.vaultSubmits++);});
  for(const event of [{isComposing:true},{isComposing:false,keyCode:229}]){await filename.dispatchEvent('keydown',{key:'Enter',bubbles:true,...event});assert.equal(count(state,'/preview-note'),0,'IME确认不预览');assert.equal(await p.evaluate(()=>window.vaultSubmits),0);}
  let release;state.previewGate=new Promise(r=>release=r);state.conflict=true;
  await filename.press('Enter');await p.waitForFunction(()=>[...document.querySelectorAll('[role="dialog"] button')].some(e=>e.textContent==='正在生成 Vault 写入预览'&&e.disabled));
  await filename.press('Enter');assert.equal(await p.evaluate(()=>window.vaultSubmits),1,'忙碌Enter无第二submit');assert.equal(count(state,'/preview-note'),1,'忙碌Enter无第二请求');release();state.previewGate=null;
  await dialog.getByRole('alert').filter({hasText:'同名文件已存在'}).waitFor();assert.equal(await filename.inputValue(),input.filename,'冲突失败保留文件名');assert.equal(count(state,'/apply'),0,'冲突不覆盖不写入');
  state.conflict=false;await filename.fill(input.filename.replace('.md','-改名.md'));await button(dialog,'预览新建文件').click();await dialog.getByLabel('本次操作预览').waitFor();
  assert.equal(count(state,'/apply'),0,'全文预览仍不写');assert.match(await dialog.innerText(),/不存在状态/);assert.match(await dialog.innerText(),/合成子目录/);await assertUI(p,`新文件全文 ${width} long=${long}`);
  await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await entry.evaluate(e=>e===document.activeElement),true,'预览Esc回焦且无写入');
  await openEntry();dialog=p.getByRole('dialog',{name:'随手记写入 Obsidian',exact:true});await dialog.getByLabel('新文件名（.md）',{exact:true}).fill(input.filename);await button(dialog,'预览新建文件').click();await dialog.getByLabel('本次操作预览').waitFor();
  state.unknown=true;state.applyGate=new Promise(r=>release=r);await sameEventClickAndEscape(p,button(dialog,'确认新建这条随手记文件'),PREFIX+'/apply');await button(dialog,'正在执行并回读').waitFor();await p.keyboard.press('Escape');assert.equal(await dialog.count(),1,'Vault写入忙碌Esc保留回执');await p.keyboard.press('Enter');assert.equal(count(state,'/apply'),1,'忙碌确认不重放');release();state.applyGate=null;
  await dialog.locator('.capability-result').getByText('结果未知，请先查询',{exact:true}).waitFor();
  assert.equal(await button(dialog,'确认新建这条随手记文件').count(),0,'未知移除旧确认按钮');assert.equal(await button(dialog,'预览新建文件').isDisabled(),true,'未知禁新预览');
  assert.equal(await dialog.getByLabel('新文件名（.md）',{exact:true}).inputValue(),input.filename,'未知保留文件名');
  assert.equal(count(state,'/apply'),1);assert.equal(count(state,'/check'),0,'未知不会自动查询或重放');assert.equal(count(state,'/history'),0,'历史未自动读取');
  await button(dialog,'查询本次 Vault 写入结果').click();await dialog.locator('.capability-result').getByText('写后回读一致',{exact:true}).waitFor();assert.equal(count(state,'/check'),1);assert.equal(count(state,'/apply'),1);
  await button(dialog,'读取本机 Vault 写入记录').click();const history=dialog.getByRole('region',{name:'Vault 写入记录',exact:true});await history.waitFor();assert.equal(count(state,'/history'),1);assert(!/保留全文🙂|长中文EnglishWithoutSpaces/.test(await history.innerText()),'历史无Vault正文');
  await button(history,'预览回滚Vault 写入记录 '+operationId).click();await button(history,'确认回滚本次操作').waitFor();state.unknown=false;await button(history,'确认回滚本次操作').click();await history.locator('.capability-result').getByText('回滚已回读',{exact:true}).waitFor();assert.equal(count(state,'/rollback'),1);
  await assertUI(p,`写入历史 ${width} long=${long}`);await motion(p,'[role="dialog"]');await axe(p,'Vault运行中reduce');await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  await host.dispose();await p.context().close();await app.close();app=null;
  await start(input);({p,state}=await open(width,'inbox',input));await p.locator('.ib-proposal-records summary').click();const profileEntry=button(p,'预览写回个人说明：'+input.proposal.id);await profileEntry.waitFor();assert.deepEqual(state.calls.map(c=>[c.path,c.method]),[['/pending-notes','GET']]);
  await profileEntry.click();dialog=p.getByRole('dialog',{name:'写回个人说明',exact:true});await button(dialog,'生成个人说明写回预览').waitFor();assert.equal(count(state,'/preview-profile'),0,'初始只读本机授权');
  await button(dialog,'生成个人说明写回预览').click();await dialog.getByLabel('逐行差异').waitFor();assert.equal(count(state,'/apply'),0);assert.equal(await dialog.locator('.diff-line.removed').count(),1);assert.equal(await dialog.locator('.diff-line.added').count(),1);
  await assertUI(p,`个人说明diff ${width} long=${long}`);await button(dialog,'确认写回这条个人说明建议').click();await dialog.locator('.capability-result').getByText('写后回读一致',{exact:true}).waitFor();assert.equal(count(state,'/apply'),1);assert.equal(count(state,'/preview-profile'),1);
  assert.equal((await app.repository.read()).profileProposals[0].status,'confirmed','独立受控写入不改既有已采纳主库记录');
  await assertUI(p,'个人说明写后回执');await motion(p,'[role="dialog"]');await axe(p,'个人说明reduce');await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await profileEntry.evaluate(e=>e===document.activeElement),true,'个人说明Esc回焦');
  await p.context().close();await app.close();app=null;
 }
 for(const guard of requestGuards)guard.assertNoExternal([PREFIX+'/status',PREFIX+'/apply']);assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);assert(urls.every(u=>/^http:\/\/127\.0\.0\.1:\d+\//.test(u)),'零外部请求');
 console.log('PASS Vault UI（随手记取消入口，保留真实组件由合成宿主验证）：320/390普通及长中英文，默认关零目标请求、note/proposalID、IME/busy/Esc、冲突改名保留、未知查询不重放、预览/写后回执/回滚，逐元素44px/axe/运行中reduce。');
}finally{await browser.close();await app?.close();}

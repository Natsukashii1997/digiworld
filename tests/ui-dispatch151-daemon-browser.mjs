// 常驻UI专项：页面为随机端口临时主库；生产daemon service的文件/端口/launchctl全部内存DI。
import {openCapabilityMore,capabilitySwitch} from './settings-entry.mjs';
// 浏览器只请求本次app精确origin。零真实目录/5178连接/launchctl/Agent/钥匙串/API调用。
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
import {batch3Routes} from './ui-v14-batch3-fixture.mjs';
import {geometry,axe,motion} from './ui-v14-checks.mjs';
import {createSyntheticDaemon} from './daemon-browser-fixture.mjs';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch(),errors=[],routeErrors=[],forbidden=[];
const PREFIX='/api/capabilities/daemon',button=(p,name)=>p.getByRole('button',{name,exact:true});let app;
const deny=async()=>{forbidden.push('禁止真实宿主适配');throw new Error('合成fixture禁止宿主动作');};
const count=(s,path)=>s.calls.filter(c=>c.path===path).length;
const gate=()=>{let release;const promise=new Promise(resolve=>{release=resolve;});return{promise,release};};
const mainResult=d=>d.locator('.capability-console > .capability-result');
async function ui(p,label){await geometry(p,'[role="dialog"]',label);await axe(p,label);}
async function inspectRows(d,expected){for(const [title,text]of Object.entries(expected)){const term=d.locator('dt').filter({hasText:title});assert.equal(await term.count(),1);assert.equal(await term.evaluate(e=>e.nextElementSibling.textContent),text,title);}}
async function start(){
 app=await fixture({discovery:{
  calendarHelper:{platform:'linux',run:deny},learningMetadataReader:deny,
  knowledgeFiles:{inspectRoot:deny,scan:deny,read:deny,current:deny},knowledgeTrends:{journal:{list:async()=>[]}},
  projectActivity:{resolveRoot:deny,runGit:deny},storageStatus:{platform:'linux',runOpen:deny},aihotFetch:deny,
  inspectAgentInventory:deny,inspectAgentPrograms:deny,modelTransport:deny,runKeychainHelper:deny,resolveBookInput:deny,
  nightRunProcess:deny,nightProxyFactory:deny,nightInspectStoppedProcess:deny,daemonLaunchctl:deny,daemonPortOccupied:deny,
 }});
 await app.repository.write({...seed(),assets:[],notes:[]},{initialize:true});
}
async function open(width,long){
 const daemon=createSyntheticDaemon({long}),origin=new URL(app.url).origin;
 const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Asia/Shanghai',reducedMotion:'reduce',serviceWorkers:'block'}),p=await context.newPage();p.setDefaultTimeout(10000);
 const s={daemon,calls:[],requests:[],previewGate:null,applyGate:null,failPreview:false,unknownResponse:false,lastPlan:null};
 p.on('pageerror',e=>errors.push(e.message));
 p.on('request',r=>{const url=new URL(r.url());s.requests.push(r.url());if(url.origin===origin&&url.pathname.startsWith(PREFIX+'/'))s.calls.push({path:url.pathname.slice(PREFIX.length),method:r.method(),body:r.method()==='GET'?undefined:r.postDataJSON()});});
 // 拦截外部origin，末尾再检查请求清单和非空分母；every([])不能得到通过结论。
 await context.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!==origin&&u.protocol!=='data:'){forbidden.push('外部浏览器请求：'+u.origin);return r.abort('blockedbyclient');}return r.continue();});
 await batch3Routes(p);
 await p.route('**/api/capabilities/daemon/**',async r=>{
  try{
   const u=new URL(r.request().url());assert.equal(u.origin,origin);const path=u.pathname.slice(PREFIX.length),method=r.request().method(),body=method==='GET'?undefined:r.request().postDataJSON();let value;
   if(path==='/status'||path==='/history'){assert.equal(method,'GET');assert.equal(body,undefined);value=await daemon.api[path.slice(1)]();}
   else if(path==='/inspect'){assert.equal(method,'POST');assert.deepEqual(body,{});value=await daemon.api.inspect();}
   else if(path==='/preview'){
    assert.equal(method,'POST');assert.deepEqual(Object.keys(body),['kind']);assert(['install','uninstall'].includes(body.kind));if(s.previewGate)await s.previewGate.promise;
    if(s.failPreview)return r.fulfill({status:409,json:{error:'合成来源身份变化，尚未开始；请重新核验本次对象',operationNotStarted:true}});
    value=await daemon.api.preview(body);s.lastPlan=value;
   }else if(path==='/apply'||path==='/rollback'){
    assert.equal(method,'POST');assert.deepEqual(Object.keys(body).sort(),['confirmed','operationId','token']);assert.equal(body.confirmed,true);assert.match(body.operationId,/^[a-f0-9-]{36}$/);if(s.applyGate)await s.applyGate.promise;
    value=await daemon.api[path.slice(1)](body);
    if(s.unknownResponse)return r.fulfill({status:503,json:{error:'合成响应丢失：结果未知，保留原操作编号，只查询不重放',unknownResult:true}});
   }else if(path==='/check'||path==='/rollback-preview'){
    assert.equal(method,'POST');assert.deepEqual(Object.keys(body),['operationId']);value=await daemon.api[path==='/check'?'check':'rollbackPreview'](body.operationId);
   }else assert.fail('意外常驻API：'+path);
   return r.fulfill({json:value});
  }catch(e){routeErrors.push(e.message);return r.fulfill({status:500,json:{error:'合成路由断言失败：'+e.message,unknownResult:true}});}
 });
 await p.goto(app.url+'/#settings');await capabilitySwitch(p,'daemon').waitFor();return{p,s,origin};
}
async function drawer(p){const d=await openCapabilityMore(p,'daemon');await d.getByText(/授权状态：/).waitFor();return d;}
async function preview(d,p,s,kind){await button(d,kind==='install'?'预览安装常驻':'预览卸载常驻').click();await d.getByRole('region',{name:'本次操作预览',exact:true}).waitFor();return s.lastPlan;}
async function confirm(d,p,label){const response=p.waitForResponse(r=>new URL(r.url()).pathname===PREFIX+'/apply');await button(d,'确认本次常驻变更').click();assert.equal((await response).ok(),true);await mainResult(d).getByText(label,{exact:true}).waitFor();}
async function sameEventConfirm(d,p){
 const request=p.waitForRequest(r=>new URL(r.url()).pathname===PREFIX+'/apply');
 const connected=await button(d,'确认本次常驻变更').evaluate(e=>{e.focus();e.click();e.click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));});
 assert.equal(connected,true,'同事件click+click+Esc：同步ref门禁先于React渲染');
 await request;
 await button(d,'正在执行并回读').waitFor();
 await p.keyboard.press('Enter');await p.keyboard.press('Escape');assert.equal(await d.count(),1,'忙碌Esc保留操作面板');
}
function assertRequests(s,origin){
 assert(s.requests.length>0,'请求清单必须有实际请求');
 assert(s.requests.some(u=>new URL(u).pathname===PREFIX+'/status'),'实际status进入清单，URL断言有分母');
 assert(s.requests.some(u=>new URL(u).pathname===PREFIX+'/apply'),'实际apply进入清单，写请求断言有分母');
 assert.deepEqual(s.requests.filter(u=>{const url=new URL(u);return url.protocol!=='data:'&&url.origin!==origin;}),[],'只允许本次随机端口origin；其它127.0.0.1端口也拒绝');
}

try{
 for(const long of [false,true])for(const width of [320,390]){
  await start();const{p,s,origin}=await open(width,long),f=s.daemon;assert(s.calls.every(c=>c.path==='/history'&&c.method==='GET'&&c.body===undefined),'未点管理入口仅总表只读history，不请求status/inspect/宿主动作');
  let d=await drawer(p);await d.getByText('授权状态：关闭',{exact:true}).waitFor();assert.equal(count(s,'/status'),1);assert(s.calls.every(c=>['/status','/history'].includes(c.path)),'默认关只读status及权限总表history；不自动inspect或宿主访问');
  assert.equal(f.counts.launch.length,0);assert.equal(f.counts.port.length,0);assert.deepEqual(f.memory.writes,[],'默认关不写合成plist/备份');
  for(const name of ['明确检查常驻状态','预览安装常驻','预览卸载常驻'])assert.equal(await button(d,name).isDisabled(),true);
  await ui(p,`常驻默认关 ${width} long=${long}`);await p.keyboard.press('Escape');await d.waitFor({state:'detached'});assert.equal(await capabilitySwitch(p,'daemon').evaluate(e=>e===document.activeElement),true,'Esc回焦唯一入口');

  f.enable();d=await drawer(p);await d.getByText('授权状态：已开启',{exact:true}).waitFor();assert.equal(f.counts.launch.length,0);assert.equal(f.counts.port.length,0,'开启后打开仍不检查宿主');
  await button(d,'明确检查常驻状态').click();await d.getByText('运行健康',{exact:true}).waitFor();await inspectRows(d,{'配置文件已安装':'否','用户服务已加载':'否','运行健康':'未知'});assert(f.counts.port.length>0);assert(f.counts.launch.length>0);assert.deepEqual(f.mutations(),[],'explicit inspect只print，无启停');

  s.failPreview=true;s.previewGate=gate();const rejected=s.previewGate;
  const previewRequest=p.waitForRequest(r=>new URL(r.url()).pathname===PREFIX+'/preview');
  const syncPreview=await button(d,'预览安装常驻').evaluate(e=>{e.focus();e.click();e.click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return Boolean(document.querySelector('[role="dialog"]'));});assert.equal(syncPreview,true,'预览也同步阻止Esc丢失输入');await previewRequest;
  assert.equal(count(s,'/preview'),1,'同事件双击只有一次预览');rejected.release();s.previewGate=null;
  await d.getByRole('alert').filter({hasText:'来源身份变化'}).waitFor();assert.equal(count(s,'/apply'),0);assert.equal(await button(d,'确认本次常驻变更').count(),0);assert.equal(f.memory.text(f.plistPath),null,'预览失败不写配置');s.failPreview=false;
  const first=await preview(d,p,s,'install');assert.equal(first.portOccupied,true);assert.match(first.action,/等待用户本人重启/);assert.equal(await d.locator('.capability-preview pre').innerText(),first.plist,'完整plist不截断');assert.equal(f.memory.text(f.plistPath),null);assert.equal(count(s,'/apply'),0,'完整预览不启动/不安装');await ui(p,`常驻完整预览 ${width} long=${long}`);

  s.applyGate=gate();const firstHeld=s.applyGate;await sameEventConfirm(d,p);assert.equal(count(s,'/apply'),1,'同事件双击/Enter不重复执行');assert.equal(f.memory.text(f.plistPath),null,'响应hold前尚未执行');firstHeld.release();s.applyGate=null;
  await mainResult(d).getByText('等待本人在终端处理服务',{exact:true}).waitFor();let history=d.getByRole('region',{name:'常驻操作记录',exact:true});await button(history,'查询常驻操作记录 '+first.operationId).waitFor();
  assert.equal(f.memory.text(f.plistPath),first.plist);assert.deepEqual(f.mutations(),[],'占用端口：0 bootstrap、0 bootout；仅合成只读print');assert.equal(count(s,'/apply'),1);await ui(p,'已安装但未加载、健康未知');
  const inspecting=p.waitForResponse(r=>new URL(r.url()).pathname===PREFIX+'/inspect');await button(d,'明确检查常驻状态').click();assert((await inspecting).ok());await p.waitForFunction(()=>[...document.querySelectorAll('[role=dialog] dt')].some(e=>e.textContent==='配置文件已安装'&&e.nextElementSibling.textContent==='是'));await inspectRows(d,{'配置文件已安装':'是','用户服务已加载':'否','运行健康':'未知'});
  assert(!(await history.innerText()).includes('<?xml'),'历史仅留元数据，不混完整配置正文');

  // 主操作尚未返回时，独立历史check先完成，不能把汇总busy清为false。
  const second=await preview(d,p,s,'install');s.applyGate=gate();const secondHeld=s.applyGate;await sameEventConfirm(d,p);assert.equal(count(s,'/apply'),2);
  await button(history,'查询常驻操作记录 '+first.operationId).click();await history.locator('.capability-result').getByText('等待本人在终端处理服务',{exact:true}).waitFor();
  await p.keyboard.press('Escape');assert.equal(await d.count(),1,'history先完成不解除main busy的Esc门禁');assert.equal(count(s,'/apply'),2);secondHeld.release();s.applyGate=null;
  await button(history,'查询常驻操作记录 '+second.operationId).waitFor();assert.deepEqual(f.mutations(),[]);await ui(p,'主操作与历史查询并发的合成门禁');

  // 真正执行已留日志、仅响应丢失；UI必须只查询该ID，不再执行。
  const third=await preview(d,p,s,'install'),beforeCheck=count(s,'/check');s.unknownResponse=true;await button(d,'确认本次常驻变更').click();await mainResult(d).getByText('结果未知，请先查询',{exact:true}).waitFor();assert.equal(count(s,'/apply'),3);assert.equal(count(s,'/check'),beforeCheck,'未知不自动查询');
  assert.equal(await button(d,'确认本次常驻变更').count(),0);assert.equal(await button(d,'预览安装常驻').isDisabled(),true);assert.equal(await button(d,'预览卸载常驻').isDisabled(),true);
  s.unknownResponse=false;await button(d,'查询未确认的常驻变更').click();await mainResult(d).getByText('等待本人在终端处理服务',{exact:true}).waitFor();assert.deepEqual(s.calls.filter(c=>c.path==='/check').at(-1).body,{operationId:third.operationId});assert.equal(count(s,'/apply'),3,'check不重放');
  await button(d,'读取常驻操作记录').click();await button(history,'预览回滚常驻操作记录 '+third.operationId).waitFor();await button(history,'预览回滚常驻操作记录 '+third.operationId).click();await button(history,'确认回滚本次操作').waitFor();assert.equal(count(s,'/rollback'),0);await ui(p,'常驻历史备份恢复预览');const rollbackResponse=p.waitForResponse(r=>new URL(r.url()).pathname===PREFIX+'/rollback');await button(history,'确认回滚本次操作').click();assert.equal((await rollbackResponse).ok(),true);await history.locator('.capability-result').getByText('回滚已回读',{exact:true}).waitFor();assert.equal(count(s,'/rollback'),1);assert.deepEqual(f.mutations(),[],'回滚不抢占5178');

  // 仅合成操作者释放端口，UI显式确认后才模拟bootstrap固定Label。
  f.set({isOccupied:false});const free=await preview(d,p,s,'install');assert.equal(free.portOccupied,false);assert.deepEqual(f.mutations(),[]);await confirm(d,p,'写后回读一致');await button(history,'查询常驻操作记录 '+free.operationId).waitFor();assert.equal(f.mutations().length,1);assert.equal(f.mutations()[0][0],'bootstrap');
  const loadedInspect=p.waitForResponse(r=>new URL(r.url()).pathname===PREFIX+'/inspect');await button(d,'明确检查常驻状态').click();assert((await loadedInspect).ok());await p.waitForFunction(()=>[...document.querySelectorAll('[role=dialog] dt')].some(e=>e.textContent==='用户服务已加载'&&e.nextElementSibling.textContent==='是'));await inspectRows(d,{'配置文件已安装':'是','用户服务已加载':'是','运行健康':'未知'});
  await preview(d,p,s,'uninstall');const currentPlist=f.memory.text(f.plistPath);await confirm(d,p,'等待本人在终端处理服务');assert.equal(f.memory.text(f.plistPath),currentPlist,'已加载服务保留plist，等待本人先停止');assert.equal(f.mutations().length,1,'卸载运行中不bootout、不追加bootstrap');assert.equal(s.calls.some(c=>c.path==='/stop'),false,'常驻没有自动停止接口');

  // 用户本人终端动作仅在合成状态中模拟，不派发任何真实启停命令。
  f.set({isLoaded:false,isOccupied:true});const stopped=await preview(d,p,s,'uninstall');assert.equal(stopped.loaded,false);await confirm(d,p,'写后回读一致');await button(history,'预览回滚常驻操作记录 '+stopped.operationId).waitFor();assert.equal(f.memory.text(f.plistPath),null);assert.equal(f.mutations().length,1);
  await button(history,'预览回滚常驻操作记录 '+stopped.operationId).click();await button(history,'确认回滚本次操作').waitFor();const restored=p.waitForResponse(r=>new URL(r.url()).pathname===PREFIX+'/rollback');await button(history,'确认回滚本次操作').click();assert.equal((await restored).ok(),true);await history.locator('.capability-result').getByText('回滚已回读',{exact:true}).waitFor();assert.equal(f.memory.text(f.plistPath),currentPlist);assert.equal(f.mutations().length,1);assert.equal(count(s,'/rollback'),2);
  await ui(p,`常驻卸载/回滚 ${width} long=${long}`);await motion(p,'[role="dialog"]');await axe(p,'常驻运行中reduce');await p.keyboard.press('Escape');await d.waitFor({state:'detached'});assert.equal(await capabilitySwitch(p,'daemon').evaluate(e=>e===document.activeElement),true,'全流程Esc回焦');
  assertRequests(s,origin);assert(f.counts.port.every(port=>port===5178));assert(f.counts.launch.every(args=>['print','bootstrap'].includes(args[0])));assert.equal(f.counts.host,0);assert.deepEqual(routeErrors,[]);assert.deepEqual(forbidden,[]);
  await p.context().close();await app.close();app=null;
 }
 assert.deepEqual(errors,[]);assert.deepEqual(routeErrors,[]);assert.deepEqual(forbidden,[]);
 console.log('PASS 常驻合成UI：默认仅status/完整plist预览/显式安装卸载/占用端口0启停/安装加载健康分别核验/失败保留/同事件click+Esc/refbusy/history先完成不解main busy/unknown只check/备份回滚/320390普通及长中英文逐元素44px/axe/运行中reduce/精确origin零宿主请求');
}finally{await browser.close();await app?.close();}

// 四份能力UI专项的附加门禁。只增加严格origin、非空分母及同步busy检查。
import assert from 'node:assert/strict';
export async function installCapabilityRequestGuard(page,url){
 const origin=new URL(url).origin,requests=[],blocked=[];
 const allowed=value=>{const u=new URL(value);return u.protocol==='data:'||u.origin===origin;};
 page.on('request',r=>requests.push({url:r.url(),method:r.method(),path:new URL(r.url()).pathname}));
 await page.context().route('**/*',async route=>{if(!allowed(route.request().url())){blocked.push(new URL(route.request().url()).origin);return route.abort('blockedbyclient');}return route.continue();});
 return{requests,assertNoExternal(required=[]){
  assert(requests.length>0,'请求断言必须有实际请求，every([])不能通过');
  for(const path of required)assert(requests.some(r=>r.path===path),'实际请求未进入清单：'+path);
  assert.deepEqual(blocked,[],'外部请求已被阻断，仍判专项失败');
  assert.deepEqual(requests.filter(r=>!allowed(r.url)).map(r=>r.url),[],'仅本次临时app的精确origin；其它本机端口也拒绝');
 }};
}
export async function sameEventClickAndEscape(page,locator,path){
 const observed=page.waitForRequest(r=>new URL(r.url()).pathname===path&&r.method()==='POST');
 const connected=await locator.evaluate(e=>{const parent=e.closest('[role="dialog"]');e.focus();e.click();e.click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return parent?.isConnected===true;});
 await observed;assert.equal(connected,true,'同事件click+click+Esc：原dialog必须仍连接，写入只有一次');
}

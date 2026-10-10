const LOCAL_BASE='http://127.0.0.1:5178';
const storageReady=chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
function xhsSender(sender) {
  if(sender.id!==chrome.runtime.id || !sender.tab || sender.frameId!==0)return false;
  try {const url=new URL(sender.url);return url.protocol==='https:' && ['www.xiaohongshu.com','m.xiaohongshu.com'].includes(url.hostname);}catch{return false;}
}
function noteId(value) {try {const url=new URL(value);return url.pathname.match(/\b[a-f0-9]{24}\b/gi)?.at(-1)?.toLowerCase() || url.searchParams.get('note_id') || url.searchParams.get('noteId') || '';}catch{return '';}}
async function call(path,data) {
  await storageReady;
  const {collectionToken}=await chrome.storage.local.get('collectionToken');
  if(!/^[a-f0-9]{64}$/.test(collectionToken||''))throw Object.assign(new Error('点 Chrome 地址栏右侧的拼图图标 → 数码世界·收藏，填写配对码'),{operationNotStarted:true,statusCode:403});
  const response=await fetch(LOCAL_BASE+'/api/collection/clip'+path,{method:data?'POST':'GET',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-Collection-Token':collectionToken},...(data?{body:JSON.stringify(data)}:{})});
  const payload=await response.json();if(!response.ok)throw Object.assign(new Error(payload.error||'本机收藏服务未响应'),{statusCode:response.status,operationNotStarted:!path&&[400,403,415,429].includes(response.status)});return payload;
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(!['IMPORT_NOTE','GET_IMPORT_STATUS'].includes(message?.type))return false;
  (async()=>{
    if(!xhsSender(sender))throw new Error('只能从当前小红书详情收藏');
    if(!/^[a-f0-9-]{36}$/.test(message.operationId||''))throw new Error('收藏操作编号无效');
    if(message.type==='GET_IMPORT_STATUS')return call('/status/'+message.operationId);
    const note=message.note;let url;try{url=new URL(note?.sourceUrl);}catch{throw new Error('来源无效');}
    if(url.protocol!=='https:' || !['www.xiaohongshu.com','m.xiaohongshu.com'].includes(url.hostname) || note.id!==noteId(url.href) || !/^[a-f0-9]{24}$/.test(note.id) || JSON.stringify(note).length>2*1024*1024)throw new Error('笔记与当前来源不匹配');
    await chrome.storage.local.set({lastOperation:{id:message.operationId,noteId:note.id,at:Date.now()}});
    try {return await call('',{note,operationId:message.operationId});}catch(error){return await call('/status/'+message.operationId).catch(()=>{throw error;});}
  })().then(payload=>sendResponse({ok:true,...payload})).catch(error=>sendResponse({ok:false,error:error.message,statusCode:error.statusCode,operationNotStarted:error.operationNotStarted===true}));
  return true;
});

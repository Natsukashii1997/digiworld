const LOCAL_BASE='http://127.0.0.1:5178';
let messageQueue=Promise.resolve();
const storageReady=chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
function supportedSender(sender) {
  if(sender.id!==chrome.runtime.id || !sender.tab || sender.frameId!==0)return false;
  try {const url=new URL(sender.url);return url.protocol==='https:' && !url.username && !url.password && !url.port && ['www.xiaohongshu.com','m.xiaohongshu.com','www.douyin.com'].includes(url.hostname);}catch{return false;}
}
function noteId(value) {try {const url=new URL(value);if(url.hostname==='www.douyin.com'){const id=url.searchParams.get('modal_id')||url.pathname.match(/^\/(?:video|note)\/(\d{15,25})\/?$/)?.[1];return /^\d{15,25}$/.test(id||'')?'douyin-'+id:'';}return url.pathname.match(/\b[a-f0-9]{24}\b/gi)?.at(-1)?.toLowerCase() || url.searchParams.get('note_id') || url.searchParams.get('noteId') || '';}catch{return '';}}
async function call(path,data) {
  await storageReady;
  const {collectionToken}=await chrome.storage.local.get('collectionToken');
  if(!/^[a-f0-9]{64}$/.test(collectionToken||''))throw Object.assign(new Error('点 Chrome 地址栏右侧的拼图图标 → 数码世界·收藏，填写配对码'),{operationNotStarted:true,statusCode:403});
  const response=await fetch(LOCAL_BASE+'/api/collection/clip'+path,{method:data?'POST':'GET',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-Collection-Token':collectionToken},...(data?{body:JSON.stringify(data)}:{})});
  const payload=await response.json();if(!response.ok)throw Object.assign(new Error(payload.error||'本机收藏服务未响应'),{statusCode:response.status,operationNotStarted:!path&&[400,403,415,429].includes(response.status)});return payload;
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(!['IMPORT_NOTE','GET_IMPORT_STATUS'].includes(message?.type))return false;
  const work=messageQueue.then(async()=>{
    if(!supportedSender(sender))throw new Error('只能从当前小红书或抖音作品详情收藏');
    if(!/^[a-f0-9-]{36}$/.test(message.operationId||''))throw new Error('收藏操作编号无效');
    await storageReady;
    const {collectionPending={}}=await chrome.storage.local.get('collectionPending');
    const finish=async payload=>{if(['complete','failed','interrupted'].includes(payload.status)){for(const key of Object.keys(collectionPending))if(collectionPending[key]===payload.id)delete collectionPending[key];await chrome.storage.local.set({collectionPending});}return payload;};
    if(message.type==='GET_IMPORT_STATUS')return finish(await call('/status/'+message.operationId));
    const mode=message.mode || 'direct';
    if(!['direct','get'].includes(mode))throw new Error('收藏模式无效');
    const note=message.note;let url;try{url=new URL(note?.sourceUrl);}catch{throw new Error('来源无效');}
    if(new URL(sender.url).hostname!==url.hostname || (url.hostname==='www.douyin.com' && noteId(sender.url)!==note.id) || url.protocol!=='https:' || url.username || url.password || url.port || !['www.xiaohongshu.com','m.xiaohongshu.com','www.douyin.com'].includes(url.hostname) || note.id!==noteId(url.href) || !/^(?:[a-f0-9]{24}|douyin-\d{15,25})$/.test(note.id) || JSON.stringify(note).length>2*1024*1024)throw new Error('笔记与当前来源不匹配');
    const key=note.id+':'+mode,existing=collectionPending[key],operationId=existing || message.operationId;
    if(existing){try{return await finish(await call('/status/'+operationId));}catch(error){if(mode==='get')return {id:operationId,status:'unknown',error:'收藏记录待核对，请在工作台查看GET状态；不会自动重提'};if(error.statusCode===404){delete collectionPending[key];await chrome.storage.local.set({collectionPending});}throw error;}}
    if(mode==='get'){let capabilities;try{capabilities=await call('/capabilities');}catch{throw Object.assign(new Error('GET收藏尚未启用，请先更新并启动本机工作台'),{operationNotStarted:true});}if(capabilities.getAnalysis!==true)throw Object.assign(new Error('GET收藏尚未启用，请先更新并启动本机工作台'),{operationNotStarted:true});}
    if(Object.keys(collectionPending).length>=100)throw new Error('待核对收藏过多，请先在工作台核对');
    collectionPending[key]=operationId;
    await chrome.storage.local.set({collectionPending,lastOperation:{id:operationId,noteId:note.id,mode,at:Date.now()}});
    try {return await finish(await call('',{note,operationId,mode}));}
    catch(error){
      if(error.operationNotStarted){delete collectionPending[key];await chrome.storage.local.set({collectionPending});throw error;}
      return await call('/status/'+operationId).then(finish).catch(()=>{throw error;});
    }
  });
  messageQueue=work.catch(()=>{});
  work.then(payload=>sendResponse({ok:true,...payload})).catch(error=>sendResponse({ok:false,error:error.message,statusCode:error.statusCode,operationNotStarted:error.operationNotStarted===true}));
  return true;
});

const token=document.getElementById('token'),status=document.getElementById('status');
const ready=chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
ready.then(()=>chrome.storage.local.get(['collectionToken','lastOperation'])).then(value=>{token.value=value.collectionToken||'';status.textContent=value.collectionToken?'已配对': '未配对';if(value.lastOperation)status.textContent+=` · 最近操作 ${value.lastOperation.id.slice(0,8)}`;});
document.getElementById('pair').addEventListener('submit',async event=>{event.preventDefault();await ready;await chrome.storage.local.set({collectionToken:token.value.trim()});status.textContent='配对已保存';});
document.getElementById('clear').addEventListener('click',async()=>{await ready;await chrome.storage.local.remove('collectionToken');token.value='';status.textContent='本插件的配对已清除';});
document.getElementById('open').addEventListener('click',()=>chrome.tabs.create({url:'http://127.0.0.1:5178/#learning'}));

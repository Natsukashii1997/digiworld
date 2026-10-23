const native=()=>window.webkit?.messageHandlers?.floatingNotes;
export const hostMessage=(action,value)=>native()?.postMessage({action,value});
export const isNative=()=>!!native();
export function recoveryStorage(){
 const noteId=new URLSearchParams(location.search).get('noteId');const key='floating-notes-recovery-v1'+(noteId?'-note:'+noteId:'');let locked=false;
 return {
  async load(){
   if(native())return hostMessage('loadDrafts');
   if(!navigator.locks)throw Error('此浏览器暂不支持安全保存草稿，请使用桌面便签栏。');
   if(!locked)await new Promise((resolve,reject)=>navigator.locks.request(key,{ifAvailable:true},async lock=>{
    if(!lock){reject(Error('便签栏已在另一窗口打开，请在那里继续。'));return;}locked=true;resolve();await new Promise(done=>window.addEventListener('pagehide',done,{once:true}));locked=false;
   }).catch(reject));
   const raw=localStorage.getItem(key);return raw?JSON.parse(raw):null;
  },
  async save(value){
   if(native()){await hostMessage('saveDrafts',value);return;}
   if(!locked)throw Error('草稿窗口尚未就绪');const raw=JSON.stringify(value);localStorage.setItem(key,raw);if(localStorage.getItem(key)!==raw)throw Error('草稿回读不一致');
  }
 };
}

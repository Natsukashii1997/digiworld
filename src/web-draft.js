// Unfinished page input only. Formal records still belong to the workspace API.
const SHA=/^[a-f0-9]{64}$/;
export function webDraftKey(root,scope){
 if(!SHA.test(root||'')||!/^[a-z][a-z0-9:-]{0,80}$/.test(scope))throw Error('本机草稿身份无法核验，请重新连接。');
 return `workbench:web-draft:v1:${root}:${scope}`;
}
export function openDraftRecord(storage,key,validate=()=>true){
 let raw=storage.getItem(key),closed=false;
 function decode(text){
  if(text===null)return null;
  if(text.length>2500000)throw Error('本机草稿超过容量，原内容已保留。');
  let row;try{row=JSON.parse(text);}catch{throw Error('本机草稿需要核对，原内容已保留。');}
  if(row?.version!==1||!Number.isSafeInteger(row.sequence)||row.sequence<1||!validate(row.value))throw Error('本机草稿需要核对，原内容已保留。');
  return row;
 }
 let row=decode(raw);
 return {
  read:()=>structuredClone(row?.value??null),
  save(value){
   if(closed)throw Error('页面已关闭，原草稿保留待核对。');
   if(storage.getItem(key)!==raw)throw Error('草稿已在别处变化，当前输入未覆盖它，请保留窗口。');
   if(!validate(value))throw Error('输入尚未完整，草稿未更新，请保留窗口。');
   const next={version:1,sequence:(row?.sequence||0)+1,value};
   const encoded=JSON.stringify(next);
   if(encoded.length>2500000)throw Error('本机草稿区容量不足，请先保存已有内容。');
   try{storage.setItem(key,encoded);if(storage.getItem(key)!==encoded)throw Error();}
   catch{throw Error('草稿暂时无法留在本机，请保留窗口并重试。');}
   raw=encoded;row=structuredClone(next);return next.sequence;
  },
  close(){closed=true;},
 };
}

import {noteContent} from './note-image-model.js';
import {stringify} from './serialization.js';
const same=(a,b)=>stringify(a)===stringify(b);
const conflict=()=>Object.assign(new Error('这项内容已在别处修改，当前输入已保留，请核对后再保存。'),{status:409});
function mergeNotes(before,desired,current){
 const original=new Map(before.map(n=>[n.id,n])),edits=new Map(desired.map(n=>[n.id,n])),fresh=new Map(current.map(n=>[n.id,n]));
 for(const [id,old] of original){
  const next=edits.get(id),actual=fresh.get(id);
  if(same(old,next))continue;
  if(!next){if(actual&&!same(actual,old))throw conflict();fresh.delete(id);continue;}
  if(!actual)throw conflict();
  const result={...actual};
  const content=noteContent;const fields=['text','format','images','type','title','rich'];
  if(!same(content(old),content(next))){
   if(!same(content(actual),content(old))&&!same(content(actual),content(next)))throw conflict();
   for(const key of fields){if(next[key]===undefined)delete result[key];else result[key]=next[key];}
  }
  for(const key of new Set([...Object.keys(old),...Object.keys(next)])){
   if(fields.includes(key)||same(old[key],next[key]))continue;
   if(!same(actual[key],old[key])&&!same(actual[key],next[key]))throw conflict();
   if(next[key]===undefined)delete result[key];else result[key]=next[key];
  }
  fresh.set(id,result);
 }
 for(const [id,note] of edits){
  if(original.has(id))continue;
  if(fresh.has(id)&&!same(fresh.get(id),note))throw conflict();
  fresh.set(id,note);
 }
 const order=[...desired.map(n=>n.id),...current.map(n=>n.id)];
 return [...new Set(order)].filter(id=>fresh.has(id)).map(id=>fresh.get(id));
}
// Apply only the user's changes to a newly read workspace; never overwrite an unrelated newer field.
export function rebaseWorkspaceEdit(before,desired,current){
 if(!before||!current)throw conflict();
 if(before.revision!==desired.revision)throw conflict();
 if(before.revision===current.revision)return desired;
 const result={...current};
 for(const key of new Set([...Object.keys(before),...Object.keys(desired)])){
  if(key==='revision'||same(before[key],desired[key]))continue;
  if(key==='notes'){result.notes=mergeNotes(before.notes,desired.notes,current.notes);continue;}
  if(!same(current[key],before[key])&&!same(current[key],desired[key]))throw conflict();
  if(desired[key]===undefined)delete result[key];else result[key]=desired[key];
 }
 return result;
}

// Retry only a confirmed pre-commit revision rejection. Transport/commit uncertainty must be reconciled by the caller.
export async function saveWorkspaceEdit(before,desired,read,write,adopt=()=>{}){
 for(let attempt=0;attempt<3;attempt++){
  const current=await read();adopt(current);
  const next=rebaseWorkspaceEdit(before,desired,current);
  try{return await write(next);}catch(error){if(!error.revisionConflict||attempt===2)throw error;}
 }
}

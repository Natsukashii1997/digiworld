// Shared, bounded note metadata. Legacy notes have no metadata and remain byte-for-byte intact.
export const NOTE_TYPES=[['plain','普通便签'],['todo','待办事项'],['timeline','时间轴']];
const control=/[\x00-\x08\x0b-\x1f\x7f]/;
export const noteType=n=>n?.type||'plain';
export const noteTitle=n=>n?.title||NOTE_TYPES.find(([type])=>type===noteType(n))?.[1]||'普通便签';
export function validNoteMeta(n){
 return !!n&&(n.type===undefined||NOTE_TYPES.some(([type])=>type===n.type))&&
  (n.title===undefined||typeof n.title==='string'&&n.title.length<=120&&!/[\r\n]/.test(n.title)&&!control.test(n.title));
}
export function noteMeta(n){return {...(n?.type?{type:n.type}:{}),...(n?.title!==undefined?{title:n.title}:{})};}
export const hasNoteContent=n=>!!(n?.title?.trim()||n?.images?.length||(n?.rich?n.rich.lines.some(l=>l.runs.some(r=>r.text.trim())):n?.text?.replace(/^(- \[[ xX]\] ?|[-*] |\d+\. )/gm,'').trim()));

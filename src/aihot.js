import {learningOf} from './learning.js';
const TOPICS = {'ai-models':['模型','orange'],'ai-products':['产品','pink'],industry:['行业','yellow'],paper:['研究','violet'],tip:['方法','cyan'],研究:['研究','violet'],工程:['工程','cyan'],模型:['模型','orange'],评测:['评测','yellow'],工具:['工具','lime'],端侧:['端侧','pink'],方法:['方法','cyan'],实践:['实践','lime'],产品:['产品','pink']};
export function topicTag(category) {
 if(typeof category!=='string'||!category.trim())return null;
 const label=category.trim();const tag=TOPICS[label];return {label:tag?.[0]||label,tone:tag?.[1]||'cyan'};
}
export const aihotFavorites = state => learningOf(state).links.filter(l=>l.origin==='aihot'&&!l.deletedAt).length;
const valid = value => typeof value==='string' && value && Number.isFinite(Date.parse(value));
const stamp = value => valid(value) ? new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '时间未知';
export function aihotDate(cache) {
 const value=cache?.sections?.selected?.fetchedAt||cache?.lastSuccessAt;
 if(!valid(value))return null;const d=new Date(value);return {month:d.getMonth()+1,day:d.getDate()};
}
export function aihotUpdateText(cache,interval=3) {
 if(cache?.status==='failed') {
  const selected=cache.sections?.selected?.fetchedAt,hot=cache.sections?.hot?.fetchedAt;
  if(valid(selected)&&valid(hot)&&Date.parse(selected)!==Date.parse(hot))return `更新失败，精选 ${stamp(selected)} · 热点 ${stamp(hot)} 的内容`;
  return `更新失败，显示的是 ${stamp(selected||hot||cache.lastSuccessAt)} 的内容`;
 }
 const value=cache?.sections?.selected?.fetchedAt||cache?.lastSuccessAt;
 return `更新于 ${valid(value)?new Date(value).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):'时间未知'} · 每 ${interval} 小时`;
}

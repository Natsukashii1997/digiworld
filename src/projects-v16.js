import { startPrompt } from './collab.js';
import { filterRelayText } from './relay-prompt.js';
import { relayDeskSection } from './relay-desk.js';
export const readableCurrent = item => ['ok','partial'].includes(item?.current?.state);
// 可以「继续」：有协作状态表，或没有表但读到了“最近进展”（outline；不推断写入者、阶段、停滞）。
export const continuableCurrent = item => readableCurrent(item) || item?.current?.state === 'outline';
export function sortSaveItems(items) {
 return [...items].sort((a,b)=>{
  const stalled=x=>readableCurrent(x)&&x.activity?.state==='stalled';
  return Number(stalled(a))-Number(stalled(b)) || (readableCurrent(b)?Date.parse(b.activity?.latestAt)||0:0)-(readableCurrent(a)?Date.parse(a.activity?.latestAt)||0:0) || a.projectId.localeCompare(b.projectId);
 });
}
export function groupProjectRacks(projects,roots) {
 const trim=s=>s.replace(/\/$/,''),ordered=roots.map(trim).sort((a,b)=>b.length-a.length),groups=new Map();
 for(const p of projects){const path=p.localPaths[0],root=path&&ordered.find(r=>path===r||path.startsWith(r+'/')),key=!path?'github':root||'other';
  if(!groups.has(key))groups.set(key,{key,label:key==='github'?'GitHub':key==='other'?'其他位置':root,items:[]});groups.get(key).items.push(p);
 }
 const rank=g=>g.key==='github'?1e6:g.key==='other'?1e5:roots.map(trim).indexOf(g.key);
 return [...groups.values()].sort((a,b)=>rank(a)-rank(b)).map(g=>({...g,items:g.items.sort((a,b)=>(Date.parse(b.recentUpdate?.at)||0)-(Date.parse(a.recentUpdate?.at)||0)||a.id.localeCompare(b.id))}));
}
export const portfolioSections = [
 {id:'personal',label:'个人产品'},
 {id:'business',label:'业务系统'},
 {id:'knowledge',label:'知识与能力'},
 {id:'tools',label:'维护工具'},
 {id:'completed',label:'阶段成果'},
];
export function groupPortfolioSections(projects,catalog=[]) {
 const byId=new Map(catalog.map(item=>[item.projectId,item]));
 return portfolioSections.map(section=>({
  key:section.id,label:section.label,
  items:projects.filter(project=>{
   const item=byId.get(project.id);
   return item?.view==='main'&&item.section===section.id;
  }).sort((a,b)=>a.name.localeCompare(b.name,'zh')),
 })).filter(section=>section.items.length);
}
// desk：阶段 2 的收件与装备（relay-desk.js 的 relayDesk 结果）；没有时口令与原来一致。
export function projectRelayPrompt(item,agent,desk) {
 const f=item.current?.fields||{},h=f.handoff;
 const canonical=agent==="claude"?"claude-code":agent;
 const raw=startPrompt(item,canonical,{next:desk?.next?.text})+(h?`\n3. 最新交接：${h.href||h.text}${h.href&&h.text?'（'+h.text+'）':''}`:'\n3. 最新交接：未记录，接手后核对。')+(desk?relayDeskSection(desk):'');
 const result=filterRelayText(raw);return {prompt:result.text,redactions:result.count};
}

import test from 'node:test';import assert from 'node:assert/strict';
import {seed} from '../src/store.js';import {pendingItems,inboxBadge,inboxSummary,projectSavepointAge} from '../src/pending.js';
const item=triage=>({id:String(triage),triage});
test('四态角标精确数字与三段ARIA；未知分诊归情报，不丢弃',()=>{
 for(const [items,tone,count] of [[[item('需要决定'),item('等你确认'),item('顺手看看')],'red',2],[[item('等你确认')],'yellow',1],[[item(null),item('顺手看看')],'cyan',2],[[],'',0]]){
  const badge=inboxBadge(items);assert.equal(badge.tone,tone);assert.equal(badge.count,count);assert.match(badge.label,/主线 \d+，支线 \d+，情报 \d+/);assert.equal(inboxSummary(items).reduce((n,g)=>n+g.count,0),items.length);
 }
});
test('批准取消的三个来源不再进入待处理，原数据保留；建议按批准归支线',()=>{
 const s=seed();s.notes=[{id:'n',at:'2026-01-01',text:'合成'}];s.knowledgeTasks=[{archived:false}];s.profileProposals=[{id:'p',status:'pending',reason:'合成',proposer:'Codex',path:'个人上下文/合成.md',createdAt:'2026-01-02T00:00:00Z'}];
 const items=pendingItems(s);assert(!items.some(i=>['knowledge-tasks','notes-local','notes-receipts-unknown'].includes(i.id)));assert.equal(items.find(i=>i.id==='profile-p').triage,'等你确认');assert.equal(s.notes.length,1);assert.equal(s.knowledgeTasks.length,1);
});
test('未存档严格超过3天；同目录回读优先，目录变化/冲突/部分/无时间不编卡',()=>{
 const now=Date.parse('2026-10-06T10:00:00Z'),p={id:'p',name:'合成项目',localPaths:['/synthetic/p'],recentUpdate:{state:'ok',source:'Git',at:'2026-10-03T10:00:00Z'}};
 const get=(project,savepointReads={})=>pendingItems({...seed(),connections:{projects:[project]}},undefined,undefined,undefined,undefined,undefined,{now,savepointReads});
 assert.equal(get(p).length,0);p.recentUpdate.at='2026-10-03T09:59:59Z';assert.equal(get(p)[0].projectId,'p');assert.equal(get(p)[0].to,'history');
 const read={root:p.localPaths[0],locations:JSON.stringify(p.localPaths),lastAt:'2026-10-06T09:00:00Z'};assert.equal(get(p,{p:read}).length,0);
 for(const changed of [{...p,identityConflict:true},{...p,localPaths:[]},{...p,localPaths:['a','b']},{...p,recentUpdate:{...p.recentUpdate,state:'partial'}},{...p,recentUpdate:{...p.recentUpdate,source:'GitHub'}},{...p,recentUpdate:{...p.recentUpdate,at:'invalid'}}])assert.equal(projectSavepointAge(changed,null,now),null);
 assert.equal(get(p,{p:{...read,lastAt:null}}).length,0,'明确无最后存档不退回旧Git时间');
});
test('只按已读且明确未运行的MCP摘要生成主线，失败/未读/无字段保持未知',()=>{
 const get=knowledgeStatus=>pendingItems(seed(),undefined,undefined,undefined,undefined,undefined,{knowledgeStatus});
 for(const status of [{loaded:false,mcp:{url:null}},{loaded:true,loadError:'失败',mcp:{url:null}},{loaded:true,mcp:null},{loaded:true,mcp:{url:'http://synthetic:123'}}])assert.equal(get(status).length,0);
 const row=get({loaded:true,mcp:{url:null,error:'未启用'},observedAt:'2026-10-06T00:00:00Z'})[0];assert.equal(row.triage,'需要决定');assert.equal(row.foundAt,'2026-10-06T00:00:00Z');
});

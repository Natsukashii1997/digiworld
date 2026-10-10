import test from 'node:test';import assert from 'node:assert/strict';
import {seed,current} from '../src/store.js';import {TRIAGE_RULES,triageItems,pendingItems,triageSummary} from '../src/pending.js';import {diffText} from '../src/version-diff.js';
test('每条分诊规则不看标题，未知类型不猜；缺时间与非法时间均未知',()=>{
 const s=seed(),a=s.assets[0];const entries=TRIAGE_RULES.map(([id,label])=>({id:id.endsWith('-')?id+'fixture':id,title:'完全相同的标题',assetId:a.id,foundAt:null,expected:label}));
 for(const item of entries){const got=triageItems([item],s)[0];assert.equal(got.triage,item.expected);assert.equal(triageItems([{...item,title:'不同标题'}],s)[0].triage,got.triage);}
 assert.equal(triageItems([{id:'new-source',foundAt:'bogus'}],s)[0].triage,null);assert.equal(triageItems([{id:'new-source',foundAt:'bogus'}],s)[0].foundAt,null);
});
test('发现时间取原记录，已知旧到新、未知最后，摘要同一selector',()=>{
 const s=seed();s.notes=[];s.profileProposals=[{id:'p',status:'pending',path:'个人上下文/合成.md',reason:'合成',proposer:'Codex',createdAt:'2026-01-01T00:00:00Z'}];
 assert.equal(pendingItems(s,undefined,undefined,undefined,undefined,{loaded:true,noteIds:[]})[0].foundAt,s.profileProposals[0].createdAt);assert.deepEqual(triageSummary(pendingItems(s,undefined,undefined,undefined,undefined,{loaded:true,noteIds:[]})),[{label:'需要决定',count:0},{label:'等你确认',count:1},{label:'顺手看看',count:0}]);
 const rows=triageItems([{id:'night-v2-morning-c',foundAt:null},{id:'night-v2-morning-b',foundAt:'2026-01-02T00:00:00Z'},{id:'night-v2-morning-a',foundAt:'2026-01-01T00:00:00Z'}],s);assert.deepEqual(rows.map(x=>x.id),['night-v2-morning-a','night-v2-morning-b','night-v2-morning-c']);
});
test('5000行精确LCS，重复行及混合换行无损，线性内存路径性能',()=>{
 const a=Array.from({length:5000},(_,i)=>`${i}\n`).join(''),b=a.replace('2500\n','新增\r\n');const start=performance.now();const r=diffText(a,b);assert.equal(r.mode,'lines');assert.equal(r.rows.filter(x=>x.type==='removed').length,1);assert.equal(r.rows.filter(x=>x.type==='added').length,1);
 assert.equal(r.rows.filter(x=>x.type!=='added').map(x=>x.text).join(''),a);assert.equal(r.rows.filter(x=>x.type!=='removed').map(x=>x.text).join(''),b);assert(performance.now()-start<2000,'5000行有界性能');
});

test("5000行无公共行的LCS最坏输入也完整精确且有界",()=>{ const a=Array.from({length:5000},(_,i)=>`A${i}\n`).join(""),b=Array.from({length:5000},(_,i)=>`B${i}\n`).join(""),at=performance.now(),r=diffText(a,b);assert.equal(r.mode,"lines");assert.equal(r.rows.filter(x=>x.type==="removed").length,5000);assert.equal(r.rows.filter(x=>x.type==="added").length,5000);assert.equal(r.rows.filter(x=>x.type!=="added").map(x=>x.text).join(""),a);assert.equal(r.rows.filter(x=>x.type!=="removed").map(x=>x.text).join(""),b);assert(performance.now()-at<2000,"5000行最坏输入不超性能界限");});

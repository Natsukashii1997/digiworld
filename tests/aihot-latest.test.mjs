import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAiHot,sanitizeItem} from '../server/aihot.mjs';
import {aihotItemDate,aihotRangeText} from '../src/aihot.js';

test('精选使用近7天、10条上限，保留来源顺序；不足不补齐，失败保留原缓存',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'aihot-latest-'));
 let count=12,fail=false;const calls=[];
 const fetch=async url=>{
  const path=new URL(url).pathname+new URL(url).search;calls.push(path);
  if(path==='/api/v1/items?mode=selected&window=7d&limit=10'){
   if(fail)throw Error('synthetic selected failure');
   return Response.json({items:Array.from({length:count},(_,i)=>({title:`来源顺序 ${12-i}`,links:{original:`https://example.com/item/${i}`},publishedAt:'2026-10-18T22:30:00Z',discoveredAt:'2026-10-19T01:00:00Z'}))});
  }
  if(path==='/api/v1/hot-topics')return Response.json({items:[]});
  if(path==='/api/v1/dailies?limit=1')return Response.json([{date:'2026-10-19'}]);
  if(path==='/api/v1/dailies/2026-10-19')return Response.json({items:[]});
  throw Error(`unexpected URL: ${url}`);
 };
 const service=createAiHot({directory,fetch});
 try{
  let result=await service.refresh();
  assert.equal(result.cache.sections.selected.window,'7d');
  assert.deepEqual(result.cache.sections.selected.items.map(i=>i.title),Array.from({length:10},(_,i)=>`来源顺序 ${12-i}`));
  assert.equal(calls[0],'/api/v1/items?mode=selected&window=7d&limit=10');
  assert.equal(aihotRangeText(result.cache),'近7天');
  assert.equal((await service.status()).cache.sections.selected.window,'7d','scope persists through readback');
  count=3;result=await service.refresh();
  assert.equal(result.cache.sections.selected.items.length,3);
  assert.match(aihotRangeText(result.cache),/仅有 3 条/);
  const kept=result.cache.sections.selected;
  fail=true;result=await service.refresh();
  assert.equal(result.cache.status,'failed');
  assert.deepEqual(result.cache.sections.selected,kept,'failed refresh retains both records and their range');
  fail=false;count=0;result=await service.refresh();
  assert.equal(result.cache.sections.selected.items.length,0);
  assert.match(aihotRangeText(result.cache),/仅有 0 条/);
 }finally{service.close();await rm(directory,{recursive:true,force:true});}
});

test('旧缓存未记录范围时不冒充新7天结果',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'aihot-legacy-'));
 const service=createAiHot({directory,fetch:async()=>{throw Error('read must not fetch');}});
 try{
  await mkdir(join(directory,'aihot'),{recursive:true});
  await writeFile(join(directory,'aihot/cache.json'),JSON.stringify({schema:1,status:'ok',sections:{selected:{items:[{title:'旧精选'}]}}}));
  const {cache}=await service.status();
  assert.equal(cache.sections.selected.items.length,1);
  assert.match(aihotRangeText(cache),/上次缓存.*刷新后/);
 }finally{service.close();await rm(directory,{recursive:true,force:true});}
});

test('逐条日期使用北京时间，优先原文日期并带年月日',()=>{
 const result=aihotItemDate({publishedAt:'2026-12-31T18:25:00Z',discoveredAt:'2027-01-02T01:00:00Z'});
 assert.equal(result.value,'2026-12-31T18:25:00Z');
 assert.match(result.text,/2027\/01\/01 02:25/);
 assert.doesNotMatch(result.text,/收录/);
});

test('没有原文日期时保留并明确展示收录日期；未知日期不编造',()=>{
 const item=sanitizeItem({title:'缺原文时间',publishedAt:null,discoveredAt:'2026-10-18T18:05:00Z',extra:'discard'});
 assert.equal(item.publishedAt,'');
 assert.equal(item.discoveredAt,'2026-10-18T18:05:00.000Z');
 assert.equal('extra' in item,false);
 assert.match(aihotItemDate(item).text,/收录于 2026\/10\/19 02:05/);
 assert.deepEqual(aihotItemDate({publishedAt:'bad',discoveredAt:'bad'}),{value:'',text:'日期未知'});
 assert.equal('discoveredAt' in sanitizeItem({title:'日期坏值',discoveredAt:'bad'}),false);
});

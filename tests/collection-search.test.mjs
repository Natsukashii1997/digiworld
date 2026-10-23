import test from 'node:test';
import assert from 'node:assert/strict';
import {searchCollection} from '../src/collection-search.js';
test('收藏搜索白名单、跨字段、排除内部信息与数量上限',()=>{
 const note={id:'n',title:'标题词',content:'正文词',rawContent:'原文词',ocrText:'识别词',imageOcr:[{text:'图片词'}],transcriptText:'文稿词',transcriptSegments:[{text:'分段词'}],getAnalysis:{title:'GET标题词',content:'GET正文词'},author:{name:'作者词'},tags:['标签词'],category:'分类词',sourceUrl:'https://example.com/?token=私密词',imageUrls:['私密词'],operation:{secret:'私密词'}};
 const state={revision:3,notes:[note,{...note,id:'trash',deletedAt:'2026-01-01'}],desk:{groups:[{id:'g',name:'分组词'}],noteGroupMap:{n:'g'}}};
 for(const q of ['标题词 正文词','原文词','识别词','图片词','文稿词','分段词','GET标题词','GET正文词','作者词','标签词','分类词','分组词'])assert.equal(searchCollection(state,q).total,1,q);
 assert.equal(searchCollection(state,'私密词').total,0);
 state.notes=Array.from({length:25},(_,i)=>({...note,id:String(i)}));
 const found=searchCollection(state,'正文词');assert.equal(found.total,25);assert.equal(found.hits.length,20);assert.doesNotMatch(JSON.stringify(found),/私密词/);
});
test('收藏摘要保留变长Unicode和长关键词',()=>{
 const word='budget'+'x'.repeat(120);
 const r=searchCollection({notes:[{id:'1',content:'İ'.repeat(200)+word}]},word);
 assert.equal(r.total,1);assert.ok(r.hits[0].snippet.includes(word));
});

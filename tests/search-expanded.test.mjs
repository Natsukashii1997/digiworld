import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/store.js';
import {searchWorkspace} from '../src/search.js';

test('统一搜索定位未删除焚决的具体条目，名称和正文可跨字段匹配',()=>{
 const state=seed();
 state.scrolls=[{id:'s1',name:'销售方法',entries:[{id:'e1',name:'访谈提纲',text:'从预算问题开始',tags:[]},{id:'e2',name:'旧提纲',text:'已删除标记',deletedAt:'2026-01-01',tags:[]}]},{id:'s2',name:'已删除卷',deletedAt:'2026-01-01',entries:[{id:'e3',text:'回收正文',tags:[]}]}];
 const hits=searchWorkspace(state,'访谈 预算').scrolls;
 assert.equal(hits.length,1);assert.equal(hits[0].item.id,'e1');assert.equal(hits[0].scrollId,'s1');
 assert.match(hits[0].where,/名称.*正文/);assert.match(hits[0].snippet,/预算/);
 assert.equal(searchWorkspace(state,'已删除标记').scrolls.length,0);
 assert.equal(searchWorkspace(state,'回收正文').scrolls.length,0);
 assert.equal(searchWorkspace(state,'销售方法').scrolls[0].scrollId,'s1');
});

test('逆向只查当前可见任务包，排除历史版本、已删记录和私人过程字段',()=>{
 const state=seed(),target={kind:'web',url:'https://example.com',feature:'菜单'};
 state.reverseRecords=[{id:'r1',type:'FN',title:'菜单研究',material:{target},activePackVersionId:'v2',packVersions:[{id:'v1',target,result:{pack:'历史独有词'}},{id:'v2',target,result:{pack:'当前菜单的键盘交互细节'}}],nativeMessages:[{text:'私人过程词'}]},
 {id:'r2',type:'TXT',title:'回收包',material:{text:'回收独有词'},deletedAt:'2026-01-01'}];
 const hits=searchWorkspace(state,'键盘交互').reverse;
 assert.equal(hits.length,1);assert.equal(hits[0].item.id,'r1');assert.equal(hits[0].where,'当前任务包');assert.match(hits[0].snippet,/键盘交互/);
 for(const q of ['历史独有词','私人过程词','回收独有词'])assert.equal(searchWorkspace(state,q).reverse.length,0);
 state.reverseRecords[0].material.target={...target,feature:'另一目标'};
 assert.equal(searchWorkspace(state,'键盘交互').reverse.length,0);
});

test('逆向标题和来源不绕过当前任务包的敏感信息过滤',()=>{
 const s=seed();
 for(const data of [{title:'公开参照',url:'https://example.com/?token=secret620'}, {title:'公开参照',url:'https://name:secret620@example.com/'},{title:'token=secret620',url:'https://example.com'}]){
  s.reverseRecords=[{id:'r1',type:'TXT',title:data.title,material:{text:'公开正文',url:data.url}}];
  assert.equal(searchWorkspace(s,'secret620').reverse.length,0);
  assert.doesNotMatch(JSON.stringify(searchWorkspace(s,'公开正文').reverse),/secret620/);
 }
 s.reverseRecords=[{id:'r1',type:'TXT',title:'公开参照',material:{text:'公开正文',url:'https://example.com/public'}}];
 assert.equal(searchWorkspace(s,'example.com/public').reverse.length,1);
});

test('逆向也查八格正文（#28），过滤凭据，已删记录不出现',()=>{
 const s=seed(),hatch=(known,miss='')=>({version:1,rounds:[],slots:Object.fromEntries(['use','shape','data','flow','ui','edge','write','check'].map(id=>[id,{known:'',miss:'',at:'2026-10-29T00:00:00.000Z'}].map((v,i)=>i?{...v,...(id==='data'?{known,miss}:{})}:v)))});
 s.reverseRecords=[{id:'r1',type:'TXT',title:'迁移研究',material:{text:'',url:''},hatch:hatch('产物是 migration-packages','字段格式 token: abcd1234efgh5678')},
  {id:'r2',type:'TXT',title:'回收',material:{text:'',url:''},hatch:hatch('回收独有八格词'),deletedAt:'2026-01-01'}];
 const hits=searchWorkspace(s,'migration-packages').reverse;
 assert.equal(hits.length,1);assert.equal(hits[0].item.id,'r1');assert.equal(hits[0].where,'八格');
 assert.equal(searchWorkspace(s,'abcd1234').reverse.length,0);
 assert.equal(searchWorkspace(s,'回收独有八格词').reverse.length,0);
});

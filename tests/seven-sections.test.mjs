import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGES, resolveRoute, LAYERS} from '../src/pages.js';
const ids=['home','assets','learning','references','projects','notes','settings'];
test('仅七板块按用户顺序提供导航与搜索',()=>{
 assert.deepEqual(PAGES.map(p=>p.id),ids);
 assert.deepEqual(PAGES.map(p=>p.label),['世界总览','资产仓库','个人收藏','逆向工程','项目空间','随手记','设置']);
 for(const id of ids)assert.equal(resolveRoute(id).route,id);
 for(const layer of LAYERS)for(const id of layer.pages)assert(ids.includes(id));
});
test('撤下页面及夜巡深链返回首页，保留焚决别名',()=>{
 for(const id of ['inbox','agents','health','collab','night','knowledge','calendar','aihot','history','night/morning/demo','night/report/demo/slot','night/morning/%','unknown'])assert.deepEqual(resolveRoute(id),{route:'home',anchor:null},id);
 assert.deepEqual(resolveRoute('scrolls'),{route:'assets',anchor:null,filter:'Scroll'});
});

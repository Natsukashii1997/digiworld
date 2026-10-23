import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGES, resolveRoute, LAYERS} from '../src/pages.js';
// UI v18（用户 2026-10-23 定 B 稿）：按主线排序（基地 / 捕获 / 炼化与出战 / 设置），首页改叫“基地”。
const ids=['home','notes','learning','assets','projects','references','settings'];
test('仅七板块按用户顺序提供导航与搜索',()=>{
 assert.deepEqual(PAGES.map(p=>p.id),ids);
 assert.deepEqual(PAGES.map(p=>p.label),['基地','随手记','个人收藏','资产仓库','项目空间','逆向工程','设置']);
 for(const id of ids)assert.equal(resolveRoute(id).route,id);
 for(const layer of LAYERS)for(const id of layer.pages)assert(ids.includes(id));
});
test('撤下页面及夜巡深链返回首页，保留焚决别名',()=>{
 for(const id of ['inbox','agents','health','collab','night','knowledge','calendar','aihot','history','night/morning/demo','night/report/demo/slot','night/morning/%','unknown'])assert.deepEqual(resolveRoute(id),{route:'home',anchor:null},id);
 assert.deepEqual(resolveRoute('scrolls'),{route:'assets',anchor:null,filter:'Scroll'});
});

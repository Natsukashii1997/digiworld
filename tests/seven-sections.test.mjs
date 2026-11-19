import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGES, resolveRoute, LAYERS} from '../src/pages.js';
// 常浩 2026-11-07（#74）：体系·只读（世界总览、项目空间、Agent、规则）+ 我的素材·可写（资产仓库、个人收藏、随手记、逆向工程），设置沉底。
const ids=['home','projects','agents','rules','assets','learning','notes','references','settings'];
test('九个页面按用户顺序提供导航与搜索',()=>{
 assert.deepEqual(PAGES.map(p=>p.id),ids);
 assert.deepEqual(PAGES.map(p=>p.label),['世界总览','项目空间','Agent','规则','资产仓库','个人收藏','随手记','逆向工程','设置']);
 for(const id of ids)assert.equal(resolveRoute(id).route,id);
 for(const layer of LAYERS)for(const id of layer.pages)assert(ids.includes(id));
});
test('撤下页面及夜巡深链返回首页，焚决旧链接落到资产仓库 Prompt 页（#93）',()=>{
 for(const id of ['inbox','health','collab','night','knowledge','calendar','aihot','history','night/morning/demo','night/report/demo/slot','night/morning/%','unknown'])assert.deepEqual(resolveRoute(id),{route:'home',anchor:null},id);
 assert.deepEqual(resolveRoute('scrolls'),{route:'assets',anchor:null,filter:'Prompt'});
});

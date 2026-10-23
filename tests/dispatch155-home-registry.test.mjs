import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGES} from '../src/pages.js';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {seed} from '../src/store.js';
const out=join(import.meta.dirname,'../test-results/dispatch155-home');await mkdir(out,{recursive:true});
await build({absWorkingDir:join(import.meta.dirname,'..'),entryPoints:['src/Home.jsx'],outfile:join(out,'Home.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {Home,homeFacts}=await import(pathToFileURL(join(out,'Home.mjs')));
test('七个保留页成熟度延续原事实',()=>{
 const expected={home:'ready',assets:'ready',learning:'partial',references:'ready',projects:'ready',notes:'ready',settings:'partial'};
 assert.deepEqual(Object.fromEntries(PAGES.map(p=>[p.id,p.maturity])),expected);
});
test('C10 首页协同/模型配置仅来自本机事实，不把意向当连接或未开发',()=>{
 const state=seed();state.collabLog=[{id:'syn-copy-1'},{id:'syn-copy-2'}];state.model={provider:'openai',model:'synthetic'};const f=homeFacts(state,null);
 assert.equal(f.collab,'看板 · 接力口令 · 2 条本机复制记录');
 assert.equal(f.settings,'模型配置：openai · 凭据与连通性未核验');
 assert.equal(homeFacts({...state,model:{}},null).settings,'模型尚未配置 · 连接测试在设置中');
 assert.equal(homeFacts({...state,collabLog:undefined},null).collab,'看板 · 接力口令 · 0 条本机复制记录');
});
test('首页保留收藏未知状态，不再读取已删除板块',()=>{
 const state={...seed(),assets:[],notes:[],connections:{},knowledgeTasks:[],profileProposals:[],revisionCandidates:[]};
 const html=renderToStaticMarkup(React.createElement(Home,{state,ruleInstalls:{items:[],loaded:true,error:''},projectStatus:{items:[],loaded:true},agentContents:{},healthAudit:{items:[],loaded:true},nightV2Reports:{items:[],loaded:true},vaultReceipts:{noteIds:[],loaded:true},navigate(){},notify(){},select(){}}));
 assert.match(html,/正在读取个人收藏/);
 assert.doesNotMatch(html,/待处理|AIHOT/);
 assert.doesNotMatch(html,/已读取的来源里没有要你处理的事/);
 assert.doesNotMatch(html,/协同.*尚未开发|再完成 .* 次.*孵化/);
});

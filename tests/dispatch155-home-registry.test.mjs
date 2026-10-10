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
test('C05 十三页成熟度按局部闭环注册，冻结三页标签保持',()=>{
 const expected={home:'ready',inbox:'ready',assets:'ready',references:'ready',agents:'partial',health:'partial',projects:'ready',collab:'partial',knowledge:'partial',calendar:'partial',notes:'ready',aihot:'partial',settings:'partial',history:'ready',night:'planned',learning:'partial',silver:'partial'};
 assert.deepEqual(Object.fromEntries(PAGES.map(p=>[p.id,p.maturity])),expected);
});
test('C10 首页协同/模型配置仅来自本机事实，不把意向当连接或未开发',()=>{
 const state=seed();state.collabLog=[{id:'syn-copy-1'},{id:'syn-copy-2'}];state.model={provider:'openai',model:'synthetic'};const f=homeFacts(state,null);
 assert.equal(f.collab,'看板 · 接力口令 · 2 条本机复制记录');
 assert.equal(f.settings,'模型配置：openai · 凭据与连通性未核验');
 assert.equal(homeFacts({...state,model:{}},null).settings,'模型尚未配置 · 连接测试在设置中');
 assert.equal(homeFacts({...state,collabLog:undefined},null).collab,'看板 · 接力口令 · 0 条本机复制记录');
});
test('C10 首页空待处理保留未读来源未知，不把未接入来源当零',()=>{
 const state={...seed(),assets:[],notes:[],connections:{},knowledgeTasks:[],profileProposals:[],revisionCandidates:[]};
 const html=renderToStaticMarkup(React.createElement(Home,{state,ruleInstalls:{items:[],loaded:true,error:''},projectStatus:{items:[],loaded:true},agentContents:{},healthAudit:{items:[],loaded:true},nightV2Reports:{items:[],loaded:true},vaultReceipts:{noteIds:[],loaded:true},navigate(){},notify(){},select(){}}));
 assert.match(html,/提醒事项未读取，Todo 待核实/);
 assert.match(html,/协同协议待核实|正在读取协同协议/);
 assert.doesNotMatch(html,/协同.*尚未开发|再完成 .* 次.*孵化/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {routeReveal,scanReveal,noteInput} from '../src/scan-motion.js';
import {flyDataOnce,copyText} from '../src/data-flight.js';
test('a route decoration failure cannot escape to the application',()=>{
 assert.doesNotThrow(()=>routeReveal({querySelectorAll:()=>[],getAnimations:()=>{throw Error('synthetic animation enumeration');}})());
 assert.doesNotThrow(()=>routeReveal({querySelectorAll:()=>[{classList:{add(){}}}],getAnimations:()=>[{animationName:'rise',cancel(){throw Error('synthetic cancel');}}]})());
});
test('a recovered confirmed operation receives one feedback and rejected copy receives none',async()=>{
 const saved=new Map(['matchMedia','window','document','CustomEvent','navigator'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));let caught=0;
 try {
  globalThis.matchMedia=()=>({matches:true});globalThis.window={dispatchEvent(){caught++;}};globalThis.document={activeElement:null,querySelector:()=>null};globalThis.CustomEvent=class{};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async()=>{throw Error('synthetic denied');}}}});
  flyDataOnce('synthetic-save-362',null);flyDataOnce('synthetic-save-362',null);assert.equal(caught,1);
  await assert.rejects(copyText('synthetic',null),/synthetic denied/);assert.equal(caught,1);
 }finally{for(const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}
});
test('a read completing during the route scan does not draw a second line inside it',()=>{
 const saved=new Map(['matchMedia','document','innerWidth','innerHeight','getComputedStyle'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));let drawn=0;
 try {
  globalThis.matchMedia=()=>({matches:false,addEventListener(){}});globalThis.innerWidth=1440;globalThis.innerHeight=900;globalThis.getComputedStyle=()=>({borderRadius:'0'});
  const node=()=>({style:{},dataset:{},setAttribute(){},append(){},remove(){},animate:()=>({finished:new Promise(()=>{}),cancel(){}})});
  globalThis.document={createElement:node,body:{append(){drawn++;}}};
  const el=inside=>({...node(),isConnected:true,getBoundingClientRect:()=>({left:0,top:0,right:800,bottom:600,width:800,height:600}),contains:x=>x===inside});
  const board=el(null),main=el(board);noteInput();
  const stopRoute=scanReveal(main,{kind:'route'});assert.equal(drawn,1);
  scanReveal(board,{kind:'read'});assert.equal(drawn,1,'切页扫描未结束时读取不叠线');
  stopRoute();scanReveal(board,{kind:'read'});assert.equal(drawn,2,'切页结束后读取照常扫描');
 }finally{for(const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}
});
test('after entering a page only a read the user triggered draws a line',()=>{
 const saved=new Map(['matchMedia','document','innerWidth','innerHeight','getComputedStyle'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));let drawn=0;
 try {
  globalThis.matchMedia=()=>({matches:false,addEventListener(){}});globalThis.innerWidth=1440;globalThis.innerHeight=900;globalThis.getComputedStyle=()=>({borderRadius:'0'});
  const node=()=>({style:{},dataset:{},setAttribute(){},append(){},remove(){},querySelectorAll:()=>[],getAnimations:()=>[],animate:()=>({finished:new Promise(()=>{}),cancel(){}})});
  globalThis.document={createElement:node,body:{append(){drawn++;}}};
  const el=()=>({...node(),isConnected:true,getBoundingClientRect:()=>({left:0,top:0,right:800,bottom:600,width:800,height:600}),contains:()=>false});
  const main=el(),board=el();
  noteInput();routeReveal(main)();assert.equal(drawn,1,'点击侧栏后切页扫一道');
  scanReveal(board,{kind:'read'});assert.equal(drawn,1,'切页后页面自己读完（含慢读、自动重读）不再扫');
  noteInput();scanReveal(board,{kind:'read'});assert.equal(drawn,2,'用户在页内操作后的刷新读取照常扫');
 }finally{for(const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

let instance=0;
async function fixture(check){
 const keys=['matchMedia','document','innerWidth','innerHeight','getComputedStyle'];
 const saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),surfaces=new Set(),stops=[],animations=[];
 const media={matches:false,addEventListener(_event,callback){this.change=callback;}};
 const animation=()=>{let done;const a={finished:new Promise(resolve=>done=resolve),cancelled:false,cancel(){this.cancelled=true;done();},finish(){done();}};animations.push(a);return a;};
 const node=()=>({style:{},dataset:{},setAttribute(){},append(){},remove(){surfaces.delete(this);},animate:animation});
 globalThis.matchMedia=()=>media;globalThis.innerWidth=1440;globalThis.innerHeight=900;globalThis.getComputedStyle=()=>({borderRadius:'0'});
 globalThis.document={createElement:node,body:{append(el){surfaces.add(el);}}};
 const target=(parent=null,rect={left:0,top:0,width:800,height:600})=>{
  const el={...node(),parent,isConnected:true,animations:[],getBoundingClientRect:()=>({...rect,right:rect.left+rect.width,bottom:rect.top+rect.height}),contains(other){for(let n=other;n;n=n.parent)if(n===this)return true;return false;},animate(){const a=animation();this.animations.push(a);return a;}};
  return el;
 };
 const kinds=()=>[...surfaces].map(el=>el.dataset.scanKind);
 try{
  const moduleURL=process.env.SCAN_MODULE?pathToFileURL(process.env.SCAN_MODULE):new URL('../src/scan-motion.js',import.meta.url);
  const module=await import(moduleURL.href+'?coordination374='+instance++);
  module.noteInput?.(); // 协调测试默认用户已在页面内操作；读取门槛另测。
  const scan=(el,kind)=>{const stop=module.scanReveal(el,{kind,duration:kind==='route'?440:420});stops.push(stop);return stop;};
  await check({scan,target,surfaces,kinds,media,finish:()=>animations.forEach(a=>a.finish()),flush:async()=>{await Promise.resolve();await Promise.resolve();}});
 }
 finally{stops.forEach(stop=>stop());for(const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}
}

test('startup main read cannot cancel and replace its active route scan',()=>fixture(({scan,target,kinds})=>{
 const main=target(),result=target(main);
 scan(main,'route');scan(main,'read');scan(result,'read');
 assert.deepEqual(kinds(),['route'],'同目标读取先去重，保留切页扫描');
 assert.equal(main.animations[0].cancelled,false);
}));
test('a main read covers a nested result read',()=>fixture(({scan,target,kinds})=>{
 const main=target(),result=target(main);scan(main,'read');scan(result,'read');
 assert.deepEqual(kinds(),['read']);
}));
test('an outer route takes over a result scan that started first',()=>fixture(({scan,target,kinds})=>{
 const main=target(),result=target(main);scan(result,'read');scan(main,'route');
 assert.deepEqual(kinds(),['route']);assert.equal(result.animations[0].cancelled,true);
}));
test('an outer read takes over an inner read without leaving two lines',()=>fixture(({scan,target,kinds})=>{
 const main=target(),result=target(main);scan(result,'read');scan(main,'read');assert.deepEqual(kinds(),['read']);
 assert.equal(result.animations[0].cancelled,true);
}));
test('a panel scan covers its reading and hovering children',()=>fixture(({scan,target,kinds})=>{
 const panel=target(),result=target(panel),screen=target(result);scan(panel,'panel');scan(result,'read');scan(screen,'hover');
 assert.deepEqual(kinds(),['panel']);
}));
test('an entering route covers hover until natural completion',()=>fixture(async({scan,target,kinds,finish,flush})=>{
 const main=target(),screen=target(main);scan(main,'route');scan(screen,'hover');assert.deepEqual(kinds(),['route']);
 finish();await flush();assert.deepEqual(kinds(),[]);scan(screen,'hover');assert.deepEqual(kinds(),['hover']);
}));
test('finishing or cancelling an outer scan permits a later read',()=>fixture(async({scan,target,kinds,flush})=>{
 const main=target(),result=target(main),stop=scan(main,'route');scan(result,'read');stop();await flush();scan(result,'read');
 assert.deepEqual(kinds(),['read']);
}));
test('disjoint screens can scan independently',()=>fixture(({scan,target,kinds})=>{
 const a=target(null,{left:0,top:0,width:200,height:200}),b=target(null,{left:500,top:0,width:200,height:200});
 scan(a,'read');scan(b,'read');assert.deepEqual(kinds(),['read','read']);
}));
test('a separately mounted panel takes over an overlapping main scan',()=>fixture(({scan,target,kinds})=>{
 const main=target(),panel=target(null,{left:200,top:100,width:400,height:400});
 scan(main,'route');scan(panel,'panel');assert.deepEqual(kinds(),['panel']);assert.equal(main.animations[0].cancelled,true);
}));
test('a detached target and an old cleanup cannot erase a new route',()=>fixture(async({scan,target,kinds,flush})=>{
 const old=target(),stopOld=scan(old,'route');old.isConnected=false;
 const current=target(),result=target(current);scan(current,'route');assert.deepEqual(kinds(),['route']);stopOld();await flush();scan(result,'read');
 assert.deepEqual(kinds(),['route']);
}));
test('runtime reduced motion cancels coordinated scans and permits later motion',()=>fixture(async({scan,target,kinds,media,flush})=>{
 const main=target(),result=target(main);scan(main,'route');media.matches=true;media.change();await flush();assert.deepEqual(kinds(),[]);
 scan(result,'read');assert.deepEqual(kinds(),[]);media.matches=false;scan(result,'read');assert.deepEqual(kinds(),['read']);
}));

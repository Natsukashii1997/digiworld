import test from 'node:test';
import assert from 'node:assert/strict';
import {createCollectionImport} from '../src/collection-import.js';
const root='a'.repeat(64),id='11111111-1111-1111-1111-111111111111';
function setup(){
 const data=new Map(),calls=[];let phase='complete',readFail=false,postFail=false,locked=false,quota=false;
 const storage={getItem:k=>data.get(k)??null,setItem(k,v){if(quota)throw Error();data.set(k,v);}};
 const locks={async request(k,o,fn){if(locked)return fn(null);locked=true;try{return await fn({});}finally{locked=false;}}};
 const call=async(path,body)=>{calls.push({path,body});if(path==='/notes/import'){if(postFail)throw Error('lost');return {status:phase,noteId:'n',created:true};}if(path.startsWith('/operations/')){if(phase==='missing')throw Error('404');return {status:phase,noteId:'n',created:true};}if(readFail)throw Error('offline');return path==='/notes'?{notes:[{id:'n'}]}:{revision:1,groups:[]};};
 const create=(identity=root)=>createCollectionImport({call,identity:async()=>({dataRootIdentity:identity}),storage,locks,newId:()=>id,delay:async()=>{throw Error('stop');}});
 return {data,calls,storage,create,set(v){if('phase'in v)phase=v.phase;if('readFail'in v)readFail=v.readFail;if('postFail'in v)postFail=v.postFail;if('quota'in v)quota=v.quota;}};
}
test('lost POST recovers original receipt and stores no input; acknowledgment only clears matching ID',async()=>{
 const s=setup();s.set({postFail:true});const a=s.create(),result=await a.begin('signed-url-secret');assert.equal(result.note.id,'n');assert.equal(s.calls.filter(c=>c.path==='/notes/import').length,1);assert.ok(![...s.data.values()].join('').includes('signed-url-secret'));
 await a.acknowledge('wrong');assert.ok(await a.pending());await a.acknowledge(id);assert.equal(await a.pending(),null);
});
test('saved readback failure survives reload and new input only queries same operation',async()=>{
 const s=setup();s.set({readFail:true});await assert.rejects(s.create().begin('input'),e=>e.importPhase==='saved');assert.equal((await s.create().pending()).phase,'saved');s.set({readFail:false});await assert.rejects(s.create().begin('second'),/本次拖入未提交/);assert.equal((await s.create().resume()).operationId,id);assert.equal(s.calls.filter(c=>c.path==='/notes/import').length,1);
});
test('unknown/missing receipt is retained and never automatically replayed',async()=>{
 const s=setup();s.set({postFail:true,phase:'missing'});await assert.rejects(s.create().begin('input'),e=>e.importPhase==='unknown');await assert.rejects(s.create().resume());assert.ok(await s.create().pending());assert.equal(s.calls.filter(c=>c.path==='/notes/import').length,1);assert.equal(await s.create('b'.repeat(64)).pending(),null);
});
test('terminal failed/interrupted clears only original pending; processing remains pending',async()=>{
 for(const phase of ['failed','interrupted']){const s=setup();s.set({phase});await assert.rejects(s.create().begin('input'),e=>e.importPhase==='failed');assert.equal(await s.create().pending(),null);}
 const s=setup();s.set({postFail:true,phase:'missing'});await assert.rejects(s.create().begin('input'));s.set({phase:'processing'});await assert.rejects(s.create().resume(),/仍在处理/);assert.ok(await s.create().pending());
});
test('quota/corrupt storage stops POST, preserving original data',async()=>{
 const s=setup();s.set({quota:true});await assert.rejects(s.create().begin('input'));assert.equal(s.calls.length,0);s.set({quota:false});await s.create().pending();s.data.set(`workbench:web-draft:v1:${root}:collection-import`,'broken');await assert.rejects(s.create().begin('input'));assert.equal(s.calls.length,0);
});
test('explicit operationNotStarted frees the slot; a generic rejection does not',async()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},locks={request:(k,o,f)=>f({})};
 let posts=0;
 const a=createCollectionImport({identity:async()=>({dataRootIdentity:root}),storage,locks,newId:()=>id,call:async()=>{posts++;throw Object.assign(Error('limited'),{operationNotStarted:true});}});
 await assert.rejects(a.begin('one'),/limited/);assert.equal(await a.pending(),null);await assert.rejects(a.begin('two'),/limited/);assert.equal(posts,2);
});

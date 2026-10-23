import test from 'node:test';
import assert from 'node:assert/strict';
import {createFloatingNotes} from '../src/floating-notes-store.js';
const oldRoot='a'.repeat(64),currentRoot='b'.repeat(64);
const note={id:'existing',at:'2026-10-21T00:00:00Z',text:'已有便签，不应改写',format:'md1'};
function setup(records=[],{offline=false}={}){
 let available=!offline,root=currentRoot,reads=0,writes=0,saved=0;
 const disk={version:1,rootIdentity:oldRoot,records:structuredClone(records)};
 const c=createFloatingNotes({storage:{load:async()=>structuredClone(disk),save:async()=>{saved++;}},identity:async()=>{if(!available)throw Error('offline');return {dataRootIdentity:root};},api:async(_path,_data,method)=>{if(method&&method!=='GET')writes++;else reads++;return {notes:[structuredClone(note)]};}});
 return {c,disk,set available(value){available=value;},set root(value){root=value;},get counts(){return {reads,writes,saved};}};
}
test('empty recovery from previous session does not block healthy notes on init or Retry',async()=>{
 const h=setup();await h.c.init();await h.c.refresh();
 assert.equal(h.c.snapshot().online,true);assert.equal(h.c.snapshot().ready,true);assert.deepEqual(h.c.snapshot().notes,[note]);assert.deepEqual(h.counts,{reads:2,writes:0,saved:0});
 assert.deepEqual(h.disk,{version:1,rootIdentity:oldRoot,records:[]});
});
test('Retry connects after startup failure with stale empty recovery',async()=>{
 const h=setup([],{offline:true});await h.c.init();assert.equal(h.c.snapshot().online,false);h.available=true;await h.c.refresh();assert.equal(h.c.snapshot().online,true);assert.deepEqual(h.c.snapshot().notes,[note]);assert.equal(h.counts.writes,0);
});
for(const phase of ['draft','unknown','delete'])test(`nonempty ${phase} recovery still refuses a different directory without discarding records`,async()=>{
 const record={...note,base:{text:note.text,format:'md1'},dirty:true,...(phase==='unknown'?{sent:{...note,base:null}}:{}),...(phase==='delete'?{deleteBase:{text:note.text,format:'md1'},dirty:false}:{})};
 const h=setup([record]);await h.c.init();await h.c.refresh();assert.equal(h.c.snapshot().online,false);assert.equal(h.c.snapshot().ready,false);assert.match(h.c.snapshot().error,/资料位置已变化/);assert.deepEqual(h.counts,{reads:0,writes:0,saved:0});assert.equal(h.c.snapshot().records.existing.text,note.text);assert.deepEqual(h.disk.records,[record]);
});
test('once connected, an empty controller does not silently switch to another root',async()=>{
 const h=setup();await h.c.init();assert.equal(h.c.snapshot().online,true);h.root='c'.repeat(64);await h.c.refresh();assert.equal(h.c.snapshot().online,false);assert.match(h.c.snapshot().error,/资料位置已变化/);assert.equal(h.counts.reads,1);assert.equal(h.counts.writes,0);
});
test('reinitializing empty recovery does not clear an established page binding',async()=>{
 const h=setup();await h.c.init();h.root='c'.repeat(64);await h.c.init();assert.equal(h.c.snapshot().online,false);assert.match(h.c.snapshot().error,/资料位置已变化/);assert.equal(h.counts.reads,1);assert.equal(h.counts.writes,0);
});

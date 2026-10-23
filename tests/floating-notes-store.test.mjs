import test from 'node:test';
import assert from 'node:assert/strict';
import {createFloatingNotes} from '../src/floating-notes-store.js';
const base={id:'one',at:'2026-10-15T00:00:00Z',text:'起点',format:'md1'};
function harness(){let disk=null,notes=[base],puts=0,lose=false,offline=false,block=null;const events=[];
 const storage={load:async()=>disk,save:async value=>{disk=structuredClone(value);}};
 const api=async(path,data)=>{if(offline)throw Error('offline');if(path==='/notes')return {notes:structuredClone(notes)};const id=path.split('/').at(-1),current=notes.find(n=>n.id===id)||null;
 if(!data)return {note:structuredClone(current)};puts++;if(block)await block;if(current&&current.text!==data.base?.text&&current.text!==data.text)throw Object.assign(Error('conflict'),{noteConflict:true,currentNote:current});
 const saved={...current,id,text:data.text,at:current?.at||data.at,format:data.format};notes=[saved,...notes.filter(n=>n.id!==id)];if(lose)throw Error('lost reply');return {note:saved};};
 const make=()=>createFloatingNotes({api,storage,identity:async()=>({dataRootIdentity:'a'.repeat(64)}),newId:()=>`new-${puts}`,onChange:s=>events.push(s)});
 return {make,get disk(){return disk;},get notes(){return notes;},get puts(){return puts;},set lose(v){lose=v;},set offline(v){offline=v;},set block(v){block=v;},remote:text=>{notes=[{...base,text}]},events};}
test('恢复区先落盘，主库回读后才清；回包丢失核对而不重复新增',async()=>{const h=harness(),c=h.make();await c.init();const id=c.begin();c.change(id,{text:'自动保存的中文',format:'md1'});await c.persist();assert.equal(h.disk.records[0].text,'自动保存的中文');h.lose=true;await c.save(id);assert.equal(h.puts,1);assert.equal(h.notes.length,2);assert.equal(c.snapshot().records[id].phase,'saved');assert.equal(h.disk.records.length,0);});
test('保存期间继续输入保留新稿；恢复后与别处改动冲突，两条都留',async()=>{const h=harness(),c=h.make();await c.init();c.begin(base);c.change('one',{text:'第一稿',format:'md1'});let release;h.block=new Promise(r=>release=r);const pending=c.save('one');while(!h.puts)await new Promise(r=>setTimeout(r,0));c.change('one',{text:'继续写的新稿',format:'md1'});release();await pending;assert.equal(c.snapshot().records.one.text,'继续写的新稿');assert.equal(h.disk.records[0].text,'继续写的新稿');h.remote('别处改动');const reopened=h.make();await reopened.init();await reopened.save('one');assert.equal(reopened.snapshot().records.one.phase,'conflict');await reopened.keepBoth('one');assert.equal(h.notes.length,2);assert.ok(h.notes.some(n=>n.text==='继续写的新稿'));assert.ok(h.notes.some(n=>n.text==='别处改动'));assert.equal(h.disk.records.length,0);});
test('未知结果未核对时不重放；草稿重开可恢复，空白不写',async()=>{const h=harness(),c=h.make();await c.init();const id=c.begin();await c.save(id);assert.equal(h.puts,0);c.change(id,{text:'离线草稿',format:'md1'});h.offline=true;await c.save(id);const count=h.puts;await c.save(id);assert.equal(h.puts,count);assert.equal(c.snapshot().records[id].phase,'unknown');h.offline=false;const reopened=h.make();await reopened.init();await reopened.save(id);assert.equal(h.notes.filter(n=>n.text==='离线草稿').length,1);});

test('在途提交后撤回原文仍保留恢复记录，空白新条可结束',async()=>{const h=harness(),c=h.make();await c.init();c.begin(base);c.change('one',{text:'在途版本',format:'md1'});let release;h.block=new Promise(r=>release=r);const pending=c.save('one');while(!h.puts)await new Promise(r=>setTimeout(r,0));c.change('one',{text:'起点',format:'md1'});await c.persist();assert.equal(h.disk.records.length,1);assert.equal(h.disk.records[0].text,'起点');release();await pending;assert.equal(h.disk.records[0].text,'起点');await c.save('one');assert.equal(h.notes[0].text,'起点');const id=c.begin();c.change(id,{text:'',format:'md1'});c.finish(id);assert.equal(c.snapshot().records[id],undefined);});
test('缺少资料身份的恢复文件保持阻断，不写入主库或清除原稿',async()=>{let writes=0,saved=0;const c=createFloatingNotes({api:async()=>{writes++;return {notes:[]};},storage:{load:async()=>({version:1,records:[{...base,base:null,dirty:true}]}),save:async()=>saved++},identity:async()=>({dataRootIdentity:'a'.repeat(64)})});await c.init();assert.equal(c.snapshot().ready,false);assert.ok(c.snapshot().storageError);assert.equal(writes,0);assert.equal(saved,0);});
test('结束编辑不能释放尚未核对的操作，即使当前文字撤回基线',async()=>{const h=harness(),c=h.make();await c.init();c.begin(base);c.change('one',{text:'曾提交的版本',format:'md1'});let release;h.block=new Promise(r=>release=r);h.lose=true;const pending=c.save('one');while(!h.puts)await new Promise(r=>setTimeout(r,0));c.change('one',{text:'起点',format:'md1'});h.offline=true;release();await pending;await c.save('one');c.finish('one');await c.persist();assert.equal(h.disk.records[0].text,'起点');assert.ok(h.disk.records[0].sent);});
test('刷新旧回包不能把已保存的新版本倒退',async()=>{let actual=base,hold=false,release,started=false;const api=async(path,value)=>{if(path==='/notes'){const result={notes:[actual]};if(hold){started=true;await new Promise(r=>release=r);}return result;}if(value){actual={...base,text:value.text};return {note:actual};}return {note:actual};};const c=createFloatingNotes({api,storage:{load:async()=>null,save:async()=>{}},identity:async()=>({dataRootIdentity:'a'.repeat(64)})});await c.init();c.begin(base);hold=true;const refresh=c.refresh();while(!started)await new Promise(r=>setTimeout(r,0));c.change('one',{text:'已确认的新版本',format:'md1'});await c.save('one');release();await refresh;c.finish('one');assert.equal(c.snapshot().notes[0].text,'已确认的新版本');});

test('中文组合期间刷新不前移编辑起点；空闲记录刷新为远端新内容',async()=>{
 let actual={...base},protectedInput=false;
 const c=createFloatingNotes({api:async()=>({notes:[actual]}),storage:{load:async()=>null,save:async()=>{}},identity:async()=>({dataRootIdentity:'a'.repeat(64)}),protect:()=>protectedInput});
 await c.init();c.begin(base);protectedInput=true;actual={...base,text:'远端更新'};await c.refresh();
 assert.equal(c.snapshot().records.one.base.text,base.text);
 protectedInput=false;await c.refresh();assert.equal(c.snapshot().records.one.text,'远端更新');assert.equal(c.snapshot().records.one.base.text,'远端更新');
});

 test('删除未知只查询、回包丢失不重放；已删除条目不被恢复保存',async()=>{
 let notes=[base],deletes=0,disk=null,hideRead=true;
 const c=createFloatingNotes({api:async(path,data,method)=>{
  if(path==='/notes')return {notes:structuredClone(notes)};
  if(method==='DELETE'){deletes++;notes=[];throw Error('reply lost');}
  if(hideRead)throw Error('offline');return {note:notes[0]||null};
 },storage:{load:async()=>disk,save:async x=>disk=structuredClone(x)},identity:async()=>({dataRootIdentity:'a'.repeat(64)})});
 await c.init();c.begin(base);assert.equal(await c.remove('one',base),'unknown');assert.equal(deletes,1);assert.equal(c.snapshot().notes.length,1);
 hideRead=false;assert.equal(await c.remove('one',base,{queryOnly:true}),'deleted');assert.equal(deletes,1);await c.flush();assert.equal(c.snapshot().notes.length,0);assert.equal(disk.records.length,0);
 });
 test('删除阻断未保存编辑与旧确认内容，保留草稿',async()=>{
 const h=harness(),c=h.make();await c.init();c.begin(base);c.change('one',{text:'新输入',format:'md1'});
 await assert.rejects(c.remove('one',base),/先保存/);await c.persist();assert.equal(h.disk.records[0].text,'新输入');assert.equal(h.puts,0);
 await c.save('one');await assert.rejects(c.remove('one',base),/先保存/);assert.equal(h.notes[0].text,'新输入');
 });

 test('待核对删除跨重启保留，自动保存和再次删除都不重放',async()=>{
 let disk=null,deletes=0,puts=0,offlineRead=true,notes=[base];
 const options={api:async(path,data,method)=>{if(path==='/notes')return {notes:structuredClone(notes)};if(method==='DELETE'){deletes++;notes=[];throw Error('lost');}if(method==='PUT'){puts++;return;}if(offlineRead)throw Error('offline');return {note:notes[0]||null};},storage:{load:async()=>structuredClone(disk),save:async x=>disk=structuredClone(x)},identity:async()=>({dataRootIdentity:'a'.repeat(64)})};
 const first=createFloatingNotes(options);await first.init();await first.remove('one',base);assert.equal(disk.records[0].deleteBase.text,'起点');
 const reopened=createFloatingNotes(options);await reopened.init();await reopened.flush();assert.equal(puts,0);assert.equal(await reopened.remove('one',base),'unknown');assert.equal(deletes,1);await assert.rejects(async()=>reopened.change('one',{text:'误编辑'}),/查询删除结果/);
 offlineRead=false;assert.equal(await reopened.remove('one',base),'deleted');assert.equal(deletes,1);assert.equal(disk.records.length,0);
 });

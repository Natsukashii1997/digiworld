import test from 'node:test';
import assert from 'node:assert/strict';
import {rebaseWorkspaceEdit,saveWorkspaceEdit} from '../src/workspace-refresh.js';
const note=(id,text)=>({id,text,at:'2026-10-15T08:00:00Z'});
test('网页保存前保留便签栏的新条目，应用当前网页真正修改的内容',()=>{
 const base={revision:1,notes:[note('a','原文')],projects:[]};
 const next={...base,projects:[{id:'project',name:'网页刚建的项目'}]};
 const fresh={...base,revision:2,notes:[note('b','便签栏新增'),...base.notes]};
 const result=rebaseWorkspaceEdit(base,next,fresh);
 assert.deepEqual(result,{...fresh,projects:next.projects});
});
test('两处改不同便签可保存，两处改同一正文拒绝覆盖且原输入不变',()=>{
 const base={revision:1,notes:[note('a','原文'),note('b','另一条')],projects:[]};
 const next={...base,notes:[note('a','我的修改'),base.notes[1]]};
 const fresh={...base,revision:2,notes:[base.notes[0],note('b','桌面修改')]};
 assert.deepEqual(rebaseWorkspaceEdit(base,next,fresh).notes,[note('a','我的修改'),note('b','桌面修改')]);
 assert.throws(()=>rebaseWorkspaceEdit(base,next,{...fresh,notes:[note('a','别处的修改'),fresh.notes[1]]}),/当前输入已保留/);
 assert.equal(next.notes[0].text,'我的修改');
});
test('同条非正文元信息与新正文可合并；并发删除和其他字段冲突保持拒绝',()=>{
 const base={revision:1,notes:[note('a','原文')],projects:[{id:'p',name:'原项目'}]};
 const next={...base,notes:[{...base.notes[0],refined:{scrollId:'s',entryId:'e',at:'2026-10-15T08:00:00Z'}}]};
 const fresh={...base,revision:2,notes:[note('a','桌面新正文')]};
 assert.deepEqual(rebaseWorkspaceEdit(base,next,fresh).notes,[{...next.notes[0],text:'桌面新正文'}]);
 assert.throws(()=>rebaseWorkspaceEdit(base,{...base,notes:[]},fresh),/别处修改/);
 assert.throws(()=>rebaseWorkspaceEdit(base,{...base,projects:[{id:'p',name:'我改的'}]},{...fresh,projects:[{id:'p',name:'别人改的'}]}),/别处修改/);
});

test('正文与格式为一个冲突单位，不静默组合两处修改',()=>{
 const base={revision:1,notes:[note('a','原文')]};
 assert.throws(()=>rebaseWorkspaceEdit(base,{...base,notes:[{...base.notes[0],format:'md1'}]},{...base,revision:2,notes:[note('a','另一处正文')]}),/别处修改/);
});
test('只有明确未写入的版本冲突可以有界重读，未知结果不重放',async()=>{
 const base={revision:1,notes:[note('a','原文')]},next={...base,notes:[note('a','我的修改')]};
 let reads=0,writes=0;const fresh={...base,revision:2,notes:[...base.notes,note('b','别处新增')]};
 const saved=await saveWorkspaceEdit(base,next,async()=>++reads===1?base:fresh,async value=>{if(++writes===1)throw {revisionConflict:true};return {...value,revision:3};});
 assert.equal(saved.notes.length,2);assert.equal(saved.notes[0].text,'我的修改');assert.equal(writes,2);
 writes=0;await assert.rejects(saveWorkspaceEdit(base,next,async()=>base,async()=>{writes++;throw new Error('unknown');}),/unknown/);assert.equal(writes,1);
 writes=0;await assert.rejects(saveWorkspaceEdit(base,next,async()=>base,async()=>{writes++;throw Object.assign(new Error('revision'),{revisionConflict:true});}),/revision/);assert.equal(writes,3);
});

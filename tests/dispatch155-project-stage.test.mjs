import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCurrentStatus,projectCurrentStage} from '../server/project-status.mjs';
const text=(writer,handoff,title='合成状态')=>`# 合成Current
| 字段 | 当前值 |
|---|---|
| state_id | P-20261004-12 |
| 当前写入者 | ${writer} |
| 唯一下一步 | 等复核 |
| 最新交接 | [${handoff}](docs/synthetic.md) |
## ${title}（P-20261004-12）
`;
test('C10 项目阶段复用同次Current的写入者、最新标题与交接，不读新来源',()=>{
 for(const [writer,handoff,title,id,basis] of [
 ['Codex 开发','验收交接','待确认','implement','当前写入者'],
 ['无','认领记录','返修','rework','最新状态标题'],
 ['无','独立复核','待确认','review','最新交接'],
 ['无','记录','待确认','unknown','']]){
  const t=text(writer,handoff,title),file={state:'read',text:t},current=parseCurrentStatus(t),snapshot=structuredClone({file,current});
  const result=projectCurrentStage(file,current);assert.equal(result.id,id);assert.equal(result.basis,basis);assert.deepEqual({file,current},snapshot);
 }
});
test('C10 不可读/无法解析Current仍未知，不从路径标题或不存在正文猜阶段',()=>{
 for(const [file,current] of [[{state:'absent'},{state:'absent'}],[{state:'error',text:'验收'},{state:'error'}],[{state:'read',text:'# 验收'},{state:'unparsed'}]])
 assert.deepEqual(projectCurrentStage(file,current),{id:'unknown',label:'未知',basis:'',keyword:''});
});

test('C10 有界Current截断不借旧state标题误报本轮阶段，也不扩宽读取范围',()=>{
 const t=text('无','本轮实现','合成旧状态').replace('## 合成旧状态（P-20261004-12）','## 旧验收（P-20261004-11）');
 assert.equal(projectCurrentStage({state:'read',text:t,truncated:true},parseCurrentStatus(t)).id,'implement');
 const missing=t.replace('本轮实现','记录');assert.equal(projectCurrentStage({state:'read',text:missing,truncated:true},parseCurrentStatus(missing)).id,'unknown');
 const match=text('无','记录','本轮返修');assert.equal(projectCurrentStage({state:'read',text:match,truncated:true},parseCurrentStatus(match)).id,'rework');
});

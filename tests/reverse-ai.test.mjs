import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAiResult} from '../src/reverse-ai.js';
const ev='ev_'+'a'.repeat(64);
const sample=()=>({conclusions:[{text:'复制入口已验证',mark:'观察',evidence:[ev]}],unknowns:[{id:'U1',text:'尚未验证真实剪贴板'}],pack:'# 复刻任务包\n按证据实现并验证。'});
const block=v=>'```json\n'+JSON.stringify(v)+'\n```';
test('AI结果只接受一个严格JSON块，保留证据与未知，已验证声明降为推断',()=>{
 const result=parseAiResult(block(sample()));assert.equal(result.conclusions[0].mark,'推断');assert.equal(result.conclusions[0].evidence[0],ev);assert.equal(result.unknowns[0].id,'U1');assert.equal(result.pack,sample().pack);
 for(const value of [block({...sample(),extra:true}),block({...sample(),conclusions:[{text:'x',mark:'观察',evidence:['ev_short']}]}),'说明\n'+block(sample()),block(sample())+'\n'+block(sample())])assert.throws(()=>parseAiResult(value));
});

test('AI结果拒绝凭据结论、重复未知及长度越界；包凭据过滤且允许JSON字符串中的代码示例',()=>{
 const secret=sample();secret.conclusions[0].text='api_key=secret-123';assert.throws(()=>parseAiResult(block(secret)),/凭据/);
 const duplicate=sample();duplicate.unknowns.push(duplicate.unknowns[0]);assert.throws(()=>parseAiResult(block(duplicate)),/重复/);
 const long=sample();long.pack='x'.repeat(100001);assert.throws(()=>parseAiResult(block(long)),/过长/);
 const clean=sample();clean.pack='api_key=secret-456\n```js\nconst x=1;\n```';const parsed=parseAiResult(block(clean));assert.ok(!parsed.pack.includes('secret-456'));assert.match(parsed.pack,/const x=1/);
});

test('AI可选线索严格校验、去重并兼容旧结果',()=>{
 assert.equal(parseAiResult(block(sample())).clues,undefined);
 assert.deepEqual(parseAiResult(block({...sample(),clues:['migrate','handoff','migrate','context']})).clues,['migrate','handoff','context']);
 for(const clues of [null,'copy',[''],['x'.repeat(61)],['中文'],['two words'],['a\nb'],['api_key=secret'],Array(9).fill('copy')])assert.throws(()=>parseAiResult(block({...sample(),clues})),/线索/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {diffText,diffLineCounts} from '../src/version-diff.js';
const expected=(removed,added)=>({available:true,removed,added,reason:''});

test('C-10 合法长单行改动与一侧空文本可精确计数，全文渲染原界限不变',()=>{
 const a='甲'.repeat(100001),b='乙'.repeat(150001);
 assert.deepEqual(diffText(a,b),{mode:'full',rows:[],formatOnly:false});
 assert.deepEqual(diffLineCounts(a,b),expected(1,1));
 assert.deepEqual(diffLineCounts('',b),expected(0,1));
 assert.deepEqual(diffLineCounts(a,''),expected(1,0));
 assert.deepEqual(diffLineCounts('行\r\n'.repeat(5001),''),expected(5001,0));
 assert.deepEqual(diffLineCounts('','行\n'.repeat(5001)),expected(0,5001));
});

test('C-10 100000字符与5000行以上的公共前后缀只缩小计数窗口，完整全文保留',()=>{
 const head=Array.from({length:6000},(_,i)=>`共同前${i}\r\n`).join('');
 const tail='共同末\r\n'.repeat(9000);
 const a=head+'旧A\r\n重复\n旧B\r'+tail,b=head+'新A\r\n重复\n新B\r'+tail;
 const snapshots=[a,b];
 assert.equal(diffText(a,b).mode,'full','不把全量15000行转成DOM');
 assert.deepEqual(diffLineCounts(a,b),expected(2,2));
 assert.deepEqual([a,b],snapshots);
});

test('C-10 CRLF、CR、最终换行、空行仍按无损行令牌计数，不归一化行数',()=>{
 for(const [a,b,removed,added] of [
  ['末尾','末尾\n',1,1],['\n','\n\n',0,1],
  ['中文\r\n第二行\r','中文\n第二行\n',2,2],
  ['重复\n重复\n末尾\n','重复\n末尾\n重复\n',1,1],
  ['','',0,0]
 ])assert.deepEqual(diffLineCounts(a,b),expected(removed,added));
 assert.deepEqual(diffLineCounts('行\r\n'.repeat(5001),'行\n'.repeat(5001)),expected(5001,5001));
});

test('C-10 超大无公共行可线性判定精确计数，重排复杂超界明确原因与未知数',()=>{
 const a=Array.from({length:5001},(_,i)=>`A${i}\n`).join(''),b=Array.from({length:5001},(_,i)=>`B${i}\n`).join('');
 let start=performance.now();assert.deepEqual(diffLineCounts(a,b),expected(5001,5001));
 assert(performance.now()-start<2000,'线性大输入计数仍有界');
 const c=Array.from({length:5001},(_,i)=>`A${(i+1)%5001}\n`).join('');
 start=performance.now();const unavailable=diffLineCounts(a,c);
 assert.equal(unavailable.available,false);assert.equal(unavailable.added,null);assert.equal(unavailable.removed,null);
 assert.match(unavailable.reason,/变化窗口仍超过 5000 行/);assert.equal(diffText(a,c).mode,'full');
 assert(performance.now()-start<2000,'复杂大窗口不进入二次路径');
 const long='长'.repeat(100001)+'\n';
 const byChars=diffLineCounts(long+'公共\n旧\n','公共\n'+long+'新\n');
 assert.equal(byChars.available,false);assert.equal(byChars.added,null);assert.equal(byChars.removed,null);
 assert.match(byChars.reason,/变化窗口仍超过 100000 字符/);
});

test('C-10 5000行最坏路径原界限不放宽，计数与行内差异完全同口径',()=>{
 const a=Array.from({length:5000},(_,i)=>`A${i}\n`).join('');
 const b=Array.from({length:5000},(_,i)=>`B${i}\n`).join('');
 const start=performance.now(),rows=diffText(a,b).rows;
 assert.equal(rows.filter(r=>r.type==='removed').length,5000);
 assert.equal(rows.filter(r=>r.type==='added').length,5000);
 assert.equal(rows.filter(r=>r.type!=='added').map(r=>r.text).join(''),a);
 assert.equal(rows.filter(r=>r.type!=='removed').map(r=>r.text).join(''),b);
 assert.deepEqual(diffLineCounts(a,b),expected(5000,5000));
 assert(performance.now()-start<2000,'5000行最坏输入计数和原差异总耗时不超原界限');
});

test('C-10 可控窗口200组确定性随机输入：计数等于原LCS逐行结果',()=>{
 let n=155;const random=()=>{n=(n*1664525+1013904223)>>>0;return n;};
 const parts=['甲\r\n','乙\n','重复\r','\n','末行'];
 for(let i=0;i<200;i++){
  const make=()=>Array.from({length:random()%18},()=>parts[random()%parts.length]).join('');
  const a=make(),b=make(),r=diffText(a,b);
  assert.equal(r.mode,'lines');
  assert.deepEqual(diffLineCounts(a,b),expected(r.rows.filter(x=>x.type==='removed').length,r.rows.filter(x=>x.type==='added').length));
 }
});

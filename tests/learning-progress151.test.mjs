import assert from 'node:assert/strict';import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {setBookProgress,setBookStatus,bookProgress,bookStatus} from '../src/learning.js';
import {validateLearning} from '../server/schema.mjs';
let count=0;
{
 const book={id:'bfixture',root:'/fixture/books',path:'sample.pdf',name:'sample.pdf'},empty={learning:{folders:[],books:[],links:[]}};
 const check=(fn)=>{fn();count++;};
 check(()=>{const next=setBookProgress(empty,book,{unit:'percent',value:0});assert.equal(bookStatus(next,book.id),'');assert.equal(bookProgress(next,book.id).value,0);assert.doesNotThrow(()=>validateLearning(next.learning));});
 check(()=>{const next=setBookProgress(empty,book,{unit:'percent',value:100});assert.equal(bookProgress(next,book.id).value,100);});
 check(()=>{const next=setBookStatus(setBookProgress(empty,book,{unit:'chapter',value:'第 4 章'}),book,'learning');assert.equal(bookProgress(next,book.id).value,'第 4 章');assert.equal(bookStatus(next,book.id),'learning');assert.doesNotThrow(()=>validateLearning(next.learning));});
 check(()=>{const next=setBookProgress(setBookStatus(empty,book,'done'),book,{unit:'chapter',value:'附录 B'});assert.equal(bookStatus(next,book.id),'done');assert.equal(bookProgress(next,book.id).value,'附录 B');});
 for(const value of [-1,101,NaN,Infinity,'50'])check(()=>assert.throws(()=>setBookProgress(empty,book,{unit:'percent',value}),/百分比/));
 for(const value of ['', 'x'.repeat(101),'第\n4章'])check(()=>assert.throws(()=>setBookProgress(empty,book,{unit:'chapter',value}),/阅读位置/));
 check(()=>assert.throws(()=>setBookProgress(empty,book,{unit:'estimate',value:50}),/单位/));
 const good=setBookProgress(empty,book,{unit:'percent',value:50}).learning;
 for(const bad of [{status:''},{status:'unknown'},{progress:undefined,status:undefined},{progress:{unit:'percent',value:101,updatedAt:new Date().toISOString()}},{progress:{unit:'chapter',value:'第\n2章',updatedAt:new Date().toISOString()}},{progress:{unit:'percent',value:10,updatedAt:'invalid'}}])check(()=>assert.throws(()=>validateLearning({...good,books:[{...good.books[0],...bad}]}),/数据校验失败/));
 console.log(JSON.stringify({ok:true,syntheticChecks:count,preserveStatusAndProgress:true,oldInvalidStatesRemainRejected:true}));
}

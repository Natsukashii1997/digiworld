import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';

const app=await fixture(),browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const state=seed();state.notes=['plain','todo','timeline'].map((type,i)=>({id:`note-${i}`,type,title:`标题专用词 ${type}`,text:i?'共同正文':'',at:'2026-10-22T00:00:00Z'}));
await app.repository.write(state,{initialize:true});
let page=await context.newPage();page.setDefaultTimeout(4000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
const mode=process.env.AUDIT_A_CASE||'home';
try{
 if(mode==='home'){
  await page.goto(app.url+'/#home');await page.getByRole('textbox',{name:'记一笔'}).fill('首页未提交草稿，保留中文');
  await page.getByRole('button',{name:/^资产仓库 \d/}).click();await page.getByRole('button',{name:'基地',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="记一笔"]')?.value==='首页未提交草稿，保留中文');
  await page.reload();await page.waitForFunction(()=>document.querySelector('[aria-label="记一笔"]')?.value==='首页未提交草稿，保留中文');
  await page.close();page=await context.newPage();await page.goto(app.url+'/#home');
  await page.waitForFunction(()=>document.querySelector('[aria-label="记一笔"]')?.value==='首页未提交草稿，保留中文');
  assert.equal((await app.repository.read()).notes.length,3,'恢复草稿不自动正式提交');
 }
 if(mode==='notes'){
  await page.goto(app.url+'/#notes');await page.getByRole('button',{name:'记一条新念头',exact:true}).click();
  await page.getByRole('textbox',{name:'便签标题'}).fill('三类型草稿标题');
  await page.getByRole('textbox',{name:'随手记内容',exact:true}).fill('未提交的正文');
  await page.getByRole('button',{name:'基地',exact:true}).click();await page.getByRole('button',{name:/^随手记 \d/}).click();
  await page.getByRole('textbox',{name:'便签标题'}).waitFor();assert.equal(await page.getByRole('textbox',{name:'便签标题'}).inputValue(),'三类型草稿标题');
  await page.reload();await page.getByRole('textbox',{name:'便签标题'}).waitFor();assert.match(await page.getByRole('textbox',{name:'随手记内容',exact:true}).innerText(),/未提交的正文/);
  assert.equal((await app.repository.read()).notes.length,3);
 }
 if(mode==='search'){
  await page.goto(app.url+'/#home');
  for(const [i,type] of ['plain','todo','timeline'].entries()){
   await page.getByRole('button',{name:'搜索',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'搜索工作台'});await dialog.getByRole('textbox').fill('标题专用词 '+type);
   await dialog.getByRole('button').filter({hasText:'标题专用词 '+type}).click();
   await page.waitForFunction(id=>document.activeElement?.closest('[data-note-id]')?.dataset.noteId===id,'note-'+i);
   assert.equal(await page.getByRole('textbox',{name:'随手记内容',exact:true}).count(),0,'定位不自动编辑');
  }
  await page.getByRole('button',{name:'记一条新念头',exact:true}).click();await page.getByRole('textbox',{name:'便签标题'}).fill('搜索时保留草稿');
  await page.getByRole('button',{name:'搜索',exact:true}).click();const dialog=page.getByRole('dialog',{name:'搜索工作台'});await dialog.getByRole('textbox').fill('标题专用词 plain');await dialog.getByRole('button').filter({hasText:'标题专用词 plain'}).click();
  assert.equal(await page.getByRole('textbox',{name:'便签标题'}).inputValue(),'搜索时保留草稿');await page.getByRole('textbox',{name:'随手记内容',exact:true}).focus();await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.activeElement?.closest('[data-note-id]')?.dataset.noteId==='note-0');
 }
 assert.deepEqual(errors,[]);console.log('PASS A '+mode);
}finally{await browser.close();await app.close();}

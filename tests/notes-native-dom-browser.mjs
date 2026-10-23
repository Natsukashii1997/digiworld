// Regression at the shared editor boundary: native editing may replace nodes inside contentEditable.
// Synthetic DOM mutation is not a substitute for real macOS IME candidate acceptance.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
const app=await fixture(),browser=await chromium.launch(),results=[];
const out=process.env.FLOAT_NATIVE_DOM_RESULTS;
const initial=seed();initial.notes=[];await app.repository.write(initial,{initialize:true});
try{
 for(const mode of ['noncancelable-control','noncancelable-restructure','composition-restructure','delete-all-control','delete-all-restructure']){
  const context=await browser.newContext({viewport:{width:368,height:600}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(app.url+'/#/float');await page.getByRole('button',{name:'写一条'}).click();
   const input=page.getByRole('textbox',{name:'随手记内容'});await input.waitFor();const noteId=await input.evaluate(el=>el.closest('[data-note-id]').dataset.noteId);
   if(mode.startsWith('delete-all'))await page.keyboard.insertText('删除全部');
   await input.evaluate((el,mode)=>{
    el.focus();const isComposition=mode.startsWith('composition'),isDelete=mode.startsWith('delete-all');
    if(isDelete){const range=document.createRange();range.selectNodeContents(el);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}
    if(isComposition)el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));
    else el.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:false,inputType:isDelete?'deleteContentBackward':'insertText',data:isDelete?null:'你好'}));
    if(isDelete&&mode.endsWith('restructure'))el.replaceChildren(document.createElement('br'));
    else {if(mode.endsWith('restructure')){const wrapper=el.firstElementChild;wrapper.replaceWith(...wrapper.childNodes);}el.querySelector('[data-note-text]').textContent=isDelete?'':'你好';}
    if(isComposition)el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'你好'}));
    else el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:isDelete?'deleteContentBackward':'insertText',data:isDelete?null:'你好'}));
   },mode);
   await page.waitForTimeout(150);
   const observed=await page.evaluate(()=>({panel:!!document.querySelector('.fn-panel'),rootChildren:document.querySelector('#root')?.childElementCount,editor:document.querySelector('[role=textbox]')?.textContent}));
   if(out){await mkdir(out,{recursive:true});await page.screenshot({path:join(out,mode+'.png')});}
   assert.equal(observed.panel,true,'native edit must keep the complete notes panel mounted');assert.equal(observed.editor,mode.startsWith('delete-all')?'':'你好');assert.deepEqual(errors,[]);
   if(mode.startsWith('delete-all'))await page.keyboard.insertText('删除后继续输入');
   await page.locator('.sn-state').getByText('已保存',{exact:true}).waitFor();
   await page.reload();await page.locator('[data-note-id="'+noteId+'"]').getByRole('group',{name:mode.startsWith('delete-all')?'便签正文：删除后继续输入':'便签正文：你好',exact:true}).waitFor();assert.deepEqual(errors,[]);
   results.push({mode,pass:true,observed,errors});
  }catch(e){results.push({mode,pass:false,error:e.message,errors});}
  finally{await context.close();}
 }
 for(const mode of ['continuous-typing-history','multiline-delete-history','consecutive-composition']){
  const context=await browser.newContext({viewport:{width:368,height:600}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(app.url+'/#/float');await page.getByRole('button',{name:'写一条'}).click();
   const input=page.getByRole('textbox',{name:'随手记内容'});await input.waitFor();
   const text=async expected=>{const visible=await input.innerText();assert.equal(visible==='\n'?'':visible,expected);assert.equal(await input.evaluate(el=>document.activeElement===el),true);assert.equal(await page.locator('.fn-panel').count(),1);};
   if(mode==='consecutive-composition'){
    const compose=async(data,whole)=>{await input.evaluate((el,{data,whole})=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));el.querySelector('[data-note-text]').textContent=whole;el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data}));},{data,whole});await page.waitForTimeout(30);};
    await compose('你好','你好');await text('你好');
    await input.evaluate(el=>{el.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:false,inputType:'insertText',data:'你好'}));el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'你好'}));});
    await compose('世界','你好世界');await text('你好世界');
    await page.keyboard.press('Meta+z');await text('你好');await page.keyboard.press('Meta+z');await text('');
    await page.keyboard.press('Meta+Shift+z');await text('你好');await page.keyboard.press('Meta+Shift+z');await text('你好世界');
   }else{
    const initial=mode==='multiline-delete-history'?'起点🙂\n第二行':'abc';
    await page.keyboard.insertText(initial);await page.keyboard.press('Meta+a');await page.keyboard.press('Backspace');await text('');
    if(mode==='continuous-typing-history'){await page.keyboard.type('xy');await text('xy');await page.keyboard.press('Meta+z');await text('x');await page.keyboard.press('Meta+z');await text('');await page.keyboard.press('Meta+Shift+z');await text('x');await page.keyboard.press('Meta+Shift+z');await text('xy');}
    else {await page.keyboard.type('x');await text('x');await page.keyboard.press('Meta+z');await text('');await page.keyboard.press('Meta+z');await text(initial);await page.keyboard.press('Meta+Shift+z');await text('');await page.keyboard.press('Meta+Shift+z');await text('x');}
   }
   assert.deepEqual(errors,[]);results.push({mode,pass:true,errors});
  }catch(e){results.push({mode,pass:false,error:e.message,errors});}finally{await context.close();}
 }
 if(out)await writeFile(join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));assert.ok(results.every(x=>x.pass),'native editable DOM regression failed');
}finally{await browser.close();await app.close();}

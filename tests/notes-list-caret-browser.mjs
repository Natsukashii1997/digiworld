import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './fixture.mjs';
import { seed } from '../src/store.js';

const output=process.env.NOTES_CARET_RESULTS||'test-results/notes-list-caret';
await mkdir(output,{recursive:true});
const app=await fixture();const state=seed();state.notes=[];await app.repository.write(state,{initialize:true});
const browser=await (process.env.NOTES_CARET_ENGINE==='webkit'?webkit:chromium).launch(process.env.NOTES_CARET_EXECUTABLE?{executablePath:process.env.NOTES_CARET_EXECUTABLE}:{});
const results=[];
try {
 for(const [kind,label] of [['ol','有序列表'],['ul','无序列表'],['task','任务列表']]) {
  const page=await browser.newPage({viewport:{width:368,height:600},reducedMotion:'reduce'});page.setDefaultTimeout(6000);
  try {
   await page.goto(app.url+'/#/float');await page.getByRole('button',{name:'写一条'}).click();
   await page.getByRole('button',{name:label,exact:true}).click();
   await page.keyboard.insertText('第一项');await page.keyboard.press('Enter');
   const metrics=await page.getByRole('textbox',{name:'随手记内容'}).evaluate(root=>{
    const s=getSelection(),r=s.rangeCount?s.getRangeAt(0):null;
    const element=s.focusNode?.nodeType===1?s.focusNode:s.focusNode?.parentElement;
    const line=element?.closest('[data-note-line]'),text=line?.querySelector('[data-note-text]');
    const box=rect=>rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null;
    return {focused:document.activeElement===root,collapsed:s.isCollapsed,lineIndex:[...root.querySelectorAll('[data-note-line]')].indexOf(line),offset:s.focusOffset,focusNode:s.focusNode?.nodeName,text:text?.textContent,textBox:box(text?.getBoundingClientRect()),caretBox:box(r?.getBoundingClientRect()),caretRects:r?[...r.getClientRects()].map(box):[],caretColor:getComputedStyle(root).caretColor};
   });
   await page.screenshot({path:join(output,kind+'-newline.png'),caret:'initial'});results.push({kind,metrics});
   assert.equal(metrics.focused,true,'editor retains keyboard focus');assert.equal(metrics.collapsed,true);
   assert.equal(metrics.lineIndex,1,'selection reaches new empty list item');assert.equal(metrics.text,'');
   // A collapsed Range around an empty <br> can report no rectangle even while the browser paints a caret.
   assert.ok(metrics.textBox.width>=1&&metrics.textBox.height>=10,'new empty list text must have a paintable caret area');
   await page.keyboard.insertText('第二项');
   assert.equal(await page.locator('.sn-editable [data-note-text]').allTextContents().then(lines=>lines.join('\n')),'第一项\n第二项');
   await page.locator('.sn-state').getByText('已保存',{exact:true}).waitFor();
   const id=await page.getByRole('textbox',{name:'随手记内容'}).evaluate(el=>el.closest('[data-note-id]').dataset.noteId);
   const saved=(await app.repository.read()).notes.find(n=>n.id===id);
   const expected={ol:'1. 第一项\n2. 第二项',ul:'- 第一项\n- 第二项',task:'- [ ] 第一项\n- [ ] 第二项'}[kind];
   assert.equal(saved.text,expected,'typing after the empty list row saves exact list content');
   assert.equal(saved.format,'md1');
  }catch(error){results.at(-1)?.kind===kind?results.at(-1).error=error.message:results.push({kind,error:error.message});}
  finally {await page.close();}
 }
 await writeFile(join(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
 assert.ok(results.length===3&&results.every(r=>!r.error),'list newline caret regression');
} finally {await browser.close();await app.close();}

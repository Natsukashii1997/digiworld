import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
const output=process.env.NOTES_TYPES_RESULTS||'work/notes580/browser';
await mkdir(output,{recursive:true});
const app=await fixture(),initial=seed();initial.notes=[{id:'old-note',at:'2026-10-19T00:00:00Z',text:'原便签第一行\n- [x] 原勾选',format:'md1'}];
await app.repository.write(initial,{initialize:true});
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']}),page=await context.newPage();
page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
const editor=()=>page.getByRole('textbox',{name:'随手记内容',exact:true});
async function type(text){await editor().click();await page.keyboard.press('Meta+a');await page.keyboard.insertText(text);}
async function menu(name,value){await editor().click({button:'right'});const m=page.getByRole('menu',{name:'便签编辑菜单'});await m.getByRole('menuitem',{name,exact:false}).click();if(value)await m.getByRole('button',{name:value,exact:true}).click();}
const results=[];
try{
 await page.goto(app.url+'/#notes');
 await page.getByRole('button',{name:'记一条新念头',exact:true}).click();
 await page.getByRole('textbox',{name:'便签标题',exact:true}).fill('会议随记');
 await type('重要结论');
 await page.keyboard.press('Meta+a');await menu('格式','加粗');
 await page.keyboard.press('Meta+a');await menu('高亮','#fff19a');
 await page.keyboard.press('Meta+a');await menu('字号','20');
 await page.getByRole('button',{name:'贴上',exact:true}).click();
 await editor().waitFor({state:'detached'});
 let notes=(await app.repository.read()).notes;let ordinary=notes.find(n=>n.title==='会议随记');
 assert.equal(ordinary.type,'plain');assert.equal(ordinary.rich.lines[0].runs[0].bold,true);assert.equal(ordinary.rich.lines[0].runs[0].size,20);
 await page.reload();const card=page.locator(`[data-note-id="${ordinary.id}"]`);await card.getByRole('heading',{name:'会议随记'}).waitFor();
 assert.equal(await card.locator('[data-note-text] span').first().evaluate(el=>getComputedStyle(el).fontWeight),'700');
 assert.equal(await card.locator('[data-note-text] span').first().evaluate(el=>getComputedStyle(el).color),'rgb(38, 50, 56)','浅色高亮自动使用可读文字色');
 await card.getByRole('button',{name:'复制便签（含格式）'}).click();await card.getByRole('status').filter({hasText:'已复制'}).waitFor();
 const copied=await page.evaluate(async()=>{const [item]=await navigator.clipboard.read();return{plain:await(await item.getType('text/plain')).text(),html:await(await item.getType('text/html')).text()};});
 assert.equal(copied.plain,'会议随记\n重要结论');assert.match(copied.html,/font-weight:700/);
 results.push('普通便签：标题、选区加粗/高亮/字号、保存重开与带标题复制');
 await page.getByRole('button',{name:'记一条新念头',exact:true}).click();await editor().click();await page.keyboard.press('Meta+v');
 assert.match(await editor().innerText(),/重要结论/);assert.equal(await editor().locator('[data-note-text] span').last().evaluate(el=>getComputedStyle(el).fontWeight),'700');
 await page.keyboard.press('Meta+z');assert.equal((await editor().innerText()).trim(),'');await page.keyboard.press('Meta+Shift+z');assert.match(await editor().innerText(),/重要结论/);
 await page.keyboard.press('Escape');
 results.push('带格式粘贴与撤销重做保留文字和样式');

 await page.getByRole('combobox',{name:'新便签类型'}).selectOption('todo');await page.getByRole('button',{name:'记一条新念头',exact:true}).click();
 await page.getByRole('textbox',{name:'便签标题',exact:true}).fill('工作事项');
 await editor().click();await page.keyboard.insertText('写工作报告，发给老板');await page.keyboard.press('Enter');await page.keyboard.insertText('跟产品沟通新版本问题');
 await page.getByRole('button',{name:'贴上',exact:true}).click();await editor().waitFor({state:'detached'});
 notes=(await app.repository.read()).notes;const todo=notes.find(n=>n.type==='todo');const todoCard=page.locator(`[data-note-id="${todo.id}"]`);
 await todoCard.getByRole('checkbox',{name:'写工作报告，发给老板'}).check();
 await page.waitForFunction(id=>document.querySelector(`[data-note-id="${id}"] .done`),todo.id);
 await page.waitForFunction(id=>!document.querySelector(`[data-note-id="${id}"]`)?.classList.contains('sn-motion-task'),todo.id);
 for(let i=0;i<50;i++){if((await app.repository.read()).notes.find(n=>n.id===todo.id)?.text.startsWith('- [x]'))break;await new Promise(r=>setTimeout(r,100));}
 const storedTodo=(await app.repository.read()).notes.find(n=>n.id===todo.id);assert.match(storedTodo.text,/^- \[x\] 写工作报告/);assert.equal(Object.hasOwn(storedTodo,'completedAt'),false);
 results.push('待办：新增连续任务、原位勾选完成、无任务时间字段');
 await page.getByRole('combobox',{name:'新便签类型'}).selectOption('timeline');await page.getByRole('button',{name:'记一条新念头',exact:true}).click();
 await page.getByRole('textbox',{name:'便签标题',exact:true}).fill('项目进程');
 await editor().locator('[data-note-text]').click();await page.keyboard.insertText('版本发布');
 await page.getByLabel('事件时间',{exact:true}).fill('2027-01-20T10:30');
 await page.getByRole('textbox',{name:'便签标题'}).click();
 await page.getByRole('button',{name:'＋ 添加时间节点'}).click();
 const dates=page.getByLabel('事件时间',{exact:true});
 // The new blank event is located by content, independent of its sorted position.
 const blank=editor().locator('[data-note-line]').filter({has:page.locator('[data-note-text]')});
 const emptyIndex=await editor().locator('[data-note-text]').evaluateAll(els=>els.findIndex(el=>!el.textContent));
 await editor().locator('[data-note-text]').nth(emptyIndex).click();await page.keyboard.insertText('设计评审');
 await dates.nth(emptyIndex).fill('2026-09-01T09:00');await page.keyboard.press('Meta+Enter');
 await editor().waitFor({state:'detached'});
 const timeline=(await app.repository.read()).notes.find(n=>n.type==='timeline');
 assert.equal(timeline.rich.lines[0].when,'2026-09-01T09:00');assert.equal(timeline.rich.lines[0].runs.map(r=>r.text).join(''),'设计评审');
 assert.equal(timeline.rich.lines[1].runs.map(r=>r.text).join(''),'版本发布');
 assert.deepEqual((await app.repository.read()).notes.find(n=>n.id==='old-note'),initial.notes[0]);
 results.push('时间轴：手动日期、过去与未来、排序后正文身份不串；旧便签原样保留');
 await page.reload();await page.locator(`[data-note-id="${timeline.id}"]`).waitFor();await page.mouse.move(20,20);
 for(const width of [1440,780,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`${output}/notes-${width}.png`,fullPage:true});}
 // A single-note route uses the same stored identity, not a cloned note.
 await page.goto(app.url+`/?noteId=${ordinary.id}#/float`);await page.getByRole('textbox',{name:'便签标题'}).fill('独立窗口编辑');
 await page.waitForFunction(()=>document.querySelector('.sn-state')?.textContent==='已保存');
 for(let i=0;i<30;i++){if((await app.repository.read()).notes.find(n=>n.id===ordinary.id)?.title==='独立窗口编辑')break;await new Promise(r=>setTimeout(r,100));}
 assert.equal((await app.repository.read()).notes.find(n=>n.id===ordinary.id).title,'独立窗口编辑');
 await page.screenshot({path:`${output}/single-390.png`,fullPage:true});
 await editor().click({button:'right'});await page.screenshot({path:`${output}/context-390.png`,fullPage:true});
 results.push('单张入口：同一ID标题自动保存回主库');
 await page.keyboard.press('Escape');
 const remote=await app.repository.read();remote.notes=remote.notes.map(n=>n.id===ordinary.id?{...n,title:'别处更新的标题'}:n);await app.repository.write(remote,{expectedRevision:remote.revision});
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>document.querySelector('[aria-label="便签标题"]')?.value==='别处更新的标题');
 const count=(await app.repository.read()).notes.length;await editor().focus();await page.keyboard.press('Meta+n');assert.equal((await app.repository.read()).notes.length,count);assert.equal(await page.locator('.sn').getAttribute('data-note-id'),ordinary.id);
 results.push('单窗重新聚焦吸收远端已保存内容；新建快捷键不产生跨窗草稿');

 await page.goto(app.url+'/#/float');await page.getByRole('button',{name:'新建待办事项',exact:true}).click();await editor().waitFor();assert.equal(await editor().locator('.sn-line-task').count(),1,'待办图标直接新建待办');
 await page.getByRole('textbox',{name:'便签标题'}).fill('快捷键待办');await editor().click();await page.keyboard.insertText('保留类型选择');
 for(let i=0;i<40;i++){if((await app.repository.read()).notes.some(n=>n.title==='快捷键待办'&&n.type==='todo'))break;await new Promise(r=>setTimeout(r,100));}
 assert.ok((await app.repository.read()).notes.some(n=>n.title==='快捷键待办'&&n.type==='todo'));results.push('原版便签栏：待办图标直接新建并自动保存类型');
 assert.deepEqual(errors,[]);console.log(results.join('\n'));
}catch(error){await page.screenshot({path:`${output}/failure.png`,fullPage:true});console.log(await page.locator('[role=alert]').allTextContents());throw error;}finally{await writeFile(`${output}/results.json`,JSON.stringify({results,errors},null,2));await browser.close();await app.close();}

// 合成边界：首次渲染到effect订阅之间偏好已改变，且没有补发change。
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { fixture } from './fixture.mjs';
const app=await fixture(),browser=await chromium.launch();
const source=`import React from 'react';import {createRoot} from 'react-dom/client';import {useReducedMotion,LcdCount} from './src/v14.jsx';
function Probe(){const reduced=useReducedMotion();return <section aria-label="减少动态效果边界" data-reduced={String(reduced)}><LcdCount value={900}/></section>;}
const original=window.matchMedia.bind(window);
window.matchMedia=query=>query==='(prefers-reduced-motion: reduce)'?{media:query,matches:false,addEventListener(){this.matches=true;},removeEventListener(){}}:original(query);
createRoot(document.getElementById('motion-boundary')).render(<Probe/>);`;
const result=await build({absWorkingDir:process.cwd(),stdin:{contents:source,resolveDir:process.cwd(),loader:'jsx'},bundle:true,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},write:false,outfile:'host.js',logLevel:'silent'});
const js=result.outputFiles.find(f=>f.path.endsWith('host.js'));assert.ok(js);
try{
 const page=await browser.newPage();page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=new URL('/__synthetic_motion_boundary.js',app.url).href;
 await page.route(url,r=>r.fulfill({contentType:'text/javascript',body:js.text}));
 await page.goto(app.url+'/#references');await page.locator('h1').waitFor();
 await page.evaluate(()=>{const el=document.createElement('div');el.id='motion-boundary';document.body.append(el);});
 await page.addScriptTag({url});
 const probe=page.getByRole('region',{name:'减少动态效果边界'});await probe.waitFor();
 await page.waitForFunction(()=>document.querySelector('[aria-label="减少动态效果边界"]')?.dataset.reduced==='true');
 const before=await probe.locator('svg').evaluate(e=>e.outerHTML);await page.waitForTimeout(500);
 assert.equal(await probe.locator('svg').evaluate(e=>e.outerHTML),before,'已改变偏好后JS点阵必须稳定');
 assert.equal(await probe.locator('svg').getAttribute('aria-label'),'900');assert.deepEqual(errors,[]);
 console.log('PASS 订阅时同步当前媒体偏好；漏事件边界点阵稳定');
}finally{await browser.close();await app.close();}

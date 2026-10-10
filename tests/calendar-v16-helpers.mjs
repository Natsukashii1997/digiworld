import assert from 'node:assert/strict';
import {geometry as baseGeometry} from './ui-v14-checks.mjs';
export function calendarMarker(p,id,date='2026-10-04') {return p.locator(`.cal-day[data-date="${date}"] .cal-event-marker[data-event-id="${id}"], .cal-allday-chip[data-event-id="${id}"]`).first();}
export async function clickCalendarEvent(p,id,date='2026-10-04') {const marker=calendarMarker(p,id,date);await marker.scrollIntoViewIfNeeded();const b=await marker.boundingBox();await p.mouse.click(b.x+b.width/2,b.y+b.height/2);return marker;}
// 横滑只豁免 TodoList 容器内的水平位置；其高度、全部控件44px和页面边界照查。
export async function calendarGeometry(p,selector,label) {
 if(!await p.locator('.calendar-v16').count())return baseGeometry(p,selector,label);
 const bad=await p.locator(selector).evaluate(root=>{const bad=[];if(document.documentElement.scrollWidth>innerWidth)bad.push('页面横溢');for(const e of [root,...root.querySelectorAll('*')]){if(e.closest('svg,.sr-only')||!e.checkVisibility({checkOpacity:true}))continue;const r=e.getBoundingClientRect(),s=getComputedStyle(e),list=e.closest('.todo-list');if(!r.width&&!r.height)continue;if(!list&&(r.left<-.5||r.right>innerWidth+.5))bad.push(e.className+'边界');if(['hidden','clip'].includes(s.overflowX)&&e.scrollWidth>e.clientWidth+1)bad.push(e.className+'横裁切');if(['hidden','clip'].includes(s.overflowY)&&e.scrollHeight>e.clientHeight+1)bad.push(e.className+'纵裁切');}return bad;});assert.deepEqual(bad,[],label);
 for(const c of await p.locator(selector).locator('button,a,input,select,textarea,summary').all()){if(!await c.isVisible())continue;const b=await c.evaluate(e=>(['checkbox','radio','file'].includes(e.type)?e.closest('label'):e).getBoundingClientRect().toJSON());assert(b.width>=44&&b.height>=44,`${label} 44px ${await c.getAttribute('aria-label')} ${JSON.stringify(b)}`);}
}

export async function calendarTrigger(p,id,date='2026-10-04') {
 // 写后回读会异步重绘；先等真实事件出现，再按其DOM类型选择入口。
 const marker=calendarMarker(p,id,date);await marker.waitFor();
 if(await marker.evaluate(e=>e.matches('.cal-allday-chip')))return marker;
 const index=await marker.evaluate(e=>{const b=e.getBoundingClientRect();return [...e.closest('.cal-lane').querySelectorAll('.cal-marker-hit')].findIndex(x=>{const r=x.getBoundingClientRect();return r.top<=b.top+.5&&r.bottom>=b.bottom-.5;});});assert(index>=0,'事件有真实命中入口');return p.locator(`.cal-day[data-date="${date}"] .cal-marker-hit`).nth(index);
}

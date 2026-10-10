import {fixture} from './fixture.mjs';
import {createStubHelper} from './calendar-fixture.mjs';
import {seed} from '../src/store.js';
export const CALENDAR_NOW='2026-10-04T14:30:00+08:00';
const at=(day,time)=>new Date(`2026-${day<31?'09':'10'}-${String(day<31?day:day-30).padStart(2,'0')}T${time}:00+08:00`).toISOString();
export function calendarData(){
 const state=seed();state.night={...state.night,time:'19:00',end:'20:00'};state.nightV2={...state.nightV2,window:{start:'19:00',end:'20:00'}};
 const specs=[[28,'09:00','10:00','写交接与回归',true],[28,'15:00','16:30','派单 168 验收',true],[29,'09:00','10:00','周会',false],[29,'14:00','15:00','1:1',false],[30,'09:00','10:00','写交接与回归',true],[30,'12:00','14:00','深度工作：v16 页面简报',true],[31,'10:00','11:00','设计评审',false],[31,'15:30','16:30','牙医',false],[32,'09:00','10:00','写交接与回归',true],[32,'13:00','16:00','随手记视觉稿',true],[33,'09:00','10:30','读书会',false],[34,'09:00','10:00','验收 155',true],[34,'14:00','14:45','写交接与回归',false]];
 const events=specs.map(([day,a,b,title,workbench],i)=>({id:`cal-${i}`,title,workbench,calendar:workbench?'工作台':'公司',start:at(day,a),end:at(day,b),allDay:false,modified:at(27,'08:00')}));events.push({id:'cal-all',title:'写交接',workbench:false,calendar:'公司',start:at(34,'00:00'),end:at(35,'00:00'),allDay:true,modified:at(27,'08:00')});
 const todos=[{id:'due',title:'回复读书会时间',completed:false,due:at(34,'14:00'),dueHasTime:true},{id:'future',title:'整理 refs 文件夹',completed:false,due:at(35,'09:00'),dueHasTime:true},{id:'date',title:'给银饰拍白底图',completed:false,due:at(33,'00:00'),dueHasTime:false},{id:'done',title:'续费域名',completed:true,due:null,dueHasTime:false}].map(t=>({...t,modified:at(27,'08:00')}));
 return {state,events,todos};
}
export async function calendarFixture(mode='full',options={},data=calendarData()){const stub=createStubHelper({...data,now:()=>new Date(CALENDAR_NOW),...(mode==='perm'?{calendar:'notDetermined',reminders:'notDetermined'}:{}),...options});const app=await fixture({discovery:{calendarHelper:{platform:'darwin',run:stub.run}}});await app.repository.write(data.state,{initialize:true});return {...app,stub,data};}
export async function calendarRoutes(p){await p.addInitScript(({now})=>{const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[now]));}static now(){return new NativeDate(now).getTime();}};},{now:CALENDAR_NOW});}

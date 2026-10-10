// 全合成项目快照；生产组件/HTTP持久化复用，状态读取用显式API桩且禁止外连。
import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
export const stamp183='2026-10-05T05:20:00.000Z';
export function projectsData183({empty=false,noactive=false,long=false}={}) {
 const state=seed();state.notes=[];state.projects=[];
 const defs=[['dotfiles','/synthetic/Projects/dotfiles','2026-10-04',false],['银饰作品集','/synthetic/Projects/silver','2026-10-03',true],['菜谱盒子','/synthetic/Projects/recipe-box','2026-09-30',false],['photo-sorter','/synthetic/Projects/photo-sorter','2026-09-22',false],['旧博客','/synthetic/Projects/blog','2026-09-14',true],['travel-notes','/synthetic/Projects/travel-notes','2026-09-11',false],['old-api','/synthetic/Projects/old-api','2026-08-30',false],['个人 AI 工作台','/synthetic/Documents/personal-ai-workbench','2026-10-05',true],['论文笔记','/synthetic/Documents/thesis-notes','2026-08-02',false],['ai-ui-users','','2026-10-02',false],['digimon-sprites','','2026-07-18',false],['resume-site','',null,false]];
 const projects=empty?[]:defs.map(([name,path,day,active],i)=>({id:'project183-'+i,name:long&&active?name+'长项目EnglishWithoutSpaces'.repeat(7):name,kind:path?'Git':'GitHub',localPaths:path?[path]:[],repoKey:path?'':`synthetic/${name}`,...(i===1||i===7||!path?{githubUrl:`https://github.com/synthetic/project${i}`}:{}),active:noactive?false:active,seenThisScan:i!==10,identityConflict:i===6,recentUpdate:{state:day?'ok':'unknown',source:path?'Git':'GitHub',checkedAt:stamp183,...(day?{at:day+'T05:20:00.000Z'}:{reason:'没有可核实时间'})}}));
 state.connections={roots:['/synthetic/Projects','/synthetic/Documents'],projects,agents:[{id:'codex',name:'Codex',kind:'开发 Agent',status:'detected',programs:[],configFound:false,errors:[]}],errors:[],truncated:false,agentScannedAt:stamp183,projectScannedAt:stamp183,github:{status:'connected',login:'synthetic',message:'',at:stamp183}};
 const ids=[7,1,4];
 const items=ids.map((i,n)=>({projectId:'project183-'+i,name:projects.find(p=>p.id==='project183-'+i)?.name||defs[i][0],root:defs[i][1],current:{state:'ok',path:'CURRENT.md',fields:{stateId:'P-20261005-'+(12+n),writer:['Codex','无','Claude Code'][n],next:long?'核对中英文长项目标识与完整路径，不省略下一步：'+'personal-ai-workbench/'.repeat(9):['认领派单183：项目空间按 UI v16 落地，开工先冻结视觉稿参照','补齐收藏格四类剪影，回读后交接','迁移到 Astro 后核对 RSS 与旧链接跳转'][n],handoff:{text:'合成交接'+n,href:'docs/handoffs/'+n+'.md'}},mtime:stamp183},stage:{id:['implement','accept','review'][n],label:['实现','验收','复核'][n],basis:'当前写入者'},activity:{state:n===2?'stalled':'active',latestAt:defs[i][2]+'T05:20:00.000Z',idleDays:n===2?21:0,source:'Git'},safety:{issues:n===1?[{kind:'remote'}]:[],checks:{git:{state:'repo'},remote:{state:'present',names:['origin']},dirty:{state:'ok',count:0},sensitive:{state:'ok',total:0,files:[]},visibility:{state:'private'}}}}));
 const daily={at:stamp183,items:items.map((p,n)=>({projectId:p.projectId,state:'ok',days:Array.from({length:30},(_,j)=>({date:'2026-09-'+String(j+1).padStart(2,'0'),git:(j+n)%5,current:0,total:(j+n)%5})),note:'当前 HEAD 可达提交；CURRENT 只计最后一次修改，不能还原过去修改次数。'}))};
 return {state,items:empty||noactive?[]:items,daily};
}
export async function fixture183(options={}) {
 const data=projectsData183(options),app=await fixture();
 const connections=data.state.connections;await app.repository.write({...data.state,connections:undefined},{initialize:true});await app.repository.updateConnections(()=>connections);
 return {...app,data};
}
export async function routes183(page,app,{unreadable=false}={}) {
 await page.route('**/api/project-status/inspect',r=>r.fulfill({json:{at:stamp183,stallDays:7,items:app.data.items.filter(i=>app.data.state.connections.projects.find(p=>p.id===i.projectId)?.active).map((p,i)=>unreadable&&i===0?{...p,current:{state:'error',message:'合成无权限'},activity:{state:'stalled',idleDays:21},stage:{id:'implement',label:'实现'}}:p)}}));
 await page.route('**/api/project-status/activity',r=>r.fulfill({json:app.data.daily}));
 await page.route('**/api/project-github/panel',r=>r.fulfill({json:{at:stamp183,items:[]}}));
 await page.route('**/api/relay-sessions/open',r=>r.fulfill({json:{opened:false,reason:'合成：未检测到可打开应用'}}));
}

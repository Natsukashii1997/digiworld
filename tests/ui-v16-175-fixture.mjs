// 截图专用：全部为合成数据/媒体；只有临时fixture服务，禁止开发者data。
import {fixture} from './fixture.mjs';import {seed} from '../src/store.js';import {readFile} from 'node:fs/promises';import {stringify,parse} from '../src/serialization.js';
export const notes175=[
 ['note-yellow-90','2026-10-05T13:12:00Z','[首页第一眼应该回答“今天要做什么”。]{yellow}\n数字放大、可点；装饰退后。'],
 ['note-red-32','2026-10-05T10:40:00Z','[验收清单要非技术]{red}\n- [ ] 改写终验清单：点哪里、看到什么算过\n- [x] 复跑全部浏览器脚本\n- [ ] 截图换成合成数据'],
 ['note-blue-129','2026-10-05T07:02:00Z','[逆向工程打分项]{blue}\n1. 构图\n2. 色板\n3. 字体与字重\n4. 质感'],
 ['note-green-92','2026-10-04T15:30:00Z','[好的空状态保持页面形态]{green}，不用大框。\n协同没数据时，两台暴龙机变暗就够了。'],
 ['note-refined-378','2026-10-04T03:05:00Z','夜巡先想清楚：跑什么、怎么跑、价值在哪。预算不是停止条件。'],
 ['note-weekend-71','2026-10-03T14:10:00Z','周末\n- [ ] 给银饰拍白底图\n- [x] 更新日历提醒\n- [x] 整理 refs 文件夹'],
 ['note-gray-153','2026-10-03T01:00:00Z','[学习成长、银饰最后再做。]{gray}'],
 ['note-long-63','2026-10-02T12:16:00Z','为什么资产仓库好看：形态来自内容本质。逐条记录，所以一屏一屏地陈列；Skill 是数码蛋，用了会成长；Prompt 是对话框。层级手艺在粗细、大小、中英文和动效，几乎没有解释文字。其他页要先回答这页做什么、主角是谁、为什么这样排，再谈样式。v15 只当素材，不当起点；每页同等认真。']
].map(([id,at,text])=>({id,at,text,format:'md1',...(id==='note-refined-378'?{refined:{scrollId:'scroll-night175',entryId:'entry-night175',at:'2026-10-04T03:06:00Z'}}:{})}));
export async function fixture175({empty=false}={}){const app=await fixture(),initial=seed();initial.notes=empty?[]:notes175;initial.scrolls=[{id:'scroll-night175',name:'夜巡原则',pinned:false,createdAt:'2026-10-02T00:00:00Z',entries:[{id:'entry-night175',text:notes175[4].text,tags:[],uses:0,createdAt:'2026-10-04T03:06:00Z'}]}];
 const work='/Users/nat/Documents/Codex/2026-10-05/ai-users-nat-documents-chatgpt-work/work/dispatch175';
 async function media(name,kind){const data=new Uint8Array(await readFile(work+'/media/'+name));const {token}=await(await fetch(app.url+'/api/session',{headers:{'x-workbench-client':'1'}})).json();const r=await fetch(app.url+'/api/silver/images',{method:'POST',headers:{'content-type':'application/json','x-workbench-token':token},body:stringify({data,kind})});const result=parse(await r.text());if(!r.ok)throw Error(result.error);return result.file;}
 const photo=await media('photo.png','photo'),cut=await media('cut.png','silhouette');const AT='2026-10-02T00:00:00Z',names=['OLD MOON WORKS','IRON ROSE','ARGENT LAB','NORTH SMITH','LITTLE SKULL'],keys=['oldmoon','ironrose','argent','north','skull'],counts=[6,4,9,3,5];
 const wall=names.flatMap((author,g)=>Array.from({length:counts[g]},(_,i)=>({id:`wall-${keys[g]}-${String(i+1).padStart(2,'0')}`,image:photo,name:g===0&&i===5?'月相硬币吊坠':`${author} 灵感${String(i+1).padStart(2,'0')}`,author,source:g===0&&i===5?'小红书':'',...(g===0&&i===5?{sourceUrl:'https://example.invalid/silver/moon'}:{}),note:g===0&&i===5?'边缘做旧的手感，链子要再细一号。':'',createdAt:g===0&&i<5?new Date(Date.parse(AT)-86400000+i*1000).toISOString():AT})));
 const items=[['ring','獠牙心戒'],['ring','素圈'],['necklace','粗 O 字链'],['necklace','蛇扣长链'],['bangle','骷髅开口镯'],['pendant','缠蛇十字'],['ring','已回收戒指样例'],['pendant','已回收吊坠样例']].map(([categoryKey,name],i)=>({id:'item175-'+i,categoryKey,name,image:photo,silhouette:cut,silhouetteSource:'manual',boughtAt:'2026-10-01',price:680,note:'合成验收记录',createdAt:AT,...(i>=6?{deletedAt:AT}:{})}));
 initial.silver={wall:empty?[]:wall,categories:[],items:empty?[]:items,targets:{ring:3,necklace:4,bangle:3,pendant:3},wishes:empty?[]:[{id:'wish175-ring',wallId:'wall-oldmoon-01',categoryKey:'ring',createdAt:AT},{id:'wish175-bangle',wallId:'wall-ironrose-01',categoryKey:'bangle',createdAt:AT}]};
 await app.repository.write(initial,{initialize:true});return app;
}

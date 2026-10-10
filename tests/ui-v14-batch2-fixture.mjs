import { batch1State } from "./ui-v14-batch1-fixture.mjs";
export function batch2Data(long=false) {
 const state=batch1State(); const title=long ? "合成超长标题EnglishWithoutSpaces".repeat(5) : "如何把设计落到最后一公里";
 const books=["设计的最后一公里.pdf","构建 Agent 工作流.epub","从问题到判断.pdf"].map((name,i)=>({id:`b2-book-${i}`,name:long?title+name:name,path:long?title+name:name,root:"/synthetic/书架",size:1200000+i*100,modifiedAt:"2026-10-03T08:00:00.000Z"}));
 state.learning={folders:[{id:"b2-folder",path:"/synthetic/书架",addedAt:"2026-10-03T08:00:00.000Z"}],books:books.slice(0,2).map((b,i)=>({id:b.id,root:b.root,path:b.path,name:b.name,status:i?"want":"learning",updatedAt:"2026-10-03T08:00:00.000Z"})),links:[{id:"b2-link",title,url:"https://example.com/read",source:"合成来源",summary:long?title.repeat(3):"记录可复用的判断，保留来源。",status:"want",origin:"manual",createdAt:"2026-10-03T08:00:00.000Z"}]};
 state.notes=["yellow","blue","red","green","gray"].map((ink,i)=>({id:`b2-note-${i}`,text:`[${i+1}. ${title}]{${ink}}\n- [ ] ${long?title:"核对验收标准"}\n- 把复杂问题拆成可验证的下一步`,format:"md1",at:"2026-10-03T08:00:00.000Z"}));
 const items=Array.from({length:5},(_,i)=>({title:i===0?title:`${i+1}. ${long?title:"一个值得关注的 AI 进展"}`,url:`https://example.com/news/${i}`,source:long?title:"合成来源",publishedAt:"2026-10-03T08:00:00.000Z",summary:long?title.repeat(3):"保留新闻原文与摘要，先看事实，再做判断。"}));
 return {state,shelf:{folders:[{id:"b2-folder",path:"/synthetic/书架",status:"ok"}],books},aihot:{settings:{enabled:true,acknowledged:true,intervalHours:3},cache:{status:"ready",lastSuccessAt:"2026-10-03T08:00:00.000Z",lastAttemptAt:"2026-10-03T08:00:00.000Z",sections:{selected:{items},hot:{items:items.slice(0,3)},daily:{items:items.slice(0,2),date:"2026-10-03"}}}}};
}
export async function batch2Routes(page,data) {
 await page.route("**/api/aihot",r=>r.fulfill({json:data.aihot}));
 await page.route("**/api/learning/shelf",r=>r.fulfill({json:data.shelf}));
}

export async function seedBatch2(app,data) {
 const initial={...data.state,learning:{...data.state.learning,folders:[]}};
 await app.repository.write(initial,{initialize:true});
 await app.repository.updateLearning(()=>data.state.learning,{expectedRevision:(await app.repository.read()).revision});
}

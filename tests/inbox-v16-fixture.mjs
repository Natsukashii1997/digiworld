import { join } from "node:path";
import { knowledge193Fixture } from "./knowledge-v16-fixture.mjs";
import { current, makeAsset } from "../src/store.js";
export async function inbox198Fixture({empty=false,staticRoot,proposals=1,long=false}={}) {
  const app=await knowledge193Fixture({empty,mcp:true,...(staticRoot?{staticRoot}:{})});
  const repository=app.repository;
  if(!empty) {
    let s=await repository.read();
    const rule=makeAsset({type:"Rule",title:"项目接力规则",content:"合成交接规则"});rule.id="inbox-rule";
    s=await repository.write({...s,assets:[...s.assets,rule]});
    const feedback=s.assets.slice(0,2).map((a,i)=>({schema:1,id:`inbox-feedback-${i}`,assetId:a.id,versionId:current(a).id,at:`2026-10-0${i+3}T02:00:00.000Z`,kind:"feedback",rating:"improve",note:long?"长中文EnglishWithoutSpaces".repeat(12):"合成需改进"}));
    s=await repository.updateActivity(()=>feedback,{expectedRevision:s.revision});
    await repository.updateConnections(s=>({...s,agents:[{id:"codex",name:"Codex",kind:"开发 Agent",status:"detected",programs:[],configFound:true}],agentScannedAt:"2026-10-05T02:00:00.000Z"}));
    s=await repository.read();const share=await app.call("/knowledge/profile/sharing",{enabled:true,confirmed:true,expectedRevision:s.revision});if(share.status!==200)throw Error(JSON.stringify(share));
    for(let i=0;i<proposals;i++) {
      const response=await fetch(app.mcpUrl,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:i,method:"tools/call",params:{name:"propose_profile_change",arguments:{path:"个人上下文/关于我.md",original:i===0?"结论先行。":"合成测试角色。",proposed:i===0?"先给结论，再给依据。":"合成拒绝测试角色。",reason:long?"长中文EnglishWithoutSpaces".repeat(30):i===0?"合成验收：补充表达依据":"合成拒绝",proposer:i===0?"Claude Code":"Codex"}}})});const result=(await response.json()).result;if(result.isError)throw Error(JSON.stringify(result));
    }
  }
  return {...app,repository,async close(){await app.close();}};
}
export async function inbox198Routes(page,{empty=false,mcpStopped=false}={}) {
  await page.route('**/api/rule-templates/installs',r=>r.fulfill({json:{items:empty?[]:[{assetId:"inbox-rule",versionId:"old-rule",projectName:"合成项目"}]}}));
  if(mcpStopped)await page.route('**/api/knowledge/zones/summary',async r=>{const response=await r.fetch(),body=await response.json();await r.fulfill({response,json:{...body,mcp:{url:null,error:"合成：MCP 服务未启用"}}});});
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseRelayJsonl,createRelaySessions} from '../server/relay-sessions.mjs';
const encode=rows=>rows.map((r,ordinal)=>JSON.stringify({timestamp:'2026-10-16T08:37:28Z',ordinal,...r})).join('\n')+'\n';
const msg=(role,text,kinds)=>({type:'response_item',payload:{type:'message',role,content:text.map(text=>({type:role==='user'?'input_text':'output_text',text})),...(kinds?{internal_chat_message_metadata_passthrough:{content_item_kinds:kinds}}:{})}});
const rows=()=>[
 {type:'session_meta',payload:{history_mode:'paginated',cwd:'/own-task'}},
 msg('user',['启动规则不得转交','环境不得转交'],['agents_md.instructions','environments.environment_context']),
 {type:'world_state',payload:{snapshot:{private:'环境快照不得转交'}}},
 msg('user',['生成发布清单'],['user.text']),
 msg('assistant',['原始清单'],['unknown']),
 {type:'response_item',payload:{type:'reasoning',content:[{type:'text',text:'推理不得转交'}]}},
 msg('user',['最新决定：先真实验证，排除便签539'],['user.text']),
 msg('assistant',['按最新决定继续'],['unknown'])
];
test('新版原生Codex分页记录：读取内联任务与最新决定，排除启动上下文',()=>{
 const p=parseRelayJsonl(encode(rows()),'codex');assert.equal(p.rounds,2);assert.equal(p.title,'生成发布清单');
 assert.deepEqual(p.messages.map(x=>x.text),['生成发布清单','原始清单','最新决定：先真实验证，排除便签539','按最新决定继续']);
});
test('正文过滤按内容块；未知元信息和旧无元信息消息仍保留',()=>{
 const p=parseRelayJsonl(encode([msg('user',['规则','真实用户','新格式正文'],['agents_md.instructions','user.text','future.kind']),msg('user',['旧正文'])]),'codex');
 assert.deepEqual(p.messages.map(x=>x.text),['真实用户\n新格式正文','旧正文']);
});
test('引用前缀、回滚、未知格式和分页缺页仍拒绝',()=>{
 for(const bad of [
  [{type:'session_meta',payload:{history_mode:'paginated',history_base:{thread_id:'other',end_ordinal_exclusive:3}}}],
  [{type:'session_meta',payload:{history_mode:'future'}}],
  [{type:'event_msg',payload:{type:'thread_rolled_back'}}],
  rows().map((r,i)=>i===3?{...r,ordinal:99}:r),
  rows().map((r,i)=>({...r,ordinal:i+1})),
 ])assert.throws(()=>parseRelayJsonl(encode(bad),'codex'),/暂不支持|记录.*完整|顺序/);
});
test('搜索与prepare读取链同样保留最新决定且不匹配启动规则',async()=>{
 const home=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'wb539-relay-')));try{
  const dir=join(home,'.codex/sessions');await fs.mkdir(dir,{recursive:true});await fs.writeFile(join(dir,'rollout-native.jsonl'),encode(rows()));
  const s=createRelaySessions({home,clock:()=>new Date('2026-10-16T08:38:00Z')});const pageId='native539-page-001';
  const found=await s.list({pageId,query:'排除便签539'});assert.equal(found.sessions.length,1,JSON.stringify(found));assert.equal(found.skipped,0);
  const p=await s.prepare({pageId,id:found.sessions[0].id,format:'work',depth:'extended'});
  assert.match(p.prompt,/排除便签539/);assert.doesNotMatch(p.prompt,/不得转交/);
  assert.equal((await s.list({pageId,query:'启动规则'})).sessions.length,0);
 }finally{await fs.rm(home,{recursive:true,force:true});}
});

test('分页缺失/重复/负数/非整数ordinal拒绝，legacy无ordinal保留',()=>{
 for(const ordinal of [null,-1,1.5,0]) {const rs=rows();rs[3]={...rs[3],ordinal};assert.throws(()=>parseRelayJsonl(encode(rs),'codex'),/顺序不完整/);}
 const raw=rows().map(r=>JSON.stringify(r)).join('\n');assert.throws(()=>parseRelayJsonl(raw,'codex'),/顺序不完整/);
 const legacy=[{type:'session_meta',payload:{history_mode:'legacy'}},msg('user',['旧版任务'])];assert.equal(parseRelayJsonl(legacy.map(r=>JSON.stringify(r)).join('\n'),'codex').messages[0].text,'旧版任务');
});
test('元信息缺失、非数组、非字符串或长度失配不丢正文',()=>{
 for(const kinds of [undefined,'user.text',[1],['agents_md.instructions','user.text']]) {
  const r=msg('user',['应保留正文'],kinds);assert.equal(parseRelayJsonl(encode([r]),'codex').messages[0].text,'应保留正文');
 }
});

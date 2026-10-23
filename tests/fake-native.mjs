export function fakeNative(){
 let thread=0;const calls=[],histories=new Map();
 return {calls,connect:async({cwd,onMessage=()=>{},onDisconnect=()=>{}})=>{
  let current,connected=true,activeTurn,pending;
  const emit=(method,params)=>onMessage({method,params});
  function complete(){
   const answer={id:'answer-'+activeTurn.id,type:'agentMessage',text:'# 合成任务包\n\n普通 Markdown 回复；原生工具 open_binary 的结果。\n\n待验证：真实软件行为。'+'长内容验证。'.repeat(24)};
   activeTurn.items.push(answer);activeTurn.status='completed';
   emit('item/completed',{threadId:current,turnId:activeTurn.id,item:answer});
   emit('turn/completed',{threadId:current,turn:activeTurn});
  }
  return {
   identity:{userAgent:'Codex Desktop / synthetic 572'},get connected(){return connected;},
   async request(method,params={}){
    calls.push({method,params});
    if(method==='config/read')return {config:{model:'test-model',model_reasoning_effort:'high',approval_policy:{granular:{rules:true,sandbox_approval:true,mcp_elicitations:true}},sandbox_mode:'workspace-write'}};
    if(method==='model/list')return {data:[{model:'test-model',displayName:'测试模型',supportedReasoningEfforts:[{reasoningEffort:'high'}],serviceTiers:[{id:'default',name:'标准',description:'synthetic'}]}]};
    if(method==='skills/list')return {data:[{skills:[{name:'reverse-engineer-anything',path:'/synthetic/REA/SKILL.md',enabled:true}]}]};
    if(method==='mcpServerStatus/list')return {data:[{name:'rea',runtimeStatus:'connected',tools:{open_binary:{inputSchema:{}},search_procedures:{inputSchema:{}},close_binary:{inputSchema:{}}}}]};
    if(method==='thread/start'||method==='thread/resume'){
     current=params.threadId||'synthetic-thread-'+(++thread);
     if(!histories.has(current))histories.set(current,[]);
     return {thread:{id:current,turns:histories.get(current)},model:'test-model',reasoningEffort:'high',serviceTier:'default',approvalPolicy:'on-request',approvalsReviewer:'user',sandbox:{type:'workspaceWrite'},instructionSources:['/synthetic/AGENTS.md'],cwd};
    }
    if(method==='thread/read')return {thread:{id:current,turns:histories.get(current)}};
    if(method==='thread/turns/list')return {data:histories.get(params.threadId)||[]};
    if(method==='turn/start'){
     const turns=histories.get(current);activeTurn={id:current+'-turn-'+(turns.length+1),status:'inProgress',items:[]};turns.push(activeTurn);
     const user={id:'user-'+activeTurn.id,clientId:params.clientUserMessageId,type:'userMessage',content:params.input};
     activeTurn.items.push(user);
     setTimeout(()=>{
      emit('turn/started',{threadId:current,turn:activeTurn});emit('item/completed',{threadId:current,turnId:activeTurn.id,item:user});
      if(turns.length===1){
       pending={id:17,method:'mcpServer/elicitation/request',params:{threadId:current,turnId:activeTurn.id,serverName:'rea',mode:'form',message:'允许 REA 打开合成目标？',requestedSchema:{type:'object',properties:{}},_meta:{tool_title:'open_binary',persist:['session','always'],tool_params_display:[{name:'path',display_name:'目标路径',value:cwd+'/fixture-bin'}]}}};
       onMessage(pending);
      }else complete();
     },30);
     return {turn:{id:activeTurn.id,status:'inProgress',items:[]}};
    }
    if(method==='turn/interrupt'){activeTurn.status='interrupted';setTimeout(()=>emit('turn/completed',{threadId:current,turn:activeTurn}),10);return {};}
    if(method==='turn/steer')return {turnId:activeTurn.id};
    throw Error('unsupported fake method '+method);
   },
   respond(id,result){calls.push({id,result});setTimeout(()=>{emit('serverRequest/resolved',{threadId:current,requestId:id});complete();},30);},
   reject(id,error){calls.push({id,error});},
   async close(){connected=false;},
  };
 }};
}

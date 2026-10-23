const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export const nativeRunning=session=>session?.status==='running'||!!session?.children?.some(child=>child.status==='running');
export const persistenceOptions=request=>{
 const value=request.params?._meta?.persist;
 return [...new Set((Array.isArray(value)?value:[value]).filter(v=>v==='session'||v==='always'))];
};
export function approvalOptions(request){
 const p=request.params||{};
 if(request.method==='execCommandApproval'||request.method==='applyPatchApproval')return ['approved','approved_for_session','abort'];
 if(p.availableDecisions)return p.availableDecisions;
 const choices=['accept','acceptForSession','decline','cancel'];
 if(p.proposedExecpolicyAmendment)choices.push({acceptWithExecpolicyAmendment:{execpolicy_amendment:p.proposedExecpolicyAmendment}});
 for(const amendment of p.proposedNetworkPolicyAmendments||[])choices.push({applyNetworkPolicyAmendment:{network_policy_amendment:amendment}});
 return choices;
}
export function approvalLabel(value){
 if(typeof value==='string')return {accept:'允许一次',acceptForSession:'本会话允许',decline:'拒绝',cancel:'取消本轮',approved:'允许一次',approved_for_session:'本会话允许',abort:'取消本轮'}[value]||value;
 if(value.acceptWithExecpolicyAmendment)return '保存命令允许规则：'+value.acceptWithExecpolicyAmendment.execpolicy_amendment.join(' ');
 const rule=value.applyNetworkPolicyAmendment?.network_policy_amendment;
 return rule?`保存网络规则：${rule.action==='allow'?'允许':'拒绝'} ${rule.host}`:'其他原生决定';
}
function subset(value,requested){
 if(same(value,requested))return true;
 if(Array.isArray(value))return Array.isArray(requested)&&value.every(v=>requested.some(r=>same(v,r)));
 if(value&&typeof value==='object')return requested&&typeof requested==='object'&&Object.keys(value).every(k=>Object.hasOwn(requested,k)&&subset(value[k],requested[k]));
 return false;
}
// MCP's standard forms are a deliberately small JSON Schema dialect.
export function validateForm(schema,value){
 if(schema===true)return;
 if(!schema||typeof schema!=='object')fail('此表单结构不受支持');
 const alternatives=schema.oneOf||schema.anyOf;
 if(alternatives){if(!alternatives.some(s=>{try{validateForm(s,value);return true;}catch{return false;}}))fail('选项不符合表单要求');return;}
 if(schema.enum&&!schema.enum.some(v=>same(v,value)))fail('请选择表单提供的选项');
 if(schema.const!==undefined&&!same(schema.const,value))fail('表单选项无效');
 if(schema.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('表单内容无效');
  for(const k of schema.required||[])if(value[k]===undefined||value[k]==='')fail('请填写必填项：'+(schema.properties?.[k]?.title||k));
  for(const [k,v] of Object.entries(value)){if(!schema.properties?.[k])fail('表单包含未知字段');validateForm(schema.properties[k],v);}
 }else if(schema.type==='array'){
  if(!Array.isArray(value))fail('请选择有效选项');
  if(value.length<(schema.minItems||0)||(schema.maxItems!==undefined&&value.length>schema.maxItems))fail('选择数量不符合要求');
  if(schema.uniqueItems&&new Set(value.map(v=>JSON.stringify(v))).size!==value.length)fail('选项不可重复');
  value.forEach(v=>validateForm(schema.items,v));
 }else if(schema.type==='boolean'){if(typeof value!=='boolean')fail('请确认是或否');}
 else if(['number','integer'].includes(schema.type)){
  if(typeof value!=='number'||!Number.isFinite(value)||(schema.type==='integer'&&!Number.isInteger(value)))fail('请输入有效数字');
  if(schema.minimum!==undefined&&value<schema.minimum||schema.maximum!==undefined&&value>schema.maximum)fail('数字超出允许范围');
 }else if(schema.type==='string'){
  if(typeof value!=='string'||value.length<(schema.minLength||0)||schema.maxLength!==undefined&&value.length>schema.maxLength)fail('文字长度不符合要求');
  if(schema.format==='email'&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))fail('请输入有效邮箱');
  if(['uri','url'].includes(schema.format)){try{new URL(value);}catch{fail('请输入有效链接');}}
  if(schema.format==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('请输入 YYYY-MM-DD 日期');
  if(schema.format==='date-time'&&!Number.isFinite(Date.parse(value)))fail('请输入有效日期时间');
 }
 const supported=['type','properties','required','additionalProperties','title','description','enum','enumNames','const','default','oneOf','anyOf','items','minItems','maxItems','uniqueItems','minimum','maximum','minLength','maxLength','format','$schema'];
 if(Object.keys(schema).some(k=>!supported.includes(k)))fail('此表单使用尚不支持的校验规则，请在原生客户端处理');
 if(schema.format&&!['email','uri','url','date','date-time'].includes(schema.format))fail('此表单格式需要原生客户端处理');
}
export function validateNativeReply(request,result){
 const p=request.params||{},method=request.method;
 if(!result||typeof result!=='object'||Array.isArray(result))fail('答复无效');
 if(method.endsWith('/requestApproval')&&method!=='item/permissions/requestApproval'||['applyPatchApproval','execCommandApproval'].includes(method)){
  if(Object.keys(result).some(k=>k!=='decision')||!approvalOptions(request).some(v=>same(v,result.decision)))fail('该决定不在原生审批选项中');
 }else if(method==='item/permissions/requestApproval'){
  if(Object.keys(result).some(k=>!['permissions','scope'].includes(k))||!['turn','session'].includes(result.scope)||!subset(result.permissions,p.permissions))fail('不能授予超出本次请求的权限');
 }else if(method==='item/tool/requestUserInput'){
  if(Object.keys(result).some(k=>k!=='answers')||!result.answers||Object.keys(result.answers).some(k=>!p.questions.some(q=>q.id===k)))fail('提问字段无效');
  if(p.isBlocking===false&&Object.keys(result.answers).length===0)return result;
  for(const q of p.questions){
   const answer=result.answers[q.id];if(!answer||Object.keys(answer).some(k=>k!=='answers')||!Array.isArray(answer.answers)||!answer.answers.length||answer.answers.some(v=>typeof v!=='string'||!v.trim()||v.length>200000))fail('请回答：'+q.question);
  }
 }else if(method==='mcpServer/elicitation/request'){
  if(Object.keys(result).some(k=>!['action','content','_meta'].includes(k))||!['accept','decline','cancel'].includes(result.action))fail('表单操作无效');
  if(result._meta&&(result.action!=='accept'||Object.keys(result._meta).some(k=>k!=='persist')||!persistenceOptions(request).includes(result._meta.persist)))fail('此授权记忆范围不在原生选项中');
  if(result.action==='accept'&&p.mode!=='url')validateForm(p.requestedSchema,result.content);
  if(result.action!=='accept'&&result.content!==null)fail('拒绝时不提交表单内容');
 }else fail('无法处理该原生请求');
 return result;
}

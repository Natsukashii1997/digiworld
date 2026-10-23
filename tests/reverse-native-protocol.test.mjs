import test from 'node:test';
import assert from 'node:assert/strict';
import {validateForm,validateNativeReply,approvalOptions} from '../src/reverse-native-protocol.js';

test('native MCP titled multi-select validates every choice and preserves false and zero',()=>{
 const schema={type:'object',required:['choices','enabled','count'],properties:{
  choices:{type:'array',items:{anyOf:[{const:'a',title:'甲'},{const:'b',title:'乙'}]},minItems:1,uniqueItems:true},
  enabled:{type:'boolean'},count:{type:'integer',minimum:0},
 }};
 assert.doesNotThrow(()=>validateForm(schema,{choices:['a'],enabled:false,count:0}));
 assert.throws(()=>validateForm(schema,{choices:['unknown'],enabled:false,count:0}),/选项/);
 assert.throws(()=>validateForm(schema,{choices:['a'],count:0}),/必填/);
 assert.throws(()=>validateForm({type:'string',pattern:'^x$'},'other'),/不支持/);
 assert.throws(()=>validateForm({type:'string',format:'email'},'not-email'),/邮箱/);
});
test('approval accepts only offered exact decisions and does not invent persistent permission amendments',()=>{
 const request={method:'item/commandExecution/requestApproval',params:{availableDecisions:['accept','decline']}};
 assert.deepEqual(approvalOptions(request),['accept','decline']);
 assert.doesNotThrow(()=>validateNativeReply(request,{decision:'accept'}));
 assert.throws(()=>validateNativeReply(request,{decision:'acceptForSession'}),/选项/);
 const permissions={method:'item/permissions/requestApproval',params:{permissions:{network:{enabled:true}}}};
 assert.doesNotThrow(()=>validateNativeReply(permissions,{scope:'turn',permissions:{}}));
 assert.throws(()=>validateNativeReply(permissions,{scope:'session',permissions:{filesystem:{write:['/']}}}),/超出/);
});
test('MCP persistent approval and optional question skipping match native offered scopes',()=>{
 const request={method:'mcpServer/elicitation/request',params:{mode:'form',requestedSchema:{type:'object',properties:{}},_meta:{persist:['session']}}};
 assert.doesNotThrow(()=>validateNativeReply(request,{action:'accept',content:{},_meta:{persist:'session'}}));
 assert.throws(()=>validateNativeReply(request,{action:'accept',content:{},_meta:{persist:'always'}}),/范围/);
 assert.throws(()=>validateNativeReply(request,{action:'decline',content:null,_meta:{persist:'session'}}),/范围/);
 const question={method:'item/tool/requestUserInput',params:{isBlocking:false,questions:[{id:'q1',question:'可选问题'}]}};
 assert.doesNotThrow(()=>validateNativeReply(question,{answers:{}}));
 assert.throws(()=>validateNativeReply({...question,params:{...question.params,isBlocking:true}},{answers:{}}),/请回答/);
});

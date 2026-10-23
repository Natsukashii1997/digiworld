import {validateReverseTarget} from './reverse-recipe.js';

// Reuse the workspace revision/CAS write, then independently read back before running.
export async function saveSpecimenTarget({read,write,recordId,expectedRevision,expectedTarget,patch}){
 const state=await read(),record=state.reverseRecords?.find(r=>r.id===recordId&&!r.deletedAt);
 if(!record||state.revision!==expectedRevision||JSON.stringify(record.material?.target)!==JSON.stringify(expectedTarget))throw Error('参照物已变化，请重新核对后再操作');
 if(record.reaRuns?.at(-1)?.status==='running')throw Error('运行中不可修改参照目标');
 const target=validateReverseTarget({...record.material.target,...patch},record.type);
 const stored=await write({...state,reverseRecords:state.reverseRecords.map(r=>r.id===recordId?{...r,material:{...r.material,target},updatedAt:new Date().toISOString()}:r)});
 const checked=await read(),saved=checked.reverseRecords?.find(r=>r.id===recordId&&!r.deletedAt);
 if(!saved||checked.revision!==stored.revision||JSON.stringify(saved.material?.target)!==JSON.stringify(target))throw Error('保存后的回读未确认，请刷新核对；未启动逆推');
 return checked;
}

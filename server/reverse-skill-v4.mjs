import { randomUUID, createHash } from 'node:crypto';
import {currentPackVersion} from '../src/reverse-ai.js';
import { buildReplicaPack, generateReplicaSkill, currentSkill } from '../src/reverse-v4.js';
import { makeAsset } from '../src/store.js';
import { materializeSkillVersion } from '../src/skill-version.js';
import { failure } from './repository.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
export function createReverseSkillV4({repository,readMedia,clock=Date.now}) {
  const previews=new Map();
  const recordOf = (state, id) => { const r=state?.reverseRecords?.find(r=>r.id===id&&!r.deletedAt);if(!r)throw failure('参照物不存在',404);return r; };
  async function optionsFor(record) {
    const mediaLocations = [];
    for (const m of record.referenceMedia || []) { if (!readMedia) throw failure('原件图片尚未回读',409); const value=await readMedia(m); mediaLocations.push({path:m.path,localPath:value.localPath}); }
    return {mediaLocations};
  }
  async function pack({recordId}) { const record=recordOf(await repository.read(),recordId); return {recordId,pack:buildReplicaPack(record,await optionsFor(record))}; }
  async function query({recordId,packVersionId}) {
    const state=await repository.read(),record=recordOf(state,recordId),pointer=packVersionId?(record.packSkills||[]).find(p=>p.packVersionId===packVersionId)||(record.packVersions?.find(v=>v.id===packVersionId)?.packHash===record.savedSkill?.packHash?record.savedSkill:null):currentSkill(record);
    if(!pointer)return {saved:null};
    const asset=state.assets.find(a=>a.id===pointer.assetId),version=asset?.versions.find(v=>v.id===pointer.versionId);
    if(!version)throw failure('固定Skill版本缺失，请保留记录并检查资产库',409);
    if(pointer.packHash && hash(version.files.find(f=>f.path==='task-pack.md')?.data || '')!==pointer.packHash)throw failure('固定Skill内容与回执不一致',409);
    return {saved:pointer,title:version.title,legacy:!pointer.packHash,unchanged:!pointer.packHash?true:pointer.packHash===hash(buildReplicaPack(record,await optionsFor(record))),state};
  }
  async function preview({recordId,expectedRevision}) {
    const state=await repository.read(),record=recordOf(state,recordId);
    if(currentSkill(record))return query({recordId});
    if(state.revision!==expectedRevision)throw failure('记录已变化，请刷新再预览',409);
    const options=await optionsFor(record),value=generateReplicaSkill(record,options),packHash=hash(buildReplicaPack(record,options));
    await materializeSkillVersion(value,{readMedia});
    const token=randomUUID(),entry={recordId,packVersionId:currentPackVersion(record)?.id,revision:state.revision,packHash,fileHash:hash(JSON.stringify(value.files)),options,value,expires:clock()+300000};
    for(const [key,v] of previews)if(v.expires<clock())previews.delete(key);
    if(previews.size>=100)throw failure('预览过多，请稍后重试',429);
    previews.set(token,entry);
    return {token,recordId,packVersionId:entry.packVersionId,revision:state.revision,packHash,title:value.title,content:value.content,files:value.files.map(f=>({path:f.path,bytes:Buffer.byteLength(f.data)})),mediaCount:value.mediaManifest.length};
  }
  async function confirm({recordId,token,packVersionId}) {
    const p=previews.get(token);
    const current=recordOf(await repository.read(),recordId);if(packVersionId!==undefined&&currentPackVersion(current)?.id!==packVersionId)throw failure('选中版本已变化，请重新预览',409);
    if(p&&p.packVersionId!==currentPackVersion(current)?.id)throw failure('选中版本已变化，请重新预览',409);
    const existing=await query({recordId,packVersionId:p?.packVersionId||packVersionId});if(existing.saved)return existing;
    if(!p||p.recordId!==recordId||p.expires<clock())throw failure('预览已失效，请重新预览',409);
    await materializeSkillVersion(p.value,{readMedia});
    await repository.updateReverseSkill(state=>{
      const r=recordOf(state,recordId);if(currentPackVersion(r)?.id!==p.packVersionId)throw failure('选中版本已变化，请重新预览',409);if(currentSkill(r))return state;
      if(p.expires<clock())throw failure('预览已失效，请重新预览',409);
      if(state.revision!==p.revision||hash(buildReplicaPack(r,p.options))!==p.packHash||hash(JSON.stringify(generateReplicaSkill(r,p.options).files))!==p.fileHash)throw failure('参照物已变化，请重新预览',409);
      const asset=makeAsset({...p.value,type:'Skill'}),version=asset.versions[0];
      return {...state,assets:[...state.assets,asset],reverseRecords:state.reverseRecords.map(v=>v.id===recordId?{...v,...(p.packVersionId?{packSkills:[...(v.packSkills||[]),{packVersionId:p.packVersionId,assetId:asset.id,versionId:version.id,packHash:p.packHash,at:new Date(clock()).toISOString()}]}:{savedSkill:{assetId:asset.id,versionId:version.id,packHash:p.packHash,at:new Date(clock()).toISOString()}})}:v)};
    });
    return query({recordId,packVersionId:p.packVersionId});
  }
  return {preview,confirm,query,pack};
}

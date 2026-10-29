import { randomUUID, createHash } from 'node:crypto';
import {currentPackVersion} from '../src/reverse-ai.js';
import { buildReplicaPack, generateReplicaSkill, currentSkill } from '../src/reverse-v4.js';
import { makeAsset, revise } from '../src/store.js';
import { generateHatchSkill, hatchSlotsText } from '../src/reverse-hatch.js';
import { materializeSkillVersion, planSkillVersion } from '../src/skill-version.js';
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
  // 孵化（#29）：八格 → 固定版本 Skill。预览发 token，绑 revision 和八格摘要（slotsHash）；名字可改，确认时按名字重新生成。
  // 同一八格状态已孵化过（资产还在、没归档）就复用那一版；八格变了再孵化，给同一份资产加新版本；资产已归档则另建。
  const slotsHashOf = record => hash(hatchSlotsText(record));
  const liveHatch = (state,record,slotsHash) => (record.hatchSkills||[]).some(p=>p.slotsHash===slotsHash&&state.assets.some(a=>a.id===p.assetId&&!a.archived));
  const hatchPreviews=new Map();
  async function hatchQuery({recordId,slotsHash}) {
    const state=await repository.read(),record=recordOf(state,recordId),now=slotsHashOf(record),want=slotsHash||now;
    const pointer=(record.hatchSkills||[]).findLast(p=>p.slotsHash===want&&state.assets.some(a=>a.id===p.assetId&&!a.archived))||(record.hatchSkills||[]).findLast(p=>p.slotsHash===want);
    if(!pointer)return {saved:null,slotsHash:now,latest:(record.hatchSkills||[]).at(-1)||null};
    const asset=state.assets.find(a=>a.id===pointer.assetId),version=asset?.versions.find(v=>v.id===pointer.versionId);
    if(!version)throw failure('孵化出的 Skill 版本缺失，请保留记录并检查资产库',409);
    let recorded;try{recorded=JSON.parse(version.files.find(f=>f.path==='source.json')?.data||'').slotsHash;}catch{recorded=null;}
    if(recorded!==pointer.slotsHash)throw failure('孵化出的 Skill 内容与回执不一致',409);
    return {saved:pointer,title:version.title,versionNo:asset.versions.indexOf(version)+1,archived:asset.archived,current:pointer.slotsHash===now,slotsHash:now,state};
  }
  async function hatchPreview({recordId,expectedRevision,title}) {
    const state=await repository.read(),record=recordOf(state,recordId),slotsHash=slotsHashOf(record);
    if(liveHatch(state,record,slotsHash))return hatchQuery({recordId});
    if(state.revision!==expectedRevision)throw failure('记录已变化，请刷新再预览',409);
    const value=generateHatchSkill(record,{title,slotsHash});
    planSkillVersion(value);
    const token=randomUUID();
    for(const [key,v] of hatchPreviews)if(v.expires<clock())hatchPreviews.delete(key);
    if(hatchPreviews.size>=100)throw failure('预览过多，请稍后重试',429);
    hatchPreviews.set(token,{recordId,revision:state.revision,slotsHash,expires:clock()+300000});
    return {token,recordId,revision:state.revision,slotsHash,title:value.title,content:value.content,score:value.score,files:value.files.map(f=>({path:f.path,bytes:Buffer.byteLength(f.data)}))};
  }
  async function hatchConfirm({recordId,token,title}) {
    const p=hatchPreviews.get(token);
    if(!p||p.recordId!==recordId)throw failure('预览已失效，请重新预览',409);
    const existing=await hatchQuery({recordId,slotsHash:p.slotsHash});if(existing.saved&&!existing.archived)return existing;
    if(p.expires<clock())throw failure('预览已失效，请重新预览',409);
    await repository.updateReverseSkill(state=>{
      const r=recordOf(state,recordId);
      if(liveHatch(state,r,p.slotsHash))return state;
      if(state.revision!==p.revision||slotsHashOf(r)!==p.slotsHash)throw failure('八格或记录已变化，请重新预览',409);
      const {score:_score,...value}=generateHatchSkill(r,{title,slotsHash:p.slotsHash});planSkillVersion(value);
      const prior=state.assets.find(a=>a.id===(r.hatchSkills||[]).at(-1)?.assetId&&!a.archived);
      const asset=prior?revise(prior,value):makeAsset({...value,type:'Skill',hatchedFrom:{kind:'reverse',id:recordId}}),version=asset.versions.at(-1);
      const receipt={assetId:asset.id,versionId:version.id,at:new Date(clock()).toISOString(),slotsHash:p.slotsHash};
      return {...state,assets:prior?state.assets.map(a=>a.id===asset.id?asset:a):[...state.assets,asset],reverseRecords:state.reverseRecords.map(v=>v.id===recordId?{...v,hatchSkills:[...(v.hatchSkills||[]),receipt]}:v)};
    });
    // token 留到过期：结果不明时再点确认，直接回读已写入的那一版
    return hatchQuery({recordId,slotsHash:p.slotsHash});
  }
  return {preview,confirm,query,pack,hatchPreview,hatchConfirm,hatchQuery};
}

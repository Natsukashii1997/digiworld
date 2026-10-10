import {randomUUID} from 'node:crypto';import {failure} from './repository.mjs';import {readLocalSkill} from './skill-files.mjs';
const keys=(input,allowed)=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k))||allowed.some(k=>!Object.hasOwn(input,k)))throw failure('Skill 更新请求格式无效');};
const sourceValue=source=>source.kind==='local'?source.fingerprint:source.versionId;
const recordValue=record=>record.sourceKind==='local'?record.sourceFingerprint:record.sourceVersionId;
export function createSkillSourceUpdates(repository,{clock=Date.now,localReader=path=>readLocalSkill([path],path)}={}){
 const previews=new Map(),TTL=300000;
 const prune=()=>{for(const [token,preview]of previews)if(preview.expires<=clock()&&!preview.busy)previews.delete(token);};
 function findAsset(state,assetId){const asset=state?.assets?.find(a=>a.id===assetId&&a.type==='Skill');if(!asset||asset.archived)throw failure('Skill 不存在或已归档，请刷新核对',404);return asset;}
 async function readSource(asset,state){
  const origin=asset.origin;
  if(origin?.kind==='local'){
   const source=await localReader(origin.location);
   if(source.location!==origin.location||typeof source.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(source.fingerprint))throw failure('来源位置或指纹无法核验',409);
   return{kind:'local',location:source.location,fingerprint:source.fingerprint,title:source.name||asset.versions.at(-1).title};
  }
  if(origin?.kind==='derived'){
   const source=state.assets.find(a=>a.id===origin.assetId&&a.type==='Skill'),version=source?.versions.at(-1);
   if(!version||source.archived)throw failure('来源资产已缺失或归档，不能核验当前版本',409);
   return{kind:'derived',assetId:source.id,versionId:version.id,number:source.versions.length,title:version.title};
  }
  throw failure('没有结构化来源，更新情况待接入数据',409);
 }
 return{
  async check(input){
   keys(input,['assetId']);const state=await repository.read(),asset=findAsset(state,input.assetId);
   let source;try{source=await readSource(asset,state);}catch(e){return{assetId:asset.id,status:'unavailable',reason:e.status?e.message:'无法安全读取来源，更新情况待接入数据'};}
   const last=(state.skillSourceAdoptions||[]).filter(r=>r.assetId===asset.id).at(-1),baseline=last?recordValue(last):asset.origin.kind==='local'?asset.origin.fingerprint:asset.origin.versionId;
   const changed=sourceValue(source)!==baseline;prune();if(previews.size>=20)throw failure('更新预览过多，请稍后重新核验',409);
   const token=randomUUID(),expires=clock()+TTL;previews.set(token,{assetId:asset.id,assetVersionId:asset.versions.at(-1).id,source,revision:state.revision,expires,busy:false});
   return{assetId:asset.id,status:changed?'updated':'current',source,baseline,lastAdoption:last||null,token,revision:state.revision,expiresAt:new Date(expires).toISOString()};
  },
  async adopt(input){
   keys(input,['token','revision']);prune();const preview=previews.get(input.token);
   if(!preview||preview.expires<=clock())throw failure('更新预览已过期，请重新核验',409);
   if(preview.completed){const state=await repository.read();const record=state.skillSourceAdoptions?.find(r=>r.id===preview.completed);if(!record)throw failure('采用回执缺失，请刷新核对',409);return{state,record,alreadyAdopted:true};}
   if(preview.busy)throw failure('正在记录采用确认，请稍候',409);
   if(!Number.isSafeInteger(input.revision)||input.revision!==preview.revision)throw failure('预览版本不一致，请重新核验',409);
   preview.busy=true;let record,alreadyAdopted=false;
   try{
    const state=await repository.updateSkillSourceAdoptions(async(records,stored)=>{
     if(previews.get(input.token)!==preview||preview.expires<=clock())throw failure('预览已失效，请重新核验',409);
     const asset=findAsset(stored,preview.assetId);if(asset.versions.at(-1).id!==preview.assetVersionId)throw failure('个人版本已变化，请重新核验',409);
     const source=await readSource(asset,stored);if(source.kind!==preview.source.kind||sourceValue(source)!==sourceValue(preview.source))throw failure('来源已变化，请重新核验后确认',409);
     if(previews.get(input.token)!==preview||preview.expires<=clock())throw failure('预览已失效，请重新核验',409);
     const last=records.filter(r=>r.assetId===asset.id).at(-1);
     if(last&&last.assetVersionId===preview.assetVersionId&&recordValue(last)===sourceValue(source)){record=last;alreadyAdopted=true;return records;}
     if(records.length>=5000)throw failure('采用历史已达上限',409);
     record={id:randomUUID(),assetId:asset.id,assetVersionId:preview.assetVersionId,sourceKind:source.kind,
      ...(source.kind==='local'?{sourceFingerprint:source.fingerprint}:{sourceAssetId:source.assetId,sourceVersionId:source.versionId}),at:new Date(clock()).toISOString()};
     return [...records,record];
    },{expectedRevision:preview.revision});
    preview.completed=record.id;return{state,record,alreadyAdopted};
   }finally{preview.busy=false;}
  }
 };
}

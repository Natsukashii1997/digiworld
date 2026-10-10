// 采用确认只追加；不会改 immutable origin、任何资产版本、目标 Agent。
const invalid = message => {throw Object.assign(new Error('数据校验失败：'+message),{status:400});};
const id = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
export function validateSkillSourceAdoptions(records,assets) {
 if(!Array.isArray(records)||records.length>5000)invalid('Skill 采用记录数');const seen=new Set();
 for(const record of records){
  if(!record||typeof record !== 'object'||Array.isArray(record))invalid('Skill 采用记录');
  const required=record.sourceKind==='local'?['id','assetId','assetVersionId','sourceKind','sourceFingerprint','at']:['id','assetId','assetVersionId','sourceKind','sourceAssetId','sourceVersionId','at'];
  if(Object.keys(record).some(key=>!required.includes(key))||required.some(key=>!Object.hasOwn(record,key)))invalid('Skill 采用记录字段');
  if(!id(record.id)||!id(record.assetId)||!id(record.assetVersionId)||seen.has(record.id))invalid('Skill 采用记录 ID');seen.add(record.id);
  if(typeof record.at!=='string'||!Number.isFinite(Date.parse(record.at)))invalid('Skill 采用时间');
  const asset=assets.find(a=>a.id===record.assetId);
  if(!asset||asset.type!=='Skill'||!asset.versions.some(v=>v.id===record.assetVersionId)||asset.origin?.kind!==record.sourceKind)invalid('Skill 采用目标');
  if(record.sourceKind==='local'){if(typeof record.sourceFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(record.sourceFingerprint))invalid('Skill 来源指纹');}
  else if(record.sourceKind==='derived'){if(!id(record.sourceAssetId)||!id(record.sourceVersionId)||record.sourceAssetId!==asset.origin.assetId||!assets.find(a=>a.id===record.sourceAssetId&&a.type==='Skill')?.versions.some(v=>v.id===record.sourceVersionId))invalid('Skill 采用来源版本');}
  else invalid('Skill 采用来源类型');
 }
}
export function validateSkillSourceAdoptionHistory(previous,next,allow=false) {
 const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
 const equivalent=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
 if(!allow&&!equivalent(previous,next))invalid('Skill 采用确认只能通过专用操作追加');
 if(next.length<previous.length||previous.some((record,index)=>!equivalent(record,next[index])))invalid('Skill 采用历史不可改写、删除或重排');
}

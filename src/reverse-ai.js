import {filterRelayText} from './relay-prompt.js';
export const EXECUTORS = ['codex','claude','rea'];
export const EXECUTOR_NAMES = {codex:'Codex',claude:'Claude Code',rea:'仅 REA 取证'};
export const REA_READ_TOOLS = ['analyze_javascript_application','inspect_analysis_view','trace_application_feature','list_browser_targets','analyze_web_bundle'];
const fail=message=>{throw Object.assign(new Error('AI结果无效：'+message),{kind:'result',status:400});};
function exact(o,keys){if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).length!==keys.length||Object.keys(o).some(k=>!keys.includes(k)))fail('字段不符合约定');}
function text(value,max,label){if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x08\x0b-\x1f\x7f]/.test(value))fail(label);}
function result(value,normalize){
 exact(value,['conclusions','unknowns','pack',...(Object.hasOwn(value||{},'clues')?['clues']:[])]);
 let clues;
 if(Object.hasOwn(value,'clues')){
  if(!Array.isArray(value.clues)||value.clues.length>8||value.clues.some(c=>typeof c!=='string'||!/^[A-Za-z0-9._:/-]{1,60}$/.test(c)||filterRelayText(c).count))fail('线索词需为最多8个、每个1–60字符的英文检索词');
  clues=[...new Set(value.clues)];
  if(!normalize&&clues.length!==value.clues.length)fail('线索词重复');
 }
 if(!Array.isArray(value.conclusions)||value.conclusions.length>32||!Array.isArray(value.unknowns)||value.unknowns.length>32)fail('结论或未知项数量超限');
 const conclusions=value.conclusions.map(c=>{
  exact(c,['text','mark','evidence']);text(c.text,1000,'结论文本');
  if(!['观察','推断'].includes(c.mark)||!Array.isArray(c.evidence)||!c.evidence.length||c.evidence.length>12||c.evidence.some(e=>typeof e!=='string'||!/^ev_[a-f0-9]{64}$/.test(e)))fail('标记或64位证据编号不符合约定');
  if(filterRelayText(c.text).count)fail('结论包含凭据');
  const claim=/(?:已验证|验证通过|已确认|实测通过|\bverified\b|\bconfirmed\b)/i.test(c.text);
  if(!normalize&&claim&&c.mark!=='推断')fail('AI验证声明不能标为观察');
  return {...c,mark:claim?'推断':c.mark};
 });
 const ids=new Set(),unknowns=value.unknowns.map(u=>{exact(u,['id','text']);if(typeof u.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(u.id)||ids.has(u.id))fail('未知项编号无效或重复');ids.add(u.id);text(u.text,1000,'未知项文本');if(filterRelayText(u.text).count)fail('未知项包含凭据');return u;});
 text(value.pack,100000,'任务包为空或过长');const pack=filterRelayText(value.pack);
 if(!normalize&&pack.text!==value.pack)fail('任务包仍含凭据');
 return {conclusions,unknowns,pack:pack.text,...(clues===undefined?{}:{clues})};
}
export function parseAiResult(raw){
 if(typeof raw!=='string'||raw.length>200000)fail('输出超过上限');
 const match=raw.trim().match(/^```json\s*\n([\s\S]*?)\n```$/);
 if(!match)fail('最终输出必须只有一个JSON代码块');
 let value;try{value=JSON.parse(match[1]);}catch{fail('JSON无法解析');}
 return result(value,true);
}
export const validateAiResult=value=>result(value,false);
export function packTargetMatches(version,target){
 if(JSON.stringify(version?.target)===JSON.stringify(target))return true;
 if(!target||!version?.target||!['codex','claude'].includes(version.executor)||!Array.isArray(version.result?.clues))return false;
 const {clues:original=[],...before}=version.target,{clues:current=[],...after}=target;
 return JSON.stringify(before)===JSON.stringify(after)&&original.every(c=>current.includes(c))&&current.every(c=>original.includes(c)||version.result.clues.includes(c));
}
export const matchingPackVersions=record=>(record?.packVersions||[]).filter(v=>packTargetMatches(v,record.material?.target));
export const currentPackVersion=record=>matchingPackVersions(record).find(v=>v.id===record.activePackVersionId)||null;

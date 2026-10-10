// 私有能力产物；只固定UUID文件名。导入/工厂无I/O，只有显式用户动作/已授权run调用。
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sha=v=>createHash('sha256').update(v).digest('hex');
const fail=m=>{throw Object.assign(new Error(m),{code:'ARTIFACT_UNKNOWN'});};
const ident=s=>`${s.dev}:${s.ino}:${s.birthtimeMs}:${s.uid}:${s.mode&0o777}`;
export function createCapabilityArtifacts(repositoryDirectory,{filesystem=fs,maxBytes=2*1024*1024}={}){
 const root=resolve(repositoryDirectory),base=join(root,'capability-artifacts'); let identity=null;
 async function directory(path,create=false){if(create)await filesystem.mkdir(path,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});const s=await filesystem.lstat(path);if(s.isSymbolicLink()||!s.isDirectory()||s.uid!==process.getuid?.()||(s.mode&0o022))fail('产物目录不安全');return s;}
 async function scope(){const s=await directory(root);if(await filesystem.realpath(root)!==root)fail('产物根目录含符号链接');const key=ident(s);if(identity&&identity!==key)fail('产物根目录身份变化');identity=key;await directory(base,true);}
 async function file(ref){if(typeof ref!=='string'||!new RegExp('^'+uuid.source.slice(1,-1)+'/output\\.md$').test(ref))fail('产物引用无效');await scope();const id=ref.split('/')[0];await directory(join(base,id));return join(base,id,'output.md');}
 async function syncDirectory(path){const h=await filesystem.open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{await h.sync();}finally{await h.close();}}
 const api={
  async put(id,text){if(!uuid.test(id)||typeof text!=='string'||Buffer.byteLength(text)>maxBytes)fail('产物内容或ID无效');await scope();const folder=join(base,id);await directory(folder,true);const path=join(folder,'output.md'),digest=sha(text);let h;
   try{h=await filesystem.open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);await h.writeFile(text,'utf8');await h.sync();}catch(e){if(e.code!=='EEXIST')throw e;const found=await api.inspect(id+'/output.md');if(found?.sha256!==digest)fail('产物已存在且内容不一致');return found;}finally{await h?.close();}
   await syncDirectory(folder);const found=await api.inspect(id+'/output.md');if(found?.sha256!==digest)fail('产物回读失败');return found;
  },
  async inspect(ref){let path;try{path=await file(ref);}catch(e){if(e.code==='ENOENT')return null;throw e;}let h;try{h=await filesystem.open(path,constants.O_RDONLY|constants.O_NOFOLLOW);const before=await h.stat();if(!before.isFile()||before.uid!==process.getuid?.()||(before.mode&0o077)||before.nlink!==1||before.size>maxBytes)fail('产物文件不安全');const text=await h.readFile('utf8'),after=await h.stat();if(ident(before)!==ident(after)||before.size!==after.size||before.mtimeMs!==after.mtimeMs)fail('产物读取中变化');return{ref,sha256:sha(text),bytes:Buffer.byteLength(text),fingerprint:ident(after)+':'+after.mtimeMs+':'+after.ctimeMs+':'+after.size};}catch(e){if(e.code==='ENOENT')return null;throw e;}finally{await h?.close();}},
  async read(ref,expectedSha256,expectedFingerprint){const found=await api.inspect(ref);if(!found||found.sha256!==expectedSha256||expectedFingerprint&&found.fingerprint!==expectedFingerprint)fail('产物回读指纹不匹配');const h=await filesystem.open(await file(ref),constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await h.stat(),fingerprint=ident(s)+':'+s.mtimeMs+':'+s.ctimeMs+':'+s.size;if(!s.isFile()||s.nlink!==1||fingerprint!==found.fingerprint)fail('产物读取前身份变化');const text=await h.readFile('utf8'),live=await api.inspect(ref);if(sha(text)!==expectedSha256||live?.fingerprint!==found.fingerprint)fail('产物读取中变化');return text;}finally{await h.close();}},
  async remove(ref,expectedSha256,expectedFingerprint,guard){const before=await api.inspect(ref);if(!before)return{removed:true};if(before.sha256!==expectedSha256||expectedFingerprint&&before.fingerprint!==expectedFingerprint)fail('产物已变化，拒绝回滚');const path=await file(ref);const live=await api.inspect(ref);if(live?.fingerprint!==before.fingerprint)fail('产物身份已变化');const parents=ident(await directory(base))+':'+ident(await directory(join(base,ref.split('/')[0])));if(guard)await guard();const final=await api.inspect(ref);if(final?.sha256!==expectedSha256||final?.fingerprint!==before.fingerprint||parents!==ident(await directory(base))+':'+ident(await directory(join(base,ref.split('/')[0]))))fail('产物或父目录在授权复核期间变化，拒绝删除');await filesystem.unlink(path);await syncDirectory(join(base,ref.split('/')[0]));if(await api.inspect(ref))fail('产物删除回读失败');return{removed:true};},
  async createScratch(id){if(!uuid.test(id))fail('任务ID无效');await scope();const folder=join(base,id);await directory(folder,true);const scratch=join(folder,'scratch');await directory(scratch,true);return scratch;},
 };return api;
}

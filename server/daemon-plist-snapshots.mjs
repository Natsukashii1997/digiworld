// 环境值只存 XML 目标与私有 XML 备份；普通 JSON 日志只存引用/指纹。
import {join,resolve} from 'node:path';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {readConfigFile} from './config-file.mjs';
import {guardCapabilityFilesystem} from './guarded-capability-filesystem.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash=text=>createHash('sha256').update(text).digest('hex');
export function createDaemonPlistSnapshots(directory,{filesystem}={}){
 const root=join(resolve(directory),'daemon-plist-backups');
 async function folder(){const s=await filesystem.lstat(root);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid?.()||s.mode&0o077||await filesystem.realpath(root)!==root)throw new Error('常驻 XML 备份目录不可核验');return `${s.dev}:${s.ino}:${s.birthtimeMs}`;}
 async function read(snapshot){if(!snapshot||typeof snapshot.ref!=='string'||!/^[a-f0-9-]+\.(?:before|after)\.plist$/.test(snapshot.ref)||!uuid.test(snapshot.ref.split('.')[0]))throw new Error('常驻 XML 备份引用无效');await folder();const f=await readConfigFile(join(root,snapshot.ref),{filesystem,limit:65536});if(f.mode!==0o600||f.hash!==snapshot.sha256||f.identity!==snapshot.identity)throw new Error('常驻 XML 备份内容或身份变化');return new TextDecoder('utf-8',{fatal:true}).decode(f.bytes);}
 async function store(id,kind,text,guard){if(!uuid.test(id)||!['before','after'].includes(kind)||typeof text!=='string'||Buffer.byteLength(text)>65536)throw new Error('常驻 XML 备份无效');const safe=guardCapabilityFilesystem(filesystem,guard);await safe.mkdir(root,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});const identity=await folder(),ref=id+'.'+kind+'.plist',path=join(root,ref);const h=await safe.open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await h.writeFile(text);await h.sync();}finally{await h.close();}if(await folder()!==identity)throw new Error('常驻 XML 备份目录变化');const dir=await safe.open(root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await dir.sync();}finally{await dir.close();}const f=await readConfigFile(path,{filesystem,limit:65536});if(f.hash!==hash(text)||f.mode!==0o600)throw new Error('常驻 XML 备份回读失败');return{ref,sha256:f.hash,identity:f.identity};}
 return{read,async prepare(id,before,after,guard){return{beforeSnapshot:await store(id,'before',before,guard),afterSnapshot:await store(id,'after',after,guard)};}};
}

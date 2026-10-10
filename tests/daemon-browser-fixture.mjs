// 浏览器专项专用：生产常驻 service + 全内存文件系统、授权、launchctl 和端口 DI。
// 不使用真实 fs、net、child_process；仅 fixture() 的独立临时主库负责页面启动。
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {createDaemonCapability} from '../server/daemon-capability.mjs';
const absent=p=>Object.assign(new Error('合成文件不存在：'+p),{code:'ENOENT'});
const exists=p=>Object.assign(new Error('合成文件已存在：'+p),{code:'EEXIST'});

function memoryFilesystem(){
 const nodes=new Map(),writes=[];let serial=100,tick=Date.parse('2026-10-04T02:00:00.000Z');
 function put(path,kind,content='',mode=kind==='directory'?0o700:0o600){
  const n={path,kind,bytes:Buffer.from(content),dev:1,ino:++serial,birthtimeMs:++tick,mtimeMs:tick,ctimeMs:tick,mode,uid:process.getuid(),gid:process.getgid(),nlink:1};nodes.set(path,n);return n;
 }
 function get(path){const n=nodes.get(path);if(!n)throw absent(path);return n;}
 function info(n){return{dev:n.dev,ino:n.ino,birthtimeMs:n.birthtimeMs,mtimeMs:n.mtimeMs,ctimeMs:n.ctimeMs,mode:n.mode,uid:n.uid,gid:n.gid,nlink:n.nlink,size:n.kind==='file'?n.bytes.length:0,isFile:()=>n.kind==='file',isDirectory:()=>n.kind==='directory',isSymbolicLink:()=>false};}
 function directories(path){if(path==='/'){if(!nodes.has('/'))put('/','directory','',0o755);return;}directories(dirname(path));if(!nodes.has(path))put(path,'directory');}
 const filesystem={
  async lstat(path){assert.equal(resolve(path),path);return info(get(path));},
  async realpath(path){get(path);return path;},
  async access(path){const n=get(path);assert(n.kind==='file'&&(n.mode&0o100),'只允许合成可执行入口');},
  async mkdir(path,options={}){if(nodes.has(path))throw exists(path);if(options.recursive)directories(dirname(path));assert.equal(get(dirname(path)).kind,'directory');put(path,'directory','',options.mode||0o700);writes.push({kind:'mkdir',path});},
  async readdir(path){assert.equal(get(path).kind,'directory');return[...nodes.keys()].filter(p=>p!==path&&dirname(p)===path).map(p=>p.slice(path.length+1));},
  async rename(from,to){const n=get(from);assert.equal(get(dirname(to)).kind,'directory');nodes.delete(from);n.path=to;n.ctimeMs=++tick;nodes.set(to,n);writes.push({kind:'rename',path:to});},
  async unlink(path){get(path);nodes.delete(path);writes.push({kind:'unlink',path});},
  async open(path,flags,mode=0o600){
   const create=typeof flags==='string'?flags.includes('w'):Boolean(flags&constants.O_CREAT),exclusive=typeof flags==='string'?flags.includes('x'):Boolean(flags&constants.O_EXCL);
   if(create&&exclusive&&nodes.has(path))throw exists(path);
   let n=nodes.get(path);if(!n&&create){assert.equal(get(dirname(path)).kind,'directory');n=put(path,'file','',mode);writes.push({kind:'create',path});}if(!n)throw absent(path);
   return{
    async stat(){return info(n);},
    async read(buffer,offset,length,position){const bytesRead=Math.max(0,Math.min(length,n.bytes.length-position));n.bytes.copy(buffer,offset,position,position+bytesRead);return{bytesRead,buffer};},
    async writeFile(content){assert.equal(n.kind,'file');n.bytes=Buffer.from(content);n.mtimeMs=++tick;n.ctimeMs=tick;writes.push({kind:'write',path:n.path});},
    async chmod(value){n.mode=value;n.ctimeMs=++tick;},async chown(uid,gid){n.uid=uid;n.gid=gid;n.ctimeMs=++tick;},async sync(){},async close(){},
   };
  },
 };
 return{filesystem,writes,directories,put,text:path=>nodes.get(path)?.bytes.toString('utf8')??null,has:path=>nodes.has(path)};
}

export function createSyntheticDaemon({long=false}={}){
 const memory=memoryFilesystem(),prefix='/synthetic/'+(long?'合成中文EnglishWithoutSpaces'.repeat(12):'工作台'),home=join(prefix,'home'),project=join(prefix,'project'),node=join(prefix,'bin','fixture-node'),data=join(prefix,'data');
 for(const path of [home,project,data,dirname(node),join(home,'Library','LaunchAgents'),join(project,'server')])memory.directories(path);
 memory.put(node,'file','合成Node入口，绝不执行',0o700);memory.put(join(project,'server','index.mjs'),'file','// 合成工作台入口，绝不执行');
 let enabled=false,loaded=false,occupied=true,generation='synthetic-initial';
 const counts={launch:[],port:[],host:0},settings={async get(){return{enabled,generation,options:{}};},async assertEnabled(){if(!enabled)throw Object.assign(new Error('合成常驻默认关闭'),{operationNotStarted:true});return{enabled,generation,options:{}};}};
 const adapters={daemonEnvironment:()=>({}),daemonCurrentPid:90101,daemonRuntimeCodeRevision:'0'.repeat(64),capabilityFilesystem:memory.filesystem,platform:'darwin',daemonHome:home,daemonProjectRoot:project,daemonNodePath:node,daemonMetadataCheck:async()=>({provenance:null}),
  daemonPortOccupied:async port=>{assert.equal(port,5178);counts.port.push(port);return occupied;},
  daemonLaunchctl:async args=>{counts.launch.push(args);assert.equal(args[1].startsWith('gui/'+process.getuid()),true);assert(!args.includes('bootout'),'生产 service 不得停止服务');
   if(args[0]==='print'){if(!loaded)throw Object.assign(new Error('合成未加载'),{exitCode:113});return'cn.personal-ai-workbench.server\n program = '+node+'\n arguments = {\n'+node+'\n'+join(project,'server','index.mjs')+'\n}\n pid = 90101\n';}
   if(args[0]==='bootstrap'){assert.equal(occupied,false,'占用端口不得 bootstrap');assert.equal(args[2],join(home,'Library','LaunchAgents','cn.personal-ai-workbench.server.plist'));loaded=true;return'';}
   assert.fail('未知合成 launchctl 命令：'+args[0]);
  },
 };
 const api=createDaemonCapability({directory:data},{settings,adapters,clock:()=>Date.parse('2026-10-04T02:00:00.000Z')});
 return{api,memory,counts,plistPath:join(home,'Library','LaunchAgents','cn.personal-ai-workbench.server.plist'),enable(){enabled=true;generation='synthetic-enabled';},set({isLoaded,isOccupied}={}){if(isLoaded!==undefined)loaded=isLoaded;if(isOccupied!==undefined)occupied=isOccupied;},mutations:()=>counts.launch.filter(a=>a[0]!=='print')};
}

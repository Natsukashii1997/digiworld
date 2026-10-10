// 能力本机ledger写入的最后门：每次创建/写暂存/rename前重新执行传入guard。
// 读操作不触发guard；owned暂存清理不受关闭开关妨碍。不是操作系统CAS，仍有最后syscall窗口。
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
export function guardCapabilityFilesystem(filesystem=fs, guard) {
 if(typeof guard!=='function')return filesystem;
 const writable=flags=>typeof flags==='number'?Boolean(flags&(constants.O_WRONLY|constants.O_RDWR|constants.O_CREAT|constants.O_TRUNC|constants.O_APPEND)):typeof flags==='string'&&/[wax+]/.test(flags);
 return new Proxy(filesystem,{get(target,key){
  if(['mkdir','rename','chmod','chown','writeFile','truncate'].includes(key))return async(...args)=>{await guard();return target[key](...args);};
  if(key==='open')return async(...args)=>{const writes=writable(args[1]);if(writes)await guard();const handle=await target.open(...args);if(!writes)return handle;return new Proxy(handle,{get(h,method){const value=h[method];if(typeof value!=='function')return value;if(['write','writeFile','truncate','chmod','chown'].includes(method))return async(...items)=>{await guard();return value.apply(h,items);};return value.bind(h);}});};
  return typeof target[key]==='function'?target[key].bind(target):target[key];
 }});
}

// 固定Apple Swift/Security helper，secret只经stdin和本进程内存。工厂不执行、不编译、不读钥匙串。
import {spawn as nativeSpawn} from 'node:child_process';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {fileURLToPath} from 'node:url';
const unavailable=(reason)=>Object.assign(new Error('钥匙串不可用'),{code:'KEYCHAIN_UNAVAILABLE',reasonCode:reason});
export function createSwiftKeychainRunner({spawn=nativeSpawn,filesystem=fs,platform=process.platform,helperPath=fileURLToPath(new URL('./keychain-helper.swift',import.meta.url))}={}){
 return async payload=>{if(platform!=='darwin')throw unavailable('PLATFORM_UNSUPPORTED');let s;try{s=await filesystem.lstat(helperPath);}catch{throw unavailable('HELPER_UNAVAILABLE');}if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.mode&0o022||s.size>64*1024)throw unavailable('HELPER_UNVERIFIED');try{await filesystem.access('/usr/bin/swift',constants.X_OK);}catch{throw unavailable('SWIFT_UNAVAILABLE');}
  return new Promise((resolve,reject)=>{const p=spawn('/usr/bin/swift',[helperPath],{shell:false,stdio:['pipe','pipe','pipe'],env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8'}});let out='',bytes=0,settled=false;
   const stop=()=>{p.kill('SIGTERM');if(!settled){settled=true;reject(unavailable('HELPER_TIMEOUT'));}};const timer=setTimeout(stop,15000);timer.unref?.();
   p.stdout.on('data',b=>{bytes+=b.length;if(bytes>16384)return stop();out+=b.toString('utf8');});p.stderr.on('data',()=>{});p.on('error',stop);p.stdin.on('error',()=>{});
   p.on('close',code=>{clearTimeout(timer);if(settled)return;settled=true;if(code!==0)return reject(unavailable('HELPER_FAILED'));try{resolve(JSON.parse(out));}catch{reject(unavailable('HELPER_READBACK'));}});p.stdin.end(JSON.stringify(payload));
  });};
}

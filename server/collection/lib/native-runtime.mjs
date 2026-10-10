import {lstat,realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const directory=resolve(dirname(fileURLToPath(import.meta.url)),'../native');
const hashes={'kankan-video-analyzer':'e9c925caa0d485466debb87e772dcb27a639cf1778c64b85b8de8f88a76a62e5','kankan-sensevoice':'08f91e91cb521f71b2c7ef92ce2220db5c3741bc0dbfcdb14156bc35c09c4984','recycle-move':'7dea7fac0ca7bb17e6d700eeb57483562634cc9b2ab72ed4ff9176cf98c2a07b'};
export async function verifiedNativeRuntime(name) {
  if(!hashes[name])throw new Error('不支持的本地分析组件');
  const path=resolve(directory,name),parent=await lstat(directory),info=await lstat(path);
  if(!parent.isDirectory()||parent.isSymbolicLink()||!info.isFile()||info.isSymbolicLink()||info.nlink!==1||await realpath(path)!==path)throw new Error('本地分析组件身份已变化');
  const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
  if(hash.digest('hex')!==hashes[name])throw new Error('本地分析组件校验失败，未运行');return path;
}

import { basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verifiedNativeRuntime } from './native-runtime.mjs';
import { failure } from '../../repository.mjs';

const exec = promisify(execFile);
export async function moveRecycleDirectory(source, target, { sourceParent, targetParent, item, from, to }) {
  if (process.platform !== 'darwin') throw failure('当前系统不支持安全的回收移动，原文件已保留',503);
  if (![item,from,to].every(stat => stat.isDirectory() && !stat.isSymbolicLink())) throw failure('移动目录身份异常',409);
  const executable = await verifiedNativeRuntime('recycle-move');
  try {
    await exec(executable,[sourceParent,targetParent,basename(source),basename(target),String(item.dev),String(item.ino),String(from.dev),String(from.ino),String(to.dev),String(to.ino)],{timeout:5000,maxBuffer:4096});
  } catch (error) {
    if (String(error.stderr).includes('errno:17')) throw failure('目标目录已存在，未覆盖任何文件',409);
    throw failure('安全移动未确认，文件已保留，请刷新核对',409);
  }
}

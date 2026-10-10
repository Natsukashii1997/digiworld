import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { failure } from './repository.mjs';

const same = (a, b) => a.dev === b.dev && a.ino === b.ino &&
  a.birthtimeMs === b.birthtimeMs && a.uid === b.uid;
const unavailable = () => failure('本机数据目录身份不可核验，已停止待决操作', 503);

// Called only by an explicit /api/session request. No path or directory
// metadata is returned to browser storage: just an opaque SHA-256 identity.
export async function readDataRootIdentity(directory, filesystem = fs) {
  try {
    if (typeof directory !== 'string' || !isAbsolute(directory)) throw unavailable();
    const before = await filesystem.lstat(directory);
    if (!before.isDirectory() || before.isSymbolicLink() ||
      before.uid !== process.getuid?.() || before.mode & 0o022) throw unavailable();
    const canonical = await filesystem.realpath(directory);
    const [after, resolved] = await Promise.all([
      filesystem.lstat(directory), filesystem.lstat(canonical),
    ]);
    if (!isAbsolute(canonical) || !after.isDirectory() || after.isSymbolicLink() ||
      !resolved.isDirectory() || resolved.isSymbolicLink() ||
      !same(before, after) || !same(after, resolved)) throw unavailable();
    return createHash('sha256').update(JSON.stringify([
      canonical, after.dev, after.ino, after.birthtimeMs, after.uid,
    ])).digest('hex');
  } catch { throw unavailable(); }
}

import * as fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { digest, failure } from './repository.mjs';

const exec = promisify(execFile);
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const legacyDirectoryIdentity = info => digest(JSON.stringify([info.dev, info.ino, info.birthtimeMs]));
export const identityOptions = (project, root) => ({ identityVersion: project?.locations?.find(l => l.path === root)?.identityVersion || 1 });

// Device numbers are only meaningful during an operation. Never persist them as
// the stable identity of a macOS volume; diskutil is read-only and bounded.
async function diskVolumeUuid(path) {
  const options = { timeout: 2500, maxBuffer: 128 * 1024, env: { ...process.env, LC_ALL: 'C' } };
  const result = await exec('/bin/df', ['-P', path], options);
  const device = result.stdout.trim().split('\n').at(-1)?.trim().split(/\s+/)[0];
  if (!/^\/dev\/disk\d+(?:s\d+)*$/.test(device || '')) throw failure('无法核实稳定卷身份，保留原登记', 409);
  const { stdout } = await exec('/usr/sbin/diskutil', ['info', '-plist', device], options);
  return stdout.match(/<key>VolumeUUID<\/key>\s*<string>([^<]+)<\/string>/)?.[1] || '';
}
export function createStableIdentityReader({ filesystem = fs, volumeUuid = diskVolumeUuid } = {}) {
  // Cache is scoped to one scan/read operation, never across mounts or boots.
  const volumes = new Map();
  return async path => {
    const before = await filesystem.lstat(path);
    const exact = await filesystem.lstat(path, { bigint: true });
    if (!before.isDirectory() || before.isSymbolicLink() || !exact.isDirectory() || exact.isSymbolicLink() || String(before.dev) !== String(exact.dev) || String(before.ino) !== String(exact.ino))
      throw failure('读取期间目录身份发生变化，请重新预览', 409);
    const device = String(exact.dev);
    if (!volumes.has(device)) volumes.set(device, volumeUuid(path));
    const uuid = await volumes.get(device);
    if (!UUID.test(uuid) || typeof exact.ino !== 'bigint' || typeof exact.birthtimeNs !== 'bigint' || exact.birthtimeNs <= 0n)
      throw failure('无法核实稳定卷身份，保留原登记', 409);
    const after = await filesystem.lstat(path);
    if (!after.isDirectory() || after.isSymbolicLink() || legacyDirectoryIdentity(before) !== legacyDirectoryIdentity(after))
      throw failure('读取期间目录身份发生变化，请重新预览', 409);
    return {
      identityVersion: 2,
      identity: digest(JSON.stringify([2, uuid.toLowerCase(), exact.ino.toString(), exact.birthtimeNs.toString()])),
      legacyIdentity: legacyDirectoryIdentity(before),
    };
  };
}

// A scan is an observation, not permission to migrate existing registrations.
export function observationForRegistration(observation, previous, accept = false) {
  if (!observation) return observation;
  if (!accept && previous?.identity && previous.identityVersion !== 2 && observation.identityVersion === 2)
    return { ...observation, identity: observation.legacyIdentity, identityVersion: undefined };
  return observation;
}

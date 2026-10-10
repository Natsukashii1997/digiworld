import {guardCapabilityFilesystem} from './guarded-capability-filesystem.mjs';
// 具体生产文件适配候选。导入无读写；产品动作调用后仅访问服务器登记的受限目录。
// readConfigFile / atomicReplaceConfig 接项目已有模块，保持owner/link/metadata/双读校验。
import nativeFs from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, resolve } from "node:path";
const sha = v => createHash("sha256").update(v).digest("hex");
const fail = message => { throw Object.assign(new Error(message), { code: "UNSAFE_FILE" }); };
const ordinaryDirectory = stat => stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && !(stat.mode & 0o7000);
const identity = stat => [stat.dev, stat.ino, stat.birthtimeMs, stat.uid, stat.mode & 0o777].join(":");
const uuidPart = part => typeof part === "string" && part && part !== "." && part !== ".." && !/[/\\:\x00-\x1f\x7f<>?*|]/.test(part);
export function createScopedTextFiles({ registeredTarget, readConfigFile, atomicReplaceConfig, filesystem = nativeFs, checkMetadata }) {
  async function chain(root, parts) {
    if (!isAbsolute(root) || resolve(root) !== root || root === "/" || /[\x00-\x1f\x7f]/.test(root)) fail("登记根目录不安全");
    for (let p = root; ; p = dirname(p)) {
      const info = await filesystem.lstat(p);
      if (!info.isDirectory() || info.isSymbolicLink()) fail("根目录祖先是链接或特殊文件");
      if (dirname(p) === p) break;
    }
    const base = await filesystem.lstat(root);
    if (!ordinaryDirectory(base) || await filesystem.realpath(root) !== root) fail("根目录必须是本人拥有的真实目录");
    const rootIdentity = sha(root + ":" + identity(base)), entries = [[root, identity(base)]];
    let absolute = root;
    for (const part of parts.slice(0, -1)) {
      absolute = join(absolute, part); const stat = await filesystem.lstat(absolute);
      if (!ordinaryDirectory(stat)) fail("写入目录必须已存在且不是符号链接");
      entries.push([absolute, identity(stat)]);
    }
    return { rootIdentity, parentIdentity: sha(JSON.stringify(entries)), absolutePath: join(root, ...parts) };
  }
  async function resolveTarget(ref) {
    const spec = await registeredTarget(ref); // 只凭工作台连接ID/当前user配置/asset version派生，不能拿前端path拼接。
    if (!spec || !["note", "profile", "skill-file", "configuration"].includes(spec.kind) || typeof spec.relativePath !== "string" || typeof spec.allowedSubdirectory !== "string")
      fail("未登记受控目标");
    const sub = spec.allowedSubdirectory.split("/"), parts = spec.relativePath.split("/");
    if (!sub.length || sub.some(p => !uuidPart(p)) || parts.some(p => !uuidPart(p)) || parts.length <= sub.length
      || sub.some((p, i) => p !== parts[i])) fail("目标越出指定子目录");
    if (parts.some(p => p.startsWith(".") || /^(?:credentials?|secrets?|auth|sessions?)(?:\..*)?$/i.test(p)))
      fail("凭据、隐藏配置与私人会话不是写入目标");
    if (["note", "profile"].includes(spec.kind) && !parts.at(-1).endsWith(".md")) fail("Vault仅支持Markdown普通文件");
    if (spec.kind === "configuration" && spec.relativePath !== "capability-control/switches.json") fail("能力配置只允许产品固定文件");
    const checked = await chain(spec.root, parts);
    if (checked.rootIdentity !== spec.rootIdentity) fail("登记根目录身份已变化");
    return { ...checked, identity: sha(spec.rootIdentity + ":" + spec.kind + ":" + spec.relativePath),
      ref, spec, parts, displayPath: spec.relativePath };
  }
  async function verify(target) {
    const current = await resolveTarget(target.ref);
    if (current.identity !== target.identity || current.parentIdentity !== target.parentIdentity || current.absolutePath !== target.absolutePath)
      fail("目标目录身份已变化");
    return current;
  }
  async function inspect(target) {
    await verify(target);
    try { await filesystem.lstat(target.absolutePath); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
    const file = await readConfigFile(target.absolutePath, { filesystem, limit: 256 * 1024 });
    await verify(target);
    let content; try { content = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes); } catch { fail("文件不是UTF8文本"); }
    return { sha256: file.hash, content, fingerprint: sha(target.parentIdentity + file.identity),
      parentIdentity: target.parentIdentity, configExpected: file };
  }
  async function syncParent(path) {
    const handle = await filesystem.open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await handle.sync(); } finally { await handle.close(); }
  }
  async function create(target, text,{guard=async()=>{}}={}) {
    if (typeof text !== "string" || Buffer.byteLength(text) > 256 * 1024) fail("正文超过上限");
    await verify(target); if (await inspect(target)) fail("同名已存在，不覆盖");
    await guard();
    const handle = await guardCapabilityFilesystem(filesystem,guard).open(target.absolutePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    let owned;
    try {
      owned = await handle.stat(); await verify(target); await handle.writeFile(text, "utf8"); await handle.sync();
    } finally { await handle.close(); }
    await syncParent(target.absolutePath);
    const current = await inspect(target), finalStat = await filesystem.lstat(target.absolutePath);
    if (!current || current.sha256 !== sha(text) || finalStat.dev !== owned.dev || finalStat.ino !== owned.ino || finalStat.nlink !== 1)
      fail("新建回读不一致，保留操作为未知");
    return current;
  }
  async function replace(target, expected, text,{guard=async()=>{}}={}) {
    const current = await inspect(target);
    if (!current || current.fingerprint !== expected.fingerprint || current.sha256 !== expected.sha256) fail("原文件已变化");
    await atomicReplaceConfig(target.absolutePath, current.configExpected, Buffer.from(text, "utf8"), {
      filesystem:guardCapabilityFilesystem(filesystem,guard), verifyScope: async() => {await guard();await verify(target);}, ...(checkMetadata ? { checkMetadata } : {}),
    });
    const after = await inspect(target); if (!after || after.sha256 !== sha(text)) fail("替换回读不一致");
    return after;
  }
  async function remove(target, expected,{guard=async()=>{}}={}) {
    const current = await inspect(target);
    if (!current || current.fingerprint !== expected.fingerprint || current.sha256 !== expected.sha256) fail("只移除本次原样新文件");
    await guard();
    await verify(target);
    const immediatelyBefore = await inspect(target);
    if (!immediatelyBefore || immediatelyBefore.fingerprint !== current.fingerprint) fail("移除前文件已变化");
    await guard();
    const final = await inspect(target);
    if (!final || final.fingerprint !== expected.fingerprint || final.sha256 !== expected.sha256) fail("移除前文件已变化");
    // inspect的await之后再核授权；此guard只授权/目标身份，不读取正文，外部替换仍需最终指纹复核。
    await guard();
    const finalStat = await filesystem.lstat(target.absolutePath);
    const expectedIdentity = final.configExpected.identity;
    if (!finalStat.isFile() || finalStat.isSymbolicLink() || finalStat.nlink !== 1 || !expectedIdentity) fail("移除前文件身份无法核验");
    // lstat本身也可以异步撤权；最后再核门禁，syscall窗口在契约中明示。
    await guard();
    const guarded = new Proxy(filesystem,{get(base,key){if(key==='unlink')return async path=>{await guard();const again=await inspect(target);if(!again||again.fingerprint!==expected.fingerprint||again.sha256!==expected.sha256)fail("移除前文件已变化");await guard();return base.unlink(path);};const v=base[key];return typeof v==='function'?v.bind(base):v;}});
    await guarded.unlink(target.absolutePath); await syncParent(target.absolutePath);
    if (await inspect(target) !== null) fail("移除回读不一致");
  }
  return { resolveTarget, inspect, create, replace, remove };
}

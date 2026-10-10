import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { failure } from '../repository.mjs';
import { ensureDeskState } from '../../src/collection/app/lib/desk-workspace.mjs';
import { moveRecycleDirectory } from './lib/recycle-move.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const identity = stat => `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
const exec = promisify(execFile);
const MAX_ARCHIVE = 16 * 1024 * 1024;
const legacyId = (entry, index) => {
  const hex = hash(JSON.stringify([entry.id, entry.deletedAt, entry.mediaVersion, index]));
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
};
const assignIds = state => ({ ...state, trash:(state.trash || []).map((entry, index) => ({ ...entry, recycleId:entry.recycleId || legacyId(entry, index) })) });
function folderFor(entry) {
  const title = Array.from(String(entry.title || '未命名笔记').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '_').replace(/\s+/g, '_')).slice(0,40).join('');
  return `${String(entry.deletedAt || '').slice(0,10).replace(/[^0-9-]/g, '') || '未知日期'}_${title}_${entry.recycleId}`;
}
function snapshot(entry) {
  const { recycle, recycleId, deletedAt, deletedGroupId, ...note } = entry;
  const cleanUrl = value => { try { const url = new URL(value); url.search = ''; url.hash = ''; return url.toString(); } catch { return ''; } };
  let sourceUrl = note.sourceUrl || '';
  try { const url = new URL(sourceUrl); for (const key of [...url.searchParams.keys()]) if (/^(?:xsec_token|token|signature|sign|utm_.+|fbclid)$/i.test(key)) url.searchParams.delete(key); url.hash = ''; sourceUrl = url.toString(); } catch { sourceUrl = ''; }
  return { ...note, sourceUrl, sourceImageUrls:(note.sourceImageUrls || []).map(cleanUrl), sourceVideoUrl:cleanUrl(note.sourceVideoUrl) };
}
function description(payload) {
  const note = payload.note;
  return ['状态：已删除 / 回收整理', `标题：${note.title || '未命名笔记'}`, `删除时间：${payload.deletedAt}`, `回收编号：${payload.recycleId}`, `作者：${note.author?.name || ''}`, `分类：${note.category || ''}`, `原链接：${note.sourceUrl || ''}`, `本地媒体：${payload.manifest.length} 个文件${payload.mediaMissing ? '（整理前已缺失部分媒体，不可完整恢复）' : ''}`, '', '正文', note.rawContent || note.content || '', '', '图片识别', note.ocrText || '', '', '视频文稿', note.transcriptText || '', ''].join('\n');
}

// The journal retains the full note until its archive and original media are durable.
export function createCollectionRecycle({ root, read, write, guard, serialized, busyVersions, platform = process.platform, runOpen = path => exec('/usr/bin/open', [path], { timeout:5000, maxBuffer:65536 }), checkpoint = async () => {} }) {
  const recycleRoot = join(root, 'recycle');
  let rootIdentity;
  async function directory(path, create = false) {
    await guard(create);
    const rootStat = await fs.lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw failure('收藏目录身份异常',409);
    const current = identity(rootStat);
    if (rootIdentity && rootIdentity !== current) throw failure('收藏目录已变化，请核对后刷新',409);
    rootIdentity ||= current;
    const rel = relative(root, path);
    if (rel === '..' || rel.startsWith('..' + sep) || rel.startsWith(sep)) throw failure('回收目录越界',409);
    let currentPath = root;
    for (const part of rel ? rel.split(sep) : []) {
      currentPath = join(currentPath, part);
      if (create) await fs.mkdir(currentPath, { mode:0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
      const stat = await fs.lstat(currentPath);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw failure('回收目录不能是链接',409);
    }
    return path;
  }
  async function existsDirectory(path) {
    try { await directory(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
  async function syncDirectory(path) {
    await directory(path); const handle = await fs.open(path, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  }
  async function exclusiveMove(source,target,stage) {
    await directory(source); await directory(dirname(target));
    const canonicalRoot = await fs.realpath(root);
    const sourceParent = join(canonicalRoot,relative(root,dirname(source))), targetParent = join(canonicalRoot,relative(root,dirname(target)));
    const item = await fs.lstat(source), from = await fs.lstat(dirname(source)), to = await fs.lstat(dirname(target));
    // Bind identities before the action boundary; never adopt a newly resolved link.
    await checkpoint(stage);
    await moveRecycleDirectory(source,target,{sourceParent,targetParent,item,from,to});
    await directory(dirname(source)); await directory(dirname(target));
    if (identity(await fs.lstat(dirname(source))) !== identity(from) || identity(await fs.lstat(dirname(target))) !== identity(to)) throw failure('移动期间父目录已变化，结果待核对',409);
  }
  async function file(path, digest = false, maximum = 600 * 1024 * 1024) {
    await directory(join(path, '..'));
    const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.nlink !== 1 || before.size > maximum) throw failure('回收文件身份或大小异常',409);
      let sha256;
      if (digest) { const checksum = createHash('sha256'); for await (const chunk of handle.createReadStream({ autoClose:false })) checksum.update(chunk); sha256 = checksum.digest('hex'); }
      const after = await handle.stat();
      if (identity(before) !== identity(after) || before.nlink !== after.nlink || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw failure('回收文件读取期间发生变化',409);
      return { bytes:before.size, stamp:`${identity(before)}:${before.size}:${before.mtimeMs}`, ...(digest ? { sha256 } : {}) };
    } finally { await handle.close(); }
  }
  async function inventory(path, noteId, digest = false) {
    const files = [];
    async function walk(dir) {
      await directory(dir);
      for (const entry of await fs.readdir(dir, { withFileTypes:true })) {
        const child = join(dir, entry.name), rel = relative(path, child).split(sep).join('/');
        if (entry.isDirectory() && ['media', `media/${noteId}`].includes(rel)) await walk(child);
        else if (new RegExp(`^media/${noteId}/(?:\\d{2}\\.(?:avif|gif|heic|heif|jpg|png|webp)|video\\.mp4)$`).test(rel)) files.push({ path:rel, ...await file(child, digest) });
        else throw failure('媒体版本包含未知文件或链接，未移动',409);
        if (files.length > 100) throw failure('回收媒体数量异常',409);
      }
    }
    await walk(path); return files.sort((a,b) => a.path.localeCompare(b.path));
  }
  function expectedPaths(note) {
    const prefix = `/collection-media/${note.mediaVersion}/`;
    return [...new Set([...(note.imageUrls || []), note.coverUrl, note.videoUrl].filter(url => String(url || '').startsWith(prefix)).map(url => url.slice(prefix.length)))];
  }
  function paths(entry) {
    const folder = entry.recycle?.folder || folderFor(entry);
    if (folder !== folderFor(entry)) throw failure('回收计划目录不匹配',409);
    if (entry.mediaVersion && !/^[a-f0-9]{32}$/.test(entry.mediaVersion)) throw failure('回收媒体版本无效',409);
    return { folder, path:join(recycleRoot,folder), source:entry.mediaVersion ? join(root,'versions',entry.mediaVersion) : null };
  }
  async function replace(state, entry) {
    return write({ ...state, trash:state.trash.map(item => item.recycleId === entry.recycleId ? entry : item) });
  }
  async function archive(entry) {
    const { path } = paths(entry), plan = entry.recycle;
    await directory(path);
    const handle = await fs.open(join(path,'note.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
    let raw;
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.nlink !== 1 || before.size > MAX_ARCHIVE || before.size !== plan.archiveBytes) throw failure('笔记快照身份或大小异常',409);
      const chunks = []; let bytes = 0;
      for await (const chunk of handle.createReadStream({autoClose:false})) { bytes += chunk.length; if (bytes > MAX_ARCHIVE) throw failure('笔记快照超限',409); chunks.push(chunk); }
      const after = await handle.stat(); raw = Buffer.concat(chunks).toString('utf8');
      if (identity(before) !== identity(after) || after.nlink !== 1 || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes !== plan.archiveBytes || hash(raw) !== plan.archiveHash) throw failure('笔记快照已变化，未恢复',409);
    } finally { await handle.close(); }
    const payload = JSON.parse(raw);
    if (payload.schema !== 1 || payload.recycleId !== entry.recycleId || payload.note?.id !== entry.id || payload.note?.mediaVersion !== entry.mediaVersion) throw failure('笔记快照与回收记录不匹配',409);
    return payload;
  }
  async function validateMedia(entry, base, digest = false) {
    if (!entry.recycle.hadSource) return;
    await directory(base);
    if (identity(await fs.lstat(base)) !== entry.recycle.sourceIdentity) throw failure('媒体目录身份已变化',409);
    const actual = await inventory(base, entry.id, digest), expected = entry.recycle.manifest;
    if (actual.length !== expected.length || actual.some((value, index) => value.path !== expected[index].path || value.stamp !== expected[index].stamp || (digest && value.sha256 !== expected[index].sha256))) throw failure('部分媒体已缺失或被修改',409);
  }
  async function validateDescription(entry) {
    const stat = await file(join(paths(entry).path,'笔记.txt'),true,MAX_ARCHIVE);
    if (stat.sha256 !== entry.recycle.descriptionHash || stat.bytes !== entry.recycle.descriptionBytes) throw failure('笔记.txt 已被修改或缺失，已保留供手动核对',409);
  }
  async function list(state) {
    const items = [];
    for (const entry of assignIds(state).trash) {
      const selected = paths(entry), plan = entry.recycle;
      let status = plan?.phase === 'restoring' ? 'restoring' : plan?.phase === 'organized' ? 'organized' : plan ? 'planned' : 'pending';
      let error = '', canRestore = !plan, mediaCount = plan?.manifest?.length ?? expectedPaths(entry).length;
      if (plan) {
        try {
          if (!await existsDirectory(selected.path)) { if (plan.phase !== 'planned') status = 'missing'; error = plan.phase === 'planned' ? '整理曾中断，可继续整理' : '文件夹未找到，可能已移走或删除'; }
          else if (plan.phase === 'organized') {
            await archive(entry); await validateDescription(entry);
            await validateMedia(entry, join(selected.path,'files'));
            if (plan.mediaMissing) throw failure('整理前已有媒体缺失，无法完整恢复',409);
            canRestore = true;
          } else if (plan.phase === 'restoring') {
            await archive(entry); await validateDescription(entry);
            if (plan.hadSource) {
              const sourceExists = await existsDirectory(selected.source), targetExists = await existsDirectory(join(selected.path,'files'));
              if (sourceExists === targetExists) throw failure('恢复媒体位置不一致，请手动核对',409);
              await validateMedia(entry,sourceExists ? selected.source : join(selected.path,'files'));
            }
            canRestore = true;
          }
        } catch (issue) { if (plan.phase !== 'planned') status = 'incomplete'; error = String(issue.message).slice(0,200); }
      }
      if (state.notes.some(note => note.id === entry.id)) canRestore = false;
      items.push({ recycleId:entry.recycleId, noteId:entry.id, title:entry.title || '未命名笔记', deletedAt:entry.deletedAt, category:entry.category || '', mediaVersion:entry.mediaVersion, folder:selected.folder, path:selected.path, status, canRestore, mediaCount, bytes:plan?.manifest?.reduce((sum,item) => sum + item.bytes,0) || 0, error, activeConflict:state.notes.some(note => note.id === entry.id) });
    }
    return { rootPath:recycleRoot, items, revision:state.revision, notes:state.notes, workspace:{...state.desk,revision:state.revision} };
  }
  async function writeExclusive(path, raw) {
    await directory(join(path,'..'));
    let handle;
    try { handle = await fs.open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); await handle.writeFile(raw); await handle.sync(); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const present = await file(path, true, MAX_ARCHIVE);
      if (present.sha256 !== hash(raw)) throw failure('目标文件已存在且不匹配，未覆盖',409);
    } finally { await handle?.close(); }
    const present = await file(path, true, MAX_ARCHIVE);
    if (present.sha256 !== hash(raw)) throw failure('回收快照写后校验失败',409);
  }
  function protectedVersion(state, entry) {
    if (entry.mediaVersion && (state.notes.some(note => note.mediaVersion === entry.mediaVersion) || busyVersions.has(entry.mediaVersion))) throw failure('此媒体仍在使用或分析中，未移动',409);
    if (state.trash.some(other => other.recycleId !== entry.recycleId && other.mediaVersion && other.mediaVersion === entry.mediaVersion)) throw failure('多个删除记录引用同一媒体，需核对归属',409);
  }
  async function organizeOne(state, entry) {
    if (['organized','restoring'].includes(entry.recycle?.phase)) return state;
    protectedVersion(state,entry);
    let selected = paths(entry);
    if (!entry.recycle) {
      const hadSource = selected.source ? await existsDirectory(selected.source) : false;
      const manifest = hadSource ? await inventory(selected.source, entry.id, true) : [];
      const mediaMissing = expectedPaths(entry).some(path => !manifest.some(item => item.path === path));
      const payload = { schema:1, recycleId:entry.recycleId, deletedAt:entry.deletedAt, deletedGroupId:entry.deletedGroupId, note:snapshot(entry), manifest, mediaMissing };
      const raw = JSON.stringify(payload, null, 2);
      if (Buffer.byteLength(raw) > MAX_ARCHIVE) throw failure('回收快照过大',413);
      const text = description(payload);
      entry = { ...entry, recycle:{ phase:'planned', folder:selected.folder, hadSource, sourceIdentity:hadSource ? identity(await fs.lstat(selected.source)) : null, manifest, mediaMissing, archiveHash:hash(raw), archiveBytes:Buffer.byteLength(raw), descriptionHash:hash(text), descriptionBytes:Buffer.byteLength(text) } };
      state = await replace(state,entry); await checkpoint('afterPlan');
    }
    const plan = entry.recycle;
    selected = paths(entry);
    const payload = { schema:1, recycleId:entry.recycleId, deletedAt:entry.deletedAt, deletedGroupId:entry.deletedGroupId, note:snapshot(entry), manifest:plan.manifest, mediaMissing:plan.mediaMissing };
    const raw = JSON.stringify(payload,null,2);
    if (hash(raw) !== plan.archiveHash) throw failure('回收计划快照不匹配',409);
    await directory(selected.path,true);
    await writeExclusive(join(selected.path,'note.json'),raw);
    await writeExclusive(join(selected.path,'笔记.txt'),description(payload));
    await syncDirectory(selected.path); await syncDirectory(recycleRoot); await checkpoint('afterArchive');
    if (plan.hadSource) {
      const target = join(selected.path,'files'), sourceExists = await existsDirectory(selected.source), targetExists = await existsDirectory(target);
      if (sourceExists && targetExists) throw failure('源和目标媒体同时存在，未覆盖',409);
      if (sourceExists) {
        await validateMedia(entry,selected.source,true); protectedVersion(await read(),entry);
        await exclusiveMove(selected.source,target,'beforeMove');
        await syncDirectory(join(root,'versions')); await syncDirectory(selected.path);
      } else if (!targetExists) throw failure('源和目标媒体均未找到，需核对',409);
      await validateMedia(entry,target,true);
    }
    await checkpoint('afterMove'); await archive(entry); await validateDescription(entry);
    const summary = { id:entry.id, title:entry.title, category:entry.category, type:entry.type, mediaVersion:entry.mediaVersion, savedAt:entry.savedAt, deletedAt:entry.deletedAt, deletedGroupId:entry.deletedGroupId, recycleId:entry.recycleId, recycle:{ ...plan, phase:'organized' } };
    return replace(await read(),summary);
  }
  async function organize() {
    return serialized(async () => {
      let state = assignIds(await read());
      // Persist legacy identifiers together so deleting one item cannot renumber others.
      if ((await read()).trash?.some(entry => !entry.recycleId)) state = await write(state);
      await directory(recycleRoot,true);
      const errors = []; let organizedCount = 0;
      for (const id of state.trash.map(entry => entry.recycleId)) {
        state = assignIds(await read()); const entry = state.trash.find(item => item.recycleId === id);
        if (!entry || ['organized','restoring'].includes(entry.recycle?.phase)) continue;
        try { state = await organizeOne(state,entry); organizedCount++; }
        catch (error) { errors.push({ recycleId:id, title:entry.title, error:String(error.message).slice(0,200) }); }
      }
      const saved = await read();
      return { ...await list(saved), notes:saved.notes, workspace:{ ...saved.desk, revision:saved.revision }, organizedCount, errors };
    }).catch(error => {
      if (['ENOENT','ELOOP','ENOTDIR'].includes(error.code)) throw failure('回收文件未找到或身份异常，请刷新核对；未覆盖任何文件',409);
      throw error;
    });
  }
  async function restore(recycleId) {
    return serialized(async () => {
      let state = assignIds(await read()), entry = state.trash.find(item => item.recycleId === recycleId);
      if (!entry) throw failure('回收记录不存在，请刷新核对',404);
      if (state.notes.some(note => note.id === entry.id)) throw failure('同一帖子已重新收藏，未覆盖新内容',409);
      if (state.notes.length >= 10000) throw failure('收藏数量达到上限',413);
      if ((await read()).trash?.some(item => !item.recycleId)) state = await write(state);
      let note = snapshot(entry);
      const selected = paths(entry);
      if (entry.recycle) {
        if (!['organized','restoring'].includes(entry.recycle.phase)) throw failure('请先完成回收整理后恢复',409);
        const payload = await archive(entry); note = payload.note;
        await validateDescription(entry);
        if (entry.recycle.mediaMissing) throw failure('整理前已有媒体缺失，无法完整恢复',409);
        if (entry.recycle.phase !== 'restoring') {
          await validateMedia(entry,join(selected.path,'files'),true);
          if (selected.source && await existsDirectory(selected.source)) throw failure('原媒体位置已有文件，未覆盖',409);
          entry = { ...entry, recycle:{ ...entry.recycle, phase:'restoring' } }; state = await replace(state,entry);
        }
        if (entry.recycle.hadSource) {
          const target = join(selected.path,'files'), sourceExists = await existsDirectory(selected.source), targetExists = await existsDirectory(target);
          if (sourceExists && targetExists) throw failure('恢复源与目标同时存在，未覆盖',409);
          if (targetExists) {
            await validateMedia(entry,target,true); await directory(join(root,'versions'),true);
            await exclusiveMove(target,selected.source,'beforeRestoreMove'); await syncDirectory(selected.path); await syncDirectory(join(root,'versions'));
          } else if (!sourceExists) throw failure('恢复媒体未找到，请核对',409);
          await validateMedia(entry,selected.source,true);
        }
        await checkpoint('afterRestoreMove');
      } else if (selected.source) {
        const existing = await existsDirectory(selected.source) ? await inventory(selected.source,entry.id,true) : [];
        if (expectedPaths(entry).some(path => !existing.some(item => item.path === path))) throw failure('原媒体不完整，请先整理并核对',409);
      }
      state = assignIds(await read());
      if (state.notes.some(value => value.id === entry.id)) throw failure('同一帖子已重新收藏，未覆盖',409);
      const notes = [note,...state.notes], desk = ensureDeskState(state.desk,notes);
      if (entry.deletedGroupId && desk.groups.some(group => group.id === entry.deletedGroupId)) desk.noteGroupMap[note.id] = entry.deletedGroupId;
      const saved = await write({ ...state, notes, desk, trash:state.trash.filter(value => value.recycleId !== recycleId) });
      // Permanent cleanup belongs to the user, including the small restored snapshot.
      return { notes:saved.notes, workspace:{ ...saved.desk, revision:saved.revision }, revision:saved.revision, restoredId:note.id, retainedArchivePath:entry.recycle ? selected.path : null };
    }).catch(error => {
      if (['ENOENT','ELOOP','ENOTDIR'].includes(error.code)) throw failure('回收文件未找到或身份异常，请刷新核对；未覆盖任何文件',409);
      throw error;
    });
  }
  async function open(recycleId, body) {
    if (!body || Object.keys(body).length) throw failure('打开回收目录不接受自定义路径',400);
    return serialized(async () => {
      const state = assignIds(await read());
      let path = recycleRoot;
      if (recycleId) {
        const entry = state.trash.find(item => item.recycleId === recycleId);
        if (!entry?.recycle) throw failure('请先整理此笔记',409);
        path = paths(entry).path; await directory(path);
      } else await directory(path,true);
      if (platform !== 'darwin') throw failure('请复制地址，在本机文件管理器打开',503);
      await directory(path); await runOpen(path);
      return { requested:true, path };
    });
  }
  return { list:() => serialized(async () => list(await read())), organize, restore, open };
}

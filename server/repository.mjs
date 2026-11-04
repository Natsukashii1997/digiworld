import { mkdir, open, readFile, rename, lstat } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { stringify, parse } from "../src/serialization.js";
import {
  validateState,
  validateHistory,
  canonical,
  equivalent,
} from "./schema.mjs";
import { mergeBackup } from "./merge.mjs";
import { DatabaseSync } from "node:sqlite";

export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export function failure(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
async function durableWrite(path, content) {
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(content);
    await file.sync();
  } finally {
    await file.close();
  }
}
async function syncDirectory(path) {
  const dir = await open(path, "r");
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
}

export async function openRepository(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await lstat(directory)).isSymbolicLink())
    throw failure("数据目录不能是符号链接", 503);
  await mkdir(join(directory, "snapshots"), { recursive: true, mode: 0o700 });
  // OS-managed SQLite locking releases on crashes. State remains in JSON snapshots.
  const lockPath = join(directory, ".writer-lock.sqlite");
  try {
    if ((await lstat(lockPath)).isSymbolicLink())
      throw failure("锁文件不能是符号链接", 503);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const lock = new DatabaseSync(lockPath);
  try {
    lock.exec("PRAGMA locking_mode = EXCLUSIVE; BEGIN EXCLUSIVE;");
  } catch (error) {
    lock.close();
    throw failure(
      "此数据目录正由另一服务使用，或文件锁不可用。请先关闭另一实例。",
      503,
    );
  }
  let queue = Promise.resolve(),
    closed = false;
  const previews = new Map();
  async function read() {
    let head;
    try {
      head = JSON.parse(
        await readFile(join(directory, "CURRENT.json"), "utf8"),
      );
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw failure(
        "主库指针损坏，已停止读取；请保留 data 目录并从备份恢复。",
        503,
      );
    }
    if (
      !/^\d+-[a-f0-9-]+\.json$/.test(head.file) ||
      !Number.isSafeInteger(head.revision)
    )
      throw failure("主库指针无效，未自动回退旧数据。", 503);
    try {
      const raw = await readFile(
        join(directory, "snapshots", head.file),
        "utf8",
      );
      if (digest(raw) !== head.sha256) throw new Error("checksum");
      const state = parse(raw);
      if (state.revision !== head.revision) throw new Error("revision");
      // 旧快照保留原字节与校验和；在运行态忽略已撤销的银饰字段。
      delete state.silver;
      return validateState(state);
    } catch {
      throw failure(
        "主库快照校验失败，未用旧数据替代。请保留备份后检查。",
        503,
      );
    }
  }
  async function commit(state) {
    const raw = stringify(state),
      file = `${state.revision}-${randomUUID()}.json`;
    await durableWrite(join(directory, "snapshots", file), raw);
    await syncDirectory(join(directory, "snapshots"));
    const pointer = join(directory, `.CURRENT-${randomUUID()}.tmp`);
    await durableWrite(
      pointer,
      JSON.stringify({ file, revision: state.revision, sha256: digest(raw) }),
    );
    await rename(pointer, join(directory, "CURRENT.json"));
    await syncDirectory(directory);
    return read();
  }
  function serial(operation) {
    if (closed) return Promise.reject(failure("主库已关闭", 503));
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }
  return {
    directory,
    read,
    withSnapshot({ expectedRevision } = {}, operation) {
      return serial(async () => {
        const stored = await read();
        if (!stored) throw failure("请先打开工作台初始化资产库", 409);
        if (
          expectedRevision !== undefined &&
          expectedRevision !== stored.revision
        )
          throw failure("主库已变化，请刷新后重新预览确认", 409);
        // Coordinates target edits without coupling an external file write to a
        // subsequent main-database commit. The operation owns its durable journal.
        return operation(stored);
      });
    },
    updateNotes(update) {
      return serial(async () => {
        const stored = await read();
        if (!stored) throw failure("请先打开工作台初始化资产库", 409);
        const notes = update(structuredClone(stored.notes));
        if (equivalent(notes, stored.notes)) return stored;
        const state = { ...stored, notes, revision: stored.revision + 1 };
        validateState(state); validateHistory(stored, state);
        return commit(state);
      });
    },
    updateReverseSkill(update) {
      return serial(async () => {
        const stored = await read(); if (!stored) throw failure('请先初始化资产库',409);
        const result = await update(structuredClone(stored));
        if (equivalent(result, stored)) return stored;
        // Skill 草稿采纳（#55）同一次写入里把回执标为已采纳，所以这里也放行 reverseReports（仍受回执历史守卫约束）。
        const state = {...stored, assets:result.assets, reverseRecords:result.reverseRecords, ...(result.reverseReports!==undefined?{reverseReports:result.reverseReports}:{}), revision:stored.revision+1};
        validateState(state); validateHistory(stored,state,{allowReverseSkill:true,allowReverseReports:true}); return commit(state);
      });
    },
    updateReverse(update, { expectedRevision } = {}) {
      return serial(async () => {
        const stored = await read();
        if (!stored) throw failure("请先初始化资产库", 409);
        if (expectedRevision !== undefined && expectedRevision !== stored.revision) throw failure("记录已变化，请刷新后重试", 409);
        const reverseRecords = await update(structuredClone(stored.reverseRecords || []));
        if (equivalent(reverseRecords, stored.reverseRecords || [])) return stored;
        const state = { ...stored, reverseRecords, revision: stored.revision + 1 };
        validateState(state); validateHistory(stored, state, { allowReverseService: true });
        return commit(state);
      });
    },
    updateAssets(update, { expectedRevision, allowAssetDelete = false, restrictAssetDeletion = false } = {}) {
      return serial(async () => {
        const stored = await read();
        if (!stored) throw failure("请先打开工作台初始化资产库", 409);
        if (expectedRevision !== stored.revision)
          throw failure("主库已变化，请刷新后重新预览确认", 409);
        const assets = await update(stored.assets, stored);
        if (equivalent(assets, stored.assets)) return stored;
        const state = { ...stored, assets, revision: stored.revision + 1 };
        validateState(state);
        validateHistory(stored, state, { allowOrigins: true, allowAssetDelete, restrictAssetDeletion });
        return commit(state);
      });
    },
    updateSkillSourceAdoptions(update, {expectedRevision} = {}) {
      return serial(async()=>{
        const stored=await read();if(!stored)throw failure("请先初始化资产库",409);
        if(expectedRevision!==stored.revision)throw failure("主库已变化，请重新核验来源后确认",409);
        const skillSourceAdoptions=await update(stored.skillSourceAdoptions||[],stored);
        if(equivalent(skillSourceAdoptions,stored.skillSourceAdoptions||[]))return stored;
        const state={...stored,skillSourceAdoptions,revision:stored.revision+1};
        validateState(state);validateHistory(stored,state,{allowSkillSourceAdoptions:true});return commit(state);
      });
    },
    updateActivity(update, { expectedRevision } = {}) {
      return serial(async () => {
        const stored = await read();
        if (!stored) throw failure("请先初始化资产库", 409);
        const assetActivity = await update(stored.assetActivity || [], stored);
        if (equivalent(assetActivity, stored.assetActivity || [])) return stored;
        if (expectedRevision !== stored.revision)
          throw failure("主库已变化，请查询后补记", 409);
        const state = { ...stored, assetActivity, revision: stored.revision + 1 };
        validateState(state);
        validateHistory(stored, state, { allowActivity: true });
        return commit(state);
      });
    },
    // 协同操作留痕（切片 2.3/2.4）：只追加。复制已在浏览器完成，不以 revision 冲突拒记；
    // 追加只改 collabLog，其余内容原样保留，由 validateHistory 保证。
    updateCollab(update) {
      return serial(async () => {
        const stored = await read();
        if (!stored) throw failure("请先初始化资产库", 409);
        const collabLog = await update(stored.collabLog || [], stored);
        if (equivalent(collabLog, stored.collabLog || [])) return stored;
        const state = { ...stored, collabLog, revision: stored.revision + 1 };
        validateState(state);
        validateHistory(stored, state, { allowCollab: true });
        return commit(state);
      });
    },
    // 项目桌（阶段 2）：只改 projectDesk；结果与原样相同（重复投递、重复装备）不写主库。
    updateProjectDesk(update) {
      return serial(async () => {
        const stored = await read();
        if (!stored) throw failure("请先初始化资产库", 409);
        const projectDesk = await update(structuredClone(stored.projectDesk || []), stored);
        if (equivalent(projectDesk, stored.projectDesk || [])) return stored;
        const state = { ...stored, projectDesk, revision: stored.revision + 1 };
        validateState(state);
        validateHistory(stored, state, { allowProjectDesk: true });
        return commit(state);
      });
    },
    // 逆向回执（v5）：只改 reverseReports，采纳时连带改对应记录的八格与轮次；同一结果不写主库。
    updateReverseReports(update, { expectedRevision } = {}) {
      return serial(async () => {
        const stored = await read();
        if (!stored) throw failure("请先初始化资产库", 409);
        if (expectedRevision !== undefined && expectedRevision !== stored.revision) throw failure("记录已变化，请刷新后重试", 409);
        const patch = await update(structuredClone(stored));
        if (Object.keys(patch).some((k) => !["reverseReports", "reverseRecords"].includes(k))) throw failure("逆向回执更新字段无效");
        const state = { ...stored, ...patch, revision: stored.revision + 1 };
        if (equivalent(state.reverseReports, stored.reverseReports) && equivalent(state.reverseRecords, stored.reverseRecords)) return stored;
        validateState(state);
        validateHistory(stored, state, { allowReverseReports: true });
        return commit(state);
      });
    },
    // 每日项目简报的已读状态（项目空间第二批）：只改 briefReads；同一内容重复标记不写主库。
    updateBriefReads(update) {
      return serial(async () => {
        const stored = await read();
        if (!stored) throw failure("请先初始化资产库", 409);
        const briefReads = await update(stored.briefReads || [], stored);
        if (equivalent(briefReads, stored.briefReads || [])) return stored;
        const state = { ...stored, briefReads, revision: stored.revision + 1 };
        validateState(state);
        validateHistory(stored, state, { allowBriefs: true });
        return commit(state);
      });
    },
    updateKnowledge(update, { expectedRevision, allowNoop = false } = {}) {
      return serial(async () => {
        const stored = await read();
        if (!stored) throw failure("请先打开工作台初始化资产库", 409);
        if (!allowNoop && expectedRevision !== stored.revision)
          throw failure("主库已变化，请刷新后重试知识整理", 409);
        const knowledgeTasks = await update(
          stored.knowledgeTasks || [],
          stored,
        );
        if (equivalent(knowledgeTasks, stored.knowledgeTasks || []))
          return stored;
        if (expectedRevision !== stored.revision)
          throw failure("主库已变化，请刷新后重试知识整理", 409);
        const state = {
          ...stored,
          knowledgeTasks,
          revision: stored.revision + 1,
        };
        validateState(state);
        validateHistory(stored, state, { allowKnowledge: true });
        return commit(state);
      });
    },
    // 学习成长书架文件夹（切片 5.4）：只有这里可以改 learning.folders，调用方负责先校验路径。
    updateLearning(update, { expectedRevision } = {}) {
      return serial(async () => {
        const stored = await read();
        if (!stored) throw failure("请先打开工作台初始化资产库", 409);
        if (expectedRevision !== stored.revision)
          throw failure("主库已变化，请刷新后重试", 409);
        const learning = await update(
          stored.learning || { folders: [], books: [], links: [] },
          stored,
        );
        const state = { ...stored, learning, revision: stored.revision + 1 };
        validateState(state);
        validateHistory(stored, state, { allowLearningFolders: true });
        return commit(state);
      });
    },
    // 三区规则、个人说明共享授权与修改建议（切片 3.2/3.3）。expectedRevision 缺省时不核对版本
    // （MCP 提交建议没有页面版本），更新本身仍在串行队列里基于最新快照进行。
    updateProfile(update, { expectedRevision } = {}) {
      return serial(async () => {
        const stored = await read();
        if (!stored) throw failure("请先打开工作台初始化资产库", 409);
        if (
          expectedRevision !== undefined &&
          expectedRevision !== stored.revision
        )
          throw failure("主库已变化，请刷新后重试", 409);
        const { knowledgeZones, profileProposals } = await update(stored);
        const state = { ...stored, revision: stored.revision + 1 };
        if (knowledgeZones !== undefined) state.knowledgeZones = knowledgeZones;
        if (profileProposals !== undefined)
          state.profileProposals = profileProposals;
        if (
          equivalent(state.knowledgeZones, stored.knowledgeZones) &&
          equivalent(state.profileProposals, stored.profileProposals)
        )
          return stored;
        validateState(state);
        validateHistory(stored, state, { allowProfile: true });
        return commit(state);
      });
    },
    // Knowledge scope mutations atomically revoke overlapping grants and the
    // independent profile grant; general workspace saves cannot write these.
    updateKnowledgeAccess(update, { expectedRevision } = {}) {
      return serial(async () => {
        const stored = await read();
        if (!stored) throw failure("请先初始化资产库",409);
        if(expectedRevision !== undefined && expectedRevision !== stored.revision) throw failure("主库已变化，请刷新后重新确认范围",409);
        const patch = await update(stored);
        if(Object.keys(patch).some(k=>!["connections","knowledgeZones"].includes(k)))throw failure("知识权限更新字段无效");
        const state={...stored,...patch,revision:stored.revision+1};
        if(equivalent(state.connections,stored.connections)&&equivalent(state.knowledgeZones,stored.knowledgeZones))return stored;
        validateState(state);validateHistory(stored,state,{allowConnections:true,allowProfile:true});return commit(state);
      });
    },
    updateConnections(update, { expectedRevision } = {}) {
      return serial(async () => {
        const stored = await read();
        if (!stored) throw failure("请先打开工作台初始化资产库", 409);
        if (
          expectedRevision !== undefined &&
          expectedRevision !== stored.revision
        )
          throw failure("另一个页面已更新主库，请刷新后重新确认连接", 409);
        const state = {
          ...stored,
          connections: await update(stored.connections),
          revision: stored.revision + 1,
        };
        validateState(state);
        validateHistory(stored, state, { allowConnections: true });
        return commit(state);
      });
    },
    async previewImport(input) {
      const stored = await read();
      const { summary } = mergeBackup(stored, input);
      const token = randomUUID();
      for (const [key, value] of previews)
        if (value.expires < Date.now()) previews.delete(key);
      if (previews.size >= 20) previews.delete(previews.keys().next().value);
      previews.set(token, {
        revision: stored?.revision ?? 0,
        hash: digest(JSON.stringify(canonical(input))),
        expires: Date.now() + 300000,
      });
      return {
        token,
        summary,
        revision: stored?.revision ?? 0,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      };
    },
    importBackup(input, token) {
      return serial(async () => {
        const stored = await read(),
          preview = previews.get(token);
        if (
          !preview ||
          preview.expires < Date.now() ||
          preview.revision !== (stored?.revision ?? 0) ||
          preview.hash !== digest(JSON.stringify(canonical(input)))
        )
          throw failure("导入预览已过期或主库已变化，请重新预览后确认。", 409);
        const { state } = mergeBackup(stored, input);
        validateHistory(stored, state, {
          allowReverseImport: true,
          allowOrigins: true,
          allowKnowledge: true,
          allowActivity: true,
          allowCollab: true,
          allowProfile: true,
          allowCandidateImport: true,
          allowSkillSourceAdoptions: true,
          allowProjectDesk: true,
          allowReverseReports: true,
        });
        const result = await commit({
          ...state,
          revision: (stored?.revision ?? 0) + 1,
        });
        previews.delete(token);
        return result;
      });
    },
    write(state, { initialize = false, restrictAssetDeletion = false } = {}) {
      return serial(async () => {
        const stored = await read();
        if (initialize && stored) return stored;
        // 旧客户端或旧导出可能仍携带银饰字段；保存时丢弃，不让它回到当前主库。
        const active = { ...state };
        delete active.silver;
        validateState(active);
        if (!initialize && (active.revision ?? 0) !== (stored?.revision ?? 0))
          throw Object.assign(failure(
            "另一个页面已更新主库，本次没有覆盖。请先保留未保存内容，再刷新。",
            409,
          ), {revisionConflict:true});
        validateHistory(stored, active, { restrictAssetDeletion });
        return commit({ ...active, revision: (stored?.revision ?? 0) + 1 });
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      await queue;
      lock.close();
    },
  };
}

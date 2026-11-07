// 本机登记从名册派生（issue #73）：把 digital-twin/projects.json 里每个项目落成一条 connections.projects 记录。
// 这是派生的只读缓存，不是用户可编辑的数据：只有本模块按名册写，整库 PUT 仍对 projects 保留主库原值（#71）。
// - 记录以名册 id 为稳定键（rosterId）；旧记录里路径与名册相同的，就地补 rosterId 并改名，其余字段（含置顶 active）不动。
// - 名册外的旧记录原样保留；名册里删掉的项目，记录不删，只标 rosterRemoved，免得丢置顶与接力历史。
// - 没有变化不写库、不升版本；有变化走 repository.updateConnections（版本检查、校验），写后回读核对。
// - 只在服务启动时和「按名册刷新」时同步，不在读页面时写库。
import fs from "node:fs/promises";
import { resolve } from "node:path";
import { digest, failure } from "./repository.mjs";
import { equivalent } from "./schema.mjs";
import { DEFAULT_ROSTER_PATH, readRoster as readRosterFile } from "./project-roster.mjs";
import { inspectProjectLocation } from "./project-scan.mjs";

const RECORD_ID = /^[a-zA-Z0-9_-]{1,93}$/;
const DETAILS = ["repoKey", "branch", "kind"];
// 记录 ID 要满足主库的记录 ID 格式（字母数字、_、-，最长 100）；名册 id 允许点号，带点号时改用摘要。
export const rosterRecordId = (rosterId) =>
  `roster-${RECORD_ID.test(rosterId) ? rosterId : digest(rosterId).slice(0, 24)}`;

// 只读核对单个目录（复用项目扫描的单目录检查）：认得出是项目才取 Git 远端、分支、类型；核不了就留空。
export async function inspectRosterPath(path, options = {}) {
  try {
    const o = await inspectProjectLocation([path], path, options);
    if (o.status !== "present") return {};
    return Object.fromEntries(DETAILS.filter((k) => o[k]).map((k) => [k, o[k]]));
  } catch {
    return {};
  }
}

const samePath = (record, wanted) => (record.localPaths || []).some((p) => wanted.has(resolve(p)));

// 按名册算出新的 projects 列表与变化清单；只在新记录或缺字段时检查目录。不写库。
export async function planRosterSync(projects = [], roster, { realpath, inspect }) {
  const next = projects.map((p) => ({ ...p }));
  const changes = { added: [], linked: [], renamed: [], moved: [], restored: [], removed: [] };
  const listed = new Set(roster.map((e) => e.id));
  for (const entry of roster) {
    const real = await realpath(entry.path).catch(() => null);
    const wanted = new Set([entry.path, real].filter(Boolean).map((p) => resolve(p)));
    let record = next.find((p) => p.rosterId === entry.id);
    if (!record) {
      record = next.find((p) => !p.rosterId && samePath(p, wanted));
      if (record) {
        record.rosterId = entry.id;
        changes.linked.push(entry.id);
      }
    }
    if (!record) {
      const id = rosterRecordId(entry.id);
      if (next.some((p) => p.id === id)) throw failure(`本机登记里已有记录 ${id}，与名册项目 ${entry.id} 冲突，没有同步`, 409);
      record = { id, rosterId: entry.id, name: entry.name, localPaths: [entry.path] };
      next.push(record);
      changes.added.push(entry.id);
    } else {
      if (record.name !== entry.name && !changes.linked.includes(entry.id)) changes.renamed.push(entry.id);
      record.name = entry.name;
      // 名册里改了路径：把新路径排到第一位（读状态、Git 用第一位），旧路径与目录观测留着。
      if (!samePath(record, wanted)) {
        record.localPaths = [entry.path, ...(record.localPaths || [])];
        changes.moved.push(entry.id);
      }
      if (record.rosterRemoved) {
        delete record.rosterRemoved;
        changes.restored.push(entry.id);
      }
    }
    if (DETAILS.some((k) => record[k] === undefined)) {
      const found = await inspect(entry.path);
      if (!found.repoKey && entry.github) found.repoKey = entry.github.toLowerCase();
      for (const k of DETAILS) if (record[k] === undefined && found[k]) record[k] = found[k];
    }
  }
  for (const record of next)
    if (record.rosterId && !listed.has(record.rosterId) && !record.rosterRemoved) {
      record.rosterRemoved = true;
      changes.removed.push(record.rosterId);
    }
  return { projects: next, changes, legacy: next.filter((p) => !p.rosterId).length };
}

export function createRosterSync(repository, {
  rosterPath = DEFAULT_ROSTER_PATH,
  readRoster = readRosterFile,
  // 主库还没有任何连接时用的空连接（正式服务传入带默认扫描目录的那份）。
  initialConnections = () => ({
    roots: [], projects: [], agents: [], github: { status: "not_connected", login: "", message: "", at: "" },
    projectScannedAt: "", agentScannedAt: "", errors: [], truncated: false,
  }),
  filesystem = fs,
  inspect = inspectRosterPath,
  attempts = 3,
} = {}) {
  return {
    async sync(input = {}) {
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((k) => k !== "revision"))
        throw failure("请求包含不支持的字段");
      if (input.revision !== undefined && (!Number.isSafeInteger(input.revision) || input.revision < 0))
        throw failure("主库版本无效，请刷新");
      const roster = await readRoster(rosterPath);
      if (roster.state !== "ok") return { state: "error", path: roster.path, message: roster.message };
      for (let attempt = 1; ; attempt++) {
        const stored = await repository.read();
        if (!stored) return { state: "skipped", message: "主库还没初始化，没有同步" };
        if (input.revision !== undefined && attempt === 1 && stored.revision !== input.revision)
          throw failure("主库已变化，请刷新后再按名册刷新", 409);
        const connections = stored.connections || initialConnections();
        const plan = await planRosterSync(connections.projects || [], roster.projects, { realpath: (p) => filesystem.realpath(p), inspect });
        const summary = { roster: { path: roster.path, skipped: roster.skipped }, ...plan.changes, legacy: plan.legacy };
        if (stored.connections && equivalent(plan.projects, connections.projects))
          return { state: "unchanged", revision: stored.revision, ...summary };
        try {
          // 只在主库仍是刚才读到的版本时写；其间被别处改过就按新版本重算（最多 3 次）。
          await repository.updateConnections(() => ({ ...connections, projects: plan.projects }), { expectedRevision: stored.revision });
        } catch (error) {
          if (error.status === 409 && attempt < attempts) continue;
          throw error;
        }
        const after = await repository.read();
        if (!equivalent(after?.connections?.projects, plan.projects)) throw failure("名册同步结果回读不一致，请刷新后再看", 500);
        return { state: "updated", revision: after.revision, ...summary };
      }
    },
  };
}

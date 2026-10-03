// 路线 v3 切片 2.3（协同看板 + 模板 #1 + 操作留痕 v1）与 2.4（一键派发 / 一键开工的留痕）。
// 看板全部只读：阶段与“笔在谁手上”只从项目 CURRENT.md 的协作状态表与带 state_id 的节标题推断；
// 交接文档只列 docs/agents/handoffs/*.md 的文件名与修改时间，不读正文。推断不了就是“未知”。
// 唯一的写入是“口令已复制”的留痕：只追加到本机主库 collabLog，不存口令正文。
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { failure } from "./repository.mjs";
import { STAGES } from "../src/collab.js";
import { equivalent } from "./schema.mjs";
import {
  parseCurrentStatus,
  readCurrentFile,
  resolveProjectRoot,
} from "./project-status.mjs";
import {
  COLLAB_AGENT_IDS,
  COLLAB_KINDS,
  COLLAB_STAGE_IDS,
  STATE_ID,
} from "./collab-schema.mjs";

export const HEADINGS_READ_LIMIT = 1024 * 1024;
export const HANDOFF_DIR = "docs/agents/handoffs";
const HANDOFF_LIMIT = 1000;
const HEADING_LIMIT = 500;
const TITLE_LIMIT = 300;

// 模板 #1（Claude×Codex 串行接力）的真实流程：认领 → 实现 → 独立复核 → 返修 → 用户验收。
// 阶段定义与浏览器端共用一份（src/collab.js）。
export { STAGES };
// 关键词按优先级排列：一句话里同时出现时，靠后的流程步骤说明得更具体（例如“返修复核认领”是复核）。
const KEYWORDS = [
  ["accept", /验收|acceptance/i],
  ["review", /复核|审查|评审|review/i],
  ["rework", /返修|修复|rework|\bfix\b/i],
  ["implement", /实现|开发|切片|implement/i],
  ["claim", /认领|claim/i],
];
const UNKNOWN = { id: "unknown", label: "未知", basis: "", keyword: "" };

const strip = (value) =>
  String(value ?? "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
// 空闲：整项为“无”等；或“无”等后紧跟分隔符再写释放说明（如“无；Claude 交接113后释放”，C5-F1）。
// 只认开头这一个词加分隔符：“无法…”“Codex；无人复核”仍按持笔处理。
const IDLE = /^[（(]?\s*(无|无人|没有|空闲|none|n\/a|—|-|–)\s*[)）]?\s*(?:$|[；;，,。:：（(])/i;

function stageOfText(value) {
  // “复核项修复”“复核意见”说的是返修的对象，不是在复核。
  const text = strip(value).replace(/复核(项|意见|结论|发现)/g, "");
  if (!text) return null;
  for (const [id, pattern] of KEYWORDS) {
    const match = text.match(pattern);
    if (match) return { id, keyword: match[0] };
  }
  return null;
}

// 依次看：当前写入者（为“无”时跳过）→ 最新状态标题 → 最新交接的链接文字。第一处有关键词的决定阶段。
export function inferStage({ writer, heading, handoff } = {}) {
  const sources = [
    ["当前写入者", IDLE.test(strip(writer)) ? "" : writer],
    ["最新状态标题", heading],
    ["最新交接", handoff],
  ];
  for (const [basis, value] of sources) {
    const found = stageOfText(value);
    if (found) {
      const stage = STAGES.find((s) => s.id === found.id);
      return { id: stage.id, label: stage.label, basis, keyword: found.keyword };
    }
  }
  return { ...UNKNOWN };
}

const AGENTS = [
  ["Codex", /codex/i],
  ["Claude", /claude/i],
  ["Hermes", /hermes/i],
  ["用户", /用户/],
];
function firstAgent(text) {
  let best = null;
  for (const [name, pattern] of AGENTS) {
    const at = text.search(pattern);
    if (at !== -1 && (!best || at < best.at)) best = { name, at };
  }
  return best?.name || "";
}

// 笔在谁手上：当前写入者里最先出现的 Agent 名；“无”为空闲；没有这一项为未知。
export function penHolder(writer) {
  const text = strip(writer);
  if (!text) return { state: "unknown", agent: "", text: "" };
  if (IDLE.test(text)) return { state: "idle", agent: "", text };
  return { state: "held", agent: firstAgent(text), text };
}

const HEADING_STATE = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]{0,9})-(\d{8})-(\d{1,6})(?![0-9])/;

// 只认 Markdown 标题行里的 state_id（如“## Claude 返修（WB-20260930-14）”）。表格与正文不算。
export function parseStateHeadings(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!heading) continue;
    const title = strip(heading[1]);
    const id = title.match(HEADING_STATE);
    if (!id) continue;
    const [, , ymd, seq] = id;
    out.push({
      stateId: id[0],
      title: title.length > TITLE_LIMIT ? title.slice(0, TITLE_LIMIT) + "…" : title,
      date: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`,
      seq: Number(seq),
      agent: firstAgent(title),
      stage: stageOfText(title)?.id || "unknown",
    });
    if (out.length >= HEADING_LIMIT) break;
  }
  return out;
}

// 最新一节：与表头 state_id 相同的那节优先；否则取编号（日期、序号）最大者，同号取文件中靠后的。
export function latestHeading(headings, stateId) {
  if (!headings?.length) return null;
  const same = headings.filter((h) => h.stateId === stateId);
  if (same.length) return same.at(-1);
  let best = null;
  for (const h of headings)
    if (!best || h.date > best.date || (h.date === best.date && h.seq >= best.seq))
      best = h;
  return best;
}

// 标题链需要看到整份 CURRENT（本项目的最新一节在 81 KB 的末尾），上限 1 MiB；读取方式与状态卡相同。
export async function readStateHeadings(root, path) {
  const file = await readCurrentFile(root, path, HEADINGS_READ_LIMIT);
  if (file.state !== "read") return { state: file.state, headings: [], ...(file.message ? { message: file.message } : {}) };
  return {
    state: "read",
    text: file.text,
    truncated: file.truncated,
    modifiedAt: file.modifiedAt,
    headings: parseStateHeadings(file.text),
  };
}

const handoffAgent = (name) =>
  /codex/i.test(name)
    ? "Codex"
    : /cloud/i.test(name)
      ? "Claude Code 云端"
      : /claude/i.test(name)
        ? "Claude"
        : /hermes/i.test(name)
          ? "Hermes"
          : "";

// 交接文档索引：只取文件名与修改时间，不打开文件。路径上的每一级都不能是符号链接。
export async function readHandoffIndex(root) {
  let dir = root;
  try {
    for (const part of HANDOFF_DIR.split("/")) {
      dir = join(dir, part);
      const info = await lstat(dir);
      if (info.isSymbolicLink())
        return { state: "error", files: [], message: "交接目录经过符号链接，不读取" };
      if (!info.isDirectory())
        return { state: "error", files: [], message: "交接目录不是目录" };
    }
  } catch (e) {
    if (["ENOENT", "ENOTDIR"].includes(e.code)) return { state: "absent", files: [] };
    return { state: "error", files: [], message: "交接目录无法读取" };
  }
  try {
    const names = (await readdir(dir, { withFileTypes: true }))
      .filter(
        (e) =>
          e.isFile() &&
          e.name.endsWith(".md") &&
          !e.name.startsWith(".") &&
          !/[\x00-\x1f\x7f]/.test(e.name),
      )
      .map((e) => e.name)
      .sort()
      .reverse();
    const files = [];
    for (const name of names.slice(0, HANDOFF_LIMIT)) {
      const info = await lstat(join(dir, name));
      if (!info.isFile()) continue;
      const date = name.match(/^(\d{4}-\d\d-\d\d)/)?.[1] || "";
      files.push({
        name,
        date,
        agent: handoffAgent(name),
        modifiedAt: info.mtime.toISOString(),
      });
    }
    return { state: "ok", files, truncated: names.length > HANDOFF_LIMIT };
  } catch {
    return { state: "error", files: [], message: "交接目录无法读取" };
  }
}

async function existing(root, names) {
  const out = [];
  for (const name of names) {
    try {
      const info = await lstat(join(root, name));
      if (info.isFile()) out.push(name);
    } catch {}
  }
  return out;
}

function exactKeys(input, allowed) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !allowed.includes(k))
  )
    throw failure("请求包含不支持的字段");
}

export function createCollabBoard(repository, { clock = Date.now } = {}) {
  async function boardItem(project, connections, records) {
    const item = {
      projectId: project.id,
      name: project.name,
      root: "",
      entryFiles: [],
      current: { state: "error", path: "CURRENT.md" },
      stage: { ...UNKNOWN },
      pen: { state: "unknown", agent: "", text: "" },
      latestHeading: null,
      states: [],
      statesTruncated: false,
      handoffs: { state: "absent", files: [] },
      records: records.filter((r) => r.projectId === project.id),
    };
    const resolved = await resolveProjectRoot(project, connections);
    item.root = resolved.root;
    if (resolved.error) {
      item.current.message = resolved.error;
      item.handoffs = { state: "error", files: [], message: resolved.error };
      return item;
    }
    const { canonical, path } = resolved;
    const file = await readStateHeadings(canonical, path);
    if (file.state === "read") {
      const parsed = parseCurrentStatus(file.text);
      item.current = {
        ...parsed,
        path,
        modifiedAt: file.modifiedAt,
        truncated: file.truncated,
      };
      item.states = file.headings;
      item.statesTruncated = file.truncated;
      item.latestHeading = latestHeading(file.headings, parsed.fields.stateId);
      item.pen = penHolder(parsed.fields.writer);
      item.stage = inferStage({
        writer: parsed.fields.writer,
        heading: item.latestHeading?.title,
        handoff: parsed.fields.handoff?.text,
      });
    } else
      item.current = {
        state: file.state,
        path,
        ...(file.message ? { message: file.message } : {}),
      };
    // 口令里的“先读”只列真实存在的入口文件；CURRENT 按实际路径。
    item.entryFiles = await existing(canonical, [
      "AGENTS.md",
      "CLAUDE.md",
      ...(file.state === "read" ? [path] : []),
      "COLLABORATION.md",
    ]);
    item.handoffs = await readHandoffIndex(canonical);
    return item;
  }
  return {
    async board(input = {}) {
      exactKeys(input, []);
      const state = await repository.read();
      const connections = state?.connections;
      const active = (connections?.projects || []).filter((p) => p.active === true);
      const records = state?.collabLog || [];
      const items = [];
      for (const project of active)
        items.push(await boardItem(project, connections, records));
      return { at: new Date(clock()).toISOString(), stages: STAGES, items };
    },
    // 浏览器复制口令成功后调用。只记事实：谁、哪个项目、给哪个 Agent、口令指纹；时间由服务端生成。
    async record(input) {
      exactKeys(input, [
        "id",
        "kind",
        "projectId",
        "agent",
        "stateId",
        "stage",
        "promptSha256",
      ]);
      if (typeof input.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.id))
        throw failure("留痕 ID 无效");
      if (!COLLAB_KINDS.includes(input.kind)) throw failure("留痕种类无效");
      if (!COLLAB_AGENT_IDS.includes(input.agent))
        throw failure("只能派给 Codex、Claude Code 或 Hermes");
      if (typeof input.projectId !== "string") throw failure("请选择项目");
      if (input.stateId !== undefined && (typeof input.stateId !== "string" || !STATE_ID.test(input.stateId)))
        throw failure("状态编号无效");
      if (input.stage !== undefined && !COLLAB_STAGE_IDS.includes(input.stage))
        throw failure("流程阶段无效");
      if (typeof input.promptSha256 !== "string" || !/^[a-f0-9]{64}$/.test(input.promptSha256))
        throw failure("口令指纹无效");
      let saved;
      const state = await repository.updateCollab((records, stored) => {
        const old = records.find((r) => r.id === input.id);
        if (old) {
          const { at, schema, projectName, ...identity } = old;
          if (!equivalent(identity, input))
            throw failure("留痕 ID 已被不同操作使用", 409);
          saved = old;
          return records;
        }
        const project = stored.connections?.projects.find(
          (p) => p.id === input.projectId,
        );
        if (!project) throw failure("项目已不存在，请重新扫描", 404);
        saved = {
          schema: 1,
          ...input,
          projectName:
            project.name.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 200) ||
            project.id,
          at: new Date(clock()).toISOString(),
        };
        return [...records, saved];
      });
      return { state, record: saved };
    },
  };
}

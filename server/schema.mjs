import { validateActivity, validateActivityHistory } from "./asset-activity-schema.mjs";
import { validateCollabLog, validateCollabHistory } from "./collab-schema.mjs";
import { safePath } from "../src/store.js";
import { stringify } from "../src/serialization.js";
import { retainedDemoIds } from "../src/asset-origin.js";
import {
  validateKnowledgeTasks,
  validateKnowledgeHistory,
} from "./knowledge-compilation-schema.mjs";
export function invalid(message) {
  throw Object.assign(new Error(`数据校验失败：${message}`), { status: 400 });
}
const object = (v, label) => {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    v instanceof Uint8Array
  )
    invalid(label);
};
const text = (v, label, max = 1000000) => {
  if (typeof v !== "string" || v.length > max) invalid(label);
};
const id = (v) => {
  if (typeof v !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(v))
    invalid("记录 ID");
};
const date = (v) => {
  if (typeof v !== "string" || v.length > 40 || !Number.isFinite(Date.parse(v)))
    invalid("时间格式");
};
const array = (v, label, max = 5000) => {
  if (!Array.isArray(v) || v.length > max) invalid(label);
};
const keys = (v, allowed) => {
  object(v, "对象");
  if (Object.keys(v).some((k) => !allowed.includes(k)))
    invalid("包含不支持的字段");
};
const unique = (list, label) => {
  if (new Set(list).size !== list.length) invalid(`${label}重复`);
};
const httpUrl = (v) => {
  if (!v) return;
  try {
    const url = new URL(v);
    if (!["http:", "https:"].includes(url.protocol)) invalid("链接协议");
  } catch {
    invalid("链接格式");
  }
};
// 除换行与制表符外的控制字符。
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/;
const NOTE_MAX = 20000;
// 焚决（路线 v3 切片 1.3）：顶层集合 scrolls。卷与条目都是可变记录，不做版本；
// 删除写 deletedAt 进回收区；数组顺序即条目顺序。旧库缺失该集合时按空处理。
export const SCROLL_LIMITS = {
  scrolls: 200,
  entries: 2000,
  totalEntries: 20000,
  name: 60,
  text: 20000,
  tags: 12,
  tag: 24,
};
const optionalDate = (v) => {
  if (v !== undefined) date(v);
};
export function validateScrolls(scrolls) {
  array(scrolls, "焚决卷数", SCROLL_LIMITS.scrolls);
  unique(
    scrolls.map((s) => s?.id),
    "卷 ID",
  );
  const entryIds = [];
  for (const s of scrolls) {
    keys(s, ["id", "name", "pinned", "createdAt", "updatedAt", "deletedAt", "entries"]);
    id(s.id);
    text(s.name, "卷名", SCROLL_LIMITS.name);
    if (!s.name.trim() || CONTROL.test(s.name) || /[\n\t]/.test(s.name))
      invalid("卷名");
    if (typeof s.pinned !== "boolean") invalid("卷置顶状态");
    date(s.createdAt);
    optionalDate(s.updatedAt);
    optionalDate(s.deletedAt);
    array(s.entries, "焚决条目数", SCROLL_LIMITS.entries);
    for (const e of s.entries) {
      keys(e, [
        "id",
        "text",
        "tags",
        "uses",
        "createdAt",
        "updatedAt",
        "deletedAt",
        "lastUsedAt",
      ]);
      id(e.id);
      entryIds.push(e.id);
      text(e.text, "条目正文", SCROLL_LIMITS.text);
      if (!e.text.trim() || CONTROL.test(e.text)) invalid("条目正文");
      array(e.tags, "条目标签", SCROLL_LIMITS.tags);
      for (const t of e.tags)
        if (
          typeof t !== "string" ||
          !t ||
          t.length > SCROLL_LIMITS.tag ||
          /[\s,，、\x00-\x1f\x7f]/.test(t)
        )
          invalid("条目标签");
      unique(e.tags, "条目标签");
      if (!Number.isSafeInteger(e.uses) || e.uses < 0 || e.uses > 1e9)
        invalid("条目计次");
      date(e.createdAt);
      optionalDate(e.updatedAt);
      optionalDate(e.deletedAt);
      optionalDate(e.lastUsedAt);
    }
  }
  if (entryIds.length > SCROLL_LIMITS.totalEntries) invalid("焚决条目总量");
  unique(entryIds, "条目 ID");
}
// 学习成长（路线 v3 切片 5.4）：顶层集合 learning = { folders, books, links }。旧库缺失按空处理。
// folders 是允许只读索引的书架文件夹，只能经专用操作修改（见 validateHistory）；books 只记学习状态，不存原件；
// links 是链接收藏（手动或来自 AI HOT），删除写 deletedAt 进回收区；同一链接只收藏一次。
export const LEARNING_LIMITS = {
  folders: 10,
  books: 5000,
  links: 2000,
  path: 2000,
  name: 255,
  title: 200,
  summary: 1000,
  source: 80,
  url: 2000,
};
export const LEARNING_STATUS = ["want", "learning", "done"];
const absolutePath = (v, label) => {
  text(v, label, LEARNING_LIMITS.path);
  if (!v.startsWith("/") || /[\x00-\x1f\x7f]/.test(v)) invalid(label);
};
const line = (v, label, max, required = true) => {
  text(v, label, max);
  if ((required && !v.trim()) || /[\x00-\x1f\x7f]/.test(v)) invalid(label);
};
export function validateLearning(learning) {
  if (!learning || typeof learning !== "object" || Array.isArray(learning)) invalid("学习成长");
  keys(learning, ["folders", "books", "links"]);
  array(learning.folders, "书架文件夹数", LEARNING_LIMITS.folders);
  array(learning.books, "学习状态记录数", LEARNING_LIMITS.books);
  array(learning.links, "链接收藏数", LEARNING_LIMITS.links);
  unique(learning.folders.map((f) => f?.id), "书架文件夹 ID");
  for (const f of learning.folders) {
    keys(f, ["id", "path", "addedAt"]);
    id(f.id);
    absolutePath(f.path, "书架目录");
    date(f.addedAt);
  }
  unique(learning.folders.map((f) => f.path), "书架目录");
  unique(learning.books.map((b) => b?.id), "书 ID");
  for (const b of learning.books) {
    keys(b, ["id", "root", "path", "name", "status", "updatedAt"]);
    id(b.id);
    absolutePath(b.root, "书架目录");
    if (!safePath(b.path) || b.path.length > LEARNING_LIMITS.path || /[\x00-\x1f\x7f]/.test(b.path))
      invalid("书的路径");
    line(b.name, "书名", LEARNING_LIMITS.name);
    if (!LEARNING_STATUS.includes(b.status)) invalid("学习状态");
    date(b.updatedAt);
  }
  unique(learning.links.map((l) => l?.id), "链接 ID");
  for (const l of learning.links) {
    keys(l, [
      "id",
      "title",
      "url",
      "summary",
      "source",
      "origin",
      "status",
      "createdAt",
      "updatedAt",
      "deletedAt",
    ]);
    id(l.id);
    line(l.title, "链接标题", LEARNING_LIMITS.title);
    text(l.url, "链接", LEARNING_LIMITS.url);
    if (!l.url) invalid("链接为空");
    httpUrl(l.url);
    text(l.summary, "摘要", LEARNING_LIMITS.summary);
    if (CONTROL.test(l.summary)) invalid("摘要");
    line(l.source, "链接来源", LEARNING_LIMITS.source, false);
    if (!["manual", "aihot"].includes(l.origin)) invalid("链接来源类型");
    if (!LEARNING_STATUS.includes(l.status)) invalid("学习状态");
    date(l.createdAt);
    optionalDate(l.updatedAt);
    optionalDate(l.deletedAt);
  }
  unique(learning.links.map((l) => l.url), "链接");
}
export function validateState(state) {
  keys(state, [
    "revision",
    "assets",
    "notes",
    "projects",
    "agents",
    "references",
    "night",
    "model",
    "connections",
    "knowledgeTasks",
    "assetActivity",
    "scrolls",
    "collabLog",
    "learning",
  ]);
  if (state.scrolls !== undefined) validateScrolls(state.scrolls);
  if (state.learning !== undefined) validateLearning(state.learning);
  if (state.knowledgeTasks !== undefined)
    validateKnowledgeTasks(state.knowledgeTasks);
  if (
    state.revision !== undefined &&
    (!Number.isSafeInteger(state.revision) || state.revision < 0)
  )
    invalid("主库版本");
  let totalBytes = 0,
    totalVersions = 0;
  for (const name of ["assets", "notes", "projects", "agents", "references"]) {
    array(state[name], name);
    unique(
      state[name].map((v) => v?.id),
      `${name} ID`,
    );
  }
  const assetIndex = new Map(state.assets.map((a) => [a?.id, a]));
  for (const a of state.assets) {
    keys(a, [
      "id",
      "type",
      "demo",
      "favorite",
      "pinned",
      "archived",
      "createdAt",
      "versions",
      "cover",
      "origin",
    ]);
    id(a.id);
    date(a.createdAt);
    if (a.origin !== undefined) {
      if (a.type !== "Skill") invalid("只有 Skill 支持来源关系");
      const o = a.origin;
      object(o, "来源关系");
      if (o.kind === "local") {
        keys(o, ["kind", "location", "fingerprint", "capturedAt"]);
        text(o.location, "来源路径", 2000);
        if (!o.location.startsWith("/") || /[\x00-\x1f\x7f]/.test(o.location))
          invalid("来源路径");
        if (!/^[a-f0-9]{64}$/.test(o.fingerprint)) invalid("来源指纹");
        date(o.capturedAt);
      } else if (o.kind === "derived") {
        keys(o, ["kind", "assetId", "versionId"]);
        id(o.assetId);
        id(o.versionId);
        if (o.assetId === a.id) invalid("来源不能指向自身");
        const parent = assetIndex.get(o.assetId);
        if (parent && parent.type !== "Skill") invalid("派生来源必须为 Skill");
      } else invalid("来源类型");
    }
    if (!["Skill", "Prompt", "Workflow", "Rule"].includes(a.type)) invalid("资产类型");
    for (const key of ["demo", "favorite", "archived"])
      if (typeof a[key] !== "boolean") invalid("资产状态");
    // 置顶（切片 1.1）：可选；旧库缺失即未置顶，不写迁移。favorite 仅作兼容保留。
    if (a.pinned !== undefined && typeof a.pinned !== "boolean")
      invalid("资产状态");
    if (
      a.cover !== undefined &&
      (!Number.isInteger(a.cover) || a.cover < 0 || a.cover > 1000)
    )
      invalid("封面编号");
    array(a.versions, "资产版本", 2000);
    if (!a.versions.length) invalid("版本不能为空");
    totalVersions += a.versions.length;
    if (totalVersions > 20000) invalid("版本总量超过限制");
    unique(
      a.versions.map((v) => v?.id),
      "版本 ID",
    );
    for (const v of a.versions) {
      keys(v, [
        "id",
        "at",
        "title",
        "description",
        "content",
        "tags",
        "files",
        "source",
        "restoredFrom",
        "references",
        "type",
      ]);
      id(v.id);
      if (v.references !== undefined) {
        if (a.type !== "Workflow") invalid("只有工作流可设置资产引用");
        array(v.references, "工作流引用", 50);
        unique(
          v.references.map((r) => r?.assetId),
          "引用资产",
        );
        for (const r of v.references) {
          keys(r, ["assetId", "versionId"]);
          id(r.assetId);
          id(r.versionId);
          const target = assetIndex.get(r.assetId);
          if (target && !["Prompt", "Skill"].includes(target.type))
            invalid("引用只能指向 Skill 或 Prompt");
        }
      }
      if (v.type !== undefined && v.type !== a.type) invalid("版本类型不一致");
      date(v.at);
      if (v.restoredFrom !== undefined) id(v.restoredFrom);
      text(v.title, "标题", 200);
      if (!v.title.trim()) invalid("标题为空");
      text(v.description, "说明", 5000);
      text(v.content, "正文");
      text(v.source, "来源", 20000);
      array(v.tags, "标签", 100);
      v.tags.forEach((t) => text(t, "标签", 100));
      array(v.files, "文件", 300);
      unique(
        v.files.map((f) => f?.path),
        "文件路径",
      );
      let versionBytes = 0;
      for (const f of v.files) {
        keys(f, ["path", "data", "text", "mode", "directory"]);
        if (
          f.mode !== undefined &&
          (!Number.isInteger(f.mode) || f.mode < 0 || f.mode > 0o777)
        )
          invalid("文件权限");
        if (f.directory !== undefined && typeof f.directory !== "boolean")
          invalid("目录类型");
        if (f.directory && f.data?.length) invalid("目录内容必须为空");
        if (!safePath(f.path) || f.path.length > 500) invalid("文件路径不安全");
        if (typeof f.text !== "boolean") invalid("文件编码");
        if (f.text) {
          text(f.data, "文本文件", 25 * 1024 * 1024);
          versionBytes += Buffer.byteLength(f.data);
        } else {
          if (!(f.data instanceof Uint8Array)) invalid("二进制文件");
          versionBytes += f.data.length;
        }
      }
      if (
        a.type === "Skill" &&
        !v.files.some((f) => /(^|\/)SKILL\.md$/.test(f.path))
      )
        invalid("Skill 缺少 SKILL.md");
      if (versionBytes > 25 * 1024 * 1024) invalid("单版本文件超过 25 MB");
      totalBytes += versionBytes;
      if (totalBytes > 64 * 1024 * 1024)
        invalid("主库文件总量超过当前 64 MB 上限，请分批管理");
    }
  }
  for (const n of state.notes) {
    keys(n, ["id", "text", "at", "format", "refined"]);
    id(n.id);
    text(n.text, "随手记");
    date(n.at);
    // 切片 1.4：format 缺失为旧纯文本；md1 为受限 Markdown（列表、任务、五色字），
    // 只存文字，渲染时由前端解析并转义，不接受任何 HTML 字段。
    if (n.format !== undefined) {
      if (n.format !== "md1") invalid("随手记格式");
      text(n.text, "随手记", NOTE_MAX);
      if (CONTROL.test(n.text)) invalid("随手记包含控制字符");
    }
    if (n.refined !== undefined) {
      keys(n.refined, ["scrollId", "entryId", "at"]);
      id(n.refined.scrollId);
      id(n.refined.entryId);
      date(n.refined.at);
    }
  }
  for (const a of state.agents) {
    keys(a, ["id", "name", "path"]);
    id(a.id);
    text(a.name, "Agent 名称", 200);
    text(a.path, "Agent 位置", 2000);
  }
  for (const p of state.projects) {
    keys(p, ["id", "name", "goal", "next", "location", "status", "updatedAt"]);
    id(p.id);
    for (const k of ["name", "goal", "next", "location"])
      text(p[k], `项目 ${k}`, 20000);
    if (!["进行中", "等待确认", "已暂停", "已完成"].includes(p.status))
      invalid("项目状态");
    if (p.updatedAt) date(p.updatedAt);
  }
  for (const r of state.references) {
    keys(r, ["id", "title", "url", "note"]);
    id(r.id);
    text(r.title, "参考名称", 1000);
    text(r.note, "参考笔记");
    text(r.url, "来源链接", 10000);
    httpUrl(r.url);
  }
  keys(state.night, ["time", "end", "budget", "task", "enabled"]);
  if (state.night.enabled !== false) invalid("本版不支持启用调度");
  for (const k of ["time", "end"])
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(state.night[k])) invalid("计划时间");
  text(state.night.budget, "预算", 10);
  if (
    !state.night.budget.trim() ||
    !Number.isFinite(Number(state.night.budget)) ||
    Number(state.night.budget) < 0 ||
    Number(state.night.budget) > 10000
  )
    invalid("预算范围");
  text(state.night.task, "夜间任务");
  keys(state.model, ["provider", "model", "endpoint"]);
  for (const k of ["provider", "model", "endpoint"])
    text(state.model[k], `模型 ${k}`, 2000);
  httpUrl(state.model.endpoint);
  if (state.connections !== undefined) {
    const c = state.connections;
    keys(c, [
      "roots",
      "projects",
      "agents",
      "github",
      "projectScannedAt",
      "agentScannedAt",
      "errors",
      "truncated",
      "contextBindings",
      "agentTargets",
      "skillCopies",
      "knowledgeSources",
      "projectStallDays",
    ]);
    // 停滞雷达阈值（路线 v3 切片 2.1）：可选；缺失按默认 7 天。
    if (
      c.projectStallDays !== undefined &&
      (!Number.isSafeInteger(c.projectStallDays) ||
        c.projectStallDays < 1 ||
        c.projectStallDays > 365)
    )
      invalid("停滞阈值");
    if (c.knowledgeSources !== undefined) {
      array(c.knowledgeSources, "知识来源", 20);
      unique(
        c.knowledgeSources.map((s) => s?.id),
        "知识来源 ID",
      );
      unique(
        c.knowledgeSources.map((s) => s?.root),
        "知识来源目录",
      );
      for (const s of c.knowledgeSources) {
        keys(s, [
          "schema",
          "id",
          "name",
          "kind",
          "root",
          "identity",
          "generation",
          "connectedAt",
        ]);
        if (s.schema !== 1 || !["obsidian", "markdown"].includes(s.kind))
          invalid("知识来源版本或类型");
        id(s.id);
        id(s.generation);
        text(s.name, "知识来源名称", 100);
        if (!s.name.trim() || /[\x00-\x1f\x7f]/.test(s.name))
          invalid("知识来源名称");
        text(s.root, "知识来源目录", 2000);
        if (!s.root.startsWith("/") || /[\x00-\x1f\x7f]/.test(s.root))
          invalid("知识来源目录");
        if (
          typeof s.identity !== "string" ||
          !/^[a-f0-9]{64}$/.test(s.identity)
        )
          invalid("知识来源身份");
        date(s.connectedAt);
      }
    }
    if (c.agentTargets !== undefined) {
      array(c.agentTargets, "Agent 管理目标", 100);
      unique(
        c.agentTargets.map((t) => t?.id),
        "Agent 目标 ID",
      );
      unique(
        c.agentTargets.map((t) =>
          JSON.stringify([
            t?.agentId,
            t?.program?.path,
            t?.program?.kind,
            t?.home?.path,
          ]),
        ),
        "Agent 程序与目录绑定",
      );
      for (const t of c.agentTargets) {
        keys(t, [
          "schema",
          "id",
          "agentId",
          "bindingId",
          "label",
          "program",
          "home",
          "createdAt",
          "updatedAt",
        ]);
        if (t.schema !== 1 || !["codex", "hermes"].includes(t.agentId))
          invalid("Agent 目标版本或身份");
        id(t.id);
        if (t.bindingId !== undefined) id(t.bindingId);
        text(t.label, "目标名称", 100);
        if (!t.label.trim() || /[\x00-\x1f\x7f]/.test(t.label))
          invalid("目标名称");
        keys(t.program, ["path", "kind"]);
        keys(t.home, ["id", "path", "label"]);
        id(t.home.id);
        text(t.home.label, "目录名称", 200);
        if (!["App", "CLI"].includes(t.program.kind)) invalid("目标程序类型");
        for (const path of [t.program.path, t.home.path]) {
          text(path, "目标路径", 2000);
          if (!path.startsWith("/") || /[\x00-\x1f\x7f]/.test(path))
            invalid("目标路径");
        }
        date(t.createdAt);
        date(t.updatedAt);
      }
    }
    if (c.skillCopies !== undefined) {
      array(c.skillCopies, "Skill 副本关联", 1000);
      unique(
        c.skillCopies.map((v) => v?.id),
        "副本关联 ID",
      );
      unique(
        c.skillCopies.map((v) => JSON.stringify([v?.targetId, v?.location])),
        "目标副本路径",
      );
      for (const v of c.skillCopies) {
        keys(v, [
          "schema",
          "id",
          "assetId",
          "versionId",
          "targetId",
          "targetSignature",
          "scopeSignature",
          "root",
          "location",
          "boundFingerprint",
          "boundAt",
        ]);
        if (v.schema !== 1) invalid("副本关联版本");
        for (const k of ["id", "assetId", "versionId", "targetId"]) id(v[k]);
        for (const k of [
          "targetSignature",
          "scopeSignature",
          "boundFingerprint",
        ])
          if (!/^[a-f0-9]{64}$/.test(v[k])) invalid("副本签名");
        for (const k of ["root", "location"]) {
          text(v[k], "副本路径", 2000);
          if (!v[k].startsWith("/") || /[\x00-\x1f\x7f]/.test(v[k]))
            invalid("副本路径");
        }
        date(v.boundAt);
      }
    }
    if (c.contextBindings !== undefined) {
      array(c.contextBindings, "项目上下文连接", 10000);
      unique(
        c.contextBindings.map((b) => b?.projectId),
        "项目上下文连接",
      );
      for (const b of c.contextBindings) {
        keys(b, [
          "projectId",
          "root",
          "repoKey",
          "currentPath",
          "rulesPath",
          "boundAt",
          "relationVersion",
          "directoryStamp",
        ]);
        id(b.projectId);
        if (b.relationVersion !== undefined && b.relationVersion !== "")
          id(b.relationVersion);
        if (
          b.directoryStamp !== undefined &&
          !/^[a-f0-9]{64}$/.test(b.directoryStamp)
        )
          invalid("项目目录指纹");
        for (const k of ["root", "repoKey", "currentPath", "rulesPath"])
          text(b[k], "来源指针", 2000);
        date(b.boundAt);
      }
    }
    array(c.roots, "扫描目录", 12);
    c.roots.forEach((p) => text(p, "目录", 2000));
    array(c.projects, "已发现项目", 10000);
    array(c.agents, "已检测 Agent", 100);
    array(c.errors, "扫描错误", 10000);
    c.errors.forEach((e) => text(e, "扫描错误", 3000));
    if (typeof c.truncated !== "boolean") invalid("扫描完整性");
    for (const key of ["projectScannedAt", "agentScannedAt"])
      if (c[key]) date(c[key]);
    keys(c.github, ["status", "login", "message", "at"]);
    for (const key of ["status", "login", "message", "at"])
      text(c.github[key], "GitHub 状态", 1000);
    for (const p of c.projects) {
      keys(p, [
        "id",
        "name",
        "kind",
        "repoKey",
        "localPaths",
        "branch",
        "githubUrl",
        "private",
        "description",
        "language",
        "updatedAt",
        "localSeenAt",
        "githubSeenAt",
        "seenThisScan",
        "locations",
        "relationVersion",
        "aliases",
        "identityConflict",
        "active",
      ]);
      id(p.id);
      // 在推进标记（路线 v3 切片 2.1）：可选布尔；旧库缺失即未标记。
      if (p.active !== undefined && typeof p.active !== "boolean")
        invalid("在推进标记");
      if (p.relationVersion !== undefined) id(p.relationVersion);
      if (
        p.identityConflict !== undefined &&
        typeof p.identityConflict !== "boolean"
      )
        invalid("项目身份冲突状态");
      if (p.aliases !== undefined) {
        array(p.aliases, "项目历史身份", 1000);
        unique(p.aliases, "项目历史身份");
        p.aliases.forEach(id);
        if (p.aliases.includes(p.id)) invalid("项目历史身份不能指向自身");
      }
      text(p.name, "项目名", 1000);
      array(p.localPaths, "本地位置", 100);
      p.localPaths.forEach((path) => text(path, "路径", 2000));
      unique(p.localPaths, "项目本地位置");
      if (p.locations !== undefined) {
        array(p.locations, "项目目录观测", 100);
        unique(
          p.locations.map((location) => location?.path),
          "项目目录观测",
        );
        for (const location of p.locations) {
          keys(location, [
            "path",
            "status",
            "identity",
            "observedIdentity",
            "checkedAt",
            "message",
          ]);
          text(location.path, "项目目录位置", 2000);
          if (!p.localPaths.includes(location.path))
            invalid("目录观测不属于项目");
          if (
            ![
              "present",
              "missing",
              "unknown",
              "out_of_scope",
              "unrecognized",
              "changed",
            ].includes(location.status)
          )
            invalid("项目目录状态");
          for (const key of ["identity", "observedIdentity"])
            if (
              location[key] !== undefined &&
              !/^[a-f0-9]{64}$/.test(location[key])
            )
              invalid("项目目录身份");
          if (location.checkedAt !== undefined) date(location.checkedAt);
          if (location.message !== undefined)
            text(location.message, "目录状态说明", 1000);
        }
      }
      for (const key of [
        "kind",
        "repoKey",
        "branch",
        "githubUrl",
        "description",
        "language",
        "updatedAt",
        "localSeenAt",
        "githubSeenAt",
      ])
        if (p[key] !== undefined) text(p[key], "项目元数据", 5000);
      if (
        p.githubUrl &&
        !/^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(
          p.githubUrl,
        )
      )
        invalid("GitHub URL");
    }
    for (const a of c.agents) {
      keys(a, [
        "id",
        "name",
        "kind",
        "status",
        "programs",
        "configFound",
        "errors",
      ]);
      if (a.errors !== undefined) {
        array(a.errors, "Agent 探测错误", 1000);
        a.errors.forEach((e) => text(e, "探测错误", 3000));
      }
      id(a.id);
      for (const key of ["name", "kind", "status"])
        text(a[key], "Agent 元数据", 200);
      array(a.programs, "Agent 路径", 100);
      for (const p of a.programs) {
        keys(p, ["path", "kind"]);
        text(p.path, "程序路径", 2000);
        text(p.kind, "程序类型", 20);
      }
    }
  }
  validateActivity(state);
  validateCollabLog(state);
  return state;
}
export function canonical(value) {
  if (value instanceof Uint8Array) return JSON.parse(stringify(value));
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export const equivalent = (a, b) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export function validateHistory(
  previous,
  next,
  {
    allowConnections = false,
    allowOrigins = false,
    allowKnowledge = false,
    allowActivity = false,
    allowCollab = false,
    allowLearningFolders = false,
  } = {},
) {
  if (
    !allowLearningFolders &&
    !equivalent(previous?.learning?.folders || [], next.learning?.folders || [])
  )
    invalid("书架文件夹只能在设置中通过专用操作修改");
  validateActivityHistory(previous?.assetActivity || [], next.assetActivity || [], allowActivity);
  validateCollabHistory(previous?.collabLog || [], next.collabLog || [], allowCollab);
  if (
    !allowKnowledge &&
    !equivalent(previous?.knowledgeTasks || [], next.knowledgeTasks || [])
  )
    invalid("知识整理任务只能通过专用操作更新");
  validateKnowledgeHistory(
    previous?.knowledgeTasks || [],
    next.knowledgeTasks || [],
  );
  if (!allowConnections && !equivalent(previous?.connections, next.connections))
    invalid("连接结果只能通过扫描更新");
  if (!allowOrigins) {
    const oldIds = new Set(previous?.assets.map((a) => a.id) || []);
    if (next.assets.some((a) => a.origin !== undefined && !oldIds.has(a.id)))
      invalid("来源只能通过专用收录或派生操作建立");
  }
  if (!previous) return;
  const protectedDemos = retainedDemoIds(
    previous.assets,
    previous.connections?.skillCopies,
    previous.assetActivity,
  );
  for (const old of previous.assets) {
    const asset = next.assets.find((a) => a.id === old.id);
    if (!asset) {
      if (protectedDemos.has(old.id))
        invalid("示例被工作流历史或派生来源引用，或存在目标副本关联，不能移除");
      if (old.demo) continue;
      invalid("资产只能归档，不能直接移除历史");
    }
    if (
      asset.type !== old.type ||
      asset.demo !== old.demo ||
      asset.createdAt !== old.createdAt
    )
      invalid("资产身份不可更改");
    if (!equivalent(asset.origin, old.origin)) invalid("来源关系不可更改");
    if (
      asset.versions.length < old.versions.length ||
      !old.versions.every((v, i) => equivalent(v, asset.versions[i]))
    )
      invalid("历史版本不可覆盖；请创建新版本");
  }
}

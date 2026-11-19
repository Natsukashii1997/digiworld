import { validateProjectScanDiagnostics } from "./project-scan-diagnostics.mjs";
import {validNoteRich} from '../src/note-rich.js';
import {validNoteMeta} from '../src/note-types.js';
import {validNoteImages} from '../src/note-image-model.js';
import { validateSkillSourceAdoptions, validateSkillSourceAdoptionHistory } from "./skill-source-updates-schema.mjs";
import { validateActivity, validateActivityHistory } from "./asset-activity-schema.mjs";
import { validateCollabLog, validateCollabHistory } from "./collab-schema.mjs";
import { validateBriefReads, validateBriefHistory } from "./brief-schema.mjs";
import { validateProjectDesk, validateProjectDeskHistory } from "./project-desk-schema.mjs";
import { validateReverseReports, validateReverseReportHistory } from "./reverse-report-schema.mjs";
import { validateDesignVersion } from "../src/design-asset.js";
import { safePath } from "../src/store.js";
import { retainedDemoIds } from "../src/asset-origin.js";
import { validateMcpVersion } from "../src/mcp-config.js";
import { categoriesOf, hasCategory, validateAssetCategories } from "../src/asset-categories.js";
import { validateInstallUrl } from "../src/skill-install.js";
import { stringify } from "../src/serialization.js";
import {planSkillVersion} from "../src/skill-version.js";
import { validateNightV2 } from "../src/night-v2-model.js";
import { REVERSE_LIMITS } from "../src/reverse.js";
import {validateRecipeRecord,validateReverseSettings,validateReverseHistory,validateForgeReferences,validateHatch} from './reverse-schema.mjs';
import {
  validateKnowledgeTasks,
  validateKnowledgeHistory,
} from "./knowledge-compilation-schema.mjs";
import {
  validateKnowledgeZones,
  validateProfileProposals,
  validateProfileHistory,
} from "./knowledge-profile-schema.mjs";
import { validateAgentRoles } from "./agent-roles-schema.mjs";
import {
  validateRevisionCandidates,
  validateCandidateHistory,
} from "./revision-candidate-schema.mjs";
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
const COLLAB_ACTORS = new Set(["claude-code", "codex", "hermes", "user"]);
function validateWorkflowTemplate(value) {
  keys(value, ["schema", "stages", "defaultPace", "escalationAfter"]);
  if (value.schema !== 1 || !["per-run", "continuous"].includes(value.defaultPace) ||
      !Number.isInteger(value.escalationAfter) || value.escalationAfter < 1 || value.escalationAfter > 10)
    invalid("协同模板设置");
  array(value.stages, "协同模板阶段", 20);
  if (!value.stages.length) invalid("协同模板至少需要一站");
  for (const [index, stage] of value.stages.entries()) {
    keys(stage, ["number", "label", "defaultActor", "method", "artifact", "gate", "skippable"]);
    if (stage.number !== index + 1 || !COLLAB_ACTORS.has(stage.defaultActor) ||
        typeof stage.skippable !== "boolean") invalid("协同模板阶段编号或执行者");
    for (const [key, max] of [["label", 80], ["method", 2000], ["artifact", 200], ["gate", 1000]]) {
      text(stage[key], `协同模板${key}`, max);
      if (!stage[key].trim() || CONTROL.test(stage[key])) invalid(`协同模板${key}`);
      if (["label", "artifact"].includes(key) && /[\r\n]/.test(stage[key])) invalid(`协同模板${key}不能换行`);
    }
  }
}
function validateCollabRunSettings(settings, assets) {
  array(settings, "协同运行设置", 1000);
  const seen = new Set(), rounds = new Map();
  for (const setting of settings) {
    keys(setting, ["projectId", "runId", "round", "issuesPath", "templateAssetId", "templateVersionId", "pace", "functionOnly", "actorOverrides"]);
    id(setting.projectId);
    if (typeof setting.runId !== "string" || !/^[\w.-]{1,80}$/.test(setting.runId)) invalid("协同运行编号");
    const key = `${setting.projectId}:${setting.runId}`;
    if (seen.has(key)) invalid("协同运行设置重复");
    seen.add(key);
    text(setting.round, "协同轮次", 100);
    if (!setting.round.trim() || CONTROL.test(setting.round)) invalid("协同轮次");
    text(setting.issuesPath, "待议清单路径", 500);
    if (setting.issuesPath &&
        (!setting.issuesPath.startsWith("docs/") || !setting.issuesPath.endsWith(".md") ||
         !safePath(setting.issuesPath) || setting.issuesPath.split("/").some((part) => part.startsWith("."))))
      invalid("待议清单仅可指向项目 docs 内的 Markdown");
    const roundKey = `${setting.projectId}:${setting.round}`;
    if (rounds.has(roundKey) && rounds.get(roundKey) !== setting.issuesPath) invalid("同一轮次的待议清单不一致");
    rounds.set(roundKey, setting.issuesPath);
    id(setting.templateAssetId);
    id(setting.templateVersionId);
    const asset = assets.find((item) => item.id === setting.templateAssetId && item.type === "Workflow");
    const version = asset?.versions.find((item) => item.id === setting.templateVersionId);
    if (!version?.workflowTemplate) invalid("协同运行所锁模板版本不存在");
    if (!["per-run", "continuous"].includes(setting.pace) || typeof setting.functionOnly !== "boolean")
      invalid("协同运行节奏或任务类型");
    array(setting.actorOverrides, "协同替换执行者", 20);
    unique(setting.actorOverrides.map((item) => item?.phase), "替换执行者阶段");
    for (const override of setting.actorOverrides) {
      keys(override, ["phase", "actor"]);
      if (!Number.isInteger(override.phase) || override.phase < 1 ||
          override.phase > version.workflowTemplate.stages.length || !COLLAB_ACTORS.has(override.actor))
        invalid("协同替换执行者");
    }
  }
}
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
        "name",
        "text",
        "tags",
        "uses",
        "createdAt",
        "updatedAt",
        "deletedAt",
        "lastUsedAt",
        "source",
      ]);
      id(e.id);
      // 逆向工程入库的条目带来源：逆向记录 ID 与可选的素材链接（支线 B2）。
      if (e.source !== undefined) {
        // 阶段 2：收藏条目收入焚决时来源为收藏 ID；两种来源只取其一。
        keys(e.source, ["reverseId", "collectionId", "url"]);
        if (e.source.reverseId !== undefined && e.source.collectionId !== undefined) invalid("焚决来源");
        id(e.source.reverseId ?? e.source.collectionId);
        if (e.source.url !== undefined) {
          text(e.source.url, "来源链接", REVERSE_LIMITS.url);
          if (!e.source.url) invalid("来源链接");
          httpUrl(e.source.url);
        }
      }
      entryIds.push(e.id);
      if (e.name !== undefined) {
        text(e.name, "焚决名称", SCROLL_LIMITS.name);
        if (!e.name.trim() || CONTROL.test(e.name) || /[\n\t]/.test(e.name))
          invalid("焚决名称");
      }
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
    keys(b, ["id", "root", "path", "name", "status", "updatedAt", "progress"]);
    id(b.id);
    absolutePath(b.root, "书架目录");
    if (!safePath(b.path) || b.path.length > LEARNING_LIMITS.path || /[\x00-\x1f\x7f]/.test(b.path))
      invalid("书的路径");
    line(b.name, "书名", LEARNING_LIMITS.name);
    if (b.progress !== undefined) {
      keys(b.progress, ["unit", "value", "updatedAt"]);
      if (b.progress.unit === "percent") {
        if (typeof b.progress.value !== "number" || !Number.isFinite(b.progress.value) || b.progress.value < 0 || b.progress.value > 100)
          invalid("阅读百分比");
      } else if (b.progress.unit === "chapter") line(b.progress.value, "阅读位置", 100);
      else invalid("阅读进度单位");
      date(b.progress.updatedAt);
    }
    if (b.status !== undefined ? !LEARNING_STATUS.includes(b.status) : b.progress === undefined) invalid("学习状态");
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
// 逆向工程（路线 v3 支线 B2）：顶层集合 reverseRecords。一条记录 = 素材 + 任务包 + Agent 回复 + 入库结果。
// 记录可修改（保存回复、追加入库结果），不做版本；删除写 deletedAt 进回收区。旧库缺失该集合时按空处理。
export { REVERSE_LIMITS };
export function validateReverseRecords(records) {
  array(records, "逆向记录数", REVERSE_LIMITS.records);
  unique(
    records.map((r) => r?.id),
    "逆向记录 ID",
  );
  for (const r of records) {
    keys(r, [
      "id",
      "title",
      "createdAt",
      "updatedAt",
      "deletedAt",
      "material",
      "why",
      "pack",
      "reply",
      "imports",
      "stage",
      "copies",
      "type", "recipe", "recipeReply", "referenceMedia", "replicas", "replicaDraft", "variations", "forge", "reaRuns", "savedSkill", "packVersions", "activePackVersionId", "packSkills", "hatch", "hatchSkills", "heldAt",
    ]);
    id(r.id);
    text(r.title, "逆向标题", REVERSE_LIMITS.title);
    if (!r.title.trim() || CONTROL.test(r.title) || /[\n\t]/.test(r.title))
      invalid("逆向标题");
    date(r.createdAt);
    optionalDate(r.updatedAt);
    optionalDate(r.deletedAt);
    optionalDate(r.heldAt);
    keys(r.material, ["text", "url", "target"]);
    if (r.material.target !== undefined && r.type !== "FN") invalid("只有FN可使用REA目标");
    text(r.material.text, "逆向素材原文", REVERSE_LIMITS.material);
    if (CONTROL.test(r.material.text)) invalid("逆向素材原文");
    text(r.material.url, "逆向素材链接", REVERSE_LIMITS.url);
    httpUrl(r.material.url);
    if (!r.material.text.trim() && !r.material.url && !r.referenceMedia?.length && r.material.target === undefined) invalid("逆向素材为空");
    if(r.type!==undefined)validateRecipeRecord(r);
    else if(['recipe','recipeReply','referenceMedia','replicas','replicaDraft','variations','forge','reaRuns','savedSkill','packVersions','activePackVersionId','packSkills'].some(k=>r[k]!==undefined))invalid('旧逆向记录不接受新字段');
    validateHatch(r);
    text(r.why, "好在哪里", REVERSE_LIMITS.why);
    if (CONTROL.test(r.why)) invalid("好在哪里");
    text(r.pack, "拆解任务包", REVERSE_LIMITS.pack);
    if (r.stage !== undefined && !["draft", "prepared"].includes(r.stage)) invalid("逆向阶段");
    if (r.stage === "draft") {
      if (r.pack !== "" || r.reply !== undefined || r.imports?.length || r.copies?.length)
        invalid("素材草稿不能包含任务包、回复、入库或复制回执");
    } else if (!r.pack.trim()) invalid("拆解任务包为空");
    if (r.copies !== undefined) {
      array(r.copies, "复制回执", 2000);
      unique(r.copies.map(c => c?.id), "复制回执 ID");
      for (const c of r.copies) {
        keys(c, ["id", "agentId", "at"]); id(c.id); date(c.at);
        if (!(r.type?["codex", "claude-code", "hermes","openclaw","doubao"]:["codex", "claude-code", "hermes"]).includes(c.agentId)) invalid("复制接收 Agent");
      }
    }
    if (r.reply !== undefined) {
      text(r.reply, "Agent 回复", REVERSE_LIMITS.reply);
      if (CONTROL.test(r.reply)) invalid("Agent 回复");
    }
    if (r.imports !== undefined) {
      array(r.imports, "入库结果", REVERSE_LIMITS.imports);
      unique(
        r.imports.map((i) => i?.index),
        "候选序号",
      );
      for (const i of r.imports) {
        object(i, "入库结果");
        if (i.kind === "scroll") {
          keys(i, ["index", "kind", "scrollId", "entryId", "at"]);
          id(i.scrollId);
          id(i.entryId);
        } else if (i.kind === "prompt") {
          keys(i, ["index", "kind", "assetId", "versionId", "at"]);
          id(i.assetId);
          id(i.versionId);
        } else invalid("入库类型");
        if (!Number.isSafeInteger(i.index) || i.index < 0 || i.index > 10000)
          invalid("候选序号");
        date(i.at);
      }
    }
  }
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
    "nightV2",
    "model",
    "connections",
    "knowledgeTasks",
    "assetActivity",
    "scrolls",
    "collabLog",
    "collabRunSettings",
    "briefReads",
    "learning",
    "knowledgeZones",
    "profileProposals",
    "agentRoles",
    "reverseRecords",
    "reverseReports",
    "reverseSettings",
    "revisionCandidates",
    "skillSourceAdoptions",
    "projectDesk",
    "assetCategories",
  ]);
  if (state.skillSourceAdoptions !== undefined) validateSkillSourceAdoptions(state.skillSourceAdoptions,state.assets);
  if (state.scrolls !== undefined) validateScrolls(state.scrolls);
  // 资产分类表（#93）：可选；缺省时用默认六类。
  if (state.assetCategories !== undefined) {
    try { validateAssetCategories(state.assetCategories); } catch (error) { invalid(error.message); }
  }
  const categoryIds = new Set(categoriesOf(state).map((c) => c.id));
  if (state.learning !== undefined) validateLearning(state.learning);
  if (state.knowledgeZones !== undefined)
    validateKnowledgeZones(state.knowledgeZones);
  if (state.profileProposals !== undefined)
    validateProfileProposals(state.profileProposals);
  // 角色卡独立于已撤销的银饰页面。
  if (state.agentRoles !== undefined) validateAgentRoles(state.agentRoles);
  if (state.reverseRecords !== undefined)
    validateReverseRecords(state.reverseRecords);
  validateForgeReferences(state);
  if(state.reverseSettings!==undefined)validateReverseSettings(state.reverseSettings);
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
      "category",
    ]);
    id(a.id);
    // 主分类（#93）：只给 Prompt 与 Skill；挂在资产上不进版本，改分类不产生新版本。
    if (a.category !== undefined) {
      if (!hasCategory(a.type)) invalid("只有 Prompt 与 Skill 可设置分类");
      if (typeof a.category !== "string" || !categoryIds.has(a.category)) invalid("分类不存在");
    }
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
    if (!["Skill", "Prompt", "Workflow", "Rule", "MCP", "Design"].includes(a.type)) invalid("资产类型");
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
        "candidateId",
        "mediaManifest",
        "workflowTemplate",
        "mcpConfig",
        "design",
        "hatchedFrom",
        "installUrl",
      ]);
      id(v.id);
      // 阶段 2：从随手记、收藏或逆向标本（#29）孵成的资产，在首个版本记来源条目；之后的版本不继承。
      if (v.hatchedFrom !== undefined) {
        if (v !== a.versions[0]) invalid("孵化来源只能在首个版本");
        keys(v.hatchedFrom, ["kind", "id"]);
        if (!["note", "collection", "reverse"].includes(v.hatchedFrom.kind)) invalid("孵化来源类型");
        id(v.hatchedFrom.id);
      }
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
      if (v.workflowTemplate !== undefined) {
        if (a.type !== "Workflow") invalid("只有工作流可设置协同模板");
        validateWorkflowTemplate(v.workflowTemplate);
      }
      if (a.type === "MCP") {
        try { validateMcpVersion(v); } catch (error) { invalid(error.message); }
      } else if (v.mcpConfig !== undefined) invalid("只有 MCP 资产可设置 MCP 配置");
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
      // 填安装地址的 Skill 不带包；其余 Skill 必须有 SKILL.md（用户 2026-10-27）。
      if (v.installUrl !== undefined) {
        if (a.type !== "Skill" || v.files.length || v.mediaManifest !== undefined) invalid("只有不带包的 Skill 可设置安装地址");
        let normalized;
        try { normalized = validateInstallUrl(v.installUrl); } catch (error) { invalid(error.message); }
        if (normalized !== v.installUrl) invalid("安装地址需为规范链接");
      } else if (
        a.type === "Skill" &&
        !v.files.some((f) => /(^|\/)SKILL\.md$/.test(f.path))
      )
        invalid("Skill 缺少 SKILL.md");
      if(v.mediaManifest!==undefined){if(a.type!=="Skill")invalid("只有Skill可有媒体清单");try{versionBytes=planSkillVersion(v).byteLength;}catch(e){invalid(e.message);}}
      if (a.type === "Design") {
        try { validateDesignVersion(v); } catch (error) { invalid(error.message); }
      } else if (v.design !== undefined) invalid("只有设计资产可设置设计形态");
      if (versionBytes > 25 * 1024 * 1024) invalid("单版本文件超过 25 MB");
      totalBytes += versionBytes;
      if (totalBytes > 64 * 1024 * 1024)
        invalid("主库文件总量超过当前 64 MB 上限，请分批管理");
    }
  }
  if (state.collabRunSettings !== undefined)
    validateCollabRunSettings(state.collabRunSettings, state.assets);
  for (const n of state.notes) {
    keys(n, ["id", "text", "at", "format", "refined", "images", "type", "title", "rich", "archivedAt"]);
    id(n.id);
    if(!validNoteMeta(n)||!validNoteRich(n))invalid("便签类型或标题");
    if(!validNoteImages(n.images))invalid("便签图片引用");
    if(n.text!=="")text(n.text, "随手记");
    date(n.at);
    // 切片 1.4：format 缺失为旧纯文本；md1 为受限 Markdown（列表、任务、五色字），
    // 只存文字，渲染时由前端解析并转义，不接受任何 HTML 字段。
    if (n.format !== undefined) {
      if (n.format !== "md1") invalid("随手记格式");
      if(n.text!=="")text(n.text, "随手记", NOTE_MAX);
      if (CONTROL.test(n.text)) invalid("随手记包含控制字符");
    }
    // 阶段 2：归档是孵化去向之一，只记时间；缺失即未归档。
    if (n.archivedAt !== undefined) date(n.archivedAt);
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
  if (state.nightV2 !== undefined) {
    try { validateNightV2(state.nightV2); }
    catch (error) { invalid(`夜巡 v2 计划：${error.message}`); }
  }
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
      "projectScanDiagnostics",
      "agentScannedAt",
      "errors",
      "truncated",
      "contextBindings",
      "agentTargets",
      "skillCopies",
      "knowledgeSources",
      "knowledgeSourceHealth",
      "projectStallDays",
      "projectSavepointWarnDays",
      "projectSavepointDangerDays",
      "projectCatalog",
      "projectExclusions",
    ]);
    // 停滞雷达阈值（路线 v3 切片 2.1）：可选；缺失按默认 7 天。
    if (
      c.projectStallDays !== undefined &&
      (!Number.isSafeInteger(c.projectStallDays) ||
        c.projectStallDays < 1 ||
        c.projectStallDays > 365)
    )
      invalid("停滞阈值");
    if (c.projectSavepointWarnDays !== undefined || c.projectSavepointDangerDays !== undefined) {
      const warn=c.projectSavepointWarnDays, danger=c.projectSavepointDangerDays;
      if (![warn,danger].every(v=>Number.isSafeInteger(v)&&v>=1&&v<=365)||warn>=danger)
        invalid("未存档阈值必须为1–365整数，成对提供且黄小于红");
    }
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
          "agentSharing",
          "excludedFolders",
          "feishuSpaceId",
          "feishuVerifiedAt",
          "feishuPrincipalHash",
        ]);
        if (s.schema !== 1 || !["obsidian", "markdown", "feishu"].includes(s.kind))
          invalid("知识来源版本或类型");
        id(s.id);
        id(s.generation);
        text(s.name, "知识来源名称", 100);
        if (!s.name.trim() || /[\x00-\x1f\x7f]/.test(s.name))
          invalid("知识来源名称");
        text(s.root, "知识来源目录", 2000);
        if ((s.kind === "feishu"
          ? !/^feishu:\/\/(?:wiki\/[A-Za-z0-9_-]{6,128}|space\/[0-9]{1,30})$/.test(s.root)
          : !s.root.startsWith("/")) || /[\x00-\x1f\x7f]/.test(s.root))
          invalid("知识来源目录");
        if (s.kind === "feishu") {
          if (!(s.feishuSpaceId === null || (typeof s.feishuSpaceId === "string" && /^[0-9]{1,30}$/.test(s.feishuSpaceId))))
            invalid("飞书空间身份");
          if (!(s.feishuVerifiedAt === null || typeof s.feishuVerifiedAt === "string"))
            invalid("飞书核验时间");
          if (s.feishuVerifiedAt !== null) date(s.feishuVerifiedAt);
          if ((s.feishuSpaceId === null) !== (s.feishuVerifiedAt === null))
            invalid("飞书范围核验状态");
          if (!(s.feishuPrincipalHash === null || (typeof s.feishuPrincipalHash === "string" && /^[a-f0-9]{64}$/.test(s.feishuPrincipalHash))) ||
              (s.feishuSpaceId === null) !== (s.feishuPrincipalHash === null))
            invalid("飞书本人身份绑定");
          if (s.feishuSpaceId === null && s.agentSharing === true)
            invalid("未核验飞书来源不能开放给 Agent");
          if (s.excludedFolders?.length) invalid("飞书来源应改用更小的明确节点范围");
        } else if (s.feishuSpaceId !== undefined || s.feishuVerifiedAt !== undefined || s.feishuPrincipalHash !== undefined)
          invalid("本地知识源不能携带飞书状态");
        if (
          typeof s.identity !== "string" ||
          !/^[a-f0-9]{64}$/.test(s.identity)
        )
          invalid("知识来源身份");
        if (s.agentSharing !== undefined && typeof s.agentSharing !== "boolean") invalid("知识共享状态");
        if (s.excludedFolders !== undefined) {
          array(s.excludedFolders,"排除目录",20);unique(s.excludedFolders,"排除目录");
          for(const f of s.excludedFolders) if(typeof f!=="string" || !f || f.length>200 || /[\\:*?\x00-\x1f\x7f-\x9f\u2028\u2029]/.test(f) || f.split('/').some(p=>!p||p!==p.trim()||p.startsWith('.')||/^(?:node_modules|vendor|dist|build|target|cache|caches|keychains|secrets?|credentials?|tokens?|passwords?|private[-_]?keys?)(?:[._-]|$)/i.test(p))) invalid("排除目录");
        }
        date(s.connectedAt);
      }
    }
    if (c.knowledgeSourceHealth !== undefined) {
      array(c.knowledgeSourceHealth, "知识源状态", 20);
      unique(c.knowledgeSourceHealth.map((h) => h?.sourceId), "知识源状态 ID");
      for (const h of c.knowledgeSourceHealth) {
        keys(h, ["sourceId", "status", "detectedAt", "confirmedAt", "beforeIdentity", "afterIdentity"]);
        id(h.sourceId);
        if (!["needs_reconfirmation", "confirmed"].includes(h.status)) invalid("知识源状态");
        date(h.detectedAt);
        if (!(h.confirmedAt === null || typeof h.confirmedAt === "string")) invalid("知识源确认时间");
        if (h.confirmedAt !== null) date(h.confirmedAt);
        if (!/^[a-f0-9]{64}$/.test(h.beforeIdentity) || !(h.afterIdentity === null || /^[a-f0-9]{64}$/.test(h.afterIdentity))) invalid("知识源身份回执");
        if (h.status === "needs_reconfirmation" && (h.confirmedAt !== null || h.afterIdentity !== null)) invalid("知识源待确认状态");
        if (h.status === "confirmed" && (h.confirmedAt === null || h.afterIdentity === null)) invalid("知识源确认回执");
        if (!c.knowledgeSources?.some((s) => s.id === h.sourceId)) invalid("知识源状态与连接不匹配");
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
    if (c.projectScanDiagnostics !== undefined) validateProjectScanDiagnostics(c.projectScanDiagnostics);
    for (const key of ["projectScannedAt", "agentScannedAt"])
      if (c[key]) date(c[key]);
    keys(c.github, ["status", "login", "message", "at"]);
    for (const key of ["status", "login", "message", "at"])
      text(c.github[key], "GitHub 状态", 1000);
    unique(c.projects.filter((p) => p?.rosterId !== undefined).map((p) => p.rosterId), "名册项目 ID");
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
        "githubPushedAt",
        "recentUpdate",
        "localSeenAt",
        "githubSeenAt",
        "seenThisScan",
        "locations",
        "relationVersion",
        "aliases",
        "identityConflict",
        "active",
        "manual",
        "rosterId",
        "rosterRemoved",
      ]);
      // 名册派生（#73）：rosterId 是名册里的项目 id；rosterRemoved 只能是 true（名册里已删掉）。
      if (p.rosterId !== undefined && (typeof p.rosterId !== "string" || !/^[A-Za-z0-9][\w.-]{0,79}$/.test(p.rosterId)))
        invalid("名册项目 ID");
      if (p.rosterRemoved !== undefined && (p.rosterRemoved !== true || p.rosterId === undefined))
        invalid("名册删除标记");
      if (p.githubPushedAt !== undefined) date(p.githubPushedAt);
      if (p.recentUpdate !== undefined) {
        const u=p.recentUpdate;keys(u,["state","source","checkedAt","at","reason"]);
        if (!["ok","partial","unknown"].includes(u.state) || !["Git","GitHub"].includes(u.source)) invalid("项目更新时间状态");
        date(u.checkedAt);if (u.at !== undefined) date(u.at);
        if (u.state !== "unknown" && !u.at) invalid("已核实更新时间缺失");
        if (u.state === "unknown" && u.at !== undefined) invalid("未知更新时间不能带时间");
        if (u.reason !== undefined) text(u.reason,"时间未知原因",1000);
      }
      id(p.id);
      // 在推进标记（路线 v3 切片 2.1）：可选布尔；旧库缺失即未标记。
      if (p.active !== undefined && typeof p.active !== "boolean")
        invalid("在推进标记");
      if (p.manual !== undefined && typeof p.manual !== "boolean")
        invalid("手工项目标记");
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
            "identityVersion",
            "observedIdentity",
            "checkedAt",
            "message",
          ]);
          if (location.identityVersion !== undefined && (location.identityVersion !== 2 || !location.identity)) invalid("目录身份版本");
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
    if (c.projectExclusions !== undefined) {
      array(c.projectExclusions, "项目排除身份", 1000);
      unique(c.projectExclusions, "项目排除身份");
      for (const entry of c.projectExclusions) {
        text(entry, "项目排除身份", 2100);
        if (!/^(?:id:[a-zA-Z0-9_-]{1,100}|repo:[a-z0-9_.-]+\/[a-z0-9_.-]+|path:\/[^\x00-\x1f\x7f]*)$/.test(entry))
          invalid("项目排除身份格式");
      }
    }
    if (c.projectCatalog !== undefined) {
      array(c.projectCatalog, "项目展示目录", 1000);
      unique(c.projectCatalog.map((item) => item?.projectId), "项目展示目录");
      const projectIds = new Set(c.projects.map((p) => p.id));
      const views = new Set(["main", "asset", "task", "candidate", "component", "hidden"]);
      const sections = new Set(["business", "personal", "knowledge", "tools", "completed", "pending", "remote", "sources"]);
      for (const item of c.projectCatalog) {
        keys(item, ["projectId", "displayName", "section", "view", "parentId", "note"]);
        id(item.projectId);
        if (!projectIds.has(item.projectId)) invalid("项目展示目录引用不存在的项目");
        text(item.displayName, "项目展示名", 120);
        if (!item.displayName.trim()) invalid("项目展示名为空");
        if (!sections.has(item.section) || !views.has(item.view)) invalid("项目展示分区");
        if (item.view === "main" && !["business", "personal", "knowledge", "tools", "completed"].includes(item.section))
          invalid("主项目分区");
        if (item.parentId !== undefined) {
          id(item.parentId);
          if (!projectIds.has(item.parentId) || item.parentId === item.projectId)
            invalid("项目附属关系");
        }
        if (item.note !== undefined) text(item.note, "项目说明", 1000);
      }
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
  validateBriefReads(state);
  validateProjectDesk(state);
  validateReverseReports(state);
  // 进化回路 v1：改版候选，旧库缺失按空处理；版本上的 candidateId 与候选互相核对。
  validateRevisionCandidates(state);
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

function validateNightV2History(previous, next) {
  const oldPlan = previous?.nightV2;
  if (oldPlan === undefined) return;
  const plan = next.nightV2;
  if (plan === undefined) invalid("夜巡 v2 计划不能删除");
  if (!equivalent(oldPlan, plan) && plan.revision <= oldPlan.revision)
    invalid("夜巡 v2 计划修改必须递增 revision");

  const chips = new Map(plan.chips.map((chip) => [chip.id, chip]));
  for (const oldChip of oldPlan.chips) {
    const chip = chips.get(oldChip.id);
    if (!chip) {
      // 自定义芯片只有在最终计划里不再占用插槽时才能删除。
      if (oldChip.origin !== "custom" || plan.slots.some((slot) => slot.chipId === oldChip.id))
        invalid("夜巡芯片不能删除或仍被插槽使用");
      continue;
    }
    if (chip.kind !== oldChip.kind || chip.origin !== oldChip.origin ||
        chip.code !== oldChip.code || chip.templateRevision < oldChip.templateRevision)
      invalid("夜巡芯片身份或模板 revision 不能回退");
    for (let index = 0; index < oldChip.templateHistory.length; index += 1) {
      if (!equivalent(chip.templateHistory[index], oldChip.templateHistory[index]))
        invalid("夜巡芯片模板历史不能改写");
    }
  }

  const slots = new Map(plan.slots.map((slot) => [slot.id, slot]));
  for (const oldSlot of oldPlan.slots) {
    const slot = slots.get(oldSlot.id);
    if (slot && (slot.chipId !== oldSlot.chipId || slot.chipRevision !== oldSlot.chipRevision))
      invalid("夜巡现存插槽的芯片及锁定版本不能改写");
  }

  if (plan.supplementArchive.length < oldPlan.supplementArchive.length ||
      oldPlan.supplementArchive.some((entry, index) => !equivalent(entry, plan.supplementArchive[index])))
    invalid("夜巡今晚补充归档只能追加");
}

export function validateHistory(
  previous,
  next,
  {
    allowConnections = false,
    allowOrigins = false,
    allowAssetDelete = false,
    restrictAssetDeletion = false,
    allowKnowledge = false,
    allowActivity = false,
    allowCollab = false,
    allowBriefs = false,
    allowLearningFolders = false,
    allowProfile = false,
    allowCandidateImport = false,
    allowSkillSourceAdoptions = false,
    allowReverseService = false,
    allowReverseImport = false,
    allowReverseSkill = false,
    allowProjectDesk = false,
    allowReverseReports = false,
  } = {},
) {
  validateReverseHistory(previous,next,{ allowReverseService, allowReverseImport, allowReverseSkill });
  validateNightV2History(previous, next);
  if (
    !allowLearningFolders &&
    !equivalent(previous?.learning?.folders || [], next.learning?.folders || [])
  )
    invalid("书架文件夹只能在设置中通过专用操作修改");
  // 三区规则、个人说明共享授权与修改建议只能经由专用操作更新（切片 3.2/3.3）。
  if (
    !allowProfile &&
    (!equivalent(previous?.knowledgeZones, next.knowledgeZones) ||
      !equivalent(previous?.profileProposals || [], next.profileProposals || []))
  )
    invalid("三区规则与个人说明建议只能通过专用操作更新");
  validateProfileHistory(
    previous?.profileProposals || [],
    next.profileProposals || [],
  );
  validateCandidateHistory(
    previous?.revisionCandidates || [],
    next.revisionCandidates || [],
    allowCandidateImport,
  );
  validateActivityHistory(previous?.assetActivity || [], next.assetActivity || [], allowActivity);
  validateCollabHistory(previous?.collabLog || [], next.collabLog || [], allowCollab);
  validateBriefHistory(previous?.briefReads || [], next.briefReads || [], allowBriefs);
  validateProjectDeskHistory(previous?.projectDesk || [], next.projectDesk || [], allowProjectDesk);
  validateReverseReportHistory(previous?.reverseReports || [], next.reverseReports || [], allowReverseReports);
  validateSkillSourceAdoptionHistory(previous?.skillSourceAdoptions || [], next.skillSourceAdoptions || [], allowSkillSourceAdoptions);
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
  for (const old of previous.scrolls || []) {
    const scroll = next.scrolls?.find(item => item.id === old.id);
    if (!scroll) invalid("卷历史不能直接移除");
    if (!old.deletedAt && scroll.deletedAt && (
      previous.reverseRecords?.some(record => record.imports?.some(item => item.kind === "scroll" && item.scrollId === old.id)) ||
      previous.notes?.some(note => note.refined?.scrollId === old.id)
    )) invalid("卷仍被随手记或逆向记录引用，无法删除");
  }
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
      if (old.demo && !restrictAssetDeletion) continue;
      invalid("资产只能通过仓库删除入口归档，不能直接移除历史");
    }
    if (
      asset.type !== old.type ||
      asset.demo !== old.demo ||
      asset.createdAt !== old.createdAt
    )
      invalid("资产身份不可更改");
    if (!equivalent(asset.origin, old.origin)) invalid("来源关系不可更改");
    if (!old.archived && asset.archived && restrictAssetDeletion && !allowAssetDelete)
      invalid("资产删除只能通过专用操作核对引用后执行");
    if (
      asset.versions.length < old.versions.length ||
      !old.versions.every((v, i) => equivalent(v, asset.versions[i]))
    )
      invalid("历史版本不可覆盖；请创建新版本");
  }
}

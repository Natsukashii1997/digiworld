import { copyText } from './data-flight.js';
import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  Plus,
  Pin,
  ArrowUpRight,
  Copy,
  Download,
  Trash2,
  FileText,
  Upload,
  PenLine,
  Folder,
  RefreshCw,
} from "lucide-react";
import { strToU8 } from "fflate";
import { request } from "./api.js";
import "./assets-detail.css";
import "./assets-quick-copy.css";
import "./assets-v2.css";
import { hasSkillPackage, designCopyText, designCallTemplate, designKindLabel, isLinkedDesignSkill, normalizeDesignRepo, normalizeRepoPath } from "./design-asset.js";
import { uploadDesignImage, readDesignImage } from "./design-images.js";
import { readSkillZip, buildSkillZip } from "./skill-package.js";
import { isInstallSkill, isSelfSkill, skillInstallText, validateInstallUrl } from "./skill-install.js";
import { SkillDelivery } from "./SkillDelivery.jsx";
import { SkillCopies } from "./SkillCopies.jsx";
import { SkillPublish } from "./AgentWriteUI.jsx";
import { McpDelivery } from "./McpDelivery.jsx";
import { codexMcpDelivery, validateMcpConfig, validateMcpVersion } from "./mcp-config.js";
import { SkillPoolPublish } from "./SkillPoolPublish.jsx";
import { SkillOrigin } from "./SkillSources.jsx";
import { current, makeAsset, revise } from "./store.js";
import {
  WORKFLOW_TEMPLATE_ACTORS,
  freshDesignImplementationV1,
  validateWorkflowTemplate,
} from "./workflow-template.js";
import { AssetHistory } from "./AssetHistory.jsx";
import {
  WorkflowReferenceEditor,
  WorkflowReferenceList,
  WorkflowDelivery,
  readWorkflow,
} from "./WorkflowReferences.jsx";
import { buildWorkflowBundle, workflowText } from "./workflow-references.js";
import {
  Button,
  Badge,
  Empty,
  FilterTabs,
  PageHeading,
  Dialog,
  Cover,
  HoloEgg,
  TypeIcon,
  typeLabel,
} from "./components.jsx";
import { AssetUsage, useAssetActivity } from "./AssetUsage.jsx";
import { AssetEvolution } from "./AssetEvolution.jsx";
import { RuleInstall } from "./RuleInstall.jsx";
import { Odometer } from "./Odometer.jsx";
import { usageByAsset } from "./asset-usage.js";
import { removeAssetFromWarehouse } from "./asset-delete.js";
import { assetHit, terms } from "./search.js";
import { stageOf, glyphOf, Pixel } from "./pixel.jsx";
import { BADGES, DEFAULT_CATEGORIES, UNSORTED, UNSORTED_NAME, badgesOf, categoriesOf, categoryColor, categoryOf, hasCategory, shortDay, skillBadgesOf, skillCategoryOf } from "./asset-categories.js";
import { useCockpit } from "./cockpit-ui.jsx";

export function download(name, bytes, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function copy(text, notify) {
  try {
    await copyText(text);
    notify("已复制到剪贴板");
    return true;
  } catch {
    notify("无法访问剪贴板，请选中文字后手动复制", "error");
    return false;
  }
}
async function copyAssetVersion(asset, version, activity, notify) {
  if (!activity.beginCopy()) return;
  try {
    let text = version.content;
    let delivery = null;
    if (asset.type === "Workflow") {
      const fresh = await readWorkflow(asset.id, version.id);
      text = workflowText(fresh.version, fresh.assets);
    } else if (asset.type === "Skill" && isInstallSkill(version)) {
      text = skillInstallText(version);
    } else if (hasSkillPackage(asset, version)) {
      delivery = await request("/deliveries", { assetId: asset.id, versionId: version.id });
      text = delivery.instructions;
    } else if (asset.type === "Design") {
      text = designCopyText(version);
    } else if (asset.type === "MCP") {
      text = JSON.stringify(validateMcpVersion(version), null, 2) + "\n";
    }
    if (!(await copy(text, notify))) return;
    const action = { Prompt: "copy-prompt", Rule: "copy-rule", Workflow: "copy-workflow", Skill: "copy-skill", Design: "copy-design", MCP: "copy-mcp-config" }[asset.type];
    const recorded = await activity.record({ kind: "use", action, versionId: version.id, ...(delivery ? { deliveryId: delivery.id } : {}) }, true);
    if (delivery) {
      try { await request("/deliveries/copied", { id: delivery.id }); }
      catch { notify("安装口令已复制，链接状态未确认，请在详情核对", "error"); }
    }
    if (!recorded) notify("全文已复制，使用记录待核对", "error");
  } catch (error) {
    notify(error.message || "复制失败，请刷新后重试", "error");
  } finally {
    activity.endCopy();
  }
}
// labeled：资产卡底部常驻的带字按钮（#93）；不带时是原来的图标按钮。
export function AssetCopyButton({ asset, state, adoptState, notify, disabled, labeled = false }) {
  const version = current(asset);
  const activity = useAssetActivity(asset, state, adoptState);
  const label = copyLabel(asset, version);
  return <>
    <button type="button" className={labeled ? "asset-copy-labeled" : "asset-copy"}
      aria-label={`${label} ${version.title}`} title={activity.pending ? "记录待核对" : label}
      disabled={disabled || activity.busy || !!activity.pending}
      onClick={(event) => { if (event.detail <= 1) copyAssetVersion(asset, version, activity, notify); }}>
      <Copy size={labeled ? 15 : 17} aria-hidden="true" />
      {labeled && <span>{label}</span>}
    </button>
    {activity.pending && <div className="asset-copy-recovery">
      <p role="status">{activity.message || (activity.pending.kind === "use" ? "全文已复制，使用记录待核对" : "记录结果待核对，请先查询记录")}</p>
      <Button secondary disabled={activity.busy} onClick={activity.query}>查询记录</Button>
      {activity.absentRevision !== null && <>
        {activity.pending.kind && <Button secondary disabled={activity.busy} onClick={activity.retry}>补记记录</Button>}
        <Button secondary disabled={activity.busy} onClick={activity.dismissAbsent}>暂不保存此记录</Button>
      </>}
    </div>}
  </>;
}
// 复制按钮文字（#93 第三批）：设计 Skill「复制调用指令」，设计 Prompt「复制全文」；旧版 ZIP 设计仍走交付。
function copyLabel(asset, version) {
  if (asset.type === "Design") return hasSkillPackage(asset, version) ? "复制生图提示词" : isLinkedDesignSkill(version) ? "复制调用指令" : "复制全文";
  if (asset.type === "Skill") return isInstallSkill(version) ? "复制安装话术" : "复制安装口令";
  return asset.type === "MCP" ? "复制配置定义" : "复制全文";
}
// 未删除的同类资产按创建先后连续编号，例如 SKL.01；筛选与排序不改编号。
export function serialsOf(assets) {
  const out = {};
  for (const type of ["Skill", "Prompt", "Workflow", "Rule", "MCP", "Design"])
    assets
      .filter((a) => !a.archived && a.type === type)
      .sort((a, b) => a.versions[0].at.localeCompare(b.versions[0].at))
      .forEach((a, i) => (out[a.id] = i + 1));
  return out;
}
const HANDOFF = {
  Design: ["复制设计 Prompt 全文或设计 Skill 调用指令", "粘贴给 GPT 或任意 Agent，在最后补本次需求", "设计 Skill 会先检查有没有装，没装就从 GitHub 装"],
  Skill: ["复制口令（含 10 分钟下载链接）", "粘贴给任意 Agent", "由它下载完整包并确认安装范围"],
  InstallSkill: ["复制安装话术", "粘贴给 Claude Code 或 Codex", "它按安装地址里的文档装好并试用一次"],
  Prompt: ["复制完整提示词", "粘贴到 Agent 对话", "按需补充本次背景"],
  Workflow: ["复制流程与固定引用", "交给 Agent 按步骤推进", "引用版本不会随上游变动"],
  Rule: ["装进项目的 AGENTS.md 或 CLAUDE.md", "只维护文件里的托管区块", "模板改版后逐个预览再升级"],
  MCP: ["选择已登记的 Codex CLI 目标", "复制或下载该固定版本的 TOML 片段", "配置到目标后在新会话核验连接与采用"],
};
const CONTENT_LABEL = {
  Design: "设计 Prompt 正文",
  Prompt: "提示词全文",
  Workflow: "工作流内容",
  Rule: "规则正文",
};
const CONTENT_HINT = {
  Design: "你确认过的设计指令：风格、配色、字体、版式和不要做的事……",
  Prompt: "角色、背景、任务、约束、期望输出……",
  Workflow: "目标、输入、步骤、检查点、人工确认点、交付标准……",
  Rule: "入口文件、CURRENT 格式、认领与交接规则、验证与证据要求……",
};
function originLabel(a) {
  return a.demo
    ? "示例"
    : a.origin?.kind === "derived"
      ? "个人改版"
      : a.origin?.kind === "local"
        ? "本机收录"
        : "我的";
}
// 资产仓库只留三页（#93，用户 2026-11-19）：工作流、规则、焚决、MCP 的数据保留，但不在这里显示。
export const ASSET_TABS = [
  ["Prompt", "Prompt"],
  ["Design", "Design"],
  ["Skill", "Skill"],
];
const TAB_IDS = ASSET_TABS.map(([id]) => id);


const TYPE_COLOR = { Design: "var(--pink)", Skill: "var(--orange)", Workflow: "var(--violet)", Rule: "var(--lcd)", MCP: "var(--violet)" };
function cardBody(asset, version) {
  if (asset.type === "Prompt") return version.content || version.description;
  if (asset.type === "Design") return version.description;
  return version.description || version.content;
}
// Design 页两种形式各一种固定色（定稿第 7 版）：设计 Skill 橙、设计 Prompt 粉。
const DESIGN_KINDS = [["skill", "设计 Skill", "var(--orange)"], ["prompt", "设计 Prompt", "var(--pink)"]];
const designKindOf = (version) => (version.design?.kind === "prompt" ? "prompt" : "skill");
const designColor = (version) => DESIGN_KINDS.find(([id]) => id === designKindOf(version))[2];

// 效果图：按 ID 从本机 design-images 读回；没有图时显示定稿里的占位。
function DesignShot({ image, title }) {
  const [state, setState] = useState({});
  useEffect(() => {
    if (!image) return setState({});
    let live = true, url;
    setState({});
    readDesignImage(image).then((blob) => { if (live) { url = URL.createObjectURL(blob); setState({ url }); } })
      .catch((error) => { if (live) setState({ error: error.message }); });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [image]);
  if (state.url) return <img className="ac2-shot-img" src={state.url} alt={`${title} 效果图`} />;
  return (
    <span className="ac2-noimg">
      <b>{!image ? "还没有效果图" : state.error ? "效果图暂时读不到" : "正在读取效果图…"}</b>
      <small>{!image ? "上传一张，让人一眼看到这个风格" : state.error || ""}</small>
    </span>
  );
}

function AssetCard({ asset: a, index, state, save, adoptState, notify, select, categories, deleting, onDelete, usage }) {
  const v = current(a);
  const sorted = hasCategory(a.type);
  const cat = sorted ? categoryOf(a, categories, v) : null;
  const catInfo = cat && categories.find((c) => c.id === cat.id);
  const design = a.type === "Design";
  const color = sorted ? (catInfo ? categoryColor(catInfo) : "var(--muted)") : design ? designColor(v) : TYPE_COLOR[a.type];
  const badges = badgesOf(a, usage.uses);
  const label = sorted ? (catInfo?.name || UNSORTED_NAME) : design ? designKindLabel(v) : typeLabel[a.type];
  async function changeCategory(value) {
    await save({
      ...state,
      assets: state.assets.map((x) => {
        if (x.id !== a.id) return x;
        const { category: _old, ...rest } = x;
        return value ? { ...rest, category: value } : rest;
      }),
    });
  }
  return (
    <article className={`asset-card ac2${design ? " ac2-design" : ""}`} style={{ "--i": Math.min(index, 12), "--tc": color }}>
      <button className={`card-open type-${a.type}`} onClick={() => select(a.id)} aria-label={`查看 ${v.title}`}>
        {design ? (
          <span className="ac2-screen ac2-shot"><DesignShot image={v.design.image} title={v.title} /></span>
        ) : <span className="ac2-screen" aria-hidden="true">
          {/* 自建 Skill 保留全息蛋（定稿卡片同样是投影台上的蛋）；按分类色染色在第二批。 */}
          {a.type === "Skill" && isSelfSkill(a) && /^egg\d$/.test(glyphOf(a) || "")
            ? <span className="ac2-glyph"><HoloEgg sprite={glyphOf(a)} size={64} /></span>
            : <Pixel sprite={glyphOf(a)} size={64} className="ac2-glyph" />}
          {/* 次数变化时像里程表一样滚到新值（R87-S1）。 */}
          <span className={`ac2-uses${badges.includes("HOT") ? " hot" : usage.count ? "" : " zero"}`}>
            <Odometer value={usage.count} /><small>次</small>
          </span>
        </span>}
        <span className="sr-only">使用 {usage.count} 次</span>
        <span className="ac2-body">
          <h3 className={design && isLinkedDesignSkill(v) ? "mono" : ""}><span className="ac2-hl">{v.title}</span></h3>
          <span className={`ac2-text${cardBody(a, v) ? "" : " empty"}`}>{cardBody(a, v) || (design ? "还没有风格说明。" : "还没有正文。")}</span>
          {design && isLinkedDesignSkill(v) && (
            <span className="ac2-repo">{v.design.repo.replace("https://", "")}{v.design.path ? ` · ${v.design.path}` : ""}</span>
          )}
        </span>
      </button>
      {badges.length > 0 && (
        <span className="ac2-badges">
          {badges.map((b) => (
            <span key={b} className={`ac2-badge b-${b.toLowerCase()}`} title={`${BADGES[b].name}：${BADGES[b].rule}`}>{b}</span>
          ))}
        </span>
      )}
      <span className="ac2-acts">
        <button
          type="button"
          aria-label={`${a.pinned ? "取消置顶" : "置顶"} ${v.title}`}
          aria-pressed={!!a.pinned}
          title={a.pinned ? "取消置顶" : "置顶"}
          className={`pin-button ${a.pinned ? "is-pinned" : ""}`}
          onClick={() => save({ ...state, assets: state.assets.map((x) => (x.id === a.id ? { ...x, pinned: !x.pinned } : x)) })}
        >
          <Pin size={14} fill={a.pinned ? "currentColor" : "none"} />
        </button>
        <button type="button" className="asset-delete" aria-label={`删除 ${v.title}`} title={`删除 ${v.title}`} disabled={deleting} onClick={() => onDelete(a)}>
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </span>
      {sorted ? (
        <label className={`ac2-cat${cat.inferred ? " inferred" : ""}`} title={cat.inferred ? "按内容自动归组；选一个分类就固定下来" : "分类"}>
          <i aria-hidden="true" />
          <span>{label}</span>
          <select aria-label={`${v.title} 的分类`} value={cat.inferred ? "" : cat.id} onChange={(e) => changeCategory(e.target.value)}>
            <option value="">{cat.inferred ? `自动：${label}` : "改回自动归组"}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      ) : (
        <span className="ac2-cat static"><i aria-hidden="true" /><span>{label}</span></span>
      )}
      <div className="ac2-foot">
        {/* 设计卡底部只写来源（定稿第 7 版），其余卡是来源 · 日期。 */}
        <span className="ac2-from">{design ? (isLinkedDesignSkill(v) ? "从 GitHub 安装" : originLabel(a) === "示例" ? "示例" : "我确认过的") : `${originLabel(a)} · ${shortDay(v.at)}`}</span>
        <AssetCopyButton asset={a} state={state} adoptState={adoptState} notify={notify} disabled={deleting} labeled />
      </div>
    </article>
  );
}

// Skill 页（#93 第二批）：只读 my-skills 登记的 skill。没有详情、没有删除；分类与置顶按名字存在 skillMeta。
const SKILL_BADGE_RULE = { NEW: "首次登记 7 天内", HOT: "近 30 天调用 ≥ 5 次（只记 Claude 端）", UPD: "7 天内有提交", IDLE: "登记超过 30 天、近 30 天没调用" };
function SkillCard({ item, index, meta, categories, usageSince, onMeta, notify }) {
  const cat = skillCategoryOf(item, meta, categories);
  const catInfo = categories.find((c) => c.id === cat.id);
  const label = catInfo?.name || UNSORTED_NAME;
  const badges = skillBadgesOf(item, usageSince);
  const total = item.uses?.total || 0;
  // 调用记录只记 Claude 端：没有记录文件，或只给了 Codex 且 0 次时显示「–」，不冒充 0。
  const unrecorded = !item.uses || (total === 0 && !item.agents.includes("Claude"));
  const pinned = !!meta?.pinned;
  return (
    <article className="asset-card ac2 ac2-skill" style={{ "--i": Math.min(index, 12), "--tc": catInfo ? categoryColor(catInfo) : "var(--muted)" }}>
      <div className="card-open">
        <span className="ac2-screen" aria-hidden="true">
          <span className="ac2-glyph"><HoloEgg sprite={glyphOf({ type: "Skill", id: item.name })} size={64} tint /></span>
          <span className={`ac2-uses${unrecorded ? " none" : badges.includes("HOT") ? " hot" : total ? "" : " zero"}`}>
            {unrecorded ? "–" : <Odometer value={total} />}<small>次</small>
          </span>
        </span>
        <span className="sr-only">{unrecorded ? "调用次数未记录" : `调用 ${total} 次`}</span>
        <span className="ac2-body">
          <h3 className="mono"><span className="ac2-hl">{item.name}</span></h3>
          <span className={`ac2-text${item.description ? "" : " empty"}`}>{item.description || (item.missing ? "没读到 SKILL.md 的说明。" : "SKILL.md 里没有说明。")}</span>
          {item.agents.length > 0 && <span className="ac2-agents">{item.agents.map((a) => <span key={a}>{a}</span>)}</span>}
        </span>
      </div>
      {badges.length > 0 && (
        <span className="ac2-badges">
          {badges.map((b) => <span key={b} className={`ac2-badge b-${b.toLowerCase()}`} title={`${BADGES[b].name}：${SKILL_BADGE_RULE[b]}`}>{b}</span>)}
        </span>
      )}
      <span className="ac2-acts">
        <button type="button" aria-label={`${pinned ? "取消置顶" : "置顶"} ${item.name}`} aria-pressed={pinned} title={pinned ? "取消置顶" : "置顶"}
          className={`pin-button ${pinned ? "is-pinned" : ""}`} onClick={() => onMeta(item.name, { pinned: pinned ? undefined : true })}>
          <Pin size={14} fill={pinned ? "currentColor" : "none"} />
        </button>
      </span>
      <label className="ac2-cat" title={cat.inferred ? "按内容自动归组；选一个分类就固定下来" : "分类"}>
        <i aria-hidden="true" />
        <span>{label}</span>
        <select aria-label={`${item.name} 的分类`} value={cat.inferred ? "" : cat.id} onChange={(e) => onMeta(item.name, { category: e.target.value || undefined })}>
          <option value="">{cat.inferred ? `自动：${label}` : "改回自动归组"}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <div className="ac2-foot">
        <span className="ac2-from">{item.version ? `v${item.version}` : "未定版本"} · {shortDay(item.updatedAt) || "日期未知"}</span>
        <button type="button" className="asset-copy-labeled" aria-label={`复制调用名 ${item.name}`} title={`复制 /${item.name}；Codex 里用 $${item.name}`}
          onClick={() => copy(`/${item.name}`, notify)}>
          <Copy size={15} aria-hidden="true" /><span>复制调用名</span>
        </button>
      </div>
    </article>
  );
}

export function Assets({
  state,
  save,
  adoptState,
  notify,
  filter = "Prompt",
  openCreate,
  select,
  onFilter,
  onSkillCount,
}) {
  const [search, setSearch] = useState(""),
    [sort, setSort] = useState("recent"),
    [cat, setCat] = useState("all"),
    [designKind, setDesignKind] = useState("all"),
    [helpOpen, setHelpOpen] = useState(false);
  const [deleting, setDeleting] = useState(""),
    [blockedDelete, setBlockedDelete] = useState(null);
  const tab = TAB_IDS.includes(filter) ? filter : "Prompt";
  const words = terms(search);
  const categories = categoriesOf(state);
  const assets = state.assets.filter((a) => !a.archived);
  const usage = usageByAsset(assets, state.assetActivity);
  const uses = useMemo(() => {
    const m = new Map();
    for (const r of state.assetActivity || []) if (r.kind === "use") (m.get(r.assetId) || m.set(r.assetId, []).get(r.assetId)).push(r);
    return m;
  }, [state.assetActivity]);
  // Skill 页数据来自 my-skills（只读）；打开资产仓库时读一次，点「刷新」现读。
  const skillsRead = useCockpit("/my-skills");
  const skillItems = skillsRead.data?.available ? skillsRead.data.items : [];
  const skillMeta = state.skillMeta || {};
  useEffect(() => { if (skillsRead.data) onSkillCount?.(skillItems.length); }, [skillsRead.data]);
  const skillTab = tab === "Skill";
  const ofType = skillTab ? skillItems : assets.filter((a) => a.type === tab);
  const catOf = skillTab
    ? (x) => skillCategoryOf(x, skillMeta[x.name], categories).id
    : (a) => categoryOf(a, categories, current(a)).id;
  const skillHit = (x) => { const hay = `${x.name} ${x.description}`.toLowerCase(); return words.every((w) => hay.includes(w)); };
  function saveSkillMeta(name, patch) {
    const next = { ...(skillMeta[name] || {}), ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    const all = { ...skillMeta };
    if (Object.keys(next).length) all[name] = next;
    else delete all[name];
    return save({ ...state, skillMeta: all });
  }
  const catCounts = new Map();
  if (hasCategory(tab)) for (const a of ofType) catCounts.set(catOf(a), (catCounts.get(catOf(a)) || 0) + 1);
  const activeCat = hasCategory(tab) && (cat === UNSORTED || catCounts.has(cat)) ? cat : "all";
  // Design 页按形式筛选（设计 Skill / 设计 Prompt），不用分类。
  const designTab = tab === "Design";
  const kindCounts = new Map(DESIGN_KINDS.map(([id]) => [id, designTab ? ofType.filter((a) => designKindOf(current(a)) === id).length : 0]));
  const activeKind = designTab && kindCounts.get(designKind) ? designKind : "all";
  const narrowed = !!(words.length || activeCat !== "all" || activeKind !== "all");
  // 置顶项在任何排序下都排最前，置顶项之间按使用次数降序，再按最近使用。
  const items = ofType
    .filter((a) => (activeCat === "all" || catOf(a) === activeCat) && (activeKind === "all" || designKindOf(current(a)) === activeKind) && (!words.length || (skillTab ? skillHit(a) : assetHit(a, words))))
    .map((a) => {
      if (skillTab)
        return { item: a, pinned: !!skillMeta[a.name]?.pinned, count: a.uses?.total || 0, lastAt: a.uses?.lastAt || "", at: a.updatedAt || "", title: a.name };
      const u = usage.get(a.id);
      return { item: a, pinned: !!a.pinned, count: u.count, lastAt: u.lastAt, at: current(a).at, title: current(a).title };
    });
  const byUse = (a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt);
  const bySort = (a, b) =>
    sort === "name" ? a.title.localeCompare(b.title, "zh")
      : sort === "most" ? byUse(a, b) || b.at.localeCompare(a.at)
        : sort === "used" ? b.lastAt.localeCompare(a.lastAt) || b.at.localeCompare(a.at)
          : b.at.localeCompare(a.at);
  const shown = items.sort((a, b) => b.pinned - a.pinned || (a.pinned && b.pinned && byUse(a, b)) || bySort(a, b));
  const pinnedCount = shown.filter((x) => x.pinned).length;
  async function deleteAsset(asset) {
    if (deleting) return;
    setDeleting(asset.id);
    try {
      const result = await removeAssetFromWarehouse(asset.id, state.revision, adoptState);
      if (result.deleted) {
        notify("资产已从仓库删除");
        const position = shown.findIndex((item) => item.item.id === asset.id);
        requestAnimationFrame(() => {
          const controls = [...document.querySelectorAll(".asset-grid .asset-delete")];
          (controls[Math.min(position, controls.length - 1)] || document.querySelector(".asset-heading-actions input"))?.focus();
        });
      } else setBlockedDelete({ title: current(asset).title, blockers: result.blockers });
    } catch (error) {
      notify(error.message || "删除结果未确认，请刷新后核对", "error");
    } finally { setDeleting(""); }
  }
  const chips = hasCategory(tab) && ofType.length > 0 && (
    <div className="ac2-chips" role="group" aria-label="按分类筛选">
      <button type="button" className="ac2-chip" aria-pressed={activeCat === "all"} onClick={() => setCat("all")}>全部<em>{ofType.length}</em></button>
      {categories.filter((c) => catCounts.has(c.id)).map((c) => (
        <button type="button" key={c.id} className="ac2-chip" style={{ "--tc": categoryColor(c) }} aria-pressed={activeCat === c.id} onClick={() => setCat(c.id)}>
          <i aria-hidden="true" />{c.name}<em>{catCounts.get(c.id)}</em>
        </button>
      ))}
      <button type="button" className="ac2-chip wait" aria-pressed={activeCat === UNSORTED} disabled={!catCounts.has(UNSORTED)} onClick={() => setCat(UNSORTED)}>
        {UNSORTED_NAME}<em>{catCounts.get(UNSORTED) || 0}</em>
      </button>
    </div>
  );
  const sampleSkill = designTab && ofType.map(current).find(isLinkedDesignSkill);
  const designTop = designTab && (
    <>
      <div className="ac2-design-intro">
        <span className="tag">NEW</span>
        <span><b>新建设计时选一种：</b>「设计 Prompt」贴上你确认过的指令，复制时原样给出；「设计 Skill」只填 skill 名和 GitHub 地址，调用指令由系统按固定模板生成。都可以上传一张效果图，再写一两句风格说明。</span>
      </div>
      <details className="ac2-calltpl" open>
        <summary>设计 Skill 的固定调用指令{sampleSkill ? `（以 ${sampleSkill.design.skillName} 为例）` : ""}：复制时自动填名字和地址，你在最后补需求</summary>
        <pre>{designCallTemplate(sampleSkill ? sampleSkill.design : { skillName: "skill 名", repo: "GitHub 地址" })}</pre>
      </details>
      {ofType.length > 0 && (
        <div className="ac2-chips" role="group" aria-label="按形式筛选">
          <button type="button" className="ac2-chip" aria-pressed={activeKind === "all"} onClick={() => setDesignKind("all")}>全部<em>{ofType.length}</em></button>
          {DESIGN_KINDS.map(([id, name, c]) => (
            <button type="button" key={id} className="ac2-chip" style={{ "--tc": c }} aria-pressed={activeKind === id} disabled={!kindCounts.get(id)} onClick={() => setDesignKind(id)}>
              <i aria-hidden="true" />{name}<em>{kindCounts.get(id)}</em>
            </button>
          ))}
        </div>
      )}
    </>
  );
  return (
    <>
      <PageHeading
        page="assets"
        help={<button type="button" className="page-help" aria-label="这页怎么用" onClick={() => setHelpOpen(true)}>?</button>}
        action={
          <div className="asset-heading-actions">
            <label className="inline-search">
              <Search size={15} />
              <input placeholder={skillTab ? "搜索 skill 名、说明" : "搜索标题、说明、正文"} aria-label="在资产中搜索" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            {skillTab ? (
              <Button secondary disabled={skillsRead.busy} onClick={skillsRead.reload}>
                <RefreshCw size={16} />
                {skillsRead.busy ? "正在读取…" : "刷新"}
              </Button>
            ) : (
              <Button onClick={() => openCreate(tab)}>
                <Plus size={16} />
                新建
              </Button>
            )}
          </div>
        }
      />
      <div className="asset-toolbar">
        <FilterTabs
          label="资产类型"
          items={ASSET_TABS.map(([id, label]) => ({ id, label, count: id === "Skill" ? skillItems.length : assets.filter((a) => a.type === id).length }))}
          value={tab}
          onChange={(id) => { setCat("all"); setDesignKind("all"); onFilter(id); }}
        />
        <div className="toolbar-right">
          <select aria-label="排序方式" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">最近更新</option>
            <option value="most">最常用</option>
            <option value="used">最近使用</option>
            <option value="name">名称排序</option>
          </select>
        </div>
      </div>
      {chips}
      {designTop}
      <div className="collection-meta">
        <span>
          当前结果 · <b>{shown.length}</b>
          {pinnedCount > 0 && <>{" "}· 置顶 <b>{pinnedCount}</b></>}
          {skillTab && skillsRead.data?.available && <>{" "}· 只读 my-skills</>}
        </span>
      </div>
      <div className="asset-grid ac2-grid">
        {shown.map(({ item: a }, i) => skillTab ? (
          <SkillCard key={a.name} item={a} index={i} meta={skillMeta[a.name]} categories={categories}
            usageSince={skillsRead.data?.usageSince} onMeta={saveSkillMeta} notify={notify} />
        ) : (
          <AssetCard
            key={a.id}
            asset={a}
            index={i}
            state={state}
            save={save}
            adoptState={adoptState}
            notify={notify}
            select={select}
            categories={categories}
            deleting={!!deleting}
            onDelete={deleteAsset}
            usage={{ count: usage.get(a.id).count, uses: uses.get(a.id) || [] }}
          />
        ))}
      </div>
      {shown.length === 0 && narrowed && (
        <Empty
          sprite="numemon"
          title="没有匹配的资产"
          action={<div className="empty-actions"><Button secondary onClick={() => { setSearch(""); setCat("all"); setDesignKind("all"); }}>清除筛选</Button></div>}
        >
          {words.length ? `没有资产同时匹配“${words.join(" ")}”和当前筛选条件。` : designTab ? "当前形式下没有设计。" : "当前分类下没有资产。"}
        </Empty>
      )}
      {skillTab && shown.length === 0 && !narrowed && (
        <Empty
          sprite="numemon"
          title={!skillsRead.data ? (skillsRead.error ? "读不到 my-skills" : "正在读取 my-skills…") : skillsRead.data.available ? "my-skills 里还没有登记的 skill" : "读不到 my-skills"}
          action={<Button secondary disabled={skillsRead.busy} onClick={skillsRead.reload}><RefreshCw size={16} />刷新</Button>}
        >
          {skillsRead.error ? (skillsRead.error.message || "读取失败，请稍后刷新。")
            : skillsRead.data && !skillsRead.data.available ? `${skillsRead.data.error}（${skillsRead.data.sources.registry}）。`
              : "在 my-skills 的 links.tsv 登记一个 skill，刷新后这里就多一颗蛋。"}
        </Empty>
      )}
      {!skillTab && shown.length === 0 && !narrowed && (
        <Empty
          sprite="numemon"
          title="还没有符合条件的资产"
          action={<Button secondary onClick={() => openCreate(tab)}><Plus size={16} />新建</Button>}
        >
          {tab === "Prompt" ? "新建一条 Prompt，或让猛鬼兽批量导入。" : "新建一个设计：贴上确认过的设计 Prompt，或登记一个设计 Skill。"}
        </Empty>
      )}
      {helpOpen && (
        <Dialog recoverFocus title="资产仓库 · 这页怎么用" onClose={() => setHelpOpen(false)}>
          <p>资产仓库分 Prompt、Design、Skill 三页。Prompt 与 Skill 共用一套分类筛选；没选过分类的按内容自动归组，在卡片右下角选一个分类就固定下来。</p>
          <p>左上角的小标识按数据自动点亮：NEW 入库 7 天内，HOT 近 30 天复制 ≥ 5 次，UPD 7 天内改过，IDLE 入库超过 30 天一次没用过。</p>
          <p>Design 页有两种形式：设计 Prompt 复制时原样给出正文；设计 Skill 只登记 skill 名和 GitHub 地址，复制时生成固定调用指令（先查有没有装，没装就从 GitHub 装，装好就按你的需求调用）。卡片上的图是效果图，下面的小字是风格说明。</p>
          <p>Skill 页只读展示 my-skills 登记的 skill（以 links.tsv 为准），在 my-skills 新登记一个，下次打开或点「刷新」就多一颗蛋。「复制调用名」复制 /名称，粘贴给 Claude Code；在 Codex 里改用 $名称。次数来自 agent-kit 的调用记录，只记 Claude 端（11-07 起）；NEW 是首次登记 7 天内，UPD 是 7 天内有提交，IDLE 等调用记录攒满 30 天后才判断。</p>
          <p>复制后的实际采用与运行结果，以接收方回执和项目协议为准。</p>
        </Dialog>
      )}
      {blockedDelete && <Dialog recoverFocus title="无法删除资产" onClose={() => setBlockedDelete(null)}>
        <p>“{blockedDelete.title}”仍被以下内容引用，暂不能删除。固定历史引用不可改写；可解除的当前引用处理后可重试。</p>
        <ul className="asset-delete-blockers">{blockedDelete.blockers.map((item, index) =>
          <li key={`${item.kind}-${item.ownerId}-${index}`}>{item.label}{item.fixed && <small>固定历史</small>}</li>)}</ul>
      </Dialog>}
    </>
  );
}

function WorkflowTemplateEditor({ value, onChange, disabled }) {
  const changeStage = (index, key, next) =>
    onChange({
      ...value,
      stages: value.stages.map((stage, i) =>
        i === index ? { ...stage, [key]: next } : stage),
    });
  const addStage = () => {
    if (value.stages.length >= 20) return;
    onChange({
      ...value,
      stages: [...value.stages, {
        number: value.stages.length + 1,
        label: "新阶段",
        defaultActor: "codex",
        method: "填写本阶段的方法与工具",
        artifact: "待定义交付物",
        gate: "待定义过关条件",
        skippable: false,
      }],
    });
  };
  const removeStage = (index) => {
    if (value.stages.length <= 1) return;
    onChange({
      ...value,
      stages: value.stages.filter((_, i) => i !== index).map((stage, i) => ({
        ...stage,
        number: i + 1,
      })),
    });
  };
  return (
    <fieldset className="workflow-template-editor" disabled={disabled}>
      <legend>协同模板 · 结构化站点</legend>
      <p className="helper">运行会锁定此资产的具体版本。阶段进度与过关结论仍以项目协议文件为准。</p>
      <div className="workflow-template-options">
        <label>
          默认推进节奏
          <select value={value.defaultPace} onChange={(e) => onChange({ ...value, defaultPace: e.target.value })}>
            <option value="per-run">逐单停等</option>
            <option value="continuous">连续推进，最后一次验收</option>
          </select>
        </label>
        <label>
          同一项返修升级次数
          <input type="number" min="1" max="10" step="1" required value={value.escalationAfter}
            onChange={(e) => onChange({ ...value, escalationAfter: e.target.value === "" ? "" : Number(e.target.value) })} />
        </label>
      </div>
      <div className="workflow-template-stages">
        {value.stages.map((stage, index) => (
          <details key={index} className="workflow-template-stage">
            <summary><span className="mono">{String(stage.number).padStart(2, "0")}</span> {stage.label || "未命名阶段"}<small>{WORKFLOW_TEMPLATE_ACTORS.find(([id]) => id === stage.defaultActor)?.[1] || "执行者未知"}</small></summary>
            <div className="workflow-template-stage-fields">
              <label>阶段名称
                <input maxLength="80" value={stage.label} onChange={(e) => changeStage(index, "label", e.target.value)} />
              </label>
              <label>默认执行者
                <select value={stage.defaultActor} onChange={(e) => changeStage(index, "defaultActor", e.target.value)}>
                  {WORKFLOW_TEMPLATE_ACTORS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              <label>方法 / 工具 / Skill
                <textarea rows="2" maxLength="2000" value={stage.method} onChange={(e) => changeStage(index, "method", e.target.value)} />
              </label>
              <label>交付物
                <input maxLength="200" value={stage.artifact} onChange={(e) => changeStage(index, "artifact", e.target.value)} />
              </label>
              <label>过关条件
                <textarea rows="2" maxLength="1000" value={stage.gate} onChange={(e) => changeStage(index, "gate", e.target.value)} />
              </label>
              <label className="workflow-template-skip">
                <input type="checkbox" checked={stage.skippable} onChange={(e) => changeStage(index, "skippable", e.target.checked)} />
                此站允许跳过
              </label>
              <button type="button" className="workflow-template-remove" disabled={value.stages.length === 1} onClick={() => removeStage(index)}>移除这一站</button>
            </div>
          </details>
        ))}
      </div>
      <button type="button" className="workflow-template-add" disabled={value.stages.length >= 20} onClick={addStage}>＋ 增加阶段</button>
    </fieldset>
  );
}

function WorkflowTemplateDetail({ value }) {
  if (!value) return null;
  return (
    <section className="workflow-template-detail" aria-label="协同模板结构">
      <h3>协同模板 · {value.stages.length} 站</h3>
      <p>默认{value.defaultPace === "continuous" ? "连续推进，最后一次验收" : "逐单停等"} · 同一项第 {value.escalationAfter} 次仍不过时交你决定</p>
      <ol>
        {value.stages.map((stage) => <li key={stage.number}>
          <b>{String(stage.number).padStart(2, "0")} · {stage.label}</b>
          <small>{WORKFLOW_TEMPLATE_ACTORS.find(([id]) => id === stage.defaultActor)?.[1] || stage.defaultActor}{stage.skippable ? " · 可跳过" : ""}</small>
          <span>{stage.method}</span>
          <span>交付：{stage.artifact} · 过关：{stage.gate}</span>
        </li>)}
      </ol>
    </section>
  );
}

export function AssetEditor({
  asset,
  assets = [],
  categories = DEFAULT_CATEGORIES,
  type: initialType,
  onClose,
  onSave,
  notify,
  draft,
}) {
  // draft：从随手记或收藏孵成资产时的预填（标题、正文与 hatchedFrom 来源）；只用于新建。
  const old = asset && current(asset);
  const [type, setType] = useState(asset?.type || initialType || "Prompt"),
    [title, setTitle] = useState(old?.title || draft?.title || ""),
    [description, setDescription] = useState(old?.description || ""),
    [content, setContent] = useState(old?.content || draft?.content || ""),
    [tags, setTags] = useState(old?.tags.join("，") || ""),
    [files, setFiles] = useState(old?.files || []),
    // 设计两种形式（#93 第三批）：新建默认设计 Prompt；设计 Skill 只填名字、GitHub 地址和可选子目录。
    [designKind, setDesignKind] = useState(old?.design?.kind || "prompt"),
    [designSkillName, setDesignSkillName] = useState(old?.design?.skillName || ""),
    [designRepo, setDesignRepo] = useState(old?.design?.repo || ""),
    [designPath, setDesignPath] = useState(old?.design?.path || ""),
    [designImage, setDesignImage] = useState(old?.design?.image || ""),
    // Skill 两种来源：install 填安装地址（默认），self 自建上传 ZIP（用户 2026-10-27）；已有资产不切换。
    [skillMode, setSkillMode] = useState(old ? (isInstallSkill(old) ? "install" : "self") : "install"),
    [installUrl, setInstallUrl] = useState(old?.installUrl || ""),
    [uploading, setUploading] = useState(false),
    [references, setReferences] = useState(old?.references || []),
    [workflowTemplate, setWorkflowTemplate] = useState(old?.workflowTemplate || null),
    [mcpServerId, setMcpServerId] = useState(old?.mcpConfig?.serverId || ""),
    [mcpOrigin, setMcpOrigin] = useState(old?.mcpConfig?.origin || ""),
    [mcpPath, setMcpPath] = useState(old?.mcpConfig?.path || "/mcp"),
    [mcpCredentialEnvVar, setMcpCredentialEnvVar] = useState(old?.mcpConfig?.credentialEnvVar || ""),
    [category, setCategory] = useState(asset?.category || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function importZip(file) {
    if (!file || busy || uploading) return;
    setUploading(true);
    setError("");
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("请导入 10 MB 以内的 ZIP 包");
      const { files: list, content: skillContent } = readSkillZip(
        new Uint8Array(await file.arrayBuffer()),
      );
      setFiles(list);
      if (type !== "Design") setContent(skillContent);
      if (!title) setTitle(file.name.replace(/\.zip$/i, ""));
      notify(`已读取 ${list.length} 个文件，保存后加入资产库`);
    } catch (e) {
      setError(e.message || "无法读取 ZIP，请检查文件格式");
    } finally { setUploading(false); }
  }
  async function pickDesignImage(file) {
    if (!file || busy || uploading) return;
    setUploading(true);
    setError("");
    try {
      setDesignImage(await uploadDesignImage(file));
      notify("效果图已上传，保存后显示在卡片上");
    } catch (e) {
      setError(e.message || "效果图上传失败，请重试");
    } finally { setUploading(false); }
  }
  function designValues() {
    const image = designImage ? { image: designImage } : {};
    if (designKind === "prompt") return { content, design: { kind: "prompt", ...image } };
    const skillName = designSkillName.trim(), path = normalizeRepoPath(designPath);
    if (!skillName) throw new Error("请填写设计 Skill 的名称");
    return { content: "", design: { kind: "skill", skillName, repo: normalizeDesignRepo(designRepo), ...(path ? { path } : {}), ...image } };
  }
  async function submit(e) {
    e.preventDefault();
    if (busy || uploading) return;
    setError("");
    setBusy(true);
    try {
      const parsedTemplate = type === "Workflow" && workflowTemplate
        ? validateWorkflowTemplate(workflowTemplate)
        : null;
      const mcpConfig = type === "MCP" ? validateMcpConfig({
        schema: 1, transport: "streamable-http", serverId: mcpServerId.trim(),
        origin: mcpOrigin.trim(), path: mcpPath.trim(),
        credentialEnvVar: mcpCredentialEnvVar.trim() || null,
      }) : null;
      const values = type === "MCP" ? {
        type, title: mcpConfig.serverId, description: "", content: "", tags: [],
        files: [], source: "个人创建", mcpConfig,
      } : {
        title,
        type,
        description,
        content,
        tags: old && tags === old.tags.join("，") ? old.tags : [
          ...new Set(
            tags
              .split(/[,，\s]+/)
              .map((t) => t.trim())
              .filter(Boolean),
          ),
        ],
        source: old?.source || "个人创建",
        files: type === "Design" || (type === "Skill" && skillMode === "install") ? [] : files,
        ...(type === "Skill" && skillMode === "install" ? { installUrl: validateInstallUrl(installUrl) } : {}),
        ...(type === "Design" ? designValues() : {}),
        ...(type === "Workflow" ? { references } : {}),
        ...(type === "Workflow" ? { workflowTemplate: parsedTemplate } : {}),
      };
      const saved = asset ? revise(asset, values) : makeAsset(draft?.hatchedFrom ? { ...values, hatchedFrom: draft.hatchedFrom } : values);
      // 分类挂在资产上（#93）；空值表示按内容自动归组。
      if (hasCategory(type)) {
        delete saved.category;
        if (category) saved.category = category;
      }
      const success = await onSave(saved);
      if (!success) {
        setError("本次未保存。请查看保存提示，表单内容仍在。");
        return;
      }
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const next = asset ? asset.versions.length + 1 : 1;
  return (
    <Dialog
      title={asset ? "编辑资产 · 保存为新版本" : draft ? "孵成资产" : "新建资产"}
      onClose={onClose}
    >
      <form onSubmit={submit} className={asset ? "asset-form" : "asset-form asset-create"}>
        {(asset || draft) && <div className="form-intro">
          <p>
            {asset
              ? `保存后成为 v${next}.0，v${next - 1}.0 及更早版本完整保留在历史中。`
              : `从${draft.hatchedFrom.kind === "note" ? "随手记" : "个人收藏"}孵化：正文已带入，可以改；保存后原条目显示“已孵成资产”，原条目不变。`}
          </p>
        </div>}
        <div className="type-picker" role="radiogroup" aria-label="资产类型">
          {/* 新建只给 Prompt / Design（#93：Skill 页改为只读 my-skills，用户 2026-11-19）；编辑已有资产时类型不变，原有的三类照旧显示，其他类型只显示它自己。 */}
          {(asset ? (["Prompt", "Design", "Skill"].includes(asset.type) ? ["Prompt", "Design", "Skill"] : [asset.type]) : ["Prompt", "Design"]).map((t, index, types) => (
            <button
              type="button"
              role="radio"
              disabled={!!asset || busy || uploading}
              aria-checked={type === t}
              tabIndex={type === t ? 0 : -1}
              aria-label={typeLabel[t]}
              key={t}
              className={type === t ? "active" : ""}
              onClick={() => setType(t)}
              onKeyDown={(event) => {
                if (asset || busy || uploading) return;
                const next = event.key === "Home" ? 0 : event.key === "End" ? types.length - 1
                  : ["ArrowDown", "ArrowRight"].includes(event.key) ? (index + 1) % types.length
                  : ["ArrowUp", "ArrowLeft"].includes(event.key) ? (index + types.length - 1) % types.length : null;
                if (next === null) return;
                event.preventDefault();
                setType(types[next]);
                event.currentTarget.parentElement.children[next].focus();
              }}
            >
              <TypeIcon type={t} size={18} />
              {t === 'MCP' ? 'MCP' : typeLabel[t]}
            </button>
          ))}
        </div>
        {type === "Skill" && (
          <div className="type-picker skill-mode" role="radiogroup" aria-label="Skill 来源">
            {[["install", "安装地址"], ["self", "自建 · ZIP"]].map(([mode, label]) => (
              <button type="button" role="radio" key={mode} aria-checked={skillMode === mode}
                className={skillMode === mode ? "active" : ""} disabled={!!asset || busy || uploading}
                onClick={() => setSkillMode(mode)}>
                <TypeIcon type="Skill" size={18} self={mode === "self"} />
                {label}
              </button>
            ))}
          </div>
        )}
        {/* 设计先选形式再填字段（#93 第三批）。 */}
        {type === "Design" && <>
          <div className="type-picker skill-mode" role="radiogroup" aria-label="设计形式">
                {DESIGN_KINDS.slice().reverse().map(([kind, name]) => (
                  <button type="button" role="radio" key={kind} aria-checked={designKind === kind}
                    className={designKind === kind ? "active" : ""} disabled={busy || uploading}
                    onClick={() => setDesignKind(kind)}>
                    <TypeIcon type="Design" size={18} />
                    {name}
                  </button>
                ))}
              </div>
              <p className="helper">{designKind === "skill"
                ? "只填 skill 名和 GitHub 地址。复制时生成固定调用指令：先查有没有装，没装就从这个地址装，装好就按需求调用。"
                : "贴上你确认过的设计指令，复制时原样给出，粘贴给 GPT 或任意 Agent。"}</p>
        </>}
        {type === "MCP" ? (
          <>
            <p>只保存公开 HTTP MCP 地址与可选环境变量名引用。首版仅生成 Codex CLI 的 TOML 配置片段；不保存 token、header 值、stdio 命令、Hook 或任意 JSON。</p>
            <label>服务标识<input required maxLength={40} value={mcpServerId} onChange={(e) => setMcpServerId(e.target.value)} placeholder="例如 openai_docs" /></label>
            <label>公开 origin<input required type="text" maxLength={255} value={mcpOrigin} onChange={(e) => setMcpOrigin(e.target.value)} placeholder="https://developers.openai.com" /></label>
            <label>公开 path<input required type="text" maxLength={512} value={mcpPath} onChange={(e) => setMcpPath(e.target.value)} placeholder="/mcp" /></label>
            <label>Bearer token 环境变量名（可选）<input maxLength={64} value={mcpCredentialEnvVar} onChange={(e) => setMcpCredentialEnvVar(e.target.value)} placeholder="例如 MCP_ACCESS_TOKEN；不要填 token 值" /></label>
            <p>保存前会同时由浏览器与服务端拒绝 URL 凭据、query/hash、明文凭据字段及未知字段。保存只是资产收录，不会连接或安装到 Agent。</p>
          </>
        ) : (
          <>
            <label>
              名称
              <input
                required
                maxLength={80}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：有依据的深度研究"
              />
            </label>
            <label>
              {type === "Design" ? "风格说明" : "一句话说明"}
              <input
                maxLength={180}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={type === "Design" ? "一两句话说清这个风格：底色、质感、适合做什么" : "它解决什么问题？什么时候用？"}
              />
            </label>
            {hasCategory(type) && (
              <label>
                分类
                <select aria-label="分类" value={category} disabled={busy || uploading} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">按内容自动归组</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            {type === "Design" && <>
              {designKind === "skill" && <>
                <label>Skill 名称
                  <input required maxLength={64} value={designSkillName} onChange={(e) => {
                    const value = e.target.value;
                    if (!title.trim() || title === designSkillName) setTitle(value);
                    setDesignSkillName(value);
                  }} placeholder="例如 taste-skill（小写英文、数字和连字符）" />
                </label>
                <label>GitHub 地址
                  <input required type="url" maxLength={2048} value={designRepo} onChange={(e) => setDesignRepo(e.target.value)} placeholder="https://github.com/作者/仓库" />
                </label>
                <label>仓库子目录（可选）
                  <input maxLength={200} value={designPath} onChange={(e) => setDesignPath(e.target.value)} placeholder="skill 不在仓库根目录时填，例如 skills/taste-skill" />
                </label>
              </>}
              <div className="design-image-field">
                <span className="design-image-label">效果图（可选）</span>
                <div className="design-image-row">
                  <span className="design-image-preview"><DesignShot image={designImage} title={title || "设计"} /></span>
                  <div className="design-image-actions">
                    <label className="design-image-pick">
                      {designImage ? "换一张" : "上传效果图"}
                      <input className="file-input" aria-label="选择效果图" type="file" accept="image/png,image/jpeg,image/webp"
                        disabled={busy || uploading} onChange={(e) => { pickDesignImage(e.target.files[0]); e.target.value = ""; }} />
                    </label>
                    {designImage && <Button type="button" secondary disabled={busy || uploading} onClick={() => setDesignImage("")}>去掉效果图</Button>}
                    <small>PNG、JPG 或 WebP，单张 8 MB 以内；卡片封面就是这张图。</small>
                  </div>
                </div>
              </div>
            </>}
            {type === "Skill" && skillMode === "install" && <>
              <label>
                安装地址
                <input
                  required
                  type="url"
                  maxLength={2048}
                  value={installUrl}
                  onChange={(e) => setInstallUrl(e.target.value)}
                  placeholder="https://github.com/作者/仓库/tree/main/skills/名称"
                />
              </label>
              <p className="helper">填 Skill 所在仓库或目录的链接。复制时得到一段安装话术，粘贴给 Claude Code 或 Codex，它会按这个地址里的文档装好。</p>
            </>}
            {type === "Skill" && skillMode === "self" && (
              <label className="upload-zone">
                <Upload size={22} />
                <strong>
                  {files.length
                    ? `已包含 ${files.length} 个文件`
                    : "导入完整 Skill ZIP"}
                </strong>
                <span>保留 SKILL.md 与全部依赖文件 · 最大 10 MB</span>
                <span className="upload-pick">
                  选择 ZIP 文件 <ArrowUpRight size={14} />
                </span>
                <input
                  className="file-input"
                  aria-label="选择 Skill ZIP 文件"
                  type="file"
                  accept=".zip"
                  disabled={busy || uploading}
                  onChange={(e) => importZip(e.target.files[0])}
                />
              </label>
            )}
            {type !== "Skill" && (type !== "Design" || designKind === "prompt") && (
              <label>
                {CONTENT_LABEL[type]}
                <textarea
                  aria-label={CONTENT_LABEL[type]}
                  required
                  rows={8}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={CONTENT_HINT[type]}
                />
              </label>
            )}
            {type === "Workflow" && (
              <>
                <div className="workflow-template-toggle">
                  <div><strong>协同模板</strong><p>把阶段、执行者、方法、交付物与过关条件保存到这个工作流版本。</p></div>
                  {workflowTemplate ? (
                    <Button type="button" secondary disabled={busy} onClick={() => setWorkflowTemplate(null)}>移除结构模板</Button>
                  ) : (
                    <Button type="button" secondary disabled={busy} onClick={() => {
                      setWorkflowTemplate(freshDesignImplementationV1());
                      if (!content.trim()) setContent("设计实现流 v1。协同运行以本版本的结构化站点为准；项目协议文件记录实际交接、过关与验收。");
                      if (!title.trim()) setTitle("设计实现流 v1");
                    }}>启用九站定稿模板</Button>
                  )}
                </div>
                {workflowTemplate && <WorkflowTemplateEditor value={workflowTemplate} onChange={setWorkflowTemplate} disabled={busy} />}
                <WorkflowReferenceEditor
                  references={references}
                  assets={assets}
                  onChange={setReferences}
                  disabled={busy}
                />
              </>
            )}
            <label>
              标签
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="用逗号或空格分隔"
              />
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button type="button" secondary onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={busy || uploading}>
            {busy ? "正在保存…" : asset ? "保存新版本" : "保存资产"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
export function AssetDetail({
  asset,
  state,
  save,
  adoptState,
  onSelect,
  onClose,
  onEdit,
  notify,
  ruleInstalls = { items: [], error: "", loaded: false },
  refreshRuleInstalls = () => {},
  versionBump = null,
  onOpenReverse,
}) {
  // 刚保存新版本（3 秒内打开）才播放一次轻量翻页
  const [bump] = useState(() => !!versionBump && Date.now() - versionBump.at < 3000);
  const v = current(asset),
    [tab, setTab] = useState("content");
  // 从逆向标本孵化的 Skill（#29）：来源显示标本名，点一下跳回标本；标本已删除就只显示不可点。
  const hatchedFrom = asset.versions[0]?.hatchedFrom;
  const hatchedReverse = hatchedFrom?.kind === "reverse" && onOpenReverse
    ? { id: hatchedFrom.id, record: (state.reverseRecords || []).find((r) => r.id === hatchedFrom.id && !r.deletedAt) } : null;
  const agentWritingRef = React.useRef(new Set());
  const agentBusy = (source, value) => { if (value) agentWritingRef.current.add(source); else agentWritingRef.current.delete(source); };
  const stage = stageOf(asset, state.assetActivity);
  const activity = useAssetActivity(asset, state, adoptState);
  const copyLock = React.useRef(false);
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteBlockers, setDeleteBlockers] = useState([]);
  const [mcpTargetId, setMcpTargetId] = useState("");
  const mcpTargets = state.connections?.agentTargets || [];
  const usageBlocked = activity.busy || !!activity.pending;
  async function copyPrompt() {
    if (copyLock.current) return;
    copyLock.current = true; setCopying(true);
    try { await copyAssetVersion(asset, v, activity, notify); }
    finally { copyLock.current = false; setCopying(false); }
  }
  async function copyMcp() {
    if (copyLock.current || !activity.beginCopy()) return;
    copyLock.current = true; setCopying(true);
    try {
      const delivery = codexMcpDelivery(v, mcpTargets, mcpTargetId);
      if (await copy(delivery.content, notify))
        await activity.record({ kind: "use", action: "copy-mcp-config", versionId: v.id }, true);
    } catch (error) { notify(error.message, "error"); }
    finally { copyLock.current = false; setCopying(false); activity.endCopy(); }
  }
  const onUsed = (action, extra = {}) => activity.record({ kind: "use", action, versionId: v.id, ...extra }, true);
  async function deleteAsset() {
    if (activity.busy || copying || deleting || agentWritingRef.current.size) return;
    setDeleting(true);
    setDeleteBlockers([]);
    try {
      const result = await removeAssetFromWarehouse(asset.id, state.revision, adoptState);
      if (result.deleted) {
        onClose();
        notify("资产已从仓库删除");
      } else setDeleteBlockers(result.blockers);
    } catch (error) {
      notify(error.message || "删除结果未确认，请刷新后核对", "error");
    } finally { setDeleting(false); }
  }
  async function exportAsset(version = v, versionNumber) {
    const selected = version?.id ? version : v;
    const filename = `${selected.title}${versionNumber ? `-v${versionNumber}.0` : ""}`;
    if (asset.type === "MCP") {
      try {
        const delivery = codexMcpDelivery(selected, mcpTargets, mcpTargetId);
        download(delivery.filename, delivery.content, "application/toml;charset=utf-8");
        notify("已下载固定版本配置片段；目标 Agent 的采用状态尚未验证");
      } catch (error) { notify(error.message, "error"); }
    } else if (hasSkillPackage(asset, selected)) {
      try {
        download(
          `${filename}.zip`,
          buildSkillZip(selected.files),
          "application/zip",
        );
        notify(asset.type === "Design" ? "ZIP 已生成并开始下载，请将文件上传到 ChatGPT 对话，再粘贴生图提示词" : "ZIP 已生成并开始下载，请将文件附给 Agent；未验证安装");
      } catch (e) {
        notify(e.message, "error");
      }
    } else if (asset.type === "Workflow") {
      try {
        const fresh = await readWorkflow(asset.id, selected.id);
        if (fresh.version.references?.length) {
          download(
            `${filename}.zip`,
            await buildWorkflowBundle(fresh.asset, fresh.version, fresh.assets),
            "application/zip",
          );
          notify("流程与引用包已生成；未安装或执行");
        } else {
          download(
            `${filename}.md`,
            fresh.version.content,
            "text/markdown;charset=utf-8",
          );
          notify("已导出流程 Markdown");
        }
      } catch (e) {
        notify(e.message, "error");
      }
    } else {
      download(
        `${filename}.md`,
        asset.type === "Design" ? designCopyText(selected) : selected.content,
        "text/markdown;charset=utf-8",
      );
      notify("已导出 Markdown");
    }
  }
  return (
    <Dialog title="资产详情" onClose={() => { if (!activity.busy && !copying && !deleting && !agentWritingRef.current.size) onClose(); }} drawer>
      <Cover
        type={asset.type}
        sprite={glyphOf(asset)}
        serial={serialsOf(state.assets)[asset.id]}
        version={asset.versions.length}
        stage={stage}
        large
        bump={bump}
        self={isSelfSkill(asset)}
      />
      <div className="detail-content">
        <div className="detail-type">
          <Badge>
            <TypeIcon type={asset.type} size={13} self={isSelfSkill(asset)} />
            {typeLabel[asset.type]}
          </Badge>
          {isSelfSkill(asset) && <b className="self-tag">自建</b>}
          <span className="detail-version">
            v<Odometer value={asset.versions.length} from={bump ? versionBump.from : undefined} />.0
          </span>
          {asset.demo && <Badge tone="muted">演示资产</Badge>}
        </div>
        <h2>{v.title}</h2>
        <p className="detail-desc">{v.description}</p>
        <section className="handoff">
          <header>
            <small>HANDOFF</small>
            <h3>交给 Agent</h3>
          </header>
          <ol className="handoff-steps">
            {HANDOFF[asset.type === "Skill" && isInstallSkill(v) ? "InstallSkill" : asset.type].map((step, i) => (
              <li key={step}>
                <span>{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        {hasSkillPackage(asset, v) ? (
          <>
          <SkillDelivery
            key={`${asset.id}:${v.id}`}
            asset={asset}
            version={v}
            onCopyStart={activity.beginCopy}
            onCopyEnd={activity.endCopy}
            onUsed={onUsed}
            usageBlocked={usageBlocked}
            onExport={exportAsset}
            onEdit={() => { if (!activity.busy && !copying) onEdit(asset); }}
            notify={notify}
          />
          {asset.type === "Skill" && <>
          <SkillPoolPublish key={`pool:${asset.id}:${v.id}`} asset={asset} version={v} state={state} onBusy={v=>agentBusy("pool",v)} />
          <SkillPublish asset={asset} version={v} state={state} onBusy={v=>agentBusy("skill",v)} />
          </>}
          </>
        ) : asset.type === "Workflow" ? (
          <WorkflowDelivery
            key={v.id}
            asset={asset}
            version={v}
            state={state}
            onBusy={v=>agentBusy("workflow",v)}
            onCopyStart={activity.beginCopy}
            onCopyEnd={activity.endCopy}
            onUsed={onUsed}
            usageBlocked={usageBlocked}
            onDownload={download}
            onEdit={() => { if (!activity.busy && !copying) onEdit(asset); }}
            notify={notify}
          />
        ) : asset.type === "MCP" ? (
          <McpDelivery
            key={v.id}
            version={v}
            targets={mcpTargets}
            targetId={mcpTargetId}
            onTarget={setMcpTargetId}
            onCopy={copyMcp}
            onDownload={() => exportAsset(v)}
            onEdit={() => { if (!activity.busy && !copying) onEdit(asset); }}
            busy={usageBlocked || copying}
          />
        ) : (
          <div className="detail-actions">
            <Button disabled={copying || usageBlocked} onClick={copyPrompt}>
              <Copy size={16} />
              {copyLabel(asset, v)}
            </Button>
            <button
              className="outlined-icon"
              aria-label="编辑资产"
              title="编辑并保存为新版本"
              disabled={activity.busy || copying}
              onClick={() => onEdit(asset)}
            >
              <PenLine size={17} />
            </button>
          </div>
        )}
          <p className="handoff-note">
            复制不等于已安装或已使用，结果请在目标 Agent 里确认。
          </p>
        </section>
        {asset.type === "Rule" && (
          <RuleInstall
            key={v.id}
            asset={asset}
            state={state}
            installs={ruleInstalls}
            refresh={refreshRuleInstalls}
            notify={notify}
          />
        )}
        <AssetUsage asset={asset} state={state} activity={activity} />
        <AssetEvolution
          asset={asset}
          state={state}
          save={save}
          notify={notify}
          copyText={(text) => copy(text, notify)}
        />
        <dl className="detail-facts">
          {asset.type === "Design" && <>
            <div><dt>内容形式</dt><dd>{designKindLabel(v)}</dd></div>
            {isLinkedDesignSkill(v) && <div><dt>安装来源</dt><dd><a href={v.design.repo} target="_blank" rel="noreferrer">{v.design.repo}</a>{v.design.path ? ` · ${v.design.path}` : ""}</dd></div>}
          </>}
          {asset.type === "Skill" && <div><dt>形态</dt><dd>{isInstallSkill(v) ? <>安装地址 · <a href={v.installUrl} target="_blank" rel="noreferrer">{v.installUrl}</a></> : "自建 · ZIP 包"}</dd></div>}
          <div>
            <dt>来源</dt>
            <dd>{hatchedReverse ? <button type="button" className="hatch-src" disabled={!hatchedReverse.record} onClick={() => onOpenReverse(hatchedReverse.id)}>从逆向工程孵化 · {hatchedReverse.record?.title || "标本已删除"}</button> : v.source}</dd>
          </div>
          <div>
            <dt>更新</dt>
            <dd>{new Date(v.at).toLocaleDateString("zh-CN")}</dd>
          </div>
          <div>
            <dt>标签</dt>
            <dd>{v.tags.join(" / ") || "未设置"}</dd>
          </div>
        </dl>
        <div className="detail-tabs">
          {[
            ["content", "内容预览"],
            ["files", "文件"],
            ["copies", "目标副本"],
            // 产品定义 v1.2 §2.2：单个资产的版本在“历史”标签查看，复用 AssetHistory。
            ["history", "历史"],
          ]
            .filter(
              ([id]) =>
                id === "files" ? hasSkillPackage(asset, v) : id !== "copies" || (asset.type === "Skill" && hasSkillPackage(asset, v)),
            )
            .map(([id, label]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
                {id === "history" && <span>{asset.versions.length}</span>}
              </button>
            ))}
        </div>
        {tab === "content" && (
          <>
            {asset.type === "MCP" ? (
              <dl className="detail-facts" aria-label="MCP 结构化配置">
                <div><dt>协议</dt><dd>streamable HTTP</dd></div>
                <div><dt>服务标识</dt><dd>{v.mcpConfig.serverId}</dd></div>
                <div><dt>公开地址</dt><dd>{v.mcpConfig.origin + v.mcpConfig.path}</dd></div>
                <div><dt>Bearer 环境变量名</dt><dd>{v.mcpConfig.credentialEnvVar || "未设置"}</dd></div>
              </dl>
            ) : <pre className="content-preview">
              {v.content || "此资产没有文本预览。"}
            </pre>}
            {asset.type === "Workflow" && <WorkflowTemplateDetail value={v.workflowTemplate} />}
            {asset.type === "Workflow" && (
              <section className="workflow-detail-references">
                <h3>固定引用 · {v.references?.length || 0}</h3>
                <WorkflowReferenceList version={v} assets={state.assets} />
              </section>
            )}
            {asset.type === "Skill" && hasSkillPackage(asset, v) && (
              <SkillOrigin
                key={`${asset.id}:${v.id}`}
                asset={asset}
                state={state}
                adoptState={adoptState}
                notify={notify}
                onSelect={onSelect}
              />
            )}
          </>
        )}
        {tab === "files" && (
          <div className="file-list">
            {v.files.map((f) => (
              <div key={f.path}>
                {f.directory ? <Folder size={15} /> : <FileText size={15} />}
                <span>
                  {f.path}
                  {f.directory ? "/" : ""}
                </span>
                <small>
                  {f.text ? strToU8(f.data).length : f.data.length} B
                </small>
              </div>
            ))}
          </div>
        )}
        {tab === "copies" && asset.type === "Skill" && hasSkillPackage(asset, v) && (
          <SkillCopies
            key={asset.id}
            asset={asset}
            state={state}
            adoptState={adoptState}
            notify={notify}
          />
        )}
        {tab === "history" && (
          <AssetHistory
            asset={asset}
            state={state}
            save={save}
            notify={notify}
            onExport={exportAsset}
          />
        )}
        <div className="detail-footer">
          <button className="text-button" onClick={exportAsset}>
            <Download size={15} />
            导出
          </button>
          <button className="text-button danger-text" onClick={deleteAsset} disabled={activity.busy || copying || deleting || !!agentWritingRef.current.size}>
            <Trash2 size={15} />
            {deleting ? "正在删除…" : "删除资产"}
          </button>
        </div>
        {!!deleteBlockers.length && <div className="asset-delete-notice" role="alert">
          <b>资产仍被引用，无法删除。固定历史引用不可改写；可解除的当前引用处理后可重试。</b>
          <ul className="asset-delete-blockers">{deleteBlockers.map((item, index) =>
            <li key={`${item.kind}-${item.ownerId}-${index}`}>{item.label}{item.fixed && <small>固定历史</small>}</li>)}</ul>
        </div>}
      </div>
    </Dialog>
  );
}

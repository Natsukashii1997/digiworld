import { copyText } from './data-flight.js';
import React, { useMemo, useState } from "react";
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
} from "lucide-react";
import { strToU8 } from "fflate";
import { request } from "./api.js";
import "./assets-detail.css";
import "./assets-quick-copy.css";
import { hasSkillPackage, designPromptText } from "./design-asset.js";
import { readSkillZip, buildSkillZip } from "./skill-package.js";
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
  PageHeading,
  Dialog,
  Cover,
  TypeIcon,
  typeLabel,
} from "./components.jsx";
import { AssetUsage, useAssetActivity } from "./AssetUsage.jsx";
import { AssetEvolution } from "./AssetEvolution.jsx";
import { RuleInstall } from "./RuleInstall.jsx";
import { Odometer } from "./Odometer.jsx";
import { usageByAsset } from "./asset-usage.js";
import { removeAssetFromWarehouse } from "./asset-delete.js";
import { assetHit, tagCounts, terms } from "./search.js";
import { StageBar, stageOf, glyphOf } from "./pixel.jsx";
import { ScrollRecycle } from "./Scrolls.jsx";
import {
  scrollsOf,
  liveEntries,
  entryName,
  scrollSerials,
  scrollStats,
  scrollHit,
  pinScroll,
  deleteScroll,
  scrollDeleteBlockers,
  NAME_MAX as SCROLL_NAME_MAX,
} from "./scrolls.js";

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
    } else if (hasSkillPackage(asset, version)) {
      delivery = await request("/deliveries", { assetId: asset.id, versionId: version.id });
      text = delivery.instructions;
    } else if (asset.type === "Design") {
      text = designPromptText(version);
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
export function AssetCopyButton({ asset, state, adoptState, notify, disabled }) {
  const version = current(asset);
  const activity = useAssetActivity(asset, state, adoptState);
  const label = asset.type === "Design" ? "复制生图提示词" : asset.type === "Skill" ? "复制安装口令" : asset.type === "MCP" ? "复制配置定义" : "复制全文";
  return <>
    <button type="button" className="asset-copy"
      aria-label={`${label} ${version.title}`} title={activity.pending ? "记录待核对" : label}
      disabled={disabled || activity.busy || !!activity.pending}
      onClick={(event) => { if (event.detail <= 1) copyAssetVersion(asset, version, activity, notify); }}>
      <Copy size={17} aria-hidden="true" />
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
  Design: ["复制生图提示词", "粘贴到 ChatGPT，按需补充本次需求", "Prompt 直接生图；Skill 包需导出并作为附件上传"],
  Skill: ["复制口令（含 10 分钟下载链接）", "粘贴给任意 Agent", "由它下载完整包并确认安装范围"],
  Prompt: ["复制完整提示词", "粘贴到 Agent 对话", "按需补充本次背景"],
  Workflow: ["复制流程与固定引用", "交给 Agent 按步骤推进", "引用版本不会随上游变动"],
  Rule: ["装进项目的 AGENTS.md 或 CLAUDE.md", "只维护文件里的托管区块", "模板改版后逐个预览再升级"],
  MCP: ["选择已登记的 Codex CLI 目标", "复制或下载该固定版本的 TOML 片段", "配置到目标后在新会话核验连接与采用"],
};
const CONTENT_LABEL = {
  Design: "生图提示词",
  Prompt: "提示词全文",
  Workflow: "工作流内容",
  Rule: "规则正文",
};
const CONTENT_HINT = {
  Design: "画面主题、风格、比例、文字和交付要求……",
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
// 页面会话持有复制门禁；筛选或切页卸载卷卡不解除锁，刷新后才重读主库。
const scrollCopySessions = new Map();
function scrollCopySession(id, state) {
  let session = scrollCopySessions.get(id);
  if (!session) {
    const listeners = new Set();
    session = {
      state,
      status: { locked: false, busy: false, message: "" },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      getSnapshot() { return session.status; },
      update(status) { session.status = status; listeners.forEach(listener => listener()); },
    };
    scrollCopySessions.set(id, session);
  }
  session.state = state;
  return session;
}
export function Assets({
  state,
  save,
  adoptState,
  notify,
  filter = "all",
  openCreate,
  select,
  onFilter,
  navigate,
  openScroll,
}) {
  const [search, setSearch] = useState(""),
    [sort, setSort] = useState("recent"),
    [tag, setTag] = useState(""),
    [helpOpen, setHelpOpen] = useState(false);
  const [deleting, setDeleting] = useState(""),
    [blockedDelete, setBlockedDelete] = useState(null);
  const activeFilter = ["Archived", "MCP"].includes(filter) ? "all" : filter;
  const activeTag = activeFilter === "Scroll" ? "" : tag;
  const words = terms(search);
  const tags = useMemo(() => tagCounts(state.assets.filter(a => !a.archived)), [state.assets]);
  const assets = state.assets.filter((a) => !a.archived);
  const serials = serialsOf(state.assets);
  const usage = usageByAsset(assets, state.assetActivity);
  // 焚决（切片 1.3b）：卷以卡片出现在“全部”和“焚决”标签下；数据仍在主库顶层 scrolls。
  const allScrolls = scrollsOf(state);
  for (const scroll of allScrolls) {
    const session = scrollCopySessions.get(scroll.id);
    if (session) session.state = state;
  }
  const scrolls = allScrolls.filter((s) => !s.deletedAt);
  const scrollSerial = scrollSerials(allScrolls);
  const ofType = activeFilter === "Scroll" ? [] : assets.filter((a) => activeFilter === "all" || a.type === activeFilter);
  const scrollsOfType = activeFilter === "all" || activeFilter === "Scroll" ? scrolls : [];
  const narrowed = !!(words.length || activeTag);
  const clearFilters = () => {
    setSearch("");
    setTag("");
  };
  // 置顶（切片 1.1）：置顶项在任何类型标签与排序下都排最前，置顶项之间按使用次数降序，再按最近使用。
  // favorite 字段仅作旧数据兼容，界面不再读取；演示资产默认 favorite=true，不能当成置顶。
  // 资产与焚决卷统一成同一组排序键：焚决的次数是卷内条目复制次数之和，更新时间用卷的 updatedAt/createdAt。
  const items = [
    ...ofType
      .filter(
        (a) =>
          (!activeTag || current(a).tags.includes(activeTag)) &&
          (!words.length || assetHit(a, words)),
      )
      .map((a) => {
        const u = usage.get(a.id);
        return {
          kind: "asset",
          item: a,
          pinned: !!a.pinned,
          count: u.count,
          lastAt: u.lastAt,
          at: current(a).at,
          title: current(a).title,
        };
      }),
    ...scrollsOfType
      .map((s) => ({ s, stats: scrollStats(s) }))
      .filter(
        ({ s, stats }) =>
          !activeTag && (!words.length || scrollHit(s, words)),
      )
      .map(({ s, stats }) => ({
        kind: "scroll",
        item: s,
        stats,
        pinned: !!s.pinned,
        count: stats.uses,
        lastAt: stats.lastAt,
        at: s.updatedAt || s.createdAt,
        title: s.name,
      })),
  ];
  const byUse = (a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt);
  const bySort = (a, b) =>
    sort === "name"
      ? a.title.localeCompare(b.title, "zh")
      : sort === "most"
        ? byUse(a, b) || b.at.localeCompare(a.at)
        : sort === "used"
          ? b.lastAt.localeCompare(a.lastAt) || b.at.localeCompare(a.at)
          : b.at.localeCompare(a.at);
  const shown = items.sort(
    (a, b) =>
      b.pinned - a.pinned ||
      (a.pinned && b.pinned && byUse(a, b)) ||
      bySort(a, b),
  );
  const pinnedCount = shown.filter((x) => x.pinned).length;
  const typeCount = { all: state.assets.filter(a=>!a.archived).length + scrolls.length, Scroll: scrolls.length };
  const hasAny = ofType.length + scrollsOfType.length > 0;
  async function deleteAsset(asset) {
    if (deleting) return;
    setDeleting(asset.id);
    try {
      const result = await removeAssetFromWarehouse(asset.id, state.revision, adoptState);
      if (result.deleted) {
        notify("资产已从仓库删除");
        const position = shown.findIndex(item => item.kind === "asset" && item.item.id === asset.id);
        requestAnimationFrame(() => {
          const controls = [...document.querySelectorAll(".asset-grid .asset-delete")];
          (controls[Math.min(position, controls.length - 1)] || document.querySelector(".asset-heading-actions input"))?.focus();
        });
      }
      else setBlockedDelete({ title: current(asset).title, blockers: result.blockers });
    } catch (error) {
      notify(error.message || "删除结果未确认，请刷新后核对", "error");
    } finally { setDeleting(""); }
  }
  async function deleteScrollCard(scroll) {
    if (deleting) return;
    const blockers = scrollDeleteBlockers(state, scroll.id);
    if (blockers.length) {
      setBlockedDelete({ title: scroll.name, blockers });
      return;
    }
    setDeleting(scroll.id);
    try {
      if (await save({ ...state, scrolls: deleteScroll(allScrolls, scroll.id) }))
        notify("卷已从仓库删除");
    } finally { setDeleting(""); }
  }
  return (
    <>
      <PageHeading
        page="assets"
        help={<button type="button" className="page-help" aria-label="这页怎么用" onClick={() => setHelpOpen(true)}>?</button>}
        action={
          <div className="asset-heading-actions">
            <label className="inline-search">
              <Search size={15} />
              <input
                placeholder="搜索标题、说明、正文、卷名"
                aria-label="在资产中搜索"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <Button
              onClick={() => openCreate(activeFilter === "all" ? "Prompt" : activeFilter)}
            >
              <Plus size={16} />
              新建
            </Button>
          </div>
        }
      />
      <div className="asset-toolbar">
        <div className="segmented" role="group" aria-label="资产类型">
          {[
            ["all", "全部"],
            ["Prompt", "Prompts"],
            ["Skill", "Skills"],
            ["Workflow", "工作流"],
            ["Rule", "规则"],
            ["Scroll", "焚决"],
            ["Design", "设计"],
          ].map(([id, name]) => (
            <button
              key={id}
              aria-pressed={activeFilter === id}
              className={activeFilter === id ? "active" : ""}
              onClick={() => { if (id === "Scroll") setTag(""); onFilter(id); }}
            >
              {name}
              <span>
                {typeCount[id] ?? assets.filter((a) => a.type === id).length}
              </span>
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          {activeFilter !== "Scroll" && (tags.length > 0 || tag) && (
            <select
              aria-label="按标签筛选"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            >
              <option value="">全部标签</option>
              {tag && !tags.some(([name]) => name === tag) && (
                <option value={tag}>{tag} · 0</option>
              )}
              {tags.map(([name, count]) => (
                <option key={name} value={name}>
                  {name} · {count}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="排序方式"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">最近更新</option>
            <option value="most">最常用</option>
            <option value="used">最近使用</option>
            <option value="name">名称排序</option>
          </select>
        </div>
      </div>
      {activeFilter === "Scroll" && <ScrollRecycle state={state} save={save} />}
      <div className="collection-meta">
        <span>
          当前结果 · <b>{shown.length}</b>
          {pinnedCount > 0 && (
            <>
              {" "}· 置顶 <b>{pinnedCount}</b>
            </>
          )}
        </span>
      </div>
      <div className="asset-grid">
        {shown.map(({ kind, item: a, stats }, i) => {
          if (kind === "scroll")
            return (
              <ScrollCard
                key={a.id}
                scroll={a}
                stats={stats}
                serial={scrollSerial[a.id]}
                index={i}
                onOpen={() => openScroll(a.id)}
                onPin={() => save({ ...state, scrolls: pinScroll(allScrolls, a.id, !a.pinned) })}
                onDelete={() => deleteScrollCard(a)}
                deleting={!!deleting}
                state={state}
                save={save}
                notify={notify}
              />
            );
          const v = current(a);
          return (
            <article
              key={a.id}
              className="asset-card"
              style={{ "--i": Math.min(i, 12) }}
            >
              <button
                className={`card-open type-${a.type}`}
                onClick={() => select(a.id)}
                aria-label={`查看 ${v.title}`}
              >
                <span className="lock" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <Cover
                  type={a.type}
                  sprite={glyphOf(a)}
                  serial={serials[a.id]}
                  version={null}
                  uses={usage.get(a.id).count}
                />
                <div className="card-body">
                  <div className="card-type">
                    <TypeIcon type={a.type} size={13} />
                    {typeLabel[a.type]}
                    <span>{originLabel(a)}</span>
                  </div>
                  <h3>{v.title}</h3>
                  <p className={!v.description && a.type !== "MCP" ? "asset-description-empty" : undefined}>{a.type === "MCP" ? `${v.mcpConfig.origin}${v.mcpConfig.path}` : v.description || "还没有一句话说明。"}</p>
                  <span className="sr-only">使用 {usage.get(a.id).count} 次</span>
                  <div className="card-bottom">
                    <div className="card-tags">
                      {v.tags.slice(0, 2).map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>
                    <StageBar stage={usage.get(a.id).stage} />
                  </div>
                </div>
              </button>
              <AssetCopyButton asset={a} state={state} adoptState={adoptState} notify={notify} disabled={!!deleting} />
              <button type="button" className="asset-delete" aria-label={`删除 ${v.title}`} title={`删除 ${v.title}`}
                disabled={!!deleting} onClick={() => deleteAsset(a)}>
                <Trash2 size={17} aria-hidden="true" />
              </button>
              <button
                aria-label={`${a.pinned ? "取消置顶" : "置顶"} ${v.title}`}
                aria-pressed={!!a.pinned}
                title={a.pinned ? "取消置顶" : "置顶"}
                className={`pin-button ${a.pinned ? "is-pinned" : ""}`}
                onClick={() =>
                  save({
                    ...state,
                    assets: state.assets.map((x) =>
                      x.id === a.id ? { ...x, pinned: !x.pinned } : x,
                    ),
                  })
                }
              >
                <Pin size={16} fill={a.pinned ? "currentColor" : "none"} />
              </button>
            </article>
          );
        })}
      </div>
      {shown.length === 0 && narrowed && (
        <Empty
          sprite="numemon"
          title="没有匹配的资产"
          action={
            <div className="empty-actions">
              {!hasAny && activeFilter !== "all" && (
                <Button secondary onClick={() => onFilter("all")}>
                  查看全部类型
                </Button>
              )}
              <Button secondary onClick={clearFilters}>
                清除筛选
              </Button>
            </div>
          }
        >
          {!hasAny
            ? "当前类型还没有资产，清除筛选后这里仍会是空的。"
            : words.length
              ? `没有资产同时匹配“${words.join(" ")}”和当前筛选条件。`
              : "当前筛选条件下没有资产。"}
        </Empty>
      )}
      {shown.length === 0 && !narrowed && (
        <Empty
          sprite="numemon"
          title={activeFilter === "Scroll" ? "还没有卷" : "还没有符合条件的资产"}
          action={
            <Button
              secondary
              onClick={() => openCreate(activeFilter === "all" ? "Prompt" : activeFilter)}
            >
              <Plus size={16} />
              新建
            </Button>
          }
        >
          {activeFilter === "Scroll"
            ? "先建一卷，比如“心法”或“prompt 碎片”，把提炼过、会反复用的碎片放进去。"
            : "从一份新的 Skill、Prompt、工作流、规则或焚决开始。"}
        </Empty>
      )}
      {helpOpen && (
        <Dialog recoverFocus title="资产仓库 · 这页怎么用" onClose={() => setHelpOpen(false)}>
          <p>按类型、关键词和标签查找资产；可调整排序。新建和修订的资产会保留版本。</p>
          <p>进化阶段结合当前版本的复制记录与本人反馈，版本数单独保留。复制后的实际采用与运行结果，以接收方回执和项目协议为准。</p>
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
// 外层逐条与整卷复制共享同一个锁，保存未知后须刷新核对，不能重放。
function ScrollCopyButton({ scroll, onCopy, disabled }) {
  return (
    <button type="button" className="asset-copy" aria-label={`复制卷全文 ${scroll.name}`} title="复制卷全文"
      disabled={disabled} onClick={event => { if (event.detail <= 1) onCopy(); }}>
      <Copy size={14} aria-hidden="true" />
    </button>
  );
}
// 焚决卡四角：包住拐角的静态像素火苗——焰心压在拐角上，火尾沿侧边往下拖，火舌向上并朝卡内窜。
// 以左上角为基准（拐角约在第 4.5 列、第 7 行），右侧由样式水平翻转。R 红边、O 橙、Y 黄、W 焰心白。
const CORNER_FLAME = [
  ".....R.....",
  "....ROR....",
  "....ROR..R.",
  "...ROYOR.RR",
  "..ROYYORROR",
  "..ROYWYOOOR",
  ".ROYWWWYOR.",
  ".ROYWWYOR..",
  "ROYYWYOR...",
  "ROYYYOR....",
  "RYYYOR.....",
  "RYYOR......",
  ".YYOR......",
  ".YOR.......",
  ".YOR.......",
  "..OR.......",
  "..R........",
];
const CORNER_FLAME_COLORS = { R: "#e8452c", O: "#ff8a24", Y: "#ffd166", W: "#fff4d6" };
function CornerFlame() {
  return (
    <svg className="scroll-corner-flame" viewBox="0 0 11 17" width="22" height="34" shapeRendering="crispEdges">
      {CORNER_FLAME.flatMap((row, y) => [...row].map((cell, x) => cell === "." ? null :
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={CORNER_FLAME_COLORS[cell]} />))}
    </svg>
  );
}
function ScrollCard({ scroll, stats, serial, index, onOpen, onPin, onDelete, deleting, state, save, notify }) {
  const session = scrollCopySession(scroll.id, state);
  const { busy, message } = React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const entries = liveEntries(scroll);
  const copyDisabled = deleting || busy || !!message;
  async function copyEntries(entryId) {
    if (session.status.locked || deleting) return;
    const currentScroll = scrollsOf(session.state).find(item => item.id === scroll.id && !item.deletedAt);
    const selected = currentScroll ? liveEntries(currentScroll).filter(entry => !entryId || entry.id === entryId) : [];
    if (!selected.length) { notify("这卷还没有可复制的内容", "info"); return; }
    session.update({ locked: true, busy: true, message: "" });
    let unconfirmed = false;
    const uncertain = () => {
      unconfirmed = true;
      const text = entryId ? "焚决正文已复制，使用次数未确认，请刷新核对" : "卷内正文已复制，使用次数未确认，请刷新核对";
      session.update({ locked: true, busy: true, message: text }); notify(text, "error");
    };
    try {
      if (!(await copy(selected.map(entry => entry.text).join("\n\n"), notify))) return;
      const snapshot = session.state;
      const target = scrollsOf(snapshot).find(item => item.id === scroll.id && !item.deletedAt);
      if (!target || selected.some(entry => !liveEntries(target).some(value => value.id === entry.id && value.text === entry.text))) {
        uncertain(); return;
      }
      const ids = new Set(selected.map(entry => entry.id));
      const at = new Date().toISOString();
      const scrolls = scrollsOf(snapshot).map(item => item.id !== scroll.id ? item : {
        ...item, entries: item.entries.map(entry => ids.has(entry.id) ? { ...entry, uses: entry.uses + 1, lastUsedAt: at } : entry),
      });
      if (!(await save({ ...snapshot, scrolls }, { motion: false }))) uncertain();
    } finally { session.update({ locked: unconfirmed, busy: false, message: session.status.message }); }
  }
  return (
    <article className="asset-card scroll-card" style={{ "--i": Math.min(index, 12) }}>
      {/* 四角放在整卡上：普通卡悬停亮蓝色锁定角，焚决卡换成沿边燃烧的火焰角 */}
      <span className="lock" aria-hidden="true">
        {[0, 1, 2, 3].map(corner => <i key={corner}><CornerFlame /></i>)}
      </span>
      <button
        className="card-open type-Scroll"
        onClick={onOpen}
        disabled={busy || deleting}
        aria-label={`打开卷 ${scroll.name}`}
      >
        <Cover type="Scroll" serial={serial} version={null} uses={stats.uses} />
        <div className="card-body">
          <div className="card-type">
            <h3 className="scroll-card-title" title={`${typeLabel.Scroll} · ${scroll.name}`}>
              <TypeIcon type="Scroll" size={14} />
              <span className="scroll-card-name"><span className="scroll-card-label">{typeLabel.Scroll} · </span>{scroll.name}</span>
            </h3>
            <span className="scroll-card-count">{entries.length} 条</span>
          </div>
          <span className="sr-only">使用 {stats.uses} 次</span>
        </div>
      </button>
      <div className="scroll-preview" role="region" aria-label={`${scroll.name} · 焚决内容`} tabIndex={0}>
        {entries.length ? <ol className="scroll-preview-list">
          {entries.map((entry, at) => {
            const firstLine = entryName(entry);
            const name = firstLine.length > 48 ? firstLine.slice(0, 48) + "…" : firstLine;
            const index = String(at + 1).padStart(2, "0");
            return <li className="scroll-preview-entry" key={entry.id} data-scroll-entry-id={entry.id}>
              {/* 一行：编号 + 名称 + 复制；正文与计次在下方通栏 */}
              <div className="scroll-preview-heading">
                <span className="scroll-preview-index" aria-hidden="true">{index}</span>
                {entry.name ? <h4 title={firstLine}>{name}</h4> : <span className="scroll-preview-spacer" />}
                <button type="button" className="scroll-preview-copy" disabled={copyDisabled}
                  aria-label={`复制焚决 ${index}：${name}`} title="复制这条焚决"
                  onClick={event => { if (event.detail <= 1) copyEntries(entry.id); }}>
                  <Copy size={14} aria-hidden="true" /><span aria-hidden="true">复制</span>
                </button>
              </div>
              <p className="scroll-preview-text">{entry.text}</p>
              <span className="scroll-preview-uses">已复制 {entry.uses} 次</span>
            </li>;
          })}
        </ol> : <div className="scroll-preview-empty"><b>这一卷还是空的</b><p>打开卷，加入第一条高价值提示词。</p></div>}
      </div>
      {message && <div className="asset-copy-recovery"><p role="status">{message}</p></div>}
      <ScrollCopyButton scroll={scroll} onCopy={() => copyEntries()} disabled={copyDisabled} />
      <button type="button" className="asset-delete" aria-label={`删除 ${scroll.name}`} title={`删除 ${scroll.name}`}
        disabled={deleting || busy} onClick={onDelete}>
        <Trash2 size={17} aria-hidden="true" />
      </button>
      <button
        aria-label={`${scroll.pinned ? "取消置顶" : "置顶"} ${scroll.name}`}
        aria-pressed={!!scroll.pinned}
        title={scroll.pinned ? "取消置顶" : "置顶"}
        className={`pin-button ${scroll.pinned ? "is-pinned" : ""}`}
        disabled={deleting || busy}
        onClick={onPin}
      >
        <Pin size={16} fill={scroll.pinned ? "currentColor" : "none"} />
      </button>
    </article>
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
  type: initialType,
  onClose,
  onSave,
  onCreateScroll,
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
    [designKind, setDesignKind] = useState(old?.design?.kind || "skill"),
    [uploading, setUploading] = useState(false),
    [references, setReferences] = useState(old?.references || []),
    [workflowTemplate, setWorkflowTemplate] = useState(old?.workflowTemplate || null),
    [mcpServerId, setMcpServerId] = useState(old?.mcpConfig?.serverId || ""),
    [mcpOrigin, setMcpOrigin] = useState(old?.mcpConfig?.origin || ""),
    [mcpPath, setMcpPath] = useState(old?.mcpConfig?.path || "/mcp"),
    [mcpCredentialEnvVar, setMcpCredentialEnvVar] = useState(old?.mcpConfig?.credentialEnvVar || ""),
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
  // 焚决（切片 1.3b）：只需卷名，创建后由调用方直接打开该卷；不生成资产版本。
  const scroll = type === "Scroll";
  async function submit(e) {
    e.preventDefault();
    if (busy || uploading) return;
    setError("");
    if (scroll) {
      if (!title.trim() || busy) return;
      setBusy(true);
      try {
        if (!(await onCreateScroll(title))) {
          setError("本次未保存。请查看保存提示，卷名仍在。");
          return;
        }
        onClose();
      } finally {
        setBusy(false);
      }
      return;
    }
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
        files: type === "Design" && designKind === "prompt" ? [] : files,
        ...(type === "Design" ? { design: { kind: designKind } } : {}),
        ...(type === "Workflow" ? { references } : {}),
        ...(type === "Workflow" ? { workflowTemplate: parsedTemplate } : {}),
      };
      const success = await onSave(
        asset ? revise(asset, values) : makeAsset(draft?.hatchedFrom ? { ...values, hatchedFrom: draft.hatchedFrom } : values),
      );
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
      <form onSubmit={submit} className="asset-form">
        {(asset || scroll || draft) && <div className="form-intro">
          <p>
            {asset
              ? `保存后成为 v${next}.0，v${next - 1}.0 及更早版本完整保留在历史中。`
              : scroll
                ? "焚决是一卷有序的碎片：心法、prompt 碎片、判断准则。先起个卷名，建好后直接在卷里添加条目。"
                : `从${draft.hatchedFrom.kind === "note" ? "随手记" : "个人收藏"}孵化：正文已带入，可以改；保存后原条目显示“已孵成资产”，原条目不变。`}
          </p>
        </div>}
        <div className="type-picker" role="radiogroup" aria-label="资产类型">
          {["Prompt", "Skill", "Workflow", "Rule", "MCP", "Scroll", "Design"].filter((t) => !draft || !["MCP", "Scroll"].includes(t)).map((t, index, types) => (
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
        {scroll ? (
          <label>
            卷名
            <input
              required
              maxLength={SCROLL_NAME_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：心法、prompt 碎片、判断准则"
            />
          </label>
        ) : type === "MCP" ? (
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
              一句话说明
              <input
                maxLength={180}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="它解决什么问题？什么时候用？"
              />
            </label>
            {type === "Design" && <>
              <label>内容形式
                <select value={designKind} disabled={busy || uploading} onChange={e => setDesignKind(e.target.value)}>
                  <option value="skill">Skill 包</option><option value="prompt">Prompt</option>
                </select>
              </label>
              <p className="helper">{designKind === "skill"
                ? "上传完整 ZIP，生图提示词可选。在 ChatGPT 使用时，请导出完整包并作为附件上传；上传不会覆盖已填提示词。"
                : "填写生图提示词，复制到 ChatGPT 即可使用默认生图能力。"}</p>
            </>}
            {(type === "Skill" || (type === "Design" && designKind === "skill")) && (
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
            {type !== "Skill" && (
              <label>
                {CONTENT_LABEL[type]}
                <textarea
                  aria-label={CONTENT_LABEL[type]}
                  required={type !== "Design" || designKind === "prompt"}
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
          <Button type="submit" disabled={busy || uploading || (scroll && !title.trim())}>
            {busy ? "正在保存…" : asset ? "保存新版本" : scroll ? "新建卷" : "保存资产"}
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
}) {
  // 刚保存新版本（3 秒内打开）才播放一次轻量翻页
  const [bump] = useState(() => !!versionBump && Date.now() - versionBump.at < 3000);
  const v = current(asset),
    [tab, setTab] = useState("content");
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
        asset.type === "Design" ? designPromptText(selected) : selected.content,
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
      />
      <div className="detail-content">
        <div className="detail-type">
          <Badge>
            <TypeIcon type={asset.type} size={13} />
            {typeLabel[asset.type]}
          </Badge>
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
            {HANDOFF[asset.type].map((step, i) => (
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
              {asset.type === "Design" ? "复制生图提示词" : "复制全文"}
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
            <div><dt>内容形式</dt><dd>{v.design.kind === "skill" ? "Skill 包" : "Prompt"}</dd></div>
          </>}
          <div>
            <dt>来源</dt>
            <dd>{v.source}</dd>
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
                id === "files" ? hasSkillPackage(asset, v) : id !== "copies" || asset.type === "Skill",
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
            {asset.type === "Skill" && (
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
        {tab === "copies" && asset.type === "Skill" && (
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

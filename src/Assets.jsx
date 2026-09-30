import React, { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Pin,
  Grid2X2,
  List,
  ArrowUpRight,
  Copy,
  Download,
  Archive,
  FileText,
  Upload,
  PenLine,
  Folder,
  FolderSearch,
} from "lucide-react";
import { strToU8 } from "fflate";
import { readSkillZip, buildSkillZip } from "./skill-package.js";
import { SkillDelivery } from "./SkillDelivery.jsx";
import { SkillCopies } from "./SkillCopies.jsx";
import { SkillSourceImport, SkillOrigin } from "./SkillSources.jsx";
import { current, makeAsset, revise } from "./store.js";
import { AssetHistory } from "./AssetHistory.jsx";
import {
  WorkflowReferenceEditor,
  WorkflowReferenceList,
  WorkflowDelivery,
  readWorkflow,
} from "./WorkflowReferences.jsx";
import { buildWorkflowBundle } from "./workflow-references.js";
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
import { RuleInstall } from "./RuleInstall.jsx";
import { Odometer } from "./Odometer.jsx";
import { usageByAsset } from "./asset-usage.js";
import { assetHit, tagCounts, terms } from "./search.js";
import { StageBar, stageOf, glyphOf } from "./pixel.jsx";

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
    await navigator.clipboard.writeText(text);
    notify("已复制到剪贴板");
    return true;
  } catch {
    notify("无法访问剪贴板，请选中文字后手动复制", "error");
    return false;
  }
}
// 同类资产按创建先后编号，例如 SKL.01。
export function serialsOf(assets) {
  const out = {};
  for (const type of ["Skill", "Prompt", "Workflow", "Rule"])
    assets
      .filter((a) => a.type === type)
      .sort((a, b) => a.versions[0].at.localeCompare(b.versions[0].at))
      .forEach((a, i) => (out[a.id] = i + 1));
  return out;
}
const HANDOFF = {
  Skill: ["复制口令（含 10 分钟下载链接）", "粘贴给任意 Agent", "由它下载完整包并确认安装范围"],
  Prompt: ["复制完整提示词", "粘贴到 Agent 对话", "按需补充本次背景"],
  Workflow: ["复制流程与固定引用", "交给 Agent 按步骤推进", "引用版本不会随上游变动"],
  Rule: ["装进项目的 AGENTS.md 或 CLAUDE.md", "只维护文件里的托管区块", "模板改版后逐个预览再升级"],
};
const CONTENT_LABEL = {
  Prompt: "提示词全文",
  Workflow: "工作流内容",
  Rule: "规则正文",
};
const CONTENT_HINT = {
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
}) {
  const [search, setSearch] = useState(""),
    [layout, setLayout] = useState("grid"),
    [sort, setSort] = useState("recent"),
    [tag, setTag] = useState("");
  const [collecting, setCollecting] = useState(false);
  const words = terms(search);
  const tags = useMemo(() => tagCounts(state.assets), [state.assets]);
  const assets = state.assets.filter((a) => !a.archived);
  const serials = serialsOf(state.assets);
  const usage = usageByAsset(assets, state.assetActivity);
  const ofType = assets.filter((a) => filter === "all" || a.type === filter);
  const narrowed = !!(words.length || tag);
  const archivedHits = words.length
    ? state.assets.filter((a) => a.archived && assetHit(a, words)).length
    : 0;
  const clearFilters = () => {
    setSearch("");
    setTag("");
  };
  // 置顶（切片 1.1）：置顶项在任何类型标签与排序下都排最前，置顶项之间按使用次数降序，再按最近使用。
  // favorite 字段仅作旧数据兼容，界面不再读取；演示资产默认 favorite=true，不能当成置顶。
  const uses = (a) => usage.get(a.id);
  const byUse = (a, b) =>
    uses(b).count - uses(a).count || uses(b).lastAt.localeCompare(uses(a).lastAt);
  const bySort = (a, b) =>
    sort === "name"
      ? current(a).title.localeCompare(current(b).title, "zh")
      : sort === "most"
        ? byUse(a, b) || current(b).at.localeCompare(current(a).at)
        : sort === "used"
          ? uses(b).lastAt.localeCompare(uses(a).lastAt) || current(b).at.localeCompare(current(a).at)
          : current(b).at.localeCompare(current(a).at);
  const shown = ofType
    .filter(
      (a) =>
        (!tag || current(a).tags.includes(tag)) &&
        (!words.length || assetHit(a, words)),
    )
    .sort(
      (a, b) =>
        !!b.pinned - !!a.pinned ||
        (a.pinned && b.pinned && byUse(a, b)) ||
        bySort(a, b),
    );
  const pinnedCount = shown.filter((a) => a.pinned).length;
  return (
    <>
      <PageHeading
        page="assets"
        action={
          <>
            <Button secondary onClick={() => setCollecting(true)}>
              <FolderSearch size={16} />
              收录本机 Skill
            </Button>
            <Button
              onClick={() => openCreate(filter === "all" ? "Skill" : filter)}
            >
              <Plus size={16} />
              新建资产
            </Button>
          </>
        }
      />
      <div className="asset-toolbar">
        <div className="segmented" aria-label="资产类型">
          {[
            ["all", "全部"],
            ["Skill", "Skills"],
            ["Prompt", "Prompts"],
            ["Workflow", "工作流"],
            ["Rule", "规则"],
          ].map(([id, name]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              className={filter === id ? "active" : ""}
              onClick={() => onFilter(id)}
            >
              {name}
              <span>
                {id === "all"
                  ? assets.length
                  : assets.filter((a) => a.type === id).length}
              </span>
            </button>
          ))}
        </div>
        <label className="inline-search">
          <Search size={15} />
          <input
            placeholder="搜索标题、说明、正文、标签"
            aria-label="在资产中搜索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="toolbar-right">
          {(tags.length > 0 || tag) && (
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
          <span className="divider" />
          <button
            className={`icon-button ${layout === "grid" ? "selected" : ""}`}
            aria-label="网格视图"
            aria-pressed={layout === "grid"}
            onClick={() => setLayout("grid")}
          >
            <Grid2X2 size={16} />
          </button>
          <button
            className={`icon-button ${layout === "list" ? "selected" : ""}`}
            aria-label="列表视图"
            aria-pressed={layout === "list"}
            onClick={() => setLayout("list")}
          >
            <List size={17} />
          </button>
        </div>
      </div>
      <div className="collection-meta">
        <span>
          全部资产 · <b>{shown.length}</b>
          {pinnedCount > 0 && (
            <>
              {" "}· 置顶 <b>{pinnedCount}</b>
            </>
          )}
        </span>
        <span className="collection-hint">
          进化阶段结合当前版本的复制记录与本人反馈，版本数单独保留。
        </span>
      </div>
      {archivedHits > 0 && (
        <div className="search-scope asset-scope" role="note">
          <div>
            <span>另有 {archivedHits} 个已归档资产匹配，不在资产库列出。</span>
            <button type="button" onClick={() => navigate("history")}>
              去版本归档
            </button>
          </div>
        </div>
      )}
      <div className={`asset-grid ${layout === "list" ? "list-layout" : ""}`}>
        {shown.map((a, i) => {
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
                  version={a.versions.length}
                  uses={uses(a).count}
                />
                <div className="card-body">
                  <div className="card-type">
                    <TypeIcon type={a.type} size={13} />
                    {typeLabel[a.type]}
                    <span>{originLabel(a)}</span>
                  </div>
                  <h3>{v.title}</h3>
                  <p>{v.description || "还没有一句话说明。"}</p>
                  <span className="sr-only">使用 {uses(a).count} 次</span>
                  <div className="card-bottom">
                    <div className="card-tags">
                      {v.tags.slice(0, 2).map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>
                    <StageBar stage={uses(a).stage} />
                  </div>
                </div>
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
              {!ofType.length && filter !== "all" && (
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
          {!ofType.length
            ? "当前类型还没有资产，清除筛选后这里仍会是空的。"
            : words.length
              ? `没有资产同时匹配“${words.join(" ")}”和当前筛选条件。`
              : "当前筛选条件下没有资产。"}
        </Empty>
      )}
      {shown.length === 0 && !narrowed && (
        <Empty
          sprite="numemon"
          title="还没有符合条件的资产"
          action={
            <Button
              secondary
              onClick={() => openCreate(filter === "all" ? "Skill" : filter)}
            >
              <Plus size={16} />
              新建资产
            </Button>
          }
        >
          从一份新的 Skill、Prompt、工作流或规则开始。
        </Empty>
      )}
      {collecting && (
        <SkillSourceImport
          state={state}
          adoptState={adoptState}
          notify={notify}
          onClose={() => setCollecting(false)}
          onSelect={select}
        />
      )}
    </>
  );
}
export function AssetEditor({
  asset,
  assets = [],
  type: initialType,
  onClose,
  onSave,
  notify,
}) {
  const old = asset && current(asset);
  const [type, setType] = useState(asset?.type || initialType || "Prompt"),
    [title, setTitle] = useState(old?.title || ""),
    [description, setDescription] = useState(old?.description || ""),
    [content, setContent] = useState(old?.content || ""),
    [tags, setTags] = useState(old?.tags.join("，") || ""),
    [source, setSource] = useState(old?.source || ""),
    [files, setFiles] = useState(old?.files || []),
    [references, setReferences] = useState(old?.references || []),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function importZip(file) {
    if (!file) return;
    setError("");
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("请导入 10 MB 以内的 ZIP 包");
      const { files: list, content: skillContent } = readSkillZip(
        new Uint8Array(await file.arrayBuffer()),
      );
      setFiles(list);
      setContent(skillContent);
      if (!title) setTitle(file.name.replace(/\.zip$/i, ""));
      notify(`已读取 ${list.length} 个文件，保存后加入资产库`);
    } catch (e) {
      setError(e.message || "无法读取 ZIP，请检查文件格式");
    }
  }
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const values = {
        title,
        type,
        description,
        content,
        tags: [
          ...new Set(
            tags
              .split(/[,，]/)
              .map((t) => t.trim())
              .filter(Boolean),
          ),
        ],
        source: source || "个人创建",
        files,
        ...(type === "Workflow" ? { references } : {}),
      };
      const success = await onSave(
        asset ? revise(asset, values) : makeAsset(values),
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
      title={asset ? "编辑资产 · 保存为新版本" : "新建资产"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="asset-form">
        <div className="form-intro">
          <p>
            {asset
              ? `保存后成为 v${next}.0，v${next - 1}.0 及更早版本完整保留在历史中。`
              : "选择类型，写下名称与内容。以后每次修改都会留下一个新版本。"}
          </p>
        </div>
        <div className="type-picker">
          {["Skill", "Prompt", "Workflow", "Rule"].map((t) => (
            <button
              type="button"
              disabled={!!asset}
              key={t}
              className={type === t ? "active" : ""}
              onClick={() => setType(t)}
            >
              <TypeIcon type={t} size={18} />
              {typeLabel[t]}
            </button>
          ))}
        </div>
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
        {type === "Skill" ? (
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
              onChange={(e) => importZip(e.target.files[0])}
            />
          </label>
        ) : (
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
          <WorkflowReferenceEditor
            references={references}
            assets={assets}
            onChange={setReferences}
            disabled={busy}
          />
        )}
        <div className="form-row">
          <label>
            标签
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="用逗号分隔"
            />
          </label>
          <label>
            来源
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="作者、链接，或个人创建"
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button type="button" secondary onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={busy}>
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
}) {
  // 刚保存新版本（3 秒内打开）才播放一次轻量翻页
  const [bump] = useState(() => !!versionBump && Date.now() - versionBump.at < 3000);
  const v = current(asset),
    [tab, setTab] = useState("content");
  const stage = stageOf(asset, state.assetActivity);
  const activity = useAssetActivity(asset, state, adoptState);
  const copyLock = React.useRef(false);
  const [copying, setCopying] = useState(false);
  const usageBlocked = activity.busy || !!activity.pending;
  async function copyPrompt() {
    if (copyLock.current || !activity.beginCopy()) return;
    copyLock.current = true; setCopying(true);
    try { if (await copy(v.content, notify)) await activity.record({ kind: "use", action: asset.type === "Rule" ? "copy-rule" : "copy-prompt", versionId: v.id }, true); }
    finally { copyLock.current = false; setCopying(false); activity.endCopy(); }
  }
  const onUsed = (action, extra = {}) => activity.record({ kind: "use", action, versionId: v.id, ...extra }, true);
  async function archive() {
    if (activity.busy || copying) return;
    if (
      !(await save({
        ...state,
        assets: state.assets.map((a) =>
          a.id === asset.id ? { ...a, archived: true } : a,
        ),
      }))
    )
      return;
    onClose();
    notify("资产已归档，可在版本与归档中恢复");
  }
  async function exportAsset(version = v, versionNumber) {
    const selected = version?.id ? version : v;
    const filename = `${selected.title}${versionNumber ? `-v${versionNumber}.0` : ""}`;
    if (asset.type === "Skill") {
      try {
        download(
          `${filename}.zip`,
          buildSkillZip(selected.files),
          "application/zip",
        );
        notify("ZIP 已生成并开始下载，请将文件附给 Agent；未验证安装");
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
        selected.content,
        "text/markdown;charset=utf-8",
      );
      notify("已导出 Markdown");
    }
  }
  return (
    <Dialog title="资产详情" onClose={() => { if (!activity.busy && !copying) onClose(); }} drawer>
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
        {asset.type === "Skill" ? (
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
        ) : asset.type === "Workflow" ? (
          <WorkflowDelivery
            key={v.id}
            asset={asset}
            version={v}
            onCopyStart={activity.beginCopy}
            onCopyEnd={activity.endCopy}
            onUsed={onUsed}
            usageBlocked={usageBlocked}
            onDownload={download}
            onEdit={() => { if (!activity.busy && !copying) onEdit(asset); }}
            notify={notify}
          />
        ) : (
          <div className="detail-actions">
            <Button disabled={copying || usageBlocked} onClick={copyPrompt}>
              <Copy size={16} />
              复制全文
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
        <dl className="detail-facts">
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
            ["history", "版本记录"],
          ]
            .filter(
              ([id]) =>
                !["files", "copies"].includes(id) || asset.type === "Skill",
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
            <pre className="content-preview">
              {v.content || "此资产没有文本预览。"}
            </pre>
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
          <button className="text-button danger-text" onClick={archive}>
            <Archive size={15} />
            归档资产
          </button>
        </div>
      </div>
    </Dialog>
  );
}

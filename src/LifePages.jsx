// 生活区：AI HOT（路线 v3 切片 5.3）与学习成长（切片 5.4），以及世界总览“今日热点”卡和模型设置里的两个面板。
// AI HOT 的内容来自 aihot.news 公开接口，服务端已按白名单清洗；这里仍只把它当文本渲染，链接只在 http/https 时生成。
import React, { useCallback, useEffect, useState } from "react";
import {
  Globe,
  RefreshCw,
  ExternalLink,
  BookmarkPlus,
  Plus,
  Trash2,
  RotateCcw,
  Archive,
  FolderOpen,
  BookOpen,
  ArrowUpRight,
  ShieldCheck,
  Hourglass,
} from "lucide-react";
import { request } from "./api.js";
import { Button, Empty, PageHeading, Dialog, Scanning } from "./components.jsx";
import {
  STATUS,
  learningOf,
  collectLink,
  setLinkStatus,
  deleteLink,
  restoreLink,
  setBookStatus,
  bookStatus,
  httpLink,
} from "./learning.js";

const TABS = [
  ["selected", "精选"],
  ["hot", "热点"],
  ["daily", "日报"],
];
const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("zh-CN") : "");
const size = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function useAiHot() {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await request("/aihot"));
      setError("");
    } catch (e) {
      setError(e.message || "读取失败");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, setData, reload: load };
}

// 缓存状态一句话：尚未拉取 / 更新于 / 拉取失败（上次成功）/ 网络访问已关闭。
function statusText(data, error, busy) {
  if (error) return `读取本机缓存失败：${error}`;
  if (!data) return "正在读取本机缓存…";
  if (busy) return "正在拉取…";
  const { settings, cache } = data;
  const parts = [];
  if (!settings.enabled) parts.push("网络访问已关闭");
  if (cache.status === "never") parts.push("尚未拉取");
  else if (cache.status === "failed")
    parts.push(`拉取失败 · 上次成功 ${when(cache.lastSuccessAt) || "无"} · 上次尝试 ${when(cache.lastAttemptAt)}`);
  else parts.push(`更新于 ${when(cache.lastSuccessAt)}`);
  return parts.join(" · ");
}

async function collect(state, save, notify, item) {
  const { state: next, result } = collectLink(state, { ...item, origin: "aihot" });
  if (result === "invalid") return notify("这条没有有效的原文链接，不能收藏", "warning");
  if (result === "duplicate") return notify("已收藏过，在学习成长的链接收藏里", "info");
  if (await save(next))
    notify(result === "restored" ? "已从回收区恢复到学习成长的链接收藏" : "已收藏到学习成长");
}

export function AiHot({ state, save, notify, navigate }) {
  const { data, error, setData } = useAiHot();
  const [tab, setTab] = useState("selected"),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true);
    try {
      setData(await request("/aihot/refresh", {}));
    } catch (e) {
      notify(e.message || "拉取未完成", "error");
    } finally {
      setBusy(false);
    }
  }
  const settings = data?.settings,
    cache = data?.cache;
  const items = cache?.sections[tab].items || [];
  const canFetch = settings?.enabled;
  return (
    <>
      <PageHeading
        page="aihot"
        action={
          canFetch &&
          settings.acknowledged && (
            <Button secondary onClick={refresh} disabled={busy}>
              <RefreshCw size={16} />
              立即刷新
            </Button>
          )
        }
      />
      <div className="subtle-notice" role="note" aria-label="访问说明">
        <Globe size={17} />
        <span>
          将访问 aihot.news 公开接口：只读取精选、热点和最新日报，默认每 {settings?.intervalHours ?? 3} 小时一次，结果缓存在本机。
          返回的标题和摘要只当作文本显示，不执行其中的任何内容；仅个人非商业使用。可以在模型设置里关闭。
        </span>
      </div>
      {settings && !settings.acknowledged && canFetch && (
        <div className="aihot-first">
          <p>首次使用需要你确认。点“开始拉取”后才会第一次访问，之后按间隔自动更新。</p>
          <Button onClick={refresh} disabled={busy}>
            <Globe size={16} />
            开始拉取
          </Button>
        </div>
      )}
      <div className="aihot-bar">
        <div className="segmented" role="group" aria-label="AI HOT 分类">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              aria-pressed={tab === id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
              <span>{cache?.sections[id].items.length ?? 0}</span>
            </button>
          ))}
        </div>
        <p className={`aihot-status ${cache?.status === "failed" ? "failed" : ""}`} role="status">
          {statusText(data, error, busy)}
          {data && !canFetch && (
            <button className="text-button" onClick={() => navigate("settings")}>
              去模型设置开启
            </button>
          )}
        </p>
      </div>
      {cache?.status === "failed" && cache.error && <p className="aihot-error">{cache.error}</p>}
      {tab === "daily" && cache?.sections.daily.date && (
        <p className="aihot-date">日报日期 {cache.sections.daily.date}</p>
      )}
      {!data ? (
        !error && <Scanning label="读取本机缓存" />
      ) : items.length ? (
        <ul className="hot-list">
          {items.map((item, i) => (
            <li key={`${item.url || item.title}-${i}`}>
              <article className="hot-item">
                <h3>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                      {item.title}
                      <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  ) : (
                    item.title
                  )}
                </h3>
                <p className="hot-meta">
                  {item.source && <span>{item.source}</span>}
                  {item.publishedAt && <time dateTime={item.publishedAt}>{when(item.publishedAt)}</time>}
                  {!item.url && <span>无有效原文链接</span>}
                </p>
                {item.summary && <p className="hot-summary">{item.summary}</p>}
                {item.url && (
                  <div className="hot-actions">
                    <button
                      className="text-button"
                      aria-label={`收藏到学习：${item.title}`}
                      onClick={() => collect(state, save, notify, item)}
                    >
                      <BookmarkPlus size={15} />
                      收藏到学习
                    </button>
                  </div>
                )}
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon={Globe} title={cache.status === "never" ? "尚未拉取" : "这个分类暂时没有内容"}>
          {cache.status === "never"
            ? "确认访问说明后点“开始拉取”，内容会缓存在本机。"
            : "可能是接口暂时没有返回这个分类，或上次拉取失败。"}
        </Empty>
      )}
    </>
  );
}

// 世界总览“今日热点”：优先热点，其次精选；只列有原文链接的 3–5 条；没有缓存时如实说明。
export function HomeHot({ navigate }) {
  const { data, error } = useAiHot();
  const cache = data?.cache;
  const pool = cache ? (cache.sections.hot.items.length ? cache.sections.hot.items : cache.sections.selected.items) : [];
  const items = pool.filter((i) => i.url).slice(0, 5);
  return (
    <section className="home-section home-hot" aria-labelledby="home-hot-title">
      <div className="section-title">
        <span className="section-index">E</span>
        <h2 id="home-hot-title">今日热点</h2>
        <p>来自 AI HOT 的本机缓存</p>
      </div>
      {error ? (
        <p className="recent-empty">读取 AI HOT 缓存失败：{error}</p>
      ) : !data ? (
        <p className="recent-empty">正在读取本机缓存…</p>
      ) : !items.length ? (
        <p className="recent-empty">
          {cache.status === "never" ? "尚未拉取。" : "缓存里暂时没有带原文链接的热点。"}
          在 AI HOT 页确认访问说明后才会访问 aihot.news。
        </p>
      ) : (
        <>
          <ol className="hot-card-list">
            {items.map((item, i) => (
              <li key={`${item.url}-${i}`}>
                <a className="hot-card-link" href={item.url} target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>
                {item.source && <small>{item.source}</small>}
              </li>
            ))}
          </ol>
          <p className="hot-card-status">
            {cache.status === "failed"
              ? `拉取失败，显示 ${when(cache.lastSuccessAt)} 的缓存`
              : `更新于 ${when(cache.lastSuccessAt)}`}
          </p>
        </>
      )}
      <button className="plan-link" onClick={() => navigate("aihot")}>
        <span>查看 AI HOT</span>
        <ArrowUpRight size={15} />
      </button>
    </section>
  );
}

function StatusPicker({ label, value, onChange }) {
  return (
    <div className="segmented status-picker" role="group" aria-label={label}>
      {STATUS.map(([id, name]) => (
        <button
          key={id}
          aria-pressed={value === id}
          className={value === id ? "active" : ""}
          onClick={() => value !== id && onChange(id)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

function AddLink({ state, save, notify, onClose }) {
  const [title, setTitle] = useState(""),
    [url, setUrl] = useState(""),
    [summary, setSummary] = useState("");
  return (
    <Dialog title="添加链接" onClose={onClose}>
      <form
        className="asset-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!httpLink(url)) return notify("请填写有效的 http 或 https 链接", "error");
          const { state: next, result } = collectLink(state, { title, url, summary, source: "手动添加" });
          if (result === "invalid") return notify("请填写标题和有效链接", "error");
          if (result === "duplicate") return notify("已收藏过这个链接", "info");
          if (!(await save(next))) return;
          notify(result === "restored" ? "已从回收区恢复这个链接" : "已添加到链接收藏");
          onClose();
        }}
      >
        <label>
          标题
          <input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          链接
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
          />
        </label>
        <label>
          摘要（可选）
          <textarea rows={4} maxLength={1000} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>
        <div className="form-actions">
          <Button secondary type="button" onClick={onClose}>
            取消
          </Button>
          <Button type="submit">保存</Button>
        </div>
      </form>
    </Dialog>
  );
}

const FOLDER_STATUS = {
  missing: "文件夹不存在或已移动",
  unsafe: "文件夹已变成符号链接或不是文件夹，已停止读取",
  unreadable: "文件夹无法读取（权限不足）",
};

export function Learning({ state, save, notify, navigate }) {
  const learning = learningOf(state);
  const [shelf, setShelf] = useState(null),
    [shelfError, setShelfError] = useState(""),
    [adding, setAdding] = useState(false),
    [recycle, setRecycle] = useState(false);
  const folderKey = learning.folders.map((f) => f.id).join(",");
  useEffect(() => {
    let live = true;
    setShelf(null);
    request("/learning/shelf")
      .then((result) => live && (setShelf(result), setShelfError("")))
      .catch((e) => live && setShelfError(e.message || "读取失败"));
    return () => {
      live = false;
    };
  }, [folderKey]);
  const links = learning.links.filter((l) => !l.deletedAt);
  const deleted = learning.links.filter((l) => l.deletedAt);
  const folderName = (root) => root.split("/").filter(Boolean).at(-1) || root;
  return (
    <>
      <PageHeading page="learning" />
      <div className="subtle-notice">
        <ShieldCheck size={17} />
        <span>
          书架只读取你在模型设置里指定的文件夹，只记 PDF / EPUB 的文件名、大小和修改时间，不复制、不打开原件；学习状态和链接收藏保存在本机主库。
        </span>
      </div>

      <section className="inbox-section learning-section" aria-labelledby="shelf-title">
        <div className="section-title">
          <span className="section-index">A</span>
          <h2 id="shelf-title">书架</h2>
          <p>
            {learning.folders.length} 个文件夹 · {shelf ? `${shelf.books.length} 本` : "读取中"}
          </p>
        </div>
        {!learning.folders.length ? (
          <Empty
            icon={FolderOpen}
            title="还没有指定书架文件夹"
            action={
              <Button secondary onClick={() => navigate("settings")}>
                去模型设置添加
                <ArrowUpRight size={16} />
              </Button>
            }
          >
            在模型设置里填写允许读取的文件夹（可以多个），这里会列出其中的 PDF 和 EPUB。
          </Empty>
        ) : shelfError ? (
          <p className="aihot-error">读取书架失败：{shelfError}</p>
        ) : !shelf ? (
          <Scanning label="读取书架" />
        ) : (
          <>
            {shelf.folders
              .filter((f) => f.status !== "ok" || f.truncated)
              .map((f) => (
                <p className="aihot-error" key={f.id}>
                  {f.path}：{FOLDER_STATUS[f.status] || "文件太多，只列出了前一部分"}
                </p>
              ))}
            {shelf.books.length ? (
              <ul className="shelf-list">
                {shelf.books.map((book) => {
                  const dir = book.path.includes("/") ? book.path.slice(0, book.path.lastIndexOf("/")) : "";
                  return (
                    <li key={book.id} className="shelf-book">
                      <div className="shelf-main">
                        <BookOpen size={16} aria-hidden="true" />
                        <div>
                          <h3>{book.name}</h3>
                          <small>
                            {folderName(book.root)}
                            {dir && ` / ${dir}`} · {size(book.size)} · 修改于 {day(book.modifiedAt)}
                          </small>
                        </div>
                      </div>
                      <StatusPicker
                        label={`学习状态：${book.name}`}
                        value={bookStatus(state, book.id)}
                        onChange={(status) => save(setBookStatus(state, book, status))}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="recent-empty">这些文件夹里还没有 PDF 或 EPUB。</p>
            )}
          </>
        )}
      </section>

      <section className="inbox-section learning-section" aria-labelledby="links-title">
        <div className="section-title">
          <span className="section-index">B</span>
          <h2 id="links-title">链接收藏</h2>
          <p>{links.length} 条 · 手动添加或来自 AI HOT</p>
        </div>
        <div className="learning-tools">
          <Button secondary onClick={() => setAdding(true)}>
            <Plus size={16} />
            添加链接
          </Button>
          <button className="text-button recycle-toggle" aria-expanded={recycle} onClick={() => setRecycle((v) => !v)}>
            <Archive size={15} />
            回收区 {deleted.length}
          </button>
        </div>
        {recycle && (
          <div className="recycle-list">
            {!deleted.length && <p className="body-copy">回收区是空的。</p>}
            {deleted.map((l) => (
              <div className="recycle-row" key={l.id}>
                <span>
                  <small>{l.source || "链接"}</small>
                  {l.title}
                </span>
                <button
                  className="icon-button"
                  aria-label={`恢复 ${l.title}`}
                  title="恢复"
                  onClick={async () => {
                    if (await save(restoreLink(state, l.id))) notify("已恢复到链接收藏");
                  }}
                >
                  <RotateCcw size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        {links.length ? (
          <ul className="learn-list">
            {links.map((l) => (
              <li key={l.id} className="learn-link">
                <h3>
                  <a href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.title}
                    <ExternalLink size={13} aria-hidden="true" />
                  </a>
                </h3>
                <p className="hot-meta">
                  {l.origin === "aihot" ? (
                    <>
                      {l.source && <span>{l.source}</span>}
                      <span>来自 AI HOT</span>
                    </>
                  ) : (
                    <span>{l.source || "手动添加"}</span>
                  )}
                  <time dateTime={l.createdAt}>收藏于 {when(l.createdAt)}</time>
                </p>
                {l.summary && <p className="hot-summary">{l.summary}</p>}
                <div className="hot-actions">
                  <StatusPicker
                    label={`学习状态：${l.title}`}
                    value={l.status}
                    onChange={(status) => save(setLinkStatus(state, l.id, status))}
                  />
                  <button
                    className="icon-button"
                    aria-label={`删除 ${l.title}`}
                    title="删除（进回收区）"
                    onClick={async () => {
                      if (await save(deleteLink(state, l.id))) notify("已移入回收区，可恢复");
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={BookmarkPlus} title="还没有链接收藏">
            在 AI HOT 里点“收藏到学习”，或在这里手动添加。
          </Empty>
        )}
      </section>

      <section className="inbox-section learning-section" aria-labelledby="parse-title">
        <div className="section-title">
          <span className="section-index">C</span>
          <h2 id="parse-title">内容解析</h2>
          <p>摘要、划线、问答</p>
        </div>
        <p className="learning-later">
          <Hourglass size={15} aria-hidden="true" />
          以后再做。现在只做书架索引、学习状态和链接收藏，不读取书或网页的正文。
        </p>
      </section>
      {adding && <AddLink state={state} save={save} notify={notify} onClose={() => setAdding(false)} />}
    </>
  );
}

// 模型设置：AI HOT 网络访问开关与拉取间隔（保存在数据目录，不进主库）。
export function AiHotSettings({ notify }) {
  const { data, error, setData } = useAiHot();
  const [draft, setDraft] = useState(null);
  const value = draft || data?.settings;
  return (
    <section className="settings-panel" aria-labelledby="aihot-settings-title">
      <div className="section-head">
        <div>
          <h2 id="aihot-settings-title">AI HOT 网络访问</h2>
          <p>
            开启后按间隔访问 aihot.news 的公开只读接口（精选、热点、最新日报），缓存在本机数据目录。关闭后不再发出任何请求，页面只显示已有缓存。
          </p>
        </div>
      </div>
      {error && <p className="aihot-error">读取设置失败：{error}</p>}
      {value && (
        <form
          className="settings-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              setData(
                await request("/aihot/settings", {
                  enabled: value.enabled,
                  intervalHours: value.intervalHours,
                }),
              );
              setDraft(null);
              notify("已保存 AI HOT 设置");
            } catch (err) {
              notify(err.message || "保存失败", "error");
            }
          }}
        >
          <label className="check-row">
            <input
              type="checkbox"
              checked={value.enabled}
              onChange={(e) => setDraft({ ...value, enabled: e.target.checked })}
            />
            允许访问 aihot.news 公开接口
          </label>
          <label>
            拉取间隔
            <select
              value={value.intervalHours}
              onChange={(e) => setDraft({ ...value, intervalHours: Number(e.target.value) })}
            >
              {[1, 2, 3, 6, 12, 24].map((h) => (
                <option key={h} value={h}>
                  每 {h} 小时
                </option>
              ))}
            </select>
          </label>
          <Button secondary type="submit">
            保存 AI HOT 设置
          </Button>
        </form>
      )}
    </section>
  );
}

// 模型设置：学习成长书架文件夹（只读索引的范围）。只能经专用接口添加或移除，服务端校验路径。
export function ShelfSettings({ state, notify, adoptState }) {
  const folders = learningOf(state).folders;
  const [path, setPath] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(action, data, done) {
    setBusy(true);
    try {
      adoptState(await request(`/learning/folders/${action}`, { ...data, expectedRevision: state.revision }));
      notify(done);
      return true;
    } catch (e) {
      notify(e.message || "操作未完成", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-panel" aria-labelledby="shelf-settings-title">
      <div className="section-head">
        <div>
          <h2 id="shelf-settings-title">学习成长书架</h2>
          <p>
            指定允许工作台读取的文件夹（最多 10 个）。只列出其中 PDF / EPUB 的文件名、大小和修改时间，不复制、不打开原件；不跟随符号链接。
          </p>
        </div>
      </div>
      {folders.map((f) => (
        <div className="setting-row folder-row" key={f.id}>
          <div>
            <strong>{f.path}</strong>
            <p>添加于 {day(f.addedAt)}</p>
          </div>
          <button
            className="icon-button"
            aria-label={`移除文件夹 ${f.path}`}
            title="移除（学习状态保留）"
            disabled={busy}
            onClick={() => run("remove", { id: f.id }, "已移除书架文件夹；学习状态保留")}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <form
        className="settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run("add", { path: path.trim() }, "已添加书架文件夹")) setPath("");
        }}
      >
        <label>
          文件夹路径
          <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/Users/你的名字/Books" />
        </label>
        <Button secondary type="submit" disabled={busy}>
          <FolderOpen size={16} />
          添加文件夹
        </Button>
      </form>
    </section>
  );
}


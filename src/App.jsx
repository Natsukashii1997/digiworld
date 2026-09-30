import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Sun,
  Inbox as InboxIcon,
  PenLine,
  Folder,
  ScanLine,
  Search,
  ArrowRight,
  Menu,
  X,
  Info,
  TriangleAlert,
  OctagonAlert,
} from "lucide-react";
import { current } from "./store.js";
import { searchWorkspace, terms, GROUP_LIMIT } from "./search.js";
import { initializeWorkspace, writeState, request } from "./api.js";
import { Agents, Projects } from "./DiscoveryPages.jsx";
import { Dialog, TypeIcon, Maturity, typeLabel } from "./components.jsx";
import { Assets, AssetEditor, AssetDetail } from "./Assets.jsx";
import { Knowledge } from "./Knowledge.jsx";
import { Home, ICONS as PAGE_ICONS } from "./Home.jsx";
import { PlannedPage, Inbox } from "./PlannedPage.jsx";
import { Collab } from "./Collab.jsx";
import { pendingItems } from "./pending.js";
import { PartnerScreen } from "./PartnerScreen.jsx";
import { Odometer } from "./Odometer.jsx";
import {
  Notes,
  Night,
  HistoryPage,
  References,
  Settings,
} from "./WorkspacePages.jsx";
import { ScrollDetail } from "./Scrolls.jsx";
import { AiHot, Learning } from "./LifePages.jsx";
import { scrollsOf, createScroll } from "./scrolls.js";
import { PAGES, ZONES, resolveRoute } from "./pages.js";
import {
  Pixel,
  PixelText,
  Digivice,
  partnerOf,
  stageOf,
  STAGES,
  StageBar,
} from "./pixel.jsx";

const ICONS = { home: Sun, ...PAGE_ICONS };
// 并入其他页面的旧地址（如 #health、#scrolls）改写为实际页面地址，并记下要定位的页内分区或类型标签。
function initialTarget() {
  const target = resolveRoute(location.hash.slice(1));
  if (target.anchor || target.filter) history.replaceState(null, "", `#${target.route}`);
  return target;
}
export default function App() {
  const [state, setState] = useState(null),
    [error, setError] = useState(""),
    [target, setTarget] = useState(initialTarget),
    [filter, setFilter] = useState(() => target.filter || "all"),
    [selected, setSelected] = useState(null),
    [scrollId, setScrollId] = useState(null),
    [editing, setEditing] = useState(null),
    [create, setCreate] = useState(null),
    [toast, setToast] = useState(null),
    [palette, setPalette] = useState(false),
    [menu, setMenu] = useState(false),
    [saving, setSaving] = useState(false),
    [evolution, setEvolution] = useState(null),
    [versionBump, setVersionBump] = useState(null),
    [veil, setVeil] = useState(true),
    [season, setSeasonLabel] = useState("春 · 花开"),
    [ruleInstalls, setRuleInstalls] = useState({ items: [], error: "", loaded: false });
  // 在推进项目的只读状态与体检（路线 v3 切片 2.1/2.2）。不在主库里，由服务端现读项目文件与 Git。
  const [projectStatus, setProjectStatus] = useState({
    items: [],
    error: "",
    loaded: true,
  });
  const { route, anchor } = target;
  const [saveError, setSaveError] = useState("");
  const partnerScreen = useRef();
  const setSeason = useCallback((s) => setSeasonLabel(s.label), []);
  const toastTimer = useRef(),
    saveLock = useRef(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const s = await initializeWorkspace();
        if (live) setState(s);
      } catch (e) {
        if (live) setError(e.message);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  // 规则模板装入记录在服务端独立记录里。读取失败要如实显示，不能当成“没有装入”（D-R3）。
  const refreshRuleInstalls = useCallback(async () => {
    // 每次重读都先标记为“读取中”，不让旧结果冒充当前事实
    setRuleInstalls((prev) => ({ ...prev, error: "", loaded: false }));
    try {
      const { items } = await request("/rule-templates/installs", {});
      setRuleInstalls({ items, error: "", loaded: true });
    } catch (e) {
      setRuleInstalls({ items: [], error: e.message || "读取失败", loaded: true });
    }
  }, []);
  const statusRun = useRef(0);
  const refreshProjectStatus = useCallback(async () => {
    // 只采用最后一次读取的结果，先发出的旧请求晚到时不覆盖新结果。
    const run = ++statusRun.current;
    setProjectStatus((prev) => ({ ...prev, error: "", loaded: false }));
    try {
      const result = await request("/project-status/inspect", {});
      if (run === statusRun.current)
        setProjectStatus({ ...result, error: "", loaded: true });
    } catch (e) {
      if (run === statusRun.current)
        setProjectStatus({ items: [], error: e.message || "读取失败", loaded: true });
    }
  }, []);
  // 只在“在推进”集合或停滞阈值变化时重读；没有在推进项目时不发请求。
  const activeKey = state
    ? JSON.stringify([
        (state.connections?.projects || [])
          .filter((p) => p.active)
          .map((p) => p.id),
        state.connections?.projectStallDays || 0,
      ])
    : "";
  const ready = !!state;
  // 跳到页内分区（如能力体检）：等页面渲染出分区后滚动到位并移交焦点，然后清除锚点。
  useEffect(() => {
    if (!ready || !anchor) return;
    let frame,
      tries = 0;
    const seek = () => {
      const el = document.getElementById(anchor);
      if (el) {
        el.scrollIntoView({ block: "start" });
        el.focus({ preventScroll: true });
        setTarget((prev) => (prev.anchor === anchor ? { ...prev, anchor: null } : prev));
      } else if (tries++ < 60) frame = requestAnimationFrame(seek);
    };
    frame = requestAnimationFrame(seek);
    return () => cancelAnimationFrame(frame);
  }, [ready, route, anchor]);
  useEffect(() => {
    if (ready) refreshRuleInstalls();
  }, [ready, refreshRuleInstalls]);
  useEffect(() => {
    if (!ready) return;
    if (activeKey.startsWith("[[]")) {
      statusRun.current++;
      setProjectStatus({ items: [], error: "", loaded: true });
    }
    else refreshProjectStatus();
  }, [ready, activeKey, refreshProjectStatus]);
  useEffect(() => {
    if (!state || !veil) return;
    const t = setTimeout(() => setVeil(false), 900);
    return () => clearTimeout(t);
  }, [state, veil]);
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const dialog = document.querySelector('[role="dialog"]');
        if (dialog && dialog.getAttribute("aria-label") !== "搜索工作台")
          return;
        setPalette((v) => !v);
      }
    };
    const hash = () => {
      const next = initialTarget();
      if (next.filter) setFilter(next.filter);
      // 站内跳转到页内分区时，随后触发的 hashchange 不带锚点，不能把待定位的分区冲掉。
      setTarget((prev) => (next.route === prev.route && !next.anchor ? prev : next));
      setMenu(false);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("hashchange", hash);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("hashchange", hash);
    };
  }, []);
  // tone：success 成功 / info 说明 / warning 需留意 / error 失败。失败不显示对勾。
  function notify(message, tone = "success") {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setToast(null),
      tone === "error" ? 8000 : tone === "warning" ? 5500 : 4200,
    );
  }
  async function save(next) {
    if (saveLock.current) {
      notify("正在保存，请稍后再操作", "warning");
      return false;
    }
    saveLock.current = true;
    setSaving(true);
    try {
      const stored = await writeState(next);
      setState(stored);
      setSaveError("");
      return true;
    } catch (e) {
      notify(e.message || "保存失败，原数据未改变", "error");
      setSaveError(e.message || "保存失败，原数据未改变");
      return false;
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  function navigate(id) {
    const next = resolveRoute(id);
    if (next.filter) setFilter(next.filter);
    setTarget(next);
    location.hash = next.route;
    setMenu(false);
    setSelected(null);
    setScrollId(null);
    window.scrollTo({ top: 0 });
  }
  function adoptState(next) {
    setState((previous) =>
      !previous || next.revision >= previous.revision ? next : previous,
    );
  }
  const common = {
    state,
    save,
    notify,
    adoptState,
    ruleInstalls,
    refreshRuleInstalls,
    projectStatus,
    refreshProjectStatus,
  };
  const asset = state?.assets.find((a) => a.id === selected);
  // 卷被删除（进回收区）后抽屉自动关闭。
  const scroll = state && scrollsOf(state).find((s) => s.id === scrollId && !s.deletedAt);
  // 新建资产选“焚决”：只建卷，保存成功后直接打开该卷。
  async function createScrollNamed(name) {
    const { scrolls, scroll: made } = createScroll(scrollsOf(state), name);
    if (!(await save({ ...state, scrolls }))) return false;
    notify(`已新建卷「${made.name}」`);
    // 同一批更新里先关对话框再开抽屉：对话框先归还焦点，抽屉再接管焦点。
    setCreate(null);
    setScrollId(made.id);
    return true;
  }
  if (!state)
    return (
      <div className="boot-screen">
        <Digivice size="lg">
          <Pixel sprite="egg" size={46} className="boot-egg" />
        </Digivice>
        <h2>{error ? "本地数据暂时不可用" : "数码世界"}</h2>
        <p>{error || "正在连接本机数据…"}</p>
        {error && (
          <button className="button" onClick={() => location.reload()}>
            重新加载
          </button>
        )}
      </div>
    );
  const partner = partnerOf(state);
  const pending = pendingItems(state, ruleInstalls, projectStatus);
  const currentPage = PAGES.find((p) => p.id === route);
  return (
    <div className="app-shell">
      {veil && <div className="boot-veil" aria-hidden="true" />}
      <WorldDeco />
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content").focus();
        }}
      >
        跳到主要内容
      </a>
      {menu && <div className="sidebar-scrim" onClick={() => setMenu(false)} />}
      <aside className={`sidebar ${menu ? "mobile-open" : ""}`}>
        <button
          className="brand"
          onClick={() => navigate("home")}
          aria-label="数码世界 · 世界总览"
        >
          <span className="brand-crest">
            <Pixel sprite="crest" size={30} />
          </span>
          <span className="brand-text">
            <PixelText text="数码世界" size={24} weight={600} threshold={110} scale={1} />
            <span className="brand-en" aria-hidden="true">
              {[..."DIGITAL"].map((ch, i) => (
                <b key={`d${i}`}>{ch}</b>
              ))}
              <i />
              {[..."WORLD"].map((ch, i) => (
                <b key={`w${i}`}>{ch}</b>
              ))}
            </span>
          </span>
        </button>
        <nav aria-label="主导航" className="nav">
          {ZONES.map((zone) => (
            <div
              className={`nav-zone nav-zone-${zone.id}`}
              role="group"
              aria-label={zone.label}
              key={zone.id}
            >
              {zone.id === "life" && <div className="nav-divider" role="separator" />}
              {zone.id !== "today" && (
                <div className="nav-zone-title" aria-hidden="true">
                  {zone.label}
                  {zone.en && <small>{zone.en}</small>}
                </div>
              )}
              {zone.groups.map((group) => (
                <div className="nav-group" key={group}>
                  {zone.groups.length > 1 && <div className="nav-heading">{group}</div>}
                  {PAGES.filter((p) => p.group === group && !p.navHidden).map(({ id, label, maturity }) => {
                    const Icon = ICONS[id];
                    const count =
                      id === "assets"
                        ? state.assets.filter((a) => !a.archived).length
                        : id === "notes" && state.notes.length
                          ? state.notes.length
                          : null;
                    return (
                      <button
                        key={id}
                        className={`nav-item ${route === id ? "active" : ""}`}
                        aria-current={route === id ? "page" : undefined}
                        onClick={() => {
                          if (id === "assets") setFilter("all");
                          navigate(id);
                        }}
                      >
                        <Icon size={17} strokeWidth={1.7} />
                        <span>{label}</span>
                        {count !== null ? (
                          <small className="nav-count">
                            <Odometer value={count} />
                          </small>
                        ) : ["draft", "planned"].includes(maturity) ? (
                          <small className={`nav-flag ${maturity}`}>
                            {maturity === "planned" ? "规划" : "草稿"}
                          </small>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </nav>
        <button
          className="partner"
          onClick={() => {
            partnerScreen.current?.poke();
            navigate("home");
          }}
          aria-label={`伙伴 ${partner.name}，${partner.stage}；前往世界总览`}
        >
          <span className="partner-screen" data-partner-screen aria-hidden="true">
            <PartnerScreen ref={partnerScreen} mode="roam" onSeason={setSeason} />
          </span>
          <span className="partner-line" aria-hidden="true">
            <span className="partner-season">
              {season} · {partner.name}
            </span>
          </span>
        </button>
        <div className="save-state">
          <span className={`save-dot ${saving ? "busy" : saveError ? "error" : ""}`} />
          <span>{saving ? "保存中…" : saveError ? "上次保存失败" : "已保存到本机"}</span>
          <small>
            REV <Odometer value={state.revision} />
          </small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="crumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={19} />
            </button>
            <span className="crumb-root">数码世界</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-code">{currentPage?.code}</span>
            <strong>{currentPage?.label}</strong>
          </div>
          <div className="topbar-actions">
            <span className="link-state">
              <span className="save-dot" />
              127.0.0.1 · 仅本机
            </span>
            <button
              className="topbar-search"
              aria-label="搜索"
              title="搜索工作台（⌘K）"
              onClick={() => setPalette(true)}
            >
              <Search size={16} />
              <kbd aria-hidden="true">⌘K</kbd>
            </button>
            <button
              className="icon-button topbar-inbox"
              aria-label={`待处理 ${pending.length} 项`}
              title="待处理"
              onClick={() => navigate("inbox")}
            >
              <InboxIcon size={16} />
              {pending.length > 0 && (
                <small className="nav-count">
                  <Odometer value={pending.length} />
                </small>
              )}
            </button>
            <button
              className="icon-button"
              aria-label="快速记录"
              title="快速记录"
              onClick={() => navigate("notes")}
            >
              <PenLine size={16} />
            </button>
          </div>
        </header>
        {saveError && (
          <div className="save-error-banner" role="alert">
            {saveError}
          </div>
        )}
        <main
          id="main-content"
          tabIndex={-1}
          className={`main-content page-${route}`}
          key={route}
        >
          {route === "home" && (
            <Home
              {...common}
              navigate={navigate}
              select={setSelected}
              openCreate={setCreate}
            />
          )}
          {route === "assets" && (
            <Assets
              {...common}
              filter={filter}
              onFilter={setFilter}
              openCreate={setCreate}
              select={setSelected}
              navigate={navigate}
              openScroll={setScrollId}
            />
          )}
          {route === "agents" && (
            <Agents
              {...common}
              navigate={navigate}
              onSelect={(id) => {
                navigate("assets");
                setSelected(id);
              }}
            />
          )}
          {route === "projects" && <Projects {...common} />}
          {route === "knowledge" && <Knowledge {...common} navigate={navigate} />}
          {route === "notes" && <Notes {...common} navigate={navigate} />}
          {route === "night" && <Night {...common} />}
          {route === "history" && (
            <HistoryPage {...common} select={setSelected} />
          )}
          {route === "references" && <References {...common} />}
          {route === "settings" && <Settings {...common} />}
          {route === "inbox" && (
            <Inbox {...common} navigate={navigate} select={setSelected} />
          )}
          {route === "collab" && <Collab {...common} navigate={navigate} />}
          {route === "aihot" && <AiHot {...common} navigate={navigate} />}
          {route === "learning" && <Learning {...common} navigate={navigate} />}
          {["calendar", "silver"].includes(route) && (
            <PlannedPage id={route} navigate={navigate} />
          )}
        </main>
      </div>
      {asset && !editing && (
        <AssetDetail
          {...common}
          key={asset.id}
          asset={asset}
          versionBump={versionBump?.assetId === asset.id ? versionBump : null}
          onSelect={setSelected}
          onClose={() => setSelected(null)}
          onEdit={(a) => setEditing(a)}
        />
      )}
      {scroll && (
        <ScrollDetail
          {...common}
          key={scroll.id}
          scroll={scroll}
          onClose={() => setScrollId(null)}
        />
      )}
      {(create || editing) && (
        <AssetEditor
          asset={editing}
          assets={state.assets}
          type={create}
          notify={notify}
          onCreateScroll={createScrollNamed}
          onClose={() => {
            setCreate(null);
            setEditing(null);
          }}
          onSave={async (a) => {
            const before = editing;
            const success = await save({
              ...state,
              assets: editing
                ? state.assets.map((x) => (x.id === a.id ? a : x))
                : [a, ...state.assets],
            });
            if (!success) return false;
            notify(editing ? "已保存为新版本" : "资产已收入资产仓库");
            const stageFrom = before && stageOf(before, state.assetActivity),
              stageTo = before && stageOf(a, state.assetActivity);
            // UI v13.2：普通保存新版本只在详情里轻量翻页；全屏演出只留给新收录和阶段真正升级
            if (before && !(stageTo > stageFrom))
              setVersionBump({ assetId: a.id, from: before.versions.length, at: Date.now() });
            else
              setEvolution(
                before
                  ? {
                      kind: "evolve",
                      type: a.type,
                      title: current(a).title,
                      from: before.versions.length,
                      to: a.versions.length,
                      stageFrom,
                      stageTo,
                    }
                  : { kind: "hatch", type: a.type, title: current(a).title },
              );
            return true;
          }}
        />
      )}
      {evolution && (
        <Evolution {...evolution} onDone={() => setEvolution(null)} />
      )}
      {palette && (
        <SearchPalette
          state={state}
          onClose={() => setPalette(false)}
          navigate={(id) => {
            navigate(id);
            setPalette(false);
          }}
          select={(id) => {
            setSelected(id);
            setPalette(false);
          }}
        />
      )}
      {toast && (
        <div className={`toast tone-${toast.tone}`} role="status" key={toast.message}>
          <span className="toast-mark" aria-hidden="true">
            {toast.tone === "error" ? (
              <OctagonAlert size={14} />
            ) : toast.tone === "warning" ? (
              <TriangleAlert size={14} />
            ) : toast.tone === "info" ? (
              <Info size={14} />
            ) : (
              <PixelCheck />
            )}
          </span>
          <span className="toast-text">
            <small>
              {{ success: "完成", info: "说明", warning: "请留意", error: "未完成" }[toast.tone]}
            </small>
            <span>{toast.message}</span>
          </span>
          <button aria-label="关闭提示" onClick={() => setToast(null)}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
// 液晶提示条的点阵对勾（UI v13.2）
const CHECK_ROWS = ["0000001", "0000011", "1000110", "1101100", "0111000", "0010000"];
function PixelCheck() {
  return (
    <svg className="pixel-check" width="14" height="12" viewBox="0 0 7 6" aria-hidden="true">
      {CHECK_ROWS.flatMap((row, y) =>
        [...row].map((c, x) => (c === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null)),
      )}
    </svg>
  );
}
// 保存成功后的进化演出：只在写入并回读成功后出现；不拦截点击，可继续操作，Esc 可提前关闭。
function Evolution({ kind, type, title, from, to, stageFrom, stageTo, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    const key = (e) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", key);
    };
  }, []);
  const evolved = kind === "evolve" && stageTo > stageFrom;
  return (
    <div className={`evolution ${kind}`} role="status" aria-live="polite">
      <div className="evolution-stage">
        <span className="evo-pillar" />
        <span className="evo-flash" />
        <span className="evo-rings">
          <i />
          <i />
          <i />
        </span>
        <span className="evo-bits">
          {Array.from({ length: 16 }, (_, k) => {
            const a = (k / 16) * Math.PI * 2,
              r = 90 + (k % 3) * 26;
            return (
              <i
                key={k}
                style={{
                  "--dx": `${Math.cos(a) * r}px`,
                  "--dy": `${Math.sin(a) * r}px`,
                }}
              />
            );
          })}
        </span>
        <span className={`evo-glyph type-${type}`}>
          <Pixel sprite={kind === "hatch" ? "egg" : type} size={kind === "hatch" ? 64 : 84} />
        </span>
      </div>
      <div className="evolution-caption">
        <small>{kind === "hatch" ? "NEW DATA · HATCHED" : evolved ? "DIGIVOLUTION" : "NEW VERSION"}</small>
        <strong>
          {kind === "hatch"
            ? `${typeLabel[type]} 已诞生`
            : evolved
              ? `${STAGES[stageFrom]} → ${STAGES[stageTo]}`
              : `v${from}.0 → v${to}.0`}
        </strong>
        <span>{title}</span>
        {kind === "evolve" && <StageBar stage={stageTo} pop={evolved} />}
      </div>
    </div>
  );
}

// 背景里缓慢漂浮的像素符号，只作装饰。
const DECO = [
  ["bit_plus", 8, 18, 10, 0],
  ["bit_dia", 14, 72, 30, 3],
  ["bit_block", 9, 40, 62, 6],
  ["bit_plus", 10, 86, 84, 2],
  ["bit_dia", 12, 58, 12, 5],
  ["bit_block", 8, 24, 90, 1],
  ["bit_plus", 7, 93, 46, 4],
  ["bit_dia", 9, 34, 36, 7],
];
function WorldDeco() {
  return (
    <div className="world-deco" aria-hidden="true">
      {DECO.map(([sprite, size, x, y, delay], i) => (
        <span
          key={i}
          style={{ left: `${x}%`, top: `${y}%`, animationDelay: `-${delay * 2}s` }}
        >
          <Pixel sprite={sprite} size={size} />
        </span>
      ))}
    </div>
  );
}

function SearchPalette({ state, onClose, navigate, select }) {
  const [q, setQ] = useState("");
  // 延迟值让输入保持流畅；大主库时搜索在输入之后计算。
  const query = useDeferredValue(q);
  const found = useMemo(() => searchWorkspace(state, query), [state, query]);
  const pages = PAGES.filter((r) =>
    terms(query).every((w) =>
      [r.label, r.title, r.eyebrow].join(" ").toLowerCase().includes(w),
    ),
  );
  const assets = found
    ? found.assets
    : state.assets.filter((a) => !a.archived).map((asset) => ({ asset }));
  const groups = [
    [
      "资产",
      assets,
      ({ asset, where, snippet }) => (
        <button key={asset.id} onClick={() => select(asset.id)}>
          <TypeIcon type={asset.type} size={17} />
          <SearchHit
            title={current(asset).title}
            snippet={snippet}
            where={where}
          />
          <small>
            {typeLabel[asset.type]} · v{asset.versions.length}.0
          </small>
        </button>
      ),
    ],
    [
      "随手记",
      found?.notes || [],
      ({ item, snippet }) => (
        <button key={item.id} onClick={() => navigate("notes")}>
          <PenLine size={17} />
          <SearchHit
            title={item.text.slice(0, 40)}
            snippet={item.text.length > 40 ? snippet : undefined}
          />
          <small>{new Date(item.at).toLocaleDateString("zh-CN")}</small>
        </button>
      ),
    ],
    [
      "参考",
      found?.references || [],
      ({ item, where, snippet }) => (
        <button key={item.id} onClick={() => navigate("references")}>
          <ScanLine size={17} />
          <SearchHit title={item.title} snippet={snippet} where={where} />
        </button>
      ),
    ],
    [
      "项目",
      found?.projects || [],
      ({ item, where, snippet }) => (
        <button key={item.id} onClick={() => navigate("projects")}>
          <Folder size={17} />
          <SearchHit title={item.name} snippet={snippet} where={where} />
        </button>
      ),
    ],
  ];
  const empty = !pages.length && groups.every(([, items]) => !items.length);
  return (
    <Dialog title="搜索工作台" onClose={onClose}>
      <div className="command-search">
        <Search size={19} />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索资产正文与标签、随手记、参考、项目，或跳转页面…"
          aria-label="全局搜索"
        />
        <kbd>ESC</kbd>
      </div>
      <div className="search-results" aria-busy={q !== query}>
        {pages.length > 0 && (
          <>
            <div className="nav-heading">跳转</div>
            {pages.map((p) => {
              const Icon = ICONS[p.id];
              return (
                <button key={p.id} onClick={() => navigate(p.id)}>
                  <Icon size={17} />
                  <span>{p.label}</span>
                  <Maturity level={p.maturity} />
                  <ArrowRight size={15} />
                </button>
              );
            })}
          </>
        )}
        {groups.map(
          ([title, items, render]) =>
            items.length > 0 && (
              <React.Fragment key={title}>
                <div className="nav-heading">
                  {title} · {items.length}
                </div>
                {items.slice(0, GROUP_LIMIT).map(render)}
                {items.length > GROUP_LIMIT && (
                  <p className="search-more">
                    还有 {items.length - GROUP_LIMIT} 条，补充关键词可缩小范围
                  </p>
                )}
              </React.Fragment>
            ),
        )}
        {empty && (
          <p className="search-empty" role="status">
            没有匹配“{query.trim()}”的记录。
          </p>
        )}
      </div>
      <div className="search-scope" role="note" aria-label="搜索范围">
        {found?.archived > 0 && (
          <div>
            <span>另有 {found.archived} 个已归档资产匹配，不在此列出。</span>
            <button type="button" onClick={() => navigate("history")}>
              去版本归档
            </button>
          </div>
        )}
        <div>
          <span>
            搜索资产当前版本（含正文与文本文件）、随手记、参考和项目。知识库正文、历史版本和二进制文件不在此搜索。
          </span>
          <button type="button" onClick={() => navigate("knowledge")}>
            去知识仓库查询
          </button>
        </div>
      </div>
    </Dialog>
  );
}
// 命中位置放在标题列内，长文件路径可断行，不挤占标题与摘录。
function SearchHit({ title, snippet, where }) {
  return (
    <span className="search-hit">
      <span>{title}</span>
      {snippet && <em>{snippet}</em>}
      {where && <i className="hit-where">命中：{where}</i>}
    </span>
  );
}

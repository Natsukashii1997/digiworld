import {projectStatusKey} from './project-freshness.js';
import { saveWorkspaceEdit } from './workspace-refresh.js';
import {pageLeaveProblem} from './navigation-guard.js';
import { useScanMotion, useReadScan, Reading } from './ScanMotion.jsx';
import { flyData } from './data-flight.js';
import { motionOrigin } from './scan-motion.js';
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
import { ProjectsV16 as Projects } from "./ProjectsV16.jsx";
import { Dialog, TypeIcon, Maturity, typeLabel } from "./components.jsx";
import { Assets, AssetEditor, AssetDetail } from "./Assets.jsx";
import { Home, ICONS as PAGE_ICONS } from "./Home.jsx";
import { PartnerScreen } from "./PartnerScreen.jsx";
import { Odometer } from "./Odometer.jsx";
import { Motes, useV14Interactions } from "./v14.jsx";
import {
  References,
  Settings,
} from "./WorkspacePages.jsx";
import {buildReplicaPack} from './reverse-v4.js';
import {entryName} from './scrolls.js';
import {useSearchSources} from './useSearchSources.js';
import { ScrollDetail } from "./Scrolls.jsx";
import { Collection } from "./Collection.jsx";
import { NotesV16 } from "./NotesV16.jsx";
import { scrollsOf, createScroll } from "./scrolls.js";
import { PAGES, resolveRoute } from "./pages.js";
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
// 旧板块地址归一到首页；焚决别名仍选择资产仓库内的类型。
function initialTarget() {
  const target = resolveRoute(location.hash.slice(1));
  if (location.hash.slice(1) !== target.route) history.replaceState(null, "", `#${target.route}`);
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
  // UI v14e 全站手感：主区的涟漪、微光、倾斜与阶梯浮现。
  const mainRef = useRef();
  useV14Interactions(mainRef, `${route}:${state ? 1 : 0}`);
  useScanMotion(mainRef, `${route}:${state ? 1 : 0}`);
  useReadScan(mainRef,!state&&!error,!!state&&!error);
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
  const activeKey=state?projectStatusKey(state):'';
  const statusSource=useRef({key:activeKey,active:false});
  statusSource.current={key:activeKey,active:!!state?.connections?.projects?.some(p=>p.active)};
  const refreshProjectStatus = useCallback(async () => {
    const run=++statusRun.current,source=statusSource.current;
    if(!source.active){const result={items:[],error:'',loaded:true,sourceKey:source.key};setProjectStatus(result);return result;}
    setProjectStatus(prev=>({...prev,error:'',loaded:false}));
    try {
      const result=await request('/project-status/inspect',{});
      if(run!==statusRun.current||source.key!==statusSource.current.key)return null;
      const fresh={...result,sourceKey:source.key,error:'',loaded:true,checkedAt:new Date().toISOString()};
      setProjectStatus(fresh);return fresh;
    } catch(e) {
      if(run===statusRun.current&&source.key===statusSource.current.key)setProjectStatus(prev=>({...prev,error:e.message||'读取失败',loaded:true}));
      return null;
    }
  }, []);
  const ready = !!state;
  const currentRoute=useRef(target.route);currentRoute.current=target.route;
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
  useEffect(()=>{if(ready)void refreshProjectStatus();},[ready,activeKey,route==='projects',refreshProjectStatus]);
  useEffect(()=>{
    const focus=()=>{if(ready&&document.visibilityState==='visible'&&currentRoute.current==='projects')void refreshProjectStatus();};
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);return()=>{window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
  },[ready,refreshProjectStatus]);
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
      const problem=pageLeaveProblem();
      if(problem){history.replaceState(null,'',`#${currentRoute.current}`);notify(problem,'warning');return;}
      const next = initialTarget();
      if (next.filter) setFilter(next.filter);
      // 站内跳转到页内分区时，随后触发的 hashchange 不带锚点，不能把待定位的分区冲掉。
      setTarget(prev => next.route === prev.route && !next.filter ? prev : next);
      setMenu(false);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("hashchange", hash);
    const leaving=e=>{if(pageLeaveProblem()){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',leaving);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("hashchange", hash);
      window.removeEventListener('beforeunload',leaving);
    };
  }, []);
  useEffect(() => {
    if (route !== 'notes') return;
    let active = true, pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try { const loaded = await request('/workspace'); if (active && loaded) adoptState(loaded); }
      catch (error) { if (active) notify('随手记更新暂时不可用，当前输入已保留。', 'warning'); }
      finally { pending = false; }
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [route]);
  // tone：success 成功 / info 说明 / warning 需留意 / error 失败。失败不显示对勾。
  function notify(message, tone = "success") {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setToast(null),
      tone === "error" ? 8000 : tone === "warning" ? 5500 : 4200,
    );
  }
  async function save(next, { motion = true, base = state } = {}) {
    const source = motionOrigin();
    if (saveLock.current) {
      notify("正在保存，请稍后再操作", "warning");
      return false;
    }
    saveLock.current = true;
    setSaving(true);
    try {
      const stored = await saveWorkspaceEdit(base, next, () => request('/workspace'), writeState, adoptState);
      setState(stored);
      setSaveError("");
      if (motion) flyData(source);
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
  function navigate(id, detail = {}) {
    const problem=pageLeaveProblem();if(problem){notify(problem,'warning');return false;}
    const next = {...detail, ...resolveRoute(id), agentJumpKey: crypto.randomUUID()};
    if (detail.filter && next.route === "assets") next.filter = detail.filter;
    if (next.filter) setFilter(next.filter);
    setTarget(next);
    location.hash = next.route;
    setMenu(false);
    setSelected(null);
    setScrollId(detail.scrollId || null);
    window.scrollTo({ top: 0 });
    return true;
  }
  function adoptState(next) {
    setState((previous) =>
      !previous || next.revision >= previous.revision ? next : previous,
    );
  }
  async function openSearchResult(kind, id, parentId, signal) {
    const problem=pageLeaveProblem();
    if(problem){notify(problem,'warning');return false;}
    if(kind==='collection') {
      const {notes}=await request('/collection/notes',undefined,'GET',true,{signal});
      if(signal.aborted)return false;
      if(!notes.some(n=>n.id===id&&!n.deletedAt))throw Error('这条收藏已删除或不可用，请重新搜索。');
      return navigate('learning',{collectionNoteId:id});
    }
    const latest=await request('/workspace',undefined,'GET',true,{signal});
    if(signal.aborted)return false;
    let route,detail={};
    if(kind==='scroll') {
      const scroll=(latest.scrolls||[]).find(s=>s.id===parentId&&!s.deletedAt);
      if(!scroll || (id && !scroll.entries.some(e=>e.id===id&&!e.deletedAt)))throw Error('这条焚决已删除或不可用，请重新搜索。');
      route='assets';detail={scrollId:parentId,entryId:id};
    } else if(kind==='reverse') {
      const record=(latest.reverseRecords||[]).find(r=>r.id===id&&!r.deletedAt);
      if(!record || !buildReplicaPack(record))throw Error('当前任务包已删除或变更，请重新搜索。');
      route='references';detail={reverseId:id};
    } else if(kind==='asset') {
      if(!latest.assets.some(a=>a.id===id&&!a.archived))throw Error('这项资产已删除或归档，请重新搜索。');
      route='assets';
    } else if(kind==='note') {
      if(!latest.notes.some(n=>n.id===id))throw Error('这条随手记已删除，请重新搜索。');
      route='notes';detail={noteId:id};
    } else if(kind==='reference') {
      if(!latest.references.some(r=>r.id===id))throw Error('这条参考已删除，请重新搜索。');
      route='references';detail={referenceId:id};
    } else if(kind==='project') {
      if(!latest.connections?.projects?.some(p=>p.id===id))throw Error('这个项目已不在当前目录中，请重新搜索。');
      route='projects';detail={projectId:id};
    } else return false;
    if(!navigate(route,detail))return false;
    adoptState(latest);
    if(kind==='asset')setSelected(id);
    return true;
  }
  const common = {state, save, notify, adoptState, ruleInstalls, refreshRuleInstalls,
    projectStatus:{...projectStatus,loaded:projectStatus.loaded&&projectStatus.sourceKey===activeKey}, refreshProjectStatus};
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
        {error ? <p>{error}</p> : <Reading label="正在连接本机数据"/>}
        {error && (
          <button className="button" onClick={() => location.reload()}>
            重新加载
          </button>
        )}
      </div>
    );
  const partner = partnerOf(state);
  const currentPage = PAGES.find((p) => p.id === route);
  return (
    <div className="app-shell">
      {veil && <div className="boot-veil" aria-hidden="true" />}
      <WorldDeco />
      <Motes />
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
          {PAGES.filter(p => !p.navHidden).map(({ id, label, maturity }) => {
                    const Icon = ICONS[id];
                    const count =
                      id === "assets"
                        ? state.assets.filter((a) => !a.archived).length + scrollsOf(state).filter((s) => !s.deletedAt).length
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
        <div className="save-state" role="status" aria-live="polite">
          <span className={`save-dot ${saving ? "busy" : saveError ? "error" : ""}`} aria-hidden="true" />
          <span>{saving ? "保存中…" : saveError ? "上次保存失败" : "已保存到本机"}</span>
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
            <button
              className="topbar-search"
              aria-label="搜索"
              title="搜索工作台（⌘K）"
              onClick={() => setPalette(true)}
            >
              <Search size={16} />
              <span>搜索工作台</span>
              <kbd aria-hidden="true">⌘K</kbd>
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
          className={`main-content page-${route}${["home","references","notes"].includes(route) ? " v14 v16" : " v14"}`}
          key={route}
          ref={mainRef}
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
          {route === "projects" && <Projects {...common} navigate={navigate} projectJump={target.projectId ? {id:target.projectId,key:target.agentJumpKey} : null} />}
          {route === "notes" && <NotesV16 {...common} navigate={navigate} noteJump={target.noteId ? {id:target.noteId,key:target.agentJumpKey} : null} />}
          {route === "references" && <References {...common} reverseJump={target.reverseId ? {id:target.reverseId,key:target.agentJumpKey} : null} referenceJump={target.referenceId ? {id:target.referenceId,key:target.agentJumpKey} : null} onSelect={a=>{navigate("assets");setSelected(a.id);}} />}
          {route === "settings" && <Settings {...common} navigate={navigate} onSelect={setSelected} />}
          {route === "learning" && <Collection noteJump={target.collectionNoteId ? {id:target.collectionNoteId,key:target.agentJumpKey} : null} />}
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
          entryJump={target.scrollId===scroll.id && target.entryId ? {id:target.entryId,key:target.agentJumpKey} : null}
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
          navigate={(id,detail) => {if(navigate(id,detail))setPalette(false);}}
          openResult={openSearchResult}
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

function SearchPalette({ state, onClose, navigate, openResult }) {
  const [q, setQ] = useState("");
  // 延迟值让输入保持流畅；大主库时搜索在输入之后计算。
  const query = useDeferredValue(q);
  const sources=useSearchSources(query);
  const snapshot=sources.workspace || state;
  const found = useMemo(() => searchWorkspace(snapshot, query), [snapshot, query]);
  const [opening,setOpening]=useState(false),[openError,setOpenError]=useState('');
  const openRequest=useRef(null);
  useEffect(()=>()=>openRequest.current?.abort(),[]);
  async function open(kind,id,parentId) {
    if(openRequest.current)return;
    const controller=new AbortController();openRequest.current=controller;
    setOpening(true);setOpenError('');
    const timeout=setTimeout(()=>{controller.abort();openRequest.current=null;setOpening(false);setOpenError('打开前读取超时，请重新点击结果。');},8000);
    controller.signal.addEventListener('abort',()=>clearTimeout(timeout),{once:true});
    try{if(await openResult(kind,id,parentId,controller.signal))onClose();}
    catch(error){if(!controller.signal.aborted)setOpenError(error.message);}
    finally{clearTimeout(timeout);if(!controller.signal.aborted){openRequest.current=null;setOpening(false);}}
  }
  const pages = PAGES.filter((r) =>
    terms(query).every((w) =>
      [r.label, r.title, r.eyebrow].join(" ").toLowerCase().includes(w),
    ),
  );
  const assets = found
    ? found.assets
    : snapshot.assets.filter((a) => !a.archived).map((asset) => ({ asset }));
  const groups = [
    [
      "资产",
      assets,
      ({ asset, where, snippet }) => (
        <button key={asset.id} disabled={opening} onClick={() => open("asset",asset.id)}>
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
      ({ item, snippet, where }) => (
        <button key={item.id} disabled={opening} onClick={() => open("note",item.id)}>
          <PenLine size={17} />
          <SearchHit
            title={item.title?.trim() || item.text.slice(0, 40)}
            snippet={item.title?.trim() || item.text.length > 40 ? snippet : undefined}
            where={where}
          />
          <small>{new Date(item.at).toLocaleDateString("zh-CN")}</small>
        </button>
      ),
    ],
    [
      "参考",
      found?.references || [],
      ({ item, where, snippet }) => (
        <button key={item.id} disabled={opening} onClick={() => open("reference",item.id)}>
          <ScanLine size={17} />
          <SearchHit title={item.title} snippet={snippet} where={where} />
        </button>
      ),
    ],
    [
      "项目",
      found?.projects || [],
      ({ item, where, snippet }) => (
        <button key={item.id} disabled={opening} onClick={() => open("project",item.id)}>
          <Folder size={17} />
          <SearchHit title={item.name} snippet={snippet} where={where} />
        </button>
      ),
    ],
    ['收藏', sources.collection.hits, hit=>(
      <button key={hit.id} disabled={opening} onClick={()=>open('collection',hit.id)}>
        <Folder size={17}/><SearchHit title={hit.title} snippet={hit.snippet} where={hit.where} source={hit.source+' · '+hit.groupName}/>
      </button>
    )],
    ['焚决', found?.scrolls || [], hit=>(
      <button key={hit.scrollId+':'+(hit.entryId||'')} disabled={opening} onClick={()=>open('scroll',hit.entryId,hit.scrollId)}>
        <TypeIcon type="Scroll" size={17}/><SearchHit title={entryName(hit.item)} snippet={hit.snippet} where={hit.where} source={hit.source}/>
      </button>
    )],
    ['逆向任务包', found?.reverse || [], hit=>(
      <button key={hit.item.id} disabled={opening} onClick={()=>open('reverse',hit.item.id)}>
        <ScanLine size={17}/><SearchHit title={hit.item.title} snippet={hit.snippet} where={hit.where} source={hit.source}/>
      </button>
    )],
  ];
  const empty = !pages.length && groups.every(([, items]) => !items.length);
  return (
    <Dialog title="搜索工作台" onClose={onClose}>
      <div className="command-search">
        <Search size={19} />
        <input
          autoFocus
          maxLength={300}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索资产、随手记、收藏、焚决、逆向任务包与项目…"
          aria-label="全局搜索"
        />
        <kbd>ESC</kbd>
      </div>
      <div className="search-results" aria-busy={q !== query || sources.loading || opening}>
        {pages.length > 0 && (
          <>
            <div className="nav-heading">跳转</div>
            {pages.map((p) => {
              const Icon = ICONS[p.id];
              return (
                <button key={p.id} disabled={opening} onClick={() => navigate(p.id)}>
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
                  {title} · {title==='收藏' ? sources.collection.total : items.length}
                </div>
                {items.slice(0, GROUP_LIMIT).map(render)}
                {(title==='收藏' ? sources.collection.total : items.length) > GROUP_LIMIT && (
                  <p className="search-more">
                    还有 {(title==='收藏' ? sources.collection.total : items.length) - GROUP_LIMIT} 条，补充关键词可缩小范围
                  </p>
                )}
              </React.Fragment>
            ),
        )}
        {sources.loading && <p className="search-more" role="status">正在读取本地内容…</p>}
        {sources.errors.map(message=><p className="search-more" role="alert" key={message}>{message}</p>)}
        {!!sources.errors.length && <button onClick={sources.retry} disabled={sources.loading||opening}>重新读取搜索内容</button>}
        {openError && <p className="search-more" role="alert">{openError}</p>}
        {empty && !sources.loading && !sources.errors.length && (
          <p className="search-empty" role="status">
            没有匹配“{query.trim()}”的记录。
          </p>
        )}
      </div>
      <div className="search-scope" role="note" aria-label="搜索范围">
        <div>
          <span>
            搜索本地资产当前版本、随手记、收藏、焚决、当前逆向任务包、参考和当前项目。只读已保存内容；不查历史版本、回收内容、私人会话或知识库正文。
          </span>

        </div>
      </div>
    </Dialog>
  );
}
// 命中位置放在标题列内，长文件路径可断行，不挤占标题与摘录。
function SearchHit({ title, snippet, where, source }) {
  return (
    <span className="search-hit">
      <span>{title}</span>
      {snippet && <em>{snippet}</em>}
      {source && <i className="hit-where">来源：{source}</i>}
      {where && <i className="hit-where">命中：{where}</i>}
    </span>
  );
}

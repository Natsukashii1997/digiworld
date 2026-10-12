import { motionOrigin } from './scan-motion.js';
import { flyData } from './data-flight.js';
import { Reading, ReadReveal } from './ScanMotion.jsx';
// 生活区：AI HOT（路线 v3 切片 5.3）与学习成长（切片 5.4），以及世界总览“今日热点”卡和设置里的两个面板。
// AI HOT 的内容来自 aihot.news 公开接口，服务端已按白名单清洗；这里仍只把它当文本渲染，链接只在 http/https 时生成。
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Globe,
  RefreshCw,
  ExternalLink,
  BookmarkPlus,
  Star,
  Plus,
  Trash2,
  RotateCcw,
  Archive,
  FolderOpen,
  BookOpen,
  ArrowUpRight,
  ShieldCheck,
  Hourglass,
  RadioTower,
} from "lucide-react";
import { request } from "./api.js";
import { PageChoices } from "./PageChoices.jsx";
import "./news-v14.css";
import "./aihot-v16.css";
import { useReducedMotion } from "./v14.jsx";
import { topicTag, aihotUpdateText, aihotDate } from "./aihot.js";
import { Button, Empty, PageHeading, Dialog, Scanning } from "./components.jsx";
import { httpLink } from "./learning.js";

const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";



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

async function collect(state, save, notify, item) {
  if (!httpLink(item.url)) throw new Error("这条没有有效的原文链接，不能收藏");
  const from=motionOrigin();
  const result=await request('/collection/notes/manual',{...item,origin:'aihot'});
  flyData(from);
  notify(result.created ? '已收藏到收藏画布' : '已收藏过，在收藏画布里');
  return result.notes;
}

function HotStar({ item, notes, busy, collectItem }) {
  const saved = notes.some(l => l.sourceUrl === httpLink(item.url));
  return <button className={`ah-star${saved ? " on" : ""}`} aria-label={`收藏：${item.title}`} aria-pressed={saved} disabled={!httpLink(item.url) || busy} title={!httpLink(item.url) ? "没有有效链接，不能收藏" : saved ? "已收藏" : "收藏到画布"} onClick={()=>collectItem(item)}><Star size={18} aria-hidden="true"/></button>;
}
function HotTag({ category }) {
  const tag = topicTag(category);
  return tag ? <span title={tag.label} className={`ah-tag ${tag.tone}`}>{tag.label}</span> : null;
}
function HotMeta({ item }) {
  return <footer className="mono">{item.source && <span>{item.source}</span>}{item.publishedAt && <span className="ah-meta-time">{item.source ? " · " : ""}<time dateTime={item.publishedAt}>{new Date(item.publishedAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</time></span>}</footer>;
}
function HotOpen({ item }) {
  const href = httpLink(item.url);
  return href ? <a className="ah-open" href={href} target="_blank" rel="noopener noreferrer" aria-label={`打开原文：${item.title}`} title="打开原文"/> : null;
}
export function AiHot({ state, save, notify, navigate }) {
  const { data, error, setData, reload } = useAiHot();
  const [busy,setBusy] = useState(false), [help,setHelp] = useState(false), [collecting,setCollecting] = useState(false);
  const [collectionNotes,setCollectionNotes]=useState([]);
  useEffect(()=>{let active=true;request('/collection/notes').then(result=>{if(active)setCollectionNotes(result.notes);}).catch(error=>notify(error.message||'读取收藏失败','error'));return()=>{active=false;};},[]);
  const lock = useRef(false), collectLock = useRef(false);
  const reduced = useReducedMotion();
  const [refreshed,setRefreshed] = useState(0);
  const [refreshReady,setRefreshReady] = useState(false);
  useEffect(()=>{if(reduced)setRefreshed(0);},[reduced]);
  const settings=data?.settings, cache=data?.cache, selected=cache?.sections.selected?.items.slice(0,10)||[], hot=cache?.sections.hot?.items.slice(0,10)||[];
  const first=settings?.enabled && !settings.acknowledged, canFetch=settings?.enabled, date=aihotDate(cache), hasItems=selected.length>0 || hot.length>0;
  async function refresh() {
    if(lock.current)return;
    lock.current=true;setRefreshReady(false);setBusy(true);
    try { const result=await request("/aihot/refresh",{});setData(result);setRefreshReady(result.cache?.status==="ok");if(result.cache?.status==="ok"&&!reduced)setRefreshed(n=>n+1); }
    catch(e) { notify(e.message||"拉取未完成","error"); }
    finally { lock.current=false;setBusy(false); }
  }
  async function collectItem(item) {
    if(collectLock.current)return;
    collectLock.current=true;setCollecting(true);
    try { setCollectionNotes(await collect(state,save,notify,item)); }
    catch(error) { notify(error.message||'收藏未完成','error'); }
    finally { collectLock.current=false;setCollecting(false); }
  }
  const star=item=><HotStar item={item} notes={collectionNotes} busy={collecting} collectItem={collectItem}/>;
  return <div className="aihot-v16">
    <ReadReveal pending={!data&&!error} ready={!!data&&!error}/>
    <ReadReveal pending={busy} ready={refreshReady}/>
    <PageHeading page="aihot" bounds={["aihot.news 公开接口", Number.isInteger(settings?.intervalHours) ? `每 ${settings.intervalHours} 小时更新` : "更新间隔未知"]} help={<button className="page-help" aria-label="这页怎么用" onClick={()=>setHelp(true)}>?</button>} action={<div className="ah-head-act">{canFetch && <button className="icon-button" aria-label="立即刷新" onClick={refresh} disabled={busy || first}><RefreshCw size={18}/></button>}<a className={`button${first ? " secondary" : ""}`} href="https://aihot.news/" target="_blank" rel="noopener noreferrer">去 aihot.news <ArrowUpRight size={16}/></a></div>}/>
    {error && <p role="alert" className="inline-error">读取本机缓存失败：{error} <Button secondary onClick={reload}>重新读取缓存</Button></p>}
    {!data && !error && <Scanning label="读取本机缓存"/>}
    {data && <>
      {!canFetch && <p className="ah-disabled" role="status">网络访问已关闭 <button className="text-button" onClick={()=>navigate("settings")}>去设置开启</button></p>}
      {busy && <p className="ah-busy" role="status"><Reading mini label="正在拉取公开资讯"/></p>}
      {first ? <div className="ah-screen-empty"><RadioTower size={28}/><p>第一次使用需要你确认</p><small>点“开始拉取”后才会访问 aihot.news 公开接口，之后每 {settings.intervalHours} 小时自动更新，结果缓存在本机</small><Button onClick={refresh} disabled={busy}><Globe size={16}/>开始拉取</Button></div> : hasItems ? <>
        <div className="ah-date">{refreshed>0&&<span key={refreshed} className="ah-date-scan" aria-hidden="true" onAnimationEnd={()=>setRefreshed(0)}/>}<h2>{date ? <><b className="mono">{date.month}</b>月<b className="mono">{date.day}</b>日</> : "缓存日期未知"}<span>今日精选</span></h2><span className={`ah-upd${cache.status==="failed"?" bad":""}`} role="status">{cache.status==="failed"&&<i aria-hidden="true"/>}{aihotUpdateText(cache,settings.intervalHours)}</span><button className="ah-fav" onClick={()=>navigate("learning")}><Star size={13}/>已收藏 <b className="mono">{collectionNotes.filter(note=>note.origin==='aihot').length}</b> · 去收藏看 →</button></div>
        <div className="ah-board"><div className="ah-wall" aria-label="今日精选">
          {selected.slice(0,3).map((item,i)=><article className={`ah-card ${i===0?"xl":"md"}${item.summary?"":" no-summary"}`} key={`${item.url||item.title}-${i}`}>
            {i===0&&<span className="ah-ghost mono" aria-hidden="true">01</span>}
            <HotOpen item={item}/><header><span className="ah-no mono">{String(i+1).padStart(2,"0")}</span><HotTag category={item.category}/>{star(item)}</header><h3>{item.title}</h3>{item.summary&&<p title={item.summary}>{item.summary}</p>}<HotMeta item={item}/>
          </article>)}
          {selected.length>3&&<section className="ah-more" aria-label="更多精选"><h4 className="en">MORE PICKS · 更多精选</h4><ol start={4}>{selected.slice(3).map((item,i)=><li key={`${item.url||item.title}-${i}`}><HotOpen item={item}/><span className="ah-no mono">{String(i+4).padStart(2,"0")}</span><span className="ah-more-main"><span className="ah-more-top"><HotTag category={item.category}/><b title={item.title}>{item.title}</b></span>{item.summary&&<small title={item.summary}>{item.summary}</small>}<HotMeta item={item}/></span>{star(item)}</li>)}</ol></section>}
          {!selected.length&&<p className="ah-section-empty">精选暂时没有内容</p>}
        </div><aside className="ah-hot" aria-label="热点榜"><h3 className="en-head"><span className="en">HOT</span>热点</h3><ol>{hot.map((item,i)=><li className={i<3?"top":""} key={`${item.url||item.title}-${i}`}><HotOpen item={item}/><span className="ah-rank mono">{i+1}</span><span><b title={item.title}>{item.title}</b>{item.summary&&<small title={item.summary}>{item.summary}</small>}</span></li>)}</ol>{!hot.length&&<p className="ah-section-empty">热点暂时没有内容</p>}</aside></div>
      </> : <div className="ah-screen-empty"><RadioTower size={28}/><p>{cache.status==="failed"?"更新失败，还没有缓存":cache.status==="never"?"还没拉取过":"暂时没有内容"}</p><small>{canFetch?"点右上角刷新拉取一次":"去设置开启网络访问"}</small>{cache.status==="failed"&&<small role="status">{aihotUpdateText(cache,settings.intervalHours)}</small>}</div>}
    </>}
    {help&&<Dialog title="AI HOT · 这页怎么用" onClose={()=>setHelp(false)}><p role="note" aria-label="访问说明">将访问 aihot.news 公开接口：只读取精选、热点和最新日报，默认每 {settings?.intervalHours??3} 小时一次，结果缓存在本机。返回的标题和摘要只当作文本显示，不执行其中的任何内容；仅个人非商业使用。可以在设置里关闭。</p><p>这页展示前10条精选与热点；点条目在新标签打开原文，摘要在卡片中只显示前几行。星只收藏到收藏画布；没有有效链接的条目不能打开或收藏。不读取或同步原站浏览器里的收藏。</p>{cache?.error&&<p>最近拉取错误：{cache.error}</p>}{cache&&<p>精选缓存：{when(cache.sections.selected?.fetchedAt)||"时间未知"}；热点缓存：{when(cache.sections.hot?.fetchedAt)||"时间未知"}；最近全部成功：{when(cache.lastSuccessAt)||"无"}。</p>}</Dialog>}
  </div>;
}

// 世界总览“今日热点”：优先热点，其次精选；只列有原文链接的 3–5 条；没有缓存时如实说明。
export function HomeHot({ navigate }) {
  const { data, error } = useAiHot();
  const cache = data?.cache;
  const pool = cache ? (cache.sections.hot.items.length ? cache.sections.hot.items : cache.sections.selected.items) : [];
  const items = pool.filter((i) => i.url).slice(0, 5);
  return (
    <section className="home-section home-hot" aria-labelledby="home-hot-title">
      <ReadReveal pending={!data&&!error} ready={!!data&&!error}/>
      <div className="v14-sh">
        <h2 id="home-hot-title">今日热点</h2>
        <span className="v14-sub">来自 AI HOT 的本机缓存</span>
      </div>
      {error ? (
        <p className="recent-empty">读取 AI HOT 缓存失败：{error}</p>
      ) : !data ? (
        <p className="recent-empty"><Reading label="正在读取本机缓存"/></p>
      ) : !items.length ? (
        <p className="recent-empty">
          {cache.status === "never" ? "尚未拉取。" : "缓存里暂时没有带原文链接的热点。"}
          在 AI HOT 页确认访问说明后才会访问 aihot.news。
        </p>
      ) : (
        <>
          {/* LED 跑马灯：先滚动预告，悬停暂停；只是装饰，读屏从下方卡片读取。 */}
          <div className="hot-ticker" aria-hidden="true">
            <span className="lead">LIVE</span>
            <div className="run">
              {[...items, ...items].map((item, i) => (
                <span key={i}>{item.title}</span>
              ))}
            </div>
          </div>
          <ol className="hot-card-list">
            {items.map((item, i) => (
              <li key={`${item.url}-${i}`} className="m-panel sheen" data-tilt="">
                <span className="hot-rank" aria-hidden="true">
                  #{i + 1}
                </span>
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







// 封面配色只由完整书名决定，筛选或排序不会换色。









// 设置：AI HOT 网络访问开关与拉取间隔（保存在数据目录，不进主库）。
export function AiHotSettings({ notify, onChanged }) {
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
              notify("已保存 AI HOT 设置"); flyData();
              onChanged?.();
            } catch (err) {
              notify(err.message || "保存失败", "error");
            }
          }}
        >
          <div className="settings-switch-row">
            <span>允许访问 aihot.news 公开接口</span>
            <button type="button" className="settings-switch" aria-label="允许访问 aihot.news 公开接口" aria-pressed={value.enabled} onClick={()=>setDraft({...value,enabled:!value.enabled})}>
              <span aria-hidden="true">{value.enabled ? "开" : "关"}</span>
            </button>
          </div>
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

// 设置：学习成长书架文件夹（只读索引的范围）。只能经专用接口添加或移除，服务端校验路径。


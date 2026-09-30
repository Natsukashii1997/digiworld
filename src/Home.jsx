import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Layers,
  Bot,
  Folder,
  BookOpen,
  PenLine,
  Moon,
  GitBranch,
  ScanLine,
  Settings2,
  Inbox,
  Stethoscope,
  Handshake,
  CalendarDays,
  Newspaper,
  GraduationCap,
  Gem,
  Plus,
} from "lucide-react";
import { current } from "./store.js";
import { page, LAYERS, ZONES } from "./pages.js";
import { Maturity, TypeIcon, typeLabel } from "./components.jsx";
import { pendingItems, rulePendingReady } from "./pending.js";
import { PendingList } from "./PlannedPage.jsx";
import {
  Pixel,
  DigiviceArt,
  CrestRing,
  partnerOf,
  stageOf,
  StageBar,
  glyphOf,
} from "./pixel.jsx";
import { PartnerScreen } from "./PartnerScreen.jsx";
import { HomeHot } from "./LifePages.jsx";

export const ICONS = {
  inbox: Inbox,
  assets: Layers,
  references: ScanLine,
  history: GitBranch,
  agents: Bot,
  projects: Folder,
  health: Stethoscope,
  collab: Handshake,
  calendar: CalendarDays,
  night: Moon,
  knowledge: BookOpen,
  notes: PenLine,
  aihot: Newspaper,
  learning: GraduationCap,
  silver: Gem,
  settings: Settings2,
};

// 每个页面一条真实数据，读不到就如实写“尚未扫描 / 尚未检测 / 尚未开发”。
function facts(state) {
  const c = state.connections || {};
  const live = state.assets.filter((a) => !a.archived);
  const detected = (c.agents || []).filter((a) => a.status === "detected");
  return {
    // 焚决属于资产仓库（用户 2026-09-30 纠正），在这一行注明，不单列。
    assets: `${live.length} 份资产 · 含焚决 ${(state.scrolls || []).filter((s) => !s.deletedAt).length} 卷`,
    references: `${state.references.length} 条参考`,
    history: `${state.assets.reduce((n, a) => n + a.versions.length, 0)} 个版本 · ${state.assets.filter((a) => a.archived).length} 份归档`,
    // 能力体检已并入智能体群（产品定义 v1.2 §2.2），在这一行注明，不单列。
    agents: `${c.agentScannedAt ? `已检测 ${detected.length} 个` : "尚未检测"} · 含能力体检（规划中）`,
    projects: c.projectScannedAt ? `${(c.projects || []).length} 个项目` : "尚未扫描",
    health: "尚未开发",
    collab: "尚未开发",
    calendar: "尚未开发",
    night: "计划草稿 · 未启用",
    knowledge: `${(c.knowledgeSources || []).length} 个知识源 · ${(state.knowledgeTasks || []).length} 个任务`,
    notes: `${state.notes.length} 条本机草稿`,
    aihot: "精选 · 热点 · 日报 · 本机缓存",
    learning: `${(state.learning?.books || []).length} 本已标记 · ${(state.learning?.links || []).filter((l) => !l.deletedAt).length} 条链接`,
    silver: "尚未开发",
    settings: state.model?.provider ? `意向：${state.model.provider}` : "模型未连接",
  };
}

// 夜间窗口在 24 小时刻度上的区段（可能跨过午夜），来自夜间计划草稿。
function nightSegments(night) {
  const toHour = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h + m / 60;
  };
  const start = toHour(night.time),
    end = toHour(night.end);
  return start <= end
    ? [[start, end]]
    : [
        [start, 24],
        [0, end],
      ];
}

function DayRuler({ night }) {
  return (
    <div className="day-ruler" aria-hidden="true">
      <div className="day-track">
        {nightSegments(night).map(([a, b]) => (
          <i
            key={a}
            className="day-night"
            style={{ left: `${(a / 24) * 100}%`, width: `${((b - a) / 24) * 100}%` }}
          />
        ))}
      </div>
      <div className="day-ticks">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
            {String(h).padStart(2, "0")}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Home({ state, navigate, select, openCreate, ruleInstalls, projectStatus }) {
  const partner = partnerOf(state);
  const stageScreen = useRef();
  // UI v13.2：暴龙机 A 键在数码蛋与待处理条数之间切换，B 键开关背光，C 键戳一下
  const [dvView, setDvView] = useState("egg"),
    [lit, setLit] = useState(false);
  const live = state.assets.filter((a) => !a.archived);
  const f = facts(state);
  const pending = pendingItems(state, ruleInstalls, projectStatus);
  // 显示数字时跟随待处理条数（加载完成、读取失败等来源变化都会更新）
  useEffect(() => {
    if (dvView === "number") stageScreen.current?.showNumber(pending.length);
  }, [dvView, pending.length]);
  const poke = () => {
    if (dvView !== "egg") {
      setDvView("egg");
      stageScreen.current?.showEgg();
    }
    stageScreen.current?.poke();
  };
  const recent = [...live]
    .sort((a, b) => current(b).at.localeCompare(current(a).at))
    .slice(0, 5);
  const today = new Date().toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const actions = [
    [PenLine, "记一笔", () => navigate("notes")],
    [Plus, "新建资产", () => openCreate?.("Skill")],
    [Bot, "上下文接力", () => navigate("agents")],
  ];
  return (
    <div className="home today">
      {/* 首屏：今天、快捷动作与伙伴 */}
      <section className="home-hero today-hero">
        <div className="hero-copy">
          <div className="page-eyebrow">
            <span className="page-code">00</span>
            <span>TODAY · 今日</span>
          </div>
          <h1>
            今日<em>·</em>
            <span className="today-date">{today}</span>
          </h1>
          <p className="page-lead">{page("home").lead}</p>
          <div className="hero-actions">
            {actions.map(([Icon, label, run], i) => (
              <button
                key={label}
                className={`button ${i ? "secondary" : ""}`}
                onClick={run}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
          <div className="partner-card">
            <div className="partner-head">
              <small>PARTNER · 伙伴</small>
              <strong>
                {partner.name}
                <span>{partner.stage}</span>
              </strong>
              <p>你的数码蛋 · 已收录 {partner.own} 份你自己的资产。</p>
            </div>
          </div>
        </div>
        <div className="hero-stage">
          <span className="hero-orbit a" aria-hidden="true" />
          <span className="hero-orbit b" aria-hidden="true" />
          <CrestRing />
          <div className="dv-wrap">
            <DigiviceArt size={290} className={lit ? "lit" : ""}>
              <PartnerScreen ref={stageScreen} mode="stage" />
              {dvView === "number" && (
                <span className="dv-label" aria-hidden="true">
                  待处理
                </span>
              )}
            </DigiviceArt>
            <button
              type="button"
              className="digivice-poke"
              aria-label={`戳一下${partner.name}`}
              onClick={poke}
            />
            <button
              type="button"
              className="dv-key a"
              data-key="A"
              aria-label={dvView === "egg" ? `A 键：显示待处理条数（${pending.length}）` : "A 键：切回数码蛋"}
              aria-pressed={dvView === "number"}
              onClick={() => {
                const next = dvView === "egg" ? "number" : "egg";
                setDvView(next);
                if (next === "number") stageScreen.current?.showNumber(pending.length);
                else stageScreen.current?.showEgg();
              }}
            />
            <button
              type="button"
              className="dv-key b"
              data-key="B"
              aria-label="B 键：背光"
              aria-pressed={lit}
              onClick={() => setLit(!lit)}
            />
            <button
              type="button"
              className="dv-key c"
              data-key="C"
              aria-label={`C 键：戳一下${partner.name}`}
              onClick={poke}
            />
          </div>
        </div>
      </section>

      {/* 今天：时间安排 + 待处理 */}
      <div className="home-row">
        <section className="home-section">
          <div className="section-title">
            <span className="section-index">A</span>
            <h2>时间安排</h2>
            <p>你的规划、会议、里程碑和夜间窗口</p>
          </div>
          <div className="today-schedule">
            <div className="schedule-head">
              <strong>{today}</strong>
              <Maturity level={page("calendar").maturity} />
            </div>
            <DayRuler night={state.night} />
            <p className="schedule-night">
              <Moon size={14} />
              夜间窗口 {state.night.time}–{state.night.end} · 草稿，未启用
            </p>
            <p className="schedule-note">
              日历尚未接入。接入后这里会显示你提前写下的规划块，以及会议、项目里程碑和提醒，数据来自
              macOS 日历（路线 3.2）。
            </p>
            <button className="plan-link" onClick={() => navigate("calendar")}>
              <span>查看日历规划</span>
              <ArrowUpRight size={15} />
            </button>
          </div>
        </section>
        <section className="home-section side">
          <div className="section-title">
            <span className="section-index">B</span>
            <h2>{page("inbox").label} · {pending.length}</h2>
            <p>来自本机数据的线索</p>
          </div>
          <div className="today-pending">
            {!rulePendingReady(ruleInstalls) && !ruleInstalls?.error && (
              <p className="recent-empty" role="status">
                规则装入记录还在读取，读完前不能确定待处理是否完整。
              </p>
            )}
            {pending.length ? (
              <PendingList items={pending} navigate={navigate} select={select} limit={5} />
            ) : (
              rulePendingReady(ruleInstalls) && (
                <p className="recent-empty">
                  已接入的来源里没有待处理事项。体检、夜间结果等来源尚未接入。
                </p>
              )
            )}
            <button className="plan-link" onClick={() => navigate("inbox")}>
              <span>查看全部待处理</span>
              <ArrowUpRight size={15} />
            </button>
          </div>
        </section>
      </div>

      {/* 结构：两区能力地图（工作区 / 生活区，产品定义 v1.2 §2）+ 最近迭代 */}
      <div className="home-row">
        <section className="home-section structure-map">
          <div className="section-title">
            <span className="section-index">C</span>
            <h2>能力地图</h2>
            <p>工作区：资产被目标使用，运行层让它跑起来，结果回到知识与资产。生活区：自己的日子。</p>
          </div>
          {ZONES.filter((zone) => LAYERS.some((l) => l.zone === zone.id)).map((zone) => (
            <div key={zone.id} className={`map-zone map-zone-${zone.id}`}>
              <h3 className="map-zone-title">
                {zone.label}
                <small aria-hidden="true">{zone.en}</small>
              </h3>
              <div className="layer-grid">
                {LAYERS.filter((l) => l.zone === zone.id).map((layer) => (
                  <div key={layer.id} className="layer-card">
                    <div className="layer-head">
                      <small>{layer.en}</small>
                      <strong>{layer.id}</strong>
                      <span>{layer.question}</span>
                    </div>
                    {layer.pages.map((id) => {
                      const p = page(id);
                      const Icon = ICONS[id];
                      return (
                        <button key={id} className="manage-row" onClick={() => navigate(id)}>
                          <Icon size={15} strokeWidth={1.7} />
                          <span>
                            <strong>{p.label}</strong>
                            <small>{f[id]}</small>
                          </span>
                          <Maturity level={p.maturity} />
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="system-rows">
            {["settings", "history"].map((id) => {
              const Icon = ICONS[id];
              return (
                <button key={id} className="manage-row system-row" onClick={() => navigate(id)}>
                  <Icon size={15} strokeWidth={1.7} />
                  <span>
                    <strong>{page(id).label}</strong>
                    <small>系统 · {f[id]}</small>
                  </span>
                  <Maturity level={page(id).maturity} />
                </button>
              );
            })}
          </div>
        </section>
        <section className="home-section side">
          <div className="section-title">
            <span className="section-index">D</span>
            <h2>最近迭代</h2>
            <p>按最后保存时间</p>
          </div>
          <div className="recent-list">
            {recent.map((a) => {
              const v = current(a);
              return (
                <button key={a.id} className={`recent type-${a.type}`} onClick={() => select(a.id)}>
                  <span className="recent-glyph">
                    <Pixel sprite={glyphOf(a)} size={22} />
                  </span>
                  <span className="recent-main">
                    <strong>{v.title}</strong>
                    <small>
                      <TypeIcon type={a.type} size={12} />
                      {typeLabel[a.type]} · v{a.versions.length}.0 ·{" "}
                      {new Date(v.at).toLocaleDateString("zh-CN")}
                    </small>
                  </span>
                  <StageBar stage={stageOf(a, state.assetActivity)} label={false} />
                </button>
              );
            })}
            {!recent.length && (
              <p className="recent-empty">还没有资产。去资产仓库收录第一份吧。</p>
            )}
          </div>
        </section>
      </div>

      {/* 生活区：今日热点（AI HOT 本机缓存，路线 v3 切片 5.3） */}
      <HomeHot navigate={navigate} />
    </div>
  );
}

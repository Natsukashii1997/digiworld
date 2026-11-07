// 规则页（#74）：定稿 R1「分层总表」（docs/design/cockpit/规则-三版.html）。
// 只读：数据来自 GET /api/cockpit/rules。六块各配一枚纹章（对应关系为定稿稿拟定）。
import React, { useEffect, useRef, useState } from "react";
import { PageHeading } from "./components.jsx";
import { CrestIcon } from "./pixel.jsx";
import { LcdText } from "./v14.jsx";
import { useCockpit, ReadOnlyBar, CockpitState, Pill, SourceTime, fmtTime, fmtDay } from "./cockpit-ui.jsx";
import "./cockpit.css";

const LAYERS = [
  { id: "pref", n: "个人偏好", crest: "爱心", what: "你给所有 Agent 定的做事偏好" },
  { id: "land", n: "落地对照", crest: "友情", what: "每条偏好在各 Agent 的指令里有没有写到" },
  { id: "eng", n: "工程约束", crest: "知识", what: "跨项目的坑和改动走法" },
  { id: "guard", n: "机器守护", crest: "诚实", what: "交给机器把关、不靠自觉的规则" },
  { id: "proj", n: "项目规则", crest: "希望", what: "各项目自己的 AGENTS、LESSONS 和 ADR" },
  { id: "issue", n: "问题与变更", crest: "光明", what: "已知冲突、待同步，和最近改了什么" },
];
const LAB = { y: "有", p: "部分", n: "没写", u: "未核" };
const TYPE = { product: "产品", infrastructure: "基础设施", capability: "能力" };
const n0 = (v) => (v == null ? "—" : v);

// 坑的标题只取冒号、句号前的主句，完整标题放悬停提示。
const shortTitle = (t) => t.split(/[：:。]/)[0];
const Cell = ({ v }) => <span className={`ck-cell ${v}`}>{LAB[v] || "未核"}</span>;

function SecHead({ layer, meta, extra }) {
  return (
    <div className="ck-sec-h">
      <CrestIcon name={layer.crest} size={40} />
      <div><h2>{layer.n}</h2><div className="what">{layer.what}</div></div>
      <div className="meta">
        {extra}
        <span className="ck-src"><b>来源</b> {meta.path} · <SourceTime at={meta.at} state={meta.state} /></span>
      </div>
    </div>
  );
}

function Missing({ what }) {
  return <div className="ck-panel ck-missing">未知：{what}读不到，可能不存在或不在读取白名单里。</div>;
}

function PrefTable({ prefs, reviewAt }) {
  if (!prefs) return <Missing what="Vault 偏好表" />;
  return (
    <>
      <div className="ck-tw">
        <table>
          <thead><tr><th>编号</th><th style={{ minWidth: 220 }}>偏好</th><th>Claude</th><th>Codex</th><th>Hermes 私人</th><th>Hermes 企业</th><th>说明</th></tr></thead>
          <tbody>
            {prefs.map((p) => {
              const notes = [["Claude", p.claude.note], ["Codex", p.codex.note], ["Hermes", p.hermes.note]].filter(([, n]) => n).map(([k, n]) => `${k}：${n}`).join("；");
              return (
                <tr key={p.id}>
                  <td><span className="ck-chip p" title={p.basis ? `确认依据：${p.basis.replace(/\[\[|\]\]/g, "")}` : undefined}>{p.id}</span></td>
                  <td>{p.title}</td>
                  <td><Cell v={p.claude.level} /></td><td><Cell v={p.codex.level} /></td><td><Cell v={p.hermes.level} /></td><td><Cell v={p.agumon.level} /></td>
                  <td className="ck-muted ck-small"><span className="ck-clamp" title={notes || undefined}>{p.reviewed ? notes || "—" : "审核包之后新增，未核"}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="ck-note">落地情况取自 {fmtTime(reviewAt)} 的全局规则审核包，之后的改动未重核；「有 / 部分」由人判定。Hermes 企业分身未核。偏好表受限，只显示编号和标题；确认依据在编号的悬停提示里。</div>
    </>
  );
}

function LandSummary({ prefs, layer }) {
  const reviewed = (prefs || []).filter((p) => p.reviewed);
  const count = (k) => ["y", "p", "n"].map((v) => reviewed.filter((p) => p[k].level === v).length);
  const Col = ({ name, k, sync, level, pill }) => {
    const [y, p, n] = count(k);
    return (
      <div className="ck-guard">
        <b>{name}</b>
        <div className="who"><Cell v="y" /> <span className="ck-num">{y}</span>　<Cell v="p" /> <span className="ck-num">{p}</span>　<Cell v="n" /> <span className="ck-num">{n}</span></div>
        <p>{sync}</p>
        <Pill level={level}>{pill}</Pill>
      </div>
    );
  };
  const { claude, codex } = layer.sync;
  return (
    <div className="ck-grid3">
      <Col name="Claude · CLAUDE.md" k="claude" sync="仓库版 + 个人段拼装" level={claude.level} pill={claude.text} />
      <Col name="Codex · AGENTS.md" k="codex" sync="仓库版 + 个人段拼装" level={codex.level} pill={codex.text} />
      <Col name="Hermes 私人 · SOUL + 记忆" k="hermes" sync={`记忆更新于 ${fmtTime(layer.hermesMemoryAt)}`} level="unk" pill="没有仓库版" />
    </div>
  );
}

function LessonsTable({ lessons, layer }) {
  if (!lessons) return <Missing what="agent-kit LESSONS.md" />;
  const max = Math.max(1, ...lessons.map((g) => g.hits || 0));
  return (
    <>
      <div className="ck-tw">
        <table>
          <thead><tr><th>编号</th><th>坑</th><th>提升</th><th style={{ minWidth: 200 }}>提醒命中（{layer.hitsSince ? `${fmtDay(layer.hitsSince)} 起` : "未知"}）</th></tr></thead>
          <tbody>
            {lessons.map((g) => (
              <tr key={g.id}>
                <td><span className="ck-chip g">{g.id}</span></td>
                <td title={g.title}>{shortTitle(g.title)}{g.must && <> <span className="ck-chip must">每次都要守</span></>}</td>
                <td className="ck-mono ck-muted ck-small ck-nowrap" title={g.kind ? `${g.date} ${g.kind}` : undefined}>{g.date ? g.date.slice(5) : "未知"}</td>
                <td>
                  {g.hits == null ? <span className="ck-muted">未知</span> : (
                    <div className={`ck-hit${g.hits > 300 ? " hot" : ""}`}>
                      <div className="b"><i style={{ width: `${Math.max(g.hits ? 2 : 0, Math.round((g.hits / max) * 100))}%` }} /></div>
                      <span>{g.hits.toLocaleString("en-US")}</span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ck-note">命中＝命令里出现了这条坑的触发词，不等于真犯了。另有《工程流程》：issue → 分支 → PR → 合并，更新于 {fmtTime(layer.flowAt)}。</div>
    </>
  );
}

function Guards({ guards, doctor, layer }) {
  const checks = doctor ? doctor.items.filter((i) => i.mark !== "info") : [];
  const bad = checks.filter((i) => i.mark !== "ok");
  return (
    <>
      <div className="ck-grid3">
        {guards.map((g) => (
          <div className="ck-guard" key={g.id}>
            <b>{g.title}</b>
            <p>{g.what}</p>
            <div className="who">{g.who.map((w) => <span key={w} className="ck-chip">{w}</span>)}<span className="ck-chip g">守 {g.keeps}</span></div>
            <span className={`ck-src${g.level === "warn" ? " warn" : ""}`}>{g.evidence}</span>
          </div>
        ))}
      </div>
      <div className="ck-panel ck-doctor">
        <span className="ck-lbl">最近一次自检 <SourceTime at={layer.at} state={layer.state} /></span>
        {doctor ? (
          <>
            <Pill level={doctor.fail ? "warn" : doctor.warn ? "warn" : "ok"}>{doctor.ok} 项通过 · {doctor.warn} 警告 · {doctor.fail} 失败</Pill>
            <span className="ck-note">{bad.length ? `要看：${bad.map((i) => i.title).join("；")}` : "检查项全部通过"}</span>
          </>
        ) : <span className="ck-note">未知：没有找到自检报告</span>}
      </div>
    </>
  );
}

function ProjectsTable({ projects, memory }) {
  if (!projects) return <Missing what="项目名册 projects.json" />;
  const lines = (v, p) => (!p.readable ? <span className="ck-warn">不在工作目录</span> : v == null ? "—" : `${v} 行`);
  return (
    <>
      <div className="ck-tw">
        <table>
          <thead><tr><th>项目</th><th>类型</th><th>AGENTS.md</th><th>CLAUDE.md</th><th>LESSONS 条目</th><th>ADR</th></tr></thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td className="ck-muted">{TYPE[p.type] || p.type || "未知"}</td>
                <td className="ck-mono ck-num">{p.readable && p.agents == null ? <span className="ck-warn">未找到</span> : lines(p.agents, p)}</td>
                <td className="ck-mono ck-muted">{p.readable ? (p.claude == null ? "—" : `${p.claude} 行`) : "—"}</td>
                <td className="ck-mono ck-num">{n0(p.lessons)}</td>
                <td className="ck-mono ck-num">{n0(p.adr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ck-note">LESSONS 按「L 编号」标题计数，写法不同的项目可能少算。Claude 项目记忆：{memory ? `${memory.count} 条（${memory.location}）` : "未知"}。</div>
    </>
  );
}

// 定稿只列冲突和真源两组；其余几组（重复、表达、机制化候选）只给条数。
function Issues({ issues, changes }) {
  const shown = (issues || []).filter((i) => ["冲突", "真源"].includes(i.group));
  const rest = Object.entries((issues || []).filter((i) => !shown.includes(i)).reduce((m, i) => ({ ...m, [i.group]: (m[i.group] || 0) + 1 }), {}));
  return (
    <div className="ck-grid2">
      <div className="ck-panel">
        {rest.length > 0 && <div className="ck-issue-rest">审核包另有 {rest.map(([g, n]) => `${g} ${n} 条`).join("、")}，没有列出。</div>}
        {issues ? shown.map((i) => (
          <div key={i.id} className={`ck-issue ${i.group === "冲突" ? "st-bad" : "st-warn"}`}>
            <span className="k">{i.id}</span>
            <div><b>{i.title} <span className="ck-chip" style={{ marginLeft: 6 }}>{i.group}</span></b>{i.detail && <p className="ck-clamp" title={i.detail}>{i.detail}</p>}</div>
          </div>
        )) : <div className="ck-missing">未知：审核包读不到</div>}
      </div>
      <div className="ck-panel">
        {changes ? (
          <ul className="ck-tl">
            {changes.map((c, k) => (
              <li key={k}><span className="d">{c.date.slice(5)}</span><i /><div>{c.subject}<span className="s">{c.ref}</span></div></li>
            ))}
          </ul>
        ) : <div className="ck-missing">未知：agent-kit 提交记录读不到</div>}
      </div>
    </div>
  );
}

export function RulesPage() {
  const { data, error, busy, reload } = useCockpit("/cockpit/rules");
  const [on, setOn] = useState("pref");
  const bodyRef = useRef(null);
  // 目录高亮跟随滚动：哪一块的标题最近越过顶部就亮哪一块。
  useEffect(() => {
    if (!data) return undefined;
    const sections = [...(bodyRef.current?.querySelectorAll("section[data-layer]") || [])];
    const io = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (seen[0]) setOn(seen[0].target.dataset.layer);
    }, { rootMargin: "-80px 0px -60% 0px" });
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [data]);
  const L = data?.layers;
  const prefs = data?.prefs || [];
  const allThree = prefs.filter((p) => ["claude", "codex", "hermes"].every((k) => p[k].level === "y")).length;
  const checks = data?.doctor ? data.doctor.items.filter((i) => i.mark !== "info").length : 0;
  const conflicts = (data?.issues || []).filter((i) => i.group === "冲突").length;
  const truth = (data?.issues || []).filter((i) => i.group === "真源").length;
  const counts = L && {
    pref: L.pref.count == null ? "未知" : `${L.pref.count} 条`,
    land: "4 处",
    eng: L.eng.count == null ? "未知" : `${L.eng.count} 条`,
    guard: data.doctor ? `${data.doctor.ok}/${checks} 通过` : "未知",
    proj: L.proj.count == null ? "未知" : `${L.proj.count} 个`,
    issue: L.issue.count == null ? "未知" : `${L.issue.count} 冲突`,
  };
  const jump = (id) => (e) => {
    e.preventDefault();
    setOn(id);
    bodyRef.current?.querySelector(`#ck-s-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  return (
    <div className="cockpit ck-rules">
      <PageHeading page="rules" action={<ReadOnlyBar readAt={data?.readAt} busy={busy} onRefresh={reload} />} />
      <CockpitState data={data} error={error} reload={reload} label="规则" />
      {data && (
        <div className="ck-r1">
          <nav className="ck-toc1" aria-label="本页目录">
            {LAYERS.map((l) => (
              <a key={l.id} href={`#ck-s-${l.id}`} className={on === l.id ? "on" : ""} aria-current={on === l.id ? "true" : undefined} onClick={jump(l.id)}>
                <CrestIcon name={l.crest} size={22} /><span>{l.n}</span><small>{counts[l.id]}</small>
              </a>
            ))}
          </nav>
          <div className="ck-r1-body" ref={bodyRef}>
            <div className="ck-strip">
              <div><span className="ck-lbl">个人偏好</span><div className="v"><LcdText text={n0(L.pref.count)} px={3} /><small>条</small></div><p>Vault {fmtTime(L.pref.at)} 更新</p></div>
              <div><span className="ck-lbl">三个 Agent 都写到</span><div className="v" style={{ color: "var(--yellow)" }}><LcdText text={allThree} px={3} /><small>/ {prefs.length}</small></div><p>按审核包快照统计，Hermes 企业分身未核</p></div>
              <div><span className="ck-lbl">全局坑</span><div className="v"><LcdText text={n0(L.eng.count)} px={3} /><small>条</small></div><p>{(data.lessons || []).filter((g) => g.must).length} 条每次都要守</p></div>
              <div><span className="ck-lbl">机器自检</span><div className="v" style={{ color: data.doctor && !data.doctor.warn && !data.doctor.fail ? "var(--lcd)" : "var(--yellow)" }}><LcdText text={data.doctor ? data.doctor.ok : "-"} px={3} /><small>/ {checks} 通过</small></div><p><SourceTime at={L.guard.at} state={L.guard.state} /></p></div>
              <div><span className="ck-lbl">已知冲突</span><div className="v" style={{ color: "var(--red)" }}><LcdText text={conflicts} px={3} /><small>处</small></div><p>另有 {truth} 处真源不清</p></div>
            </div>
            <section className="ck-sec" id="ck-s-pref" data-layer="pref">
              <SecHead layer={LAYERS[0]} meta={L.pref} extra={<span className="ck-chip">受限：只显示编号和标题</span>} />
              <PrefTable prefs={data.prefs} reviewAt={L.land.at} />
            </section>
            <section className="ck-sec" id="ck-s-land" data-layer="land">
              <SecHead layer={LAYERS[1]} meta={L.land} />
              <LandSummary prefs={data.prefs} layer={L.land} />
            </section>
            <section className="ck-sec" id="ck-s-eng" data-layer="eng">
              <SecHead layer={LAYERS[2]} meta={L.eng} />
              <LessonsTable lessons={data.lessons} layer={L.eng} />
            </section>
            <section className="ck-sec" id="ck-s-guard" data-layer="guard">
              <SecHead layer={LAYERS[3]} meta={L.guard} />
              <Guards guards={data.guards} doctor={data.doctor} layer={L.guard} />
            </section>
            <section className="ck-sec" id="ck-s-proj" data-layer="proj">
              <SecHead layer={LAYERS[4]} meta={L.proj} />
              <ProjectsTable projects={data.projects} memory={data.memory} />
            </section>
            <section className="ck-sec" id="ck-s-issue" data-layer="issue">
              <SecHead layer={LAYERS[5]} meta={L.issue} />
              <Issues issues={data.issues} changes={data.changes} />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

// 逆向工程 v5 · 页面 v6-C「工作流总控」（#53）：顶部六步轨道看每步停了几件，左边按步骤排的清单，右边一件的拆解档案。
// 工作台只发话术、收回执、存档；取证在外部 Agent 里做。依据 docs/design/ui-v19/briefs/05-reverse-v5-工作流与清单.md 与样稿 逆向-v6-C-工作流总控.html。
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Copy, ClipboardPaste, Pause, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button, Dialog } from "./components.jsx";
import { request } from "./api.js";
import { flyData } from "./data-flight.js";
import { LcdText } from "./v14.jsx";
import { ReverseInput } from "./ReverseInput.jsx";
import { deleteRecord, restoreRecord } from "./reverse.js";
import { SLOTS, slotState, hatchOf, wantOf, targetOf, appendHatchRound, packHashOf, legacyRounds } from "./reverse-hatch.js";
import { stageOf, buildStartPack, buildAskPack, buildReplicaPack, buildSkillPack, adoptReport, adoptReplica, skillUsage, REPLICA_RESULTS } from "./reverse-flow.js";
import "./reverse-v4.css"; // ReverseInput 的样式
import "./reverse-flow.css";

const pad2 = (n) => String(n).padStart(2, "0");
const md = (iso) => (iso ? `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}` : "");
const hm = (iso) => (iso ? new Date(iso).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const WHO = { codex: "Codex", claude: "Claude Code", rea: "REA" };
const STATUS = { done: "完成", partial: "部分", blocked: "阻断", failed: "失败", sent: "在问", back: "已交回" };
const KIND = { web: "网站", electron: "桌面应用", local: "本机文件", TXT: "文字", IMG: "图片", WEB: "网页", FN: "功能" };
const kindOf = (r) => KIND[r.material?.target?.kind] || KIND[r.type] || "文字";
// 六步：⏸ 是 Agent 必须停下交东西、等你回一句话的地方。
const STEPS = [["确认", false], ["拆前计划", true], ["取证", false], ["交回执", true], ["复刻验证", true], ["写 Skill", true]];
const TONE = { planned: "m", sent: "c", review: "y", replica: "c", harvested: "g", held: "r" };
const ORDER = ["review", "replica", "sent", "planned", "harvested", "held"];
const PACKS = {
  start: ["开场话术", buildStartPack],
  ask: ["追问下一轮", (r) => buildAskPack(r, { asked: askIds(r) })],
  replica: ["开始复刻", buildReplicaPack],
  skill: ["写 Skill", buildSkillPack],
};
// 交回的东西分三种（#55）：拆解回执、复刻对照、Skill 草稿。拼在中文后面（「第 3 轮」「粘贴」），英文开头的前面留一个空格。
const BACK = { report: "回执", replica: "复刻对照", skill: " Skill 草稿" };
const askIds = (r) => SLOTS.filter((s) => slotState(hatchOf(r).slots[s.id]) !== "full").map((s) => s.id);

// 停在轨道哪一步：-1 未派出，6 已收成；搁置落在第 0 步并标红。
function railAt(record, st) {
  const last = hatchOf(record).rounds.at(-1);
  if (st.stage === "planned") return -1;
  if (st.stage === "held") return 0;
  if (st.stage === "harvested") return 6;
  if (st.stage === "review") return 3;
  if (st.stage === "replica") return last?.kind === "skill" || st.next === "skill" ? 5 : 4;
  return st.next === "wait" ? 2 : 3;
}
// 旧流程推出的轮次在前（标「旧」），新轮次用自己的序号，和话术里的「轮次」、回执的 round 一致。
function allRounds(record) {
  return [...legacyRounds(record).map((x) => ({ ...x, legacy: true })), ...hatchOf(record).rounds.map((x) => ({ ...x, legacy: false }))];
}

function Lcd({ value, tone = "", px = 3 }) {
  return <span className={`lcd ${tone}`}><LcdText text={value} px={px} label={String(value)} /></span>;
}
const Tag = ({ st }) => <span className={`tg ${TONE[st.stage]}`}>{st.label}</span>;

function Rail({ counts }) {
  return (
    <ol className="rail">
      {STEPS.map(([name, pause], i) => (
        <li key={name} className="st">
          <span className="dot" aria-hidden="true">{i}</span><b>{name}</b>
          <em className={pause ? "p" : ""}>{pause ? "⏸ 停下等你" : "Agent 自己做"}</em>
          <span className="n" aria-label={`${counts[i]} 件`}><Lcd value={pad2(counts[i])} tone={counts[i] ? "o" : "m"} /></span>
        </li>
      ))}
    </ol>
  );
}

function Item({ record, st, on, onPick, asset }) {
  const at = railAt(record, st), rounds = hatchOf(record).rounds;
  const line = st.stage === "harvested" ? `◆ ${asset ? `${asset.versions.at(-1).title} v${asset.versions.length}` : "Skill 已存"}`
    : st.stage === "review" ? `过目第 ${rounds.at(-1)?.n || 1} 轮回执`
    : st.stage === "held" ? "已搁置" : st.stage === "replica" && st.next === "wait" ? "等复刻对照交回" : st.next === "wait" ? "等回执" : st.nextLabel;
  return (
    <li className={`li6${on ? " on" : ""}`}>
      <button type="button" aria-current={on ? "true" : undefined} onClick={onPick}>
        <span className="nob"><Lcd value={pad2(record.no)} tone={on ? "o" : "m"} px={2} /></span>
        <b><span className="nm">{record.title}</span><Tag st={st} /></b>
        <small>{line}</small>
        <span className="tr" aria-hidden="true">{STEPS.map((_, i) => <i key={i} className={st.stage === "held" && i === 0 ? "x" : i < at ? "d" : i === at ? "c" : ""} />)}</span>
      </button>
    </li>
  );
}

function Stats({ record, rounds }) {
  const hatch = hatchOf(record), report = hatch.report, replica = hatch.replica, last = hatch.rounds.at(-1);
  const ev = report?.evidence || [], gaps = askIds(record).length;
  const ok = replica ? replica.rows.filter((x) => x.result === "ok").length : 0;
  return (
    <div className="stats">
      <div><span>轮次</span><Lcd value={pad2(hatch.rounds.length)} tone="c" px={4} /><small>{last ? `最近 ${md(last.at)} · ${WHO[last.by] || last.by}` : rounds.length ? `另有旧流程 ${rounds.length} 轮` : "还没派出"}</small></div>
      <div><span>能力</span><Lcd value={pad2(report?.caps.length || 0)} px={4} /><small>{report ? `第 ${report.round} 轮回执` : "交回后才有"}</small></div>
      <div><span>证据</span><Lcd value={pad2(ev.length)} tone="c" px={4} /><small>{ev.length ? (ev.length > 1 ? `${ev[0].id}–${ev.at(-1).id}` : ev[0].id) : "—"}</small></div>
      <div><span>缺口</span><Lcd value={pad2(gaps)} tone="y" px={4} /><small className="y">{gaps ? "下一轮可以问" : "八格都填上了"}</small></div>
      <div><span>复刻</span><Lcd value={replica ? `${ok}/${replica.rows.length}` : "-"} tone="m" px={4} /><small>{replica ? `${md(replica.at)} · ${replica.where || "Sandbox"}` : "回执过目后派"}</small></div>
    </div>
  );
}

function Caps({ report }) {
  if (!report?.caps.length) return null;
  const known = report.caps.filter((c) => c.known).length, miss = report.caps.filter((c) => c.miss).length;
  return (
    <section aria-labelledby="rf-caps">
      <h3 className="sub3" id="rf-caps">能力清单<small>{report.caps.length} 项 · 已知 {known} · 缺 {miss}</small></h3>
      <ol className="caps">{report.caps.map((c, i) => (
        <li key={i}><span className="i">{pad2(i + 1)}</span><b>{c.name}</b>
          {c.known && <p><span className="k1">已知</span><span>{c.known} {c.ev.map((e) => <span key={e} className="ev">{e}</span>)}</span></p>}
          {c.miss && <p className="ms"><span className="k1">缺</span>{c.miss}</p>}
        </li>))}
      </ol>
    </section>
  );
}

function Slots({ hatch }) {
  const states = SLOTS.map((s) => slotState(hatch.slots[s.id]));
  return (
    <section aria-labelledby="rf-slots">
      <h3 className="sub3" id="rf-slots">八格<small>已知 {states.filter((x) => x === "full").length} · 缺 {states.filter((x) => x !== "full").length}</small></h3>
      <div className="slots">{SLOTS.map((s, i) => { const v = hatch.slots[s.id] || {}, c = { full: "f", half: "h", empty: "e" }[states[i]];
        return <div key={s.id} className={c}><b>{s.name}<i>{{ f: "已知", h: "半格", e: "空" }[c]}</i></b>{v.known && <span>{v.known}</span>}{v.miss && <em>缺：{v.miss}</em>}</div>; })}
      </div>
    </section>
  );
}

function Evidence({ report }) {
  if (!report?.evidence.length) return null;
  return (
    <section aria-labelledby="rf-ev">
      <h3 className="sub3" id="rf-ev">证据<small>{report.evidence.length} 条</small></h3>
      <ul className="evl">{report.evidence.map((e) => <li key={e.id}><b>{e.id}</b>{e.where}</li>)}</ul>
    </section>
  );
}

// 历次：每轮派出的是哪种话术、交回的回执原文；旧流程的结论和取证收在这里，只读，不迁移。
function History({ record, rounds, reports }) {
  const versions = record.packVersions || [], v = versions.find((x) => x.id === record.activePackVersionId) || versions.at(-1), result = v?.result;
  const loose = record.hatch?.unplaced, runs = record.reaRuns || [];
  const old = { ...(record.recipe ? { 配方: record.recipe } : {}), ...(record.replicas?.length ? { 复刻与评分: record.replicas } : {}), ...(record.pack ? { 旧任务包: record.pack } : {}), ...(record.reply ? { 旧回复: record.reply } : {}) };
  const KINDS = { start: "开场", ask: "追问", replica: "复刻", skill: "写 Skill" };
  if (!rounds.length && !result && !loose && !Object.keys(old).length) return null;
  return (
    <section aria-labelledby="rf-hist">
      <h3 className="sub3" id="rf-hist">历次<small>{rounds.filter((x) => !x.legacy).length} 轮{rounds.some((x) => x.legacy) ? ` · 旧流程 ${rounds.filter((x) => x.legacy).length} 轮` : ""}</small></h3>
      <ul className="hist">{rounds.map((x) => {
        const back = x.legacy ? [] : reports.filter((r) => r.recordId === record.id && r.round === x.n);
        return (
          <li key={(x.legacy ? "旧" : "") + x.n}>
            <span className={`tg ${x.status === "back" || x.status === "done" ? "g" : x.status === "sent" ? "c" : x.status === "partial" ? "y" : "r"}`}>{STATUS[x.status] || x.status}</span>
            <span>{x.legacy ? "旧 · " : ""}第 {x.n} 轮 · {md(x.at)} · {WHO[x.by] || x.by}{x.kind ? ` · ${KINDS[x.kind]}` : ""}{x.error ? ` · ${x.error}` : ""}</span>
            {back.map((r) => <details key={r.id}><summary>{(BACK[r.kind] || "回执").trim()} · {r.status === "adopted" ? "已采纳" : r.status === "rejected" ? "已退回" : "待过目"}</summary><pre>{r.text}</pre></details>)}
          </li>);
      })}</ul>
      {result && <details className="rf-more"><summary>旧结论 · 未分格{v && ` · ${md(v.at)} · ${WHO[v.executor] || v.executor}`}</summary>
        {result.conclusions.length ? <ul>{result.conclusions.map((c, i) => <li key={i}><b>{c.mark}</b> {c.text}</li>)}</ul> : <p>这一轮没有形成有证据的结论。</p>}
        {!!result.unknowns.length && <><h4>未知</h4><ul>{result.unknowns.map((u) => <li key={u.id}>{u.text}</li>)}</ul></>}
      </details>}
      {loose && <details className="rf-more"><summary>最近一次放回 · {md(loose.at)} · 分不进格的 {loose.items.length} 段</summary>{loose.items.map((u, i) => <details key={i}><summary>{u.label}</summary><pre>{u.text}</pre></details>)}</details>}
      {(versions.length > 0 || runs.length > 0 || Object.keys(old).length > 0) && <details className="rf-more"><summary>历史取证（只读）</summary>
        {versions.map((x) => <details key={x.id}><summary>任务包 · {md(x.at)} · {WHO[x.executor] || x.executor}</summary><pre>{x.result.pack}</pre></details>)}
        {runs.filter((r) => r.summary?.evidenceId).map((r) => <p key={r.id}>证据 <code>{r.summary.evidenceId}</code></p>)}
        {!!Object.keys(old).length && <pre>{JSON.stringify(old, null, 2)}</pre>}
      </details>}
    </section>
  );
}

function OriginalImage({ media, index }) {
  const [url, setUrl] = useState(""), [error, setError] = useState("");
  useEffect(() => { let live = true, objectUrl; request("/reverse/media/read", media).then((r) => { objectUrl = URL.createObjectURL(new Blob([r.data], { type: r.type })); if (live) setUrl(objectUrl); else URL.revokeObjectURL(objectUrl); }).catch((e) => live && setError(e.message)); return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [media.path]);
  return error ? <p role="alert">截图 {index + 1} 读不到：{error}</p> : url ? <img src={url} alt={`参照截图 ${index + 1}`} /> : <p>读取截图 {index + 1}…</p>;
}
// 作品类参照物的原件：截图、正文、来源链接，只读。
function Original({ record }) {
  const media = record.referenceMedia || [];
  if (record.material?.target || (!media.length && !record.material?.text && !record.material?.url)) return null;
  return (
    <details className="rf-more">
      <summary>原件（只读）</summary>
      {!!media.length && <div className="rf-shots">{media.map((m, i) => <OriginalImage key={m.path} media={m} index={i} />)}</div>}
      {record.material.text && <pre>{record.material.text}</pre>}
      {record.material.url && <p><a href={record.material.url} target="_blank" rel="noreferrer">打开来源</a></p>}
    </details>
  );
}

// 产出：已存的 Skill（第 4 批接上「存 Skill」）。旧流程固定的 Skill 也列在这里。
// 产出：每份 Skill 只列最新一版。给谁用取写 Skill 那一轮复制给了谁；口令按 Agent 的调用方式，复制前要先导出装进那个 Agent。
const skillNameOf = (content) => content?.match(/^---\n[\s\S]*?^name:\s*["']?([a-z0-9-]{1,64})["']?\s*$/m)?.[1] || "";
function Output({ record, assets, onOpen, onCopy }) {
  const latest = new Map();
  for (const p of [...(record.hatchSkills || []), ...(record.savedSkill ? [record.savedSkill] : []), ...(record.packSkills || [])]) latest.set(p.assetId, p);
  const skills = [...latest.values()].map((p) => ({ p, asset: assets.find((a) => a.id === p.assetId && !a.archived) })).filter((x) => x.asset);
  return (
    <section aria-labelledby="rf-out">
      <h3 className="sub3" id="rf-out">产出<small>Skill</small></h3>
      {skills.length ? <ul className="outl">{skills.map(({ p, asset }) => {
        const v = asset.versions.at(-1), name = skillNameOf(v.content), by = hatchOf(record).rounds.find((x) => x.n === p.round)?.by;
        const uses = by ? [[by, skillUsage(name, by)]] : name ? [["claude", skillUsage(name, "claude")], ["codex", skillUsage(name, "codex")]] : [];
        return <li key={p.assetId}><span className="eg" aria-hidden="true">◆</span>
          <div><b>{v.title}</b><small>{name ? `${name} · ` : ""}v{asset.versions.length} · {md(p.at)} 存进资产仓库{by ? ` · 给 ${WHO[by]} 用` : ""}</small>
            {uses.map(([who, cmd]) => <p className="use" key={who}><code>{cmd}</code><button type="button" className="btn6 sm" onClick={() => onCopy(cmd, who)}><Copy size={14} aria-hidden="true" />复制口令</button></p>)}
            {!!uses.length && <small>先在资产页导出，装进 {by ? WHO[by] : "要用的 Agent"} 的 skills 目录，再用这句口令调用。</small>}</div>
          <button type="button" className="btn6 sm" onClick={() => onOpen(asset)}>打开</button></li>;
      })}</ul>
        : <div className="outc"><span className="eg" aria-hidden="true">◇</span><div>还没有 Skill。复刻对上之后写，写好交回这里存进资产仓库。</div></div>}
    </section>
  );
}

// 话术：先看全文，再选交给谁。复制后记一轮（kind 区分开场 / 追问 / 复刻 / 写 Skill）。
function PackDialog({ record, kind, busy, error, onCopy, onClose }) {
  const [name, build] = PACKS[kind], text = useMemo(() => build(record), [record, kind]);
  return (
    <Dialog title={`${record.title} · ${name}`} drawer recoverFocus onClose={() => !busy && onClose()}>
      <p>复制后到 Agent 里粘贴，只复制，不自动发送。⏸ 处 Agent 会停下等你回话。</p>
      <pre className="rf-pack" data-testid="flow-pack">{text}</pre>
      <div className="rf-acts">
        <Button disabled={busy} onClick={() => onCopy("codex", text)}><Copy size={16} />复制给 Codex</Button>
        <Button disabled={busy} onClick={() => onCopy("claude", text)}><Copy size={16} />复制给 Claude Code</Button>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </Dialog>
  );
}

// 预览里看什么：一句话结论、能力和证据条数、会变的格子、你改过不覆盖的、分不进格的。
function AdoptPreview({ preview }) {
  const name = (id) => SLOTS.find((s) => s.id === id)?.name || id;
  return (
    <div className="rf-preview" aria-live="polite">
      <p><b>结论：</b>{preview.report.verdict || "（回执里没写一句话结论）"}</p>
      <p>能力 {preview.report.caps.length} 项 · 证据 {preview.report.evidence.length} 条 · 下一轮建议问 {preview.report.nextAsk.length} 条</p>
      <h3>会变的格子（{preview.changes.length}）</h3>
      {preview.changes.length ? <ul>{preview.changes.map((c) => <li key={c.id}><b>{name(c.id)}</b>{c.to.known && <p>已知：{c.to.known}</p>}{c.to.miss && <p>缺：{c.to.miss}</p>}</li>)}</ul> : <p>没有格子会变。</p>}
      {!!preview.kept.length && <p>你改过、这次不覆盖：{preview.kept.map((k) => name(k.id)).join("、")}</p>}
      {!!preview.unplaced.length && <><h3>分不进格（原样留存）</h3>{preview.unplaced.map((u, i) => <details key={i}><summary>{u.label}</summary><pre>{u.text}</pre></details>)}</>}
      {!!preview.redactions && <p>已隐去 {preview.redactions} 处疑似凭据。</p>}
      {preview.latest === false && <p>这是旧轮次的回执：八格照常写入，「结论 / 能力清单」保留更新那一轮的。</p>}
    </div>
  );
}

// 复刻对照的预览：位置、逐项结果、认不出的行。
function ReplicaPreview({ preview }) {
  return (
    <div className="rf-preview" aria-live="polite">
      <p><b>复刻位置：</b>{preview.replica.where || "（没写）"}</p>
      <h3>对照（{preview.replica.rows.length} 项）</h3>
      <ul>{preview.replica.rows.map((x, i) => <li key={i}><b>{REPLICA_RESULTS[x.result]}</b> · {x.name}{x.note && <p>{x.note}</p>}</li>)}</ul>
      {!!preview.unplaced.length && <><h3>认不出的行（不写进档案）</h3>{preview.unplaced.map((u, i) => <details key={i}><summary>{u.label}</summary><pre>{u.text}</pre></details>)}</>}
      {!!preview.redactions && <p>已隐去 {preview.redactions} 处疑似凭据。</p>}
      {preview.latest === false && <p>这是旧轮次的对照：这一轮记为已交回，档案里保留更新那一轮的对照。</p>}
    </div>
  );
}

// Skill 草稿的预览：名字可改（改了要重新预览），SKILL.md 全文，存成新 Skill 还是加一版，给谁用、口令。
function SkillPreview({ preview, busy, onRename }) {
  const s = preview.skill, [name, setName] = useState(s.name || s.suggested || "");
  useEffect(() => setName(s.name || s.suggested || ""), [preview.previewId]);
  const stale = name.trim() !== s.name;
  return (
    <div className="rf-preview" aria-live="polite">
      <form className="rf-name" onSubmit={(e) => { e.preventDefault(); if (stale && name.trim()) onRename(name.trim()); }}>
        <label className="rf-field">Skill 名字（小写字母、数字、连字符；Agent 按它调用）<input value={name} maxLength={64} disabled={busy} onChange={(e) => setName(e.target.value)} /></label>
        {stale && <Button type="submit" secondary disabled={busy || !name.trim()}>用这个名字预览</Button>}
      </form>
      {!s.name && <p>草稿里的 name 认不出，先填名字再预览。</p>}
      <p>{s.versionNo > 1 ? `存成「${s.assetTitle}」的第 ${s.versionNo} 版` : `存成一份新 Skill「${s.title || s.name}」`}{s.by ? ` · 给 ${WHO[s.by]} 用` : ""}{s.name ? ` · 口令 ${skillUsage(s.name, s.by)}` : ""}</p>
      <h3>SKILL.md 全文</h3>
      <pre data-testid="skill-draft">{s.content}</pre>
      {!!s.files.length && <p>附件：{s.files.filter((f) => f.path !== "SKILL.md").map((f) => f.path).join("、")}（下一轮追问包、八格原样）</p>}
      {!!preview.redactions && <p>已隐去 {preview.redactions} 处疑似凭据。</p>}
    </div>
  );
}

// 待过目：AI 用 reverse_report 交回（或手动粘贴）的回执、复刻对照、Skill 草稿，预览后采纳或退回。
function ReviewDialog({ report, preview, busy, error, onAdopt, onReject, onRename, onClose }) {
  const label = BACK[report.kind] || "回执", skill = report.kind === "skill";
  return (
    <Dialog title={`过目第 ${report.round} 轮${label}`} drawer recoverFocus onClose={() => !busy && onClose()}>
      <p>{report.proposer || "AI"} · {hm(report.createdAt)} · {skill ? "存之前先预览，存进资产仓库后回读。" : "采纳前先预览，采纳后写进档案并回读。"}</p>
      {!preview ? <p>读取预览…</p> : skill ? <SkillPreview preview={preview} busy={busy} onRename={onRename} /> : report.kind === "replica" ? <ReplicaPreview preview={preview} /> : <AdoptPreview preview={preview} />}
      <details className="rf-more"><summary>{label}原文</summary><pre>{report.text}</pre></details>
      <div className="rf-acts">
        <Button disabled={busy || !preview || (skill && !preview.skill.name)} onClick={onAdopt}>{skill ? "存进资产仓库" : "采纳写入"}</Button>
        <Button secondary disabled={busy} onClick={onReject}>退回</Button>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </Dialog>
  );
}

// 手动粘贴：Agent 没调 reverse_report 时整段贴进来，按最后一轮的类型解析。轮次优先认小标题，其次是最后一轮在问的。
// 回执与复刻对照在这里预览后直接写档案；Skill 草稿要存资产，先交到待过目，再在过目里预览、存。
function PasteDialog({ record, busy, error, onConfirm, onSkill, onClose }) {
  const [text, setText] = useState(""), [problem, setProblem] = useState(""), [preview, setPreview] = useState(null);
  const rounds = hatchOf(record).rounds, kind = ["replica", "skill"].includes(rounds.at(-1)?.kind) ? rounds.at(-1).kind : "report", label = BACK[kind];
  const fallback = () => (rounds.findLast((x) => x.status === "sent" && (kind === "report" || x.kind === kind)) || rounds.findLast((x) => x.kind === kind) || rounds.at(-1))?.n;
  useEffect(() => setPreview(null), [text]);
  const show = () => {
    setProblem("");
    try {
      const head = text.match(kind === "replica" ? /^#{1,3}\s*复刻对照.*$/m : /^##\s*回执.*$/m)?.[0] || "", n = Number(head.match(/第\s*(\d{1,3})\s*轮/)?.[1]);
      const round = rounds.some((x) => x.n === n) ? n : fallback();
      setPreview({ round, kind, seen: hatchOf(record), ...(kind === "replica" ? adoptReplica(record, text, round) : adoptReport(record, text, round)) });
    } catch (e) { setProblem(e.message); }
  };
  return (
    <Dialog title={`粘贴${label}`} drawer recoverFocus onClose={() => !busy && onClose()}>
      <p>{kind === "skill" ? "最后一轮是写 Skill：把 Agent 写的 SKILL.md 整段粘进来，交到待过目后预览、改名字，再存进资产仓库。" : `把 Agent 交回的${label}整段粘进来。先看拆出来的结果，确认后才写入。`}</p>
      <label className="rf-field">{label}原文<textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} /></label>
      {kind === "skill" ? <Button disabled={busy || !text.trim()} onClick={() => onSkill(text, fallback())}>交到待过目并预览</Button>
        : !preview && <Button disabled={busy || !text.trim()} onClick={show}>预览</Button>}
      {preview && <><p>写进第 {preview.round} 轮。</p>{kind === "replica" ? <ReplicaPreview preview={preview} /> : <AdoptPreview preview={preview} />}<Button disabled={busy} onClick={() => onConfirm(text, preview.round, preview.seen, kind)}>确认写入</Button></>}
      {(problem || error) && <p className="inline-error" role="alert">{problem || error}</p>}
    </Dialog>
  );
}

export function ReverseFlow({ state, save, notify, adoptState, onSelect, reverseJump, referenceJump }) {
  const rows = (state.reverseRecords || []).filter((r) => !r.deletedAt), reports = state.reverseReports || [];
  const [selected, setSelected] = useState(reverseJump?.id || null), [drawer, setDrawer] = useState(""), [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [pack, setPack] = useState(null), [paste, setPaste] = useState(false), [review, setReview] = useState(null), [why, setWhy] = useState(null);
  const lock = useRef(false), dossier = useRef(null), toolsNode = useRef(null), referenceNodes = useRef(new Map()), jumped = useRef(null), whyBase = useRef("");

  // 每件带上编号（按投入先后）和阶段；清单按六步的先后排，同一步里最近动过的在前。
  const items = useMemo(() => {
    const byAge = [...rows].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    return byAge.map((r, i) => ({ record: { ...r, no: i + 1 }, st: stageOf(r, reports) }))
      .sort((a, b) => ORDER.indexOf(a.st.stage) - ORDER.indexOf(b.st.stage) || (b.record.updatedAt || "").localeCompare(a.record.updatedAt || ""));
  }, [rows, reports]);
  const cur = items.find((x) => x.record.id === selected) || items[0], record = cur?.record, st = cur?.st;
  const hatch = record ? hatchOf(record) : null, rounds = record ? allRounds(record) : [], lastRound = hatch?.rounds.at(-1);
  const pending = record ? reports.filter((r) => r.recordId === record.id && r.status === "pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [];
  const counts = STEPS.map((_, i) => items.filter((x) => railAt(x.record, x.st) === i).length);
  const planned = items.filter((x) => x.st.stage === "planned").length, harvested = items.filter((x) => x.st.stage === "harvested").length;
  const waiting = reports.filter((r) => r.status === "pending" && rows.some((x) => x.id === r.recordId)).length;
  const packRecord = pack && rows.find((r) => r.id === pack.id); // 话术总按最新的记录生成
  const skillAsset = (r) => { const p = r.hatchSkills?.at(-1); return p && state.assets.find((a) => a.id === p.assetId && !a.archived); };

  useEffect(() => { setError(""); setWhy(null); }, [record?.id]);
  useEffect(() => {
    if (!reverseJump || jumped.current === reverseJump.key) return;
    jumped.current = reverseJump.key;
    if (!rows.some((r) => r.id === reverseJump.id)) { notify("这件参照物已删除或不可用，请重新搜索。", "warning"); return; }
    setSelected(reverseJump.id);
    requestAnimationFrame(() => { dossier.current?.scrollIntoView({ block: "start" }); dossier.current?.focus({ preventScroll: true }); });
  }, [reverseJump?.key]);
  useEffect(() => {
    if (!referenceJump) return;
    const node = referenceNodes.current.get(referenceJump.id);
    if (node) { toolsNode.current.open = true; node.scrollIntoView({ block: "center" }); node.focus({ preventScroll: true }); }
  }, [referenceJump?.key]);

  async function guarded(action) { if (lock.current) return; lock.current = true; setBusy(true); setError(""); try { await action(); } catch (e) { setError(e.message); } finally { lock.current = false; setBusy(false); } }
  async function refresh() { const next = await request("/workspace"); adoptState(next); return next; }
  // 读最新、改这一条记录、带 revision 写入；保存失败由 save 提示，原数据不变。
  async function writeRecord(id, change) {
    const latest = await refresh(), now = latest.reverseRecords.find((r) => r.id === id && !r.deletedAt);
    if (!now) throw Error("这件参照物已删除，请刷新后再试");
    return save({ ...latest, reverseRecords: latest.reverseRecords.map((r) => (r.id === now.id ? change(now) : r)) }, { base: latest });
  }
  const copyPack = (by, text) => guarded(async () => {
    const r = packRecord, kind = pack.kind, n = hatchOf(r).rounds.length + 1, who = WHO[by], name = PACKS[kind][0];
    await navigator.clipboard.writeText(text);
    // 剪贴板已经写好；之后任何失败都要说明「已复制」，不让人再复制一次。
    const unrecorded = (why) => Error(`「${name}」已复制，但第 ${n} 轮没记上${why ? `（${why}）` : ""}。不用再复制，可以直接去 ${who} 里粘贴。`);
    let ok;
    try { const packHash = await packHashOf(text); ok = await writeRecord(r.id, (now) => ({ ...now, hatch: appendHatchRound(now, { by, kind, asked: kind === "ask" ? askIds(now) : [], packHash }) })); } catch (e) { throw unrecorded(e.message); }
    if (!ok) throw unrecorded();
    setPack(null); flyData();
    notify(`「${name}」已复制，记为第 ${n} 轮。去 ${who} 里粘贴。`);
  });
  async function loadReview(report, name) {
    setReview({ report, preview: null });
    setReview({ report, preview: await request("/reverse/reports/preview", { id: report.id, ...(name ? { name } : {}) }) });
  }
  const openReview = (report, name) => guarded(() => loadReview(report, name));
  const adopt = () => guarded(async () => {
    const { report, preview } = review;
    const next = await request("/reverse/reports/adopt", { previewId: preview.previewId, expectedRevision: preview.revision });
    adoptState(next); setReview(null); flyData();
    if (report.kind !== "skill") return notify(`第 ${report.round} 轮${BACK[report.kind]}已采纳，写进档案并回读。`);
    const p = next.reverseRecords.find((r) => r.id === report.recordId)?.hatchSkills?.at(-1), asset = p && next.assets.find((a) => a.id === p.assetId);
    if (!asset?.versions.some((v) => v.id === p.versionId)) throw Error("已提交，但回读没找到这一版 Skill。请刷新后在资产页核对，不要重复存。");
    notify(`Skill「${preview.skill.name}」已存进资产仓库（第 ${asset.versions.length} 版）并回读。`);
  });
  const reject = (report) => guarded(async () => {
    const latest = await refresh(), next = await request("/reverse/reports/reject", { id: report.id, expectedRevision: latest.revision });
    adoptState(next); setReview(null); notify(`第 ${report.round} 轮${BACK[report.kind] || "回执"}已退回，档案不变。`);
  });
  // 手动粘贴的 Skill 草稿：交到待过目，接着打开过目预览。
  const pasteSkill = (text, round) => guarded(async () => {
    const sent = await request("/reverse/reports/paste", { taskId: record.id, round, kind: "skill", text });
    const next = await refresh(), report = next.reverseReports.find((r) => r.id === sent.id);
    if (!report || report.status !== "pending") throw Error(`这份草稿之前已交过（${{ adopted: "已存", rejected: "已退回" }[report?.status] || "找不到"}），没有重复记录。`);
    setPaste(false);
    await loadReview(report);
  });
  const copyUsage = (cmd, who) => navigator.clipboard.writeText(cmd).then(() => notify(`口令 ${cmd} 已复制。先把这份 Skill 导出装进 ${WHO[who]}，再粘贴使用。`), () => notify("复制失败，请手动选中口令复制。", "warning"));
  // 预览时看到的档案（seen）和最新的不一样就不写，免得写进去的和你确认的不同。
  const pasteBack = (text, round, seen, kind) => guarded(async () => {
    const ok = await writeRecord(record.id, (now) => {
      if (JSON.stringify(hatchOf(now)) !== JSON.stringify(seen)) throw Error("档案刚被别处改过，没有写入。请关掉重新预览。");
      return { ...now, hatch: (kind === "replica" ? adoptReplica : adoptReport)(now, text, round).hatch, updatedAt: new Date().toISOString() };
    });
    if (ok) { setPaste(false); flyData(); notify(`第 ${round} 轮${BACK[kind]}已写进档案并回读。`); }
  });
  const hold = (on) => guarded(async () => {
    if (await writeRecord(record.id, ({ heldAt, ...now }) => (on ? { ...now, heldAt: new Date().toISOString() } : now))) notify(on ? `「${record.title}」已搁置` : `「${record.title}」已恢复`);
  });
  const saveWhy = (value) => guarded(async () => {
    if (await writeRecord(record.id, (now) => { if ((now.why || "") !== whyBase.current) throw Error("「好在哪里」刚被别处改过，没有写入。请取消后重新打开。"); return { ...now, why: value.trim() }; })) { setWhy(null); notify("「好在哪里」已保存并回读"); }
  });
  const removeRecord = () => guarded(async () => { const latest = await refresh(); await save({ ...latest, reverseRecords: deleteRecord(latest.reverseRecords, record.id) }, { base: latest }); });
  const restore = (id) => guarded(async () => { const latest = await refresh(); await save({ ...latest, reverseRecords: restoreRecord(latest.reverseRecords, id) }, { base: latest }); });

  // 下一步按钮：跟着阶段走。
  const nextActs = !record ? [] : st.stage === "planned" ? [["start", "复制开场话术"]]
    : st.stage === "held" ? [] : st.stage === "harvested" ? []
    : st.next === "wait" ? [] : st.next === "skill" ? [["skill", "复制「写 Skill」"]] : [["ask", "复制「追问下一轮」"], ["replica", "复制「开始复刻」"]];
  const report = hatch?.report;
  return (
    <div className="rv6">
      <header className="bar6">
        <h1>逆向工程<span className="en">REVERSE ENGINEERING</span></h1>
        <span className="cnt"><Lcd value={pad2(rows.length)} /><span>标本</span></span>
        {!!waiting && <span className="cnt"><Lcd value={pad2(waiting)} tone="y" /><span>待过目</span></span>}
        <span className="cnt"><Lcd value={pad2(harvested)} tone="v" /><span>已收成</span></span>
        <span className="grow" />
        <button type="button" className="page-help" aria-label="逆向工程说明" onClick={() => setHelp(true)}>?</button>
        <button type="button" className="btn6 go" onClick={() => setDrawer("input")}><Plus size={16} aria-hidden="true" />拆一件新东西</button>
      </header>

      <section className="blk" aria-labelledby="rf-flow">
        <div className="bh"><span className="no">标准工作流</span><h2 id="rf-flow">每次逆向都按这六步走</h2><span className="meta">工作台发话术、收回执；中间在 Agent 里做</span></div>
        <div className="flow">
          <div className="end"><Lcd value={pad2(planned)} tone="m" />未派出</div>
          <Rail counts={counts} />
          <div className="end v"><Lcd value={pad2(harvested)} tone="v" />已收成</div>
        </div>
        <p className="lg6"><span><b>⏸ 停下等你</b>：Agent 走到这里必须交东西给你、等你回一句话</span><span>每步下面的数字：现在停在这一步的件数</span></p>
      </section>

      {record ? <div className="two6">
        <section className="blk" aria-labelledby="rf-list">
          <div className="bh"><h2 id="rf-list">全部 {rows.length} 件</h2><span className="meta">按步骤排</span></div>
          <ul className="list6">{items.map((x) => <Item key={x.record.id} record={x.record} st={x.st} on={x.record.id === record.id} asset={skillAsset(x.record)} onPick={() => setSelected(x.record.id)} />)}</ul>
        </section>

        <section className="blk dos" ref={dossier} tabIndex={-1} aria-labelledby="rf-title">
          <div className="dh">
            <h2 id="rf-title">{record.title}</h2><Tag st={st} />
            <span className="src">{kindOf(record)}{targetOf(record) ? ` · ${targetOf(record)}` : ""}</span>
            <div className="acts">
              {!!hatch.rounds.length && <button type="button" className="btn6 sm" disabled={busy} onClick={() => { setError(""); setPaste(true); }}><ClipboardPaste size={14} aria-hidden="true" />粘贴回执</button>}
              {st.stage !== "harvested" && <button type="button" className="btn6 sm" disabled={busy} onClick={() => hold(!record.heldAt)}>{record.heldAt ? <><Play size={14} aria-hidden="true" />恢复</> : <><Pause size={14} aria-hidden="true" />搁置</>}</button>}
            </div>
          </div>
          <p className="want"><span>想弄懂</span>{wantOf(record)}</p>
          {why !== null
            ? <form className="rf-why" onSubmit={(e) => { e.preventDefault(); saveWhy(why); }}>
              <input aria-label="好在哪里（选填）" value={why} maxLength={500} autoFocus disabled={busy} placeholder="我觉得它好在哪里" onChange={(e) => setWhy(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setWhy(null)} />
              <button type="submit" className="text-btn" disabled={busy}>保存</button>
              <button type="button" className="text-btn" disabled={busy} onClick={() => setWhy(null)}>取消</button>
            </form>
            : <button type="button" className={`why${record.why ? "" : " add"}`} disabled={busy} onClick={() => { whyBase.current = record.why || ""; setWhy(record.why || ""); }}>{record.why ? `好在哪里：${record.why}` : "＋ 好在哪里（选填）"}</button>}

          {pending.map((r) => (
            <div className="pend" key={r.id}><i aria-hidden="true" />
              <div><b>{r.proposer === "手动粘贴" ? "粘贴" : "AI 交回"}了第 {r.round} 轮{BACK[r.kind] || "回执"}</b><small>{r.proposer === "手动粘贴" ? "手动粘贴" : `reverse_report · ${r.proposer || "AI"}`} · {hm(r.createdAt)} · {r.kind === "skill" ? "预览后存进资产仓库" : "采纳前先预览，采纳后写进档案"}</small></div>
              <button type="button" className="btn6 go sm" disabled={busy} onClick={() => openReview(r)}>{r.kind === "skill" ? "预览并存" : "预览并采纳"}</button>
              <button type="button" className="btn6 sm" disabled={busy} onClick={() => reject(r)}>退回</button>
            </div>))}
          {error && !pack && !paste && !review && <p className="inline-error" role="alert">{error}</p>}

          <Stats record={record} rounds={rounds} />
          <div className="hr" />
          <div className="nn">
            <div><span className="l">现在</span><b>{report?.verdict || (lastRound ? `第 ${lastRound.n} 轮${STATUS[lastRound.status] || ""}` : "还没派出")}</b>
              <small>{report ? `第 ${report.round} 轮结论` : lastRound ? `${md(lastRound.at)} · ${WHO[lastRound.by] || lastRound.by}` : `投入于 ${md(record.createdAt)}`}</small></div>
            <div><span className="l o">下一步</span><b>{st.stage === "held" ? "已搁置，恢复后接着做" : st.stage === "review" ? "过目回执，再决定：追问缺口，还是派复刻" : st.nextLabel}</b>
              {!!nextActs.length && <div className="acts">{nextActs.map(([kind, label], i) => <button key={kind} type="button" className={`btn6 sm${i ? "" : " cy"}`} disabled={busy} onClick={() => { setError(""); setPack({ id: record.id, kind }); }}>{label}</button>)}</div>}</div>
          </div>
          <div className="hr" />
          <Caps report={report} />
          {report?.caps.length > 0 && <div className="hr" />}
          <Slots hatch={hatch} />
          {report?.evidence.length > 0 && <div className="hr" />}
          <Evidence report={report} />
          {report?.nextAsk?.length > 0 && <><div className="hr" /><section aria-labelledby="rf-next"><h3 className="sub3" id="rf-next">下一轮建议问<small>{report.nextAsk.length} 条</small></h3><ul className="evl">{report.nextAsk.map((q, i) => <li key={i}><b>{i + 1}</b>{q}</li>)}</ul></section></>}
          {hatch.replica && <><div className="hr" /><section aria-labelledby="rf-rep"><h3 className="sub3" id="rf-rep">复刻对照<small>{hatch.replica.where}</small></h3><ul className="evl repl">{hatch.replica.rows.map((x, i) => <li key={i}><b>{REPLICA_RESULTS[x.result]}</b>{x.name}{x.note ? ` · ${x.note}` : ""}</li>)}</ul></section></>}
          <div className="hr" />
          <Output record={record} assets={state.assets} onOpen={onSelect} onCopy={copyUsage} />
          <div className="hr" />
          <History record={record} rounds={rounds} reports={reports} />
          <Original record={record} />
          <p className="rf-foot"><button className="text-btn" disabled={busy} onClick={removeRecord}><Trash2 size={14} aria-hidden="true" />把「{record.title}」移入回收区</button></p>
        </section>
      </div> : <section className="blk rf-empty"><h2>拆第一件东西</h2><p>写下想弄懂什么，工作台生成开场话术，交给 Codex 或 Claude Code 按六步去拆。</p><button type="button" className="btn6 go" onClick={() => setDrawer("input")}><Plus size={16} aria-hidden="true" />拆一件新东西</button></section>}

      <details className="rf-more rf-tools" ref={toolsNode}>
        <summary>参考与回收</summary>
        <Button secondary onClick={() => setDrawer("reference")}>保存参考</Button>
        {(state.references || []).map((r) => <p key={r.id} tabIndex={-1} ref={(node) => { if (node) referenceNodes.current.set(r.id, node); else referenceNodes.current.delete(r.id); }}><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a><small>{r.note}</small></p>)}
        {(state.reverseRecords || []).filter((r) => r.deletedAt).map((r) => <p key={r.id}>{r.title}<button className="text-btn" disabled={busy} onClick={() => restore(r.id)}><RotateCcw size={14} aria-hidden="true" />恢复</button></p>)}
      </details>

      {drawer && <ReverseInput state={state} save={save} notify={notify} onClose={() => setDrawer("")} referenceOnly={drawer === "reference"}
        onCreated={(id) => { setSelected(id); if (drawer === "input") setPack({ id, kind: "start" }); }} />}
      {packRecord && <PackDialog record={packRecord} kind={pack.kind} busy={busy} error={error} onClose={() => { setPack(null); setError(""); }} onCopy={copyPack} />}
      {paste && record && <PasteDialog record={record} busy={busy} error={error} onClose={() => setPaste(false)} onConfirm={pasteBack} onSkill={pasteSkill} />}
      {review && <ReviewDialog report={review.report} preview={review.preview} busy={busy} error={error} onClose={() => setReview(null)} onAdopt={adopt} onReject={() => reject(review.report)} onRename={(name) => openReview(review.report, name)} />}
      {help && <Dialog title="逆向工程" onClose={() => setHelp(false)}><p>每次逆向都按六步走：确认 → 拆前计划 ⏸ → 取证 → 交回执 ⏸ → 复刻验证 ⏸ → 写 Skill ⏸。工作台只发话术、收回执，取证在 Codex 或 Claude Code 里做（用它们本机注册的 rea MCP）。</p><p>Agent 交回回执有两条路：调 <code>reverse_report</code> 自动交回，出现在「待过目」；或者你把回执整段粘进「粘贴回执」。两条路都是先预览，确认后才写进档案。</p></Dialog>}
    </div>
  );
}

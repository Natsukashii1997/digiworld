// 逆向工程孵蛋 3C（issue #28）：标本条 + 孵化器 + 八格。把一件参照物一点点照亮，拆出一份 Skill。
// 工作台不自己取证：缺的格子写成追问包复制给原生 Agent，结论粘回来先预览拆格、确认后写入并回读。
// 冻结的 REA 运行、AI 执行器、内嵌 Codex 会话、网站预检不再从这页进入，代码留在 ReverseV16；旧的存 Skill、删除恢复照旧。
// 动效在第 4 批，孵化在第 3 批；这一批只做静态与数据。
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Copy, Trash2, RotateCcw, ClipboardPaste } from "lucide-react";
import { Button, Dialog, FilterTabs } from "./components.jsx";
import { request } from "./api.js";
import { LcdText, useCountUp } from "./v14.jsx";
import { ReverseInput } from "./ReverseInput.jsx";
import { ReaUpdate } from "./ReaUpdate.jsx";
import { buildReplicaPack, currentSkill } from "./reverse-v4.js";
import { deleteRecord, restoreRecord } from "./reverse.js";
import { SLOTS, slotState, hatchScore, hatchOf, wantOf, targetOf, buildHatchPack, buildOrganizePack, parseHatchReply, applyHatchReply, editSlot, appendHatchRound, packHashOf, legacyRounds } from "./reverse-hatch.js";
import "./reverse-v4.css"; // ReaUpdate、ReverseInput、存 Skill 预览的样式
import "./reverse-hatch.css";

const pad2 = (n) => String(n).padStart(2, "0");
const md = (iso) => (iso ? `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}` : "");
const WHO = { codex: "Codex", claude: "Claude Code", rea: "REA" };
const STATUS = { done: "完成", partial: "部分", blocked: "阻断", failed: "失败", sent: "在问", back: "已放回" };
const KIND = { web: "网站", electron: "软件", local: "本机文件", TXT: "文字", IMG: "图片", WEB: "网页", FN: "功能" };
const kindOf = (r) => KIND[r.material?.target?.kind] || KIND[r.type] || "文字";
const STATE_TEXT = { full: "填上了", half: "半格", empty: "空" };

// 旧记录推出的每轮在前，新轮次接着往下数（hatch.rounds[].n 只是新轮次的序号）。
function allRounds(record, hatch) {
  const legacy = legacyRounds(record);
  return [...legacy, ...hatch.rounds.map((x) => ({ ...x, n: legacy.length + x.n, legacy: false }))];
}
const roundText = (x) => `第 ${x.n} 轮 · ${md(x.at)} · ${WHO[x.by] || x.by} · ${STATUS[x.status] || x.status}${x.retargeted ? " · 目标已改" : ""}`;

function Count({ value, run }) {
  const shown = useCountUp(String(value), run);
  return <LcdText text={pad2(shown)} px={3} label={String(value)} />;
}

// 像素蛋 22×26：第 i 格填上，就在它那一侧的对应高度裂一道（左四格裂左边，右四格裂右边），半格裂一半。
const W = 22, H = 26, CELL = 8, BANDS = [8, 12, 17, 22];
const SPOTS = new Set(["8,9", "9,9", "8,10", "14,14", "15,14", "14,15", "6,19", "7,19", "12,22", "13,22", "16,20"]);
const inside = (x, y) => { const t = (y - 15) / 11.5; if (Math.abs(t) > 1) return false; const rx = 9.6 * (y < 15 ? 0.78 + 0.22 * (1 - Math.abs(t)) : 1) * Math.sqrt(1 - t * t); return Math.abs(x + 0.5 - 11) <= rx; };
function crackFor(i, part) {
  const left = i < 4, y0 = BANDS[i % 4], d = left ? 1 : -1;
  let x0 = left ? 0 : W - 1; while (!inside(x0, y0)) x0 += d;
  const path = [[x0, y0], [x0 + d, y0], [x0 + 2 * d, y0 - 1], [x0 + 3 * d, y0 - 1], [x0 + 4 * d, y0], [x0 + 5 * d, y0 + 1], [x0 + 6 * d, y0 + 1]];
  return path.slice(0, Math.ceil(path.length * part));
}
function Egg({ states }) {
  const crack = new Set();
  states.forEach((st, i) => { if (st !== "empty") for (const [x, y] of crackFor(i, st === "full" ? 1 : 0.5)) crack.add(`${x},${y}`); });
  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1), k = `${x},${y}`;
    const fill = edge || crack.has(k) ? "var(--px-ink)" : SPOTS.has(k) ? "var(--px-egg-spot)" : "var(--px-egg)";
    cells.push(<rect key={k} x={x * CELL} y={(y + 3) * CELL} width={CELL} height={CELL} fill={fill} />);
  }
  return <svg className="egg" viewBox={`0 0 ${W * CELL} ${(H + 3) * CELL}`} width={W * CELL * 0.8} height={(H + 3) * CELL * 0.8} shapeRendering="crispEdges" aria-hidden="true">{cells}</svg>;
}

function Slot({ slot, index, value, asking, sent, round, busy, onAsk, onEdit }) {
  const st = slotState(value);
  const label = sent ? `第 ${round} 轮在问` : STATE_TEXT[st];
  return (
    <article className={`rh-slot st-${st}${sent ? " is-sent" : asking ? " is-ask" : ""}`} data-slot={slot.id} aria-label={`${slot.name} · ${label}`}>
      <div className="rh-sh"><span className="no">{pad2(index + 1)}</span><b>{slot.name}</b><span className="rh-st">{label}</span></div>
      <div className="rh-body">
        {st === "full" ? <><span className="lb">写进 Skill</span><p>{value.known}</p></>
          : st === "half" ? <><p className="kn">{value.known}</p><p className="ms">缺 {value.miss}</p></>
          : <p>{value?.miss || "还没有结论，等这一格的回答。"}</p>}
      </div>
      <div className="rh-ft">
        <button type="button" className="rh-edit" disabled={busy} onClick={onEdit}>{value?.edited ? "你改过 · 再改" : "改"}</button>
        {st !== "full" && !sent && <button type="button" className="rh-tg" aria-pressed={asking} disabled={busy} onClick={onAsk}><i aria-hidden="true">✓</i>放进追问</button>}
      </div>
    </article>
  );
}

function Device({ hatch, score, rounds, asks, sentIds, nextRound, busy, onCopy, onReply }) {
  const states = SLOTS.map((s) => slotState(hatch.slots[s.id]));
  const filled = `${score.full}${score.half ? "½" : ""}`;
  const canCopy = asks.length > 0 || rounds.length === 0;
  return (
    <div className="rh-dev">
      {SLOTS.map((s, i) => <i key={s.id} className={`rh-port ${i < 4 ? "l" : "r"} ${sentIds.has(s.id) ? "is-sent" : "st-" + states[i]}`} style={{ top: 75 + (i % 4) * 160 }} aria-hidden="true" />)}
      <div className="top"><span className="eyebrow"><b>SKILL</b> 孵化器</span><span className="eyebrow">INCUBATING</span></div>
      <div className="rh-screen"><div className="readout"><span>孵化中</span><span>{filled} / 8</span></div><Egg states={states} /></div>
      <div className="rh-count"><span className="lcd"><Count value={score.full} run={filled} /></span><small>格填上{score.half ? ` · ${score.half} 格半` : ""} · {score.empty} 格空</small></div>
      <ol className="rh-hist" aria-label="每轮">
        {rounds.length ? rounds.slice(-3).map((x) => <li key={x.n}>{roundText(x)}</li>) : <li>还没交出过</li>}
      </ol>
      <div className="rh-acts">
        <span className="lbl">{asks.length ? <>把勾上的 <b>{asks.length} 格</b>写成第 {nextRound} 轮追问包</> : rounds.length ? "勾上要问的格子" : `第 ${nextRound} 轮先做一次完整取证`}</span>
        <div className="row">
          <button type="button" className="rh-btn cy" disabled={busy || !canCopy} onClick={() => onCopy("codex")}><Copy aria-hidden="true" />复制给 Codex</button>
          <button type="button" className="rh-btn" disabled={busy || !canCopy} onClick={() => onCopy("claude")}><Copy aria-hidden="true" />复制给 Claude Code</button>
        </div>
        <button type="button" className="rh-btn" disabled={busy} onClick={onReply}><ClipboardPaste aria-hidden="true" />放回结论</button>
      </div>
    </div>
  );
}

// 旧版本的结论没有分格：只读列出，并能复制「按八格整理」任务包（只整理，不重新取证）。
function Legacy({ record, busy, onOrganize, onSkill }) {
  const versions = record.packVersions || [];
  const v = versions.find((x) => x.id === record.activePackVersionId) || versions.at(-1);
  const result = v?.result, canSkill = record.type && buildReplicaPack(record), saved = record.savedSkill || record.forge;
  if (!result && !canSkill && !saved) return null;
  return (
    <section className="rh-legacy" aria-labelledby="rh-legacy-title">
      <h3 id="rh-legacy-title">旧结论 · 未分格{v && <small>{md(v.at)} · {WHO[v.executor] || v.executor} · 未经复刻验证</small>}</h3>
      {result && <>
        {result.conclusions.length ? <ul>{result.conclusions.map((c, i) => <li key={i}><span className={`mark${c.mark === "推断" ? " inferred" : ""}`}>{c.mark}</span>{c.text}</li>)}</ul> : <p>这一轮没有形成有证据的结论。</p>}
        {!!result.unknowns.length && <><h4>未知</h4><ul>{result.unknowns.map((u) => <li key={u.id}>{u.text}</li>)}</ul></>}
      </>}
      <div className="rh-legacy-acts">
        {result && <Button disabled={busy} onClick={onOrganize}><Copy size={16} />复制「让 Agent 按八格整理」</Button>}
        {(canSkill || saved) && <button type="button" className="text-act" disabled={busy} onClick={onSkill}>{currentSkill(record) ? "查看已存 Skill" : "存成 Skill"}</button>}
      </div>
    </section>
  );
}

function History({ record, rounds }) {
  const runs = record.reaRuns || [], versions = record.packVersions || [];
  const legacy = { ...(record.recipe ? { 配方: record.recipe } : {}), ...(record.replicas?.length ? { 复刻与评分: record.replicas } : {}), ...(record.pack ? { 旧任务包: record.pack } : {}), ...(record.reply ? { 旧回复: record.reply } : {}) };
  if (!runs.length && !versions.length && !Object.keys(legacy).length) return null;
  return (
    <details className="rh-more">
      <summary>历史取证（只读）</summary>
      {rounds.filter((x) => x.legacy).map((x) => <p key={x.n}>{roundText(x)}{x.target ? ` · ${x.target}` : ""}{x.error ? ` · ${x.error}` : ""}</p>)}
      {versions.map((v) => <details key={v.id}><summary>任务包 · {md(v.at)} · {WHO[v.executor] || v.executor}</summary><pre>{v.result.pack}</pre></details>)}
      {runs.filter((r) => r.summary?.evidenceId).map((r) => <p key={r.id}>证据 <code>{r.summary.evidenceId}</code></p>)}
      {!!Object.keys(legacy).length && <pre>{JSON.stringify(legacy, null, 2)}</pre>}
    </details>
  );
}

function ReplyDialog({ record, busy, error, onClose, onConfirm }) {
  const [text, setText] = useState(""), [preview, setPreview] = useState(null), [overwrite, setOverwrite] = useState([]), [problem, setProblem] = useState("");
  const parsed = useMemo(() => { try { return text.trim() ? parseHatchReply(text) : null; } catch (e) { return { error: e.message }; } }, [text]);
  useEffect(() => { setPreview(null); setOverwrite([]); }, [text]);
  const show = () => { setProblem(""); if (!parsed || parsed.error) return setProblem(parsed?.error || "先粘贴 Agent 的回答"); setPreview(applyHatchReply(record, parsed, { overwrite })); };
  const toggle = (id) => { const next = overwrite.includes(id) ? overwrite.filter((x) => x !== id) : [...overwrite, id]; setOverwrite(next); setPreview(applyHatchReply(record, parsed, { overwrite: next })); };
  const name = (id) => SLOTS.find((s) => s.id === id).name;
  return (
    <Dialog title="放回结论" drawer recoverFocus onClose={() => !busy && onClose()}>
      <p>把 Agent 按八格写的回答整段粘进来。先看拆格结果，确认后才写入。</p>
      <label className="rh-field">Agent 的回答<textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} /></label>
      {!preview && <Button disabled={busy || !text.trim()} onClick={show}>拆格预览</Button>}
      {preview && <div className="rh-preview" aria-live="polite">
        <h3>会变的格子（{preview.changes.length}）</h3>
        {preview.changes.length ? <ul>{preview.changes.map((c) => <li key={c.id}><b>{name(c.id)}</b> {STATE_TEXT[c.from.state]} → {STATE_TEXT[c.to.state]}{c.to.known && <p>已知：{c.to.known}</p>}{c.to.miss && <p>缺：{c.to.miss}</p>}</li>)}</ul> : <p>没有格子会变。</p>}
        {!!preview.kept.length && <><h3>你改过，默认不覆盖</h3><ul>{preview.kept.map((k) => <li key={k.id}><label><input type="checkbox" checked={false} onChange={() => toggle(k.id)} disabled={busy} />用回答覆盖「{name(k.id)}」</label><p>回答里写的：{k.to.known || "（无已知）"}{k.to.miss ? ` · 缺：${k.to.miss}` : ""}</p></li>)}</ul></>}
        {!!overwrite.length && <p>会覆盖你改过的：{overwrite.map(name).join("、")} <button type="button" className="text-btn" onClick={() => { setOverwrite([]); setPreview(applyHatchReply(record, parsed, { overwrite: [] })); }}>撤回</button></p>}
        {!!preview.unplaced.length && <><h3>分不进格（不会写入）</h3>{preview.unplaced.map((u, i) => <details key={i}><summary>{u.label}</summary><pre>{u.text}</pre></details>)}</>}
        {!!preview.missing.length && <p>回答里没有写：{preview.missing.map(name).join("、")}（这几格不变）</p>}
        {!!preview.redactions && <p>已隐去 {preview.redactions} 处疑似凭据。</p>}
        <Button disabled={busy || (!preview.changes.length && hatchOf(record).rounds.at(-1)?.status !== "sent")} onClick={() => onConfirm(parsed, overwrite)}>确认写入</Button>
      </div>}
      {(problem || error) && <p className="inline-error" role="alert">{problem || error}</p>}
    </Dialog>
  );
}

function EditDialog({ slot, value, busy, error, onClose, onSave }) {
  const [known, setKnown] = useState(value?.known || ""), [miss, setMiss] = useState(value?.miss || "");
  return (
    <Dialog title={`改「${slot.name}」`} recoverFocus onClose={() => !busy && onClose()}>
      <p>改过的格子标「你改过」，之后放回结论时默认不覆盖它。</p>
      <label className="rh-field">已知<textarea rows={4} maxLength={2000} value={known} onChange={(e) => setKnown(e.target.value)} disabled={busy} /></label>
      <label className="rh-field">缺<textarea rows={3} maxLength={2000} value={miss} onChange={(e) => setMiss(e.target.value)} disabled={busy} /></label>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <Button disabled={busy} onClick={() => onSave({ known, miss })}>保存这一格</Button>
    </Dialog>
  );
}

export function ReverseHatch({ state, save, notify, adoptState, onSelect, reverseJump, referenceJump }) {
  const rows = (state.reverseRecords || []).filter((r) => !r.deletedAt);
  const [selected, setSelected] = useState(reverseJump?.id || null), [drawer, setDrawer] = useState(""), [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [askMap, setAskMap] = useState({});
  const [reply, setReply] = useState(false), [editing, setEditing] = useState(null), [preview, setPreview] = useState(null), [saved, setSaved] = useState(null);
  const lock = useRef(false), stage = useRef(null), toolsNode = useRef(null), referenceNodes = useRef(new Map()), jumped = useRef(null);
  const record = rows.find((r) => r.id === selected) || rows[0];
  const hatch = record ? hatchOf(record) : null, score = hatch ? hatchScore(hatch) : null;
  const rounds = record ? allRounds(record, hatch) : [];
  const last = hatch?.rounds.at(-1), sentIds = new Set(last?.status === "sent" ? last.asked : []);
  const askIds = record ? askMap[record.id] || SLOTS.filter((s) => slotState(hatch.slots[s.id]) !== "full" && !sentIds.has(s.id)).map((s) => s.id) : [];
  const asks = askIds.filter((id) => !sentIds.has(id) && slotState(hatch.slots[id]) !== "full");
  const pack = record ? buildHatchPack(record, { asked: asks }) : "";
  const hatched = rows.reduce((n, r) => n + (r.hatchSkills?.length || 0), 0);

  useEffect(() => { setError(""); setPreview(null); setSaved(null); }, [record?.id]);
  useEffect(() => {
    if (!reverseJump || jumped.current === reverseJump.key) return;
    jumped.current = reverseJump.key;
    if (!rows.some((r) => r.id === reverseJump.id)) { notify("这件参照物已删除或不可用，请重新搜索。", "warning"); return; }
    setSelected(reverseJump.id);
    requestAnimationFrame(() => { stage.current?.scrollIntoView({ block: "start" }); stage.current?.focus({ preventScroll: true }); });
  }, [reverseJump?.key]);
  useEffect(() => {
    if (!referenceJump) return;
    const node = referenceNodes.current.get(referenceJump.id);
    if (node) { toolsNode.current.open = true; node.scrollIntoView({ block: "center" }); node.focus({ preventScroll: true }); }
  }, [referenceJump?.key]);

  async function guarded(action) { if (lock.current) return; lock.current = true; setBusy(true); setError(""); try { await action(); } catch (e) { setError(e.message); } finally { lock.current = false; setBusy(false); } }
  async function refresh() { const next = await request("/workspace"); adoptState(next); return next; }
  // 读最新、改这一条记录的 hatch、带 revision 写入；保存失败由 save 提示，原数据不变。
  async function writeHatch(change) {
    const latest = await refresh(), cur = latest.reverseRecords.find((r) => r.id === record.id && !r.deletedAt);
    if (!cur) throw Error("这件参照物已删除，请刷新后再试");
    const next = change(cur);
    return save({ ...latest, reverseRecords: latest.reverseRecords.map((r) => (r.id === cur.id ? { ...r, hatch: next } : r)) }, { base: latest });
  }
  const toggleAsk = (id) => setAskMap((m) => ({ ...m, [record.id]: asks.includes(id) ? asks.filter((x) => x !== id) : [...asks, id] }));
  const copy = (by) => guarded(async () => {
    const text = pack, n = rounds.length + 1, who = WHO[by];
    await navigator.clipboard.writeText(text);
    const packHash = await packHashOf(text);
    if (!(await writeHatch((cur) => appendHatchRound(cur, { by, asked: asks, packHash })))) throw Error(`第 ${n} 轮追问包已复制，但这一轮没记上。不用再复制，刷新后可以直接去 ${who} 里粘贴。`);
    setAskMap((m) => ({ ...m, [record.id]: [] }));
    notify(`第 ${n} 轮追问包已复制。去 ${who} 里粘贴，只复制，不自动发送。`);
  });
  const putBack = (parsed, overwrite) => guarded(async () => {
    let result;
    if (!(await writeHatch((cur) => (result = applyHatchReply(cur, parsed, { overwrite })).hatch))) return;
    setReply(false);
    notify(`结论已放回：${result.changes.length} 格有变化${result.kept.length ? `，${result.kept.length} 格你改过没覆盖` : ""}，已回读。`);
  });
  const saveSlot = (id, value) => guarded(async () => { if (await writeHatch((cur) => editSlot(cur, id, value))) { setEditing(null); notify("这一格已保存并回读"); } });
  const organize = () => guarded(async () => { await navigator.clipboard.writeText(buildOrganizePack(record)); notify("「按八格整理」任务包已复制。拿回答后点「放回结论」。"); });
  async function skillPreview() { await guarded(async () => {
    const known = await request("/reverse/skill/query?recordId=" + record.id);
    if (known.saved) { setSaved(known); if (known.state) adoptState(known.state); return; }
    const latest = await refresh(), result = await request("/reverse/skill/preview", { recordId: record.id, expectedRevision: latest.revision });
    if (result.saved) setSaved(result); else setPreview(result);
  }); }
  const removeRecord = () => guarded(async () => { const latest = await refresh(); await save({ ...latest, reverseRecords: deleteRecord(latest.reverseRecords, record.id) }, { base: latest }); });
  const restore = (id) => guarded(async () => { const latest = await refresh(); await save({ ...latest, reverseRecords: restoreRecord(latest.reverseRecords, id) }, { base: latest }); });

  const slotProps = (s, i) => ({ slot: s, index: i, value: hatch.slots[s.id], asking: asks.includes(s.id), sent: sentIds.has(s.id), round: rounds.length, busy, onAsk: () => toggleAsk(s.id), onEdit: () => setEditing(s.id) });
  const lastRound = rounds.at(-1);
  return (
    <div className="rh">
      <header className="bar">
        <h1>逆向工程<span className="en">REVERSE ENGINEERING</span></h1>
        <div className="counts">
          <span className="cnt"><span className="lcd"><Count value={rows.length} run={rows.length} /></span><small>标本</small></span>
          <span className="cnt"><span className="lcd violet"><Count value={hatched} run={hatched} /></span><small>已孵化</small></span>
        </div>
        <span className="grow" />
        <button type="button" className="page-help" aria-label="逆向工程说明" onClick={() => setHelp(true)}>?</button>
      </header>

      <FilterTabs label="选择标本" className="rh-switch" value={record?.id}
        items={rows.map((r) => ({ id: r.id, label: r.title, count: wantOf(r), title: r.title }))} onChange={setSelected}>
        <button type="button" className="rh-add" onClick={() => setDrawer("input")}><Plus size={16} aria-hidden="true" /><span>投入参照物</span></button>
      </FilterTabs>

      {record ? <>
        <div className="rh-src">
          <span className="rh-kind">{kindOf(record)}</span><h2>{record.title}</h2>
          {targetOf(record) && <code>{targetOf(record)}</code>}
          <span className="sep" aria-hidden="true">|</span>
          <span>{lastRound ? roundText(lastRound) : "还没交出过"}</span>
          {record.why && <span className="why">好在哪里：{record.why}</span>}
        </div>
        <div className="rh-stage" ref={stage} tabIndex={-1} aria-label={`${record.title} · 八格与孵化器`}>
          <div className="rh-col l">{SLOTS.slice(0, 4).map((s, i) => <Slot key={s.id} {...slotProps(s, i)} />)}</div>
          <Device hatch={hatch} score={score} rounds={rounds} asks={asks} sentIds={sentIds} nextRound={rounds.length + 1} busy={busy} onCopy={copy} onReply={() => { setError(""); setReply(true); }} />
          <div className="rh-col r">{SLOTS.slice(4).map((s, i) => <Slot key={s.id} {...slotProps(s, i + 4)} />)}</div>
        </div>
        {error && !reply && !editing && <p className="inline-error" role="alert">{error}</p>}
        <details className="rh-pv"><summary>看追问包全文</summary><pre data-testid="hatch-pack">{pack}</pre></details>
        <Legacy record={record} busy={busy} onOrganize={organize} onSkill={skillPreview} />
        {!!(record.packSkills?.length || record.savedSkill) && <details className="rh-more"><summary>历史固定 Skill</summary>{[...(record.savedSkill ? [record.savedSkill] : []), ...(record.packSkills || [])].map((p) => <p key={p.assetId + p.at}><button className="text-btn" onClick={() => onSelect(state.assets.find((a) => a.id === p.assetId))}>打开固定 Skill · {new Date(p.at).toLocaleString("zh-CN")}</button></p>)}</details>}
        <History record={record} rounds={rounds} />
      </> : <div className="rh-empty"><h2>投入第一件参照物</h2><p>写下想弄懂什么，八格里缺的部分写成追问包，交给 Codex 或 Claude Code 去拆。</p><Button onClick={() => setDrawer("input")}><Plus size={16} />投入参照物</Button></div>}

      {/* REA 版本维护第 5 批挪进设置；在那之前暂放页尾，入口不能消失 */}
      <section className="rh-foot" aria-label="工具">
        <h3>工具</h3><ReaUpdate />
        {record && <button className="text-btn" disabled={busy} onClick={removeRecord}><Trash2 size={14} />把「{record.title}」移入回收区</button>}
      </section>
      <details className="rh-more" ref={toolsNode}>
        <summary>参考与回收</summary>
        <Button secondary onClick={() => setDrawer("reference")}>保存参考</Button>
        {(state.references || []).map((r) => <p key={r.id} tabIndex={-1} ref={(node) => { if (node) referenceNodes.current.set(r.id, node); else referenceNodes.current.delete(r.id); }}><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a><small>{r.note}</small></p>)}
        {(state.reverseRecords || []).filter((r) => r.deletedAt).map((r) => <p key={r.id}>{r.title}<button className="text-btn" disabled={busy} onClick={() => restore(r.id)}><RotateCcw size={14} />恢复</button></p>)}
      </details>

      {drawer && <ReverseInput state={state} save={save} notify={notify} onClose={() => setDrawer("")} onCreated={(id) => setSelected(id)} referenceOnly={drawer === "reference"} />}
      {reply && record && <ReplyDialog record={record} busy={busy} error={error} onClose={() => setReply(false)} onConfirm={putBack} />}
      {editing && record && <EditDialog slot={SLOTS.find((s) => s.id === editing)} value={hatch.slots[editing]} busy={busy} error={error} onClose={() => setEditing(null)} onSave={(v) => saveSlot(editing, v)} />}
      {help && <Dialog title="逆向工程" onClose={() => setHelp(false)}><p>把一件参照物一点点照亮，拆出一份 Skill。八格是用途、结构、数据、流程、界面、边界、写入与回滚、验收。</p><p>勾上缺的格子，复制追问包给 Codex 或 Claude Code（用它们本机已注册的 rea MCP 取证）；拿到按八格写的回答后点「放回结论」，先预览再写入。你手改过的格子，下一轮默认不覆盖。</p></Dialog>}
      {preview && <Dialog title="存成 Skill · 预览" drawer recoverFocus onClose={() => !busy && setPreview(null)}><h2>{preview.title}</h2><p>未经复刻验证 · {preview.files.length} 个文本文件 · {preview.mediaCount} 张图片。保存到资产仓库，不安装到 Agent。</p><pre className="reverse-skill-preview">{preview.content}</pre><ul>{preview.files.map((f) => <li key={f.path}>{f.path} · {f.bytes} 字节</li>)}</ul>{error && <p role="alert">{error}</p>}<Button disabled={busy} onClick={() => guarded(async () => { const result = await request("/reverse/skill/confirm", { recordId: preview.recordId, token: preview.token, packVersionId: preview.packVersionId }); if (!result.saved) throw Error("保存结果未确认，请先查询"); adoptState(result.state); setPreview(null); setSaved(result); notify("固定 Skill 已保存并回读"); })}>确认保存</Button><Button secondary disabled={busy} onClick={() => guarded(async () => { const result = await request("/reverse/skill/query?recordId=" + preview.recordId + (preview.packVersionId ? "&packVersionId=" + preview.packVersionId : "")); if (result.saved) { adoptState(result.state); setSaved(result); setPreview(null); } else setError("尚未保存；可核对后确认。"); })}>查询保存结果</Button></Dialog>}
      {saved && <Dialog title="已存 Skill" onClose={() => setSaved(null)}><p>{saved.title} · 固定版本已回读</p><p>{saved.legacy ? "旧版复刻记录绑定的固定Skill。" : "未经复刻验证。"}{!saved.unchanged && "当前任务包已变化，此处保留的是早前固定版本。"}</p><Button onClick={() => { onSelect(saved.state.assets.find((a) => a.id === saved.saved.assetId)); setSaved(null); }}>打开资产</Button></Dialog>}
    </div>
  );
}

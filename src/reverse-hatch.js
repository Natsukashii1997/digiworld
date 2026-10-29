// 逆向工程孵蛋 3C：八格、追问包、八格回答的拆格与放回、旧记录的每轮。纯函数，页面与服务端共用。
// 依据 docs/design/ui-v19/briefs/05-reverse-impl-plan.md §3；旧字段（reaRuns、packVersions…）只读，不迁移、不改写。
import { filterRelayText } from "./relay-prompt.js";

export const SLOTS = [
  { id: "use", name: "用途" }, { id: "shape", name: "结构" }, { id: "data", name: "数据" }, { id: "flow", name: "流程" },
  { id: "ui", name: "界面" }, { id: "edge", name: "边界" }, { id: "write", name: "写入与回滚" }, { id: "check", name: "验收" },
];
export const SLOT_IDS = SLOTS.map((s) => s.id);
export const HATCH_LIMITS = { text: 2000, rounds: 50, reply: 200000 };
const NAME_TO_ID = new Map(SLOTS.map((s) => [s.name, s.id]));
const EMPTY_VALUE = /^(?:无|暂无|没有|（无）|\(无\)|-|—|…|\.\.\.|n\/a|none)$/i;
const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
const clean = (v) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").trim();

export const wantOf = (record) => record?.material?.target?.feature || record?.title || "";
export const targetOf = (record) => { const t = record?.material?.target; return t?.url || t?.path || record?.material?.url || ""; };

// 格子状态由数据推出：只有已知 = 填上；已知和缺都有 = 半格；只有缺或都空 = 空。
export function slotState(slot) {
  const known = !!slot?.known?.trim(), miss = !!slot?.miss?.trim();
  return known && !miss ? "full" : known ? "half" : "empty";
}

export function hatchScore(hatch) {
  const score = { full: 0, half: 0, empty: 0 };
  for (const id of SLOT_IDS) score[slotState(hatch?.slots?.[id])]++;
  return score;
}

// 新记录与旧记录的起点：只有「用途」一格，取自想弄懂；不替用户把旧结论分进格子。
export function initialHatch(record, at = new Date().toISOString()) {
  const slots = {};
  for (const id of SLOT_IDS) slots[id] = { known: "", miss: "", at };
  slots.use.known = clean(wantOf(record)).slice(0, HATCH_LIMITS.text);
  return { version: 1, slots, rounds: [] };
}

export const hatchOf = (record) => record?.hatch || initialHatch(record, record?.createdAt);

const ANSWER_FORMAT = [
  "## 回答格式（照写，我会按小标题拆进八格）",
  "八个小标题都要写，顺序不限。每节两行：「已知：」写有证据的结论，「缺：」写还不知道的、写成问题；没有就写「无」。",
  "", ...SLOTS.flatMap((s) => [`## ${s.name}`, "已知：…", "缺：…", ""]),
];

// 追问包：上一轮已知（填上和半格的已知）+ 这一轮只问勾上的格子 + 八格回答格式。预览与复制用同一个字符串。
export function buildHatchPack(record, { asked = [], at } = {}) {
  const hatch = hatchOf(record), n = (hatch.rounds?.length || 0) + 1;
  const ids = SLOT_IDS.filter((id) => asked.includes(id));
  const known = SLOTS.filter((s) => hatch.slots[s.id]?.known?.trim());
  const software = record?.material?.target?.kind;
  const lines = [
    `# 拆解任务 · 第 ${n} 轮：${record?.title || ""}`,
    `参照物：${targetOf(record) || "见下方素材"}`,
    `想弄懂：${wantOf(record)}`,
    ...(record?.why?.trim() ? [`好在哪里：${record.why}`] : []),
    ...(!software && record?.material?.text?.trim() ? ["", "## 素材", record.material.text] : []),
    "", "## 已经知道",
    ...(known.length ? known.map((s) => `- ${s.name}：${hatch.slots[s.id].known}`) : ["（还没有）"]),
    "",
    ...(ids.length
      ? ["## 这一轮只回答这些格子", ...ids.map((id, i) => { const s = SLOTS.find((x) => x.id === id); return `${i + 1}. ${s.name}：${hatch.slots[id]?.miss?.trim() || "这一格还空着，请说明。"}`; })]
      : ["## 这一轮", "先做一次完整取证，八格都要回答。"]),
    "", "## 做法与边界",
    software ? "- 用你本机已注册的 rea MCP 取证；只读分析，不修改目标、不登录、不提交表单。" : "- 只依据上面的参照物和素材分析，不访问未列出的账号或私人资料。",
    "- 结论写清证据或依据；没把握的写进「缺」，不要猜。",
    "- 只分析，不修改任何项目文件。",
    "", ...ANSWER_FORMAT,
  ];
  return filterRelayText(lines.join("\n").trim() + "\n").text;
}

// 旧结论未分格时用：只整理已有结论和未知，不重新取证。
export function buildOrganizePack(record) {
  const versions = record?.packVersions || [];
  const v = versions.find((x) => x.id === record?.activePackVersionId) || versions.at(-1);
  if (!v?.result) return "";
  const { conclusions = [], unknowns = [] } = v.result;
  const lines = [
    `# 按八格整理 · ${record.title}`,
    `参照物：${targetOf(record) || "见原任务包"}`,
    `想弄懂：${wantOf(record)}`,
    `下面是 ${v.at.slice(0, 10)} 那一轮的结论和未知。只整理，不重新取证、不补充新结论。`,
    "", "## 结论",
    ...(conclusions.length ? conclusions.map((c, i) => `${i + 1}. [${c.mark}] ${c.text}`) : ["（无）"]),
    "", "## 未知",
    ...(unknowns.length ? unknowns.map((u, i) => `${i + 1}. ${u.text}`) : ["（无）"]),
    "", "把每条结论放进最合适的格子的「已知」，把每条未知写成对应格子的「缺」。放不进任何格子的，写在最后的「## 其他」里。",
    "", ...ANSWER_FORMAT,
  ];
  return filterRelayText(lines.join("\n").trim() + "\n").text;
}

const headingOf = (line) => {
  const m = line.match(/^#{1,3}\s*(.+?)\s*[:：]?\s*$/);
  return m ? { name: m[1], id: NAME_TO_ID.get(m[1]) } : null;
};

// 只认 `## 用途` … `## 验收` 加「已知：」「缺：」两行的格式；认不出的段落原样放进 unplaced，不猜测、不丢弃。
export function parseHatchReply(raw) {
  if (typeof raw !== "string") fail("结论需为文本");
  if (raw.length > HATCH_LIMITS.reply) fail("结论超过 20 万字");
  const filtered = filterRelayText(raw);
  const text = filtered.text.replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  const sections = [], preamble = [];
  let cur = null;
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) continue; // Agent 常把整段包进代码块，围栏行本身不是内容
    const h = headingOf(line);
    if (h) { cur = { ...h, lines: [] }; sections.push(cur); continue; }
    (cur ? cur.lines : preamble).push(line);
  }
  const slots = {}, unplaced = [], seen = new Set();
  const keep = (label, body) => { const t = body.trim(); if (t) unplaced.push({ label, text: t }); };
  keep("开头", preamble.join("\n"));
  for (const s of sections) {
    const body = s.lines.join("\n");
    if (!s.id) { keep(s.name, body); continue; }
    if (seen.has(s.id)) { keep(`重复的「${s.name}」`, body); continue; }
    seen.add(s.id);
    const parts = { known: [], miss: [] }, loose = [];
    let field = null;
    for (const line of s.lines) {
      const m = line.match(/^\s*(?:[-*]\s*)?(已知|缺)\s*[:：]\s*(.*)$/);
      if (m) { field = m[1] === "已知" ? "known" : "miss"; parts[field].push(m[2]); continue; }
      (field ? parts[field] : loose).push(line);
    }
    keep(`「${s.name}」里没标已知或缺的部分`, loose.join("\n"));
    const value = (arr) => { const t = clean(arr.join("\n")); return EMPTY_VALUE.test(t) ? "" : t; };
    let known = value(parts.known), miss = value(parts.miss);
    if (!known && !miss) continue; // 空节当作没回答，不改格子
    if (known.length > HATCH_LIMITS.text) { keep(`「${s.name}」已知超出 ${HATCH_LIMITS.text} 字的部分`, known.slice(HATCH_LIMITS.text)); known = known.slice(0, HATCH_LIMITS.text); }
    if (miss.length > HATCH_LIMITS.text) { keep(`「${s.name}」缺超出 ${HATCH_LIMITS.text} 字的部分`, miss.slice(HATCH_LIMITS.text)); miss = miss.slice(0, HATCH_LIMITS.text); }
    slots[s.id] = { known, miss };
  }
  const missing = SLOT_IDS.filter((id) => !slots[id]);
  return { slots, missing, unplaced, redactions: filtered.count };
}

// 放回结论的预览：哪几格会变、哪几格因「你改过」不覆盖。确认时用返回的 hatch 写入；overwrite 里的格子即使改过也覆盖。
export function applyHatchReply(record, parsed, { at = new Date().toISOString(), overwrite = [] } = {}) {
  const prev = hatchOf(record);
  const slots = structuredClone(prev.slots), changes = [], kept = [];
  for (const id of SLOT_IDS) {
    const next = parsed.slots[id];
    if (!next) continue;
    const old = prev.slots[id] || { known: "", miss: "" };
    if (old.known === next.known && old.miss === next.miss) continue;
    if (old.edited && !overwrite.includes(id)) { kept.push({ id, from: old, to: next }); continue; }
    slots[id] = { known: next.known, miss: next.miss, at };
    changes.push({ id, from: { known: old.known, miss: old.miss, state: slotState(old) }, to: { ...next, state: slotState(next) } });
  }
  const rounds = (prev.rounds || []).slice();
  const last = rounds.at(-1);
  if (last?.status === "sent") rounds[rounds.length - 1] = { ...last, status: "back", backAt: at };
  return { hatch: { ...prev, slots, rounds }, changes, kept, unplaced: parsed.unplaced, missing: parsed.missing, redactions: parsed.redactions };
}

// 手改一格：存为 edited，下一轮放回结论默认不覆盖。
export function editSlot(record, id, { known = "", miss = "" }, at = new Date().toISOString()) {
  if (!SLOT_IDS.includes(id)) fail("没有这一格");
  const prev = hatchOf(record);
  const value = (v) => clean(v).slice(0, HATCH_LIMITS.text);
  return { ...prev, slots: { ...prev.slots, [id]: { known: value(known), miss: value(miss), edited: true, at } } };
}

export async function packHashOf(pack) {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(pack));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 复制追问包后追加一轮；轮次只追加，最多 50 轮。
export function appendHatchRound(record, { by, asked = [], packHash, at = new Date().toISOString() }) {
  const prev = hatchOf(record), rounds = prev.rounds || [];
  if (rounds.length >= HATCH_LIMITS.rounds) fail(`最多 ${HATCH_LIMITS.rounds} 轮`);
  return { ...prev, rounds: [...rounds, { n: rounds.length + 1, at, by, asked: SLOT_IDS.filter((id) => asked.includes(id)), status: "sent", packHash }] };
}

// 旧记录的每轮：从 packVersions 与 reaRuns 只读推出。已有任务包版本的成功运行算同一轮，不重复计。
export function legacyRounds(record) {
  const versions = record?.packVersions || [], items = [];
  const label = (t) => t?.url || t?.path || "";
  const current = label(record?.material?.target);
  for (const v of versions) {
    const c = v.result?.conclusions || [], u = v.result?.unknowns || [];
    items.push({ at: v.at, by: v.executor, target: label(v.target),
      status: !c.length ? "failed" : u.length ? "partial" : "done",
      obs: c.filter((x) => x.mark === "观察").length, infer: c.filter((x) => x.mark === "推断").length, unknown: u.length });
  }
  for (const run of record?.reaRuns || []) {
    if (run.status === "running") continue;
    if (run.status === "completed" && versions.some((v) => v.id === run.packVersionId || v.id === run.id)) continue;
    const blocked = run.status === "failed" && ["target", "target_changed"].includes(run.error?.kind);
    items.push({ at: run.finishedAt || run.startedAt, by: run.executor || "rea", target: label(run.target),
      status: run.status === "completed" ? (run.summary?.coverage === "complete" ? "done" : "partial") : blocked ? "blocked" : "failed",
      obs: null, infer: null, unknown: null, ...(run.error ? { error: run.error.code || run.error.kind } : {}) });
  }
  return items.sort((a, b) => a.at.localeCompare(b.at)).map((r, i) => ({ n: i + 1, ...r, retargeted: !!current && !!r.target && r.target !== current, legacy: true }));
}

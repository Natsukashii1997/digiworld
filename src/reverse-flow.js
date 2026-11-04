// 逆向 v5 标准工作流（#49）：开场话术、各阶段短话术、回执与复刻对照的解析、阶段推导。纯函数，页面与服务端共用。
// 依据 docs/design/ui-v19/briefs/05-reverse-v5-工作流与清单.md §2–§5：工作台不取证、不调模型，只生成话术、解析交回的文本。
import { filterRelayText } from "./relay-prompt.js";
import { SLOTS, SLOT_FORMAT, HATCH_LIMITS, hatchOf, wantOf, targetOf, parseHatchReply, applyHatchReply, cellsOf } from "./reverse-hatch.js";

export const FLOW_LIMITS = { caps: 20, evidence: 100, nextAsk: 20, rows: 20 };
export const ROUND_KINDS = ["start", "ask", "replica", "skill"];
export const REPLICA_RESULTS = { ok: "一致", diff: "有差异", no: "未验证" };
export const STAGES = { planned: "计划中", sent: "已派出", review: "回执待过目", replica: "复刻中", harvested: "已收成", held: "搁置" };
export const NEXT_STEPS = { start: "复制开场话术", wait: "等 Agent 交回", review: "过目回执", decide: "追问下一轮，或派复刻", skill: "派写 Skill", resume: "恢复后接着做", done: "—" };
export const EVIDENCE_ID = /^E\d{1,4}$/;

const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
const EMPTY_VALUE = /^(?:无|暂无|没有|（无）|\(无\)|-|—|…|\.\.\.|n\/a|none)[。.！!]?$/i;
const ITEM = /^\s*(?:[-*•]|\d{1,2}[.、)）])\s*(.*)$/;
const relay = (lines) => filterRelayText(lines.join("\n").trim() + "\n").text;
const nextRound = (record) => (hatchOf(record).rounds?.length || 0) + 1;
const taskLine = (record, n) => `任务编号：${record.id}　轮次：${n}（交回时调用 reverse_report，taskId 填任务编号，round 填轮次）`;
const sandboxOf = (record, at) => `~/Sandbox/${at.slice(0, 10)}-${(record?.title || "逆向").replace(/[\s/\\:*?"<>|]+/g, "-").slice(0, 40)}/`;
const software = (record) => !!record?.material?.target?.kind;
const headLines = (record, n) => [
  `参照物：${targetOf(record) || "见下方素材"}`,
  `想弄懂：${wantOf(record)}`,
  ...(record?.why?.trim() ? [`好在哪里（我为什么想拆它）：${record.why.trim()}`] : []),
  taskLine(record, n),
  ...(!software(record) && record?.material?.text?.trim() ? ["", "## 素材", record.material.text.trim()] : []),
];
const BOUNDARY = [
  "边界：",
  "- 只读分析：不修改目标、不登录、不提交表单、不读我的私人数据和凭据。",
  "- 没把握的写进「缺」，不要猜；推断要标「推断」。",
  "- 复刻只在 Sandbox 目录里做，不改任何项目文件。",
];

// 拆解回执格式：一句话结论、能力清单、八格（沿用放回的八格小节）、证据、下一轮建议问。工作台按小标题拆。
export function reportFormat(record, n) {
  return [
    "## 回执格式（照写，工作台按小标题拆）",
    "小标题都要写，顺序不限；没有的写「无」。证据编号 E1、E2… 在能力清单和八格里引用，在「证据」里写清位置。",
    "",
    `## 回执 · ${record?.title || ""} · 第 ${n} 轮 · 任务编号 ${record.id}`,
    "一句话结论：…",
    "## 能力清单",
    "- {能力}：已知 … ｜证据 E1, E2 ｜缺 …",
    "## 八格",
    ...SLOT_FORMAT,
    "## 证据",
    "- E1：{位置：文件 / 函数 / 请求 / 截图} · {说明}",
    "## 下一轮建议问",
    "1. …",
  ];
}

export function replicaFormat(record, n) {
  return [
    "## 复刻对照格式（照写）",
    `## 复刻对照 · ${record?.title || ""} · 第 ${n} 轮 · 任务编号 ${record.id}`,
    "复刻位置：~/Sandbox/…",
    "- {能力}：一致",
    "- {能力}：有差异 ｜ 差在哪",
    "- {能力}：未验证 ｜ 为什么",
  ];
}

// 开场话术：六步，⏸ 处 Agent 必须停下等用户回复。轮次是复制后追加的那一轮。
export function buildStartPack(record, { at = new Date().toISOString() } = {}) {
  const n = nextRound(record);
  return relay([
    `# 逆向任务：${wantOf(record)}`,
    ...headLines(record, n),
    "",
    "请按下面六步做，⏸ 处必须停下来等我回复，不要跳步。",
    "",
    "0. 先确认参照物能打开、是我说的那个功能。打不开或对不上就停下告诉我原因。",
    "1. 拆前计划：列出要拆的能力（3–7 项），每项一句话写清要弄懂什么。⏸ 把清单发给我，我回「开始」再取证。",
    software(record)
      ? "2. 取证：用你本机已注册的 rea MCP 只读取证。每条结论标证据编号（E1、E2…），写清证据在哪（文件 / 函数 / 请求 / 截图）。"
      : "2. 取证：只依据上面的参照物和素材分析，不访问未列出的账号或私人资料。每条结论标证据编号（E1、E2…），写清依据在哪。",
    "3. 交回执：按下面「回执格式」写。写完调用工作台 MCP 工具 reverse_report 交回（kind 填 report，text 填整份回执）；调不了就把整份回执贴出来。⏸ 等我回复。",
    `4. 复刻验证（我说「复刻」才做）：在 ${sandboxOf(record, at)} 里照回执做一个最小版，逐项和原版对照：一致 / 有差异（差在哪）/ 未验证（为什么）。⏸ 按「复刻对照格式」交对照表，同样调 reverse_report（kind 填 replica）。`,
    "5. 写 Skill（我说「写 Skill」才做）：按 SKILL.md 格式写，包含用途、做法、关键证据、局限。只交回工作台（reverse_report，kind 填 skill），不要装进任何 Agent 配置。⏸",
    "",
    ...BOUNDARY,
    "",
    ...reportFormat(record, n),
    "",
    ...replicaFormat(record, n),
  ]);
}

// 追问下一轮：已知 + 只问勾上的格子 + 回执格式。
export function buildAskPack(record, { asked = [] } = {}) {
  const hatch = hatchOf(record), n = nextRound(record);
  const picked = SLOTS.filter((s) => asked.includes(s.id));
  const known = SLOTS.filter((s) => hatch.slots[s.id]?.known?.trim());
  return relay([
    `# 逆向追问 · 第 ${n} 轮：${record?.title || ""}`,
    ...headLines(record, n),
    ...(hatch.report?.verdict ? ["", "## 上一轮结论", hatch.report.verdict] : []),
    "", "## 已经知道",
    ...(known.length ? known.map((s) => `- ${s.name}：${hatch.slots[s.id].known}`) : ["（还没有）"]),
    "",
    ...(picked.length
      ? ["## 这一轮只回答这些格子", ...picked.map((s, i) => `${i + 1}. ${s.name}：${hatch.slots[s.id]?.miss?.trim() || "这一格还空着，请说明。"}`)]
      : ["## 这一轮", "先做一次完整取证，八格都要回答。"]),
    "", "## 做法",
    software(record) ? "1. 用你本机已注册的 rea MCP 只读取证，每条结论标证据编号。" : "1. 只依据上面的参照物和素材分析，每条结论标证据编号。",
    "2. 按下面「回执格式」写，调用 reverse_report 交回（kind 填 report）；调不了就把整份回执贴出来。⏸ 等我回复。",
    "",
    ...BOUNDARY,
    "",
    ...reportFormat(record, n),
  ]);
}

// 开始复刻：照最近一次采纳的回执做最小版，逐项对照。
export function buildReplicaPack(record, { at = new Date().toISOString() } = {}) {
  const report = hatchOf(record).report, n = nextRound(record);
  return relay([
    `# 复刻验证 · 第 ${n} 轮：${record?.title || ""}`,
    ...headLines(record, n),
    "",
    ...(report?.caps?.length
      ? [`## 要对照的能力（第 ${report.round} 轮回执）`, ...report.caps.map((c) => `- ${c.name}${c.known ? `：${c.known}` : ""}`)]
      : ["## 要对照的能力", "照最近一次回执的能力清单逐项对照。"]),
    "", "## 做法",
    `1. 在 ${sandboxOf(record, at)} 里照回执做一个最小版，只在这个目录里改。`,
    "2. 逐项和原版对照：一致 / 有差异（差在哪）/ 未验证（为什么）。",
    "3. 按下面「复刻对照格式」写，调用 reverse_report 交回（kind 填 replica）；调不了就贴出来。⏸ 等我回复。",
    "",
    ...BOUNDARY,
    "",
    ...replicaFormat(record, n),
  ]);
}

// 写 Skill：依据回执结论、能力清单和复刻对照；只交回工作台，由用户在工作台存。
export function buildSkillPack(record) {
  const hatch = hatchOf(record), report = hatch.report, replica = hatch.replica, n = nextRound(record);
  return relay([
    `# 写 Skill · 第 ${n} 轮：${record?.title || ""}`,
    ...headLines(record, n),
    "",
    "## 依据",
    ...(report?.verdict ? [`一句话结论：${report.verdict}`] : []),
    ...(report?.caps?.length ? report.caps.map((c) => `- ${c.name}：${c.known || "（已知待补）"}${c.ev.length ? `（证据 ${c.ev.join(", ")}）` : ""}${c.miss ? ` ｜缺 ${c.miss}` : ""}`) : ["照最近一次回执。"]),
    ...(replica?.rows?.length
      ? ["", `## 复刻对照（${replica.where}）`, ...replica.rows.map((r) => `- ${r.name}：${REPLICA_RESULTS[r.result]}${r.note ? ` ｜ ${r.note}` : ""}`)]
      : ["", "还没做复刻对照：在「局限」里写明未经复刻验证。"]),
    "", "## 要求",
    "1. 按 SKILL.md 格式写：开头 YAML（name、description），正文包含用途、做法、关键证据（带证据编号）、局限。",
    "2. 调用 reverse_report 交回（kind 填 skill，text 填完整 SKILL.md 正文）；调不了就整段贴出来。⏸ 等我在工作台存。",
    "3. 只交回工作台：不要装进任何 Agent 配置，不要写进任何 skills 目录。",
  ]);
}

// 小标题里的任务编号与轮次（手动粘贴时用来核对）。
const headerOf = (label) => {
  const id = label.match(/任务编号\s*[:：]?\s*([A-Za-z0-9_-]{1,100})/)?.[1], round = label.match(/第\s*(\d{1,3})\s*轮/)?.[1];
  return { ...(id ? { taskId: id } : {}), ...(round ? { round: Number(round) } : {}) };
};
const plainLabel = (label) => label.replace(/[（(].*$/, "").trim();
const valueOf = (v) => { const t = v.trim(); return EMPTY_VALUE.test(t) ? "" : t; };
const VERDICT = /^\s*(?:[-*]\s*)?一句话结论\s*[:：]\s*(.*)$/;

function capOf(content) {
  const at = content.search(/[:：]/);
  const name = (at === -1 ? content : content.slice(0, at)).trim();
  const cap = { name, known: "", miss: "", ev: [] }, extra = [];
  for (const part of (at === -1 ? "" : content.slice(at + 1)).split(/\s*[｜|]\s*/)) {
    const m = part.match(/^(已知|证据|缺)\s*[:：]?\s*(.*)$/);
    if (!m) { if (part.trim()) extra.push(part.trim()); continue; }
    if (m[1] === "证据") {
      const ids = m[2].match(/E\d{1,4}/g) || [];
      cap.ev = [...new Set([...cap.ev, ...ids])];
      if (!ids.length && valueOf(m[2])) extra.push(`证据 ${m[2].trim()}`);
    } else cap[m[1] === "已知" ? "known" : "miss"] = valueOf(m[2]);
  }
  if (extra.length) cap.known = [cap.known, ...extra].filter(Boolean).join("；");
  return cap;
}

// 拆解回执：八格照放回的规则拆；一句话结论、能力清单、证据、下一轮建议问另外拆出。认不出的行原样留在 unplaced，不猜、不丢。
export function parseReport(raw) {
  const parsed = parseHatchReply(raw);
  const report = { verdict: "", caps: [], evidence: [], nextAsk: [] }, unplaced = [], taken = new Set();
  let header = {};
  const leftover = (label, lines) => { const t = lines.join("\n").trim(); if (t) unplaced.push({ label, text: t }); };
  const takeVerdict = (label, text) => {
    const rest = [];
    for (const line of text.split("\n")) {
      const m = !report.verdict && line.match(VERDICT);
      if (m && valueOf(m[1]) && m[1].trim().length <= HATCH_LIMITS.text) report.verdict = m[1].trim(); else rest.push(line);
    }
    leftover(label, rest);
  };
  for (const u of parsed.unplaced) {
    const name = plainLabel(u.label);
    const kind = name === "开头" ? "intro" : /^回执\s*[·・]/.test(name) ? "head" : ["一句话结论", "能力清单", "证据", "下一轮建议问"].includes(name) ? name : null;
    if (!kind || (kind !== "intro" && taken.has(kind))) { unplaced.push(u); continue; }
    taken.add(kind);
    const lines = u.text.split("\n"), rest = [];
    if (kind === "head") header = headerOf(u.label);
    if (kind === "intro" || kind === "head") { takeVerdict(u.label, u.text); continue; }
    if (kind === "一句话结论") {
      const t = u.text.trim();
      if (!report.verdict && valueOf(t) && t.length <= HATCH_LIMITS.text && !t.includes("\n")) report.verdict = t; else unplaced.push(u);
      continue;
    }
    for (const line of lines) {
      if (!line.trim()) continue;
      if (kind === "能力清单") {
        const m = line.match(ITEM), cap = m && capOf(m[1]);
        const ok = cap?.name && report.caps.length < FLOW_LIMITS.caps && cap.name.length <= HATCH_LIMITS.label && cap.known.length <= HATCH_LIMITS.text && cap.miss.length <= HATCH_LIMITS.text;
        ok ? report.caps.push(cap) : rest.push(line);
      } else if (kind === "证据") {
        const m = line.match(/^\s*(?:[-*•]\s*)?(E\d{1,4})\s*[:：.、]?\s*(.+)$/);
        const ok = m && report.evidence.length < FLOW_LIMITS.evidence && !report.evidence.some((e) => e.id === m[1]) && m[2].trim().length <= HATCH_LIMITS.text;
        ok ? report.evidence.push({ id: m[1], where: m[2].trim() }) : rest.push(line);
      } else {
        const t = valueOf(line.match(ITEM)?.[1] ?? line);
        if (!t) continue;
        t.length <= HATCH_LIMITS.text && report.nextAsk.length < FLOW_LIMITS.nextAsk ? report.nextAsk.push(t) : rest.push(line);
      }
    }
    leftover(`「${name}」里认不出的行`, rest);
  }
  return { slots: parsed.slots, missing: parsed.missing, unplaced, redactions: parsed.redactions, report, header };
}

// 复刻对照：复刻位置一行，每项能力一行「能力：一致 / 有差异 ｜ 差在哪 / 未验证 ｜ 为什么」。认不出的行留在 unplaced。
export function parseReplica(raw) {
  if (typeof raw !== "string") fail("复刻对照需为文本");
  if (raw.length > HATCH_LIMITS.reply) fail("复刻对照超过 20 万字");
  const filtered = filterRelayText(raw);
  const lines = filtered.text.replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim().split("\n");
  if (/^```/.test(lines[0] || "") && lines.length > 1 && /^```\s*$/.test(lines.at(-1))) lines.splice(-1, 1), lines.splice(0, 1);
  const rows = [], rest = [];
  let where = "", header = {};
  for (const line of lines) {
    if (!line.trim() || /^\s*```/.test(line)) continue;
    const h = line.match(/^#{1,3}\s*(.+?)\s*$/);
    if (h && /^复刻对照/.test(h[1]) && !header.taskId) { header = headerOf(h[1]); continue; }
    if (/^#{1,3}\s*复刻对照格式/.test(line)) continue;
    const w = line.match(/^\s*(?:[-*]\s*)?复刻位置\s*[:：]\s*(.+)$/);
    if (w && !where && w[1].trim().length <= HATCH_LIMITS.text) { where = w[1].trim(); continue; }
    const content = line.match(ITEM)?.[1] ?? line, at = content.search(/[:：]/);
    const name = at === -1 ? "" : content.slice(0, at).trim();
    const m = at === -1 ? null : content.slice(at + 1).trim().match(/^(一致|有差异|差异|未验证)(.*)$/);
    if (!m || !name || name.length > HATCH_LIMITS.label || rows.length >= FLOW_LIMITS.rows) { rest.push(line); continue; }
    let note = m[2].replace(/^[\s｜|：:，,、—-]+/, "").trim();
    if (/^[（(].*[）)]$/.test(note)) note = note.slice(1, -1).trim();
    if (note.length > HATCH_LIMITS.text) { rest.push(line); continue; }
    rows.push({ name, result: m[1] === "一致" ? "ok" : m[1] === "未验证" ? "no" : "diff", note });
  }
  const t = rest.join("\n").trim();
  return { where, rows, header, unplaced: t ? [{ label: "认不出的行", text: t }] : [], redactions: filtered.count };
}

// 按回执写回档案（MCP 交回的采纳和手动粘贴共用）：八格照放回结论的规则改；对应那一轮由「已发出」改成「已交回」，别的轮次不动。
// 结论、能力清单、证据、下一轮建议问写进 hatch.report；晚到的旧轮次回执不覆盖更新一轮的。
export function adoptReport(record, text, round, { at = new Date().toISOString(), overwrite = [] } = {}) {
  const rounds = record.hatch?.rounds || [];
  if (!rounds.some((x) => x.n === round)) throw Object.assign(new Error("这一轮已不在记录里"), { status: 409 });
  const parsed = parseReport(text);
  const applied = applyHatchReply(record, parsed, { at, overwrite });
  const latest = !record.hatch?.report || record.hatch.report.round <= round;
  const hatch = {
    ...applied.hatch,
    rounds: rounds.map((x) => (x.n === round && x.status === "sent" ? { ...x, status: "back", backAt: at, cells: cellsOf(applied.hatch.slots) } : x)),
    ...(latest ? { report: { round, ...parsed.report } } : {}),
  };
  return { ...applied, hatch, report: parsed.report, header: parsed.header, latest };
}

// 阶段由数据推出，不存。待过目优先（搁置中交回的也要看到），其次搁置、已收成；再看最后一轮是派出还是已交回。
export function stageOf(record, reports = []) {
  const hatch = record?.hatch, rounds = hatch?.rounds || [], last = rounds.at(-1);
  const pending = reports.filter((r) => r.recordId === record?.id && r.status === "pending").length;
  const done = (stage, next) => ({ stage, label: STAGES[stage], next, nextLabel: NEXT_STEPS[next], pending });
  if (pending) return done("review", "review");
  if (record?.heldAt) return done("held", "resume");
  if (record?.hatchSkills?.length) return done("harvested", "done");
  if (!last) return done("planned", "start");
  const late = ["replica", "skill"].includes(last.kind);
  if (last.status === "sent") return done(late ? "replica" : "sent", "wait");
  if (late || hatch.replica) return done("replica", "skill");
  return done("sent", "decide");
}

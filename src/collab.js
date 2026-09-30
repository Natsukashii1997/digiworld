// 路线 v3 切片 2.3/2.4：模板 #1 的阶段、一键派发与一键开工口令、操作留痕时间线。
// 口令只由白名单字段拼成：项目名、登记过的项目路径、入口文件名、CURRENT 协作状态表四项与推断出的阶段。
// 不接收主库、会话或其他对象；字段里疑似凭据的整段替换。工作台只生成与复制，不代替用户发送或执行。

export const STAGES = [
  { id: "claim", label: "认领" },
  { id: "implement", label: "实现" },
  { id: "review", label: "复核" },
  { id: "rework", label: "返修" },
  { id: "accept", label: "验收" },
];
export const COLLAB_AGENTS = [
  { id: "codex", label: "Codex" },
  { id: "claude-code", label: "Claude Code" },
  { id: "hermes", label: "Hermes" },
];
export const agentLabel = (id) =>
  COLLAB_AGENTS.find((a) => a.id === id)?.label || "";

// 模板 #1 建议的下一阶段与这一棒的专属验收。只是建议，谁接手、做什么由用户确认。
const NEXT = {
  claim: ["实现", "按 CURRENT 登记的范围实现；代码项目先写会失败的测试再改，按项目约定运行验证并保存结果。"],
  implement: ["复核", "独立复核：绑定被复核的文件版本；问题按“已复现缺陷 / 有证据的维护债 / 待验证建议”分三类报告。"],
  review: ["返修或验收（按复核结论：有阻断项转返修，否则交用户验收）", "按复核结论推进：阻断项逐条返修并附复现与验证，没有阻断项时整理用户验收清单。"],
  rework: ["复核", "逐条回应复核意见：已修复的附验证，不修的写明理由，其余标为待验证。"],
  accept: ["无（验收由用户完成）", "整理给用户验收的清单：看什么、怎么操作、预期结果；不替用户声称已验收。"],
};

const REDACTED = "（含疑似凭据，已省略；请到项目原文查看）";
const SECRET =
  /\b(?:sk-|ghp_|gho_|ghs_|github_pat_|xox[baprs]-|AKIA)[A-Za-z0-9_-]+|-----BEGIN[A-Z ]*-----|(?:api[_ -]?key|secret|password|passwd|token|access[_ -]?key|密钥|密码)\s*[:=：]\s*\S+/i;
// 字段里只要出现疑似凭据，整段替换，不尝试只抹掉一部分。
export function redactSecrets(value) {
  const text = String(value ?? "");
  return SECRET.test(text) ? REDACTED : text;
}
const line = (value) =>
  redactSecrets(String(value ?? "").replace(/[\x00-\x1f\x7f]+/g, " ").trim());

// 项目路径只能来自工作台登记的本地目录（看板与状态卡由服务端校验后给出）：必须是绝对路径。
function projectRoot(root) {
  if (
    typeof root !== "string" ||
    !root.startsWith("/") ||
    root.length > 2000 ||
    /[\x00-\x1f\x7f]/.test(root) ||
    root.split("/").some((part) => part === "." || part === "..")
  )
    throw new Error("项目路径无效：只能使用工作台登记过的本地目录");
  return root;
}
function agentOf(id) {
  const label = agentLabel(id);
  if (!label) throw new Error("只能选择 Codex、Claude Code 或 Hermes 这三个 Agent");
  return label;
}
function statusOf(item) {
  const current = item?.current;
  const readable = current?.state === "ok" || current?.state === "partial";
  const f = readable ? current.fields || {} : {};
  return {
    readable,
    path: line(current?.path) || "CURRENT.md",
    stateId: f.stateId ? line(f.stateId) : "",
    writer: f.writer ? line(f.writer) : "",
    next: f.next ? line(f.next) : "",
    handoffText: f.handoff?.text ? line(f.handoff.text) : "",
    handoffHref: f.handoff?.href ? line(f.handoff.href) : "",
    reason:
      current?.state === "absent"
        ? `项目里没有 ${line(current.path) || "CURRENT.md"}`
        : current?.state === "unparsed"
          ? `${line(current.path) || "CURRENT.md"} 没有协作状态表`
          : !readable
            ? "CURRENT.md 无法读取"
            : "",
  };
}

export function dispatchPrompt(item, agentId) {
  const agent = agentOf(agentId);
  const root = projectRoot(item?.root);
  const s = statusOf(item);
  const stage = item?.stage?.id && item.stage.id !== "unknown" ? item.stage : null;
  const [nextStage, stageCheck] = stage ? NEXT[stage.id] : ["未知（按 CURRENT 的唯一下一步执行）", ""];
  const files = (item?.entryFiles || []).map(line).filter(Boolean);
  const read = files.map((name, i) => `${i + 1}. ${name}`);
  if (s.handoffHref || s.handoffText)
    read.push(
      `${read.length + 1}. 最新交接：${s.handoffHref || s.handoffText}${s.handoffHref && s.handoffText ? `（${s.handoffText}）` : ""}`,
    );
  if (!read.length) read.push("项目里没有找到入口文件；先向用户确认要读的文件。");
  const input = s.readable
    ? [
        "二、输入状态",
        `- ${s.stateId ? `state_id ${s.stateId}` : "state_id：缺少此项"}`,
        `- 当前写入者：${s.writer || "缺少此项"}`,
        `- 流程阶段：${stage ? `${stage.label}（依据：${line(stage.basis)}）` : "未知"}`,
        `- 建议下一阶段：${nextStage}；由用户确认，工作台不替你决定`,
      ]
    : [
        `二、输入状态：未知（${s.reason}），接手后先向用户核对当前状态`,
        "- 流程阶段：未知",
      ];
  return [
    "【协同 · 一键派发】模板 #1 串行接力（认领 → 实现 → 复核 → 返修 → 验收）",
    `下一棒：${agent}`,
    `项目：${line(item?.name)}`,
    `项目路径：${root}`,
    "",
    "一、先读（按顺序，读完再动手）",
    ...read,
    "",
    ...input,
    "",
    `三、唯一下一步：${s.next || "未知（先读 CURRENT.md，向用户确认唯一下一步）"}`,
    "",
    "四、验收标准",
    `- 开工前记录读到的 state_id；与“输入状态”不一致时先停下报告，不接着改。`,
    `- 当前写入者不是“无”时只做只读检查，不接管；为“无”时先在 ${s.path} 登记认领并回读，再改其他文件。`,
    ...(stageCheck ? [`- ${stageCheck}`] : []),
    `- 完成后新建交接文件，更新 ${s.path}（新 state_id、最新交接、唯一下一步），回读确认。`,
    "",
    "五、禁止事项",
    "- 不读取或输出凭据、Token、私人会话或工作台主库内容。",
    "- 不替另一方声称已读、已接手或已通过。",
    "- 未经用户当轮授权，不提交、推送、安装第三方组件或使用付费服务。",
    "- 不整文件覆盖他人未完成的改动；超出本棒范围的改动先报告。",
    "",
    "六、要回交的证据",
    "- 新交接文件路径与新 state_id。",
    "- 改动文件清单及前后 SHA256。",
    "- 验证命令与首次原始结果（通过 / 失败 / 未执行）。",
    "- 未完成项、风险与唯一下一步。",
  ].join("\n");
}

export function startPrompt(item, agentId) {
  const agent = agentOf(agentId);
  const root = projectRoot(item?.root);
  const s = statusOf(item);
  return [
    `【协同 · 一键开工】开工：${agent}`,
    `项目：${line(item?.name)}`,
    `项目路径：${root}`,
    "",
    "先读（按顺序）：",
    "1. AGENTS.md（项目入口与规则；没有就跳过）",
    `2. ${s.path}（唯一当前状态；记下 state_id 与当前写入者）`,
    "",
    ...(s.stateId ? [`输入状态：state_id ${s.stateId}`] : []),
    `唯一下一步：${s.next || `未知（${s.reason || "状态表缺少此项"}；先向用户确认）`}`,
    "",
    "开工规则：当前写入者不是“无”时只做只读检查；为“无”时先在 CURRENT.md 登记认领并回读，再改其他文件。不读取凭据、私人会话或工作台主库内容；提交、推送等外部动作须用户当轮授权。",
  ].join("\n");
}

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const localDate = (iso) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// 操作留痕时间线：工作台复制记录、CURRENT 状态链、交接文档三类合并，按日期倒序；
// 同一天内依次为工作台记录（按时间）、状态链（按编号）、交接文档（按修改时间）。
export function timelineOf({ states = [], handoffs, records = [] }) {
  const events = [
    ...records.map((r) => ({
      kind: r.kind,
      order: 0,
      date: localDate(r.at),
      key: r.at,
      at: r.at,
      id: r.id,
      agent: agentLabel(r.agent),
      stateId: r.stateId || "",
      title:
        r.kind === "start"
          ? `复制开工口令给 ${agentLabel(r.agent)}`
          : `复制派发口令给 ${agentLabel(r.agent)}${r.stateId ? `（输入状态 ${r.stateId}）` : ""}`,
    })),
    ...states.map((h) => ({
      kind: "state",
      order: 1,
      date: h.date,
      key: String(h.seq).padStart(8, "0"),
      id: `state-${h.stateId}`,
      agent: h.agent,
      stateId: h.stateId,
      stage: h.stage,
      title: h.title,
    })),
    ...(handoffs?.files || []).map((f) => ({
      kind: "handoff",
      order: 2,
      date: f.date || localDate(f.modifiedAt),
      key: `${f.modifiedAt} ${f.name}`,
      at: f.modifiedAt,
      id: `handoff-${f.name}`,
      agent: f.agent,
      name: f.name,
      title: f.name,
    })),
  ];
  return events.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.order - b.order ||
      b.key.localeCompare(a.key),
  );
}

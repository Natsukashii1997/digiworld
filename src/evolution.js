// 进化回路 v1（产品定义 v1.1 §4.6；v1.2 §4.7 工作台只做薄控制面）：
// 需改进 → 生成改版任务包（口令）→ 用户交给 Agent → 粘贴回复 → 改版候选 → 并排比较 → 采用或退回。
// 这里只有纯函数：生成口令、解析用户粘贴的回复、返回新的主库对象。不调用任何 Agent 或模型。
// 字段与上限以 server/revision-candidate-schema.mjs 为准。
import { current, uid, now } from "./store.js";

// 回复里用来切分两段的标记。用全角方括号，避免被 Markdown 渲染吞掉后复制回来对不上。
export const PACKET_MARKERS = Object.freeze({
  contentStart: "【新版本正文·开始】",
  contentEnd: "【新版本正文·结束】",
  noteStart: "【改动说明·开始】",
  noteEnd: "【改动说明·结束】",
});
export const CANDIDATE_LIMITS = Object.freeze({
  candidates: 500,
  pending: 50,
  content: 1000000,
  changeNote: 5000,
  returnReason: 500,
});
// 除换行与制表符外的控制字符（回车在解析时已统一成换行）。
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/;
const TYPE_NAMES = { Prompt: "Prompt", Workflow: "工作流", Rule: "规则", Skill: "Skill" };

const day = (at) => (typeof at === "string" ? at.slice(0, 10) : "");
const versionNumber = (asset, versionId) =>
  asset.versions.findIndex((v) => v.id === versionId) + 1;

// 当前资产是否可以走改版任务包：Skill 的有效内容在文件包里，本版不支持。
export const revisable = (asset) => !!asset && !asset.archived && asset.type !== "Skill";

export function buildRevisionPacket(asset, activity = []) {
  const v = current(asset);
  const number = asset.versions.length;
  const records = activity.filter((r) => r.assetId === asset.id);
  const feedback = records
    .filter((r) => r.kind === "feedback")
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const uses = records.filter((r) => r.kind === "use" && r.versionId === v.id).length;
  const feedbackLines = feedback.length
    ? feedback.map((r) => {
        const n = versionNumber(asset, r.versionId);
        const label = n ? `v${n}.0${r.versionId === v.id ? "（当前）" : ""}` : "已不存在的版本";
        return `- ${label} · ${day(r.at)} · ${r.rating === "improve" ? "需改进" : "好用"} · 备注：${r.note?.trim() || "（无备注）"}`;
      })
    : ["- （没有反馈记录）"];
  const M = PACKET_MARKERS;
  return [
    "# 改版任务包",
    "",
    `请根据下面的反馈，为这份${TYPE_NAMES[asset.type] || "资产"}写出一个完整的新版本。只需在回复里给出结果，不要修改任何文件。`,
    "",
    "## 资产",
    `- 名称：${v.title}`,
    `- 类型：${TYPE_NAMES[asset.type] || asset.type}`,
    `- 当前版本：v${number}.0（当前版本已成功复制 ${uses} 次）`,
    ...(v.description ? [`- 说明：${v.description}`] : []),
    "",
    `## 当前版本全文（v${number}.0）`,
    "",
    "----- 当前版本全文开始 -----",
    v.content,
    "----- 当前版本全文结束 -----",
    "",
    "## 历次反馈与备注（按时间先后）",
    ...feedbackLines,
    "",
    "## 改版要求",
    "1. 针对标记为“需改进”的反馈逐条修改；标记为“好用”的部分尽量保留。",
    "2. 保持资产的用途、适用场景和名称不变，只改进内容本身。",
    "3. 新版本必须是可以直接替换当前版本的完整正文。",
    "4. 在改动说明里逐条写出改了什么、对应哪条反馈；没有采纳的反馈也写明原因。",
    "",
    "## 产出格式（严格照做，工作台按标记解析）",
    "新版本正文和改动说明各放在一对标记之间，标记单独占一行，每个标记只出现一次：",
    "",
    M.contentStart,
    "（完整新版本正文）",
    M.contentEnd,
    M.noteStart,
    "（改动说明）",
    M.noteEnd,
    "",
    "## 禁止事项",
    "- 禁止只给片段、差异或“其余不变”之类的省略；正文必须完整。",
    "- 禁止把正文放在标记之外，或把整段回复包进代码块。",
    "- 禁止编造使用次数、效果数据或反馈内容。",
    "- 禁止加入路径、链接、密钥、密码等凭据信息。",
    "- 禁止调用工具、修改文件或执行任何命令；只在回复里给出文字结果。",
  ].join("\n");
}

function check(value, label, max) {
  if (!value.trim()) throw new Error(`${label}为空`);
  if (value.length > max) throw new Error(`${label}过长（最多 ${max} 字）`);
  if (CONTROL.test(value)) throw new Error(`${label}包含控制字符`);
}
export function checkCandidateText({ content, changeNote }) {
  check(content, "新版本正文", CANDIDATE_LIMITS.content);
  check(changeNote, "改动说明", CANDIDATE_LIMITS.changeNote);
}

// 解析用户粘贴回来的 Agent 回复。所有内容都只当作文本；缺段、重复或顺序不对都明确报错，不猜测。
export function parseRevisionReply(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const M = PACKET_MARKERS;
  const at = {};
  for (const [key, marker] of Object.entries(M)) {
    const found = lines.flatMap((line, i) => (line.trim() === marker ? [i] : []));
    if (found.length > 1) throw new Error(`回复里“${marker}”重复出现，请只保留一份结果后再粘贴`);
    at[key] = found[0];
  }
  const missing = [];
  if (at.contentStart === undefined || at.contentEnd === undefined) missing.push("“新版本正文”");
  if (at.noteStart === undefined || at.noteEnd === undefined) missing.push("“改动说明”");
  if (missing.length)
    throw new Error(`回复缺少${missing.join("、")}段；请让 Agent 按任务包的产出格式重新给出`);
  const overlap =
    at.contentStart < at.noteEnd && at.noteStart < at.contentEnd;
  if (at.contentStart > at.contentEnd || at.noteStart > at.noteEnd || overlap)
    throw new Error("回复里的标记顺序不对；每段应先有“开始”再有“结束”，两段不能交叉");
  const slice = (from, to) => lines.slice(from + 1, to).join("\n");
  const content = slice(at.contentStart, at.contentEnd)
    .replace(/^(?:[ \t]*\n)+/, "")
    .replace(/\s+$/, "");
  const changeNote = slice(at.noteStart, at.noteEnd).trim();
  checkCandidateText({ content, changeNote });
  return { content, changeNote };
}

export const candidatesOf = (state, assetId) =>
  (state.revisionCandidates || []).filter((c) => c.assetId === assetId);

export function addCandidate(state, assetId, { content, changeNote }, { id = uid(), at = now() } = {}) {
  const asset = state.assets.find((a) => a.id === assetId);
  if (!asset) throw new Error("找不到该资产");
  if (asset.type === "Skill") throw new Error("Skill 的正文在文件包里，本版不支持改版候选");
  if (asset.archived) throw new Error("资产已归档，不能再生成改版候选");
  checkCandidateText({ content, changeNote });
  if (content === current(asset).content)
    throw new Error("候选正文与当前版本相同，没有可比较的改动");
  const list = state.revisionCandidates || [];
  if (list.length >= CANDIDATE_LIMITS.candidates) throw new Error("改版候选已达上限");
  if (list.filter((c) => c.status === "pending").length >= CANDIDATE_LIMITS.pending)
    throw new Error("待处理的改版候选过多，请先处理已有候选");
  const candidate = {
    schema: 1,
    id,
    assetId,
    baseVersionId: current(asset).id,
    content,
    changeNote,
    createdAt: at,
    status: "pending",
  };
  return { ...state, revisionCandidates: [...list, candidate] };
}

function pendingCandidate(state, candidateId) {
  const candidate = (state.revisionCandidates || []).find((c) => c.id === candidateId);
  if (!candidate) throw new Error("找不到该改版候选");
  if (candidate.status !== "pending") throw new Error("该改版候选已处理，不能再次决定");
  return candidate;
}
const decide = (state, candidateId, patch) => ({
  ...state,
  revisionCandidates: state.revisionCandidates.map((c) =>
    c.id === candidateId ? { ...c, ...patch } : c,
  ),
});

// 采用：在历史末尾追加一个新版本（正文取自候选，其余沿用当前版本），注明候选 ID；历史版本一字不改。
export function adoptCandidate(state, candidateId, { versionId = uid(), at = now() } = {}) {
  const candidate = pendingCandidate(state, candidateId);
  const asset = state.assets.find((a) => a.id === candidate.assetId);
  if (!asset || asset.archived) throw new Error("资产不存在或已归档");
  if (current(asset).id !== candidate.baseVersionId)
    throw new Error("当前版本已变化，候选基于旧版本，不能直接采用；可以退回后重新生成任务包");
  const { restoredFrom, candidateId: _previous, ...base } = current(asset);
  const version = { ...base, id: versionId, at, content: candidate.content, candidateId };
  return decide(
    {
      ...state,
      assets: state.assets.map((a) =>
        a.id === asset.id ? { ...a, versions: [...a.versions, version] } : a,
      ),
    },
    candidateId,
    { status: "adopted", decidedAt: at, adoptedVersionId: versionId },
  );
}

export function returnCandidate(state, candidateId, reason = "", { at = now() } = {}) {
  pendingCandidate(state, candidateId);
  const text = String(reason ?? "").trim();
  if (text.length > CANDIDATE_LIMITS.returnReason) throw new Error("退回原因最多 500 字");
  if (CONTROL.test(text)) throw new Error("退回原因包含控制字符");
  return decide(state, candidateId, {
    status: "returned",
    decidedAt: at,
    ...(text ? { returnReason: text } : {}),
  });
}

// 证据：每次采用改版，对比被替换的版本与采用生成的版本各自的复制次数和“需改进”比例。
// 只读已有记录，不估算；某版本没有反馈时比例为 null（界面显示“无反馈”）。
export function revisionEvidence(asset, activity = [], candidates = []) {
  const records = activity.filter((r) => r.assetId === asset.id);
  const stats = (index) => {
    const versionId = asset.versions[index].id;
    const own = records.filter((r) => r.versionId === versionId);
    const feedback = own.filter((r) => r.kind === "feedback");
    const improve = feedback.filter((r) => r.rating === "improve").length;
    return {
      versionId,
      number: index + 1,
      uses: own.filter((r) => r.kind === "use").length,
      feedback: feedback.length,
      improve,
      improveRatio: feedback.length ? improve / feedback.length : null,
    };
  };
  const rows = [];
  asset.versions.forEach((version, index) => {
    if (!version.candidateId || index === 0) return;
    const candidate = candidates.find((c) => c.id === version.candidateId);
    if (candidate?.status !== "adopted" || candidate.adoptedVersionId !== version.id) return;
    rows.push({
      candidateId: candidate.id,
      adoptedAt: candidate.decidedAt,
      before: stats(index - 1),
      after: stats(index),
    });
  });
  return rows;
}

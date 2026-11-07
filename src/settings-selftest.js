// 设置页开机自检：每行由现有事实源派生；读取中、读取失败都单独标出，不冒充关闭、从未使用或正常。
import { calendarPermissionLabel, latestUse, savepointThresholds } from "./settings-v16.js";

export const MARK_GLYPH = { bad: "✗", warn: "!", unknown: "?", net: "●", ok: "✓", idle: "·", loading: "…" };
const RANK = { bad: 0, warn: 1, unknown: 1, net: 2, ok: 3, idle: 4, loading: 5 };
const ANOMALY = ["failed", "unknown", "not_applied"];
const CAPS = [["vault", "Vault 写入"], ["agent", "Agent 配置"], ["model", "模型 / API"], ["daemon", "常驻服务"]];

const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;
const when = (at) => new Date(at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// 最近一次异常记录（使用失败 / 结果未知，或申请未生效）的编号；「知道了」按这个编号记住
function anomaly(id, usage, history) {
  const use = usage?.capabilities?.[id];
  const op = (history?.items || []).filter((r) => r.capability === id).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  const useBad = use && use.outcome !== "verified" ? { key: use.id, at: use.at } : null;
  const opBad = op && ANOMALY.includes(op.status) ? { key: op.operationId, at: op.at, notApplied: op.status === "not_applied" } : null;
  if (!useBad) return opBad;
  if (!opBad) return useBad;
  return Date.parse(opBad.at) > Date.parse(useBad.at) ? opBad : { ...useBad, notApplied: opBad.notApplied };
}

function capabilityRow(id, label, settings, usage, history) {
  if (!settings) return { id, label, mark: "loading", result: "读取中…" };
  if (settings.error) return { id, label, mark: "unknown", result: `授权状态读取失败 · 未知` };
  const on = settings.enabled?.[id] === true, last = latestUse(usage, id), bad = anomaly(id, usage, history);
  const result = `${on ? "已开启" : "关闭"} · ${last}${bad?.notApplied ? " · 申请未生效" : ""}`;
  if (on) return { id, label, mark: "net", result, on, capability: id };
  if (usage?.error || history?.error) return { id, label, mark: "unknown", result, capability: id };
  if (!usage || !history) return { id, label, mark: "loading", result, capability: id };
  return { id, label, mark: bad ? "warn" : "ok", result, on, capability: id, ackKey: bad?.key };
}

// downloaded：本页刚下载过恢复包（生成记录不证明文件已存到磁盘）
export function selfTestRows({ state, settings, history, calendar, usage, aihot, aihotError, storage, downloaded = false, acks = {} }) {
  const c = state.connections || {}, sources = c.knowledgeSources || [];
  const rows = [];
  // 完整备份
  if (!storage) rows.push({ id: "backup", label: "完整备份", mark: "loading", result: "读取中…" });
  else if (storage.error) rows.push({ id: "backup", label: "完整备份", mark: "unknown", result: `备份信息待核实 · ${storage.error}` });
  else {
    const b = storage.lastBackup || {}, size = storage.size?.state === "ok" ? ` · 主库 ${mb(storage.size.bytes)} / 1 GiB 上限 · ${storage.size.files.toLocaleString("en-US")} 个文件` : "";
    if (b.state === "ok") rows.push({ id: "backup", label: "完整备份", mark: "ok", result: downloaded ? "刚刚下载过恢复包 · 请确认已存到磁盘" : `${when(b.at)} 生成并校验${size}` });
    else if (b.state === "none") rows.push({ id: "backup", label: "完整备份", mark: "bad", result: `从未成功${size}` });
    else if (b.state === "pending") rows.push({ id: "backup", label: "完整备份", mark: "warn", result: `生成记录待核对${size}` });
    else rows.push({ id: "backup", label: "完整备份", mark: "unknown", result: b.reason || "备份信息未知" });
  }
  // 能力开关
  for (const [id, label] of CAPS) rows.push(capabilityRow(id, label, settings, usage, history));
  // 知识开放：任一来源开放给 Agent 或个人说明开放就算开着
  {
    const shared = sources.filter((s) => s.agentSharing).map((s) => s.name), profile = state.knowledgeZones?.profileSharing === true;
    const bad = anomaly("knowledge", usage, history), last = latestUse(usage, "knowledge");
    if (shared.length || profile) rows.push({ id: "knowledge", label: "知识开放", mark: "net", result: `已开放：${[...shared, ...(profile ? ["个人说明"] : [])].join("、")} · ${last}` });
    else if (!sources.length) rows.push({ id: "knowledge", label: "知识开放", mark: "idle", result: "尚未连接知识来源" });
    else rows.push({ id: "knowledge", label: "知识开放", mark: usage?.error || history?.error ? "unknown" : !usage || !history ? "loading" : bad ? "warn" : "ok", result: `${sources.length} 个来源与个人说明都关闭 · ${last}`, ackKey: bad?.key });
  }
  // 网络访问（AI HOT）
  if (aihotError) rows.push({ id: "aihot", label: "网络访问", mark: "unknown", result: `读取配置失败 · ${aihotError}` });
  else if (!aihot) rows.push({ id: "aihot", label: "网络访问", mark: "loading", result: "读取中…" });
  else rows.push({ id: "aihot", label: "网络访问", mark: aihot.settings.enabled ? "net" : "ok", on: aihot.settings.enabled, result: aihot.settings.enabled ? `AI HOT 已开启 · 每 ${aihot.settings.intervalHours} 小时更新` : "AI HOT 已关闭" });
  // 日历与提醒
  {
    const label = calendarPermissionLabel(calendar);
    const mark = { "读取中…": "loading", "未知": "unknown", "未接入": "idle", "已授权": "net", "部分授权": "net" }[label] || "ok";
    const result = mark === "net" ? `${label} · 写入“${calendar.calendarName || "工作台"}”日历和“${calendar.listName || "工作台"}”列表` : calendar?.error ? `未知 · ${calendar.error}` : label;
    rows.push({ id: "calendar", label: "日历与提醒", mark, result });
  }
  // 项目设置（名册只读，#71：扫描目录已下线）、资产交付
  const t = savepointThresholds(c);
  rows.push({ id: "scan", label: "项目设置", mark: "ok", result: `名册只读 · 停滞 ${c.projectStallDays || 7} 天 · 未存档 黄 ${t.warn} / 红 ${t.danger} 天` });
  rows.push(c.agentTargets?.length
    ? { id: "deliver", label: "资产交付", mark: "ok", result: `${c.agentTargets.length} 个目标` }
    : { id: "deliver", label: "资产交付", mark: "idle", result: "0 个目标" });
  // 「知道了」：只对同一条异常记录生效，新记录再亮
  for (const r of rows) if (r.mark === "warn" && r.ackKey && acks[r.id] === r.ackKey) { r.mark = "ok"; r.acked = true; }
  return rows.map((r, i) => ({ ...r, i })).sort((a, b) => RANK[a.mark] - RANK[b.mark] || a.i - b.i);
}

export function selfTestTally(rows) {
  const n = { bad: 0, warn: 0, ok: 0, loading: 0 };
  for (const r of rows) n[r.mark === "bad" ? "bad" : r.mark === "warn" || r.mark === "unknown" ? "warn" : r.mark === "loading" ? "loading" : "ok"]++;
  const verdict = n.loading ? "自检中…" : n.bad ? `还有 ${n.bad} 项要处理${n.warn ? `，${n.warn} 项要看一眼` : ""}` : n.warn ? `没有要处理的，${n.warn} 项要看一眼` : "全部正常";
  return { ...n, verdict };
}

// 「知道了」只记在本机浏览器；读写失败时当作没记住，不影响页面
const ACK_KEY = "workbench.settings.selftest.ack";
export function readAcks(storage = globalThis.localStorage) {
  try { const v = JSON.parse(storage?.getItem(ACK_KEY) || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
export function writeAck(id, key, storage = globalThis.localStorage) {
  const next = { ...readAcks(storage), [id]: key };
  try { storage?.setItem(ACK_KEY, JSON.stringify(next)); } catch { /* 记不住就下次再亮 */ }
  return next;
}

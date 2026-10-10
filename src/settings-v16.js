// 设置摘要只由各事实源派生；未加载和未接入均不冒充关闭或从未使用。
export const SETTINGS_CATEGORIES = [
  ["security", "授权与安全"],
  ["data", "数据与备份"],
  ["project", "项目与存档"],
  ["knowledge", "知识与 MCP"],
  ["calendar", "日历与提醒"],
  ["network", "资讯"],
];
export function savepointThresholds(connections) {
  return {
    warn: connections?.projectSavepointWarnDays ?? 1,
    danger: connections?.projectSavepointDangerDays ?? 3,
  };
}
export function lastCapabilityUse(result) {
  if (!result) return "读取中…";
  if (result.error) return "读取失败 · 未知";
  if (!Array.isArray(result.items)) return "未接入留痕";
  if (result.items.some((r) => r.status !== "verified"))
    return "有操作留痕 · 待核验";
  const times = result.items
    .map((r) => r.at)
    .filter((v) => Number.isFinite(Date.parse(v)))
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return times.length
    ? new Date(times[0]).toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : result.items.length
      ? "时间未知"
      : "从未使用";
}
export function latestUse(usage, id) {
  if (!usage) return "读取中…";
  if (usage.error || !usage.capabilities || !Object.hasOwn(usage.capabilities, id)) return "读取失败 · 未知";
  const row = usage.capabilities[id];
  if (!row) return "从未使用";
  if (!Number.isFinite(Date.parse(row.at))) return "读取失败 · 未知";
  const time = new Date(row.at).toLocaleString("zh-CN", { month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit" });
  return `${time} · ${row.outcome === "verified" ? "已核验" : row.outcome === "failed" ? "失败" : "结果未知"}`;
}
export function calendarPermissionLabel(value) {
  if (!value) return "读取中…";
  if (value.error) return "未知";
  if (!value.available) return "未接入";
  const a = value.access;
  if (a?.calendar === "authorized" && a?.reminders === "authorized")
    return "已授权";
  if (a?.calendar === "authorized" || a?.reminders === "authorized")
    return "部分授权";
  return "未授权";
}
export function permissionRows(state, settings, calendar, histories = {}, usage = null) {
  const sources = state.connections?.knowledgeSources || [];
  const shared =
    sources.some((s) => s.agentSharing) || state.knowledgeZones?.profileSharing;
  const capability = (id, title, scope) => ({
    id,
    title,
    scope,
    status: settings?.error
      ? "未知"
      : settings
        ? settings.enabled[id]
          ? "已开启"
          : "关闭"
        : "读取中…",
    enabled: settings?.enabled?.[id] === true,
    last: latestUse(usage, id),
    capability: id,
  });
  return [
    capability("vault", "写入 Obsidian Vault", "个人说明采纳写回"),
    {
      id: "knowledge",
      title: "知识开放给 Agent",
      scope: "知识源与个人说明 MCP · 只读",
      status: shared ? "已开启" : sources.length ? "关闭" : "未接入",
      enabled: !!shared,
      last: latestUse(usage, "knowledge"),
    },
    {
      id: "savepoints",
      title: "存档点写入",
      scope: "Git 提交与初始化 · 每次预览确认",
      status: "逐次确认",
      last: latestUse(usage, "savepoints"),
    },
    {
      id: "calendar",
      title: "日历与提醒事项",
      scope: "系统日历只读展示 · “工作台”日历和列表可写",
      status: calendarPermissionLabel(calendar),
      enabled: calendarPermissionLabel(calendar) === "已授权",
      last: latestUse(usage, "calendar"),
    },
    capability("agent", "写真实 Agent 配置", "仅明确管理的目标与受控字段"),
    capability("model", "模型 / API 连接", "本机钥匙串凭据与按次请求"),
    capability("daemon", "常驻服务", "本机用户服务 · 运行状态独立核验"),
  ];
}

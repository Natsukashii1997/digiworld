// 知识仓库三区视图（路线 v3 切片 3.2，产品定义 v1.2 §4.4，D32）：按文件夹前缀规则把 Vault 中的
// Markdown 划入输入区、我的知识、个人说明。只是视图：不移动、不改写任何 Vault 文件。
// 前后端共用；规则本身存主库 knowledgeZones.rules。

export const ZONES = [
  { id: "input", label: "输入区", hint: "订阅、剪藏、导入资料；可检索，不当作权威" },
  { id: "mine", label: "我的知识", hint: "决定、方法、项目经验、知识编译；优先引用" },
  { id: "profile", label: "个人说明", hint: "“个人上下文”文件夹；每次会话的背景" },
];
export const zoneLabel = (id) => ZONES.find((z) => z.id === id)?.label || id;
// 未命中任何规则的文件归入“我的知识”。
export const FALLBACK_ZONE = "mine";
export const DEFAULT_ZONE_RULES = Object.freeze([
  Object.freeze({ pattern: "GET NOTES/**", zone: "input" }),
  Object.freeze({ pattern: "个人上下文/**", zone: "profile" }),
]);
export const ZONE_LIMITS = Object.freeze({ rules: 20, pattern: 200 });

function reject(message) {
  throw Object.assign(new Error(message), { status: 400 });
}
const CONTROL = /[\x00-\x1f\x7f]/;
// 规则只支持“文件夹/**”：文件夹为 Vault 内相对路径，逐段不能为空、不能是 . 或 ..，不含通配符。
export function folderOf(pattern) {
  if (
    typeof pattern !== "string" ||
    pattern.length > ZONE_LIMITS.pattern ||
    pattern !== pattern.trim() ||
    !pattern.endsWith("/**") ||
    CONTROL.test(pattern) ||
    /[\\:]/.test(pattern)
  )
    reject("规则格式应为“文件夹/**”，文件夹是 Vault 内的相对路径");
  const folder = pattern.slice(0, -3);
  const parts = folder.split("/");
  if (
    !folder ||
    folder.startsWith("/") ||
    parts.some((part) => !part || part === "." || part === ".." || part.includes("*") || part !== part.trim())
  )
    reject("规则里的文件夹不能为空、越出 Vault 或包含通配符");
  return folder;
}
export function validateZoneRules(rules) {
  if (!Array.isArray(rules) || rules.length > ZONE_LIMITS.rules)
    reject(`划分规则最多 ${ZONE_LIMITS.rules} 条`);
  const seen = new Set();
  return rules.map((rule) => {
    if (
      !rule ||
      typeof rule !== "object" ||
      Array.isArray(rule) ||
      Object.keys(rule).length !== 2 ||
      !Object.hasOwn(rule, "pattern") ||
      !Object.hasOwn(rule, "zone")
    )
      reject("每条规则只包含文件夹与归入的分区");
    folderOf(rule.pattern);
    if (!ZONES.some((z) => z.id === rule.zone)) reject("规则归入的分区无效");
    if (seen.has(rule.pattern)) reject("同一文件夹不能重复设置规则");
    seen.add(rule.pattern);
    return { pattern: rule.pattern, zone: rule.zone };
  });
}
// 第一条命中的规则生效；按整段文件夹匹配（“个人上下文副本/”不属于“个人上下文/”）。
export function zoneOf(path, rules) {
  for (const rule of rules)
    if (path.startsWith(rule.pattern.slice(0, -2))) return rule.zone;
  return FALLBACK_ZONE;
}
export const profileFolders = (rules) =>
  rules.filter((r) => r.zone === "profile").map((r) => r.pattern.slice(0, -3));

// 知识源重叠判定（前后端共用，服务端开放个人说明前也按这里拦截）：
// 同一飞书空间，或本机目录互相包含（不区分大小写，按 NFC 归一）。
export const foldedPath = (value) => value.normalize("NFC").toLowerCase();
export const inside = (path, root) =>
  foldedPath(path) === foldedPath(root) || foldedPath(path).startsWith(foldedPath(root) + "/");
const spaceOf = (source) => source?.kind === "feishu"
  ? source.feishuSpaceId || /^feishu:\/\/space\/([0-9]{1,30})$/.exec(source.root)?.[1]
  : null;
export const sourcesOverlap = (a, b) => {
  const aSpace = spaceOf(a), bSpace = spaceOf(b);
  if (aSpace && bSpace) return aSpace === bSpace;
  return inside(a.root, b.root) || inside(b.root, a.root);
};
// 与 source 重叠、目录身份变化后还没重新确认的知识源；非空时不能开放个人说明。
export function pendingReconfirmFor(state, source) {
  if (!source) return [];
  const sources = state?.connections?.knowledgeSources || [];
  return (state?.connections?.knowledgeSourceHealth || [])
    .filter((h) => h.status === "needs_reconfirmation")
    .map((h) => sources.find((s) => s.id === h.sourceId))
    .filter((pending) => pending && sourcesOverlap(source, pending));
}

// 本周：本机时区周一 00:00 起。
export function weekStart(now) {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day.getTime();
}
// 只看扫描得到的路径与修改时间。仅凭修改时间无法区分“新增”与“更新”，所以统计的是二者之和。
export function zoneStats(files, rules, now) {
  const start = weekStart(now);
  const zones = Object.fromEntries(ZONES.map((z) => [z.id, { total: 0, changedThisWeek: 0 }]));
  const listed = files.map(({ path, modifiedAt }) => {
    const zone = zoneOf(path, rules);
    const time = Date.parse(modifiedAt);
    const changedThisWeek = Number.isFinite(time) && time >= start;
    zones[zone].total++;
    if (changedThisWeek) zones[zone].changedThisWeek++;
    return { path, modifiedAt, zone, changedThisWeek };
  });
  return { weekStart: new Date(start).toISOString(), zones, files: listed };
}

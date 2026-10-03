// AI HOT（路线 v3 切片 5.3，产品定义 v1.2 §4.8，问题共识基线 D34）：aihot.news 公开只读接口的本机拉取与缓存。
// - 接口返回一律当作不可信文本：只取标题、摘要、链接、来源、时间五个白名单字段，截断长度，链接只允许 http/https。
// - 缓存与设置是数据目录下的 JSON（aihot/cache.json、aihot/settings.json），有大小上限；不进主库、不进备份。
// - 拉取失败保留上次缓存，标注失败与上次成功时间；网络访问可关闭；首次拉取须由页面上的“开始拉取”确认后才发生。
// 接口字段名未在本机实测（云端不放行 aihot.news），下面按常见写法做了宽松映射，映射不上的条目被丢弃。
import { mkdir, open, readFile, rename, lstat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export const AIHOT_BASE = "https://aihot.news/api/v1/";
export const AIHOT_LIMITS = {
  title: 200,
  summary: 600,
  source: 80,
  url: 2000,
  items: 50,
  cacheBytes: 512 * 1024,
  responseBytes: 2 * 1024 * 1024,
  timeoutMs: 15000,
};
export const SECTIONS = { selected: "精选", hot: "热点", daily: "日报" };
const DEFAULT_SETTINGS = { enabled: true, intervalHours: 3, acknowledgedAt: "" };
const HOUR = 60 * 60 * 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const own = (o, k) => Object.hasOwn(o, k);

// 删除控制字符，换行与连续空白折叠为一个空格，按字符截断（不截断代理对）。
export function cleanText(value, max) {
  if (typeof value !== "string") return "";
  const chars = [
    ...value
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
      .replace(/[\s\u2028\u2029]+/g, " ")
      .trim(),
  ];
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : chars.join("");
}
export function cleanUrl(value) {
  if (typeof value !== "string" || value.length > AIHOT_LIMITS.url) return "";
  const raw = value.trim();
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !url.hostname) return "";
    return url.href.length > AIHOT_LIMITS.url ? "" : url.href;
  } catch {
    return "";
  }
}
function cleanDate(value) {
  let ms = NaN;
  if (typeof value === "number" && Number.isFinite(value)) ms = value < 1e11 ? value * 1000 : value;
  else if (typeof value === "string" && value.length <= 40) ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d.toISOString() : "";
}
const pick = (o, names) => {
  for (const n of names) if (own(o, n) && o[n] !== undefined && o[n] !== null) return o[n];
  return undefined;
};
function sourceOf(o) {
  const v = pick(o, ["source", "source_name", "sourceName", "site", "author", "publisher"]);
  if (typeof v === "string") return v;
  if (isObject(v)) return typeof v.name === "string" ? v.name : typeof v.title === "string" ? v.title : "";
  return "";
}

// 单条清洗：返回只含白名单字段的新对象；没有文本标题的条目返回 null。
export function sanitizeItem(raw) {
  if (!isObject(raw)) return null;
  const title = pick(raw, ["title", "name", "headline"]);
  if (typeof title !== "string") return null;
  const cleanTitle = cleanText(title, AIHOT_LIMITS.title);
  if (!cleanTitle) return null;
  const summary = pick(raw, ["summary", "description", "excerpt", "ai_summary", "aiSummary", "digest", "content"]);
  const url = pick(raw, ["url", "link", "source_url", "sourceUrl", "original_url", "originalUrl", "href", "permalink"]);
  const at = pick(raw, ["published_at", "publishedAt", "time", "created_at", "createdAt", "date", "pub_date"]);
  return {
    title: cleanTitle,
    summary: cleanText(typeof summary === "string" ? summary : "", AIHOT_LIMITS.summary),
    url: cleanUrl(url),
    source: cleanText(sourceOf(raw), AIHOT_LIMITS.source),
    publishedAt: cleanDate(at),
  };
}

// 在常见的外层结构里找条目数组（最多下探 3 层）；分节结构（sections[].items）展开拼接。
const LIST_KEYS = ["items", "data", "list", "topics", "results", "entries", "news", "records"];
function findItems(payload, depth = 0) {
  if (Array.isArray(payload)) {
    const nested = payload.filter((v) => isObject(v) && Array.isArray(v.items));
    if (nested.length && nested.length === payload.filter(isObject).length)
      return nested.flatMap((v) => v.items);
    return payload;
  }
  if (!isObject(payload) || depth > 3) return [];
  if (Array.isArray(payload.sections)) return findItems(payload.sections, depth + 1);
  for (const key of LIST_KEYS)
    if (own(payload, key)) {
      const found = findItems(payload[key], depth + 1);
      if (found.length) return found;
    }
  return [];
}
export function sanitizeList(payload) {
  const out = [],
    seen = new Set();
  for (const raw of findItems(payload)) {
    const item = sanitizeItem(raw);
    if (!item) continue;
    const key = item.url || `t:${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= AIHOT_LIMITS.items) break;
  }
  return out;
}
function dailyDate(payload) {
  const list = findItems(payload);
  const first = list.find(isObject) || (isObject(payload) ? payload : null);
  const date = first && pick(first, ["date", "day", "id"]);
  return typeof date === "string" && DATE.test(date) ? date : "";
}

const emptySection = () => ({ fetchedAt: "", items: [] });
const emptyCache = () => ({
  schema: 1,
  status: "never",
  lastAttemptAt: "",
  lastSuccessAt: "",
  error: "",
  sections: { selected: emptySection(), hot: emptySection(), daily: { ...emptySection(), date: "" } },
});
// 从磁盘读回的缓存同样当作不可信：重新走一遍白名单。
function sanitizeCache(raw) {
  const c = emptyCache();
  if (!isObject(raw)) return c;
  if (["ok", "failed", "never"].includes(raw.status)) c.status = raw.status;
  for (const k of ["lastAttemptAt", "lastSuccessAt"]) c[k] = cleanDate(raw[k]);
  c.error = cleanText(raw.error, 300);
  const sections = isObject(raw.sections) ? raw.sections : {};
  for (const key of Object.keys(SECTIONS)) {
    const s = isObject(sections[key]) ? sections[key] : {};
    c.sections[key].fetchedAt = cleanDate(s.fetchedAt);
    c.sections[key].items = Array.isArray(s.items) ? sanitizeList(s.items) : [];
  }
  const date = sections.daily?.date;
  c.sections.daily.date = typeof date === "string" && DATE.test(date) ? date : "";
  return c;
}
// 超过大小上限时，从最长的分区末尾逐条舍去，直到能写入。
function fitCache(cache) {
  let raw = JSON.stringify(cache);
  while (Buffer.byteLength(raw) > AIHOT_LIMITS.cacheBytes) {
    const longest = Object.values(cache.sections).sort((a, b) => b.items.length - a.items.length)[0];
    if (!longest.items.length) break;
    longest.items.pop();
    raw = JSON.stringify(cache);
  }
  return raw;
}

export function validateSettings(input) {
  if (!isObject(input) || Object.keys(input).some((k) => !["enabled", "intervalHours"].includes(k)))
    throw fail("AI HOT 设置格式无效");
  if (typeof input.enabled !== "boolean") throw fail("AI HOT 设置：网络开关必须是开或关");
  if (!Number.isInteger(input.intervalHours) || input.intervalHours < 1 || input.intervalHours > 24)
    throw fail("AI HOT 设置：拉取间隔须为 1–24 小时的整数");
  return { enabled: input.enabled, intervalHours: input.intervalHours };
}

async function atomicWrite(dir, name, content) {
  const tmp = join(dir, `.${name}-${randomUUID()}.tmp`);
  const file = await open(tmp, "wx", 0o600);
  try {
    await file.writeFile(content);
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(tmp, join(dir, name));
}

export function createAiHot({ directory, fetch: fetchImpl = globalThis.fetch, clock = Date.now } = {}) {
  const dir = join(directory, "aihot");
  const now = () => new Date(clock());
  let inflight = null,
    timer = null,
    queue = Promise.resolve();
  // 同一进程内对缓存与设置文件的读改写串行执行。
  const serial = (op) => {
    const result = queue.then(op);
    queue = result.catch(() => {});
    return result;
  };
  async function ensureDir() {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    if ((await lstat(dir)).isSymbolicLink()) throw fail("AI HOT 缓存目录不能是符号链接", 503);
  }
  async function readJson(name, limit) {
    try {
      const path = join(dir, name);
      const info = await lstat(path);
      if (!info.isFile()) return { error: "文件类型异常" };
      if (info.size > limit) return { error: "超过大小上限" };
      return { value: JSON.parse(await readFile(path, "utf8")) };
    } catch (error) {
      if (error.code === "ENOENT") return {};
      return { error: "无法解析" };
    }
  }
  async function readSettings() {
    const { value } = await readJson("settings.json", 4096);
    const s = { ...DEFAULT_SETTINGS };
    if (isObject(value)) {
      if (typeof value.enabled === "boolean") s.enabled = value.enabled;
      if (Number.isInteger(value.intervalHours) && value.intervalHours >= 1 && value.intervalHours <= 24)
        s.intervalHours = value.intervalHours;
      s.acknowledgedAt = cleanDate(value.acknowledgedAt);
    }
    return s;
  }
  async function readCache() {
    const { value, error } = await readJson("cache.json", AIHOT_LIMITS.cacheBytes);
    if (error) return { ...emptyCache(), error: `本机缓存${error}，已忽略` };
    return sanitizeCache(value);
  }
  const publicSettings = (s) => ({ enabled: s.enabled, intervalHours: s.intervalHours, acknowledged: !!s.acknowledgedAt });
  async function status() {
    const [settings, cache] = await Promise.all([readSettings(), readCache()]);
    return { settings: publicSettings(settings), cache, host: "aihot.news" };
  }

  async function getJson(path) {
    const response = await fetchImpl(AIHOT_BASE + path, {
      method: "GET",
      redirect: "error",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(AIHOT_LIMITS.timeoutMs),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > AIHOT_LIMITS.responseBytes) throw new Error("响应过大");
    const text = await response.text();
    if (Buffer.byteLength(text) > AIHOT_LIMITS.responseBytes) throw new Error("响应过大");
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("不是有效 JSON");
    }
  }
  const loaders = {
    selected: async () => ({ items: sanitizeList(await getJson("items?mode=selected&window=24h")) }),
    hot: async () => ({ items: sanitizeList(await getJson("hot-topics")) }),
    daily: async () => {
      const date = dailyDate(await getJson("dailies?limit=1"));
      if (!date) throw new Error("没有可用的日报日期");
      return { date, items: sanitizeList(await getJson(`dailies/${date}`)) };
    },
  };

  async function run() {
    await ensureDir();
    const settings = await readSettings();
    if (!settings.enabled) throw fail("AI HOT 网络访问已关闭，可在模型设置中开启", 409);
    const at = now().toISOString();
    if (!settings.acknowledgedAt)
      await atomicWrite(dir, "settings.json", JSON.stringify({ ...settings, acknowledgedAt: at }));
    // 逐个分区顺序请求：一次最多 4 个 GET，失败的分区保留旧内容。
    const cache = await readCache();
    const failed = [];
    for (const key of Object.keys(SECTIONS)) {
      try {
        const result = await loaders[key]();
        cache.sections[key] = { ...cache.sections[key], ...result, fetchedAt: at };
      } catch (error) {
        failed.push(`${SECTIONS[key]}（${cleanText(error?.message || "未知错误", 60)}）`);
      }
    }
    cache.lastAttemptAt = at;
    if (failed.length) {
      cache.status = "failed";
      cache.error = `拉取失败：${failed.join("、")}；已保留上次内容`;
    } else {
      cache.status = "ok";
      cache.error = "";
      cache.lastSuccessAt = at;
    }
    await atomicWrite(dir, "cache.json", fitCache(cache));
    return status();
  }
  function refresh() {
    if (!inflight) inflight = serial(run).finally(() => (inflight = null));
    return inflight;
  }
  async function tick() {
    const settings = await readSettings();
    if (!settings.enabled || !settings.acknowledgedAt || inflight) return;
    const cache = await readCache();
    const last = Date.parse(cache.lastAttemptAt);
    if (Number.isFinite(last) && now().getTime() - last < settings.intervalHours * HOUR) return;
    await refresh().catch(() => {});
  }
  return {
    status,
    refresh,
    tick,
    saveSettings(input) {
      return serial(async () => {
        const next = validateSettings(input);
        await ensureDir();
        const current = await readSettings();
        await atomicWrite(dir, "settings.json", JSON.stringify({ ...current, ...next }));
        return status();
      });
    },
    // 每分钟检查一次是否到了拉取间隔；定时器不阻止进程退出。
    start() {
      if (timer) return;
      timer = setInterval(() => tick().catch(() => {}), 60 * 1000);
      timer.unref?.();
      tick().catch(() => {});
    },
    close() {
      clearInterval(timer);
      timer = null;
    },
  };
}

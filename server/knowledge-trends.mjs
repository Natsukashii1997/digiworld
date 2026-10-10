import { ZONES, zoneOf, DEFAULT_ZONE_RULES } from "../src/knowledge-zones.js";
import { createKnowledgeWriteJournal } from "./knowledge-write-journal.mjs";
import { failure } from "./repository.mjs";

const key = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const day = (date,offset=0) => new Date(date.getFullYear(),date.getMonth(),date.getDate()+offset);
const validTime = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));

// 有限的本机记录视图，不从 Vault mtime、快照数量或页面打开时间推断历史。
// written = 有 applied 回执且未进入撤回的写入；organized = 收到的整理版本数。
export function buildKnowledgeTrend({ source, rules, tasks = [], records = [], journalAvailable = true, now }) {
  const instant = new Date(now), first = day(instant,-6), last = day(instant,1);
  const keys = Array.from({length:7},(_,i) => key(day(first,i)));
  const buckets = Object.fromEntries(ZONES.map(({id}) => [id,new Map(keys.map((date) => [date,{ written:0,organized:0 }]))]));
  const knownStarts = [];
  function remember(at) { if (validTime(at) && Date.parse(at) <= +instant) knownStarts.push(Date.parse(at)); }
  function count(zone,at,field) {
    if (!validTime(at) || Date.parse(at) > +instant) return;
    const row = buckets[zone]?.get(key(new Date(at)));
    if (row) row[field]++;
  }
  for (const task of tasks) {
    const evidence = task.evidence.filter((item) => item.sourceId === source.id && item.root === source.root);
    if (!evidence.length) continue;
    remember(task.createdAt);
    const zones = new Set(evidence.map((item) => zoneOf(item.path,rules)));
    for (const version of task.candidates) {
      remember(version.receivedAt);
      for (const zone of zones) count(zone,version.receivedAt,"organized");
    }
  }
  for (const item of records) {
    const { row,applied,rollbackStarted,rolledBack } = item;
    if (row.source.id !== source.id || row.source.root !== source.root) continue;
    remember(row.createdAt);
    if (applied) remember(applied.at);
    if (applied && !rollbackStarted && !rolledBack) count(zoneOf(row.path,rules),applied.at,"written");
  }
  const availableSince = knownStarts.length ? key(new Date(Math.min(...knownStarts))) : null;
  return {
    at:instant.toISOString(),sourceId:source.id,start:first.toISOString(),end:last.toISOString(),availableSince,
    state:journalAvailable ? "ok" : "partial",
    meaning:"本机留存记录：已确认且未撤回的写入 / 收到的整理版本；不是 Vault 全量编辑历史。",
    zones:Object.fromEntries(ZONES.map(({id}) => [id,keys.map((date) => {
      const row = buckets[id].get(date), recorded = availableSince && date >= availableSince;
      const status = !journalAvailable ? "unknown" : recorded ? "recorded" : "unrecorded";
      return { date,status,
        written:status === "recorded" ? row.written : null,
        organized:recorded ? row.organized : null,
        total:status === "recorded" ? row.written + row.organized : null,
      };
    })])),
  };
}

export function createKnowledgeTrends(repository, {
  clock = Date.now, journal = createKnowledgeWriteJournal(repository.directory),
} = {}) {
  return {
    async inspect(input = {}) {
      if (!input || typeof input !== "object" || Array.isArray(input) ||
          Object.keys(input).some((key) => key !== "sourceId") ||
          (Object.hasOwn(input,"sourceId") && typeof input.sourceId !== "string"))
        throw failure("趋势查询字段无效");
      const state = await repository.read(), sources = state?.connections?.knowledgeSources || [];
      const chosen = input.sourceId || state?.knowledgeZones?.sourceId;
      const source = chosen ? sources.find((item) => item.id === chosen)
        : sources.find((item) => item.kind === "obsidian") || sources[0];
      if (!source) return { state:"unavailable",reason:"尚未连接知识源；趋势待接入数据",sourceId:null };
      let records = [], journalAvailable = true;
      try { records = await journal.list(); }
      catch { journalAvailable = false; }
      return buildKnowledgeTrend({ source,rules:state.knowledgeZones?.rules || DEFAULT_ZONE_RULES,
        tasks:state.knowledgeTasks || [],records,journalAvailable,now:clock() });
    },
  };
}

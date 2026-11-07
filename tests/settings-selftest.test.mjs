import test from "node:test";
import assert from "node:assert/strict";
import { selfTestRows, selfTestTally, readAcks, writeAck } from "../src/settings-selftest.js";

// 形状照 10-24 正式环境只读读数（数值合成）：备份从未成功、常驻服务申请未生效且使用结果未知、知识读取失败、日历已授权、AI HOT 开着
const state = {
  connections: { roots: ["/fixture/a", "/fixture/b"], knowledgeSources: [{ id: "s1", name: "Obsidian知识库", agentSharing: false }, { id: "s2", name: "常浩的知识库", agentSharing: false }] },
  knowledgeZones: { profileSharing: false },
};
const live = {
  state,
  settings: { enabled: { model: false, agent: false, vault: false, daemon: false } },
  history: { items: [{ operationId: "op-daemon", capability: "daemon", kind: "apply", at: "2026-10-08T08:36:06.806Z", status: "not_applied" }] },
  calendar: { available: true, access: { calendar: "authorized", reminders: "authorized" }, calendarName: "工作台", listName: "工作台" },
  usage: { capabilities: { vault: null, agent: null, model: null, calendar: { id: "u-cal", at: "2026-10-20T09:36:28.810Z", outcome: "verified" },
    daemon: { id: "u-daemon", at: "2026-10-08T08:36:22.527Z", outcome: "unknown" }, knowledge: { id: "u-know", at: "2026-10-23T15:38:23.791Z", outcome: "failed" } } },
  aihot: { settings: { enabled: true, intervalHours: 3 } },
  storage: { size: { state: "ok", bytes: 805320961, files: 2765 }, lastBackup: { state: "none", pending: 0 } },
};
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));

test("自检：问题排最上，标记由事实源派生", () => {
  const rows = selfTestRows(live);
  assert.deepEqual(rows.map((r) => `${r.mark}:${r.id}`), ["bad:backup", "warn:daemon", "warn:knowledge", "net:aihot", "net:calendar", "ok:vault", "ok:agent", "ok:model", "ok:scan", "idle:deliver"]);
  const r = byId(rows);
  assert.match(r.backup.result, /^从未成功 · 主库 805\.3 MB \/ 1 GiB 上限 · 2,765 个文件$/);
  assert.match(r.daemon.result, /^关闭 · .+ · 结果未知 · 申请未生效$/);
  assert.equal(r.daemon.ackKey, "u-daemon", "使用记录比申请记录新，按使用记录编号记住");
  assert.match(r.knowledge.result, /^2 个来源与个人说明都关闭 · .+ · 失败$/);
  assert.equal(r.aihot.result, "AI HOT 已开启 · 每 3 小时更新");
  assert.equal(r.calendar.result, "已授权 · 写入“工作台”日历和“工作台”列表");
  assert.equal(r.vault.result, "关闭 · 从未使用");
  assert.equal(r.scan.result, "名册只读 · 停滞 7 天 · 未存档 黄 1 / 红 3 天");
  const t = selfTestTally(rows);
  assert.deepEqual([t.bad, t.warn, t.ok], [1, 2, 7]);
  assert.equal(t.verdict, "还有 1 项要处理，2 项要看一眼");
});

test("自检：读取中、读取失败不冒充关闭或正常", () => {
  let rows = byId(selfTestRows({ state }));
  for (const id of ["backup", "daemon", "vault", "aihot", "calendar"]) assert.equal(rows[id].mark, "loading", id);
  assert.equal(selfTestTally(Object.values(rows)).verdict, "自检中…");
  rows = byId(selfTestRows({ ...live, settings: { error: "x" }, usage: { error: "x" }, calendar: { error: "x" }, aihot: null, aihotError: "离线", storage: { error: "离线" } }));
  for (const id of ["backup", "vault", "daemon", "calendar", "aihot", "knowledge"]) assert.equal(rows[id].mark, "unknown", id);
  assert.notEqual(selfTestTally(Object.values(rows)).verdict, "全部正常");
});

test("自检：开着的外部访问标青，有成功备份标绿", () => {
  const rows = byId(selfTestRows({ ...live, settings: { enabled: { vault: true } }, storage: { size: live.storage.size, lastBackup: { state: "ok", at: "2026-10-24T02:00:00Z" } },
    state: { ...state, knowledgeZones: { profileSharing: true } } }));
  assert.equal(rows.vault.mark, "net");
  assert.match(rows.vault.result, /^已开启 · /);
  assert.equal(rows.backup.mark, "ok");
  assert.equal(rows.knowledge.mark, "net");
  assert.match(rows.knowledge.result, /^已开放：个人说明 · /);
});

test("「知道了」只对同一条异常记录生效，新记录再亮", () => {
  const mem = new Map(), storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const acks = writeAck("daemon", "u-daemon", storage);
  assert.deepEqual(readAcks(storage), { daemon: "u-daemon" });
  assert.equal(byId(selfTestRows({ ...live, acks })).daemon.mark, "ok");
  const newer = { ...live.usage, capabilities: { ...live.usage.capabilities, daemon: { id: "u-daemon-2", at: "2026-10-24T01:00:00Z", outcome: "failed" } } };
  assert.equal(byId(selfTestRows({ ...live, usage: newer, acks })).daemon.mark, "warn");
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.deepEqual(readAcks(broken), {});
  assert.deepEqual(writeAck("daemon", "x", broken), { daemon: "x" }, "写失败不抛错");
});

test("自检：申请记录读取失败标 [?]，使用记录还在读标读取中；能力同级按 Vault / Agent / 模型 / 常驻；下载后提示确认存盘", () => {
  let rows = byId(selfTestRows({ ...live, history: { error: "离线" } }));
  for (const id of ["vault", "agent", "model", "daemon", "knowledge"]) assert.equal(rows[id].mark, "unknown", id);
  rows = byId(selfTestRows({ ...live, usage: null }));
  for (const id of ["vault", "daemon", "knowledge"]) assert.equal(rows[id].mark, "loading", id);
  assert.equal(selfTestTally(Object.values(rows)).verdict, "自检中…");
  const calm = selfTestRows({ ...live, history: { items: [] }, usage: { capabilities: {} } });
  assert.deepEqual(calm.filter((r) => r.mark === "ok" && ["vault", "agent", "model", "daemon"].includes(r.id)).map((r) => r.id), ["vault", "agent", "model", "daemon"]);
  const saved = { size: live.storage.size, lastBackup: { state: "ok", at: "2026-10-24T02:00:00Z" } };
  assert.equal(byId(selfTestRows({ ...live, storage: saved, downloaded: true })).backup.result, "刚刚下载过恢复包 · 请确认已存到磁盘");
});

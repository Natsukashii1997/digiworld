// 路线 v3 5.5 银饰计划 + 4.3 智能体角色卡（云端提前开发，分支 silver-agents）：
// 主库 silver / agentRoles 两个集合的严格校验、备份合并、图片文件引用与路径校验、
// 抠图器的平台检测与失败回退（Vision 部分用桩，需本机验证）、派活推荐的关键词匹配。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, symlink, mkdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRepository } from "../server/repository.mjs";
import { validateState } from "../server/schema.mjs";
import { mergeBackup } from "../server/merge.mjs";
import { SILVER_LIMITS } from "../server/silver-schema.mjs";
import { createCutout, CUTOUT_SCRIPT } from "../server/silver-cutout.mjs";
import { createSilverImages, sniffImage } from "../server/silver.mjs";
import { startServer } from "../server/http.mjs";
import { parse, stringify } from "../src/serialization.js";
import { seed } from "../src/store.js";
import {
  ROLE_AGENTS,
  rolesOf,
  recommendAgents,
  inferProjects,
  parseList,
} from "../src/agent-roles.js";
import { cellsOf, silverOf } from "../src/silver.js";

const AT = "2026-09-30T08:00:00.000Z";
const HEX = "a".repeat(64);
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (n = 32) => new Uint8Array([...PNG_MAGIC, ...Array(n).fill(7)]);
const jpg = (n = 32) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array(n).fill(3)]);
const webp = (n = 32) =>
  new Uint8Array([
    ...Buffer.from("RIFF"),
    40, 0, 0, 0,
    ...Buffer.from("WEBP"),
    ...Buffer.from("VP8 "),
    ...Array(n).fill(1),
  ]);

const wall = (id, extra = {}) => ({
  id,
  image: `${HEX}.jpg`,
  author: "某设计师",
  source: "小红书",
  note: "",
  createdAt: AT,
  ...extra,
});
const category = (id, name, target, extra = {}) => ({
  id,
  name,
  target,
  createdAt: AT,
  ...extra,
});
const item = (id, categoryId, extra = {}) => ({
  id,
  categoryId,
  image: `${HEX}.png`,
  name: "月光项链",
  createdAt: AT,
  ...extra,
});
const silver = (extra = {}) => ({
  wall: [wall("w1")],
  categories: [category("c1", "项链", 3), category("c2", "戒指", 2)],
  items: [item("i1", "c1")],
  ...extra,
});
const withSilver = (s) => ({ ...seed(), silver: s });
const role = (agentId, extra = {}) => ({
  agentId,
  strengths: ["重构", "测试"],
  cost: "medium",
  projects: [],
  note: "",
  updatedAt: AT,
  ...extra,
});
const rejects = (state, pattern = /数据校验失败/) =>
  assert.throws(() => validateState(state), pattern);

async function tempDir(t, prefix = "guiji-silver-") {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

// ---------- schema ----------

test("银饰与角色卡：旧库缺少 silver、agentRoles 按空处理，不写迁移", () => {
  const old = seed();
  assert.equal("silver" in old, false);
  assert.equal("agentRoles" in old, false);
  const checked = validateState(structuredClone(old));
  assert.equal("silver" in checked, false);
  assert.equal("agentRoles" in checked, false);
  assert.deepEqual(silverOf(old), { wall: [], categories: [], items: [] });
});

test("银饰：合法的欣赏墙、品类与已填格通过校验", () => {
  const s = silver({
    wall: [
      wall("w1", { sourceUrl: "https://example.com/a", note: "第一行\n第二行" }),
      wall("w2", { author: "", source: "", deletedAt: AT, image: `${"b".repeat(64)}.webp` }),
    ],
    items: [
      item("i1", "c1", {
        silhouette: `${"c".repeat(64)}.png`,
        silhouetteSource: "auto",
        boughtAt: "2026-09-01",
        price: 399.5,
        note: "生日",
        updatedAt: AT,
      }),
      item("i2", "c2", { image: `${"d".repeat(64)}.jpg`, deletedAt: AT }),
    ],
  });
  assert.doesNotThrow(() => validateState(withSilver(s)));
});

test("银饰：非法字段、文件引用、数量与格式一律拒绝", () => {
  const bad = [
    silver({ extra: [] }),
    silver({ wall: [wall("w1", { url: "x" })] }),
    silver({ wall: [wall("w1", { image: "../../etc/passwd" })] }),
    silver({ wall: [wall("w1", { image: `${HEX}.gif` })] }),
    silver({ wall: [wall("w1", { image: `${HEX.toUpperCase()}.png` })] }),
    silver({ wall: [wall("w1", { image: `/tmp/${HEX}.png` })] }),
    silver({ wall: [wall("w1", { sourceUrl: "javascript:alert(1)" })] }),
    silver({ wall: [wall("w1", { author: "x".repeat(101) })] }),
    silver({ wall: [wall("w1", { note: "a\u0007b" })] }),
    silver({ wall: [wall("w1"), wall("w1")] }),
    silver({ categories: [category("c1", "", 3)], items: [] }),
    silver({ categories: [category("c1", "项链", 0)], items: [] }),
    silver({ categories: [category("c1", "项链", 1000)], items: [] }),
    silver({ categories: [category("c1", "项链", 2.5)], items: [] }),
    silver({ categories: [category("c1", "项\n链", 2)], items: [] }),
    silver({ items: [item("i1", "missing")] }),
    silver({ items: [item("i1", "c1", { silhouette: `${HEX}.jpg` })] }),
    silver({ items: [item("i1", "c1", { silhouetteSource: "magic" })] }),
    silver({ items: [item("i1", "c1", { price: -1 })] }),
    silver({ items: [item("i1", "c1", { price: 1.234 })] }),
    silver({ items: [item("i1", "c1", { price: "399" })] }),
    silver({ items: [item("i1", "c1", { boughtAt: "2026-13-01" })] }),
    silver({ items: [item("i1", "c1", { boughtAt: "昨天" })] }),
    silver({ items: [item("i1", "c1", { name: "" })] }),
    silver({ items: [item("i1", "c1"), item("i1", "c1")] }),
    silver({
      categories: Array.from({ length: SILVER_LIMITS.categories + 1 }, (_, i) =>
        category(`c${i}`, `品类${i}`, 1),
      ),
      items: [],
    }),
  ];
  bad.forEach((s, i) =>
    assert.throws(() => validateState(withSilver(s)), /数据校验失败/, `第 ${i} 条应被拒绝`),
  );
  rejects({ ...seed(), silver: [] });
});

test("角色卡：只接受五个主力/附属 Agent，字段严格", () => {
  assert.deepEqual(
    ROLE_AGENTS.map((a) => [a.id, a.tier]),
    [
      ["codex", "main"],
      ["claude-code", "main"],
      ["hermes", "main"],
      ["openclaw", "aux"],
      ["doubao", "aux"],
    ],
  );
  assert.doesNotThrow(() =>
    validateState({
      ...seed(),
      agentRoles: [role("codex"), role("doubao", { cost: "unknown", projects: ["工作台"] })],
    }),
  );
  for (const bad of [
    [role("cursor")],
    [role("codex"), role("codex")],
    [role("codex", { cost: "free" })],
    [role("codex", { strengths: ["x".repeat(25)] })],
    [role("codex", { strengths: Array(31).fill(0).map((_, i) => `k${i}`) })],
    [role("codex", { strengths: ["重构", "重构"] })],
    [role("codex", { strengths: ["有 空格"] })],
    [role("codex", { projects: ["x".repeat(101)] })],
    [role("codex", { note: "x".repeat(1001) })],
    [role("codex", { weight: 2 })],
  ])
    rejects({ ...seed(), agentRoles: bad });
});

// ---------- merge ----------

test("银饰与角色卡合并：只做加法，保留当前编辑；图片引用随记录合并", () => {
  const current = withSilver(silver());
  current.agentRoles = [role("codex", { note: "当前备注" })];
  const incoming = {
    ...seed(),
    silver: {
      wall: [wall("w1", { author: "备份里的旧作者" }), wall("w9")],
      categories: [category("c1", "项链（旧名）", 5), category("c3", "手镯", 1)],
      items: [item("i1", "c1", { name: "旧名" }), item("i9", "c3")],
    },
    agentRoles: [role("codex", { note: "备份备注" }), role("hermes")],
  };
  const { state, summary } = mergeBackup(current, incoming);
  assert.equal(state.silver.wall.find((w) => w.id === "w1").author, "某设计师");
  assert.deepEqual(state.silver.wall.map((w) => w.id), ["w1", "w9"]);
  assert.equal(state.silver.categories.find((c) => c.id === "c1").name, "项链");
  assert.deepEqual(state.silver.categories.map((c) => c.id), ["c1", "c2", "c3"]);
  assert.deepEqual(state.silver.items.map((i) => i.id), ["i1", "i9"]);
  assert.equal(state.silver.items[0].name, "月光项链");
  assert.equal(state.agentRoles.find((r) => r.agentId === "codex").note, "当前备注");
  assert.ok(state.agentRoles.some((r) => r.agentId === "hermes"));
  assert.deepEqual(summary.silverAdded, { wall: 1, categories: 1, items: 1 });
  assert.equal(summary.agentRolesAdded, 1);
});

test("银饰合并：同一已填格落在不同品类视为冲突，整次不导入；旧备份无银饰可合并", () => {
  const current = withSilver(silver());
  const incoming = withSilver(silver({ items: [item("i1", "c2")] }));
  assert.throws(() => mergeBackup(current, incoming), (e) => e.status === 409);
  const { state, summary } = mergeBackup(current, seed());
  assert.deepEqual(state.silver, current.silver);
  assert.deepEqual(summary.silverAdded, { wall: 0, categories: 0, items: 0 });
  // 当前库没有 silver，备份有：整体带入
  const fresh = mergeBackup(seed(), withSilver(silver()));
  assert.deepEqual(fresh.state.silver, silver());
  assert.deepEqual(fresh.summary.silverAdded, { wall: 1, categories: 2, items: 1 });
  // 空主库导入：原样采用
  const empty = mergeBackup(null, { ...withSilver(silver()), agentRoles: [role("codex")] });
  assert.deepEqual(empty.state.silver, silver());
  assert.equal(empty.state.agentRoles.length, 1);
});

test("银饰与角色卡：写入主库后回读一致", async (t) => {
  const dir = await tempDir(t);
  const r = await openRepository(dir);
  t.after(() => r.close());
  const state = { ...withSilver(silver()), agentRoles: [role("hermes")] };
  await r.write(state, { initialize: true });
  const back = await r.read();
  assert.deepEqual(back.silver, state.silver);
  assert.deepEqual(back.agentRoles, state.agentRoles);
});

// ---------- 图片文件 ----------

test("银饰图片：按文件头识别 jpg/png/webp，内容寻址去重，只落在数据目录的 silver/ 下", async (t) => {
  const dir = await tempDir(t);
  const images = await createSilverImages(dir);
  assert.equal(sniffImage(png()), "png");
  assert.equal(sniffImage(jpg()), "jpg");
  assert.equal(sniffImage(webp()), "webp");
  assert.equal(sniffImage(new TextEncoder().encode("<svg></svg>")), null);
  const a = await images.store({ data: jpg(), kind: "photo" });
  assert.match(a.file, /^[a-f0-9]{64}\.jpg$/);
  const again = await images.store({ data: jpg(), kind: "photo" });
  assert.equal(again.file, a.file);
  const b = await images.store({ data: webp(), kind: "photo" });
  assert.match(b.file, /\.webp$/);
  const back = await images.read(a.file);
  assert.equal(back.type, "image/jpeg");
  assert.deepEqual([...back.data], [...jpg()]);
  await access(join(dir, "silver", a.file));
});

test("银饰图片：类型、大小、剪影格式与路径不合法时拒绝", async (t) => {
  const dir = await tempDir(t);
  const images = await createSilverImages(dir);
  await assert.rejects(
    images.store({ data: new TextEncoder().encode("not an image"), kind: "photo" }),
    (e) => e.status === 400 && /jpg、png 或 webp/.test(e.message),
  );
  const huge = new Uint8Array(SILVER_LIMITS.imageBytes + 1);
  huge.set(PNG_MAGIC);
  await assert.rejects(images.store({ data: huge, kind: "photo" }), (e) => e.status === 413);
  await assert.rejects(images.store({ data: jpg(), kind: "silhouette" }), /PNG/);
  await assert.rejects(images.store({ data: "abc", kind: "photo" }), (e) => e.status === 400);
  await assert.rejects(images.store({ data: png(), kind: "other" }), (e) => e.status === 400);
  for (const name of ["../CURRENT.json", `${HEX}.png/../x`, `/etc/${HEX}.png`, "x.png", `${HEX}.svg`])
    await assert.rejects(images.read(name), (e) => e.status === 400, name);
  await assert.rejects(images.read(`${"e".repeat(64)}.png`), (e) => e.status === 404);
  // 数据目录内的符号链接不跟随
  const outside = join(dir, "outside.png");
  await writeFile(outside, png());
  await symlink(outside, join(dir, "silver", `${"f".repeat(64)}.png`));
  await assert.rejects(images.read(`${"f".repeat(64)}.png`), (e) => e.status === 400);
});

// ---------- 抠图器 ----------

test("抠图器：非 macOS 平台直接返回不可用，不调用任何命令", async () => {
  let calls = 0;
  const cutout = createCutout({
    platform: "linux",
    run: async () => {
      calls++;
    },
  });
  const status = await cutout.available();
  assert.equal(status.available, false);
  assert.match(status.reason, /macOS/);
  const result = await cutout.cutout("/in.png", "/out.png");
  assert.equal(result.status, "unavailable");
  assert.match(result.reason, /macOS/);
  assert.equal(calls, 0);
});

test("抠图器：macOS 上调用 Vision 脚本；成功写出 PNG 才算成功，出错、超时或输出无效都回退为不可用", async (t) => {
  const dir = await tempDir(t);
  const input = join(dir, "in.jpg"),
    output = join(dir, "out.png");
  await writeFile(input, jpg());
  const seen = [];
  const ok = createCutout({
    platform: "darwin",
    run: async (script, args) => {
      seen.push([script, ...args]);
      await writeFile(args[1], png());
    },
  });
  assert.equal((await ok.available()).available, true);
  assert.deepEqual(await ok.cutout(input, output), { status: "ok" });
  assert.deepEqual(seen, [[CUTOUT_SCRIPT, input, output]]);
  assert.deepEqual([...(await readFile(output))].slice(0, 8), PNG_MAGIC);

  const failing = createCutout({
    platform: "darwin",
    run: async () => {
      throw Object.assign(new Error("VNGenerateForegroundInstanceMaskRequest 不存在"), { code: 1 });
    },
  });
  const failed = await failing.cutout(input, join(dir, "o2.png"));
  assert.equal(failed.status, "unavailable");
  assert.match(failed.reason, /自动抠图失败/);

  const timeout = createCutout({
    platform: "darwin",
    run: async () => {
      throw Object.assign(new Error("killed"), { killed: true, signal: "SIGTERM" });
    },
  });
  assert.match((await timeout.cutout(input, join(dir, "o3.png"))).reason, /超时/);

  const noOutput = createCutout({ platform: "darwin", run: async () => {} });
  assert.equal((await noOutput.cutout(input, join(dir, "o4.png"))).status, "unavailable");

  const notPng = createCutout({
    platform: "darwin",
    run: async (_s, args) => writeFile(args[1], jpg()),
  });
  assert.equal((await notPng.cutout(input, join(dir, "o5.png"))).status, "unavailable");

  const noSubject = createCutout({
    platform: "darwin",
    run: async () => ({ stdout: "NO_SUBJECT\n" }),
  });
  assert.match((await noSubject.cutout(input, join(dir, "o6.png"))).reason, /没有识别到主体/);
});

test("抠图器：Vision 脚本随服务端发布，调用主体抠图请求", async () => {
  const source = await readFile(CUTOUT_SCRIPT, "utf8");
  assert.match(source, /VNGenerateForegroundInstanceMaskRequest/);
  assert.match(source, /NO_SUBJECT/);
});

test("银饰图片抠图：成功时保存为新的 PNG 剪影；不可用时如实返回，不产生文件", async (t) => {
  const dir = await tempDir(t);
  const good = await createSilverImages(dir, {
    cutout: createCutout({
      platform: "darwin",
      run: async (_s, args) => writeFile(args[1], png(64)),
    }),
  });
  const photo = await good.store({ data: jpg(), kind: "photo" });
  const result = await good.cutout(photo.file);
  assert.equal(result.status, "ok");
  assert.match(result.file, /^[a-f0-9]{64}\.png$/);
  assert.notEqual(result.file, photo.file);
  assert.equal((await good.read(result.file)).type, "image/png");
  await assert.rejects(good.cutout("../x.jpg"), (e) => e.status === 400);

  const dir2 = await tempDir(t);
  const linux = await createSilverImages(dir2, { cutout: createCutout({ platform: "linux" }) });
  const p2 = await linux.store({ data: jpg(), kind: "photo" });
  const none = await linux.cutout(p2.file);
  assert.equal(none.status, "unavailable");
  assert.equal(none.file, undefined);
  assert.deepEqual((await linux.status()).cutout.available, false);
});

test("银饰 HTTP：上传、读取、抠图接口继承会话与 JSON 门禁", async (t) => {
  const base = await tempDir(t, "guiji-silver-http-");
  const app = await startServer({
    directory: join(base, "data"),
    port: 0,
    discovery: {
      defaultRoots: () => [join(base, "projects")],
      silverCutout: createCutout({ platform: "linux" }),
    },
  });
  t.after(() => app.close());
  await app.repository.write(seed(), { initialize: true });
  const { token } = await (
    await fetch(app.url + "/api/session", { headers: { "X-Workbench-Client": "1" } })
  ).json();
  const headers = { "Content-Type": "application/json", "X-Workbench-Token": token };
  const post = async (path, data, h = headers) => {
    const r = await fetch(app.url + "/api" + path, { method: "POST", headers: h, body: stringify(data) });
    return { status: r.status, body: parse(await r.text()) };
  };
  const denied = await post("/silver/images", { data: png(), kind: "photo" }, { "Content-Type": "application/json" });
  assert.equal(denied.status, 403);
  const up = await post("/silver/images", { data: png(), kind: "photo" });
  assert.equal(up.status, 200);
  assert.match(up.body.file, /^[a-f0-9]{64}\.png$/);
  const got = await fetch(app.url + "/api/silver/images/" + up.body.file, {
    headers: { "X-Workbench-Token": token },
  });
  assert.equal(got.status, 200);
  const body = parse(await got.text());
  assert.equal(body.type, "image/png");
  assert.deepEqual([...body.data], [...png()]);
  const traversal = await fetch(app.url + "/api/silver/images/..%2FCURRENT.json", {
    headers: { "X-Workbench-Token": token },
  });
  assert.equal(traversal.status, 400);
  const cut = await post("/silver/cutout", { file: up.body.file });
  assert.equal(cut.status, 200);
  assert.equal(cut.body.status, "unavailable");
  const status = await fetch(app.url + "/api/silver/status", { headers: { "X-Workbench-Token": token } });
  assert.equal(parse(await status.text()).cutout.available, false);
  // 图片不进入主库与备份
  const backup = parse(
    await (await fetch(app.url + "/api/backup", { headers: { "X-Workbench-Token": token } })).text(),
  );
  assert.equal(backup.state.silver, undefined);
  assert.equal(JSON.stringify(backup).includes(up.body.file), false);
});

// ---------- 收藏格 ----------

test("收藏格：按目标数量生成空格与已填格，回收区中的已填格不占格", () => {
  const s = silver({
    items: [item("i1", "c1"), item("i2", "c1", { deletedAt: AT }), item("i3", "c1")],
  });
  const cells = cellsOf(s.categories[0], s.items);
  assert.equal(cells.length, 3);
  assert.deepEqual(
    cells.map((c) => c.item?.id || null),
    ["i1", "i3", null],
  );
  // 目标调低后，已填格照样显示，不丢记录
  const over = cellsOf({ ...s.categories[0], target: 1 }, s.items);
  assert.equal(over.length, 2);
});

// ---------- 角色卡与派活推荐 ----------

test("角色卡：用户编辑覆盖默认值；未编辑的 Agent 用草拟默认并标注", () => {
  const roles = rolesOf({ ...seed(), agentRoles: [role("hermes", { strengths: ["夜巡"], cost: "low" })] });
  assert.deepEqual(roles.map((r) => r.agentId), ["codex", "claude-code", "hermes", "openclaw", "doubao"]);
  const hermes = roles.find((r) => r.agentId === "hermes");
  assert.deepEqual(hermes.strengths, ["夜巡"]);
  assert.equal(hermes.edited, true);
  assert.equal(roles.find((r) => r.agentId === "codex").edited, false);
  assert.deepEqual(parseList("重构, 测试，界面、 审查  重构"), ["重构", "测试", "界面", "审查"]);
});

test("派活推荐：按擅长关键词匹配，最多推荐 2 个并写明理由；无命中时不推荐", () => {
  const cards = [
    { agentId: "codex", name: "Codex", tier: "main", strengths: ["重构", "测试", "修复"], cost: "medium" },
    { agentId: "claude-code", name: "Claude Code", tier: "main", strengths: ["界面", "文档", "测试"], cost: "high" },
    { agentId: "hermes", name: "Hermes", tier: "main", strengths: ["夜巡", "监工"], cost: "low" },
    { agentId: "openclaw", name: "OpenClaw", tier: "aux", strengths: ["UI"], cost: "unknown" },
    { agentId: "doubao", name: "豆包工作", tier: "aux", strengths: ["测试"], cost: "low" },
  ];
  const r1 = recommendAgents("重构登录模块并补测试，顺便修复一个 bug", cards);
  assert.equal(r1.length, 2);
  assert.equal(r1[0].agentId, "codex");
  assert.deepEqual(r1[0].matched, ["重构", "测试", "修复"]);
  assert.match(r1[0].reason, /命中擅长：重构、测试、修复/);
  assert.match(r1[0].reason, /成本中/);
  // 同分按成本从低到高：豆包（低）先于 Claude Code（高）
  assert.equal(r1[1].agentId, "doubao");
  const r2 = recommendAgents("今晚安排夜巡", cards);
  assert.deepEqual(r2.map((r) => r.agentId), ["hermes"]);
  // 英文关键词不区分大小写
  assert.equal(recommendAgents("调整 ui 间距", cards)[0].agentId, "openclaw");
  assert.deepEqual(recommendAgents("写一首诗", cards), []);
  assert.deepEqual(recommendAgents("   ", cards), []);
});

test("常驻项目：只从已登记项目的交接字段推断，推断不了留空", () => {
  const state = {
    ...seed(),
    projects: [
      { id: "p1", name: "个人工作台", goal: "资产管理", next: "交给 Codex 复核切片 1.3", location: "", status: "进行中" },
      { id: "p2", name: "读书笔记", goal: "", next: "等 Hermes 夜巡整理", location: "", status: "进行中" },
      { id: "p3", name: "旧项目", goal: "", next: "codex 收尾", location: "", status: "已完成" },
    ],
  };
  assert.deepEqual(inferProjects(state, "codex"), ["个人工作台"]);
  assert.deepEqual(inferProjects(state, "hermes"), ["读书笔记"]);
  assert.deepEqual(inferProjects(state, "claude-code"), []);
  assert.deepEqual(inferProjects(seed(), "codex"), []);
});

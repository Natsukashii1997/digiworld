// 路线 v3 切片 2.1（在推进标记 + 项目状态卡 + 停滞雷达）与 2.2（项目安全体检，只读）。
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, readFile, readdir, rm, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseCurrentStatus,
  decodeCurrentHead,
  readCurrentFile,
  stallVerdict,
  sensitivePaths,
  CURRENT_READ_LIMIT,
  DEFAULT_STALL_DAYS,
  ACTIVE_SOFT_LIMIT,
} from "../server/project-status.mjs";
import { validateState } from "../server/schema.mjs";
import { mergeBackup } from "../server/merge.mjs";
import { mergeProjects } from "../server/discovery.mjs";
import { pendingItems } from "../src/pending.js";
import { seed } from "../src/store.js";
import {
  CURRENT_SAMPLE,
  projectStatusFixture,
} from "./project-status-fixture.mjs";

const DAY = 86400000;

// ---------- CURRENT.md 协作状态表解析 ----------

test("解析协作状态表：状态编号、当前写入者、唯一下一步、最新交接链接", () => {
  const r = parseCurrentStatus(CURRENT_SAMPLE);
  assert.equal(r.state, "ok");
  assert.deepEqual(r.missing, []);
  assert.equal(r.fields.stateId, "P-20260930-12");
  assert.equal(r.fields.writer, "Codex（认领12：状态卡复核）");
  assert.equal(r.fields.next, "Claude 读回 12 并合入");
  assert.deepEqual(r.fields.handoff, {
    text: "Codex 认领12",
    href: "docs/handoffs/12.md",
  });
});

test("规则模板的“状态编号”与本项目的 state_id 同样识别；单元格里的转义竖线不拆列", () => {
  const r = parseCurrentStatus(
    [
      "| 字段 | 含义 |",
      "|---|---|",
      "| 状态编号 | P-1 |",
      "| 当前写入者 | 无 |",
      "| 唯一下一步 | 跑 a \\| b 两个命令 |",
      "| 最新交接 | 见 docs/x.md（无链接） |",
    ].join("\n"),
  );
  assert.equal(r.state, "ok");
  assert.equal(r.fields.stateId, "P-1");
  assert.equal(r.fields.writer, "无");
  assert.equal(r.fields.next, "跑 a | b 两个命令");
  assert.deepEqual(r.fields.handoff, { text: "见 docs/x.md（无链接）", href: "" });
});

test("缺字段：如实列出缺的项，不补造", () => {
  const r = parseCurrentStatus(
    "| 字段 | 当前值 |\n|---|---|\n| state_id | S-9 |\n| 当前写入者 | Claude |\n",
  );
  assert.equal(r.state, "partial");
  assert.deepEqual(r.missing, ["唯一下一步", "最新交接"]);
  assert.equal(r.fields.stateId, "S-9");
  assert.equal(r.fields.next, undefined);
});

test("没有协作状态表或空值：判为无法解析", () => {
  assert.equal(parseCurrentStatus("# 当前状态\n目标：上线\n下一步：检查\n").state, "unparsed");
  assert.equal(parseCurrentStatus("").state, "unparsed");
  // 表格存在但各字段都是空单元格，也不能冒充已解析。
  assert.equal(
    parseCurrentStatus("| 字段 | 值 |\n|---|---|\n| state_id |  |\n| 当前写入者 | |\n").state,
    "unparsed",
  );
});

test("超大值截断显示，不整段搬进工作台", () => {
  const long = "长".repeat(5000);
  const r = parseCurrentStatus(
    `| 字段 | 值 |\n|---|---|\n| state_id | S-1 |\n| 当前写入者 | 无 |\n| 唯一下一步 | ${long} |\n| 最新交接 | [a](b.md) |\n`,
  );
  assert.ok(r.fields.next.length <= 501, `长度 ${r.fields.next.length}`);
  assert.ok(r.fields.next.endsWith("…"));
});

test("非 UTF-8 内容不解析；读取上限处截断的多字节字符不误判为非 UTF-8", () => {
  assert.throws(
    () => decodeCurrentHead(Buffer.from([0xff, 0xfe, 0x41, 0x00]), false),
    /UTF-8/,
  );
  const text = Buffer.from("| 字段 | 值 |\n", "utf8");
  // 把“值”字（3 字节）截在中间：只有在截断读取时才允许丢弃末尾不完整字符。
  const cut = text.subarray(0, text.length - 4);
  assert.equal(decodeCurrentHead(cut, true), "| 字段 | ");
  assert.throws(() => decodeCurrentHead(cut, false), /UTF-8/);
});

test("readCurrentFile：缺失、超大、非 UTF-8、符号链接各有明确结果", async () => {
  const dir = await mkdtemp(join(tmpdir(), "guiji-current-"));
  try {
    assert.equal((await readCurrentFile(dir, "CURRENT.md")).state, "absent");

    // 超大文件：只读前 CURRENT_READ_LIMIT 字节；协作表在开头时仍能解析，并标明只读了开头。
    await writeFile(
      join(dir, "CURRENT.md"),
      CURRENT_SAMPLE + "\n" + "填充内容。\n".repeat(200000),
    );
    const big = await readCurrentFile(dir, "CURRENT.md");
    assert.equal(big.state, "read");
    assert.equal(big.truncated, true);
    assert.ok(Buffer.byteLength(big.text) <= CURRENT_READ_LIMIT);
    assert.equal(parseCurrentStatus(big.text).fields.stateId, "P-20260930-12");

    // 协作表在上限之后：读不到，就是无法解析，不去读整份文件。
    await writeFile(
      join(dir, "CURRENT.md"),
      "填充。\n".repeat(CURRENT_READ_LIMIT) + CURRENT_SAMPLE,
    );
    const late = await readCurrentFile(dir, "CURRENT.md");
    assert.equal(late.truncated, true);
    assert.equal(parseCurrentStatus(late.text).state, "unparsed");

    await writeFile(join(dir, "CURRENT.md"), Buffer.from([0xc3, 0x28, 0x7c, 0x0a]));
    const bad = await readCurrentFile(dir, "CURRENT.md");
    assert.equal(bad.state, "error");
    assert.match(bad.message, /UTF-8/);

    await rm(join(dir, "CURRENT.md"));
    const { symlink } = await import("node:fs/promises");
    await writeFile(join(dir, "real.md"), CURRENT_SAMPLE);
    await symlink(join(dir, "real.md"), join(dir, "CURRENT.md"));
    const linked = await readCurrentFile(dir, "CURRENT.md");
    assert.equal(linked.state, "error");
    assert.match(linked.message, /符号链接|普通文件/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------- 停滞判断 ----------

test("停滞：取 CURRENT 修改时间与最近提交中较新者；恰好 N 天不算超过", () => {
  const now = Date.parse("2026-09-30T12:00:00Z");
  const at = (days) => new Date(now - days * DAY).toISOString();
  const v = (current, git, days = 7) =>
    stallVerdict({ now, days, current, git });
  assert.equal(v({ state: "ok", at: at(7) }, { state: "absent" }).state, "active");
  const over = v({ state: "ok", at: at(7.01) }, { state: "absent" });
  assert.equal(over.state, "stalled");
  assert.equal(over.idleDays, 7);
  assert.equal(over.source, "CURRENT");
  // 较新者生效：CURRENT 很旧但刚有提交，不算停滞。
  const fresh = v({ state: "ok", at: at(40) }, { state: "ok", at: at(1) });
  assert.equal(fresh.state, "active");
  assert.equal(fresh.source, "Git");
  assert.equal(v({ state: "ok", at: at(3) }, { state: "ok", at: at(9) }, 2).state, "stalled");
  assert.equal(v({ state: "ok", at: at(3) }, { state: "ok", at: at(9) }, 5).state, "active");
});

test("停滞：读不到就是未知，不当作停滞", () => {
  const now = Date.parse("2026-09-30T12:00:00Z");
  const old = new Date(now - 30 * DAY).toISOString();
  assert.equal(
    stallVerdict({ now, days: 7, current: { state: "absent" }, git: { state: "absent" } }).state,
    "unknown",
  );
  assert.equal(
    stallVerdict({ now, days: 7, current: { state: "error" }, git: { state: "error" } }).state,
    "unknown",
  );
  // 一侧读取出错、另一侧显示很久没动：出错那侧可能更新，不能下停滞结论。
  assert.equal(
    stallVerdict({ now, days: 7, current: { state: "ok", at: old }, git: { state: "error" } }).state,
    "unknown",
  );
  // 一侧出错但另一侧足够新：可以确定没有停滞。
  assert.equal(
    stallVerdict({ now, days: 7, current: { state: "error" }, git: { state: "ok", at: new Date(now).toISOString() } }).state,
    "active",
  );
  // 时间在未来（时钟不一致）按 0 天处理，不报停滞。
  assert.equal(
    stallVerdict({ now, days: 7, current: { state: "ok", at: new Date(now + DAY).toISOString() }, git: { state: "absent" } }).state,
    "active",
  );
  assert.equal(DEFAULT_STALL_DAYS, 7);
  assert.equal(ACTIVE_SOFT_LIMIT, 7);
});

// ---------- 敏感文件判定 ----------

test("敏感文件按 git ls-files 路径判定", () => {
  const hits = sensitivePaths([
    ".env",
    "config/.env.local",
    ".env.example",
    "certs/server.pem",
    "keys/deploy.KEY",
    "home/.ssh/id_rsa",
    "id_rsa.pub",
    "bundle.p12",
    "data/app.json",
    "packages/api/data/seed.csv",
    "db/app.sqlite",
    "local.db",
    "README.md",
    "src/environment.js",
    "docs/.envrc",
    "database/schema.sql",
    "src/metadata/index.js",
    "keyboard.md",
    "notes.pem.md",
  ]);
  assert.deepEqual(hits, [
    ".env",
    "config/.env.local",
    ".env.example",
    "certs/server.pem",
    "keys/deploy.KEY",
    "home/.ssh/id_rsa",
    "id_rsa.pub",
    "bundle.p12",
    "data/app.json",
    "packages/api/data/seed.csv",
    "db/app.sqlite",
    "local.db",
  ]);
});

// ---------- schema 与合并语义 ----------

const withProjects = (projects, extra = {}) => ({
  ...seed(),
  revision: 3,
  connections: {
    roots: ["/fixture/projects"],
    projects,
    agents: [],
    github: { status: "not_connected", login: "", message: "", at: "" },
    projectScannedAt: "",
    agentScannedAt: "",
    errors: [],
    truncated: false,
    ...extra,
  },
});
const project = (id, extra = {}) => ({
  id,
  name: id,
  kind: "Git",
  repoKey: "",
  localPaths: [`/fixture/projects/${id}`],
  ...extra,
});

test("schema：active 是可选布尔字段；旧库缺失即未标记；停滞阈值为 1–365 的整数天", () => {
  validateState(withProjects([project("a")]));
  validateState(withProjects([project("a", { active: true }), project("b", { active: false })]));
  for (const bad of ["true", 1, null])
    assert.throws(() => validateState(withProjects([project("a", { active: bad })])), /在推进/);
  validateState(withProjects([project("a")], { projectStallDays: 14 }));
  for (const bad of [0, 366, 2.5, "7", null])
    assert.throws(
      () => validateState(withProjects([project("a")], { projectStallDays: bad })),
      /停滞阈值/,
    );
});

test("合并备份：active 与其他项目连接字段一样，不从备份导入也不覆盖当前主库", () => {
  const current = withProjects([project("a", { active: true }), project("b")]);
  const backup = withProjects([project("a"), project("b", { active: true })]);
  const { state } = mergeBackup(current, backup);
  assert.equal(state.connections.projects.find((p) => p.id === "a").active, true);
  assert.equal(state.connections.projects.find((p) => p.id === "b").active, undefined);
  // 空主库从备份恢复：连接结果需要重新扫描，标记同样不随备份带入。
  assert.equal(mergeBackup(null, backup).state.connections, undefined);
});

test("重新扫描保留在推进标记，即使远端换了；消失的项目标记随项目保留", () => {
  const previous = [
    project("a", { active: true, repoKey: "old/a" }),
    project("b"),
    project("gone", { active: true, githubUrl: "https://github.com/x/gone", repoKey: "x/gone" }),
  ];
  const locals = [
    { ...project("a"), repoKey: "new/a" },
    { ...project("b") },
  ];
  const merged = mergeProjects(previous, locals, [], {});
  assert.equal(merged.find((p) => p.id === "a").active, true);
  assert.equal(merged.find((p) => p.id === "b").active, undefined);
  assert.equal(merged.find((p) => p.id === "gone").active, true);
});

// ---------- 待处理汇总 ----------

test("待处理：体检问题与停滞各进一条，只汇总与跳转；读取失败单列", () => {
  const status = {
    loaded: true,
    error: "",
    items: [
      {
        projectId: "p1",
        name: "泄露项目",
        activity: { state: "active" },
        safety: { issues: [{ id: "sensitive", text: "Git 跟踪了 2 个敏感文件" }, { id: "public", text: "远程仓库是公开的" }] },
      },
      {
        projectId: "p2",
        name: "无协议项目",
        activity: { state: "stalled", idleDays: 30 },
        safety: { issues: [] },
      },
      { projectId: "p3", name: "未知", activity: { state: "unknown" }, safety: { issues: [] } },
    ],
  };
  const items = pendingItems(seed(), undefined, status);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.deepEqual(Object.keys(byId).sort(), ["project-safety-p1", "project-stall-p2"]);
  assert.equal(byId["project-safety-p1"].kind, "项目");
  assert.equal(byId["project-safety-p1"].to, "projects");
  assert.match(byId["project-safety-p1"].title, /泄露项目.*2 项/);
  assert.match(byId["project-safety-p1"].detail, /敏感文件.*公开/);
  assert.match(byId["project-stall-p2"].title, /无协议项目.*30 天/);
  assert.deepEqual(
    pendingItems(seed(), undefined, { loaded: true, error: "服务中断", items: [] }).map((i) => i.id),
    ["project-status-error"],
  );
  assert.deepEqual(pendingItems(seed()), []);
});

// ---------- HTTP：标记、阈值、只读状态与体检 ----------

async function tree(dir) {
  const out = {};
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const info = await lstat(p);
      if (e.isDirectory()) {
        out[p] = `dir ${info.mtimeMs}`;
        await walk(p);
      } else
        out[p] = `${info.mtimeMs} ${createHash("sha256").update(await readFile(p)).digest("hex")}`;
    }
  }
  await walk(dir);
  return out;
}

test("HTTP：标记在推进需要当前 revision，严格校验输入；超过 7 个只提示不阻止", async () => {
  const app = await projectStatusFixture();
  try {
    const id = await app.projectId("协同项目");
    assert.ok(id);
    let ws = await app.workspace();
    const bad = await app.call("/project-status/mark", { projectId: id, active: "yes", revision: ws.revision });
    assert.equal(bad.status, 400);
    const stale = await app.call("/project-status/mark", { projectId: id, active: true, revision: ws.revision - 1 });
    assert.equal(stale.status, 409);
    const missing = await app.call("/project-status/mark", { projectId: "nope", active: true, revision: ws.revision });
    assert.equal(missing.status, 404);
    const extra = await app.call("/project-status/mark", { projectId: id, active: true, revision: ws.revision, path: "/etc" });
    assert.equal(extra.status, 400);
    const ok = await app.call("/project-status/mark", { projectId: id, active: true, revision: ws.revision });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.connections.projects.find((p) => p.id === id).active, true);
    // 取消标记：字段移除，回到旧库同样的“缺失即未标记”。
    const off = await app.call("/project-status/mark", { projectId: id, active: false, revision: ok.body.revision });
    assert.equal(off.status, 200);
    assert.equal("active" in off.body.connections.projects.find((p) => p.id === id), false);

    // 超过 7 个：不阻止，inspect 给出计数与软上限。
    await app.repository.updateConnections((c) => ({
      ...c,
      projects: [
        ...c.projects,
        ...Array.from({ length: 7 }, (_, i) => ({
          id: `extra-${i}`,
          name: `额外${i}`,
          localPaths: [],
          githubUrl: `https://github.com/tester/extra-${i}`,
          repoKey: `tester/extra-${i}`,
          active: true,
        })),
      ],
    }));
    ws = await app.workspace();
    const eighth = await app.call("/project-status/mark", { projectId: id, active: true, revision: ws.revision });
    assert.equal(eighth.status, 200);
    const inspected = await app.call("/project-status/inspect", {});
    assert.equal(inspected.status, 200);
    assert.equal(inspected.body.activeCount, 8);
    assert.equal(inspected.body.softLimit, 7);
    const remoteOnly = inspected.body.items.find((i) => i.projectId === "extra-0");
    assert.equal(remoteOnly.current.state, "error");
    assert.match(remoteOnly.current.message, /本地目录/);
    assert.equal(remoteOnly.activity.state, "unknown");
  } finally {
    await app.close();
  }
});

test("HTTP：停滞阈值可保存，非法值拒绝", async () => {
  const app = await projectStatusFixture();
  try {
    const ws = await app.workspace();
    assert.equal((await app.call("/project-status/settings", { stallDays: 0, revision: ws.revision })).status, 400);
    assert.equal((await app.call("/project-status/settings", { stallDays: 3, revision: ws.revision - 1 })).status, 409);
    const saved = await app.call("/project-status/settings", { stallDays: 40, revision: ws.revision });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.connections.projectStallDays, 40);
    assert.equal((await app.call("/project-status/inspect", {})).body.stallDays, 40);
  } finally {
    await app.close();
  }
});

test("HTTP：只读状态卡、停滞雷达与安全体检覆盖合成仓库，且不改任何项目文件", async () => {
  const app = await projectStatusFixture();
  try {
    const before = await tree(app.paths.projects);
    let ws = await app.workspace();
    for (const name of ["协同项目", "无协议项目", "泄露项目", "文档项目"]) {
      const r = await app.call("/project-status/mark", {
        projectId: await app.projectId(name),
        active: true,
        revision: ws.revision,
      });
      assert.equal(r.status, 200, `${name} ${JSON.stringify(r.body)}`);
      ws = r.body;
    }
    const revision = ws.revision;
    const r = await app.call("/project-status/inspect", {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.stallDays, 7);
    const by = Object.fromEntries(r.body.items.map((i) => [i.name, i]));

    const collab = by["协同项目"];
    assert.equal(collab.current.state, "ok");
    assert.equal(collab.current.fields.stateId, "P-20260930-12");
    assert.equal(collab.current.fields.writer, "Codex（认领12：状态卡复核）");
    assert.equal(collab.current.fields.next, "Claude 读回 12 并合入");
    assert.deepEqual(collab.current.fields.handoff, { text: "Codex 认领12", href: "docs/handoffs/12.md" });
    assert.equal(collab.activity.state, "active");
    assert.equal(collab.activity.source, "CURRENT");
    assert.equal(collab.safety.checks.remote.state, "present");
    assert.equal(collab.safety.checks.dirty.count, 0);
    assert.equal(collab.safety.checks.sensitive.total, 0);
    assert.equal(collab.safety.checks.visibility.state, "private");
    assert.deepEqual(collab.safety.issues, []);

    const bare = by["无协议项目"];
    assert.equal(bare.current.state, "absent");
    assert.equal(bare.activity.state, "stalled");
    assert.equal(bare.activity.source, "Git");
    assert.ok(bare.activity.idleDays >= 29);
    assert.equal(bare.safety.checks.remote.state, "none");
    assert.equal(bare.safety.checks.visibility.state, "unknown");
    assert.deepEqual(bare.safety.issues.map((i) => i.id), ["remote"]);

    const leaky = by["泄露项目"];
    assert.equal(leaky.current.state, "absent");
    assert.equal(leaky.activity.state, "active");
    assert.equal(leaky.safety.checks.dirty.count, 1);
    assert.deepEqual(leaky.safety.checks.sensitive.files, [".env", "data/app.sqlite"]);
    assert.equal(leaky.safety.checks.visibility.state, "public");
    assert.deepEqual(leaky.safety.issues.map((i) => i.id), ["dirty", "sensitive", "public"]);

    const docs = by["文档项目"];
    assert.equal(docs.current.state, "absent");
    assert.equal(docs.activity.state, "unknown");
    assert.equal(docs.safety.checks.git.state, "none");
    assert.deepEqual(docs.safety.issues.map((i) => i.id), ["git"]);

    // 只读：项目文件（含 .git）逐字节不变；主库 revision 不因体检增加。
    assert.deepEqual(await tree(app.paths.projects), before);
    assert.equal((await app.workspace()).revision, revision);
  } finally {
    await app.close();
  }
});

test("HTTP：不能借体检读任意路径；目录不在扫描范围或已更换时如实报告", async () => {
  const app = await projectStatusFixture();
  try {
    assert.equal((await app.call("/project-status/inspect", { root: "/etc" })).status, 400);
    const outside = await mkdtemp(join(tmpdir(), "guiji-outside-"));
    await writeFile(join(outside, "CURRENT.md"), CURRENT_SAMPLE);
    try {
      await app.repository.updateConnections((c) => ({
        ...c,
        projects: [
          ...c.projects,
          { id: "outside", name: "范围外", localPaths: [outside], repoKey: "", active: true },
        ],
      }));
      const r = await app.call("/project-status/inspect", {});
      const item = r.body.items.find((i) => i.projectId === "outside");
      assert.equal(item.current.state, "error");
      assert.match(item.current.message, /扫描范围/);
      assert.equal(item.current.fields, undefined);
      assert.equal(item.safety.checks.git.state, "unknown");
      assert.equal(item.activity.state, "unknown");

      // 目录身份已变化、待重新确认：不读取，按现有身份规则提示先确认目录。
      const collabId = await app.projectId("协同项目");
      await app.repository.updateConnections((c) => ({
        ...c,
        projects: c.projects.map((p) =>
          p.id === collabId
            ? {
                ...p,
                active: true,
                locations: p.locations.map((l) => ({ ...l, status: "changed" })),
              }
            : p,
        ),
      }));
      const changed = (await app.call("/project-status/inspect", {})).body.items.find(
        (i) => i.projectId === collabId,
      );
      assert.equal(changed.current.state, "error");
      assert.match(changed.current.message, /重新确认目录/);
      assert.equal(changed.current.fields, undefined);
      assert.equal(changed.safety.checks.git.state, "unknown");
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  } finally {
    await app.close();
  }
});

test("HTTP：gh 查询失败或抛错时远程私有性为未知，不报错", async () => {
  const app = await projectStatusFixture({
    visibility: async () => {
      throw new Error("gh: not logged in");
    },
  });
  try {
    const ws = await app.workspace();
    await app.call("/project-status/mark", { projectId: await app.projectId("泄露项目"), active: true, revision: ws.revision });
    const r = await app.call("/project-status/inspect", {});
    assert.equal(r.status, 200);
    const leaky = r.body.items[0];
    assert.equal(leaky.safety.checks.visibility.state, "unknown");
    assert.ok(!leaky.safety.issues.some((i) => i.id === "public"));
  } finally {
    await app.close();
  }
});

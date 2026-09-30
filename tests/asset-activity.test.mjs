import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture } from "./fixture.mjs";
import { seed, revise, current } from "../src/store.js";
import { stringify, parse } from "../src/serialization.js";
import { openRepository } from "../server/repository.mjs";
import { validateState, validateHistory } from "../server/schema.mjs";
import { mergeBackup } from "../server/merge.mjs";
import { usageOf } from "../src/asset-usage.js";
import { createAssetActivity } from "../server/asset-activity.mjs";
import { createDeliveries } from "../server/delivery.mjs";
import { retainedDemoIds } from "../src/asset-origin.js";

async function setup() {
  const app = await fixture();
  const session = await (
    await fetch(app.url + "/api/session", {
      headers: { "x-workbench-client": "1" },
    })
  ).json();
  const headers = {
    "x-workbench-token": session.token,
    "content-type": "application/json",
  };
  async function call(
    path,
    body,
    method = body === undefined ? "GET" : "POST",
  ) {
    const r = await fetch(app.url + "/api" + path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: stringify(body) }),
    });
    return { status: r.status, body: parse(await r.text()) };
  }
  const state = (
    await call("/workspace", { state: seed(), initialize: true }, "PUT")
  ).body;
  return { app, call, state };
}
function use(asset, extra = {}) {
  return {
    id: randomUUID(),
    assetId: asset.id,
    versionId: current(asset).id,
    kind: "use",
    action: `copy-${asset.type.toLowerCase()}`,
    ...extra,
  };
}
const stored = (record) => ({
  schema: 1,
  ...record,
  at: "2026-09-29T00:00:00.000Z",
});

test("旧主库重启与读取不迁移写入，旧备份缺字段兼容", async () => {
  const dir = await mkdtemp(join(tmpdir(), "usage-legacy-"));
  let repo = await openRepository(dir);
  try {
    const s = await repo.write(seed(), { initialize: true });
    const pointer = await readFile(join(dir, "CURRENT.json"));
    await repo.close();
    repo = await openRepository(dir);
    assert.deepEqual(await repo.read(), s);
    assert.deepEqual(await readFile(join(dir, "CURRENT.json")), pointer);
    assert.equal(s.assetActivity, undefined);
    assert.equal(usageOf(s.assets[0]).count, 0);
    assert.equal(
      mergeBackup(null, { format: "guiji-backup", schema: 1, state: s }).state
        .assetActivity,
      undefined,
    );
  } finally {
    await repo.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("HTTP 成功写后回读、重复幂等、ID 冲突、旧 revision 拒绝、未知结果先查询", async () => {
  const { app, call, state } = await setup();
  try {
    const asset = state.assets.find((a) => a.type === "Prompt"),
      payload = use(asset);
    const first = await call("/asset-activity", {
      ...payload,
      expectedRevision: state.revision,
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.state.revision, state.revision + 1);
    assert.equal(first.body.state.assetActivity.length, 1);
    assert.deepEqual(
      (await call("/asset-activity?id=" + payload.id)).body.record,
      first.body.record,
    );
    assert.equal(
      (
        await call("/asset-activity", {
          ...payload,
          expectedRevision: state.revision,
        })
      ).body.state.revision,
      first.body.state.revision,
    );
    assert.equal(
      (
        await call("/asset-activity", {
          ...payload,
          versionId: "different",
          expectedRevision: state.revision,
        })
      ).status,
      409,
    );
    const second = use(asset);
    assert.equal(
      (
        await call("/asset-activity", {
          ...second,
          expectedRevision: state.revision,
        })
      ).status,
      409,
    );
    const absent = (await call("/asset-activity?id=" + second.id)).body;
    assert.equal(absent.record, null);
    assert.equal(
      (
        await call("/asset-activity", {
          ...second,
          expectedRevision: absent.state.revision,
        })
      ).status,
      200,
    );
    assert.equal((await call("/workspace")).body.assetActivity.length, 2);
    assert.equal(
      (await fetch(app.url + "/api/asset-activity?id=" + payload.id)).status,
      403,
    );
  } finally {
    await app.close();
  }
});

test("Skill 只生成或未复制不计；有效复制可记；撤销失效不计", async () => {
  const { app, call, state } = await setup();
  try {
    const asset = state.assets.find((a) => a.type === "Skill");
    const link = (
      await call("/deliveries", {
        assetId: asset.id,
        versionId: current(asset).id,
      })
    ).body;
    const payload = use(asset, {
      deliveryId: link.id,
      expectedRevision: state.revision,
    });
    assert.equal((await call("/workspace")).body.revision, state.revision);
    await call("/deliveries/copied", { id: link.id });
    assert.equal((await call("/asset-activity", payload)).status, 200);
    await call("/deliveries/revoke", { id: link.id });
    assert.equal((await call("/asset-activity", payload)).status, 200); // prior commit survives link expiry
    assert.equal(
      (
        await call("/asset-activity", {
          ...payload,
          id: randomUUID(),
          expectedRevision: state.revision + 1,
        })
      ).status,
      410,
    );
    assert.equal((await call("/workspace")).body.assetActivity.length, 1);
  } finally {
    await app.close();
  }
});

test("反馈追加、当前版本阶段、负向降级、新版不继承和零证据", async () => {
  const { app, call, state } = await setup();
  try {
    const asset = state.assets.find((a) => a.type === "Prompt");
    const payload = use(asset);
    const copied = (
      await call("/asset-activity", {
        ...payload,
        expectedRevision: state.revision,
      })
    ).body.state;
    assert.equal(usageOf(asset, copied.assetActivity).stage, 2);
    const feedback = {
      id: randomUUID(),
      assetId: asset.id,
      versionId: current(asset).id,
      kind: "feedback",
      rating: "good",
      note: "结构清楚",
      useId: payload.id,
    };
    const good = (
      await call("/asset-activity", {
        ...feedback,
        expectedRevision: copied.revision,
      })
    ).body.state;
    assert.equal(usageOf(asset, good.assetActivity).stage, 3);
    const bad = (
      await call("/asset-activity", {
        ...feedback,
        id: randomUUID(),
        rating: "improve",
        expectedRevision: good.revision,
      })
    ).body.state;
    assert.equal(usageOf(asset, bad.assetActivity).stage, 2);
    assert.equal(bad.assetActivity.length, 3);
    assert.equal(
      usageOf(
        revise(asset, { ...current(asset), title: "新版" }),
        good.assetActivity,
      ).stage,
      1,
    );
    assert.equal(
      usageOf(asset, [stored({ ...feedback, useId: undefined })]).stage,
      1,
    );
    assert.deepEqual(bad.assets, state.assets);
  } finally {
    await app.close();
  }
});

test("schema 白名单/隐私/引用/容量严格，反馈拒绝不回显秘密", async () => {
  const s = seed(),
    a = s.assets.find((a) => a.type === "Prompt");
  const record = stored(use(a));
  const feedback = {
    schema: 1,
    id: randomUUID(),
    assetId: a.id,
    versionId: current(a).id,
    at: record.at,
    kind: "feedback",
    rating: "good",
    note: "",
  };
  for (const note of [
    "/Users/example/private.md",
    "来源是/Users/example/private.md",
    "路径：/Users/example/private.md",
    "路径为~/private/file",
    "C:/Users/example/private.md",
    "C:\\secret\\file",
    "https://example.invalid/token",
    "sk-testsecret123",
    "token=private-value",
    current(a).content,
  ]) {
    assert.throws(
      () => validateState({ ...s, assetActivity: [{ ...feedback, note }] }),
      /反馈/,
    );
  }
  for (const bad of [
    { ...record, content: "secret" },
    { ...record, versionId: "missing" },
    { ...record, action: "download" },
    { ...feedback, useId: record.id },
  ]) {
    assert.throws(() => validateState({ ...s, assetActivity: [bad] }));
  }
  assert.throws(() => validateState({ ...s, assetActivity: [record, record] }));
  assert.throws(() =>
    validateState({ ...s, assetActivity: Array(20001).fill(record) }),
  );
});

test("普通写入不能伪造/删除/篡改；有记录示例保留", async () => {
  const { app, call, state } = await setup();
  try {
    const a = state.assets.find((a) => a.type === "Prompt");
    const recorded = (
      await call("/asset-activity", {
        ...use(a),
        expectedRevision: state.revision,
      })
    ).body.state;
    for (const events of [
      [],
      [{ ...recorded.assetActivity[0], at: "2026-01-01T00:00:00.000Z" }],
      [...recorded.assetActivity, stored(use(a))],
    ]) {
      assert.equal(
        (
          await call(
            "/workspace",
            { state: { ...recorded, assetActivity: events } },
            "PUT",
          )
        ).status,
        400,
      );
    }
    assert.ok(
      retainedDemoIds(recorded.assets, [], recorded.assetActivity).has(a.id),
    );
    assert.equal(
      (
        await call(
          "/workspace",
          {
            state: {
              ...recorded,
              assets: recorded.assets.filter((x) => x.id !== a.id),
            },
          },
          "PUT",
        )
      ).status,
      400,
    );
    assert.equal((await call("/workspace")).body.revision, recorded.revision);
  } finally {
    await app.close();
  }
});

test("备份不可变并集，旧备份不清零，冲突整次拒绝且反馈引用合并后有效", async () => {
  const s = seed(),
    a = s.assets.find((a) => a.type === "Prompt");
  const one = stored(use(a)),
    two = stored(use(a));
  const before = { ...s, revision: 3, assetActivity: [one] };
  assert.deepEqual(mergeBackup(before, s).state.assetActivity, [one]);
  const incoming = { ...s, assetActivity: [one, two] };
  const merged = mergeBackup(before, incoming);
  assert.equal(merged.summary.activityAdded, 1);
  assert.equal(merged.state.assetActivity.length, 2);
  assert.equal(mergeBackup(merged.state, incoming).summary.activityAdded, 0);
  assert.throws(
    () =>
      mergeBackup(before, {
        ...s,
        assetActivity: [{ ...one, at: "2026-09-28T00:00:00.000Z" }],
      }),
    /冲突/,
  );
  validateHistory(before, merged.state, { allowActivity: true });
  assert.throws(
    () => validateHistory(merged.state, before, { allowActivity: true }),
    /不可覆盖/,
  );
});

test("导入 API 预览无写入，确认合并事件并经关闭重开保留", async () => {
  const { app, call, state } = await setup();
  try {
    const a = state.assets.find((a) => a.type === "Prompt"),
      event = stored(use(a));
    const backup = {
      format: "guiji-backup",
      schema: 1,
      state: { ...state, assetActivity: [event] },
    };
    const preview = await call("/import/preview", backup);
    assert.equal(preview.status, 200);
    assert.equal((await call("/workspace")).body.revision, state.revision);
    const confirmed = await call("/import/confirm", {
      backup,
      token: preview.body.token,
    });
    assert.equal(confirmed.status, 200);
    assert.deepEqual(confirmed.body.assetActivity, [event]);
    const exported = (await call("/backup")).body;
    assert.deepEqual(exported.state.assetActivity, [event]);
    // A new repository reading the exported snapshot checks durable history too.
    const dir = await mkdtemp(join(tmpdir(), "usage-reopen-"));
    let repo = await openRepository(dir);
    try {
      const p = await repo.previewImport(exported);
      await repo.importBackup(exported, p.token);
      await repo.close();
      repo = await openRepository(dir);
      assert.deepEqual((await repo.read()).assetActivity, [event]);
    } finally {
      await repo.close();
      await rm(dir, { recursive: true, force: true });
    }
  } finally {
    await app.close();
  }
});

test("固定版本隐私校验不会让未来新正文作废旧反馈；null 不是旧格式", () => {
  const s = seed(),
    a = s.assets.find((a) => a.type === "Prompt");
  s.assetActivity = [
    {
      schema: 1,
      id: "feedback-fixed",
      assetId: a.id,
      versionId: current(a).id,
      at: "2026-09-29T00:00:00.000Z",
      kind: "feedback",
      rating: "good",
      note: "表达简洁",
    },
  ];
  s.assets = s.assets.map((x) =>
    x.id === a.id ? revise(x, { ...current(x), content: "表达简洁" }) : x,
  );
  validateState(s);
  assert.throws(() => validateState({ ...s, assetActivity: null }));
});

test("Skill 固定版本文本文件正文和 UNC 路径拒绝，普通斜杠评价可保存", () => {
  const s = seed(),
    a = s.assets.find((a) => a.type === "Skill");
  const v = current(a);
  v.content = "";
  v.files = [
    { path: "SKILL.md", text: true, data: "# 合成技能\n这是唯一的资产正文。" },
  ];
  const feedback = {
    schema: 1,
    id: "file-feedback",
    assetId: a.id,
    versionId: v.id,
    at: "2026-09-29T00:00:00.000Z",
    kind: "feedback",
    rating: "good",
    note: "",
  };
  for (const note of [
    v.files[0].data,
    "\\\\server\\share\\private\\report.txt",
  ])
    assert.throws(
      () => validateState({ ...s, assetActivity: [{ ...feedback, note }] }),
      /反馈/,
    );
  validateState({
    ...s,
    assetActivity: [{ ...feedback, note: "输入/输出都稳定" }],
  });
});

test("延迟补记保留实际复制时间，最近使用排序不按补记时间；旧记录回退 at", async () => {
  const { app, call, state } = await setup();
  try {
    const assets = state.assets.filter((a) => a.type === "Prompt");
    const earlier = use(assets[0], { usedAt: "2026-09-28T00:00:00.000Z" });
    const later = use(assets[1], { usedAt: "2026-09-28T01:00:00.000Z" });
    const first = (
      await call("/asset-activity", {
        ...later,
        expectedRevision: state.revision,
      })
    ).body.state;
    const second = (
      await call("/asset-activity", {
        ...earlier,
        expectedRevision: first.revision,
      })
    ).body.state;
    const summaries = assets
      .map((a) => ({ id: a.id, ...usageOf(a, second.assetActivity) }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
    assert.equal(summaries[0].id, assets[1].id);
    const duplicate = await call("/asset-activity", {
      ...earlier,
      expectedRevision: state.revision,
    });
    assert.equal(duplicate.body.record.usedAt, earlier.usedAt);
    assert.equal(duplicate.body.state.assetActivity.length, 2);
    assert.equal(
      (
        await call("/asset-activity", {
          ...earlier,
          usedAt: later.usedAt,
          expectedRevision: second.revision,
        })
      ).status,
      409,
    );
    assert.equal(
      usageOf(assets[0], [stored(use(assets[0]))]).lastAt,
      "2026-09-29T00:00:00.000Z",
    );
  } finally {
    await app.close();
  }
});

const ordinaryFeedback = [
  "效果 4/5 分",
  "A/B 两版都试过",
  "json/yaml",
  "v1/v2",
  "中文/English",
  "and/or",
  "token: 省了很多",
  "输入/输出都稳定",
  "评分 4 / 5",
  // Schema 1 accepted these ambiguous strings; never invalidate an old store.
  "路径为~/",
  "路径为~/资料",
  "说明~/普通文字",
];
const sensitiveFeedback = [
  "/Users/demo/private.md",
  "来源是/Users/demo/private.md",
  "来源是/资料/私有.md",
  "路径：/single",
  "~/private",
  "路径为~/private",
  "C:/Users/demo/private.md",
  "C:\\Users\\demo\\private.md",
  "\\\\server\\share\\private.txt",
  "https://example.invalid/private",
  "file:///private.md",
  "sk-testsecret123",
  "ghp_testsecret123",
  "-----BEGIN PRIVATE KEY-----",
  "token=private-value",
  "token: abc123DEF456",
  "password=hunter2",
];

test("D1 普通评分/比较/格式/用量备注可保存，明确路径和凭据仍拒绝", () => {
  const s = seed(),
    a = s.assets.find((a) => a.type === "Prompt");
  const feedback = {
    schema: 1,
    id: "d1-feedback",
    assetId: a.id,
    versionId: current(a).id,
    at: "2026-09-29T00:00:00.000Z",
    kind: "feedback",
    rating: "good",
    note: "",
  };
  for (const note of ordinaryFeedback)
    assert.doesNotThrow(
      () => validateState({ ...s, assetActivity: [{ ...feedback, note }] }),
      note,
    );
  for (const note of [...sensitiveFeedback, current(a).content])
    assert.throws(
      () => validateState({ ...s, assetActivity: [{ ...feedback, note }] }),
      /反馈/,
      note,
    );
});

test("D1 备注通过 HTTP 保存后可回读及备份合并/重开，拒绝样例不入库", async () => {
  const { app, call, state } = await setup();
  try {
    const a = state.assets.find((a) => a.type === "Prompt");
    let revision = state.revision;
    for (const note of ordinaryFeedback) {
      const result = await call("/asset-activity", {
        id: randomUUID(),
        assetId: a.id,
        versionId: current(a).id,
        kind: "feedback",
        rating: "good",
        note,
        expectedRevision: revision,
      });
      assert.equal(result.status, 200, note);
      revision = result.body.state.revision;
    }
    for (const note of sensitiveFeedback) {
      const result = await call("/asset-activity", {
        id: randomUUID(),
        assetId: a.id,
        versionId: current(a).id,
        kind: "feedback",
        rating: "good",
        note,
        expectedRevision: revision,
      });
      assert.equal(result.status, 400, note);
    }
    const readback = (await call("/workspace")).body;
    assert.deepEqual(
      readback.assetActivity.map((r) => r.note),
      ordinaryFeedback,
    );
    assert.equal(readback.revision, revision);
    const backup = (await call("/backup")).body;
    const dir = await mkdtemp(join(tmpdir(), "usage-d1-"));
    let repo = await openRepository(dir);
    try {
      const preview = await repo.previewImport(backup);
      await repo.importBackup(backup, preview.token);
      await repo.close();
      repo = await openRepository(dir);
      assert.deepEqual(
        (await repo.read()).assetActivity.map((r) => r.note),
        ordinaryFeedback,
      );
    } finally {
      await repo.close();
      await rm(dir, { recursive: true, force: true });
    }
  } finally {
    await app.close();
  }
});

test("M1 查询等待在途写入完成；链接期间撤销仍找到记录，不误报不存在", async () => {
  const dir = await mkdtemp(join(tmpdir(), "usage-inflight-"));
  const repo = await openRepository(dir);
  const deliveries = createDeliveries(repo);
  let resume, entered;
  const gate = new Promise((resolve) => {
    resume = resolve;
  });
  const inside = new Promise((resolve) => {
    entered = resolve;
  });
  try {
    const state = await repo.write(seed(), { initialize: true });
    const a = state.assets.find((a) => a.type === "Skill");
    const link = await deliveries.create(
      { assetId: a.id, versionId: current(a).id },
      "http://127.0.0.1",
    );
    const activity = createAssetActivity(
      {
        ...repo,
        updateActivity: (update, options) =>
          repo.updateActivity(async (...args) => {
            const records = await update(...args);
            entered();
            await gate;
            return records;
          }, options),
      },
      deliveries,
    );
    const payload = use(a, { deliveryId: link.id });
    const writing = activity.append({
      ...payload,
      expectedRevision: state.revision,
    });
    await inside;
    deliveries.revoke(link.id);
    let settled = false;
    const querying = activity.query(payload.id).then((result) => {
      settled = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const prematurelySettled = settled;
    resume();
    await writing;
    const result = await querying;
    assert.equal(prematurelySettled, false, "查询不得越过已进入写队列的提交");
    assert.equal(result.record.id, payload.id);
    assert.equal(result.state.assetActivity.length, 1);
    const pointer = await readFile(join(dir, "CURRENT.json"));
    await activity.query(payload.id);
    assert.deepEqual(await readFile(join(dir, "CURRENT.json")), pointer);
  } finally {
    resume();
    deliveries.close();
    await repo.close();
    await rm(dir, { recursive: true, force: true });
  }
});

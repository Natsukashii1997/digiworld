import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { startServer } from "../server/http.mjs";
import { seed, makeAsset, revise, current } from "../src/store.js";
import { parse, stringify } from "../src/serialization.js";

async function setup(run) {
  const directory = await mkdtemp(join(tmpdir(), "guiji-delivery-"));
  let time = Date.now();
  const app = await startServer({
    directory,
    port: 0,
    staticRoot: join(import.meta.dirname, "../dist"),
    clock: () => time,
  });
  const session = await (
    await fetch(app.url + "/api/session", {
      headers: { "x-workbench-client": "1" },
    })
  ).json();
  const call = async (path, data) => {
    const res = await fetch(app.url + "/api" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        "x-workbench-token": session.token,
        "content-type": "application/json",
      },
      ...(data === undefined ? {} : { body: stringify(data) }),
    });
    return { status: res.status, data: parse(await res.text()) };
  };
  // 交付链接只剩设计 Skill 的旧版 ZIP 包在用（Skill 资产的交付已下线，#111），夹具用设计包。
  const skill = makeAsset({
    type: "Design",
    title: "中文卡片标题",
    content: "请生成一张留白海报。",
    design: { kind: "skill", skillName: "verified-name" },
    files: [
      {
        path: "SKILL.md",
        data: "---\nname: verified-name\n---\n第一版",
        text: true,
        mode: 0o644,
      },
      {
        path: "assets/二进制.bin",
        data: new Uint8Array([0, 255, 128]),
        text: false,
        mode: 0o644,
      },
    ],
  });
  await app.repository.write(
    { ...seed(), assets: [skill] },
    { initialize: true },
  );
  try {
    await run({
      app,
      call,
      skill,
      advance: (ms) => {
        time += ms;
      },
      session,
    });
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test("口令的真实本机链接固定版本、包含全部文件与可复核哈希", () =>
  setup(async ({ app, call, skill }) => {
    const result = await call("/deliveries", {
      assetId: skill.id,
      versionId: current(skill).id,
    });
    assert.equal(result.status, 200);
    const d = result.data;
    assert.match(d.instructions, /verified-name/);
    assert.match(d.instructions, /仅限本机/);
    assert.match(d.instructions, /全局.*项目/);
    assert.match(d.instructions, /SHA-256/);
    assert.equal(Date.parse(d.expiresAt) - Date.parse(d.createdAt), 600000);
    const state = await app.repository.read();
    state.assets[0] = revise(skill, {
      files: [{ path: "SKILL.md", data: "第二版", text: true }],
    });
    await app.repository.write(state);
    const response = await fetch(d.url);
    assert.equal(response.status, 200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(createHash("sha256").update(bytes).digest("hex"), d.zipHash);
    const zip = unzipSync(bytes);
    assert.match(strFromU8(zip["SKILL.md"]), /第一版/);
    assert.deepEqual(Array.from(zip["assets/二进制.bin"]), [0, 255, 128]);
    assert.equal(
      (await call("/deliveries?assetId=" + skill.id)).data[0].downloads,
      1,
    );
    assert.equal((await app.repository.read()).revision, 2);
  }));

test("本机链接到期、撤销、归档后拒绝下载；令牌不能操作主库", () =>
  setup(async ({ app, call, skill, advance, session }) => {
    const create = async () =>
      (
        await call("/deliveries", {
          assetId: skill.id,
          versionId: current(skill).id,
        })
      ).data;
    const first = await create();
    assert.equal(
      (await fetch(first.url, { headers: { origin: "https://evil.example" } }))
        .status,
      403,
    );
    assert.equal(
      (await fetch(first.url, { headers: { "sec-fetch-site": "cross-site" } }))
        .status,
      403,
    );
    assert.equal(
      (await fetch(app.url + "/api/deliveries?assetId=" + skill.id)).status,
      403,
    );
    assert.equal(
      (
        await fetch(app.url + "/api/workspace", {
          headers: {
            "x-workbench-token": first.url.match(/([a-f0-9]{64})\.zip/)[1],
          },
        })
      ).status,
      403,
    );
    assert.ok(!first.instructions.includes(session.token));
    assert.equal(
      (await call("/deliveries/copied", { id: first.id })).status,
      200,
    );
    advance(599999);
    assert.equal((await fetch(first.url)).status, 200);
    advance(1);
    assert.equal((await fetch(first.url)).status, 410);
    const second = await create();
    assert.notEqual(second.url, first.url);
    await call("/deliveries/revoke", { id: second.id });
    assert.equal((await fetch(second.url)).status, 410);
    const third = await create();
    const backup = (await call("/backup")).data;
    assert.ok(!JSON.stringify(backup).includes(third.url));
    const state = await app.repository.read();
    state.assets[0].archived = true;
    await app.repository.write(state);
    assert.equal((await fetch(third.url)).status, 404);
    assert.equal(
      (
        await call("/deliveries", {
          assetId: skill.id,
          versionId: current(skill).id,
        })
      ).status,
      404,
    );
  }));

test("容量满拒绝新增但保留原链接；服务重启使全部链接失效", () =>
  setup(async ({ app, call, skill }) => {
    const ids = [];
    for (let i = 0; i < 20; i++) {
      const result = await call("/deliveries", {
        assetId: skill.id,
        versionId: current(skill).id,
      });
      assert.equal(result.status, 200);
      ids.push(result.data);
    }
    assert.equal(
      (
        await call("/deliveries", {
          assetId: skill.id,
          versionId: current(skill).id,
        })
      ).status,
      429,
    );
    assert.equal((await fetch(ids[0].url)).status, 200);
    const directory = app.repository.directory,
      port = Number(new URL(app.url).port);
    await app.close();
    const restarted = await startServer({
      directory,
      port,
      staticRoot: join(import.meta.dirname, "../dist"),
    });
    try {
      assert.equal((await fetch(ids[0].url)).status, 410);
    } finally {
      await restarted.close();
    }
  }));

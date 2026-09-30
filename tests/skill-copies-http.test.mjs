import test from "node:test";
import assert from "node:assert/strict";
import { copyFixture } from "./copy-fixture.mjs";

async function session(app) {
  return (
    await fetch(app.url + "/api/session", {
      headers: { "x-workbench-client": "1" },
    })
  ).json();
}

test("HTTP 从明确目标发现单一候选，关联固定版本并可重新核对、解除", async (t) => {
  const app = await copyFixture();
  t.after(() => app.close());

  const discovered = await app.call("/skill-copies/discover", {
    assetId: app.asset.id,
    versionId: app.asset.versions[0].id,
    targetId: app.target.id,
  });
  const candidate = discovered.items.find(
    (item) => item.status === "candidate" && item.path === app.location,
  );
  assert.ok(candidate);

  const preview = await app.call("/skill-copies/preview", {
    token: discovered.token,
    candidateId: candidate.id,
  });
  assert.equal(preview.comparison.status, "identical");
  assert.equal(preview.location, app.location);

  const bound = await app.call("/skill-copies/bind", {
    token: preview.token,
    revision: preview.revision,
  });
  const relation = bound.connections.skillCopies[0];
  assert.equal(relation.assetId, app.asset.id);
  assert.equal(relation.versionId, app.asset.versions[0].id);
  assert.equal(relation.targetId, app.target.id);

  const checked = await app.call("/skill-copies/check", { id: relation.id });
  assert.equal(checked.status, "identical");

  const removed = await app.call("/skill-copies/remove", {
    id: relation.id,
    revision: bound.revision,
  });
  assert.deepEqual(removed.connections.skillCopies, []);
  assert.equal(await app.sourceUnchanged(), true);
});

test("Skill 副本 HTTP 拒绝无会话、外部 Origin 和任意路径字段", async (t) => {
  const app = await copyFixture();
  t.after(() => app.close());
  const active = await session(app);
  const input = {
    assetId: app.asset.id,
    versionId: app.asset.versions[0].id,
    targetId: app.target.id,
  };
  const request = (headers, value = input) =>
    fetch(app.url + "/api/skill-copies/discover", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(value),
    });

  assert.equal((await request({})).status, 403);
  assert.equal(
    (
      await request({
        "x-workbench-token": active.token,
        origin: "https://evil.example",
      })
    ).status,
    403,
  );
  const forged = await request(
    { "x-workbench-token": active.token },
    { ...input, path: "/private/tmp/unapproved-skill" },
  );
  assert.equal(forged.status, 400);
  assert.match((await forged.json()).error, /字段无效/);
});

test("备份导入不会激活其中的外来 Skill 副本路径", async (t) => {
  const app = await copyFixture();
  t.after(() => app.close());
  const before = await app.call("/workspace");
  const backup = await app.call("/backup");
  const foreign = {
    schema: 1,
    id: "copy-foreign",
    assetId: app.asset.id,
    versionId: app.asset.versions[0].id,
    targetId: app.target.id,
    targetSignature: "a".repeat(64),
    scopeSignature: "b".repeat(64),
    root: "/private/tmp/foreign-skill-root",
    location: "/private/tmp/foreign-skill-root/unapproved",
    boundFingerprint: "c".repeat(64),
    boundAt: "2026-09-26T00:00:00.000Z",
  };
  backup.state.connections.skillCopies = [foreign];

  const preview = await app.call("/import/preview", backup);
  const imported = await app.call("/import/confirm", {
    backup,
    token: preview.token,
  });
  assert.deepEqual(
    imported.connections.skillCopies,
    before.connections.skillCopies,
  );
  await assert.rejects(app.call("/skill-copies/check", { id: foreign.id }), {
    status: 404,
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRepository } from "../server/repository.mjs";
import { makeAsset, seed, revise } from "../src/store.js";
import { retainedDemoIds } from "../src/asset-origin.js";

const skill = () =>
  makeAsset({
    type: "Skill",
    title: "来源示例",
    content: "# 原文",
    files: [{ path: "SKILL.md", data: "# 原文", text: true }],
  });

test("保留示例计数只包含实际示例，不计个人资产、缺失源或重复副本", () => {
  const demo = { ...skill(), demo: true },
    personal = skill();
  const derived = {
    ...skill(),
    origin: {
      kind: "derived",
      assetId: personal.id,
      versionId: personal.versions[0].id,
    },
  };
  const copies = [
    { assetId: demo.id },
    { assetId: personal.id },
    { assetId: "missing" },
    { assetId: demo.id },
  ];
  assert.deepEqual(
    [...retainedDemoIds([demo, personal, derived], copies)],
    [demo.id],
  );
});
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "guiji-origins-"));
  const repo = await openRepository(dir);
  t.after(async () => {
    await repo.close();
    await rm(dir, { recursive: true, force: true });
  });
  const state = await repo.write(
    { ...seed(), assets: [] },
    { initialize: true },
  );
  return { repo, state };
}
test("专用资产写入保留本机来源，普通保存不能伪造或改变来源，旧资产仍兼容", async (t) => {
  const { repo, state } = await fixture(t);
  const imported = {
    ...skill(),
    origin: {
      kind: "local",
      location: "/fixture/skills/source",
      fingerprint: "a".repeat(64),
      capturedAt: "2026-09-26T01:00:00.000Z",
    },
  };
  const saved = await repo.updateAssets((assets) => [...assets, imported], {
    expectedRevision: state.revision,
  });
  assert.deepEqual((await repo.read()).assets[0].origin, imported.origin);
  await assert.rejects(
    repo.write({
      ...saved,
      assets: [
        { ...imported, origin: { ...imported.origin, location: "/elsewhere" } },
      ],
    }),
    /来源.*不可/,
  );
  await assert.rejects(
    repo.write({
      ...saved,
      assets: [...saved.assets, { ...skill(), origin: imported.origin }],
    }),
    /来源.*专用/,
  );
  const next = await repo.write({
    ...saved,
    assets: [revise(imported, { title: "我的新标题" }), skill()],
  });
  assert.deepEqual(next.assets[0].origin, imported.origin);
  assert.equal(next.assets[0].versions[0].title, "来源示例");
  assert.equal(next.assets[1].origin, undefined);
});
test("独立个人改版保留固定源身份，源后续变化不传播且来源示例不能清除", async (t) => {
  const { repo, state } = await fixture(t);
  const source = { ...skill(), demo: true };
  const original = await repo.write({ ...state, assets: [source] });
  const derived = {
    ...skill(),
    origin: {
      kind: "derived",
      assetId: source.id,
      versionId: source.versions[0].id,
    },
  };
  const saved = await repo.updateAssets((assets) => [...assets, derived], {
    expectedRevision: original.revision,
  });
  const changed = await repo.write({
    ...saved,
    assets: [revise(source, { content: "# 新原文" }), derived],
  });
  assert.equal(changed.assets[1].versions[0].content, "# 原文");
  assert.deepEqual(changed.assets[1].origin, derived.origin);
  await assert.rejects(
    repo.write({ ...changed, assets: [derived] }),
    /来源.*保留|引用.*不能/,
  );
  await assert.rejects(
    repo.write({
      ...changed,
      assets: [
        changed.assets[0],
        {
          ...derived,
          origin: {
            ...derived.origin,
            versionId: changed.assets[0].versions[1].id,
          },
        },
      ],
    }),
    /来源.*不可/,
  );
});
test("来源随备份保留且合并幂等，同资产不同来源必须拒绝冲突", async (t) => {
  const { repo, state } = await fixture(t);
  const collected = {
    ...skill(),
    origin: {
      kind: "local",
      location: "/fixture/skills/source",
      fingerprint: "b".repeat(64),
      capturedAt: "2026-09-26T02:00:00.000Z",
    },
  };
  const backup = { ...state, assets: [collected] };
  const preview = await repo.previewImport(backup);
  const restored = await repo.importBackup(backup, preview.token);
  assert.deepEqual(restored.assets[0].origin, collected.origin);
  const again = await repo.previewImport(backup);
  assert.equal(again.summary.added.assets, 0);
  assert.equal((await repo.importBackup(backup, again.token)).assets.length, 1);
  await assert.rejects(
    repo.previewImport({
      ...backup,
      assets: [
        { ...collected, origin: { ...collected.origin, location: "/forged" } },
      ],
    }),
    /来源|冲突/,
  );
});

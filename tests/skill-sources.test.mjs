import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  cp,
  symlink,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRepository } from "../server/repository.mjs";
import { createSkillSources } from "../server/skill-sources.mjs";
import { seed } from "../src/store.js";
async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), "guiji-source-"));
  const root = join(base, "skills"),
    source = join(root, "example");
  await mkdir(join(source, "assets"), { recursive: true });
  await writeFile(
    join(source, "SKILL.md"),
    "---\nname: example\n---\n# 完整原文\n",
  );
  await writeFile(
    join(source, "assets", "bytes.bin"),
    new Uint8Array([0, 128, 255]),
  );
  const repository = await openRepository(join(base, "db"));
  await repository.write({ ...seed(), assets: [] }, { initialize: true });
  let now = Date.parse("2026-09-26T03:00:00.000Z");
  const sources = createSkillSources(repository, () => now);
  t.after(async () => {
    await repository.close();
    await rm(base, { recursive: true, force: true });
  });
  return { root, source, repository, sources, advance: (ms) => (now += ms) };
}
test("显式扫描与完整预览不写主库，确认收录保留原字节和固定来源，重试不重复", async (t) => {
  const { root, source, repository, sources } = await fixture(t);
  const before = await repository.read();
  const scan = await sources.discover({ roots: [root] });
  assert.equal(scan.items.length, 1);
  const p = await sources.preview({ candidateId: scan.items[0].id });
  assert.equal(p.content, "---\nname: example\n---\n# 完整原文\n");
  assert.equal(p.files.find((f) => f.path === "assets/bytes.bin").bytes, 3);
  assert.deepEqual(await repository.read(), before);
  const result = await sources.import({
    token: p.token,
    revision: p.revision,
    title: "已收录技能",
  });
  assert.equal(result.alreadyImported, false);
  const a = result.state.assets.find((a) => a.id === result.assetId);
  assert.equal(a.origin.kind, "local");
  assert.equal(a.origin.fingerprint, p.fingerprint);
  assert.equal(a.versions[0].title, "已收录技能");
  assert.deepEqual(
    [...a.versions[0].files.find((f) => f.path === "assets/bytes.bin").data],
    [0, 128, 255],
  );
  assert.equal(await readFile(join(source, "SKILL.md"), "utf8"), p.content);
  const retry = await sources.import({
    token: p.token,
    revision: p.revision,
    title: "已收录技能",
  });
  assert.equal(retry.assetId, result.assetId);
  assert.equal(retry.state.assets.length, 1);
  const p2 = await sources.preview({ candidateId: scan.items[0].id });
  assert.equal(p2.existingAssetId, result.assetId);
  const same = await sources.import({
    token: p2.token,
    revision: p2.revision,
    title: "重复不新增",
  });
  assert.equal(same.assetId, result.assetId);
  assert.equal(same.state.revision, result.state.revision);
});
test("个人改版从服务端固定 Skill 版本完整派生，创建独立历史且并发不重复", async (t) => {
  const { root, repository, sources } = await fixture(t);
  const scan = await sources.discover({ roots: [root] });
  const p = await sources.preview({ candidateId: scan.items[0].id });
  const imported = await sources.import({
    token: p.token,
    revision: p.revision,
    title: "原始包",
  });
  const source = imported.state.assets[0],
    version = source.versions[0];
  const input = {
    assetId: source.id,
    versionId: version.id,
    revision: imported.state.revision,
    title: "我的改版",
  };
  const results = await Promise.allSettled([
    sources.derive(input),
    sources.derive(input),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const result = results.find((r) => r.status === "fulfilled").value;
  const derived = result.state.assets.find((a) => a.id === result.assetId);
  assert.notEqual(derived.id, source.id);
  assert.notEqual(derived.versions[0].id, version.id);
  assert.equal(derived.demo, false);
  assert.deepEqual(derived.origin, {
    kind: "derived",
    assetId: source.id,
    versionId: version.id,
  });
  assert.deepEqual(derived.versions[0].files, version.files);
  assert.equal(derived.versions[0].content, version.content);
  assert.deepEqual(
    result.state.assets.find((a) => a.id === source.id),
    source,
  );
  await assert.rejects(
    sources.derive({
      ...input,
      revision: result.state.revision,
      versionId: "missing",
    }),
    /版本|不存在/,
  );
  const archived = await repository.write({
    ...result.state,
    assets: result.state.assets.map((a) =>
      a.id === source.id ? { ...a, archived: true } : a,
    ),
  });
  await assert.rejects(
    sources.derive({ ...input, revision: archived.revision }),
    /归档/,
  );
});
test("确认收录同时绑定预览来源身份，同内容目录别名改向也必须重新预览", async (t) => {
  const { root, source, repository, sources } = await fixture(t);
  const alias = join(root, "a-alias"),
    second = join(root, "z-second");
  await cp(source, second, { recursive: true });
  await symlink(source, alias);
  const scan = await sources.discover({ roots: [root] });
  const candidate = scan.items.find((item) => item.path === alias);
  assert.ok(candidate);
  const preview = await sources.preview({ candidateId: candidate.id });
  await unlink(alias);
  await symlink(second, alias);
  const moved = await sources.preview({ candidateId: candidate.id });
  assert.equal(moved.fingerprint, preview.fingerprint);
  assert.notEqual(moved.location, preview.location);
  await assert.rejects(
    sources.import({
      token: preview.token,
      revision: preview.revision,
      title: "不可接受改向",
    }),
    /来源.*变化/,
  );
  assert.equal((await repository.read()).assets.length, 0);
});
test("来源新增文件、预览过期或主库变化都阻止旧确认，不产生部分收录", async (t) => {
  const { root, source, repository, sources, advance } = await fixture(t);
  const scan = await sources.discover({ roots: [root] });
  const request = { candidateId: scan.items[0].id };
  const p = await sources.preview(request);
  await writeFile(join(source, "added.txt"), "新资源");
  await assert.rejects(
    sources.import({
      token: p.token,
      revision: p.revision,
      title: "不能旧确认",
    }),
    /来源.*变化/,
  );
  assert.equal((await repository.read()).assets.length, 0);
  const current = await sources.preview(request);
  advance(300001);
  await assert.rejects(
    sources.import({
      token: current.token,
      revision: current.revision,
      title: "过期",
    }),
    /过期/,
  );
  const concurrent = await sources.preview(request);
  const state = await repository.read();
  await repository.write({
    ...state,
    notes: [
      { id: "new-note", text: "另一页保存", at: new Date().toISOString() },
    ],
  });
  await assert.rejects(
    sources.import({
      token: concurrent.token,
      revision: concurrent.revision,
      title: "并发",
    }),
    /主库.*变化/,
  );
  assert.equal((await repository.read()).assets.length, 0);
  await sources.discover({ roots: [root] });
  await assert.rejects(
    sources.import({
      token: concurrent.token,
      revision: concurrent.revision,
      title: "换范围",
    }),
    /过期|失效/,
  );
  await assert.rejects(
    sources.preview({ candidateId: "not-discovered", path: source }),
    /失效/,
  );
});

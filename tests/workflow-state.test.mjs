import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRepository } from "../server/repository.mjs";
import { seed, makeAsset, current, revise, restore } from "../src/store.js";
import { compareVersions } from "../src/version-diff.js";
import { mergeBackup } from "../server/merge.mjs";

async function withRepository(fn) {
  const directory = await mkdtemp(join(tmpdir(), "guiji-workflow-"));
  const repository = await openRepository(directory);
  try {
    await fn(repository);
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
}
const sample = () => {
  const prompt = makeAsset({
    type: "Prompt",
    title: "同名资产",
    content: "固定原文",
  });
  const ref = { assetId: prompt.id, versionId: current(prompt).id };
  const flow = makeAsset({
    type: "Workflow",
    title: "自己的流程",
    content: "先判断再交付",
    references: [ref],
  });
  return { prompt, flow, ref };
};
test("工作流指定引用在保存回读后保持，更新上游不静默升级", () =>
  withRepository(async (r) => {
    const { prompt, flow, ref } = sample();
    const saved = await r.write(
      { ...seed(), assets: [prompt, flow] },
      { initialize: true },
    );
    assert.deepEqual(current(saved.assets[1]).references, [ref]);
    await r.write({
      ...saved,
      assets: [
        revise(saved.assets[0], { content: "上游新版" }),
        saved.assets[1],
      ],
    });
    const read = await r.read();
    assert.deepEqual(current(read.assets[1]).references, [ref]);
    assert.equal(read.assets[0].versions[0].content, "固定原文");
  }));
test("恢复缺省引用的旧流程会清空当前引用，旧历史不改写且仍可恢复引用版", () =>
  withRepository(async (r) => {
    const { prompt, ref } = sample();
    const old = makeAsset({
      type: "Workflow",
      title: "旧流程",
      content: "旧正文",
    });
    const oldVersion = structuredClone(current(old));
    const latest = revise(old, { references: [ref] });
    const restored = restore(latest, oldVersion.id);
    assert.deepEqual(current(restored).references, []);
    assert.deepEqual(restored.versions[0], oldVersion);
    assert.equal(Object.hasOwn(restored.versions[0], "references"), false);
    assert.deepEqual(
      current(restore(restored, current(latest).id)).references,
      [ref],
    );
    const saved = await r.write(
      { ...seed(), assets: [prompt, restored] },
      { initialize: true },
    );
    const oldBackup = { ...saved, assets: [prompt, old] };
    assert.deepEqual(mergeBackup(saved, oldBackup).state.assets[1], restored);
    assert.deepEqual(mergeBackup(saved, saved).state.assets[1], restored);
    const corrupt = structuredClone(saved);
    corrupt.assets[1].versions[1].references = [];
    await assert.rejects(r.write(corrupt), /历史版本不可覆盖/);
  }));
test("引用新增和更换版本进入历史比较，缺省与空引用等价", () => {
  const { flow, ref } = sample();
  const before = { ...current(flow), references: undefined };
  const changed = compareVersions(before, current(flow));
  assert.equal(changed.identical, false);
  assert.equal(changed.fields[0].key, "references");
  assert.equal(
    compareVersions(before, { ...before, references: [] }).identical,
    true,
  );
  assert.equal(
    compareVersions(current(flow), {
      ...current(flow),
      references: [{ ...ref, versionId: "v2" }],
    }).identical,
    false,
  );
});
test("个人流程任意历史引用的示例不能被移除，未引用示例仍可清理", () =>
  withRepository(async (r) => {
    const { prompt, flow } = sample();
    prompt.demo = true;
    const unreferenced = makeAsset({
      type: "Prompt",
      title: "可移除示例",
      demo: true,
    });
    const changed = revise(flow, { references: [] });
    const saved = await r.write(
      { ...seed(), assets: [prompt, changed, unreferenced] },
      { initialize: true },
    );
    await assert.rejects(
      r.write({ ...saved, assets: [changed] }),
      /被工作流历史或派生来源引用/,
    );
    const kept = await r.write({ ...saved, assets: [prompt, changed] });
    assert.equal(kept.assets.length, 2);
  }));
test("引用形状、唯一性、类型和数量在主库写入边界校验；缺失指针可保存为待修正", () =>
  withRepository(async (r) => {
    const { prompt, flow, ref } = sample();
    const saved = await r.write(
      { ...seed(), assets: [prompt, flow] },
      { initialize: true },
    );
    for (const references of [
      null,
      {},
      [ref, ref],
      [{ ...ref, extra: true }],
      [{ assetId: "../x", versionId: "bad" }],
      [{ assetId: flow.id, versionId: current(flow).id }],
      Array.from({ length: 51 }, (_, i) => ({
        assetId: `x${i}`,
        versionId: "v1",
      })),
    ]) {
      await assert.rejects(
        r.write({ ...saved, assets: [prompt, revise(flow, { references })] }),
        /数据校验失败/,
      );
    }
    await assert.rejects(
      r.write({
        ...saved,
        assets: [revise(prompt, { references: [ref] }), flow],
      }),
      /数据校验失败/,
    );
    const missing = { assetId: "missing", versionId: "v0" };
    const result = await r.write({
      ...saved,
      assets: [prompt, revise(flow, { references: [missing] })],
    });
    assert.deepEqual(current(result.assets[1]).references, [missing]);
  }));

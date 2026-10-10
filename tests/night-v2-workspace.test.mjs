import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRepository } from "../server/repository.mjs";
import { validateState } from "../server/schema.mjs";
import { seed } from "../src/store.js";
import {
  addSlot, archiveSupplement, createCustomChip, deleteCustomChip, removeSlot,
  nightV2Of, reviseChip,
} from "../src/night-v2-model.js";

async function rejectForgedWrite(repository, saved, change, pattern) {
  const forged = structuredClone(saved);
  forged.nightV2.revision += 1;
  change(forged.nightV2);
  validateState(forged); // 单个快照的形状合法，必须由跨版本校验拦截。
  await assert.rejects(repository.write(forged), pattern);
  assert.deepEqual((await repository.read()).nightV2, saved.nightV2);
}

test("夜巡 v2 独立存储兼容旧工作台，客户端不能伪造执行批准", async () => {
  const initial = seed();
  validateState(initial);
  const old = { ...initial };
  delete old.nightV2;
  validateState(old);
  assert.equal(nightV2Of(old).approval, null);
  assert.throws(() => validateState({
    ...initial,
    nightV2: {
      ...initial.nightV2,
      approval: { schema: "night-v2-approval", planRevision: initial.nightV2.revision },
    },
  }), /夜巡 v2|夜巡 v2 计划/);

  const directory = await mkdtemp(join(tmpdir(), "guiji-night-v2-state-"));
  const repository = await openRepository(directory);
  try {
    const stored = await repository.write(initial, { initialize: true });
    const next = addSlot(stored, {
      chipId: "learn", goal: "合成主题", acceptance: ["至少两处来源交叉印证"],
      tonightSupplement: "只在这次使用的合成补充",
    }, { id: "synthetic-slot-1", expectedRevision: stored.nightV2.revision });
    const saved = await repository.write(next);
    const readback = await repository.read();
    assert.equal(saved.nightV2.slots.length, 1);
    assert.deepEqual(readback.nightV2, saved.nightV2);
    assert.deepEqual(readback.night, stored.night, "旧人民币草稿和旧执行开关未被 v2 写入改动");
    assert.equal(readback.nightV2.approval, null);
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("夜巡 v2 主库拒绝改写模板旧版与现存插槽锁版，补充归档只追加", async () => {
  const directory = await mkdtemp(join(tmpdir(), "guiji-night-v2-history-"));
  const repository = await openRepository(directory);
  try {
    const initial = await repository.write(seed(), { initialize: true });
    const slotted = await repository.write(addSlot(initial, {
      chipId: "learn", goal: "合成主题", acceptance: ["形成可核验结论"],
      tonightSupplement: "仅供今晚使用的合成说明",
    }, { id: "synthetic-slot-1", expectedRevision: initial.nightV2.revision }));
    const revised = await repository.write(reviseChip(slotted, "learn", {
      templatePrompt: "新版合成学习提示词",
    }, {
      expectedRevision: 1, expectedPlanRevision: slotted.nightV2.revision,
      at: "2026-10-07T00:00:00.000Z",
    }));

    await rejectForgedWrite(repository, revised, (plan) => {
      plan.chips.find((chip) => chip.id === "learn").templateHistory[0].snapshot.name = "被伪造的旧快照";
    }, /夜巡芯片模板历史不能改写/);
    await rejectForgedWrite(repository, revised, (plan) => {
      plan.slots[0].chipRevision = 2;
    }, /夜巡现存插槽的芯片及锁定版本不能改写/);
    await rejectForgedWrite(repository, revised, (plan) => {
      plan.slots[0].chipId = "review";
    }, /夜巡现存插槽的芯片及锁定版本不能改写/);

    const archived = await repository.write(archiveSupplement(revised, "synthetic-slot-1", {
      at: "2026-10-07T00:05:00.000Z", expectedRevision: revised.nightV2.revision,
    }));
    assert.equal(archived.nightV2.supplementArchive.length, 1);
    await rejectForgedWrite(repository, archived, (plan) => {
      plan.supplementArchive = [];
    }, /夜巡今晚补充归档只能追加/);
    await rejectForgedWrite(repository, archived, (plan) => {
      plan.supplementArchive[0].text = "篡改后的说明";
    }, /夜巡今晚补充归档只能追加/);

    const added = await repository.write(createCustomChip(archived, {
      name: "合成自定义", templatePrompt: "只生成合成报告", acceptance: ["附证据"],
    }, { id: "synthetic-custom", at: "2026-10-07T00:06:00.000Z",
      expectedRevision: archived.nightV2.revision }));
    const customSlotted = await repository.write(addSlot(added, {
      chipId: "synthetic-custom", goal: "生成合成报告",
    }, { id: "synthetic-custom-slot", expectedRevision: added.nightV2.revision }));
    const customUnslotted = await repository.write(removeSlot(customSlotted, "synthetic-custom-slot", {
      expectedRevision: customSlotted.nightV2.revision,
    }));
    const deleted = await repository.write(deleteCustomChip(customUnslotted, "synthetic-custom", {
      expectedRevision: customUnslotted.nightV2.revision,
    }));
    assert.equal(deleted.nightV2.chips.some((chip) => chip.id === "synthetic-custom"), false);
    assert.equal(deleted.nightV2.supplementArchive.length, 1);
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

// 夜巡 v2 动作写回主库的窄适配器。只在合成动作服务明确调用时写入本机工作台。
import { addSlot, archiveSupplement, nightV2Of, removeSlot } from '../src/night-v2-model.js';

const SLOT_ID = /^resume-[a-f0-9]{24}$/;
const OPERATION_ID = /^[a-f0-9-]{36}$/;
const RUN_ID = /^[a-f0-9-]{36}$/;
const SOURCE_SLOT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const SHA = /^[a-f0-9]{7,64}$/;
const BRANCH = /^night\/[A-Za-z0-9._/-]{1,120}$/;
const clone = value => structuredClone(value);
const fail = (code, message) => { const error = new Error(message); error.code = code;
  error.status = 409; throw error; };
const continuationOf = (operationId, source) => ({ runId: source.runId,
  slotId: source.slotId, projectId: source.projectId, branch: source.branch,
  lastGreenSha: source.lastGreenSha, operationId });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function validateContinuationInput(operationId, newSlotId, source) {
  if (!OPERATION_ID.test(operationId ?? '') || !SLOT_ID.test(newSlotId ?? '') ||
    !source || !RUN_ID.test(source.runId ?? '') || !SOURCE_SLOT_ID.test(source.slotId ?? '') ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(source.projectId ?? '') ||
    !BRANCH.test(source.branch ?? '') || !SHA.test(source.lastGreenSha ?? '') ||
    !SOURCE_SLOT_ID.test(source.chipId ?? '') || typeof source.goal !== 'string' ||
    !Array.isArray(source.acceptance) || !source.acceptance.length)
    fail('CONTINUATION_INVALID', '续跑写入来源无效');
}

function noteText(source, target, text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 5000 ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))
    fail('SUGGESTION_INVALID', '建议正文无效');
  const content = text.trim().replace(/[\r\n]+/g, ' ');
  const provenance = `来源：夜巡 ${source.runId} / ${source.slotId} · ${source.section} 第 ${source.index + 1} 条`;
  return target === 'pending' ? `- [ ] ${content}\n${provenance}` : `${content}\n${provenance}`;
}

export function createNightV2WorkspaceActions({ repository, harness, clock = Date.now } = {}) {
  if (typeof repository?.read !== 'function' || typeof repository?.write !== 'function')
    fail('WORKSPACE_UNAVAILABLE', '工作台写回器不可用');

  async function writeContinuation({ phase, operationId, newSlotId, source } = {}) {
    validateContinuationInput(operationId, newSlotId, source);
    if (phase !== 'apply' && phase !== 'query') fail('ACTION_INVALID', '续跑写回阶段无效');
    const expected = continuationOf(operationId, source);
    const inspect = state => {
      const slot = nightV2Of(state).slots.find(item => item.id === newSlotId);
      if (!slot) return { status: 'not_started' };
      if (!same(slot.continueFrom, expected) || slot.projectId !== source.projectId ||
        slot.chipId !== source.chipId)
        return { status: 'unknown' };
      return { status: 'queued', targetId: slot.id };
    };
    if (phase === 'query') return inspect(await repository.read());
    let nightSource;
    try { nightSource = await harness?.morningSource({ runId: source.runId }); }
    catch { /* 没有锁定夜巡来源时绝不清空当前计划。 */ }
    for (let attempt = 0; attempt < 3; attempt++) {
      const state = await repository.read();
      const existing = inspect(state);
      if (existing.status !== 'not_started') return existing;
      const plan = nightV2Of(state);
      if (!plan.chips.some(chip => chip.id === source.chipId))
        return { status: 'not_started' };
      const priorSlots = nightSource?.slots;
      const stalePriorPlan = Number.isSafeInteger(source.sourcePlanRevision) &&
        nightSource?.planRevision === source.sourcePlanRevision &&
        plan.revision === source.sourcePlanRevision &&
        Array.isArray(priorSlots) && plan.slots.length === priorSlots.length &&
        plan.slots.every((slot, index) => slot.id === priorSlots[index].slotId &&
          slot.chipId === priorSlots[index].chipId && slot.chipRevision === priorSlots[index].chipRevision &&
          slot.projectId === priorSlots[index].projectId && slot.goal === priorSlots[index].goal &&
          same(slot.acceptance, priorSlots[index].acceptance));
      if (!stalePriorPlan && plan.slots.length >= 4) return { status: 'not_started' };
      let draft = state;
      if (stalePriorPlan) for (const slot of plan.slots) {
        draft = archiveSupplement(draft, slot.id, { at: new Date(clock()).toISOString() });
        draft = removeSlot(draft, slot.id);
      }
      const next = addSlot(draft, { chipId: source.chipId, projectId: source.projectId,
        goal: source.goal, acceptance: clone(source.acceptance), continueFrom: expected },
      { id: newSlotId, expectedRevision: nightV2Of(draft).revision });
      try { await repository.write(next); return inspect(await repository.read()); }
      catch (error) {
        if (!/另一个页面已更新主库/.test(String(error.message)) || attempt === 2) throw error;
      }
    }
  }

  async function writeSuggestion({ phase, operationId, source, target, text } = {}) {
    if ((phase !== 'apply' && phase !== 'query') || !OPERATION_ID.test(operationId ?? '') ||
      !RUN_ID.test(source?.runId ?? '') || !SOURCE_SLOT_ID.test(source?.slotId ?? '') ||
      !['learning', 'project', 'cognition'].includes(source?.section) ||
      !Number.isSafeInteger(source?.index) || source.index < 0 ||
      !['note', 'pending'].includes(target))
      fail('SUGGESTION_INVALID', '建议写回范围无效');
    const noteId = `nightv2_${operationId.replaceAll('-', '')}`;
    const body = noteText(source, target, text);
    const inspect = state => {
      const note = state.notes.find(item => item.id === noteId);
      if (!note) return { status: 'not_started' };
      if (note.text !== body || (target === 'pending' ? note.format !== 'md1' : !!note.format))
        return { status: 'unknown' };
      return { status: 'saved', targetId: noteId };
    };
    if (phase === 'query') return inspect(await repository.read());
    for (let attempt = 0; attempt < 3; attempt++) {
      const state = await repository.read();
      const existing = inspect(state);
      if (existing.status !== 'not_started') return existing;
      const note = { id: noteId, at: new Date(clock()).toISOString(), text: body,
        ...(target === 'pending' ? { format: 'md1' } : {}) };
      try { await repository.write({ ...state, notes: [note, ...state.notes] });
        return inspect(await repository.read()); }
      catch (error) {
        if (!/另一个页面已更新主库/.test(String(error.message)) || attempt === 2) throw error;
      }
    }
  }

  return { writeContinuation, writeSuggestion };
}

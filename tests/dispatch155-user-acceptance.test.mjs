import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {seed, current} from '../src/store.js';
import {createDraft, generateRecordPack, parseReply, saveReply, importCandidates} from '../src/reverse.js';

test('C11 给用户的合成样例可直接解析、唯一 Prompt 入库；不调用 Agent、不写任何真实文件', async () => {
  const document = await readFile(new URL('../docs/agents/handoffs/2026-10-04-codex-dispatch155-user-acceptance.md', import.meta.url), 'utf8');
  const material = document.match(/素材原文：[\s\S]*?```text\n([\s\S]*?)\n```/)?.[1];
  const reply = document.match(/验收回复[\s\S]*?```json\n([\s\S]*?)\n```/)?.[1];
  assert.ok(material); assert.ok(reply);
  const parsed = parseReply(reply);
  assert.equal(parsed.ok, true, parsed.error);
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.candidates[0].type, 'prompt');
  for (const key of ['structure', 'reusable']) {
    const quote = parsed.report[key][0].quote;
    assert.ok(quote && material.includes(quote));
    assert.equal(material.indexOf(quote), material.lastIndexOf(quote));
  }
  const draft = createDraft({text: material, url: ''});
  const initial = {...seed(), assets: [], reverseRecords: [draft]};
  const prepared = generateRecordPack(initial, draft.id);
  const recovered = saveReply(prepared, draft.id, reply);
  const {state: imported} = importCandidates(recovered, draft.id, {picks: [parsed.candidates[0].index], candidates: parsed.candidates});
  assert.equal(imported.assets.length, 1);
  assert.equal(current(imported.assets[0]).title, '验收155-事实与下一步');
  assert.equal(imported.reverseRecords[0].imports.length, 1);
  assert.throws(() => importCandidates(imported, draft.id, {picks: [parsed.candidates[0].index], candidates: parsed.candidates}), /已入库/);
  assert.equal(initial.assets.length, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createScroll, deleteScroll, restoreScroll, scrollSerials } from '../src/scrolls.js';

function threeScrolls() {
  let scrolls = [];
  for (const name of ['第一卷', '第二卷', '第三卷']) scrolls = createScroll(scrolls, name).scrolls;
  return scrolls.map((s, i) => ({ ...s, createdAt: `2026-10-0${i + 1}T00:00:00.000Z` }));
}

test('资产仓库焚决：删除中间卷后连续编号，恢复按原创建顺序重排且历史未改', () => {
  const initial = threeScrolls(), before = structuredClone(initial);
  const deleted = deleteScroll(initial, initial[1].id);
  assert.deepEqual(scrollSerials(deleted), { [initial[0].id]: 1, [initial[2].id]: 2 });
  const restored = restoreScroll(deleted, initial[1].id);
  assert.deepEqual(scrollSerials(restored), { [initial[0].id]: 1, [initial[1].id]: 2, [initial[2].id]: 3 });
  assert.equal(restored[1].createdAt, initial[1].createdAt);
  assert.deepEqual(restored[1].entries, initial[1].entries);
  assert.deepEqual(initial, before, '派生/删除/恢复不修改输入');
});

test('资产仓库焚决：全部删除后新卷从01开始，同一时间按现有数组顺序稳定编号', () => {
  let scrolls = threeScrolls();
  for (const s of scrolls) scrolls = deleteScroll(scrolls, s.id);
  assert.deepEqual(scrollSerials(scrolls), {});
  const result = createScroll(scrolls, '清空后新卷');
  assert.deepEqual(scrollSerials(result.scrolls), { [result.scroll.id]: 1 });
  const sameTime = result.scrolls.map(s => ({ ...s, createdAt: '2026-10-01T00:00:00.000Z', deletedAt: undefined }));
  assert.deepEqual(scrollSerials(sameTime), { [sameTime[0].id]: 1, [sameTime[1].id]: 2, [sameTime[2].id]: 3, [sameTime[3].id]: 4 });
});

// UI v16 银饰图鉴：派生展示与确定性心愿事务；不迁移旧对象。
import { uid, now } from './store.js';
import { addItem, update } from './silver.js';
export const SILVER_TYPES = [
  { key: 'ring', name: '戒指', target: 3 },
  { key: 'necklace', name: '项链', target: 4 },
  { key: 'bangle', name: '手镯', target: 3 },
  { key: 'pendant', name: '吊坠', target: 3 },
];
const byName = new Map(SILVER_TYPES.map(t => [t.name, t.key]));
export const wishesOf = s => s.wishes || [];
export function itemCategory(s, item) {
  return item.categoryKey || byName.get(s.categories.find(c => c.id === item.categoryId && !c.deletedAt)?.name) || null;
}
export function wishPending(s, wish) {
  return !wish.deletedAt && !wish.fulfilledItemId;
}
export function fixedCollectionsOf(s) {
  return SILVER_TYPES.map(type => {
    const legacy = s.categories.filter(c => !c.deletedAt && c.name === type.name);
    const target = s.targets?.[type.key] ?? (legacy.length ? legacy.reduce((n,c) => n + c.target, 0) : type.target);
    const items = s.items.filter(i => !i.deletedAt && itemCategory(s, i) === type.key);
    const wishes = wishesOf(s).filter(w => w.categoryKey === type.key && wishPending(s, w));
    const count = Math.max(target, items.length + wishes.length);
    const cells = Array.from({ length: count }, (_, index) => ({ index, item: items[index] || null, wish: index >= items.length ? wishes[index - items.length] || null : null }));
    return { ...type, target, items, wishes, cells };
  });
}
export function legacyCategoriesOf(s) {
  return s.categories.filter(c => !byName.has(c.name)).map(c => ({ ...c, items: s.items.filter(i => i.categoryId === c.id) }));
}
export function wallNumbersOf(s) {
  const all = s.wall.map((record, index) => ({ record, index })).sort((a,b) => Date.parse(a.record.createdAt) - Date.parse(b.record.createdAt) || a.index-b.index);
  return new Map(all.map(({ record }, index) => [record.id, index + 1]));
}
export function featuredWallOf(s) {
  return s.wall.filter(w => !w.deletedAt).reduce((best,w) => !best || Date.parse(w.createdAt) > Date.parse(best.createdAt) ? w : best, null);
}
export function wallGroupsOf(s) {
  const groups = new Map(), featured = featuredWallOf(s);
  for (const record of s.wall.filter(w => !w.deletedAt)) {
    const key = record.author.trim().normalize('NFC').toLocaleLowerCase('en-US');
    if (!groups.has(key)) groups.set(key, { key, name: record.author.trim() || '未署名', records: [] });
    groups.get(key).records.push(record);
  }
  return [...groups.values()].map(g => ({ ...g, preview: g.records.filter(r => r.id !== featured?.id).slice(0,4) })).filter(g => g.preview.length);
}
function typeCheck(key) { if (!SILVER_TYPES.some(t => t.key === key)) throw Error('请选择四个固定品类之一'); }
export function addWish(s, { wallId, categoryKey }) {
  typeCheck(categoryKey);
  const source = s.wall.find(w => w.id === wallId && !w.deletedAt);
  if (!source) throw Error('灵感已在回收区，请先恢复');
  const existing = wishesOf(s).find(w => !w.deletedAt && w.wallId === wallId && w.categoryKey === categoryKey);
  if (existing) return { silver: s, wish: existing, added: false };
  if (wishesOf(s).length >= 2000) throw Error('心愿数量已达上限');
  const wish = { id: uid(), wallId, categoryKey, createdAt: now() };
  return { silver: { ...s, wishes: [...wishesOf(s), wish] }, wish, added: true };
}
export function addFixedItem(s, categoryKey, fields, { wishId } = {}) {
  typeCheck(categoryKey);
  const wish = wishId ? wishesOf(s).find(w => w.id === wishId && w.categoryKey === categoryKey && wishPending(s,w)) : null;
  if (wishId && !wish) throw Error('心愿已实现或不可用，请重新选择');
  const result = addItem(s, categoryKey, fields);
  const item = { ...result.item, categoryKey }; delete item.categoryId;
  let silver = { ...s, items: [...s.items, item] };
  if (wish) silver = { ...silver, wishes: wishesOf(s).map(w => w.id === wish.id ? { ...w, fulfilledItemId: item.id, fulfilledAt: now(), updatedAt: now() } : w) };
  return { silver, item };
}
export function setTarget(s, key, target) {
  typeCheck(key);
  if (!Number.isInteger(target) || target < 1 || target > 999) throw Error('目标数量须为1至999的整数');
  return { ...s, targets: { ...s.targets, [key]: target } };
}
export function cancelWish(s, id) { return update({ ...s, wishes: wishesOf(s) }, 'wishes', id, { deletedAt: now() }); }
export function restoreWish(s, id) {
  const wish = wishesOf(s).find(w => w.id === id);
  if (!wish) throw Error('没有这条心愿');
  if (wishesOf(s).some(w => w.id !== id && !w.deletedAt && w.wallId === wish.wallId && w.categoryKey === wish.categoryKey)) throw Error('相同灵感与品类已有心愿，请保留其中一条');
  return update({ ...s, wishes: wishesOf(s) }, 'wishes', id, { deletedAt: undefined });
}

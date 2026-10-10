// 原文精确引用定位。纯文本、半开区间；无猜测、无原文改写。
export const ANCHOR_SECTIONS = ['structure', 'techniques', 'reusable'];
export function quotePosition(material, quote, occurrence) {
  if (typeof quote !== 'string' || !quote.trim()) return { status: 'missing', reason: '未提供精确引用句' };
  if (occurrence !== undefined && (!Number.isSafeInteger(occurrence) || occurrence < 1 || occurrence > 1000))
    return { status: 'missing', reason: '引用序号无效' };
  let index = material.indexOf(quote);
  if (index < 0) return { status: 'missing', reason: '原文中未找到精确引用句' };
  if (occurrence === undefined) {
    if (material.indexOf(quote, index + 1) >= 0)
      return { status: 'ambiguous', reason: '多处精确匹配，未唯一定位' };
  } else {
    for (let n = 1; n < occurrence; n++) {
      index = material.indexOf(quote, index + 1);
      if (index < 0) return { status: 'missing', reason: '原文中不存在指定的精确引用序号' };
    }
  }
  return { status: 'located', start: index, end: index + quote.length };
}
export function exactQuoteAnchors(material, report) {
  if (typeof material !== 'string') throw new Error('素材原文必须是文本');
  const points = [];
  for (const section of ANCHOR_SECTIONS) {
    for (const [index, point] of (report?.[section] || []).entries()) {
      points.push({ section, index, number: points.length + 1, quote: point.quote || '', ...quotePosition(material, point.quote, point.occurrence) });
    }
  }
  const changes = new Map();
  const at = offset => { if (!changes.has(offset)) changes.set(offset, {start:[],end:[]}); return changes.get(offset); };
  at(0); at(material.length);
  for (const point of points.filter(p => p.status === 'located')) {
    at(point.start).start.push(point.number);
    at(point.end).end.push(point.number);
  }
  const offsets = [...changes.keys()].sort((a,b)=>a-b);
  const active = new Set(), segments=[];
  for (let n = 0; n < offsets.length - 1; n++) {
    const start=offsets[n], end=offsets[n+1], change=changes.get(start);
    for (const id of change.end) active.delete(id);
    for (const id of change.start) active.add(id);
    if (end > start) segments.push({text:material.slice(start,end),numbers:[...active].sort((a,b)=>a-b)});
  }
  return {points, segments};
}

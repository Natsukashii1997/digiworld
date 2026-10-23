function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchableNoteText(note, extraText = '') {
  const imageOcr = Array.isArray(note?.imageOcr)
    ? note.imageOcr.map((entry) => entry?.text || '')
    : [];
  const transcriptSegments = Array.isArray(note?.transcriptSegments)
    ? note.transcriptSegments.map((entry) => entry?.text || '')
    : [];

  return normalizeSearchText([
    note?.getAnalysis?.title,
    note?.getAnalysis?.content,
    note?.title,
    note?.content,
    note?.rawContent,
    note?.ocrText,
    note?.transcriptText,
    ...imageOcr,
    ...transcriptSegments,
    note?.author?.name,
    note?.category,
    ...(Array.isArray(note?.tags) ? note.tags : []),
    extraText,
  ].filter(Boolean).join('\n'));
}

export function noteMatchesQuery(note, query, extraText = '') {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const haystack = searchableNoteText(note, extraText);
  return normalizedQuery.split(' ').every((token) => haystack.includes(token));
}

export function filterNotesByQuery(notes, query, getExtraText) {
  if (!Array.isArray(notes)) return [];
  const resolveExtraText = typeof getExtraText === 'function' ? getExtraText : () => '';
  return notes.filter((note) => noteMatchesQuery(note, query, resolveExtraText(note)));
}

// Return the passage that matched, rather than an unrelated post introduction.
export function noteSearchEvidence(note, query) {
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
  const candidates = [
    ...(note.transcriptSegments || []).map(segment => ({field:'transcript',text:segment.text,start:segment.start,duration:segment.duration})),
    {field:'get_analysis',text:[note.getAnalysis?.title,note.getAnalysis?.content].filter(Boolean).join('\n')},
    {field:'content',text:note.content || note.rawContent || ''},
    {field:'ocr',text:note.ocrText || ''},
    ...(!note.transcriptSegments?.length ? [{field:'transcript',text:note.transcriptText || ''}] : []),
    {field:'title',text:note.title || ''},
  ].filter(item => typeof item.text === 'string' && item.text);
  const ranked = candidates.map(item => ({...item,score:tokens.filter(token => normalizeSearchText(item.text).includes(token)).length}));
  const found = ranked.reduce((best,item) => item.score > (best?.score || 0) ? item : best,null);
  if (!found) return {excerpt:(note.content || note.ocrText || note.transcriptText || '').slice(0,600)};
  const passage = found.text.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const normalized = normalizeSearchText(passage);
  const positions = tokens.map(token => normalized.indexOf(token)).filter(index => index >= 0);
  const offset = Math.max(0,Math.min(...positions)-120);
  return {excerpt:passage.slice(offset,offset+600),match:{field:found.field,...(Number.isFinite(found.start)?{start:found.start,duration:found.duration}:{})}};
}

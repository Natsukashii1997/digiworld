// A bounded projection of one local collection snapshot. No media, credentials or job history.
const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/\s+/g,' ').trim();
export const COLLECTION_QUERY_MAX=300;
export function searchCollection(state,query) {
  const words=normalize(query).split(' ').filter(Boolean),hits=[];
  if(!words.length)return {revision:state.revision,total:0,hits};
  let total=0;
  for(const note of state.notes || []) {
    if(note.deletedAt)continue;
    const groupId=state.desk?.noteGroupMap?.[note.id];
    const groupName=state.desk?.groups?.find(g=>g.id===groupId)?.name || '未分组';
    const fields=[['标题',note.title],['正文',note.content],['原文',note.rawContent],
      ['OCR',note.ocrText],...(note.imageOcr||[]).map(v=>['OCR',v.text]),
      ['视频转写',note.transcriptText],...(note.transcriptSegments||[]).map(v=>['视频转写',v.text]),
      ['GET标题',note.getAnalysis?.title],['GET正文',note.getAnalysis?.content],
      ['作者',note.author?.name],['标签',(note.tags||[]).join(' ')],['分类',note.category],['分组',groupName]]
      .filter(([,text])=>typeof text==='string'&&text).map(([label,text])=>({label,text:text.normalize('NFKC').replace(/\s+/g,' ').trim(),lower:normalize(text)}));
    const all=fields.map(f=>f.lower).join('\n');
    if(!words.every(word=>all.includes(word)))continue;
    total++;
    if(hits.length>=20)continue;
    const matched=fields.filter(f=>words.some(word=>f.lower.includes(word)));
    const passage=matched.find(f=>['正文','原文','OCR','视频转写','GET正文'].includes(f.label)) || matched[0];
    const [at,word]=words.map(word=>[passage.lower.indexOf(word),word]).filter(([at])=>at>=0).sort((a,b)=>a[0]-b[0])[0];
    const text=passage.lower.length===passage.text.length?passage.text:passage.lower;
    const start=Math.max(0,at-40),end=Math.min(text.length,at+word.length+60);
    hits.push({id:note.id,title:(note.getAnalysis?.title||note.title||'未命名收藏').slice(0,200),
      source:note.author?.name?.slice(0,100)||'本地收藏',groupName:groupName.slice(0,100),savedAt:note.savedAt,
      where:[...new Set(matched.map(f=>f.label))].join('、'),
      snippet:(start?'…':'')+text.slice(start,end)+(end<text.length?'…':'')});
  }
  return {revision:state.revision,total,hits};
}

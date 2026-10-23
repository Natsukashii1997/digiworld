const papers=['red','blue','green','yellow','gray'];
// Existing ink keeps its matching paper. White-text notes get a stable paper
// from their identity, without changing their content or persisting a new field.
export function notePaper(id,doc){
 const ink=doc.lines.flatMap(line=>line.runs).find(run=>run.ink)?.ink;
 if(ink)return ink;
 let hash=2166136261;
 for(const character of String(id)){hash=Math.imul(hash^character.codePointAt(0),16777619)>>>0;}
 return papers[hash%papers.length];
}

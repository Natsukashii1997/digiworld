import {useEffect,useState,type ReactNode} from 'react';
import type {Note} from '../types/xiaohongshu';
import {retryGetAnalysis} from '../lib/xhs-client';

// Provider Markdown is untrusted content. Only these React nodes are rendered;
// raw HTML and remote images stay text, and links require http(s).
function inline(text:string):ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|!?\[[^\]]*\]\([^)]*\))/g).map((part,index)=>{
    if(part.startsWith('**') && part.endsWith('**'))return <strong key={index}>{part.slice(2,-2)}</strong>;
    if(part.startsWith('`') && part.endsWith('`'))return <code key={index}>{part.slice(1,-1)}</code>;
    const link=part.match(/^(!?)\[([^\]]*)\]\(([^)]*)\)$/);
    if(link){if(link[1])return <span key={index}>{link[2] || '图片'}</span>;try{const url=new URL(link[3]);if(['https:','http:'].includes(url.protocol) && !url.username && !url.password)return <a key={index} href={url.href} target="_blank" rel="noopener noreferrer">{link[2]}</a>;}catch{}return <span key={index}>{link[2]}</span>;}
    return part;
  });
}
export function GetMarkdown({content}:{content:string}) {
  const nodes:ReactNode[]=[],lines=content.split(/\r?\n/);
  for(let i=0;i<lines.length;i++) {
    const line=lines[i],key=i;
    if(!line.trim())continue;
    if(/^```/.test(line)){const block=[];while(++i<lines.length && !/^```/.test(lines[i]))block.push(lines[i]);nodes.push(<pre key={key}><code>{block.join('\n')}</code></pre>);continue;}
    const heading=line.match(/^#{1,6}\s+(.+)$/);
    if(heading){nodes.push(<h3 key={key}>{inline(heading[1])}</h3>);continue;}
    if(line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i+1] || '')) {
      const cells=(row:string)=>row.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());
      const headers=cells(line),rows:string[][]=[];i++;while(i+1<lines.length && lines[i+1].includes('|'))rows.push(cells(lines[++i]));
      nodes.push(<div className="collection-get-table" key={key}><table><thead><tr>{headers.map((cell,k)=><th key={k}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row,k)=><tr key={k}>{row.map((cell,c)=><td key={c}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>);continue;
    }
    const list=line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
    if(list){const items=[list[1]];while(i+1<lines.length){const next=lines[i+1].match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);if(!next)break;i++;items.push(next[1]);}nodes.push(<ul key={key}>{items.map((item,k)=><li key={k}>{inline(item)}</li>)}</ul>);continue;}
    nodes.push(<p key={key}>{inline(line)}</p>);
  }
  return <div className="collection-get-markdown">{nodes}</div>;
}
const states:Record<string,string>={queued:'本机已收藏，等待GET解析',submitting:'正在提交到GET',pending:'GET已接收，等待解析',processing:'GET正在整理内容',fetching:'正在保存GET整理正文',ready:'GET解析已保存',failed:'GET解析未完成',paused:'GET查询暂时中断',unknown:'GET提交结果待核对',cancelled:'GET解析已停止'};
export default function GetAnalysis({note}:{note:Note}) {
  const value=note.getAnalysis!;
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[submitted,setSubmitted]=useState(false);
  useEffect(()=>{setSubmitted(false);setMessage('');},[value.jobId,value.updatedAt]);
  const retry=async()=>{setBusy(true);setMessage('');try{await retryGetAnalysis(note.id,value.jobId);setSubmitted(true);setMessage('已请求，解析状态将自动更新');}catch(error){setMessage(error instanceof Error?error.message:'请求结果待核对，请刷新收藏查看');setSubmitted(true);}finally{setBusy(false);}};
  return <section className="collection-get-analysis" aria-label="Get笔记解析">
    <p className="collection-notice" role="status">{states[value.status] || 'GET状态待核对'}</p>
    {value.error && <p className="collection-notice">{value.error}</p>}
    {value.status==='unknown' && <p className="collection-notice">原收藏已保存。请先在GET核对是否已生成笔记；本机不会自动重复提交。</p>}
    {value.canRetry && <button className="collection-key" disabled={busy||submitted} onClick={retry}>{busy?'处理中…':value.status==='paused'?'继续查询GET':'重试GET解析'}</button>}
    {message && <p className="collection-notice" role="status">{message}</p>}
    {value.status==='ready' && <>
      <p className="collection-notice">GET生成的AI整理 · {value.completedAt?new Date(value.completedAt).toLocaleString('zh-CN'):''}</p>
      {/^https:\/\/www\.biji\.com\/note\/[a-zA-Z0-9_-]+$/.test(value.noteUrl||'') && <a className="collection-key" href={value.noteUrl} target="_blank" rel="noopener noreferrer">查看GET原笔记</a>}
      <h3>{value.title}</h3><GetMarkdown content={value.content || ''}/>
    </>}
  </section>;
}

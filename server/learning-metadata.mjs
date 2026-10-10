// 候选生产模块：只读书架元数据，无持久化正文、无网络。依赖只有 Node 内置与仓库已有 fflate。
import * as fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,isAbsolute,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
export const METADATA_LIMITS={fileBytes:32*1024*1024,containerBytes:64*1024,opfBytes:256*1024,zipEntries:20000,pdfObjects:100000};
const fail=message=>{throw new Error(message);};
const identity=s=>`${s.dev}:${s.ino}:${s.birthtimeMs}`;
const clean=s=>s.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
const utf8=b=>new TextDecoder('utf-8',{fatal:true}).decode(b);
function entities(s){return s.replace(/&([^;]+);/g,(_,n)=>{
 const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(Object.hasOwn(named,n))return named[n];
 const cp=/^#x[\da-f]+$/i.test(n)?parseInt(n.slice(2),16):/^#\d+$/.test(n)?parseInt(n.slice(1),10):NaN;
 if(!Number.isInteger(cp)||cp<0||cp>0x10ffff||cp>=0xd800&&cp<=0xdfff)fail('XML 含未支持的实体');return String.fromCodePoint(cp);
});}
function xml(b){const s=utf8(b);if(/<!DOCTYPE|<!ENTITY/i.test(s))fail('不解析带外部实体声明的 EPUB 元数据');return s;}
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m=>[m[1],entities(m[3])]));
function zipEntry(bytes,name,limit){
 if(!(bytes instanceof Uint8Array)||bytes.length<22||bytes.length>METADATA_LIMITS.fileBytes)fail('EPUB 文件超过元数据解析上限或格式无效');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=p=>v.getUint16(p,true),u32=p=>v.getUint32(p,true);
 let end=bytes.length-22;while(end>=Math.max(0,bytes.length-65557)&&(u32(end)!==0x06054b50||end+22+u16(end+20)!==bytes.length))end--;
 if(end<Math.max(0,bytes.length-65557))fail('EPUB ZIP 目录无效');
 const count=u16(end+10),start=u32(end+16);
 if(u16(end+4)||u16(end+6)||count!==u16(end+8)||count===65535||count>METADATA_LIMITS.zipEntries||start+u32(end+12)!==end)fail('不支持此 EPUB ZIP 目录');
 const seen=new Set();let p=start,want=null;
 for(let i=0;i<count;i++){
  if(p+46>end||u32(p)!==0x02014b50)fail('EPUB ZIP 目录损坏');
  const length=u16(p+28),next=p+46+length+u16(p+30)+u16(p+32);if(next>end)fail('EPUB ZIP 目录损坏');
  const n=utf8(bytes.subarray(p+46,p+46+length));
  const parts=n.replace(/\/$/,'').split('/');if(n.startsWith('/')||/[\\\x00-\x1f\x7f]/.test(n)||parts.some(p=>!p||p==='.'||p==='..'))fail('EPUB 包含不安全路径');
  const key=n.normalize('NFC').toLowerCase();if(seen.has(key))fail('EPUB 包含重复元数据路径');seen.add(key);
  if(n===name){if(u16(p+8)&1||![0,8].includes(u16(p+10))||(u32(p+38)>>>16&0o170000)===0o120000)fail('EPUB 元数据已加密或为链接');want={size:u32(p+24)};}
  p=next;
 }
 if(p!==end||!want)fail('EPUB 没有指定的元数据文件');if(want.size>limit)fail('EPUB 元数据超过解析上限');
 const entries=unzipSync(bytes,{filter:f=>{if(f.name!==name)return false;if(f.originalSize>limit)fail('EPUB 元数据超过解析上限');return true;}});
 const b=entries[name];if(!b||b.length!==want.size||b.length>limit)fail('EPUB 元数据长度无效');return b;
}
export function parseEpubMetadata(bytes){
 const container=xml(zipEntry(bytes,'META-INF/container.xml',METADATA_LIMITS.containerBytes));
 const roots=[...container.matchAll(/<(?:[\w.-]+:)?rootfile\b([^>]*)\/?\s*>/g)].map(m=>attrs(m[1]));
 const root=roots.find(r=>r['media-type']==='application/oebps-package+xml')||roots[0];if(!root?.['full-path'])fail('EPUB container 未声明 OPF');
 const path=root['full-path'];if(path.startsWith('/')||/[\\\x00-\x1f\x7f]/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))fail('EPUB OPF 路径无效');
 const opf=xml(zipEntry(bytes,path,METADATA_LIMITS.opfBytes));
 const authors=[], stack=[]; let creator=null, rootSeen=false;
 // 最小 XML token 解析保留 namespace 作用域；只取 Dublin Core creator 的文本。
 const tokens=opf.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<[^>]*>|[^<]+/g)||[];
 for(const token of tokens){
  if(token.startsWith('<!--')||token.startsWith('<?'))continue;
  if(token.startsWith('<![CDATA[')){if(creator)creator.text+=token.slice(9,-3);continue;}
  if(token.startsWith('</')){
   const name=token.match(/^<\/([\w:.-]+)\s*>$/)?.[1],entry=stack.pop();if(!entry||entry.name!==name)fail('OPF XML 标签未正确闭合');
   if(creator&&creator.depth===stack.length+1){const text=clean(creator.text);if(text&&!authors.includes(text))authors.push(text);creator=null;}continue;
  }
  if(token.startsWith('<')){
   const name=token.match(/^<([\w:.-]+)\b/)?.[1];if(!name)fail('OPF XML 标签无效');
   const declarations=attrs(token), namespaces={...(stack.at(-1)?.namespaces||{})};
   for(const [key,value]of Object.entries(declarations))if(key==='xmlns')namespaces['']=value;else if(key.startsWith('xmlns:'))namespaces[key.slice(6)]=value;
   const parts=name.split(':'),local=parts.at(-1),prefix=parts.length===2?parts[0]:'';
   if(!stack.length&&rootSeen)fail('OPF 包含多个根元素');
   if(!rootSeen){if(local!=='package')fail('OPF 缺少 package 根元素');rootSeen=true;}
   if(!/\/\s*>$/.test(token)){stack.push({name,namespaces});if(local==='creator'&&namespaces[prefix]==='http://purl.org/dc/elements/1.1/'){if(creator)fail('OPF creator 嵌套无效');creator={depth:stack.length,text:''};}}
   continue;
  }
  if(creator)creator.text+=entities(token);else if(!stack.length&&token.trim())fail('OPF 根元素外含非空文本');
 }
 if(stack.length||!rootSeen)fail('OPF XML 未正确闭合');
 return {format:'EPUB',authors,pageCount:null,authorReason:authors.length?'':'OPF 缺少可解析的作者字段',pageCountReason:'OPF 没有标准、可核验的总页数字段；流式 EPUB 不从章节数估算页数'};
}
// PDF 词法只用于 classic xref 指向的 Info / Catalog / Pages 字典；不解析正文/对象流、不执行动作。
function pdfValue(text,position,depth=0){
 if(depth>16)fail('PDF 字典嵌套过深');let p=position;
 const white=()=>{while(p<text.length){if(/[\s\0]/.test(text[p]))p++;else if(text[p]==='%'){while(p<text.length&&!/[\r\n]/.test(text[p]))p++;}else break;}};white();
 if(text.startsWith('<<',p)){p+=2;const value=Object.create(null);let count=0;while(true){white();if(text.startsWith('>>',p)){p+=2;return {value,end:p};}if(++count>10000||text[p]!=='/')fail('PDF 字典无效');const key=pdfValue(text,p,depth+1);p=key.end;const v=pdfValue(text,p,depth+1);p=v.end;value[key.value.name]=v.value;}}
 if(text[p]==='/'){const m=text.slice(p+1).match(/^[^\s\0()<>\[\]{}/%]+/);if(!m)fail('PDF 名称无效');return{value:{name:m[0].replace(/#([\da-f]{2})/gi,(_,x)=>String.fromCharCode(parseInt(x,16)))},end:p+1+m[0].length};}
 if(text[p]==='('){p++;let nest=1,bytes=[];while(p<text.length&&nest){let c=text[p++];if(c==='\\'){c=text[p++];if(/[0-7]/.test(c||'')){let oct=c;for(let n=0;n<2&&/[0-7]/.test(text[p]||'');n++)oct+=text[p++];bytes.push(parseInt(oct,8)&255);}else if(c==='\r'||c==='\n'){if(c==='\r'&&text[p]==='\n')p++;}else bytes.push(({n:10,r:13,t:9,b:8,f:12})[c]??c.charCodeAt(0));}else if(c==='('){nest++;bytes.push(40);}else if(c===')'){if(--nest)bytes.push(41);}else bytes.push(c.charCodeAt(0));}if(nest)fail('PDF 字符串未闭合');return{value:{bytes:Uint8Array.from(bytes)},end:p};}
 if(text[p]==='<'){const end=text.indexOf('>',p+1);if(end<0)fail('PDF 十六进制字符串无效');let h=text.slice(p+1,end).replace(/\s/g,'');if(!/^[\da-f]*$/i.test(h))fail('PDF 十六进制字符串无效');if(h.length%2)h+='0';return{value:{bytes:Uint8Array.from(h.match(/../g)||[],x=>parseInt(x,16))},end:end+1};}
 if(text[p]==='['){p++;const values=[];while(true){white();if(text[p]===']')return{value:values,end:p+1};if(values.length>=10000)fail('PDF 数组过长');const v=pdfValue(text,p,depth+1);values.push(v.value);p=v.end;}}
 const ref=text.slice(p).match(/^(\d+)\s+(\d+)\s+R\b/);if(ref)return{value:{ref:+ref[1],generation:+ref[2]},end:p+ref[0].length};
 const token=text.slice(p).match(/^[^\s\0()<>\[\]{}/%]+/);if(!token)fail('PDF 值无效');return{value:/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(token[0])?Number(token[0]):token[0],end:p+token[0].length};
}
function pdfString(value){
 const b=value?.bytes;if(!b)return null;
 if(b[0]===0xfe&&b[1]===0xff)return clean(new TextDecoder('utf-16be',{fatal:true}).decode(b.subarray(2)));
 if(b[0]===0xff&&b[1]===0xfe)return clean(new TextDecoder('utf-16le',{fatal:true}).decode(b.subarray(2)));
 if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)return clean(utf8(b.subarray(3)));
 if([...b].some(n=>n>=128))return null; // PDFDocEncoding 扩展字符尚未支持，不能用Latin1猜作者。
 return clean(String.fromCharCode(...b));
}
export function parsePdfMetadata(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length>METADATA_LIMITS.fileBytes)fail('PDF 超过元数据解析上限');
 const text=Buffer.from(bytes).toString('latin1');if(!text.startsWith('%PDF-'))fail('PDF 头无效');
 const start=[...text.matchAll(/startxref\s+(\d+)\s+%%EOF/g)].at(-1);if(!start)fail('PDF 缺少可解析的 xref');
 const objects=new Map(),trailers=[],visited=new Set();let offset=Number(start[1]);
 for(let generation=0;generation<16;generation++){
  if(!Number.isSafeInteger(offset)||offset<0||offset>=text.length||visited.has(offset))fail('PDF xref 位置无效');visited.add(offset);
  if(text.slice(offset,offset+4)!=='xref')fail('压缩 PDF 对象流/xref stream 尚未接入');
  let p=offset+4;const skip=()=>{while(/\s/.test(text[p]||'')&&p<text.length)p++;};
  while(true){skip();if(text.startsWith('trailer',p)){p+=7;break;}const head=text.slice(p).match(/^(\d+)\s+(\d+)\s*[\r\n]+/);if(!head)fail('PDF xref 表无效');p+=head[0].length;
   const first=+head[1],count=+head[2];if(count>METADATA_LIMITS.pdfObjects||objects.size+count>METADATA_LIMITS.pdfObjects)fail('PDF 对象表超过解析上限');
   for(let n=0;n<count;n++){const row=text.slice(p).match(/^(\d{10})\s+(\d{5})\s+([nf])[^\r\n]*[\r\n]+/);if(!row)fail('PDF xref 项无效');if(!objects.has(first+n))objects.set(first+n,{offset:+row[1],generation:+row[2],active:row[3]==='n'});p+=row[0].length;}}
  const trailer=pdfValue(text,p).value;if(!trailer||Array.isArray(trailer))fail('PDF trailer 无效');trailers.push(trailer);
  if(trailer.Encrypt)fail('加密 PDF 元数据尚未接入');if(trailer.Prev===undefined)break;offset=trailer.Prev;if(generation===15)fail('PDF 增量历史超过解析上限');
 }
 const lookup=ref=>{if(!ref||!Number.isInteger(ref.ref))return null;const entry=objects.get(ref.ref);if(!entry?.active||entry.generation!==ref.generation)return null;const header=text.slice(entry.offset).match(new RegExp('^'+ref.ref+'\\s+'+ref.generation+'\\s+obj\\b'));if(!header)fail('PDF 对象与xref不一致');return pdfValue(text,entry.offset+header[0].length).value;};
 const info=lookup(trailers.find(t=>t.Info)?.Info);let author=pdfString(info?.Author);if(!author&&info?.Author?.ref)author=pdfString(lookup(info.Author));
 const catalog=lookup(trailers.find(t=>t.Root)?.Root);const pages=lookup(catalog?.Pages);const count=pages?.Type?.name==='Pages'&&Number.isSafeInteger(pages.Count)&&pages.Count>0?pages.Count:null;
 return{format:'PDF',authors:author?[author]:[],pageCount:count,authorReason:author?'':'Info 字典没有可解析作者（或编码尚未支持）',pageCountReason:count?'':'缺少可核验的 Pages.Count；不从正文或文件大小猜页数'};
}
export function parseBookMetadata(bytes,name){try{return{name,status:'ok',...(/\.epub$/i.test(name)?parseEpubMetadata(bytes):parsePdfMetadata(bytes))};}catch(e){return{name,status:'unavailable',authors:[],pageCount:null,authorReason:e.message,pageCountReason:e.message};}}
// root/path必须由已登记书架的服务端索引提供；HTTP不接收它们。目录链与文件身份在读取前后核对。
export async function readBookMetadata(root,path,{filesystem=fs}={}){
 if(!isAbsolute(root)||resolve(root)!==root||path.startsWith('/')||/[\\\x00-\x1f\x7f]/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.'))||!/\.(pdf|epub)$/i.test(path))fail('书架元数据路径无效');
 const full=join(root,path),directories=[];let directory=sep;
 const dirParts=full.split(sep).slice(1,-1);
 for(const part of dirParts){directory=join(directory,part);const s=await filesystem.lstat(directory);if(s.isSymbolicLink()||!s.isDirectory())fail('书架目录经过符号链接或不是目录');directories.push({path:directory,id:identity(s)});}
 const check=async()=>{for(const d of directories){const s=await filesystem.lstat(d.path);if(s.isSymbolicLink()||!s.isDirectory()||identity(s)!==d.id)fail('书架目录读取期间发生变化');}};
 await check();const before=await filesystem.lstat(full);if(before.isSymbolicLink()||!before.isFile()||before.nlink!==1)fail('书籍必须为普通文件，不能是符号链接或硬链接');if(before.size>METADATA_LIMITS.fileBytes)fail('书籍超过32MiB元数据解析上限，原件未改动');
 const handle=await filesystem.open(full,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const opened=await handle.stat();if(!opened.isFile()||opened.nlink!==1||identity(opened)!==identity(before)||opened.size!==before.size||opened.mtimeMs!==before.mtimeMs)fail('书籍读取前发生变化');await check();
  const bytes=Buffer.alloc(opened.size);let at=0;while(at<bytes.length){await check();const read=await handle.read(bytes,at,Math.min(64*1024,bytes.length-at),at);if(!read.bytesRead)fail('书籍读取不完整');at+=read.bytesRead;}
  const after=await handle.stat();await check();const target=await filesystem.lstat(full);if(identity(after)!==identity(opened)||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||after.nlink!==1||target.isSymbolicLink()||!target.isFile()||identity(target)!==identity(opened)||target.size!==opened.size||target.mtimeMs!==opened.mtimeMs||target.nlink!==1)fail('书籍读取期间发生变化');
  return{...parseBookMetadata(bytes,path.split('/').at(-1)),sha256:createHash('sha256').update(bytes).digest('hex')};
 }finally{await handle.close();}
}

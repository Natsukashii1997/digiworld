// 仅显式单书ID路径解析调用；EPUB正文有界、无HTML执行，PDF正文继续待接入。
import {unzipSync} from 'fflate';
import {createHash} from 'node:crypto';
import {join,resolve,isAbsolute,posix} from 'node:path';
import {readConfigFile} from './config-file.mjs';
import {parseEpubMetadata,METADATA_LIMITS} from './learning-metadata.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const decode=b=>new TextDecoder('utf-8',{fatal:true}).decode(b);
const fail=m=>{throw Object.assign(new Error(m),{code:'BOOK_CONTENT_UNAVAILABLE'});};
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m=>[m[1],m[3]]));
const safe=p=>p&&!p.startsWith('/')&&!/[\\\x00-\x1f\x7f?#]/.test(p)&&p.split('/').every(s=>s&&s!=='.'&&s!=='..');
const crc32=bytes=>{let crc=0xffffffff;for(const b of bytes){crc^=b;for(let n=0;n<8;n++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}return(crc^0xffffffff)>>>0;};
function entry(bytes,name,limit){if(!safe(name))fail('EPUB正文路径无效');const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=p=>v.getUint16(p,true),u32=p=>v.getUint32(p,true);let end=bytes.length-22;while(end>=Math.max(0,bytes.length-65557)&&(u32(end)!==0x06054b50||end+22+u16(end+20)!==bytes.length))end--;if(end<0)fail('EPUB ZIP无效');let at=u32(end+16),found=null;for(let n=0;n<u16(end+10);n++){const len=u16(at+28),entryName=decode(bytes.subarray(at+46,at+46+len));if(entryName===name){if(u16(at+8)&1||![0,8].includes(u16(at+10))||(u32(at+38)>>>16&0o170000)===0o120000)fail('EPUB正文已加密或为链接');found={size:u32(at+24),crc:u32(at+16)};}at+=46+len+u16(at+30)+u16(at+32);}if(!found||found.size>limit)fail('EPUB正文缺失或超容量');const data=unzipSync(bytes,{filter:f=>{if(f.name!==name)return false;if(f.originalSize>limit)fail('EPUB正文超出解析容量');return true;}})[name];if(!data||data.length!==found.size||data.length>limit||crc32(data)!==found.crc)fail('EPUB正文长度或CRC无法核验');return decode(data);}
function plain(text){if(/<!ENTITY|<!DOCTYPE[^>]*(?:SYSTEM|PUBLIC)|<\?(?!xml\b)/i.test(text))fail('EPUB正文含外部实体或处理指令，未解析');return text.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<[^>]*>/g,' ').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,m=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[m]).replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const cp=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);if(cp>0x10ffff||cp<0||cp>=0xd800&&cp<=0xdfff)fail('EPUB正文实体无效');return String.fromCodePoint(cp);}).replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();}
export function parseEpubContent(bytes){parseEpubMetadata(bytes); // 已有中央目录逐项检查路径、重复、容器/OPF加密/容量。
 const container=entry(bytes,'META-INF/container.xml',METADATA_LIMITS.containerBytes),roots=[...container.matchAll(/<(?:[\w.-]+:)?rootfile\b([^>]*)/g)].map(m=>attrs(m[1]));
 const opfPath=(roots.find(r=>r['media-type']==='application/oebps-package+xml')||roots[0])?.['full-path'];if(!safe(opfPath))fail('EPUB OPF路径无效');
 const opf=entry(bytes,opfPath,METADATA_LIMITS.opfBytes),items=new Map([...opf.matchAll(/<(?:[\w.-]+:)?item\b([^>]*)/g)].map(m=>{const a=attrs(m[1]);return[a.id,a];}));
 const spine=[...opf.matchAll(/<(?:[\w.-]+:)?itemref\b([^>]*)/g)].map(m=>attrs(m[1]).idref);if(!spine.length||spine.length>100)fail('EPUB书脊为空或超过100章节上限');
 let text='';for(const id of spine){const item=items.get(id);if(!item||!['application/xhtml+xml','text/html'].includes(item['media-type']))fail('EPUB书脊包含尚未支持的正文格式');const href=item.href;if(!safe(href))fail('EPUB正文引用越界');const name=posix.join(posix.dirname(opfPath),href);const part=plain(entry(bytes,name,256*1024));text+=(text?'\n\n':'')+part;if(Buffer.byteLength(text)>56*1024)fail('正文超过单书56KiB容量；待接入分段解析，不截断原文冒充完整正文');}if(!text.trim())fail('EPUB没有可解析正文');return text;
}
export async function readBookContent(root,path,{filesystem}={}){if(!isAbsolute(root)||resolve(root)!==root||!safe(path)||path.split('/').some(s=>s.startsWith('.')))fail('书籍路径无效');if(!/\.epub$/i.test(path))fail('待接入数据：PDF正文解析未接入，不从元数据编摘要');const file=await readConfigFile(join(root,path),{limit:METADATA_LIMITS.fileBytes,...filesystem?{filesystem}:{}});const text=parseEpubContent(file.bytes);return{text,sha256:sha(text),sourceRef:'book-'+sha(root+'\0'+path)+'/'+sha(file.bytes),format:'EPUB'};}

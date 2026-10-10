// 独立合成探针：临时模块和书籍均写聊天/系统临时目录；零真实读取。
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {readFile,writeFile,mkdtemp,rm,mkdir,symlink,link,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {parseEpubMetadata,parsePdfMetadata,parseBookMetadata,readBookMetadata} from '../server/learning-metadata.mjs';
const temp=await mkdtemp(join(tmpdir(),'guiji-meta151-'));
const epub=(opf,extra={})=>zipSync({'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),'OEBPS/content.opf':strToU8(opf),...extra});
export function syntheticPdf({author='Synthetic Author',pages=8,extra='' }={}){
 let text='%PDF-1.4\n',offsets=[0];const objects=[`<< /Type /Catalog /Pages 2 0 R >>`,`<< /Type /Pages /Count ${pages} /Kids [4 0 R] >>`,author===null?'<<>>':`<< /Author (${author}) >>`,'<< /Type /Page /Parent 2 0 R >>'];
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(text,'latin1'));text+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const start=Buffer.byteLength(text,'latin1');text+='xref\n0 5\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 5 /Root 1 0 R /Info 3 0 R ${extra} >>\nstartxref\n${start}\n%%EOF\n`;return Buffer.from(text,'latin1');
}
let count=0;const check=(name,fn)=>{fn();count++;};
try {
 check('EPUB DC on package',()=>assert.deepEqual(parseEpubMetadata(epub('<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:creator>A &amp; B</dc:creator><dc:creator>第二作者</dc:creator></metadata></package>')).authors,['A & B','第二作者']));
 check('EPUB scoped DC/CDATA',()=>assert.deepEqual(parseEpubMetadata(epub('<package><metadata xmlns:d="http://purl.org/dc/elements/1.1/"><d:creator><![CDATA[A & B]]></d:creator></metadata></package>')).authors,['A & B']));
 check('EPUB 不猜 page count/foreign namespace',()=>{const a=parseEpubMetadata(epub('<package xmlns:dc="urn:wrong"><metadata><dc:creator>Fake</dc:creator><pages>80</pages></metadata></package>'));assert.deepEqual(a.authors,[]);assert.equal(a.pageCount,null);});
 check('EPUB 禁DTD',()=>assert.equal(parseBookMetadata(epub('<!DOCTYPE x [<!ENTITY a SYSTEM "file://x">]><package/>'),'a.epub').status,'unavailable'));
 check('EPUB 禁路径穿越',()=>assert.throws(()=>parseEpubMetadata(epub('<package/>',{'../a':strToU8('x')})),/不安全路径/));
 check('EPUB 元数据上限',()=>assert.throws(()=>parseEpubMetadata(epub('<package>'+('x'.repeat(270000))+'</package>')),/超过解析上限/));
 check('PDF classic-xref 精确元数据',()=>{const m=parsePdfMetadata(syntheticPdf());assert.deepEqual(m.authors,['Synthetic Author']);assert.equal(m.pageCount,8);});
 check('PDF author 缺失不猜',()=>assert.deepEqual(parsePdfMetadata(syntheticPdf({author:null})).authors,[]));
 check('PDF page missing/0不猜',()=>assert.equal(parsePdfMetadata(syntheticPdf({pages:0})).pageCount,null));
 check('PDF 加密不读',()=>assert.equal(parseBookMetadata(syntheticPdf({extra:'/Encrypt 9 0 R'}),'a.pdf').status,'unavailable'));
 check('PDF xref stream诚实失败',()=>assert.equal(parseBookMetadata(Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /XRef >>\nendobj\nstartxref\n9\n%%EOF'),'a.pdf').status,'unavailable'));
 check('PDF UTF16作者',()=>{const bytes=syntheticPdf({author:'\\376\\377\\000A\\116\\055'});assert.deepEqual(parsePdfMetadata(bytes).authors,['A中']);});
 const books=await realpath(temp).then(p=>join(p,'books'));await mkdir(books);const bytes=syntheticPdf();await writeFile(join(books,'ok.pdf'),bytes);
 const result=await readBookMetadata(books,'ok.pdf');assert.equal(result.pageCount,8);assert.match(result.sha256,/^[a-f0-9]{64}$/);assert.deepEqual(await readFile(join(books,'ok.pdf')),bytes);count++;
 await symlink(join(books,'ok.pdf'),join(books,'sym.pdf'));await assert.rejects(readBookMetadata(books,'sym.pdf'),/符号链接或硬链接/);count++;
 await link(join(books,'ok.pdf'),join(books,'hard.pdf'));await assert.rejects(readBookMetadata(books,'hard.pdf'),/符号链接或硬链接/);count++;
 await assert.rejects(readBookMetadata(books,'../ok.pdf'),/路径无效/);count++;
 await symlink(books,join(temp,'symdir'));await assert.rejects(readBookMetadata(join(await realpath(temp),'symdir'),'ok.pdf'),/符号链接/);count++;
 console.log(JSON.stringify({ok:true,syntheticChecks:count,originalUnchanged:true}));
} finally {await rm(temp,{recursive:true,force:true});}

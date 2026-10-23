import assert from 'node:assert/strict';
import test from 'node:test';
import {parseStoredNote} from '../src/note-document.js';
import {noteClipboard} from '../src/note-clipboard.js';

test('rich copy exports list order, task state, all inks, blank lines and escaped text',()=>{
 const value=noteClipboard(parseStoredNote({format:'md1',text:'[红]{red}[蓝]{blue}[绿]{green}[黄]{yellow}[灰]{gray}\n\n7. 七\n9. 九\n- 项\n- [ ] 未办\n- [x] 已办\n<&"🙂'}));
 assert.equal(value.plain,'红蓝绿黄灰\n\n7. 七\n9. 九\n• 项\n[ ] 未办\n[x] 已办\n<&"🙂');
 for(const part of ['color:#ff6b6b','color:#6fb0ff','color:#a6e36e','color:#ffd166','color:#8b98b8','<ol start="7"','<li value="9"','☐','☑','text-decoration:line-through','<br>','&lt;&amp;&quot;🙂'])assert.ok(value.html.includes(part),part);
 assert.ok(!value.html.includes('<input'));
 assert.ok(value.html.includes('charset="utf-8"'));assert.ok(value.rtf.includes('7.\\tab '));assert.ok(value.rtf.includes('9.\\tab '));assert.ok(value.rtf.includes('\\u9745?'));assert.ok(value.rtf.includes('\\strike '));assert.ok(value.rtf.includes('\\u-10179?\\u-8638?'));assert.ok(/^[\x00-\x7f]*$/.test(value.rtf));
});
test('RTF escapes literal control syntax rather than interpreting it',()=>{
 const value=noteClipboard(parseStoredNote({text:'{\\rtf1} <img src=x>\t中文'}));assert.ok(value.rtf.includes('\\{\\\\rtf1\\}'));assert.equal(value.plain,'{\\rtf1} <img src=x>\t中文');assert.ok(!value.html.includes('<img'));
});
test('legacy plain prefixes remain literal and old unformatted long text can copy',()=>{
 const value=noteClipboard(parseStoredNote({text:'1. 原文\n- [x] 原文\n'+ '旧'.repeat(20001)}));
 assert.ok(!value.html.includes('<ol'));assert.ok(!value.html.includes('☑'));
 assert.equal(value.plain,'1. 原文\n- [x] 原文\n'+'旧'.repeat(20001));
});
test('legacy nested inks render visible text safely without leaking format markup',()=>{
 const value=noteClipboard(parseStoredNote({text:'[[内]{blue}外]{red}'}));
 assert.equal(value.plain,'内外');assert.ok(value.html.includes('color:#6fb0ff">内'));assert.ok(value.html.includes('color:#ff6b6b">外'));
});
test('blank final list items and trailing paragraph survive rich export',()=>{
 const value=noteClipboard(parseStoredNote({format:'md1',text:'0. 零\n1. \n\n'}));
 assert.equal(value.plain,'0. 零\n1. \n\n');assert.ok(value.html.includes('<ol start="0"'));assert.equal((value.html.match(/<br>/g)||[]).length,3);
 assert.equal((value.rtf.match(/\\par\n/g)||[]).length,3);
});

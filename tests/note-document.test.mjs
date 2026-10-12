// 派单175聊天候选；复制到项目tests/后由根在隔离运行器执行。本子代理未执行。
// 仅纯内存，无fs/network/真实data/Vault；不锁随机line ID或无关分段数量。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEditorDoc, parseStoredNote, serializeEditorDoc, visibleLine, docSelection,
  replaceEditorText, deleteEditorText, applyEditorInk, applyEditorList,
  toggleEditorTask, boundedDoc,
} from '../src/note-document.js';

const md = text => parseEditorDoc(text, 'md1');
const value = serializeEditorDoc;
const selection = (doc, a, f = a) => docSelection(doc, a, f);
const point = (line, offset) => ({line, offset});
const shown = doc => doc.lines.map(visibleLine).join('\n');
function paired(text) {
  for (let i=0;i<text.length;i++) {
    const code=text.charCodeAt(i);
    if (code>=0xd800&&code<=0xdbff) {const next=text.charCodeAt(++i);assert(next>=0xdc00&&next<=0xdfff,'高代理项必须有对应低代理项');}
    else assert(code<0xdc00||code>0xdfff,'不能出现孤立低代理项');
  }
}

test('175无动作md1逐字往返：空行、原前缀、编号、taskX/无空格、五色与字面括号', () => {
  const inputs = [
    '', '\n', '\n\n尾\n\n', '  段落  \n\t尾',
    '* 星\n- 横线\n0007. 原编号\n0. 零编号\n9999. 最大编号',
    '- [X]无空格\n- [x] 完成\n- [ ]未办\n- [ ] ',
    '[甲]{red}[乙]{red}[丙]{blue}\n[丁]{green}[戊]{yellow}[己]{gray}',
    '字面[括号]与[[甲]{red}]以及[字]{purple}\n<img src=x onerror=alert(1)>',
  ];
  for (const raw of inputs) assert.equal(value(md(raw)),raw,JSON.stringify(raw));
});

test('175局部编辑只重写实际行：其它前缀/同色原分段/尾空行保持', () => {
  const raw='0007. [甲]{red}[乙]{red}\n* 星\n- [X]无空格\n\n尾\n',doc=md(raw);
  const edited=replaceEditorText(doc,selection(doc,point(0,2)),'!').doc;
  assert.equal(value(edited),'0007. [甲]{red}[乙]{red}!\n* 星\n- [X]无空格\n\n尾\n');
  assert.equal(value(doc),raw,'事务不修改输入');
  const once=toggleEditorTask(doc,2),twice=toggleEditorTask(once,2);
  assert.equal(value(once),'0007. [甲]{red}[乙]{red}\n* 星\n- [ ]无空格\n\n尾\n');
  assert.equal(value(twice),raw,'两次任务切换恢复原X/空格前缀');
});

test('175legacyplain不抢解释：普通正文编辑保mode/列表与色标字面原文', () => {
  const raw='* 旧符号\n- [X]旧任务\n[字]{red}\n',doc=parseEditorDoc(raw);
  assert.equal(doc.mode,'plain');assert(doc.lines.every(l=>l.kind==='p'));assert(doc.lines.flatMap(l=>l.runs).every(r=>!r.ink));
  assert.equal(value(doc),raw);
  const edited=replaceEditorText(doc,selection(doc,point(0,5)),'!').doc;
  assert.equal(edited.mode,'plain');assert.equal(value(edited),'* 旧符号!\n- [X]旧任务\n[字]{red}\n');
  const long='旧'.repeat(20001);assert.equal(value(parseEditorDoc(long)),long);assert.throws(()=>parseEditorDoc(long,'md1'),/上限/);
});

test('175列表仅覆盖选中行：末端offset0不包含下一行，反向同结果/方向保持', () => {
  const doc=md('甲\n乙\n丙'),a=point(0,0),f=point(2,0);
  for (const [anchor,focus] of [[a,f],[f,a]]) {
    const sel=selection(doc,anchor,focus),result=applyEditorList(doc,sel,'ol');
    assert.equal(value(result.doc),'1. 甲\n2. 乙\n丙');
    assert.deepEqual(result.selection.anchor,anchor);assert.deepEqual(result.selection.focus,focus);
    assert.equal(result.doc.lines[2],doc.lines[2],'未覆盖末行原对象保留');
    assert.equal(value(applyEditorList(result.doc,result.selection,'ol').doc),'甲\n乙\n丙');
  }
  const prefixes=md('0007. 甲\n* 乙\n9. 丙');
  assert.equal(value(applyEditorList(prefixes,selection(prefixes,point(1,0)),'task').doc),'0007. 甲\n- [ ] 乙\n9. 丙');
});

test('175空列表Enter/首Backspace退段落；非空OL换行继承编号且空项不多生一行', () => {
  for (const raw of ['* ','7. ','- [X]']) {
    const doc=md(raw),sel=selection(doc,point(0,0));
    assert.equal(value(replaceEditorText(doc,sel,'\n').doc),'');
    assert.equal(value(deleteEditorText(doc,sel,true).doc),'');
  }
  const doc=md('7. 甲'),entered=replaceEditorText(doc,selection(doc,point(0,1)),'\n');
  assert.equal(value(entered.doc),'7. 甲\n8. ');
  assert.equal(value(replaceEditorText(entered.doc,entered.selection,'\n').doc),'7. 甲\n');
});

test('175快捷输入只针对折叠普通insertText：选区替换/粘贴式输入不转1.列表', () => {
  const plain=parseEditorDoc('1.'),converted=replaceEditorText(plain,selection(plain,point(0,2)),' ',null,{shortcut:true});
  assert.equal(converted.doc.lines[0].kind,'ol');assert.equal(value(converted.doc),'1. ');assert.equal(converted.selection.anchor.offset,0);
  const selected=parseEditorDoc('1.X'),replacement=replaceEditorText(selected,selection(selected,point(0,2),point(0,3)),' ',null,{shortcut:true});
  assert.equal(replacement.doc.lines[0].kind,'p');assert.equal(value(replacement.doc),'1. ');
  const pasted=replaceEditorText(parseEditorDoc(''),selection(parseEditorDoc(''),point(0,0)),'1. ');
  assert.equal(pasted.doc.lines[0].kind,'p');assert.equal(value(pasted.doc),'1. ');
});

test('175五色逐一可设置/同色取消，不丢未选择文本', () => {
  for (const color of ['red','blue','green','yellow','gray']) {
    const doc=md('甲乙丙'),sel=selection(doc,point(0,1),point(0,2)),painted=applyEditorInk(doc,sel,color);
    assert.equal(value(painted.doc),`甲[乙]{${color}}丙`);assert.equal(shown(painted.doc),'甲乙丙');
    assert.equal(value(applyEditorInk(painted.doc,painted.selection,color,painted.typingInk).doc),'甲乙丙');
    assert.equal(value(doc),'甲乙丙');
  }
  assert.throws(()=>applyEditorInk(md('甲'),selection(md('甲'),point(0,0)), 'purple'),/字色/);
});

test('175方括号/换行保持字面，仅可表示子段着色；同色取消不留语法残片', () => {
  const doc=md('甲[乙]丙\n\n丁'),sel=selection(doc,point(0,0),point(2,1)),painted=applyEditorInk(doc,sel,'blue');
  assert.equal(value(painted.doc),'[甲]{blue}[[乙]{blue}][丙]{blue}\n\n[丁]{blue}');
  assert.equal(shown(md(value(painted.doc))),'甲[乙]丙\n\n丁');
  assert.equal(value(applyEditorInk(painted.doc,painted.selection,'blue',painted.typingInk).doc),'甲[乙]丙\n\n丁');
});

test('175无选区改输入色不插占位字；删除不清typingInk，实际着色输入才改mode', () => {
  const doc=parseEditorDoc('甲乙'),sel=selection(doc,point(0,2)),armed=applyEditorInk(doc,sel,'red');
  assert.equal(armed.doc,doc);assert.equal(value(armed.doc),'甲乙');assert.equal(armed.typingInk,'red');
  const deleted=deleteEditorText(doc,sel,true,armed.typingInk);
  assert.equal(value(deleted.doc),'甲');assert.equal(deleted.doc.mode,'plain');assert.equal(deleted.typingInk,'red');
  const input=replaceEditorText(deleted.doc,deleted.selection,'新',deleted.typingInk);
  assert.equal(value(input.doc),'甲[新]{red}');assert.equal(input.doc.mode,'md1');
  const off=applyEditorInk(input.doc,input.selection,'red',input.typingInk);
  assert.equal(off.typingInk,null);assert.equal(value(off.doc),'甲[新]{red}');
});

test('175可见UTF16与grapheme：emoji着色不拆代理对，旗帜/肤色/ZWJ/组合音整体删除含跨Run', () => {
  for (const cluster of ['🙂','🇨🇳','👩🏽‍💻','e\u0301']) {
    const doc=md('A'+cluster+'B'),sel=selection(doc,point(0,1),point(0,1+cluster.length));
    const painted=applyEditorInk(doc,sel,'green');assert.equal(value(painted.doc),`A[${cluster}]{green}B`);paired(value(painted.doc));
    assert.equal(value(deleteEditorText(doc,selection(doc,point(0,1+cluster.length)),true).doc),'AB');
    assert.equal(value(deleteEditorText(doc,selection(doc,point(0,1)),false).doc),'AB');
    const first=Array.from(cluster)[0].length;
    if(first<cluster.length)for(const backward of [true,false])assert.equal(value(deleteEditorText(doc,selection(doc,point(0,1+first)),backward).doc),'AB','字素内部有效UTF16点删除完整字素');
  }
  const surrogate=md('A🙂B');assert.deepEqual(selection(surrogate,point(0,2)).anchor,point(0,1),'代理对内部点归到安全边界');
  const cross=md('A[e]{red}\u0301B');
  for(const backward of [true,false])assert.equal(value(deleteEditorText(cross,selection(cross,point(0,2)),backward).doc),'AB','字素跨色Run也不残留组合音');
});

test('17520k按序列化JS长度守门：格式标记计入、整事务拒绝、emoji计2、不截断', () => {
  const raw='x'.repeat(19993),doc=md(raw),sel=selection(doc,point(0,19992),point(0,19993));
  const exact=applyEditorInk(doc,sel,'red');assert.equal(value(exact.doc).length,20000);assert.equal(boundedDoc(exact.doc),exact.doc);
  assert.throws(()=>replaceEditorText(exact.doc,selection(exact.doc,point(0,19993)),'!'),/20000/);
  assert.throws(()=>applyEditorInk(doc,sel,'yellow'),/20000/);assert.equal(value(doc),raw,'拒绝超限没有修改原doc');
  const emoji='x'.repeat(19998)+'🙂';assert.equal(value(md(emoji)),emoji);paired(emoji);
  assert.throws(()=>parseEditorDoc(emoji+'x','md1'),/上限/);
  assert.throws(()=>replaceEditorText(md(emoji),selection(md(emoji),point(0,20000)),'x'),/20000/);
  assert.throws(()=>boundedDoc(md('甲\u0000乙')),/控制字符/);
});

test('362旧字色展示恢复，不解释旧列表，也不迁移或改写原文',()=>{
 const note={id:'legacy',text:'- 旧前缀\n[文字]{red}\n空行后\n',at:'固定时间'};
 const frozen=structuredClone(note),doc=parseStoredNote(note);
 assert.equal(shown(doc),'- 旧前缀\n文字\n空行后\n');
 assert.ok(doc.lines.every(line=>line.kind==='p'));
 assert.equal(doc.lines[1].runs[0].ink,'red');
 assert.equal(serializeEditorDoc(doc),note.text);
 assert.deepEqual(note,frozen);
 assert.equal(shown(parseEditorDoc(note.text)),note.text,'低层默认纯文契约保持');
});
test('362显式纯文、未知标记、超长旧笔记保持原文；md1仍保留任务语义',()=>{
 for(const note of [{text:'[文字]{red}',format:'plain'},{text:'[文字]{purple}'},{text:'[文字]{red}'+ '长'.repeat(20001)}]){
  const doc=parseStoredNote(note);assert.equal(shown(doc),note.text);assert.equal(serializeEditorDoc(doc),note.text);
 }
 const rich=parseStoredNote({text:'- [ ] [任务]{green}',format:'md1'});assert.equal(rich.lines[0].kind,'task');assert.equal(rich.lines[0].runs[0].ink,'green');
});
test('旧便签嵌套字色只展开显示：内层颜色优先，不漏标记原文，未改动时原样写回', () => {
  for (const [text, runs] of [
    ['[[文字]{blue}委屈啊等等]{red}', [['文字','blue'],['委屈啊等等','red']]],
    ['[111[文字]{green}]{green}', [['111','green'],['文字','green']]],
  ]) {
    const doc = parseStoredNote({ text });
    assert.deepEqual(doc.lines[0].runs.map(r => [r.text, r.ink]), runs);
    assert.ok(!doc.lines[0].runs.some(r => /[\[\]{}]/.test(r.text)), '不显示 [ ] { } 原文');
    assert.equal(serializeEditorDoc(doc), text);
  }
});

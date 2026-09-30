// 随手记受限 Markdown（路线 v3 切片 1.4，格式标记 md1）。
// 只识别：“- ” 无序列表、“1. ” 有序列表、“- [ ] / - [x] ” 任务列表、“[文字]{red}” 五种字色。
// 其余一律当作普通文字；解析结果只交给 React 以文本节点渲染，不生成 HTML，因此天然转义。
export const NOTE_FORMAT = "md1";
export const NOTE_MAX = 20000;
export const INKS = [
  ["red", "红色"],
  ["blue", "蓝色"],
  ["green", "绿色"],
  ["yellow", "黄色"],
  ["gray", "灰色"],
];
const INK = /\[([^[\]\n]+)\]\{(red|blue|green|yellow|gray)\}/g;
const TASK = /^- \[( |x|X)\] ?(.*)$/;
const UL = /^[-*] (.*)$/;
const OL = /^(\d{1,4})\. (.*)$/;

// 一行文字拆成普通片段与字色片段。
export function inline(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(INK)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[1], ink: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
export const plainText = (text) => text.replace(INK, "$1");

// 按行分块：相邻同类列表行合为一块，相邻普通行合为一段，空行分段。
// index 是该行在原文中的行号，任务勾选按行号回写。
export function parseNote(text) {
  const blocks = [];
  const push = (type, item, extra = {}) => {
    const lastBlock = blocks.at(-1);
    if (lastBlock?.type === type) lastBlock.items.push(item);
    else blocks.push({ type, items: [item], ...extra });
  };
  text.split("\n").forEach((line, index) => {
    let m;
    if ((m = TASK.exec(line)))
      push("tasks", { text: m[2], checked: m[1] !== " ", index });
    else if ((m = UL.exec(line))) push("ul", { text: m[1], index });
    else if ((m = OL.exec(line)))
      push("ol", { text: m[2], index }, { start: Number(m[1]) });
    else if (!line.trim()) blocks.push({ type: "gap", items: [] });
    else push("p", { text: line, index });
  });
  return blocks.filter((b) => b.type !== "gap");
}

export function toggleTask(text, index) {
  const lines = text.split("\n");
  const m = TASK.exec(lines[index] ?? "");
  if (!m) return text;
  lines[index] = `- [${m[1] === " " ? "x" : " "}] ${m[2]}`;
  return lines.join("\n");
}

const stripList = (line) => {
  let m;
  if ((m = TASK.exec(line))) return m[2];
  if ((m = UL.exec(line))) return m[1];
  if ((m = OL.exec(line))) return m[2];
  return line;
};
const kindOf = (line) =>
  TASK.test(line) ? "task" : UL.test(line) ? "ul" : OL.test(line) ? "ol" : "";

// 把选区覆盖的整行设为某种列表；这些行已经全是该列表时取消。
export function applyList(value, start, end, kind) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = value.indexOf("\n", Math.max(end, start));
  if (end > start && value[end - 1] === "\n") lineEnd = end - 1;
  if (lineEnd === -1) lineEnd = value.length;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const off = lines.every((l) => kindOf(l) === kind);
  const block = lines
    .map((line, i) => {
      const body = stripList(line);
      if (off) return body;
      return (
        { ul: "- ", ol: `${i + 1}. `, task: "- [ ] " }[kind] + body
      );
    })
    .join("\n");
  return {
    value: value.slice(0, lineStart) + block + value.slice(lineEnd),
    start: lineStart,
    end: lineStart + block.length,
  };
}

// 给选中文字加字色；没有选中时插入占位“文字”并选中它。已着色的选区改为新颜色。
export function applyInk(value, start, end, ink) {
  const selected = value.slice(start, end);
  let replaced;
  if (!selected) replaced = `[文字]{${ink}}`;
  else {
    const whole = /^\[([^[\]\n]+)\]\{(?:red|blue|green|yellow|gray)\}$/.exec(selected);
    replaced = whole
      ? `[${whole[1]}]{${ink}}`
      : selected
          .split("\n")
          .map((seg) => (seg.trim() ? `[${seg}]{${ink}}` : seg))
          .join("\n");
  }
  const next = value.slice(0, start) + replaced + value.slice(end);
  return selected
    ? { value: next, start, end: start + replaced.length }
    : { value: next, start: start + 1, end: start + 3 };
}

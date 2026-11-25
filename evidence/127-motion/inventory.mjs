// 抽取所有 CSS 规则中的 transition / animation 声明，带选择器、文件行号。
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const dir = "wt/src/";
const files = readdirSync(dir).filter(f => f.endsWith(".css")).concat(["collection/app/styles.css"].filter(()=>false));
const out = [];
for (const f of files) {
  const src = readFileSync(dir + f, "utf8");
  // 粗解析：逐字符跟踪 { } 深度，记录选择器与声明块
  let i = 0, stack = [], buf = "", line = 1, selLine = 1;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "\n") line++;
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); for (let k = i; k < e; k++) if (src[k] === "\n") line++; i = e + 1; continue; }
    if (c === "{") { stack.push({ sel: buf.trim().replace(/\s+/g, " "), line: selLine }); buf = ""; continue; }
    if (c === "}") {
      const top = stack.pop();
      const body = buf; buf = "";
      if (top) for (const d of body.split(";")) {
        const m = d.match(/^\s*(transition|transition-[a-z-]+|animation|animation-[a-z-]+)\s*:\s*([\s\S]+)$/);
        if (m) out.push({ file: f, line: top.line, ctx: stack.map(s => s.sel).join(" » "), sel: top.sel.slice(0, 140), prop: m[1], val: m[2].replace(/\s+/g, " ").trim() });
      }
      selLine = line; continue;
    }
    if (!buf.trim()) selLine = line;
    buf += c;
  }
}
writeFileSync("evidence/inventory.tsv", out.map(o => [o.file + ":" + o.line, o.ctx, o.sel, o.prop, o.val].join("\t")).join("\n"));
console.log(out.length, "declarations");

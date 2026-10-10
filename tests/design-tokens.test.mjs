// Claude 165 设计评审 P0：除受保护的根令牌与像素液晶外，样式层不写圆角 / 字号 / 颜色字面值，一律引用令牌。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const src = join(import.meta.dirname, "../src");
// styles.css 是根令牌（资产卡墙受保护），partner-lcd.css 是伙伴屏像素调色板。
const EXEMPT = new Set(["styles.css", "partner-lcd.css"]);
const files = readdirSync(src).filter((f) => f.endsWith(".css") && !EXEMPT.has(f));
// 公共层开头的令牌补全块本身就是定义处。
const body = (f) => {
  const s = readFileSync(join(src, f), "utf8");
  return f === "ui-v14.css" ? s.replace(/:root\s*\{[^}]*\}/, "") : s;
};

test("样式层圆角只用令牌（2–3px 像素级小件与多值异形除外）", () => {
  const bad = files.flatMap((f) =>
    [...body(f).matchAll(/border-radius:\s*([0-9.]+)px\s*;/g)].filter((m) => Number(m[1]) > 3).map((m) => `${f}: ${m[0]}`),
  );
  assert.deepEqual(bad, []);
});

test("样式层字号只用令牌", () => {
  const bad = files.flatMap((f) => {
    const s = body(f);
    return [
      ...[...s.matchAll(/font-size:\s*[0-9.]+px/g)].map((m) => `${f}: ${m[0]}`),
      ...[...s.matchAll(/\bfont:[^;{}]*?(?<![\w.-])[0-9.]+px(?=[\s/])/g)].map((m) => `${f}: ${m[0]}`),
    ];
  });
  assert.deepEqual(bad, []);
});

test("样式层颜色只用令牌（中性 #fff / #000 除外）", () => {
  const bad = files.flatMap((f) =>
    [...body(f).matchAll(/#[0-9a-fA-F]{3,8}\b/g)].filter((m) => !/^#(fff|000)$/i.test(m[0])).map((m) => `${f}: ${m[0]}`),
  );
  assert.deepEqual(bad, []);
});

test("令牌补全块只补新名字，不覆盖受保护根令牌", () => {
  const root = readFileSync(join(src, "styles.css"), "utf8").match(/:root\s*\{[^}]*\}/)[0];
  const extra = readFileSync(join(src, "ui-v14.css"), "utf8").match(/:root\s*\{[^}]*\}/)[0];
  const names = (s) => new Set([...s.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const clash = [...names(extra)].filter((n) => names(root).has(n));
  assert.deepEqual(clash, []);
});

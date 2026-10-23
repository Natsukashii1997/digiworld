// Claude 165 设计评审 P0：除受保护的根令牌与像素液晶外，样式层不写圆角 / 字号 / 颜色字面值，一律引用令牌。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const src = join(import.meta.dirname, "../src");
// tokens.css 是唯一的令牌定义处，styles.css 受保护（资产卡墙），partner-lcd.css 是伙伴屏像素调色板。
const EXEMPT = new Set(["tokens.css", "styles.css", "partner-lcd.css"]);
const files = readdirSync(src).filter((f) => f.endsWith(".css") && !EXEMPT.has(f));
const body = (f) => readFileSync(join(src, f), "utf8");

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

test("令牌只在 tokens.css 定义，每个名字只定义一次", () => {
  const roots = (s) => [...s.matchAll(/:root\s*\{[^}]*\}/g)].map((m) => m[0]).join("\n");
  const names = (s) => [...roots(s).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
  const defined = names(readFileSync(join(src, "tokens.css"), "utf8"));
  assert.deepEqual(defined.filter((n, i) => defined.indexOf(n) !== i), []);
  const elsewhere = [...files, "styles.css"].flatMap((f) => names(body(f)).map((n) => `${f}: ${n}`));
  assert.deepEqual(elsewhere, []);
});

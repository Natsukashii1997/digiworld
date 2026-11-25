// #127 动效语言守护：同一类变化只用同一档时长和曲线，样式层不再自造字面量时长；JS 那份数值与 tokens.css 一致。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { T, EASE, FM } from "../src/motion-tokens.js";

const src = join(import.meta.dirname, "../src");
// 去掉注释再查，说明文字里的「transition」不算声明。
const body = (f) => readFileSync(join(src, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
// 已定区域保留原值：桑基（DECIDED）、随手记便签（DECIDED 样稿）、v13.2 操作手感、扫描线方案 A、伙伴屏；tokens.css 是定义处。
const EXEMPT = new Set(["tokens.css", "project-relations.css", "notes-v16.css", "notes-types.css", "floating-notes.css", "interaction.css", "scan-motion.css", "partner-lcd.css"]);
const files = readdirSync(src).filter((f) => f.endsWith(".css") && !EXEMPT.has(f));

test("样式层 transition 只用时长令牌（减少动效兜底的 0.001ms 与错峰 calc 除外）", () => {
  const bad = files.flatMap((f) =>
    [...body(f).matchAll(/\btransition(?:-duration)?\s*:([^;{}]+)/g)]
      .filter((m) => !/0\.001ms/.test(m[1]))
      .filter((m) => /(?<![\w(*-])[0-9]*\.?[0-9]+m?s\b/.test(m[1].replace(/calc\([^)]*\)/g, "")))
      .map((m) => `${f}: transition:${m[1].trim()}`),
  );
  assert.deepEqual(bad, []);
});

test("样式层 transition 每段都写曲线，不落到浏览器默认 ease", () => {
  const easing = /(cubic-bezier\(|steps\(|var\(--(ease|spring)|\b(linear|ease-in-out|ease-out|ease-in)\b)/;
  const bad = [];
  for (const f of files)
    for (const m of body(f).matchAll(/\btransition\s*:([^;{}]+)/g)) {
      if (/^\s*none\s*(!\s*important)?\s*$/.test(m[1])) continue;
      let depth = 0, cur = "";
      const segs = [];
      for (const c of m[1]) { if (c === "(") depth++; if (c === ")") depth--; if (c === "," && !depth) { segs.push(cur); cur = ""; } else cur += c; }
      segs.push(cur);
      for (const s of segs) if (!easing.test(s)) bad.push(`${f}: ${s.trim()}`);
    }
  assert.deepEqual(bad, []);
});

test("motion-tokens.js 与 tokens.css 数值一致", () => {
  const css = body("tokens.css");
  const v = (name) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
  for (const [k, ms] of Object.entries(T)) assert.equal(v(`--t-${k}`), `${ms}ms`, `--t-${k}`);
  const norm = (s) => s.replace(/\s+/g, "");
  assert.equal(norm(v("--ease")), norm(EASE.out));
  assert.equal(norm(v("--ease-move")), norm(EASE.move));
  assert.equal(norm(v("--ease-in")), norm(EASE.in));
  assert.equal(norm(v("--ease-back")), norm(EASE.back));
  assert.equal(FM.fast * 1000, T.fast);
  assert.equal(FM.mid * 1000, T.mid);
  assert.deepEqual(`cubic-bezier(${FM.out.join(", ")})`, EASE.out);
});

test("收藏子应用的 framer-motion 不再写死时长，统一取 motion-tokens", () => {
  const desk = readFileSync(join(src, "collection/app/components/DeskView.tsx"), "utf8");
  const literal = [...desk.matchAll(/duration:\s*([0-9.]+)/g)].map((m) => m[1]).filter((x) => !["0", "3"].includes(x));
  // 0 = 立即到位；3 = 卡片呼吸的循环周期（装饰循环，不是状态过渡）。
  assert.deepEqual(literal, []);
  assert.match(readFileSync(join(src, "Collection.jsx"), "utf8"), /MotionConfig[^>]*transition=\{\{ duration: FM\.mid, ease: FM\.out \}\}/);
});

// 一次性状态动画（不循环、不是像素逐帧）新写的必须用时长令牌；现存的专属节奏逐个登记理由，不许悄悄新增。
const ONE_SHOT_ALLOWED = {
  "collection-arrive": "收藏新卡落桌，收藏子应用原样迁入的节奏（360ms 错峰）",
  "collection-land": "收藏新卡纸片着陆，同上",
  "nt-flip": "夜巡翻牌（夜巡已下线，页面不可达）",
  shine: "按钮悬停扫光，装饰一次",
  "cell-pop": "开机成长格逐个点亮，开机仪式编排",
  veil: "开机遮罩揭开，开机仪式编排",
  scan: "资产卡悬停封面扫描，装饰一次",
  "evo-fade": "进化仪式编排（2.6s 一整段，各段时长互相咬合）",
  "evo-glyph": "进化仪式编排",
  "evo-hatch": "进化仪式编排",
  "evo-pillar": "进化仪式编排",
  "evo-flash": "进化仪式编排",
  "evo-ring": "进化仪式编排",
  "evo-bit": "进化仪式编排",
  rise: "进化仪式说明文字（0.5s 延后 0.8s，和仪式咬合）；其余 rise 已用令牌",
  "v14-pop": "完成对勾弹出（v14 结果反馈）",
};
test("一次性状态动画新写的用时长令牌；现存专属节奏都已登记", () => {
  const found = new Map();
  for (const f of files)
    for (const m of body(f).matchAll(/\banimation\s*:([^;{}]+)/g)) {
      const v = m[1].trim();
      if (/\binfinite\b|steps\(|^none\b/.test(v)) continue;
      for (const seg of v.split(/,(?![^(]*\))/)) {
        const name = seg.trim().split(/\s+/)[0];
        if (/(?<![\w(*-])[0-9]*\.?[0-9]+m?s\b/.test(seg.replace(/calc\([^)]*\)|var\([^)]*\)/g, ""))) found.set(name, `${f}: ${seg.trim()}`);
      }
    }
  const unregistered = [...found].filter(([name]) => !ONE_SHOT_ALLOWED[name]).map(([, where]) => where);
  assert.deepEqual(unregistered, []);
  // 登记表不留过期项：改成令牌或删掉的动画，从表里一起删。
  assert.deepEqual(Object.keys(ONE_SHOT_ALLOWED).filter((name) => !found.has(name)), []);
});

// 曲线角色：回弹（--ease-back / --spring）只给小徽记、图标、计数弹出；卡片、面板、列表这类交互容器不回弹（#129 审查 P2-02）。
test("回弹曲线只用在小徽记和图标上", () => {
  const SMALL = /(svg|\.pixel\b|glyph|pin-button|asset-delete|mainline-node|sn-box|odo|count|badge|crest)/;
  const bad = [];
  for (const f of files)
    for (const m of body(f).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const t = m[2].match(/\btransition\s*:([^;]+)/);
      if (!t || !/var\(--(ease-back|spring)\)/.test(t[1])) continue;
      const selectors = m[1].trim().split(",").map((s) => s.trim());
      for (const s of selectors) if (!SMALL.test(s)) bad.push(`${f}: ${s}`);
    }
  assert.deepEqual(bad, []);
});

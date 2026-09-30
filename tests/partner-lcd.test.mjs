import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { rasterEgg, SEASONS, EGG_ROWS } from "../src/partner-lcd.js";

const rowsOf = (cells) => {
  const rows = new Map();
  for (const key of cells.keys()) {
    const [x, y] = key.split(",").map(Number);
    rows.set(y, [...(rows.get(y) || []), x]);
  }
  return rows;
};

test("伙伴屏的蛋就是最初那颗 12×14 像素蛋：直立时与原图逐格一致", async () => {
  // 用户 2026-09-30：“按之前这个圆蛋来，现在有点菱形”
  const source = await readFile(new URL("../src/pixel.jsx", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("  egg: {"), source.indexOf("  },", source.indexOf("  egg: {")));
  const spriteRows = [...block.matchAll(/"([.XOSH]{12})"/g)].map((m) => m[1]);
  assert.equal(spriteRows.length, 14);
  assert.deepEqual(EGG_ROWS, spriteRows, "引擎与侧栏精灵用同一张原图");
  const egg = rasterEgg(0);
  const code = { X: 3, O: 5, S: 6, H: 16 };
  EGG_ROWS.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      const got = egg.cells.get(`${c - 6},${r - 7}`);
      assert.equal(got, ch === "." ? undefined : code[ch], `第 ${r} 行第 ${c} 列`);
    }),
  );
});

test("任意角度都逐帧落在点阵上：轮廓闭合、面积稳定", () => {
  const base = rasterEgg(0).cells.size;
  for (let k = 0; k < 16; k++) {
    const egg = rasterEgg((k / 16) * Math.PI * 2);
    assert.ok(Math.abs(egg.cells.size - base) / base < 0.15, `角度 ${k}/16 面积 ${egg.cells.size}`);
    for (const [key, code] of egg.cells) {
      if (code === 3) continue;
      const [x, y] = key.split(",").map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        assert.ok(egg.cells.has(`${x + dx},${y + dy}`), `角度 ${k}/16 内部格 ${key} 外露`);
    }
  }
});

test("压扁帧更矮更宽；四季按春夏秋冬轮换", () => {
  const upright = rasterEgg(0),
    squash = rasterEgg(0, { sx: 1.12, sy: 0.86 });
  assert.ok(squash.bottom - squash.top < upright.bottom - upright.top);
  assert.deepEqual(SEASONS.map((s) => s.id), ["spring", "summer", "autumn", "winter"]);
});

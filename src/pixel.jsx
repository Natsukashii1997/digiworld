import { usageOf } from "./asset-usage.js";
import React from "react";
import { REF_SPRITES } from "./sprites-refs.js";

// 像素图形：每个字符是一个像素，"." 为透明。颜色走 CSS 变量，跟随主题。
const INK = "var(--px-ink)";
const mono = (rows) => ({ palette: { X: "currentColor" }, frames: [rows] });

export const SPRITES = {
  // 数码蛋：最初的对称椭圆（用户 2026-09-30 改回），与伙伴液晶屏里的蛋同一形状。
  egg: {
    palette: { X: INK, O: "var(--px-egg)", S: "var(--px-egg-spot)", H: "#fff" },
    frames: [
      [
        "....XXXX....",
        "..XXOOOOXX..",
        ".XOHOOOOOOX.",
        ".XHOOSSOOOX.",
        "XOOOSSSSOOOX",
        "XOOOOSSOOOOX",
        "XOSOOOOOOSOX",
        "XOSSOOOOSSOX",
        "XOOOOOOOOOOX",
        "XOOOSSSOOOOX",
        ".XOOSSSSOOX.",
        ".XOOOOOOOOX.",
        "..XXOOOOXX..",
        "....XXXX....",
      ],
    ],
  },
  // 滚球兽：按用户提供的 25×28 拼豆图纸逐格转录。
  koromon: {
    name: "滚球兽",
    stage: "幼年期 II",
    palette: {
      K: INK,
      P: "#ffc9dd",
      Q: "#f6a3c0",
      M: "#e8589a",
      B: "#5b1f22",
      W: "#ffffff",
      D: "#2a2a2e",
    },
    frames: [
      [
        "...................K.....",
        ".....K............KPK....",
        "....KPK...........KPK....",
        "....KPPK..........KPK....",
        "....KPPK..........KPPK...",
        "...KPPPK...........KPPK..",
        "..KPQKK..............KPK.",
        "KPPKKKK...........KKKKQQK",
        "KPQQQPPPK........KPPPQQQK",
        "KPPQQKKPPK......KPPKKQQK.",
        ".KQKK..KPKKKKKKKPPK..KK..",
        "..K....KPPPPPPPPPK.......",
        ".....KKPPPPPPPPPPPK......",
        "....KPPPPPPPPPPPPPPK.....",
        "...KPPKKKPPPPPPPKKKPK....",
        "...KPKKWWPPPPPPDWWKPK....",
        "...KPKBKBKPPPPPKBKBKPK...",
        "..KPPKQWBKPPPPPKQWBKPPK..",
        "..KPPPKKKPPPPPPPKKKPPPK..",
        ".KPPPQQPPKKKKKKKPPQQPPPK.",
        ".KPPPKKKDDDDDDDDDKKKPPPK.",
        ".KPPPPKDWDDDDDDDWDKPPPPK.",
        ".KPPPPPKDDDDDDDDDKPPPPQK.",
        "..KQPPPKMMMMMMMMKPPPQK...",
        "...KQQPPKMMMMMMMKPPPQK...",
        "....KKQPPKPMMMPKPPKK.....",
        "......KKPPKPPPKPPKK......",
        "........KKKKKKKKK........",
      ],
    ],
  },
  agumon: {
    name: "亚古兽",
    stage: "成长期",
    palette: { K: INK, O: "#ff9a1f", H: "#ffc46b", L: "#ffe0ad", W: "#fff", G: "#3fbf5a" },
    frames: [
      [
        "....KKKKKK......",
        "...KOHHOOOK.....",
        "..KOHOOOOOOK....",
        "..KOWGOOOOOOK...",
        "..KOWKOOOOOOOK..",
        "..KOOOOOOOOOOOK.",
        "..KOOOKWKWKWKK..",
        "...KOOOOOOOOK...",
        "....KKOOOOKK....",
        "...KOOKLLLLKOK..",
        "..KOOKLLLLLLKOK.",
        "..KWKKLLLLLLKWK.",
        "....KOLLLLLLOK..",
        "....KOOOKKOOOK..",
        "...KOOOK..KOOOK.",
        "...KKKK....KKKK.",
      ],
      [
        "....KKKKKK......",
        "...KOHHOOOK.....",
        "..KOHOOOOOOK....",
        "..KOOOOOOOOOK...",
        "..KOKKOOOOOOOK..",
        "..KOOOOOOOOOOOK.",
        "..KOOOKWKWKWKK..",
        "...KOOOOOOOOK...",
        "....KKOOOOKK....",
        "...KOOKLLLLKOK..",
        "..KOOKLLLLLLKOK.",
        "..KWKKLLLLLLKWK.",
        "....KOLLLLLLOK..",
        "....KOOOKKOOOK..",
        "...KOOOK..KOOOK.",
        "...KKKK....KKKK.",
      ],
    ],
  },
  // 八颗数码蛋：按用户提供的 68×37 拼豆图纸逐行转录（外形 14×16，配色取图纸色号）。
  egg1: {
    palette: { K: INK, o: "#ffd28a", O: "#ffab45", c: "#2672d6", n: "#1d2a8f" },
    frames: [
      [
        ".....KKKK.....",
        "....KooonK....",
        "...KoOOccnK...",
        "..KnOccOccnK..",
        "..KcOOcccOoK..",
        ".KnccOOOOOOoK.",
        ".KncccOOOOOoK.",
        "KnccccccccOOoK",
        "KnOOccccOOOOnK",
        "KoOOOOOOccccnK",
        "KoOOOOOOcccnnK",
        ".KoOccccccnnK.",
        ".KoOOccccOooK.",
        "..KnnOOooonK..",
        "...KnnnnnnK...",
        "....KKKKKK....",
      ],
    ],
  },
  egg2: {
    palette: { K: INK, l: "#b9c2ff", v: "#dcd4ff", b: "#4b5ad9" },
    frames: [
      [
        ".....KKKK.....",
        "....KblllK....",
        "...KbvvvvbK...",
        "..KlvvbvvvbK..",
        "..KlvvbbvvbK..",
        ".KlvvbbbvvbbK.",
        ".KbvvvvvvvvlK.",
        "KlvbvvvvvvvblK",
        "KlbbvvbbvvvvlK",
        "KbbbvvvbvvbvbK",
        "KlvvvvbbbvvbbK",
        ".KlvvvvvvvvlK.",
        ".KbbbvvbbvvlK.",
        "..KbvvvbbbbK..",
        "...KlllbbbK...",
        "....KKKKKK....",
      ],
    ],
  },
  egg3: {
    palette: { K: INK, a: "#ff9f68", r: "#ff4f63", x: "#ff3a2a" },
    frames: [
      [
        ".....KKKK.....",
        "....KraaaK....",
        "...KrraaraK...",
        "..KraaaarxrK..",
        "..KaaaaaaraK..",
        ".KaaaaaarrrrK.",
        ".KaaaaaaaaaaK.",
        "KarraaarrraaaK",
        "KarrraarraaaaK",
        "KarraaaraaaaaK",
        "KrrrraaaaarraK",
        ".KaaaaaaarrrK.",
        ".KraaaaaaarrK.",
        "..KrraaaaaaK..",
        "...KraaaarK...",
        "....KKKKKK....",
      ],
    ],
  },
  egg4: {
    palette: { K: INK, p: "#fde6f0", e: "#f9c9e3", d: "#d596d6" },
    frames: [
      [
        ".....KKKK.....",
        "....KeeedK....",
        "...KepppddK...",
        "..KeppppdddK..",
        "..KeppdddddK..",
        ".KeppppppdddK.",
        ".KedddpppddeK.",
        "KddddpppppppeK",
        "KdddppppppppeK",
        "KdddddppppppeK",
        "KddddddppdppeK",
        ".KdddddppdppK.",
        ".KdpppppddddK.",
        "..KeppppdddK..",
        "...KeeedddK...",
        "....KKKKKK....",
      ],
    ],
  },
  egg5: {
    palette: { K: INK, g: "#45cf33", c: "#fffbe2", L: "#c6f0a4" },
    frames: [
      [
        ".....KKKK.....",
        "....KLLLgK....",
        "...KgcccggK...",
        "..KggcccgggK..",
        "..KgggccccLK..",
        ".KLggccccccLK.",
        ".KLcccccggcLK.",
        "KLcccccggggcLK",
        "KLggcccggggcLK",
        "KggggccggcccgK",
        "KggggcccccccgK",
        ".KgggccccccLK.",
        ".KLccccggggLK.",
        "..KLcccggggK..",
        "...KLLLgggK...",
        "....KKKKKK....",
      ],
    ],
  },
  egg6: {
    palette: { K: INK, w: "#fbf1dc", m: "#b98aa6", r: "#cdb0bd" },
    frames: [
      [
        ".....KKKK.....",
        "....KrrrrK....",
        "...KmwwwwmK...",
        "..KmmwwwmmmK..",
        "..KmwwwwmmmK..",
        ".KrwwwwwwmmrK.",
        ".KrwwwmmwwwwK.",
        "KrwwmmmmwwwwrK",
        "KrwwwmmwwwwwmK",
        "KrwwwmmwwwwmmK",
        "KmmwwwwwwwwmmK",
        ".KmmwwwwwwwrK.",
        ".KmmwwwwmwwrK.",
        "..KrwwwmmmmK..",
        "...KrrrmmmK...",
        "....KKKKKK....",
      ],
    ],
  },
  egg7: {
    palette: { K: INK, y: "#fde36a", W: "#ffffff", a: "#fdf6c8" },
    frames: [
      [
        ".....KKKK.....",
        "....KaaaaK....",
        "...KyWWWWyK...",
        "..KyyyyyyyyK..",
        "..KayyyyyyaK..",
        ".KaWWWWWWWWaK.",
        ".KyWWWWWWWWyK.",
        "KyyyWWWWWWyyyK",
        "KyyyyyyyyyyyyK",
        "KayyyyyyyyyyaK",
        "KaWyyyyyyyyWaK",
        ".KaWWWWWWWWaK.",
        ".KyWWWWWWWyyK.",
        "..KyyyyyyyyK..",
        "...KyyyyyyK...",
        "....KKKKKK....",
      ],
    ],
  },
  egg8: {
    palette: { K: INK, p: "#fde6f0", e: "#f9c9e3", m: "#e8559a" },
    frames: [
      [
        ".....KKKK.....",
        "....KeemmK....",
        "...KepmmpeK...",
        "..KepmmpppeK..",
        "..KempppmmmK..",
        ".KmmpppmmppmK.",
        ".KeppppmmppmK.",
        "KeppppmppppmmK",
        "KemppppmpppmeK",
        "KmmmmppmpppmeK",
        "KeppmmpmmmmmeK",
        ".KeppmmmpppeK.",
        ".KeppmpppmmeK.",
        "..KepmppmmeK..",
        "...KemmemeK...",
        "....KKKKKK....",
      ],
    ],
  },
  // Prompt：像素对话框，三行文字与一个闪烁的光标。
  Prompt: {
    mode: "cursor",
    palette: {
      K: "currentColor",
      B: "var(--px-glyph-fill)",
      L: "#e6fbff",
      S: "color-mix(in srgb, currentColor 35%, #000)",
      W: "#ffffff",
      U: "#ffffff",
    },
    frames: [
      [
        ".KKKKKKKKKKKKKK.",
        "KWBBBBBBBBBBBBBK",
        "KBLLLLLLLLLBBBBK",
        "KBBBBBBBBBBBBBBK",
        "KBLLLLLLLBBBBBBK",
        "KBBBBBBBBBBBBBBK",
        "KBLLLLLUBBBBBBBK",
        "KBBBBBBUBBBBBBBK",
        "KSSSSSSSSSSSSSSK",
        ".KKKKSSKKKKKKKK.",
        "....KSK.........",
        "....KK..........",
      ],
      [
        ".KKKKKKKKKKKKKK.",
        "KWBBBBBBBBBBBBBK",
        "KBLLLLLLLLLBBBBK",
        "KBBBBBBBBBBBBBBK",
        "KBLLLLLLLBBBBBBK",
        "KBBBBBBBBBBBBBBK",
        "KBLLLLLBBBBBBBBK",
        "KBBBBBBBBBBBBBBK",
        "KSSSSSSSSSSSSSSK",
        ".KKKKSSKKKKKKKK.",
        "....KSK.........",
        "....KK..........",
      ],
    ],
  },
  // 工作流：三个节点经箭头依次连接；悬停时节点按顺序点亮，像信号沿流程流动。
  Workflow: {
    mode: "cycle",
    palette: {
      K: "currentColor",
      N: "var(--px-glyph-fill)",
      P: "color-mix(in srgb, currentColor 55%, transparent)",
      L: "#ffffff",
    },
    frames: [0, 1, 2].map((lit) => [
      "................",
      ".KKKK...........",
      `.K${lit === 0 ? "LL" : "NN"}KPPPPPP.....`,
      `.K${lit === 0 ? "LL" : "NN"}K.....P.....`,
      ".KKKK.....P.....",
      ".........PPP....",
      "..........P.....",
      "........KKKKK...",
      `........K${lit === 1 ? "LLL" : "NNN"}K...`,
      `...PPPPPK${lit === 1 ? "LLL" : "NNN"}K...`,
      "...P....KKKKK...",
      "..PPP...........",
      "...P............",
      ".KKKKK..........",
      `.K${lit === 2 ? "LLL" : "NNN"}K..........`,
      ".KKKKK..........",
    ]),
  },
  // 规则：展开的卷轴（用户 2026-09-29 选定）。上下轴有高光（L）与背光（P），纸面右侧一列阴影，条款依次点亮。
  Rule: {
    mode: "cycle",
    palette: {
      K: "currentColor",
      N: "var(--px-glyph-fill)",
      P: "color-mix(in srgb, currentColor 40%, transparent)",
      Q: "color-mix(in srgb, currentColor 55%, transparent)",
      L: "#ffffff",
    },
    frames: [0, 1, 2].map((n) => {
      const clause = (on, len) => `..KN${(on ? "L" : "Q").repeat(len)}${"N".repeat(8 - len)}PK..`;
      return [
        ".KKKKKKKKKKKKKK.",
        "KLLNNNNNNNNNNPPK",
        "KLNNNNNNNNNNNNPK",
        ".KKKKKKKKKKKKKK.",
        "..KNNNNNNNNNNK..",
        clause(n === 0, 6),
        "..KNNNNNNNNNPK..",
        clause(n === 1, 7),
        "..KNNNNNNNNNPK..",
        clause(n === 2, 4),
        "..KNNNNNNNNNPK..",
        ".KKKKKKKKKKKKKK.",
        "KLLNNNNNNNNNNPPK",
        "KLNNNNNNNNNNNNPK",
        ".KKKKKKKKKKKKKK.",
      ];
    }),
  },
  // 勇气之纹章（数码宝贝原作徽章，按像素参考图绘制）：品牌标志使用。
  crest: {
    palette: { O: "#ff8a24", L: "#ffc27a", Y: "#ffffff" },
    frames: [
      [
        "........O........",
        ".O......O......O.",
        "..OO...OOO...OO..",
        "..O...........O..",
        "......OOOOO......",
        ".....OO...OO.....",
        "....OO.LLL.OO....",
        "..O.O.L...L.O.O..",
        "OOO.O.L.Y.L.O.OOO",
        "..O.O.L...L.O.O..",
        "....OO.LLL.OO....",
        ".....OO...OO.....",
        "......OOOOO......",
        "..O...........O..",
        "..OO...OOO...OO..",
        ".O......O......O.",
        "........O........",
      ],
    ],
  },
  // 页面背景纹样（单色，取 currentColor，大尺寸低透明度使用）。
  mark_crest: mono([
    "........X........",
    ".X......X......X.",
    "..XX...XXX...XX..",
    "..X...........X..",
    "......XXXXX......",
    ".....XX...XX.....",
    "....XX.XXX.XX....",
    "..X.X.X...X.X.X..",
    "XXX.X.X.X.X.X.XXX",
    "..X.X.X...X.X.X..",
    "....XX.XXX.XX....",
    ".....XX...XX.....",
    "......XXXXX......",
    "..X...........X..",
    "..XX...XXX...XX..",
    ".X......X......X.",
    "........X........",
  ]),
  mark_egg: mono([
    "....XXXX....",
    "..XX....XX..",
    ".X...XX...X.",
    ".X..XXXX..X.",
    "X....XX....X",
    "X.XX....XX.X",
    "X.XX....XX.X",
    "X....XX....X",
    "X...XXXX...X",
    ".X...XX...X.",
    "..XX....XX..",
    "....XXXX....",
  ]),
  mark_agent: mono([
    ".....X......",
    ".....X......",
    "..XXXXXXXX..",
    ".X........X.",
    ".X.XX..XX.X.",
    ".X.XX..XX.X.",
    ".X........X.",
    ".X..XXXX..X.",
    ".X........X.",
    "..XXXXXXXX..",
    "...X....X...",
    "..XX....XX..",
  ]),
  mark_folder: mono([
    "............",
    ".XXXX.......",
    "X....X......",
    "X.....XXXXXX",
    "XXXXXXXXXXXX",
    "X..........X",
    "X..........X",
    "X..........X",
    "X..........X",
    "X..........X",
    "XXXXXXXXXXXX",
    "............",
  ]),
  mark_book: mono([
    "............",
    ".XXXX..XXXX.",
    "X....XX....X",
    "X.XX.XX.XX.X",
    "X....XX....X",
    "X.XX.XX.XX.X",
    "X....XX....X",
    "X.XX.XX.XX.X",
    "X....XX....X",
    "XXXXXXXXXXXX",
    ".....XX.....",
    "............",
  ]),
  mark_pencil: mono([
    "..........XX",
    ".........X.X",
    "........X.X.",
    ".......X.X..",
    "......X.X...",
    ".....X.X....",
    "....X.X.....",
    "...X.X......",
    "..X.X.......",
    ".XXX........",
    ".XX.........",
    "X...........",
  ]),
  mark_branch: mono([
    ".XX......XX.",
    "X..X....X..X",
    "X..X....X..X",
    ".XX......XX.",
    "..X.......X.",
    "..X......X..",
    "..X.....X...",
    "..X...XX....",
    "..XXXX......",
    ".XX.........",
    "X..X........",
    ".XX.........",
  ]),
  mark_scan: mono([
    "XXX......XXX",
    "X..........X",
    "X..........X",
    "............",
    "....XXXX....",
    "...X....X...",
    "...X....X...",
    "....XXXX....",
    "............",
    "X..........X",
    "X..........X",
    "XXX......XXX",
  ]),
  mark_moon: mono([
    "....XXXX....",
    "..XXXX......",
    ".XXXX.......",
    ".XXX........",
    "XXXX........",
    "XXXX.....X..",
    "XXXX........",
    "XXXXX.......",
    ".XXXXX......",
    ".XXXXXXX..XX",
    "..XXXXXXXXX.",
    "....XXXXX...",
  ]),
  mark_gear: mono([
    "....XXXX....",
    "..X.XXXX.X..",
    ".XXXXXXXXXX.",
    "..XXX..XXX..",
    "XXXX....XXXX",
    "XXX......XXX",
    "XXX......XXX",
    "XXXX....XXXX",
    "..XXX..XXX..",
    ".XXXXXXXXXX.",
    "..X.XXXX.X..",
    "....XXXX....",
  ]),
  // 漂浮小符号
  bit_plus: mono(["..X..", "..X..", "XXXXX", "..X..", "..X.."]),
  bit_dia: mono(["..X..", ".X.X.", "X...X", ".X.X.", "..X.."]),
  bit_block: mono(["XX.", "XX.", "..X"]),
};

SPRITES.Skill = SPRITES.egg1;
// 用图纸精确读取的版本替换手绘版，并加入暴龙兽、猛鬼兽、大便兽、机械系。
Object.assign(SPRITES, REF_SPRITES);
// 大尺寸图纸也可作为单色 LED 点阵背景纹样
for (const key of ["bakemon", "mecha"])
  SPRITES[`mark_${key}`] = {
    palette: { X: "currentColor" },
    frames: [REF_SPRITES[key].frames[0].map((r) => r.replace(/[^.]/g, "X"))],
  };
// Skill 用八颗数码蛋之一：按资产 ID 稳定取值，同一资产在各处显示同一颗蛋。
export function glyphOf(asset) {
  if (asset.type !== "Skill") return asset.type;
  const h = [...asset.id].reduce((n, ch) => (n * 33 + ch.charCodeAt(0)) >>> 0, 5381);
  return `egg${(h % 8) + 1}`;
}
// 把同一行相邻同色像素合并成一个矩形，减少节点数。
// dots 模式：每个像素只画成居中的小圆点，得到 LED 点阵质感（用于大尺寸背景纹样）。
function runs(rows, palette, dots = false) {
  const out = [];
  if (dots) {
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === "." || !palette[ch]) return;
        out.push(
          <circle key={`${y}-${x}`} cx={x + 0.5} cy={y + 0.5} r={0.2} fill={palette[ch]} />,
        );
      }),
    );
    return out;
  }
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || !palette[ch]) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      out.push(
        <rect
          key={`${y}-${x}`}
          x={x}
          y={y}
          width={end - x + 0.02}
          height={1.02}
          fill={palette[ch]}
        />,
      );
      x = end;
    }
  });
  return out;
}

export function Pixel({ sprite, size = 48, fit, className = "", palette, title, dots = false }) {
  const art = SPRITES[sprite];
  if (!art) return null;
  const colors = { ...art.palette, ...palette };
  const rows = art.frames[0];
  const width = Math.max(...rows.map((r) => r.length)),
    height = rows.length;
  // fit：让长边等于 fit 像素，不同比例的精灵放进同样大小的方框里。
  if (fit) size = (fit * width) / Math.max(width, height);
  return (
    <svg
      className={`pixel ${art.mode || (art.frames.length > 1 ? "animated" : "")} ${className}`}
      viewBox={`0 0 ${width} ${height}`}
      width={size}
      height={(size * height) / width}
      shapeRendering={dots && width <= 20 ? "geometricPrecision" : "crispEdges"}
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      {art.frames.map((frame, i) => (
        <g key={i} className={`pixel-frame f${i}`}>
          {runs(frame, colors, dots && width <= 20)}
        </g>
      ))}
    </svg>
  );
}

// 伙伴固定为数码蛋（用户 2026-09-29：不再按资产数量进化，去掉进化线）。own 只用于首页一句说明。
export function partnerOf(state) {
  const own = state.assets.filter((a) => !a.demo && !a.archived).length;
  return { sprite: "egg", name: "数码蛋", stage: "孵化前", own };
}

// 资产阶段依赖当前固定版本的使用证据，版本迭代不代替使用反馈。
export const STAGES = ["幼年期", "成长期", "成熟期", "完全体", "究极体"];
export function stageOf(asset, activity = []) {
  return usageOf(asset, activity).stage;
}
export function StageBar({ stage, label = true, pop = false }) {
  return (
    <span
      className="stage-bar"
      title={`使用证据阶段：${STAGES[stage]}（成长期：已收录；成熟期：成功复制；完全体：本人正向反馈；不代表 Agent 已采用）`}
    >
      {label && <span className="stage-name">{STAGES[stage]}</span>}
      <span className="stage-cells" aria-hidden="true">
        {STAGES.map((_, i) => (
          <i
            key={i}
            className={`${i <= stage ? "on" : ""} ${pop && i === stage ? "pop" : ""}`}
          />
        ))}
      </span>
    </span>
  );
}

// 数码暴龙机外壳 + 液晶屏
export function Digivice({ children, size = "md", className = "" }) {
  return (
    <div className={`digivice ${size} ${className}`} aria-hidden="true">
      <div className="digivice-screen">{children}</div>
    </div>
  );
}

// 像素文字：先用小字号画到画布，再把每个像素硬切成全透明或不透明，得到真正的点阵字。
// 服务端渲染或画布不可用时，退回普通文字（仍保留可读的替代文本）。
export function PixelText({ text, size = 13, weight = 700, threshold = 120, scale = 2, color = "#ffffff", className = "" }) {
  const [src, setSrc] = React.useState(null);
  const [box, setBox] = React.useState(null);
  React.useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const font = `${weight} ${size}px "PingFang SC", "Hiragino Sans GB", sans-serif`;
      ctx.font = font;
      const width = Math.ceil(ctx.measureText(text).width) + 2,
        height = size + 4;
      canvas.width = width;
      canvas.height = height;
      ctx.font = font;
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText(text, 1, height / 2 + 1);
      const data = ctx.getImageData(0, 0, width, height);
      const [r, g, b] = color.match(/\w\w/g).map((h) => parseInt(h, 16));
      for (let i = 0; i < data.data.length; i += 4) {
        const on = data.data[i + 3] > threshold;
        data.data[i] = r;
        data.data[i + 1] = g;
        data.data[i + 2] = b;
        data.data[i + 3] = on ? 255 : 0;
      }
      ctx.putImageData(data, 0, 0);
      // 按实际笔画裁掉四周空白，方便与其他元素精确对齐。
      let x0 = width, x1 = -1, y0 = height, y1 = -1;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (data.data[(y * width + x) * 4 + 3]) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
      const w = x1 - x0 + 1,
        h = y1 - y0 + 1;
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      out.getContext("2d").drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
      setSrc(out.toDataURL());
      setBox({ width: w * scale, height: h * scale });
    } catch {
      setSrc(null);
    }
  }, [text, size, weight, threshold, scale, color]);
  return src ? (
    <img
      className={`pixel-text ${className}`}
      src={src}
      width={box.width}
      height={box.height}
      alt={text}
    />
  ) : (
    <span className={`pixel-text fallback ${className}`}>{text}</span>
  );
}

// 数码暴龙机（初代造型）：卡扣外壳、双线霓虹描边、旋转的数码文字环、电路边框屏幕、三枚按键与天线。
// 屏幕内容由 children 提供（像素伙伴或数码蛋）。纯装饰，不可聚焦。
export function DigiviceArt({ children, size = 220, className = "" }) {
  const id = React.useId().replaceAll(":", "");
  return (
    <div
      className={`digivice-art ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 200" width={size} height={size}>
        <defs>
          <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1b2d4d" />
            <stop offset="1" stopColor="#0a1426" />
          </linearGradient>
          <radialGradient id={`${id}s`} cx=".5" cy=".45" r=".6">
            <stop offset="0" stopColor="#10283a" />
            <stop offset="1" stopColor="#07111d" />
          </radialGradient>
          <filter id={`${id}g`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* 天线 */}
        <g className="dv-antenna">
          <rect x="22" y="10" width="9" height="16" rx="3" transform="rotate(-28 26 18)" />
          <rect x="24.5" y="24" width="4" height="8" transform="rotate(-28 26 28)" />
        </g>
        {/* 外壳 */}
        <path
          className="dv-body"
          fill={`url(#${id}b)`}
          d="M60 24 H140 Q168 24 176 50 L178 70 Q190 76 190 100 Q190 124 178 130 L176 150 Q168 176 140 176 H60 Q32 176 24 150 L22 130 Q10 124 10 100 Q10 76 22 70 L24 50 Q32 24 60 24 Z"
        />
        <g className="dv-lines" filter={`url(#${id}g)`}>
          <path d="M60 24 H140 Q168 24 176 50 L178 70 Q190 76 190 100 Q190 124 178 130 L176 150 Q168 176 140 176 H60 Q32 176 24 150 L22 130 Q10 124 10 100 Q10 76 22 70 L24 50 Q32 24 60 24 Z" />
          <path
            className="dv-inner"
            d="M62 31 H138 Q162 31 169 53 L171 73 Q182 79 182 100 Q182 121 171 127 L169 147 Q162 169 138 169 H62 Q38 169 31 147 L29 127 Q18 121 18 100 Q18 79 29 73 L31 53 Q38 31 62 31 Z"
          />
          {/* 上下卡扣 */}
          <rect x="66" y="16" width="22" height="12" rx="3" />
          <rect x="112" y="16" width="22" height="12" rx="3" />
          <rect x="66" y="172" width="22" height="12" rx="3" />
          <rect x="112" y="172" width="22" height="12" rx="3" />
          {/* 四角斜面 */}
          <path d="M38 44 L56 58 M162 44 L144 58 M38 156 L56 142 M162 156 L144 142" />
          {/* 数码文字环（双线） */}
          <circle cx="100" cy="100" r="66" />
          <circle cx="100" cy="100" r="48" />
        </g>
        <g className="dv-code">
          <circle cx="100" cy="100" r="57" />
        </g>
        <g className="dv-arrows">
          <path d="M53 86 l-5 -3 m5 3 l-5 3 M147 114 l5 -3 m-5 3 l5 3" />
        </g>
        {/* 屏幕与电路边框 */}
        <circle cx="100" cy="100" r="46" fill={`url(#${id}s)`} className="dv-bezel" />
        <g className="dv-circuit">
          <path d="M66 82 h8 v-6 M66 118 h8 v6 M134 82 h-8 v-6 M134 118 h-8 v6 M84 62 v8 h6 M116 62 v8 h-6 M84 138 v-8 h6 M116 138 v-8 h-6 M62 100 h6 M132 100 h6" />
          <circle cx="74" cy="76" r="1.4" />
          <circle cx="126" cy="76" r="1.4" />
          <circle cx="74" cy="124" r="1.4" />
          <circle cx="126" cy="124" r="1.4" />
        </g>
        <rect x="71" y="71" width="58" height="58" rx="7" className="dv-lcd-frame" filter={`url(#${id}g)`} />
        {/* 按键：左一个圆形，右两个椭圆 */}
        <g className="dv-buttons" filter={`url(#${id}g)`}>
          <circle cx="24" cy="100" r="11" />
          <circle cx="24" cy="100" r="6" />
          <ellipse cx="176" cy="80" rx="11" ry="9" />
          <ellipse cx="176" cy="80" rx="6" ry="4.5" />
          <ellipse cx="176" cy="120" rx="11" ry="9" />
          <ellipse cx="176" cy="120" rx="6" ry="4.5" />
        </g>
      </svg>
      <div className="digivice-lcd">{children}</div>
    </div>
  );
}

// 八大纹章（数码宝贝原作，按参考图绘制的霓虹线稿），顺时针自顶部排列。纯装饰。
const CRESTS = [
  {
    name: "勇气",
    color: "#ff8a24",
    d: "M20 1 L22.6 9.5 H17.4 Z M20 39 L22.6 30.5 H17.4 Z M1 20 L9.5 17.4 V22.6 Z M39 20 L30.5 17.4 V22.6 Z M7 7 L10.2 12.6 L12.6 10.2 Z M33 7 L29.8 12.6 L27.4 10.2 Z M7 33 L10.2 27.4 L12.6 29.8 Z M33 33 L29.8 27.4 L27.4 29.8 Z",
    circles: [[20, 20, 7.5], [20, 20, 3]],
  },
  {
    name: "爱心",
    color: "#ff4d4d",
    d: "M20 35 L8 22 C3 16 6 7 13 7 C17 7 20 10 20 13 C20 10 23 7 27 7 C34 7 37 16 32 22 Z M13.5 18 C9.5 16.5 10 11 14 11 C17 11 17.2 15 14.3 15",
    circles: [[27, 14.5, 4], [27, 14.5, 1.8]],
  },
  {
    name: "光明",
    color: "#ff7ad1",
    d: [0, 45, 90, 135, 180, 225, 270, 315]
      .map((a) => {
        const r = (v, k) => {
          const t = (a * Math.PI) / 180;
          const [x, y] = v;
          return `${(20 + x * Math.cos(t) - y * Math.sin(t)).toFixed(2)} ${(20 + x * Math.sin(t) + y * Math.cos(t)).toFixed(2)}`;
        };
        return `M${r([0, -18.5])} L${r([2.6, -11])} L${r([0, -6.8])} L${r([-2.6, -11])} Z`;
      })
      .join(" "),
    circles: [[20, 20, 3.4]],
  },
  {
    name: "诚实",
    color: "#e9eeff",
    d: "M17.5 2 H22.5 V16.5 H34 V21.5 H22.5 V38 H17.5 V21.5 H6 V16.5 H17.5 Z M9 3 H15 V14 Z M31 3 H25 V14 Z M9 37 H15 V26 Z M31 37 H25 V26 Z",
  },
  {
    name: "友情",
    color: "#3d8bff",
    d: "M20 11.5 C14 16 26 24 20 28.5 M11.8 22 Q7 25.5 1.5 25.5 Q8 21 12.1 17.6 M28.2 18 Q33 14.5 38.5 14.5 Q32 19 27.9 22.4",
    circles: [[20, 20, 8.5]],
  },
  {
    name: "纯真",
    color: "#35d05a",
    d: "M20 3 L27.6 24.5 A8.6 8.6 0 1 1 12.4 24.5 Z",
    circles: [[20, 28, 5], [20, 28, 2.2]],
  },
  {
    name: "希望",
    color: "#ffd23f",
    d: "M20 1 L21.4 4.6 H18.6 Z M28.5 4.5 L27.2 8.2 L25.6 6.6 Z M11.5 4.5 L12.8 8.2 L14.4 6.6 Z M31 12 L27.3 12.8 L27.3 10.6 Z M9 12 L12.7 12.8 L12.7 10.6 Z M15.6 14.8 L12.6 37 L15.6 33 L18.1 37 L20.6 33 L23.1 37 L25.6 33 L27.6 37 L24.4 14.8",
    circles: [[20, 11, 4.6]],
  },
  {
    name: "知识",
    color: "#a66bff",
    d: "M16.8 18.6 Q20.5 15.8 24.4 18.6",
    circles: [[10.5, 20, 7], [10.5, 20, 3.4], [30, 20, 6], [30, 20, 2.8]],
  },
];
export function CrestRing() {
  return (
    <div className="crest-ring" aria-hidden="true">
      {CRESTS.map((c, i) => (
        <span
          key={c.name}
          className="crest"
          style={{ "--a": `${i * 45}deg`, "--c": c.color, "--i": i }}
          title={c.name}
        >
          <svg viewBox="0 0 40 40">
            <path d={c.d} />
            {c.circles?.map(([cx, cy, r], k) => (
              <circle key={k} cx={cx} cy={cy} r={r} />
            ))}
          </svg>
        </span>
      ))}
    </div>
  );
}

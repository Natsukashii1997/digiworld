// #93 第三批实测用：临时目录 + 合成数据起一个工作台，不碰正式 5178 数据目录。
// 仓库是公开的：设计资产、GitHub 地址和效果图都是合成的（效果图用代码画的渐变色块）。
// 用法：npm run build && PORT=5195 node evidence/93-design-page/preview-server.mjs
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { startServer } from "../../server/http.mjs";
import { createNoteImages } from "../../server/note-images.mjs";
import { seed, makeAsset } from "../../src/store.js";

const DAY = 864e5, now = Date.now();
const iso = (daysAgo) => new Date(now - daysAgo * DAY).toISOString();

// 画一张 640×400 的合成效果图：竖向渐变底 + 几块「界面」色块，免得截图里用到别人的作品。
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png([r1, g1, b1], [r2, g2, b2], accent) {
  const w = 640, h = 400, rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      const t = y / h;
      let px = [r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t];
      const inBar = y > 28 && y < 52 && x > 32 && x < 608;
      const inCard = (y > 90 && y < 250) && ((x > 32 && x < 300) || (x > 340 && x < 608));
      const inLine = y > 280 && y < 296 && x > 32 && x < 420;
      if (inBar) px = px.map((v) => v * 0.6 + 255 * 0.12);
      if (inCard) px = px.map((v, i) => v * 0.5 + accent[i] * 0.5);
      if (inLine) px = accent;
      px.forEach((v, i) => (row[1 + x * 3 + i] = Math.round(v)));
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]));
}

const directory = await realpath(await mkdtemp(join(tmpdir(), "digiworld-93c-")));
const images = createNoteImages(directory, { folder: "design-images", label: "效果图" });
const img = async (...args) => (await images.store({ data: png(...args) })).id;

function design(values, daysAgo) {
  const a = makeAsset({ type: "Design", tags: [], source: "个人创建", files: [], content: "", ...values });
  a.createdAt = a.versions[0].at = iso(daysAgo);
  return a;
}
const assets = [
  design({ title: "anti-template-ui", description: "防模板化的前端设计：先读需求推断设计方向，有现成设计系统就照着用，改版先审查再动手。",
    design: { kind: "skill", skillName: "anti-template-ui", repo: "https://github.com/example-org/anti-template-ui", path: "skills/anti-template-ui", image: await img([246, 241, 232], [226, 218, 204], [40, 40, 40]) } }, 2),
  design({ title: "slide-deck-web", description: "横向翻页的网页幻灯片，单个 HTML 文件；杂志衬线与瑞士网格两种风格。",
    design: { kind: "skill", skillName: "slide-deck-web", repo: "https://github.com/example-org/slide-deck-web", image: await img([18, 24, 48], [8, 10, 22], [77, 227, 255]) } }, 12),
  design({ title: "brand-design-md", description: "几十个品牌的设计规范：色板、字体、间距和组件。要做「像某品牌那样」的页面时用。",
    design: { kind: "skill", skillName: "brand-design-md", repo: "https://github.com/example-org/brand-design-md" } }, 40),
  design({ title: "数码世界 · 像素硬件风", description: "深墨蓝底、像素图标、克制的发光，掌机机身和点阵屏的质感。",
    content: "请用「数码世界」视觉风格生成下面的页面：深墨蓝底，像素图标，克制的发光；强调色只用橙和青，只给关键操作；圆角 8 / 12 / 16，间距取 4 的倍数。不要渐变大标题。",
    design: { kind: "prompt", image: await img([21, 32, 57], [12, 19, 37], [255, 138, 36]) } }, 5),
  design({ title: "细线文档风", description: "白底、1px 细线分隔、克制的灰阶，适合方案页和报告页。",
    content: "请用细线文档风生成页面：白底，1px 细线分隔，正文 15px，标题不加粗过度，只用一种强调色。",
    design: { kind: "prompt" } }, 20),
];
const app = await startServer({ directory, port: Number(process.env.PORT || 0), staticRoot: join(import.meta.dirname, "../../dist") });
await app.repository.write({ ...seed(), assets }, { initialize: true });
console.log(`READY ${app.url} data=${directory}`);

// 翩翩体是 macOS 按需下载的系统字体，Safari 网页应用不让网页直接用（悬浮窗原生窗口可以）。
// 本机服务从系统字体合集里取出「翩翩体 简 粗」单款供页面兜底：只在内存里，不落盘、不进仓库；找不到就 404，页面回到系统字体。
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ASSETS = "/System/Library/AssetsV2";
const FACE = "HanziPenSC-W5";
let cached;

async function findCollection(base = ASSETS) {
  for (const dir of (await readdir(base).catch(() => [])).filter((d) => d.startsWith("com_apple_MobileAsset_Font")))
    for (const asset of await readdir(join(base, dir)).catch(() => [])) {
      const file = join(base, dir, asset, "AssetData", "Hanzipen.ttc");
      const body = await readFile(file).catch(() => null);
      if (body) return body;
    }
  return null;
}

function postScriptName(ttc, at) {
  const tables = ttc.readUInt16BE(at + 4);
  for (let i = 0; i < tables; i++) {
    const rec = at + 12 + i * 16;
    if (ttc.toString("latin1", rec, rec + 4) !== "name") continue;
    const name = ttc.readUInt32BE(rec + 8), count = ttc.readUInt16BE(name + 2), strings = name + ttc.readUInt16BE(name + 4);
    for (let j = 0; j < count; j++) {
      const r = name + 6 + j * 12;
      if (ttc.readUInt16BE(r + 6) !== 6) continue;
      const raw = ttc.subarray(strings + ttc.readUInt16BE(r + 10), strings + ttc.readUInt16BE(r + 10) + ttc.readUInt16BE(r + 8));
      return ttc.readUInt16BE(r) === 3 ? Buffer.from(raw).swap16().toString("utf16le") : raw.toString("latin1");
    }
  }
  return "";
}

// 把合集里的一款拆成独立 sfnt：表目录照抄，表数据按 4 字节对齐重排并改写偏移。
export function extractFace(ttc, face) {
  if (ttc.toString("latin1", 0, 4) !== "ttcf") return null;
  const fonts = ttc.readUInt32BE(8);
  for (let f = 0; f < fonts; f++) {
    const at = ttc.readUInt32BE(12 + f * 4);
    if (postScriptName(ttc, at) !== face) continue;
    const tables = ttc.readUInt16BE(at + 4), head = 12 + tables * 16;
    const parts = [], dir = Buffer.from(ttc.subarray(at, at + head));
    let offset = head;
    for (let i = 0; i < tables; i++) {
      const rec = 12 + i * 16, from = dir.readUInt32BE(rec + 8), length = dir.readUInt32BE(rec + 12);
      dir.writeUInt32BE(offset, rec + 8);
      const padded = Buffer.alloc((length + 3) & ~3);
      ttc.copy(padded, 0, from, from + length);
      parts.push(padded);
      offset += padded.length;
    }
    return Buffer.concat([dir, ...parts]);
  }
  return null;
}

export async function hanziPenBold() {
  if (cached === undefined) {
    const ttc = await findCollection();
    cached = ttc && extractFace(ttc, FACE);
  }
  return cached;
}

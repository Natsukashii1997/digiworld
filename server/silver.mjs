// 银饰计划的图片文件（路线 v3 5.5；产品定义 v1.2 §4.8 “图片只存在本机”）。
// 图片放在数据目录的 silver/ 子目录，文件名为内容 sha256 + 扩展名（内容寻址，同图去重）；主库只存文件名。
// 读取只接受 SILVER_FILE 形状的文件名，拒绝符号链接；类型按文件头识别，不信任扩展名或 MIME。
import { mkdir, lstat, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { SILVER_FILE, SILVER_LIMITS } from "./silver-schema.mjs";
import { createCutout } from "./silver-cutout.mjs";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export function sniffImage(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) return null;
  const at = (i, list) => list.every((b, k) => bytes[i + k] === b);
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (at(0, [0xff, 0xd8, 0xff])) return "jpg";
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "webp";
  return null;
}

export async function createSilverImages(directory, { cutout = createCutout() } = {}) {
  const root = join(directory, "silver");
  await mkdir(root, { recursive: true, mode: 0o700 });
  if ((await lstat(root)).isSymbolicLink()) throw fail("银饰图片目录不能是符号链接", 503);
  const pathOf = (file) => {
    if (typeof file !== "string" || !SILVER_FILE.test(file)) throw fail("图片文件名无效");
    return join(root, file);
  };
  async function exists(path) {
    try {
      const info = await lstat(path);
      if (!info.isFile()) throw fail("图片文件无效");
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }
  async function store(input) {
    const { data, kind } = input && typeof input === "object" ? input : {};
    if (!["photo", "silhouette"].includes(kind)) throw fail("图片用途无效");
    if (!(data instanceof Uint8Array)) throw fail("图片数据无效");
    if (data.length > SILVER_LIMITS.imageBytes)
      throw fail(`单张图片不能超过 ${SILVER_LIMITS.imageBytes / 1024 / 1024} MB`, 413);
    const type = sniffImage(data);
    if (!type) throw fail("只支持 jpg、png 或 webp 图片");
    if (kind === "silhouette" && type !== "png") throw fail("剪影必须是带透明背景的 PNG");
    const file = `${createHash("sha256").update(data).digest("hex")}.${type}`;
    const path = pathOf(file);
    if (!(await exists(path))) {
      // 先写临时文件再改名：中途失败不会留下半张图。
      const temp = join(root, `.upload-${randomBytes(8).toString("hex")}`);
      const handle = await open(temp, "wx", 0o600);
      try {
        await handle.writeFile(data);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temp, path);
    }
    return { file, type: TYPES[type], bytes: data.length };
  }
  async function read(file) {
    const path = pathOf(file);
    let info;
    try {
      info = await lstat(path);
    } catch (error) {
      if (error.code === "ENOENT") throw fail("图片不存在（可能来自另一台电脑的备份）", 404);
      throw error;
    }
    if (!info.isFile()) throw fail("图片文件无效");
    const data = new Uint8Array(await readFile(path));
    const type = sniffImage(data);
    if (!type || !file.endsWith(`.${type}`)) throw fail("图片内容与文件名不符");
    return { file, type: TYPES[type], data };
  }
  async function cutoutFile(file) {
    const input = pathOf(file);
    await read(file);
    const output = join(root, `.cutout-${randomBytes(8).toString("hex")}.png`);
    try {
      const result = await cutout.cutout(input, output);
      if (result.status !== "ok") return { status: "unavailable", reason: result.reason };
      const stored = await store({ data: new Uint8Array(await readFile(output)), kind: "silhouette" });
      return { status: "ok", file: stored.file };
    } finally {
      await rm(output, { force: true });
    }
  }
  return {
    store,
    read,
    cutout: cutoutFile,
    async status() {
      return { cutout: await cutout.available() };
    },
  };
}

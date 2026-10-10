// 学习成长书架（路线 v3 切片 5.4，产品定义 v1.2 §4.8，问题共识基线 D35）：
// - 用户在设置里指定允许读取的文件夹（可多个），只能是存在的绝对路径目录，不接受符号链接与根目录；
// - 索引只读：只取 PDF/EPUB 的文件名、大小、修改时间，不打开、不复制、不写入原件；不跟随符号链接，不进隐藏目录；
// - 元数据仅由用户对单本书显式点击读取，按索引 ID 定位，解析只读且有界；状态和手动进度写入 learning.books。
import { lstat, readdir, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { failure } from "./repository.mjs";
import { LEARNING_LIMITS } from "./schema.mjs";
import { readBookMetadata } from "./learning-metadata.mjs";

export const BOOK_EXTENSIONS = [".pdf", ".epub"];
const MAX_DEPTH = 6,
  MAX_ENTRIES = 20000;
const CONTROL = /[\x00-\x1f\x7f]/;

export const bookId = (root, path) =>
  "b" + createHash("sha256").update(`${root}\0${path}`).digest("hex").slice(0, 40);
const isBook = (name) => BOOK_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

async function checkFolder(input) {
  if (typeof input !== "string" || !input.startsWith("/"))
    throw failure("请填写文件夹的绝对路径（以 / 开头）");
  if (CONTROL.test(input)) throw failure("文件夹路径包含控制字符");
  if (input.length > LEARNING_LIMITS.path) throw failure("文件夹路径过长");
  const trimmed = input.length > 1 ? input.replace(/\/+$/, "") : input;
  if (!trimmed || trimmed === "/") throw failure("不能把根目录作为书架文件夹");
  let info;
  try {
    info = await lstat(trimmed);
  } catch {
    throw failure("文件夹不存在或无法访问", 404);
  }
  if (info.isSymbolicLink()) throw failure("书架文件夹不能是符号链接，请填写它指向的实际位置");
  if (!info.isDirectory()) throw failure("这个路径不是文件夹");
  const real = await realpath(trimmed);
  if (real === "/") throw failure("不能把根目录作为书架文件夹");
  return real;
}

// 只读遍历：readdir + lstat，不打开任何文件。
async function indexFolder(folder) {
  let info;
  try {
    info = await lstat(folder.path);
  } catch {
    return { status: "missing", books: [], truncated: false };
  }
  if (info.isSymbolicLink() || !info.isDirectory()) return { status: "unsafe", books: [], truncated: false };
  const books = [];
  let seen = 0,
    truncated = false,
    unreadable = false;
  async function walk(dir, rel, depth) {
    let names;
    try {
      names = (await readdir(dir)).sort();
    } catch {
      unreadable = true;
      return;
    }
    for (const name of names) {
      if (++seen > MAX_ENTRIES || books.length >= LEARNING_LIMITS.books) {
        truncated = true;
        return;
      }
      if (name.startsWith(".") || CONTROL.test(name)) continue;
      const path = join(dir, name),
        relPath = rel ? `${rel}/${name}` : name;
      let entry;
      try {
        entry = await lstat(path);
      } catch {
        continue;
      }
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH) await walk(path, relPath, depth + 1);
        else truncated = true;
      } else if (entry.isFile() && isBook(name) && name.length <= LEARNING_LIMITS.name) {
        books.push({
          id: bookId(folder.path, relPath),
          folderId: folder.id,
          root: folder.path,
          path: relPath,
          name,
          size: entry.size,
          modifiedAt: entry.mtime.toISOString(),
        });
      }
    }
  }
  await walk(folder.path, "", 0);
  return { status: unreadable && !books.length ? "unreadable" : "ok", books, truncated };
}

export function createLearning(repository, { clock = Date.now, metadataReader = readBookMetadata } = {}) {
  const now = () => new Date(clock()).toISOString();
  return {
    async addFolder({ path, expectedRevision } = {}) {
      const real = await checkFolder(path);
      return repository.updateLearning(
        (learning) => {
          if (learning.folders.some((f) => f.path === real || real.startsWith(f.path + sep)))
            throw failure("这个文件夹（或它的上级文件夹）已添加", 409);
          if (learning.folders.length >= LEARNING_LIMITS.folders)
            throw failure(`书架文件夹最多 ${LEARNING_LIMITS.folders} 个`, 409);
          return {
            ...learning,
            folders: [...learning.folders, { id: randomUUID(), path: real, addedAt: now() }],
          };
        },
        { expectedRevision },
      );
    },
    removeFolder({ id, expectedRevision } = {}) {
      return repository.updateLearning(
        (learning) => {
          if (!learning.folders.some((f) => f.id === id)) throw failure("书架文件夹不存在", 404);
          // 书的学习状态保留：再次添加同一文件夹时恢复。
          return { ...learning, folders: learning.folders.filter((f) => f.id !== id) };
        },
        { expectedRevision },
      );
    },
    async metadata(input) {
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.id !== "string")
        throw failure("元数据请求只接受书架索引 ID");
      const shelf = await this.shelf();
      const book = shelf.books.find(book => book.id === input.id);
      if (!book) throw failure("书籍不在当前书架索引中，请刷新书架", 404);
      try { return {id:book.id, ...await metadataReader(book.root,book.path)}; }
      catch (e) { throw failure(e.message || "无法安全读取书籍元数据"); }
    },
    async shelf() {
      const folders = (await repository.read())?.learning?.folders || [];
      const results = [];
      for (const folder of folders) results.push([folder, await indexFolder(folder)]);
      return {
        folders: results.map(([f, r]) => ({ id: f.id, path: f.path, status: r.status, truncated: r.truncated })),
        books: results.flatMap(([, r]) => r.books),
      };
    },
  };
}

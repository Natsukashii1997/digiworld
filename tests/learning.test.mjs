// 路线 v3 切片 5.4：学习成长。主库新增 learning 集合（书架文件夹、书的学习状态、链接收藏）：严格 schema、旧库缺失按空、
// 备份合并只做加法；书架文件夹只能经专用操作修改；书架索引只读（不复制、不打开、不写入原件）且校验路径。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile, symlink, readdir, readFile, lstat, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { openRepository } from "../server/repository.mjs";
import { validateState } from "../server/schema.mjs";
import { mergeBackup } from "../server/merge.mjs";
import { createLearning } from "../server/learning.mjs";
import { seed } from "../src/store.js";

const AT = "2026-09-30T08:00:00.000Z";
const link = (id, url, extra = {}) => ({
  id,
  title: `链接 ${id}`,
  url,
  summary: "",
  source: "手动添加",
  origin: "manual",
  status: "want",
  createdAt: AT,
  ...extra,
});
const book = (id, extra = {}) => ({
  id,
  root: "/fixture/books",
  path: `${id}.pdf`,
  name: `${id}.pdf`,
  status: "learning",
  updatedAt: AT,
  ...extra,
});
const folder = (id, path) => ({ id, path, addedAt: AT });
const withLearning = (learning) => ({ ...seed(), learning });
const rejects = (state, pattern) => assert.throws(() => validateState(state), pattern);

async function withTemp(fn) {
  const dir = await mkdtemp(join(tmpdir(), "guiji-learning-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
async function withRepository(fn) {
  return withTemp(async (dir) => {
    const r = await openRepository(join(dir, "data"));
    try {
      await fn(r, dir);
    } finally {
      await r.close();
    }
  });
}

test("schema：旧库缺少 learning 按空处理，不写迁移", () => {
  const old = seed();
  assert.equal("learning" in old, false);
  assert.doesNotThrow(() => validateState(old));
  assert.equal("learning" in validateState(old), false);
});

test("schema：合法的书架文件夹、书的状态、链接收藏（含回收区）通过校验", () => {
  const state = withLearning({
    folders: [folder("f1", "/fixture/books")],
    books: [book("b1"), book("b2", { status: "done", path: "子目录/b2.epub", name: "b2.epub" })],
    links: [
      link("l1", "https://example.com/a", { origin: "aihot", source: "机器之心", summary: "摘要", status: "learning" }),
      link("l2", "http://example.com/b", { deletedAt: AT, updatedAt: AT, status: "done" }),
    ],
  });
  assert.doesNotThrow(() => validateState(state));
});

test("schema：严格校验字段、状态、链接协议、路径与上限", () => {
  const base = () =>
    withLearning({
      folders: [folder("f1", "/fixture/books")],
      books: [book("b1")],
      links: [link("l1", "https://example.com/a")],
    });
  const cases = [
    [(s) => (s.learning = []), /学习成长/],
    [(s) => (s.learning.extra = []), /不支持的字段/],
    [(s) => delete s.learning.links, /链接收藏/],
    [(s) => (s.learning.links[0].html = "<b>"), /不支持的字段/],
    [(s) => (s.learning.links[0].url = "javascript:alert(1)"), /链接/],
    [(s) => (s.learning.links[0].url = "data:text/html,x"), /链接/],
    [(s) => (s.learning.links[0].url = ""), /链接/],
    [(s) => (s.learning.links[0].title = ""), /链接标题/],
    [(s) => (s.learning.links[0].title = "标".repeat(201)), /链接标题/],
    [(s) => (s.learning.links[0].title = "a\u0000b"), /链接标题/],
    [(s) => (s.learning.links[0].summary = "摘".repeat(1001)), /摘要/],
    [(s) => (s.learning.links[0].status = "reading"), /学习状态/],
    [(s) => (s.learning.links[0].origin = "rss"), /来源类型/],
    [(s) => (s.learning.links[0].createdAt = "昨天"), /时间/],
    [(s) => s.learning.links.push(link("l1", "https://example.com/b")), /链接 ID重复/],
    [(s) => s.learning.links.push(link("l2", "https://example.com/a")), /链接重复/],
    [(s) => (s.learning.books[0].path = "../secret.pdf"), /书的路径/],
    [(s) => (s.learning.books[0].path = "/etc/passwd"), /书的路径/],
    [(s) => (s.learning.books[0].root = "relative/dir"), /书架目录/],
    [(s) => (s.learning.books[0].status = ""), /学习状态/],
    [(s) => (s.learning.books[0].id = "../x"), /记录 ID/],
    [(s) => (s.learning.folders[0].path = "books"), /书架目录/],
    [(s) => (s.learning.folders[0].path = "/a\u0000b"), /书架目录/],
    [(s) => s.learning.folders.push(folder("f2", "/fixture/books")), /书架目录重复/],
    [
      (s) => (s.learning.folders = Array.from({ length: 11 }, (_, i) => folder(`f${i}`, `/fixture/${i}`))),
      /书架文件夹/,
    ],
    [
      (s) => (s.learning.links = Array.from({ length: 2001 }, (_, i) => link(`l${i}`, `https://e.com/${i}`))),
      /链接收藏/,
    ],
  ];
  for (const [mutate, pattern] of cases) {
    const s = base();
    mutate(s);
    rejects(s, pattern);
  }
});

test("merge：没有 learning 的旧备份可导入，当前收藏不变；空库导入不凭空生成", () => {
  const current = withLearning({ folders: [], books: [book("b1")], links: [link("l1", "https://example.com/a")] });
  current.revision = 3;
  const old = { format: "guiji-backup", schema: 1, state: seed() };
  const { state, summary } = mergeBackup(current, old);
  assert.equal(summary.learningLinksAdded, 0);
  assert.deepEqual(state.learning, current.learning);
  const fresh = mergeBackup(null, old);
  assert.equal("learning" in fresh.state, false);
  assert.doesNotThrow(() => validateState(fresh.state));
});

test("merge：只做加法——新链接与新书状态追加，已有记录保留当前库的编辑，同链接不同 ID 不重复收藏；书架文件夹不随备份导入", () => {
  const current = withLearning({
    folders: [folder("f1", "/current/books")],
    books: [book("b1", { status: "done" })],
    links: [
      link("l1", "https://example.com/a", { status: "done", title: "当前改过的标题" }),
      link("lx", "https://example.com/c"),
    ],
  });
  const incoming = withLearning({
    folders: [folder("f9", "/somewhere/else")],
    books: [book("b1", { status: "want" }), book("b2")],
    links: [
      link("l1", "https://example.com/a", { status: "want" }),
      link("l2", "https://example.com/b"),
      link("l3", "https://example.com/c"),
    ],
  });
  const { state, summary } = mergeBackup(current, incoming);
  assert.equal(summary.learningLinksAdded, 1);
  assert.equal(summary.learningBooksAdded, 1);
  assert.deepEqual(state.learning.folders, current.learning.folders);
  assert.deepEqual(
    state.learning.links.map((l) => [l.id, l.title, l.status]),
    [
      ["l1", "当前改过的标题", "done"],
      ["lx", "链接 lx", "want"],
      ["l2", "链接 l2", "want"],
    ],
  );
  assert.deepEqual(
    state.learning.books.map((b) => [b.id, b.status]),
    [
      ["b1", "done"],
      ["b2", "learning"],
    ],
  );
  // 当前库没有 learning：导入后得到收藏与状态，但文件夹为空，需要在本机重新指定。
  const none = mergeBackup({ ...seed(), revision: 1 }, incoming);
  assert.deepEqual(none.state.learning.folders, []);
  assert.equal(none.state.learning.links.length, 3);
  const empty = mergeBackup(null, incoming);
  assert.deepEqual(empty.state.learning.folders, []);
  assert.doesNotThrow(() => validateState(empty.state));
});

test("merge：经仓库导出/导入往返一致，导回自身不新增", () =>
  withRepository(async (r) => {
    const initial = withLearning({
      folders: [],
      books: [book("b1")],
      links: [link("l1", "https://example.com/a", { origin: "aihot", source: "量子位" })],
    });
    const saved = await r.write(initial, { initialize: true });
    const backup = { format: "guiji-backup", schema: 1, exportedAt: AT, state: await r.read() };
    await withRepository(async (other) => {
      const preview = await other.previewImport(backup);
      assert.equal(preview.summary.learningLinksAdded, 1);
      const merged = await other.importBackup(backup, preview.token);
      assert.deepEqual(merged.learning, saved.learning);
    });
    const preview = await r.previewImport(backup);
    assert.equal(preview.summary.learningLinksAdded, 0);
    const again = await r.importBackup(backup, preview.token);
    assert.deepEqual(again.learning, saved.learning);
  }));

test("书架文件夹只能经专用操作修改：通用保存改动文件夹被拒绝，链接与状态可以保存", () =>
  withRepository(async (r) => {
    const s = await r.write(withLearning({ folders: [], books: [], links: [] }), { initialize: true });
    await assert.rejects(
      () => r.write({ ...s, learning: { ...s.learning, folders: [folder("f1", "/etc")] } }),
      /书架文件夹/,
    );
    const next = await r.write({
      ...s,
      learning: { ...s.learning, links: [link("l1", "https://example.com/a")], books: [book("b1")] },
    });
    assert.equal(next.learning.links.length, 1);
  }));

test("路径校验：只接受存在的绝对目录；拒绝相对路径、根目录、文件、符号链接、控制字符与重复", () =>
  withRepository(async (r, dir) => {
    await r.write(seed(), { initialize: true });
    const learning = createLearning(r, { clock: () => Date.parse(AT) });
    const books = join(dir, "books");
    await mkdir(books);
    await writeFile(join(dir, "file.pdf"), "x");
    await symlink(books, join(dir, "link-to-books"));
    const rev = async () => (await r.read()).revision;
    for (const [path, pattern] of [
      ["books", /绝对路径/],
      ["", /绝对路径/],
      [42, /绝对路径/],
      ["/", /根目录/],
      [join(dir, "missing"), /不存在/],
      [join(dir, "file.pdf"), /不是文件夹/],
      [join(dir, "link-to-books"), /符号链接/],
      [`${books}\u0000x`, /控制字符/],
    ])
      await assert.rejects(async () => learning.addFolder({ path, expectedRevision: await rev() }), pattern, String(path));
    const state = await learning.addFolder({ path: books + "/", expectedRevision: await rev() });
    assert.deepEqual(
      state.learning.folders.map((f) => f.path),
      [await realpath(books)],
    );
    await assert.rejects(async () => learning.addFolder({ path: books, expectedRevision: await rev() }), /已添加/);
    await assert.rejects(() => learning.addFolder({ path: books, expectedRevision: 0 }), /主库已变化/);
    const removed = await learning.removeFolder({ id: state.learning.folders[0].id, expectedRevision: await rev() });
    assert.deepEqual(removed.learning.folders, []);
  }));

async function snapshot(root) {
  const out = [];
  async function walk(dir) {
    for (const name of (await readdir(dir)).sort()) {
      const p = join(dir, name);
      const s = await lstat(p);
      const content = s.isFile() ? createHash("sha256").update(await readFile(p)).digest("hex") : "";
      out.push([p, s.isSymbolicLink(), s.size, s.mtimeMs, s.mode, content]);
      if (s.isDirectory() && !s.isSymbolicLink()) await walk(p);
    }
  }
  await walk(root);
  return out;
}

test("书架索引：只列 PDF/EPUB 的文件名、大小、修改时间；不跟随符号链接、不读隐藏目录；原件与目录不变", () =>
  withRepository(async (r, dir) => {
    await r.write(seed(), { initialize: true });
    const learning = createLearning(r, { clock: () => Date.parse(AT) });
    const books = join(dir, "books"),
      outside = join(dir, "outside");
    await mkdir(join(books, "子目录"), { recursive: true });
    await mkdir(join(books, ".hidden"));
    await mkdir(outside);
    await writeFile(join(books, "a.pdf"), "%PDF-1.4 内容不应被读取");
    await writeFile(join(books, "B.EPUB"), "epub");
    await writeFile(join(books, "notes.txt"), "txt");
    await writeFile(join(books, "子目录", "c.pdf"), "ccc");
    await writeFile(join(books, ".hidden", "d.pdf"), "d");
    await writeFile(join(outside, "e.pdf"), "e");
    await symlink(outside, join(books, "外部目录"));
    await symlink(join(outside, "e.pdf"), join(books, "link.pdf"));
    const rev = (await r.read()).revision;
    await learning.addFolder({ path: books, expectedRevision: rev });
    // 快照只覆盖书架与外部目录（主库目录会因添加文件夹而正常写入）。
    const files = async () => [...(await snapshot(books)), ...(await snapshot(outside))];
    const before = await files();
    const shelf = await learning.shelf();
    assert.deepEqual(
      shelf.books.map((b) => b.path).sort(),
      ["B.EPUB", "a.pdf", "子目录/c.pdf"].sort(),
    );
    const a = shelf.books.find((b) => b.path === "a.pdf");
    assert.deepEqual(Object.keys(a).sort(), ["folderId", "id", "modifiedAt", "name", "path", "root", "size"]);
    assert.equal(a.name, "a.pdf");
    assert.equal(a.size, Buffer.byteLength("%PDF-1.4 内容不应被读取"));
    assert.ok(Number.isFinite(Date.parse(a.modifiedAt)));
    assert.match(a.id, /^[a-zA-Z0-9_-]{1,100}$/);
    assert.equal(a.root, await realpath(books));
    // 同一文件的 ID 稳定。
    assert.equal((await learning.shelf()).books.find((b) => b.path === "a.pdf").id, a.id);
    assert.deepEqual(shelf.folders.map((f) => f.status), ["ok"]);
    assert.deepEqual(await files(), before, "索引不得改动、复制或新建任何文件");
    // 文件夹被删后：如实标注“不存在”，不抛错。
    await rm(books, { recursive: true, force: true });
    const gone = await learning.shelf();
    assert.deepEqual(gone.folders.map((f) => f.status), ["missing"]);
    assert.deepEqual(gone.books, []);
  }));

test("书架索引：文件夹被替换为符号链接时拒绝读取", () =>
  withRepository(async (r, dir) => {
    await r.write(seed(), { initialize: true });
    const learning = createLearning(r, { clock: () => Date.parse(AT) });
    const books = join(dir, "books"),
      other = join(dir, "other");
    await mkdir(books);
    await mkdir(other);
    await writeFile(join(other, "x.pdf"), "x");
    await learning.addFolder({ path: books, expectedRevision: (await r.read()).revision });
    await rm(books, { recursive: true });
    await symlink(other, books);
    const shelf = await learning.shelf();
    assert.deepEqual(shelf.folders.map((f) => f.status), ["unsafe"]);
    assert.deepEqual(shelf.books, []);
  }));

import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { constants } from "node:fs";
import { createKnowledgeFiles } from "../server/knowledge-files.mjs";

async function fixture(t) {
  const path = await fs.mkdtemp(join(tmpdir(), "guiji-knowledge-files-"));
  t.after(() => fs.rm(path, { recursive: true, force: true }));
  return path;
}

test("原文读取区分来源目录核验失败与单个文件缺失，来源范围错误保留受控标记", async (t) => {
  const root = await fixture(t);
  await fs.mkdir(join(root, "notes"));
  await fs.writeFile(join(root, "notes", "one.md"), "SYNTHETIC BODY");
  const files = createKnowledgeFiles();
  const source = await files.inspectRoot(root);
  const entry = (await files.scan(source)).files[0];
  const failedParent = createKnowledgeFiles({
    fs: {
      ...fs,
      async lstat(path) {
        if (path === join(source.root, "notes"))
          throw Object.assign(new Error("PRIVATE PARENT DETAILS"), {
            code: "EIO",
          });
        return fs.lstat(path);
      },
    },
  });
  await assert.rejects(
    failedParent.read(source, entry),
    (error) =>
      error.status === 503 &&
      error.scope === "source" &&
      !error.message.includes("PRIVATE"),
  );
  await fs.unlink(join(root, "notes", "one.md"));
  await assert.rejects(
    files.read(source, entry),
    (error) => error.status === 404 && error.scope === undefined,
  );
});

test("连接只核验目录身份，不枚举来源；普通新增文件不改变授权身份", async (t) => {
  const root = await fixture(t);
  const onlyMetadata = { lstat: fs.lstat, realpath: fs.realpath };
  const files = createKnowledgeFiles({ fs: onlyMetadata });
  const source = await files.inspectRoot(root);
  assert.deepEqual(Object.keys(source).sort(), ["identity", "root"]);
  assert.equal(source.root, await fs.realpath(root));
  assert.match(source.identity, /^[a-f0-9]{64}$/);
  await fs.writeFile(join(root, "new.md"), "PRIVATE SYNTHETIC TEXT");
  assert.deepEqual(await files.inspectRoot(root), source);
});

test("宽泛、隐藏、秘密及系统来源在零 I/O 边界拒绝", async () => {
  let calls = 0;
  const forbidden = new Proxy(
    {},
    {
      get() {
        return async () => {
          calls++;
          throw new Error("No filesystem access allowed");
        };
      },
    },
  );
  const files = createKnowledgeFiles({ fs: forbidden });
  for (const root of [
    "/",
    homedir(),
    join(homedir(), "Documents"),
    "/Users",
    "/Users/example",
    "/Users/example/Documents",
    "/users/example/documents",
    "/Volumes/ExternalDisk",
    "/System/Library/Notes",
    "/dev/notes",
    "/tmp",
    "/private/var",
    "/Users/example/.ssh/notes",
    "/Users/example/notes/secrets",
    "/Users/example/notes/node_modules/notes",
    "relative",
    "/safe/notes/../other",
    "/safe/notes\0invalid",
  ]) {
    await assert.rejects(files.inspectRoot(root), (error) =>
      [400, 403].includes(error.status),
    );
  }
  assert.equal(calls, 0);
});

test("连接拒绝链接根和文件；来源访问错误不透传私密正文", async (t) => {
  const root = await fixture(t);
  await fs.mkdir(join(root, "notes"));
  await fs.symlink(join(root, "notes"), join(root, "alias"));
  await fs.writeFile(join(root, "file"), "PRIVATE");
  const files = createKnowledgeFiles();
  await assert.rejects(files.inspectRoot(join(root, "alias")), { status: 403 });
  await assert.rejects(files.inspectRoot(join(root, "file")), { status: 403 });
  const denied = createKnowledgeFiles({
    fs: {
      async lstat() {
        throw Object.assign(new Error("PRIVATE ERROR"), { code: "EACCES" });
      },
    },
  });
  await assert.rejects(
    denied.inspectRoot(root),
    (error) => error.status === 403 && !error.message.includes("PRIVATE"),
  );
});

test("显式扫描只返回可见 Markdown 元数据与指纹，不读取正文", async (t) => {
  const root = await fixture(t);
  await fs.mkdir(join(root, "主题"));
  await fs.writeFile(join(root, "主题", "方法.md"), "PRIVATE SYNTHETIC TEXT");
  await fs.writeFile(join(root, "readme.MD"), "# 标题");
  await fs.writeFile(join(root, "image.png"), "ignored");
  const files = createKnowledgeFiles({
    fs: { lstat: fs.lstat, realpath: fs.realpath, opendir: fs.opendir },
  });
  const source = await files.inspectRoot(root);
  const scan = await files.scan(source);
  assert.equal(scan.status, "complete");
  assert.deepEqual(scan.files.map((row) => row.path).sort(), [
    "readme.MD",
    "主题/方法.md",
  ]);
  assert.equal(scan.files.find((row) => row.path === "主题/方法.md").bytes, 22);
  assert.match(scan.files[0].fingerprint, /^[a-f0-9]{64}$/);
  assert.ok(!Number.isNaN(Date.parse(scan.files[0].modifiedAt)));
  assert.ok(!JSON.stringify(scan).includes("PRIVATE"));
  assert.deepEqual(scan.issues, []);
  assert.equal(scan.visited, 4);
});

test("读取扫描选中的当前原文，返回准确来源、字节数和正文哈希", async (t) => {
  const root = await fixture(t);
  await fs.writeFile(join(root, "hello.md"), "hello\n");
  const files = createKnowledgeFiles();
  const source = await files.inspectRoot(root);
  const selected = (await files.scan(source)).files[0];
  const result = await files.read(source, selected);
  assert.equal(result.path, "hello.md");
  assert.equal(result.absolutePath, join(source.root, "hello.md"));
  assert.equal(result.content, "hello\n");
  assert.equal(result.bytes, 6);
  assert.equal(
    result.sha256,
    "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03",
  );
  assert.equal(result.modifiedAt, selected.modifiedAt);
});

test("扫描和读取无效来源及相对文件路径必须零 I/O 拒绝", async () => {
  let calls = 0;
  const forbidden = new Proxy(
    {},
    {
      get() {
        return async () => {
          calls++;
          throw new Error("No filesystem access allowed");
        };
      },
    },
  );
  const files = createKnowledgeFiles({ fs: forbidden });
  const source = {
    root: "/synthetic-placeholder/notes",
    identity: "a".repeat(64),
  };
  for (const path of [
    "../other.md",
    "/outside.md",
    "notes/../../other.md",
    ".hidden.md",
    "notes/secrets.md",
    "node_modules/readme.md",
    "secret/notes.md",
    "other.txt",
    "notes\\other.md",
    "a\0.md",
  ]) {
    await assert.rejects(
      files.read(source, { path, fingerprint: "b".repeat(64) }),
      (error) => [400, 403].includes(error.status),
    );
  }
  await assert.rejects(
    files.read(source, { path: "safe.md", fingerprint: "wrong" }),
    { status: 400 },
  );
  await assert.rejects(files.scan({ root: "/", identity: "a".repeat(64) }), {
    status: 403,
  });
  await assert.rejects(files.scan({ root: source.root, identity: "wrong" }), {
    status: 400,
  });
  assert.equal(calls, 0);
});

test("扫描受条目、文件、深度与时间预算约束，截断明确为部分结果", async (t) => {
  const root = await fixture(t);
  for (const name of ["a.md", "b.md", "c.md"])
    await fs.writeFile(join(root, name), "# safe");
  await fs.mkdir(join(root, "nested"));
  await fs.writeFile(join(root, "nested", "deep.md"), "# safe");
  const source = await createKnowledgeFiles().inspectRoot(root);
  for (const limits of [{ maxEntries: 2 }, { maxFiles: 1 }, { maxDepth: 0 }]) {
    const scan = await createKnowledgeFiles({ limits }).scan(source);
    assert.equal(scan.status, "partial");
    assert.ok(scan.issues.length > 0);
    if (limits.maxEntries) assert.ok(scan.visited <= limits.maxEntries);
    if (limits.maxFiles) assert.ok(scan.files.length <= limits.maxFiles);
    if (limits.maxDepth === 0)
      assert.ok(!scan.files.some((row) => row.path.includes("/")));
  }
  let time = 0;
  const timed = await createKnowledgeFiles({
    limits: { maxMs: 2 },
    clock: () => time++,
  }).scan(source);
  assert.equal(timed.status, "partial");
  assert.match(timed.issues[0].message, /时间/);
  const boundary = createKnowledgeFiles().limits;
  assert.deepEqual(boundary, {
    maxEntries: 5000,
    maxFiles: 2000,
    maxDepth: 8,
    maxMs: 5000,
    maxBytes: 262144,
  });
});

test("扫描跳过隐藏/秘密/依赖文件，链接、硬链接和受阻目录仅给部分结果", async (t) => {
  const root = await fixture(t);
  for (const dir of [".hidden", "secrets", "node_modules", "blocked"]) {
    await fs.mkdir(join(root, dir));
    await fs.writeFile(join(root, dir, "hidden.md"), "PRIVATE SYNTHETIC TEXT");
  }
  await fs.writeFile(join(root, "visible.md"), "# visible");
  await fs.writeFile(join(root, "linked.md"), "PRIVATE SYNTHETIC TEXT");
  await fs.link(join(root, "linked.md"), join(root, "linked-copy.md"));
  await fs.symlink(join(root, "visible.md"), join(root, "alias.md"));
  await fs.symlink(join(root, ".hidden"), join(root, "alias-folder"));
  const source = await createKnowledgeFiles().inspectRoot(root);
  const files = createKnowledgeFiles({
    fs: {
      ...fs,
      async opendir(path, options) {
        if (path === join(source.root, "blocked"))
          throw Object.assign(new Error("PRIVATE ERROR"), { code: "EACCES" });
        return fs.opendir(path, options);
      },
    },
  });
  const scan = await files.scan(source);
  assert.deepEqual(
    scan.files.map((row) => row.path),
    ["visible.md"],
  );
  assert.equal(scan.status, "partial");
  assert.ok(scan.issues.some((row) => row.path === "blocked"));
  assert.ok(scan.issues.some((row) => row.path === "alias.md"));
  assert.ok(scan.issues.some((row) => row.path === "linked.md"));
  assert.ok(scan.skipped >= 6);
  assert.ok(!JSON.stringify(scan).includes("PRIVATE"));
});

test("正文受256KiB与严格UTF-8边界约束，保留BOM和中文原文，不接受二进制", async (t) => {
  const root = await fixture(t);
  const content = "\uFEFF# 方法\n你好，世界。\n<script>alert(1)</script>";
  await fs.writeFile(join(root, "unicode.md"), content);
  await fs.writeFile(join(root, "oversize.md"), Buffer.alloc(262145, 65));
  await fs.writeFile(join(root, "invalid.md"), Buffer.from([0xc3, 0x28]));
  await fs.writeFile(join(root, "binary.md"), Buffer.from([65, 0, 66]));
  const files = createKnowledgeFiles();
  const source = await files.inspectRoot(root);
  const scan = await files.scan(source);
  const selected = (name) => scan.files.find((row) => row.path === name);
  await assert.rejects(files.read(source, selected("oversize.md")), {
    status: 413,
  });
  await assert.rejects(
    files.read(source, selected("invalid.md")),
    (error) => error.status === 400 && /UTF-8/.test(error.message),
  );
  await assert.rejects(files.read(source, selected("binary.md")), {
    status: 400,
  });
  const result = await files.read(source, selected("unicode.md"));
  assert.equal(result.content, content);
  assert.equal(result.bytes, Buffer.byteLength(content));
  assert.equal(await fs.readFile(join(root, "unicode.md"), "utf8"), content);
});

test("扫描期间父目录换代，不能把旧目录链指纹发布为当前文件", async (t) => {
  const root = await fixture(t);
  await fs.mkdir(join(root, "topic"));
  await fs.writeFile(join(root, "topic", "note.md"), "# safe");
  const source = await createKnowledgeFiles().inspectRoot(root);
  let replaced = false;
  const files = createKnowledgeFiles({
    fs: {
      ...fs,
      async opendir(path, options) {
        if (path === join(source.root, "topic") && !replaced) {
          replaced = true;
          await fs.rename(path, join(source.root, "previous"));
          await fs.mkdir(path);
          await fs.rename(
            join(source.root, "previous", "note.md"),
            join(path, "note.md"),
          );
        }
        return fs.opendir(path, options);
      },
    },
  });
  const scan = await files.scan(source);
  assert.equal(scan.status, "partial");
  assert.ok(!scan.files.some((row) => row.path === "topic/note.md"));
  assert.ok(
    scan.issues.some((row) => row.path === "topic" && /变化/.test(row.message)),
  );
});

test("读取已打开文件期间父目录被替换，即使原句柄仍稳定也拒绝返回正文", async (t) => {
  const root = await fixture(t);
  await fs.mkdir(join(root, "topic"));
  await fs.writeFile(join(root, "topic", "note.md"), "# same bytes");
  const safe = createKnowledgeFiles();
  const source = await safe.inspectRoot(root);
  const selected = (await safe.scan(source)).files[0];
  let replaced = false;
  const files = createKnowledgeFiles({
    fs: {
      ...fs,
      async open(path, flags) {
        const handle = await fs.open(path, flags);
        if (!replaced) {
          replaced = true;
          await fs.rename(
            join(source.root, "topic"),
            join(source.root, "previous"),
          );
          await fs.mkdir(join(source.root, "topic"));
          await fs.writeFile(path, "# same bytes");
        }
        return handle;
      },
    },
  });
  await assert.rejects(
    files.read(source, selected),
    (error) => error.status === 409 && /重新扫描/.test(error.message),
  );
});

test("读取内容不稳定即使stat不变也拒绝，句柄始终只读并关闭", async (t) => {
  const root = await fixture(t);
  await fs.writeFile(join(root, "note.md"), "original text");
  const source = await createKnowledgeFiles().inspectRoot(root);
  const selected = (await createKnowledgeFiles().scan(source)).files[0];
  let changed = false,
    closed = false;
  const files = createKnowledgeFiles({
    fs: {
      ...fs,
      async open(path, flags) {
        assert.equal(flags & (constants.O_WRONLY | constants.O_RDWR), 0);
        assert.ok(flags & constants.O_NOFOLLOW);
        assert.ok(flags & constants.O_NONBLOCK);
        const handle = await fs.open(path, flags);
        return {
          stat: () => handle.stat(),
          close: async () => {
            closed = true;
            await handle.close();
          },
          read: async (buffer, offset, length, position) => {
            assert.ok(buffer.length <= 262145);
            const result = await handle.read(buffer, offset, length, position);
            if (!changed && position === 0 && result.bytesRead) {
              changed = true;
              buffer[offset] = 65;
            }
            return result;
          },
        };
      },
    },
  });
  await assert.rejects(files.read(source, selected), { status: 409 });
  assert.equal(closed, true);
  assert.equal(
    await fs.readFile(join(root, "note.md"), "utf8"),
    "original text",
  );
});

test("条目预算在获取下一条目录记录之前生效，并关闭截断目录句柄", async (t) => {
  const root = await fixture(t);
  for (const name of ["a.md", "b.md", "c.md"])
    await fs.writeFile(join(root, name), "safe");
  const source = await createKnowledgeFiles().inspectRoot(root);
  let fetched = 0,
    closed = false;
  const files = createKnowledgeFiles({
    limits: { maxEntries: 2 },
    fs: {
      ...fs,
      async opendir(path, options) {
        const handle = await fs.opendir(path, options);
        const read = async () => {
          const entry = await handle.read();
          if (entry) fetched++;
          return entry;
        };
        const close = async () => {
          closed = true;
          await handle.close();
        };
        return {
          read,
          close,
          async *[Symbol.asyncIterator]() {
            try {
              for (;;) {
                const entry = await read();
                if (!entry) break;
                yield entry;
              }
            } finally {
              await close();
            }
          },
        };
      },
    },
  });
  const scan = await files.scan(source);
  assert.equal(scan.status, "partial");
  assert.equal(scan.visited, 2);
  assert.equal(fetched, 2);
  assert.equal(closed, true);
});

test("文件变化与根目录换代使旧扫描凭证失效，不因相同名称或字节重新授权", async (t) => {
  const parent = await fixture(t);
  const root = join(parent, "notes");
  await fs.mkdir(root);
  await fs.writeFile(join(root, "note.md"), "before");
  const files = createKnowledgeFiles();
  const source = await files.inspectRoot(root);
  const selected = (await files.scan(source)).files[0];
  await fs.writeFile(join(root, "note.md"), "changed");
  await assert.rejects(files.read(source, selected), { status: 409 });
  await fs.rename(root, join(parent, "previous"));
  await fs.mkdir(root);
  await fs.writeFile(join(root, "note.md"), "before");
  await assert.rejects(files.scan(source), { status: 409 });
  await assert.rejects(files.read(source, selected), { status: 409 });
  assert.notEqual((await files.inspectRoot(root)).identity, source.identity);
});

test("读取前新出现的硬链接、父链链接与特殊类型均在open前拒绝", async (t) => {
  for (const mutation of ["hardlink", "parent-link", "special"]) {
    const root = await fixture(t);
    await fs.mkdir(join(root, "topic"));
    await fs.writeFile(join(root, "topic", "note.md"), "safe");
    const source = await createKnowledgeFiles().inspectRoot(root);
    const selected = (await createKnowledgeFiles().scan(source)).files[0];
    if (mutation === "hardlink")
      await fs.link(join(root, "topic", "note.md"), join(root, "another.md"));
    if (mutation === "parent-link") {
      await fs.rename(join(root, "topic"), join(root, "previous"));
      await fs.symlink(join(root, "previous"), join(root, "topic"));
    }
    let opens = 0;
    const files = createKnowledgeFiles({
      fs: {
        ...fs,
        async open() {
          opens++;
          assert.fail("受阻文件不允许open");
        },
        async lstat(path) {
          const info = await fs.lstat(path);
          return mutation === "special" &&
            path === join(source.root, "topic", "note.md")
            ? Object.assign(info, { isFile: () => false })
            : info;
        },
      },
    });
    await assert.rejects(files.read(source, selected), { status: 403 });
    assert.equal(opens, 0);
  }
});

test("空目录与空文本是有效零结果，上限不能被配置扩大", async (t) => {
  let calls = 0;
  const forbidden = new Proxy(
    {},
    {
      get() {
        return async () => {
          calls++;
          assert.fail("无效限制不允许I/O");
        };
      },
    },
  );
  for (const limits of [
    { maxEntries: 5001 },
    { maxFiles: 2001 },
    { maxDepth: 9 },
    { maxMs: Infinity },
    { maxBytes: 262145 },
    { maxBytes: -1 },
    { unknown: 1 },
  ]) {
    assert.throws(() => createKnowledgeFiles({ fs: forbidden, limits }), {
      status: 400,
    });
  }
  assert.equal(calls, 0);
  const root = await fixture(t);
  const files = createKnowledgeFiles();
  const source = await files.inspectRoot(root);
  assert.deepEqual(await files.scan(source), {
    status: "complete",
    files: [],
    issues: [],
    skipped: 0,
    visited: 0,
  });
  await fs.writeFile(join(root, "empty.md"), "");
  const selected = (await files.scan(source)).files[0];
  const result = await files.read(source, selected);
  assert.equal(result.content, "");
  assert.equal(result.bytes, 0);
});

test("目录在opendir前被替换为外部链接时，首条记录前拒绝且不泄漏外部文件名", async (t) => {
  const base = await fixture(t);
  const allowed = join(base, "allowed");
  const unapproved = join(base, "unapproved");
  const topic = join(allowed, "topic");
  await fs.mkdir(topic, { recursive: true });
  await fs.mkdir(unapproved);
  await fs.writeFile(join(topic, "safe.md"), "safe");
  await fs.writeFile(join(unapproved, "UNAPPROVED-NAME.md"), "synthetic");
  await fs.link(
    join(unapproved, "UNAPPROVED-NAME.md"),
    join(unapproved, "UNAPPROVED-NAME-COPY.md"),
  );
  const source = await createKnowledgeFiles().inspectRoot(allowed);
  let swapped = false,
    externalReads = 0,
    externalClosed = false;
  const files = createKnowledgeFiles({
    fs: {
      ...fs,
      async opendir(path, options) {
        if (path === join(source.root, "topic") && !swapped) {
          swapped = true;
          await fs.rename(path, join(base, "original-topic"));
          await fs.symlink(unapproved, path);
          const handle = await fs.opendir(path, options);
          return {
            read: async () => {
              externalReads++;
              return handle.read();
            },
            close: async () => {
              externalClosed = true;
              await handle.close();
            },
          };
        }
        return fs.opendir(path, options);
      },
    },
  });
  const result = await files.scan(source);
  assert.equal(result.status, "partial");
  assert.deepEqual(result.files, []);
  assert.equal(JSON.stringify(result).includes("UNAPPROVED-NAME"), false);
  assert.deepEqual(
    result.issues.map((issue) => issue.path),
    ["topic"],
  );
  assert.equal(externalReads, 0);
  assert.equal(externalClosed, true);
});

test("子树在末次核验前失稳时一并撤回文件与问题，但保留稳定兄弟节点", async (t) => {
  const base = await fixture(t);
  const allowed = join(base, "allowed");
  const topic = join(allowed, "topic");
  await fs.mkdir(topic, { recursive: true });
  await fs.writeFile(join(allowed, "stable.md"), "safe");
  await fs.writeFile(join(allowed, "stable-one.md"), "safe");
  await fs.link(join(allowed, "stable-one.md"), join(allowed, "stable-two.md"));
  await fs.writeFile(join(topic, "TAINTED-FILE.md"), "safe");
  await fs.writeFile(join(topic, "TAINTED-ISSUE.md"), "safe");
  await fs.link(
    join(topic, "TAINTED-ISSUE.md"),
    join(topic, "TAINTED-ISSUE-COPY.md"),
  );
  const source = await createKnowledgeFiles().inspectRoot(allowed);
  let swapped = false;
  const files = createKnowledgeFiles({
    fs: {
      ...fs,
      async opendir(path, options) {
        const handle = await fs.opendir(path, options);
        if (path !== join(source.root, "topic")) return handle;
        return {
          read: () => handle.read(),
          close: async () => {
            await handle.close();
            if (!swapped) {
              swapped = true;
              await fs.rename(path, join(base, "previous-topic"));
              await fs.mkdir(path);
            }
          },
        };
      },
    },
  });
  const result = await files.scan(source);
  assert.equal(result.status, "partial");
  assert.deepEqual(
    result.files.map((file) => file.path),
    ["stable.md"],
  );
  assert.equal(JSON.stringify(result).includes("TAINTED"), false);
  assert.deepEqual(result.issues.map((issue) => issue.path).sort(), [
    "stable-one.md",
    "stable-two.md",
    "topic",
  ]);
  assert.match(
    result.issues.find((issue) => issue.path === "topic").message,
    /变化.*重新扫描/,
  );
});

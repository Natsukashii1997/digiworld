import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createKnowledgeFiles } from "../server/knowledge-files.mjs";
import { createKnowledgeQuery } from "../server/knowledge-query.mjs";

async function fixture(t, contents) {
  const directory = await fs.mkdtemp(join(tmpdir(), "guiji-knowledge-query-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(contents))
    await fs.writeFile(join(directory, path), content);
  const files = createKnowledgeFiles();
  const source = await files.inspectRoot(directory);
  const entries = (await files.scan(source)).files.sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  return {
    directory,
    files,
    input: { source, entries, offset: 0, assertCurrent: async () => {} },
  };
}

test("查询命中正文而非文件名，返回原文哈希、行号与不持久化的片段", async (t) => {
  const { files, input } = await fixture(t, {
    "普通.md": "# 笔记\n先确认项目边界，再行动。\n",
    "项目边界.md": "这里没有目标短语。",
  });
  const result = await createKnowledgeQuery({ files }).search({
    ...input,
    query: "  项目边界  ",
  });
  assert.equal(result.query, "项目边界");
  assert.equal(result.status, "complete");
  assert.equal(result.nextOffset, null);
  assert.equal(result.total, 2);
  assert.equal(result.attempted, 2);
  assert.equal(result.read, 2);
  assert.equal(result.stopReason, null);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(
    result.results.map((item) => item.path),
    ["普通.md"],
  );
  assert.deepEqual(result.results[0].snippets, [
    { line: 2, text: "先确认项目边界，再行动。", matchStart: 3, matchEnd: 7 },
  ]);
  const original = await files.read(
    input.source,
    input.entries.find((e) => e.path === "普通.md"),
  );
  assert.equal(result.results[0].sha256, original.sha256);
  assert.equal(result.results[0].bytes, original.bytes);
  assert.equal(result.results[0].modifiedAt, original.modifiedAt);
  assert.ok(Number.isFinite(Date.parse(result.at)));
  assert.ok(!Object.hasOwn(result.results[0], "content"));
});

test("大小写匹配保留原行索引，特殊符号不是正则，片段最多三个不同行且有界", async (t) => {
  const { files, input } = await fixture(t, {
    "literal.md":
      "# Context\r\nİ A+B [X].* A+B [X].*\r" +
      "前".repeat(400) +
      "a+b [x].*" +
      "后".repeat(400) +
      "\nA+B [X].*\nA+B [X].*",
  });
  const result = await createKnowledgeQuery({ files }).search({
    ...input,
    query: "a+b [x].*",
  });
  assert.equal(result.results.length, 1);
  const snippets = result.results[0].snippets;
  assert.equal(snippets.length, 3);
  assert.deepEqual(
    snippets.map((item) => item.line),
    [2, 3, 4],
  );
  assert.equal(snippets[0].matchStart, 2);
  assert.equal(snippets[0].matchEnd, 11);
  assert.ok(snippets.every((item) => item.text.length <= 300));
  assert.equal(
    snippets[1].text.slice(snippets[1].matchStart, snippets[1].matchEnd),
    "a+b [x].*",
  );
  const noMatch = await createKnowledgeQuery({ files }).search({
    ...input,
    query: ".+?",
  });
  assert.deepEqual(noMatch.results, []);
});

test("无效查询和清单位置在任何文件 I/O 前拒绝，空清单允许从零查询", async () => {
  let io = 0;
  const source = { root: "/synthetic-query/notes", identity: "a".repeat(64) };
  const files = {
    async inspectRoot() {
      io++;
      return source;
    },
    async read() {
      io++;
      throw new Error("unexpected I/O");
    },
  };
  const query = createKnowledgeQuery({ files });
  const input = {
    source,
    entries: [],
    offset: 0,
    assertCurrent: async () => {},
  };
  for (const value of [
    null,
    7,
    {},
    "",
    "  ",
    "a".repeat(101),
    "a\nb",
    "\tx",
    "x\u0000",
    "x\u007f",
    "x\u0085",
    "a\u2028b",
    "a\u2029b",
  ])
    await assert.rejects(query.search({ ...input, query: value }), {
      status: 400,
    });
  for (const offset of [-1, 1, 0.5, "0", null, NaN])
    await assert.rejects(query.search({ ...input, query: "valid", offset }), {
      status: 400,
    });
  assert.equal(io, 0);
  const empty = await query.search({ ...input, query: "valid" });
  assert.equal(empty.status, "complete");
  assert.equal(empty.nextOffset, null);
  assert.deepEqual(empty.results, []);
});

test("文件批次预算可继续且无遗漏重复，不能扩大默认限制或设置零进度预算", async (t) => {
  const { files, input } = await fixture(t, {
    "1.md": "find",
    "2.md": "other",
    "3.md": "find",
  });
  const query = createKnowledgeQuery({ files, limits: { maxFiles: 1 } });
  const pages = [];
  let offset = 0;
  do {
    const page = await query.search({ ...input, query: "find", offset });
    pages.push(page);
    offset = page.nextOffset;
  } while (offset !== null);
  assert.equal(pages.length, 3);
  assert.deepEqual(
    pages.map((page) => page.attempted),
    [1, 1, 1],
  );
  assert.deepEqual(
    pages.map((page) => page.nextOffset),
    [1, 2, null],
  );
  assert.deepEqual(
    pages.map((page) => page.stopReason),
    ["file_limit", "file_limit", null],
  );
  assert.deepEqual(
    pages.map((page) => page.status),
    ["partial", "partial", "complete"],
  );
  assert.deepEqual(
    pages.flatMap((page) => page.results.map((item) => item.path)),
    ["1.md", "3.md"],
  );
  for (const limits of [
    null,
    [],
    { bad: 1 },
    { maxFiles: 101 },
    { maxBytes: 4194305 },
    { maxMs: 2001 },
    { maxResults: 51 },
    { maxFiles: 0 },
    { maxBytes: -1 },
    { maxMs: 1.5 },
    { maxResults: "1" },
  ])
    assert.throws(() => createKnowledgeQuery({ files, limits }), {
      status: 400,
    });
});

test("正文预算在文件边界分页，超大文件不开始读取且仍推进位置", async (t) => {
  const { files, input } = await fixture(t, {
    "1.md": "find",
    "2.md": "find",
    "3.md": "x".repeat(256 * 1024 + 1),
    "4.md": "find is too long",
  });
  const query = createKnowledgeQuery({ files, limits: { maxBytes: 7 } });
  const first = await query.search({ ...input, query: "find" });
  assert.equal(first.bytes, 4);
  assert.equal(first.nextOffset, 1);
  assert.equal(first.stopReason, "byte_limit");
  const second = await query.search({
    ...input,
    query: "find",
    offset: first.nextOffset,
  });
  assert.equal(second.nextOffset, null);
  assert.equal(second.attempted, 3);
  assert.equal(second.read, 1);
  assert.equal(second.bytes, 4);
  assert.equal(second.status, "partial");
  assert.deepEqual(
    second.issues.map((item) => item.path),
    ["3.md", "4.md"],
  );
  assert.deepEqual(
    second.results.map((item) => item.path),
    ["2.md"],
  );
  let reads = 0;
  const unavailable = createKnowledgeQuery({
    files: {
      inspectRoot: files.inspectRoot,
      async read() {
        reads++;
        throw new Error("must never read oversize");
      },
    },
  });
  const oversize = await unavailable.search({
    ...input,
    entries: [input.entries[2]],
    query: "find",
  });
  assert.equal(reads, 0);
  assert.equal(oversize.issues.length, 1);
});

test("权限在读取前、读取后和返回前撤销均整批拒绝，不回传早先片段或再读下一篇", async (t) => {
  const { files, input } = await fixture(t, { "1.md": "find", "2.md": "find" });
  for (const revokedAt of [1, 2, 3, 4, 5, 6]) {
    let checks = 0,
      reads = 0;
    const error = Object.assign(new Error("authorization revoked"), {
      status: 403,
    });
    const engine = createKnowledgeQuery({
      files: {
        ...files,
        async read(...args) {
          reads++;
          return files.read(...args);
        },
      },
    });
    await assert.rejects(
      engine.search({
        ...input,
        query: "find",
        async assertCurrent() {
          if (++checks === revokedAt) throw error;
        },
      }),
      (found) => found === error,
    );
    assert.ok(reads <= (revokedAt <= 2 ? 0 : revokedAt <= 4 ? 1 : 2));
  }
});

test("时间预算协作式完成在途读取，然后返回下一位置；命中文件预算独立分页", async (t) => {
  const { files, input } = await fixture(t, {
    "1.md": "find",
    "2.md": "find",
    "3.md": "other",
  });
  let now = 0;
  const slow = createKnowledgeQuery({
    clock: () => now,
    limits: { maxMs: 1 },
    files: {
      ...files,
      async read(...args) {
        const result = await files.read(...args);
        now = 2;
        return result;
      },
    },
  });
  const timed = await slow.search({ ...input, query: "find" });
  assert.equal(timed.nextOffset, 1);
  assert.equal(timed.read, 1);
  assert.equal(timed.stopReason, "time_limit");
  assert.equal(timed.results[0].path, "1.md");
  const bounded = createKnowledgeQuery({ files, limits: { maxResults: 1 } });
  const first = await bounded.search({ ...input, query: "find" });
  assert.equal(first.nextOffset, 1);
  assert.equal(first.stopReason, "result_limit");
  const second = await bounded.search({ ...input, query: "find", offset: 1 });
  assert.equal(second.nextOffset, 2);
  assert.equal(second.results[0].path, "2.md");
  const third = await bounded.search({ ...input, query: "find", offset: 2 });
  assert.equal(third.status, "complete");
  assert.equal(third.nextOffset, null);
  assert.equal(third.stopReason, null);
});

test("单实例查询不排队并发读取，忙碌返回429，失败后释放查询槽", async (t) => {
  const { files, input } = await fixture(t, { "1.md": "find" });
  let entered,
    release,
    reads = 0;
  const inRead = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const query = createKnowledgeQuery({
    files: {
      ...files,
      async read(...args) {
        if (++reads === 1) {
          entered();
          await gate;
        }
        return files.read(...args);
      },
    },
  });
  const active = query.search({ ...input, query: "find" });
  await inRead;
  try {
    await assert.rejects(query.search({ ...input, query: "find" }), {
      status: 429,
    });
    assert.equal(reads, 1);
  } finally {
    release();
    await active;
  }
  await assert.rejects(
    query.search({
      ...input,
      query: "find",
      async assertCurrent() {
        throw Object.assign(new Error("expired"), { status: 409 });
      },
    }),
    { status: 409 },
  );
  const resumed = await query.search({ ...input, query: "find" });
  assert.equal(resumed.results.length, 1);
});

test("空清单也核验来源根，开始或返回前根身份漂移整批拒绝", async (t) => {
  const { files, input } = await fixture(t, { "1.md": "find" });
  for (const driftAt of [1, 2]) {
    let roots = 0,
      reads = 0;
    const engine = createKnowledgeQuery({
      files: {
        ...files,
        async inspectRoot() {
          return ++roots === driftAt
            ? { ...input.source, identity: "b".repeat(64) }
            : input.source;
        },
        async read(...args) {
          reads++;
          return files.read(...args);
        },
      },
    });
    await assert.rejects(engine.search({ ...input, query: "find" }), {
      status: 409,
    });
    assert.equal(reads, driftAt === 1 ? 0 : 1);
  }
  const denied = createKnowledgeQuery({
    files: {
      async inspectRoot() {
        throw Object.assign(new Error("PRIVATE DIRECTORY NAME"), {
          status: 403,
        });
      },
      async read() {
        throw new Error("no read");
      },
    },
  });
  await assert.rejects(
    denied.search({ ...input, entries: [], query: "find" }),
    (error) => error.status === 403 && !error.message.includes("PRIVATE"),
  );
});

test("不可读文件返回受控部分结果，失败读取占用预计字节预算，编码错误不外泄原错误", async (t) => {
  const { files, input, directory } = await fixture(t, {
    "1.md": "find",
    "2.md": Buffer.from([0xff, 0xff]),
    "3.md": "gone",
  });
  await fs.unlink(join(directory, "3.md"));
  const partial = await createKnowledgeQuery({ files }).search({
    ...input,
    query: "find",
  });
  assert.equal(partial.status, "partial");
  assert.equal(partial.nextOffset, null);
  assert.equal(partial.read, 1);
  assert.equal(partial.attempted, 3);
  assert.equal(partial.bytes, 10);
  assert.deepEqual(
    partial.issues.map((item) => item.path),
    ["2.md", "3.md"],
  );
  assert.equal(partial.results.length, 1);
  const privateError = createKnowledgeQuery({
    files: {
      ...files,
      async read() {
        throw new Error("PRIVATE SOURCE TEXT");
      },
    },
  });
  const failure = await privateError.search({ ...input, query: "find" });
  assert.equal(failure.issues.length, 3);
  assert.ok(!JSON.stringify(failure).includes("PRIVATE"));
});

test("文件指纹变化整批撤回；失败读取后的撤权检查不能降格为部分结果", async (t) => {
  const { files, input, directory } = await fixture(t, {
    "1.md": "find",
    "2.md": "find",
  });
  await fs.writeFile(join(directory, "2.md"), "CHANGED PRIVATE TEXT");
  await assert.rejects(
    createKnowledgeQuery({ files }).search({ ...input, query: "find" }),
    (error) => error.status === 409 && !error.message.includes("PRIVATE"),
  );
  let revoked = false,
    reads = 0;
  const permissionError = Object.assign(new Error("source removed"), {
    status: 404,
  });
  const unavailable = createKnowledgeQuery({
    files: {
      ...files,
      async read() {
        reads++;
        revoked = true;
        throw new Error("I/O failed");
      },
    },
  });
  await assert.rejects(
    unavailable.search({
      ...input,
      query: "find",
      async assertCurrent() {
        if (revoked) throw permissionError;
      },
    }),
    (error) => error === permissionError,
  );
  assert.equal(reads, 1);
});

test("权限复核等待耗尽预算时不启动新的正文读取，继续位置不丢失文件", async (t) => {
  const { files, input } = await fixture(t, { "1.md": "find" });
  let now = 0,
    checks = 0,
    reads = 0;
  const engine = createKnowledgeQuery({
    clock: () => now,
    limits: { maxMs: 2 },
    files: {
      ...files,
      async read(...args) {
        reads++;
        return files.read(...args);
      },
    },
  });
  const result = await engine.search({
    ...input,
    query: "find",
    async assertCurrent() {
      if (++checks === 2) now = 3;
    },
  });
  assert.equal(reads, 0);
  assert.equal(result.attempted, 0);
  assert.equal(result.bytes, 0);
  assert.equal(result.nextOffset, 0);
  assert.equal(result.stopReason, "time_limit");
});

test("根或中间目录短暂变为链接再恢复时，已观察到的不安全读取仍使整批片段撤回", async (t) => {
  for (const scope of ["root", "parent"]) {
    const { files, input, directory } = await fixture(t, {
      "1.md": "needle first",
    });
    await fs.mkdir(join(directory, "notes"));
    await fs.writeFile(join(directory, "notes", "2.md"), "needle second");
    input.entries = (await files.scan(input.source)).files.sort((a, b) =>
      a.path.localeCompare(b.path),
    );
    const target =
      scope === "root" ? input.source.root : join(input.source.root, "notes");
    const displaced = `${target}-displaced`;
    let reads = 0,
      unsafeStatus;
    const engine = createKnowledgeQuery({
      files: {
        ...files,
        async read(...args) {
          if (++reads !== 2) return files.read(...args);
          await fs.rename(target, displaced);
          let linked = false;
          try {
            await fs.symlink(displaced, target);
            linked = true;
            return await files.read(...args);
          } catch (error) {
            unsafeStatus = error.status;
            throw error;
          } finally {
            if (linked) await fs.unlink(target);
            await fs.rename(displaced, target);
          }
        },
      },
    });
    await assert.rejects(engine.search({ ...input, query: "needle" }), {
      status: 409,
    });
    assert.equal(unsafeStatus, 403);
    assert.equal(reads, 2);
    assert.deepEqual(await files.inspectRoot(input.source.root), input.source);
  }
});

test("根暂时缺失或核验 I/O 失败即使恢复，也不能返回之前取得的正文片段", async (t) => {
  for (const mode of ["missing", "io"]) {
    await t.test(mode, async (t) => {
      const { files, input } = await fixture(t, {
        "1.md": "needle first",
        "2.md": "needle second",
      });
      let reads = 0,
        failing = false,
        unsafeStatus,
        unsafeScope;
      const boundary = createKnowledgeFiles({
        fs: {
          ...fs,
          async lstat(path) {
            if (failing && path === input.source.root)
              throw Object.assign(new Error("SYNTHETIC PRIVATE ROOT FAILURE"), {
                code: "EIO",
              });
            return fs.lstat(path);
          },
        },
      });
      const displaced = `${input.source.root}-displaced`;
      const engine = createKnowledgeQuery({
        files: {
          ...files,
          async read(...args) {
            if (++reads !== 2) return boundary.read(...args);
            if (mode === "missing")
              await fs.rename(input.source.root, displaced);
            else failing = true;
            try {
              return await boundary.read(...args);
            } catch (error) {
              unsafeStatus = error.status;
              unsafeScope = error.scope;
              throw error;
            } finally {
              failing = false;
              if (mode === "missing")
                await fs.rename(displaced, input.source.root);
            }
          },
        },
      });
      await assert.rejects(
        engine.search({ ...input, query: "needle" }),
        (error) => error.status === 409 && !error.message.includes("PRIVATE"),
      );
      assert.equal(unsafeStatus, mode === "missing" ? 404 : 503);
      assert.equal(unsafeScope, "source");
      assert.equal(reads, 2);
      assert.deepEqual(
        await files.inspectRoot(input.source.root),
        input.source,
      );
    });
  }
});

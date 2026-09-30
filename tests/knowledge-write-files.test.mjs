import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createKnowledgeFiles } from "../server/knowledge-files.mjs";
import { createKnowledgeWriteFiles } from "../server/knowledge-write-files.mjs";

async function fixture(run) {
  const base = await fs.realpath(
    await fs.mkdtemp(join(tmpdir(), "guiji-write-")),
  );
  const root = join(base, "vault");
  await fs.mkdir(join(root, "00 待整理/工作/个人"), { recursive: true });
  const source = await createKnowledgeFiles().inspectRoot(root);
  const files = createKnowledgeWriteFiles();
  try {
    await run({ base, root, source, files });
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
}

test("新候选排他创建并回读，原有文件不覆盖；撤回后可核验缺失", () =>
  fixture(async ({ source, files }) => {
    const path = "00 待整理/工作/个人/方法.md";
    const target = await files.preview(source, path);
    const written = await files.create(source, target, "# 待整理\n原文不变\n");
    assert.equal(written.content, "# 待整理\n原文不变\n");
    assert.equal(
      (await files.inspect(source, path)).fingerprint,
      written.fingerprint,
    );
    await assert.rejects(files.preview(source, path), /已存在/);
    await files.remove(source, written);
    assert.equal(await files.inspect(source, path), null);
  }));

test("目录替换、路径穿越和同字节文件替换不能沿用旧预览或撤回", () =>
  fixture(async ({ source, files, root }) => {
    for (const path of [
      "../其他.md",
      "GET NOTES/原文.md",
      "00 待整理/工作/个人/../其他.md",
      "00 待整理/工作/个人/.隐藏.md",
    ]) {
      await assert.rejects(files.preview(source, path));
    }
    const path = "00 待整理/工作/个人/测试.md";
    const target = await files.preview(source, path);
    await fs.rename(join(root, "00 待整理/工作/个人"), join(root, "旧目录"));
    await fs.mkdir(join(root, "00 待整理/工作/个人"));
    await assert.rejects(files.create(source, target, "内容"), /目录已变化/);
    const written = await files.create(
      source,
      await files.preview(source, path),
      "内容",
    );
    await fs.rename(join(root, path), join(root, "保留.md"));
    await fs.writeFile(join(root, path), "内容");
    await assert.rejects(files.remove(source, written), /文件已变化/);
    assert.equal((await files.inspect(source, path)).content, "内容");
  }));

test("链接和部分写入不伪装成已保存，也不自动清理未知文件", () =>
  fixture(async ({ source, files, root }) => {
    const path = "00 待整理/工作/个人/失败.md";
    await fs.symlink(join(root, "不存在.md"), join(root, path));
    await assert.rejects(files.preview(source, path));
    await fs.unlink(join(root, path));
    const failing = createKnowledgeWriteFiles({
      filesystem: {
        ...fs,
        async open(...args) {
          const handle = await fs.open(...args);
          if (args[0] === join(root, path) && args[1] & constants.O_CREAT) {
            return {
              stat: () => handle.stat(),
              close: () => handle.close(),
              async writeFile() {
                await handle.writeFile("半份");
                throw new Error("disk full");
              },
            };
          }
          return handle;
        },
      },
    });
    await assert.rejects(
      failing.create(source, await files.preview(source, path), "完整候选"),
      /结果未知/,
    );
    assert.equal((await files.inspect(source, path)).content, "半份");
  }));

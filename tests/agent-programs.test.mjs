import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { constants } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { inspectAgentPrograms } from "../server/agent-programs.mjs";
import { macOnly, PLUTIL } from "./mac-only.mjs";

async function fixture(t) {
  const root = await fs.realpath(
    await fs.mkdtemp(join(tmpdir(), "guiji-programs-")),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const write = async (path, value, mode = 0o600) => {
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(
      path,
      typeof value === "string" ? value : JSON.stringify(value),
      { mode },
    );
    return path;
  };
  return { root, write };
}

test("Codex 安装包声明与入口对应，返回稳定身份而不执行程序", async (t) => {
  const { root, write } = await fixture(t);
  const marker = join(root, "executed");
  const path = await write(
    join(root, "bin/codex"),
    `#!/bin/sh\necho unsafe > '${marker}'\n`,
    0o700,
  );
  const evidencePath = await write(join(root, "codex-package.json"), {
    layoutVersion: 1,
    variant: "codex",
    version: "0.154.0",
    entrypoint: "bin/codex",
  });
  const [first] = await inspectAgentPrograms("codex", [{ path, kind: "CLI" }]);
  assert.equal(first.status, "present");
  assert.equal(first.version.status, "known");
  assert.equal(first.version.value, "0.154.0");
  assert.equal(first.version.source, "安装包声明");
  assert.equal(first.version.evidencePath, evidencePath);
  assert.equal(first.runtime, undefined);
  const [second] = await inspectAgentPrograms("codex", [{ path, kind: "CLI" }]);
  assert.equal(second.id, first.id);
  await assert.rejects(fs.access(marker), { code: "ENOENT" });
});

test("程序选择指纹随同路径替换或原地更新失效，逻辑 ID 不随版本变化", async (t) => {
  const { root, write } = await fixture(t);
  const path = await write(join(root, "bin/codex"), "original", 0o700);
  const program = { path, kind: "CLI" };
  const [first] = await inspectAgentPrograms("codex", [program]);
  assert.match(first.identity, /^[a-f0-9]{64}$/);
  await write(path, "changed program content");
  const [second] = await inspectAgentPrograms("codex", [program]);
  assert.equal(second.id, first.id);
  assert.notEqual(second.identity, first.identity);
  const [third] = await inspectAgentPrograms("codex", [program]);
  assert.equal(third.identity, second.identity);
});

test("元数据普通文件若在打开前变为 FIFO，读取使用非阻塞标志", async (t) => {
  const { root, write } = await fixture(t);
  const path = await write(join(root, "bin/codex"), "not executed", 0o700);
  await write(join(root, "codex-package.json"), {
    layoutVersion: 1,
    variant: "codex",
    version: "0.154.0",
    entrypoint: "bin/codex",
  });
  let openFlags;
  const filesystem = {
    ...fs,
    open: async (file, flags) => {
      openFlags = flags;
      throw Object.assign(new Error("simulate replaced FIFO"), {
        code: "EAGAIN",
      });
    },
  };
  const [record] = await inspectAgentPrograms(
    "codex",
    [{ path, kind: "CLI" }],
    { filesystem },
  );
  assert.equal(record.version.status, "blocked");
  assert.notEqual(openFlags & constants.O_NONBLOCK, 0);
});

test("程序缺失、受阻、存在但未知版本是三个不同状态，重复入口不重复", async (t) => {
  const { root, write } = await fixture(t);
  const path = await write(join(root, "bin/codex"), "not executed", 0o700);
  const program = { path, kind: "CLI" };
  const records = await inspectAgentPrograms("codex", [program, program]);
  assert.equal(records.length, 1);
  assert.equal(records[0].status, "present");
  assert.equal(records[0].version.status, "unknown");
  const filesystem = {
    ...fs,
    access: async () => {
      throw Object.assign(new Error(), { code: "EACCES" });
    },
  };
  assert.equal(
    (await inspectAgentPrograms("codex", [program], { filesystem }))[0].status,
    "blocked",
  );
  await fs.unlink(path);
  assert.equal(
    (await inspectAgentPrograms("codex", [program]))[0].status,
    "missing",
  );
  await assert.rejects(inspectAgentPrograms("other", [program]));
  await assert.rejects(
    inspectAgentPrograms("codex", [{ path: "relative", kind: "CLI" }]),
  );
  await assert.rejects(inspectAgentPrograms("codex", Array(101).fill(program)));
});

test("安装元数据拒绝错误身份、坏版本、链接、目录和超大文件", async (t) => {
  const { root, write } = await fixture(t);
  const path = await write(join(root, "bin/codex"), "not executed", 0o700);
  const evidencePath = join(root, "codex-package.json");
  const good = {
    layoutVersion: 1,
    variant: "codex",
    version: "0.154.0",
    entrypoint: "bin/codex",
  };
  const inspect = async () =>
    (await inspectAgentPrograms("codex", [{ path, kind: "CLI" }]))[0].version;
  for (const value of [
    { ...good, variant: "other" },
    { ...good, entrypoint: "../../other" },
    { ...good, version: "version\n0.154.0" },
    "not json",
    "x".repeat(65537),
  ]) {
    await write(evidencePath, value);
    assert.equal((await inspect()).status, "blocked");
  }
  await fs.unlink(evidencePath);
  const original = await write(join(root, "original.json"), good);
  await fs.symlink(original, evidencePath);
  assert.equal((await inspect()).status, "blocked");
  await fs.unlink(evidencePath);
  await fs.link(original, evidencePath);
  assert.equal((await inspect()).status, "blocked");
  await fs.unlink(evidencePath);
  await fs.mkdir(evidencePath);
  assert.equal((await inspect()).status, "blocked");
});

test("版本读取只打开白名单元数据，不读取 Agent 配置、聊天或程序正文", async (t) => {
  const { root, write } = await fixture(t);
  const path = await write(join(root, "bin/codex"), "not executed", 0o700);
  const evidencePath = await write(join(root, "codex-package.json"), {
    layoutVersion: 1,
    variant: "codex",
    version: "0.154.0",
    entrypoint: "bin/codex",
  });
  await write(join(root, "auth.json"), "must not read");
  await write(join(root, "config.toml"), "must not read");
  const filesystem = {
    ...fs,
    open: async (file, ...args) => {
      assert.equal(file, evidencePath);
      return fs.open(file, ...args);
    },
  };
  assert.equal(
    (
      await inspectAgentPrograms("codex", [{ path, kind: "CLI" }], {
        filesystem,
      })
    )[0].version.value,
    "0.154.0",
  );
});

test("元数据打开前被替换、读取中被修改均不返回版本", async (t) => {
  const { root, write } = await fixture(t);
  const path = await write(join(root, "bin/codex"), "not executed", 0o700);
  const evidencePath = await write(join(root, "codex-package.json"), {
    layoutVersion: 1,
    variant: "codex",
    version: "0.154.0",
    entrypoint: "bin/codex",
  });
  let changed = false;
  const filesystem = {
    ...fs,
    open: async (file, ...args) => {
      if (!changed) {
        changed = true;
        await fs.rename(file, `${file}.old`);
        await write(file, {
          layoutVersion: 1,
          variant: "codex",
          version: "9.9.9",
          entrypoint: "bin/codex",
        });
      }
      return fs.open(file, ...args);
    },
  };
  assert.equal(
    (
      await inspectAgentPrograms("codex", [{ path, kind: "CLI" }], {
        filesystem,
      })
    )[0].version.status,
    "blocked",
  );
  changed = false;
  const growing = {
    ...fs,
    open: async (file, ...args) => {
      const handle = await fs.open(file, ...args);
      return {
        stat: () => handle.stat(),
        close: () => handle.close(),
        read: async (...readArgs) => {
          if (!changed) {
            changed = true;
            await fs.appendFile(evidencePath, " ");
          }
          return handle.read(...readArgs);
        },
      };
    },
  };
  assert.equal(
    (
      await inspectAgentPrograms("codex", [{ path, kind: "CLI" }], {
        filesystem: growing,
      })
    )[0].version.status,
    "blocked",
  );
});

test("Hermes 重复包、坏身份、重复头、权限或祖先改向不被当作有效版本", async (t) => {
  const { root, write } = await fixture(t);
  const path = await write(
    join(root, "venv/bin/hermes"),
    "not executed",
    0o700,
  );
  const packages = join(root, "venv/lib/python3.11/site-packages");
  const folder = join(packages, "hermes_agent-0.21.1.dist-info");
  const metadata = await write(
    join(folder, "METADATA"),
    "Name: hermes-agent\nVersion: 0.21.1\n\n",
  );
  await write(
    join(folder, "entry_points.txt"),
    "[console_scripts]\nhermes = hermes_cli.main:main\n",
  );
  const inspect = async (options) =>
    (await inspectAgentPrograms("hermes", [{ path, kind: "CLI" }], options))[0]
      .version;
  await fs.mkdir(join(packages, "hermes_agent-0.22.0.dist-info"));
  assert.equal((await inspect()).status, "blocked");
  await fs.rmdir(join(packages, "hermes_agent-0.22.0.dist-info"));
  for (const text of [
    "Name: other\nVersion: 0.21.1\n\n",
    "Name: hermes-agent\nVersion: 0.21.1\nVersion: 0.22.0\n\n",
  ]) {
    await write(metadata, text);
    assert.equal((await inspect()).status, "blocked");
  }
  await write(metadata, "Name: hermes-agent\nVersion: 0.21.1\n\n");
  const denied = {
    ...fs,
    opendir: async () => {
      throw Object.assign(new Error(), { code: "EACCES" });
    },
  };
  assert.equal((await inspect({ filesystem: denied })).status, "blocked");
  await fs.rename(packages, `${packages}-moved`);
  await fs.symlink(`${packages}-moved`, packages);
  assert.equal((await inspect()).status, "blocked");
});

test("Hermes 目录枚举截断或中途改向时失败关闭", async (t) => {
  const { root, write } = await fixture(t);
  const path = await write(
    join(root, "venv/bin/hermes"),
    "not executed",
    0o700,
  );
  const lib = join(root, "venv/lib");
  await fs.mkdir(lib);
  for (let i = 0; i < 65; i++) await fs.mkdir(join(lib, `entry-${i}`));
  const inspect = async (options) =>
    (await inspectAgentPrograms("hermes", [{ path, kind: "CLI" }], options))[0]
      .version;
  assert.equal((await inspect()).status, "blocked");
  let changed = false;
  const filesystem = {
    ...fs,
    opendir: async (dir) => {
      const handle = await fs.opendir(dir);
      if (!changed) {
        changed = true;
        await fs.rename(lib, `${lib}-moved`);
        await fs.symlink(`${lib}-moved`, lib);
      }
      return handle;
    },
  };
  assert.equal((await inspect({ filesystem })).status, "blocked");
});

test("检查期间程序被替换，不把旧版本证据赋给新入口", async (t) => {
  const { root, write } = await fixture(t);
  const path = await write(join(root, "bin/codex"), "old program", 0o700);
  const evidencePath = await write(join(root, "codex-package.json"), {
    layoutVersion: 1,
    variant: "codex",
    version: "0.154.0",
    entrypoint: "bin/codex",
  });
  let replaced = false;
  const filesystem = {
    ...fs,
    open: async (file, ...args) => {
      if (file === evidencePath && !replaced) {
        replaced = true;
        await fs.rename(path, `${path}.old`);
        await write(path, "replacement", 0o700);
      }
      return fs.open(file, ...args);
    },
  };
  const [record] = await inspectAgentPrograms(
    "codex",
    [{ path, kind: "CLI" }],
    { filesystem },
  );
  assert.equal(record.status, "blocked");
  assert.equal(record.version.status, "blocked");
  assert.equal(record.version.value, "");
});

test("Hermes 从同一 venv 的包和入口声明取得版本，不扫描其他 Home", async (t) => {
  const { root, write } = await fixture(t);
  const path = await write(
    join(root, "venv/bin/hermes"),
    "#!/bin/sh\nexit 99\n",
    0o700,
  );
  const folder = join(
    root,
    "venv/lib/python3.11/site-packages/hermes_agent-0.21.1.dist-info",
  );
  const evidencePath = await write(
    join(folder, "METADATA"),
    "Metadata-Version: 2.4\nName: hermes-agent\nVersion: 0.21.1\n\nVersion: 999.0.0\n",
  );
  await write(
    join(folder, "entry_points.txt"),
    "[console_scripts]\nhermes = hermes_cli.main:main\n",
  );
  const [first] = await inspectAgentPrograms("hermes", [{ path, kind: "CLI" }]);
  assert.equal(first.version.value, "0.21.1");
  assert.equal(first.version.source, "Python 包声明");
  assert.equal(first.version.evidencePath, evidencePath);
  await write(
    join(folder, "entry_points.txt"),
    "[console_scripts]\nhermes = other.main:main\n",
  );
  assert.equal(
    (await inspectAgentPrograms("hermes", [{ path, kind: "CLI" }]))[0].version
      .status,
    "blocked",
  );
});

test("npm 版本只接受 Codex 包身份及准确的 bin 映射", async (t) => {
  const { root, write } = await fixture(t);
  const path = await write(
    join(root, "@openai/codex/bin/codex.js"),
    "throw new Error('not executed')",
    0o700,
  );
  const evidencePath = await write(join(root, "@openai/codex/package.json"), {
    name: "@openai/codex",
    version: "0.155.0-beta.1",
    bin: { codex: "bin/codex.js" },
  });
  const [first] = await inspectAgentPrograms("codex", [{ path, kind: "CLI" }]);
  assert.equal(first.version.value, "0.155.0-beta.1");
  assert.equal(first.version.source, "npm 包声明");
  await write(evidencePath, {
    name: "other-package",
    version: "99.0.0",
    bin: { codex: "bin/codex.js" },
  });
  assert.equal(
    (await inspectAgentPrograms("codex", [{ path, kind: "CLI" }]))[0].version
      .status,
    "blocked",
  );
  await write(evidencePath, {
    name: "@openai/codex",
    version: "99.0.0",
    bin: { codex: "../../outside/codex.js" },
  });
  assert.equal(
    (await inspectAgentPrograms("codex", [{ path, kind: "CLI" }]))[0].version
      .status,
    "blocked",
  );
});

test("App 版本来自 bundle 身份，内嵌 CLI 不冒用 App 版本；支持二进制 plist", macOnly(PLUTIL), async (t) => {
  const { root, write } = await fixture(t);
  const app = join(root, "ChatGPT.app");
  const path = await write(
    join(app, "Contents/Resources/codex"),
    "not executed",
    0o700,
  );
  const metadata = {
    CFBundleIdentifier: "com.openai.codex",
    CFBundleShortVersionString: "26.917.71314",
    CFBundleVersion: "10954",
  };
  const jsonPath = await write(join(app, "Contents/Info.plist"), metadata);
  await new Promise((resolve, reject) =>
    execFile("/usr/bin/plutil", ["-convert", "binary1", jsonPath], (error) =>
      error ? reject(error) : resolve(),
    ),
  );
  const records = await inspectAgentPrograms("codex", [
    { path: app, kind: "App" },
    { path, kind: "CLI" },
  ]);
  assert.equal(records[0].version.value, "26.917.71314");
  assert.equal(records[0].version.source, "App 声明");
  assert.equal(records[1].version.status, "unknown");
  assert.equal(records[1].containerVersion.value, "26.917.71314");
  assert.equal(records[1].containerVersion.source, "所属 App 声明");
  await write(jsonPath, { ...metadata, CFBundleIdentifier: "com.openai.chat" });
  const [wrongIdentity] = await inspectAgentPrograms("codex", [
    { path: app, kind: "App" },
  ]);
  assert.equal(wrongIdentity.version.status, "blocked");
  assert.equal(wrongIdentity.status, "blocked");
  await write(
    jsonPath,
    '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.openai.codex</string><key>CFBundleShortVersionString</key><string>26.917.71314</string></dict></plist>',
  );
  const [xml] = await inspectAgentPrograms("codex", [
    { path: app, kind: "App" },
  ]);
  assert.equal(xml.version.value, "26.917.71314");
});

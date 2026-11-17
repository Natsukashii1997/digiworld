import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSafeReader, maskSecrets, MASK } from "../server/cockpit-read.mjs";
import { readCockpitAgents } from "../server/cockpit-agents.mjs";

async function fixture(t) {
  const root = process.env.SECURITY_COCKPIT_TEST_ROOT || tmpdir();
  await fs.mkdir(root, { recursive: true });
  const base = await fs.realpath(await fs.mkdtemp(join(root, "cockpit-security-")));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const home = join(base, "home");
  const codex = join(home, ".codex");
  await fs.mkdir(codex, { recursive: true });
  return { base, home, codex };
}

const secretCases = [
  ['password="alpha bravo charlie"', `password="${MASK}"`],
  ["token: 'alpha bravo charlie'", `token: '${MASK}'`],
  ['authorization="Bearer SYNTHETIC_TOKEN"', `authorization="${MASK}"`],
  ['Authorization: Bearer SYNTHETIC_TOKEN', `Authorization: ${MASK}`],
  ['{"client_secret":"alpha \\"bravo\\" charlie","model":"normal"}', `{"client_secret":"${MASK}","model":"normal"}`],
  ["password='alpha \\'bravo\\' charlie'", `password='${MASK}'`],
];
for (const [input, expected] of secretCases) {
  test(`凭据完整脱敏 ${input}`, () => assert.equal(maskSecrets(input), expected));
}

test("普通正文与单词凭据保持既有展示语义", () => {
  assert.equal(maskSecrets("普通正文 model = gpt"), "普通正文 model = gpt");
  assert.equal(maskSecrets('token="abc123"'), `token="${MASK}"`);
  assert.equal(maskSecrets('## 正常标题 · model="gpt"，中文与标点'), '## 正常标题 · model="gpt"，中文与标点');
  assert.equal(maskSecrets('## 标题 token="alpha bravo" · P-08'), `## 标题 token="${MASK}" · P-08`);
});

test("Agent 指令正文和目录标题均不返回合成凭据", async (t) => {
  const { home, codex } = await fixture(t);
  await fs.writeFile(join(codex, "AGENTS.md"), '# 合成\n## token="alpha bravo charlie"\nAuthorization: Bearer SYNTHETIC_TOKEN\n## 正常标题\n普通正文\n');
  const value = await readCockpitAgents({ home });
  const instructions = value.agents.find((agent) => agent.id === "codex").instructions;
  assert.equal(instructions.state, "ok");
  assert.deepEqual(instructions.toc.map((entry) => entry.title), [`token="${MASK}"`, "正常标题"]);
  assert.ok(!JSON.stringify(instructions).match(/alpha|bravo|charlie|SYNTHETIC_TOKEN/));
  assert.ok(instructions.text.includes("普通正文"));
});

function fileSystemAtBoundary(file, change) {
  let changed = false;
  const mutate = async () => {
    if (changed) return;
    changed = true;
    await change();
  };
  return {
    ...fs,
    async stat(path, ...args) {
      const info = await fs.stat(path, ...args);
      if (path === file) await mutate();
      return info;
    },
    async lstat(path, ...args) {
      const info = await fs.lstat(path, ...args);
      if (path === file) await mutate();
      return info;
    },
  };
}

for (const target of ["leaf", "parent"]) {
  test(`读取期间 ${target} 换链不会读取拒读目标`, async (t) => {
    const { base, home, codex } = await fixture(t);
    const parent = join(codex, "nested");
    const outside = join(base, "outside");
    await fs.mkdir(parent);
    await fs.mkdir(outside);
    const file = join(parent, "rules.md");
    const denied = join(outside, target === "leaf" ? "auth.json" : "rules.md");
    await fs.writeFile(file, "正常合成正文");
    await fs.writeFile(denied, "SYNTHETIC_DENIED_CONTENT");
    const injected = fileSystemAtBoundary(file, async () => {
      if (target === "leaf") {
        await fs.rename(file, file + ".original");
        await fs.symlink(denied, file);
      } else {
        await fs.rename(parent, parent + "-original");
        await fs.symlink(outside, parent);
      }
    });
    let deniedReads = 0;
    let deniedBytesRead = 0;
    const deniedInode = (await fs.stat(denied)).ino;
    injected.readFile = async (path, ...args) => {
      const protectedFile = (await fs.stat(path)).ino === deniedInode;
      const value = await fs.readFile(path, ...args);
      if (protectedFile) { deniedReads++; deniedBytesRead += Buffer.byteLength(value); }
      return value;
    };
    injected.open = async (...args) => {
      const handle = await fs.open(...args);
      return new Proxy(handle, {
        get(object, key) {
          if (key === "read" || key === "readFile") return async (...parameters) => {
            const protectedFile = (await handle.stat()).ino === deniedInode;
            const value = await handle[key](...parameters);
            if (protectedFile) { deniedReads++; deniedBytesRead += key === "read" ? value.bytesRead : Buffer.byteLength(value); }
            return value;
          };
          const value = Reflect.get(object, key, object);
          return typeof value === "function" ? value.bind(object) : value;
        },
      });
    };
    const reader = createSafeReader({ home, fs: injected });
    assert.equal(await reader.text(file), null);
    assert.equal(deniedReads, 0, "拒读文件内容不应被读取后再丢弃");
    assert.equal(deniedBytesRead, 0);
    t.diagnostic(JSON.stringify({ target, deniedReads, deniedBytesRead }));
  });
}

for (const change of ["grow", "shrink"]) {
  test(`读取期间文件 ${change} 失败关闭且读取量有界`, async (t) => {
    const { home, codex } = await fixture(t);
    const file = join(codex, "rules.md");
    await fs.writeFile(file, "initial synthetic content");
    let mutated = false;
    let bytesRead = 0;
    const mutate = async () => {
      if (mutated) return;
      mutated = true;
      await fs.writeFile(file, change === "grow" ? Buffer.alloc(2 * 1024 * 1024 + 100, 65) : "x");
    };
    const injected = {
      ...fs,
      async readFile(path, ...args) {
        if (path === file) await mutate();
        const value = await fs.readFile(path, ...args);
        bytesRead += Buffer.byteLength(value);
        return value;
      },
      async open(path, ...args) {
        const handle = await fs.open(path, ...args);
        return new Proxy(handle, {
          get(object, key) {
            if (path === file && key === "read") return async (...parameters) => {
              await mutate();
              const result = await handle.read(...parameters);
              bytesRead += result.bytesRead;
              return result;
            };
            const value = Reflect.get(object, key, object);
            return typeof value === "function" ? value.bind(object) : value;
          },
        });
      },
    };
    assert.equal(await createSafeReader({ home, fs: injected }).text(file), null);
    assert.ok(bytesRead <= 2 * 1024 * 1024 + 1, `实际读取 ${bytesRead} bytes`);
  });
}

test("正常白名单、白名单内稳定链接、JSON 与目录行为保持", async (t) => {
  const { base, home, codex } = await fixture(t);
  await fs.writeFile(join(codex, "normal.md"), "正常正文");
  await fs.writeFile(join(codex, "config.json"), '{"model":"synthetic"}');
  await fs.writeFile(join(codex, ".hidden"), "hidden");
  await fs.writeFile(join(codex, "auth.json"), "denied");
  await fs.writeFile(join(base, "outside.md"), "outside");
  await fs.symlink(join(codex, "normal.md"), join(codex, "alias.md"));
  await fs.mkdir(join(codex, "real-directory"));
  await fs.writeFile(join(codex, "real-directory", "rules.md"), "稳定目录链接正文");
  await fs.symlink(join(codex, "real-directory"), join(codex, "linked-directory"));
  await fs.writeFile(join(home, ".claude.json"), '{"synthetic":true}');
  const reader = createSafeReader({ home });
  assert.equal((await reader.text(join(codex, "normal.md"))).text, "正常正文");
  assert.equal((await reader.text(join(codex, "alias.md"))).text, "正常正文");
  assert.equal((await reader.text(join(codex, "linked-directory", "rules.md"))).text, "稳定目录链接正文");
  assert.deepEqual((await reader.json(join(home, ".claude.json"))).value, { synthetic: true });
  assert.deepEqual((await reader.json(join(codex, "config.json"))).value, { model: "synthetic" });
  assert.equal(await reader.text(join(codex, "auth.json")), null);
  assert.equal(await reader.text(join(base, "outside.md")), null);
  assert.equal(await reader.text(codex), null);
  assert.equal((await reader.stat(codex)).dir, true);
  assert.ok(!(await reader.list(codex)).some((entry) => entry.name === ".hidden"));
});

for (const boundary of ["open", "read"]) {
  test(`父目录在 ${boundary} 后被替换时不返回内容并关闭句柄`, async (t) => {
    const { base, home, codex } = await fixture(t);
    const parent = join(codex, "nested");
    const outside = join(base, "outside");
    await fs.mkdir(parent);
    await fs.mkdir(outside);
    const file = join(parent, "rules.md");
    await fs.writeFile(file, "original synthetic");
    await fs.writeFile(join(outside, "rules.md"), "outside synthetic");
    let changed = false;
    let closed = 0;
    const change = async () => {
      if (changed) return;
      changed = true;
      await fs.rename(parent, parent + "-original");
      await fs.symlink(outside, parent);
    };
    const injected = {
      ...fs,
      async open(path, ...args) {
        const handle = await fs.open(path, ...args);
        if (path === file && boundary === "open") await change();
        return new Proxy(handle, {
          get(object, key) {
            if (key === "read") return async (...parameters) => {
              const result = await handle.read(...parameters);
              if (path === file && boundary === "read") await change();
              return result;
            };
            if (key === "close") return async () => { closed++; await handle.close(); };
            const value = Reflect.get(object, key, object);
            return typeof value === "function" ? value.bind(object) : value;
          },
        });
      },
    };
    assert.equal(await createSafeReader({ home, fs: injected }).text(file), null);
    assert.equal(changed, true);
    assert.equal(closed, 1);
  });
}

test("2MiB 边界与超限文件读取保持有界", async (t) => {
  const { home, codex } = await fixture(t);
  const file = join(codex, "bounded.md");
  await fs.writeFile(file, Buffer.alloc(2 * 1024 * 1024, 65));
  const reader = createSafeReader({ home });
  assert.equal((await reader.text(file)).text.length, 2 * 1024 * 1024);
  await fs.appendFile(file, "x");
  assert.equal(await reader.text(file), null);
});

for (const quote of ['"', "'"]) test(`不完整凭据行的 ${quote} 引号值以孤立反斜杠结尾仍完整遮罩`, () => {
  const input = `password=${quote}SYNTHETIC` + String.fromCharCode(92);
  assert.equal(maskSecrets(input), `password=${quote}${MASK}`);
  assert.equal(maskSecrets(input + '\r\n普通正文'), `password=${quote}${MASK}\r\n普通正文`);
});

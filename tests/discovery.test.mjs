import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  chmod,
  rm,
  realpath,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectAgents } from "../server/discovery.mjs";
import { macOnly, PLUTIL } from "./mac-only.mjs";
test("Agent 程序与配置痕迹区分", async () => {
  const dir = await mkdtemp(join(tmpdir(), "guiji-discovery-"));
  try {
    await mkdir(join(dir, "bin"));
    await writeFile(join(dir, "bin", "codex"), "not executed");
    await chmod(join(dir, "bin", "codex"), 0o700);
    await mkdir(join(dir, ".hermes"));
    const agents = await detectAgents({
      home: dir,
      executableDirs: [join(dir, "bin")],
      appDirs: [],
    });
    assert.equal(agents.items.find((a) => a.id === "codex").status, "detected");
    assert.equal(
      agents.items.find((a) => a.id === "hermes").status,
      "config_only",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ChatGPT.app 错误、缺失或受阻的 bundle 身份不冒充任一品牌", async () => {
  const dir = await realpath(
    await mkdtemp(join(tmpdir(), "guiji-app-identity-")),
  );
  try {
    const app = join(dir, "ChatGPT.app");
    await mkdir(join(app, "Contents"), { recursive: true });
    const metadata = join(app, "Contents/Info.plist");
    const assertNotDetected = async () => {
      const result = await detectAgents({
        home: dir,
        executableDirs: [],
        appDirs: [dir],
      });
      for (const id of ["codex", "chatgpt"]) {
        const agent = result.items.find((item) => item.id === id);
        assert.equal(agent.programs.length, 0, `${id} 不应因文件名被误认`);
        assert.notEqual(agent.status, "detected");
      }
    };
    await writeFile(
      metadata,
      JSON.stringify({ CFBundleIdentifier: "com.example.unrelated" }),
    );
    await assertNotDetected();
    await writeFile(
      metadata,
      JSON.stringify({ CFBundleShortVersionString: "1.0" }),
    );
    await assertNotDetected();
    await rm(metadata);
    await assertNotDetected();
    const linked = join(dir, "linked.plist");
    await writeFile(
      linked,
      JSON.stringify({ CFBundleIdentifier: "com.openai.chat" }),
    );
    await symlink(linked, metadata);
    await assertNotDetected();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ChatGPT.app 的 Codex bundle 身份归入 Codex，原 ChatGPT 身份不变", macOnly(PLUTIL), async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "guiji-app-alias-")));
  try {
    const app = join(dir, "ChatGPT.app");
    await mkdir(join(app, "Contents"), { recursive: true });
    const metadata = join(app, "Contents/Info.plist");
    await writeFile(
      metadata,
      JSON.stringify({
        CFBundleIdentifier: "com.openai.codex",
        CFBundleShortVersionString: "26.917.71314",
      }),
    );
    const detect = () =>
      detectAgents({ home: dir, executableDirs: [], appDirs: [dir] });
    let result = await detect();
    assert.deepEqual(result.items.find((a) => a.id === "codex").programs, [
      { path: app, kind: "App" },
    ]);
    assert.equal(
      result.items.find((a) => a.id === "chatgpt").programs.length,
      0,
    );
    await writeFile(
      metadata,
      JSON.stringify({
        CFBundleIdentifier: "com.openai.chat",
        CFBundleShortVersionString: "1.2026.100",
      }),
    );
    result = await detect();
    assert.equal(result.items.find((a) => a.id === "codex").programs.length, 0);
    assert.deepEqual(result.items.find((a) => a.id === "chatgpt").programs, [
      { path: app, kind: "App" },
    ]);
    await writeFile(metadata, "invalid plist");
    result = await detect();
    assert.equal(result.items.find((a) => a.id === "codex").status, "unknown");
    assert.equal(
      result.items.find((a) => a.id === "chatgpt").status,
      "unknown",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("不可读取的探测位置标记未知，不当作未安装", async () => {
  const dir = await mkdtemp(join(tmpdir(), "guiji-probe-error-"));
  try {
    await symlink(join(dir, "loop"), join(dir, "loop"));
    const detected = await detectAgents({
      home: dir,
      executableDirs: [join(dir, "loop")],
      appDirs: [],
    });
    const codex = detected.items.find((a) => a.id === "codex");
    assert.equal(codex.status, "unknown");
    assert.ok(codex.errors.length);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import filesystem from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  realpath,
  chmod,
  symlink,
  link,
  truncate,
  utimes,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import {
  readLocalSkill,
  discoverSkills,
  defaultSkillRoots,
} from "../server/skill-files.mjs";

async function tree(run) {
  const directory = await mkdtemp(join(tmpdir(), "guiji-skill-files-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("扫描子目录前祖先已被替换为链接时，不枚举未授权目录或泄露其名称", () =>
  tree(async (base) => {
    const root = join(base, "approved"),
      parent = join(root, "parent"),
      child = join(parent, "child"),
      outside = join(base, "outside");
    const marker = "outside-metadata-marker";
    await mkdir(child, { recursive: true });
    await mkdir(join(outside, "child", marker), { recursive: true });
    await writeFile(
      join(outside, "child", marker, "SKILL.md"),
      "未授权的合成入口",
    );
    const canonicalOutside = await realpath(outside);
    const originalLstat = filesystem.lstat,
      originalOpendir = filesystem.opendir;
    const openedOutside = [];
    let swapped = false;
    filesystem.lstat = async function (path, ...options) {
      if (!swapped && path === child) {
        swapped = true;
        await filesystem.rename(parent, join(base, "original-parent"));
        await symlink(outside, parent);
      }
      return originalLstat(path, ...options);
    };
    filesystem.opendir = async function (path, ...options) {
      if ((await realpath(path)).startsWith(canonicalOutside + "/"))
        openedOutside.push(path);
      return originalOpendir(path, ...options);
    };
    syncBuiltinESMExports();
    let result;
    try {
      result = await discoverSkills([root]);
    } finally {
      filesystem.lstat = originalLstat;
      filesystem.opendir = originalOpendir;
      syncBuiltinESMExports();
    }
    assert.equal(swapped, true);
    assert.deepEqual(openedOutside, []);
    assert.equal(result.items.length, 0);
    assert.ok(
      result.errors.some((error) => /符号链接|变化/.test(error.message)),
    );
    assert.equal(
      result.errors.some((error) => error.path.includes(marker)),
      false,
    );
  }));

test("目录枚举后身份已更换时拒绝旧清单，不继续访问子目录", () =>
  tree(async (base) => {
    const root = join(base, "approved"),
      parent = join(root, "parent"),
      child = join(parent, "child"),
      replacement = join(base, "replacement");
    await mkdir(child, { recursive: true });
    await mkdir(join(replacement, "child"), { recursive: true });
    await writeFile(join(replacement, "child", "SKILL.md"), "替换后的入口");
    const originalLstat = filesystem.lstat,
      originalOpendir = filesystem.opendir;
    let swapped = false,
      inspectedChild = false;
    filesystem.lstat = async function (path, ...options) {
      if (path === child) inspectedChild = true;
      return originalLstat(path, ...options);
    };
    filesystem.opendir = async function (path, ...options) {
      const directory = await originalOpendir(path, ...options);
      if (path !== parent) return directory;
      return {
        async *[Symbol.asyncIterator]() {
          for await (const entry of directory) yield entry;
          await filesystem.rename(parent, join(base, "original-parent"));
          await filesystem.rename(replacement, parent);
          swapped = true;
        },
      };
    };
    syncBuiltinESMExports();
    let result;
    try {
      result = await discoverSkills([root]);
    } finally {
      filesystem.lstat = originalLstat;
      filesystem.opendir = originalOpendir;
      syncBuiltinESMExports();
    }
    assert.equal(swapped, true);
    assert.equal(inspectedChild, false);
    assert.equal(result.items.length, 0);
    assert.ok(
      result.errors.some(
        (error) => error.path === parent && /变化/.test(error.message),
      ),
    );
  }));

test("发现拒绝磁盘根、其他主目录和系统数据根，不开始目录遍历", async () => {
  for (const root of [
    "/Volumes/未挂载磁盘",
    "/Users/another-user",
    "/home/another-user",
    "/System/Volumes/Data",
    "/private/var/folders",
  ])
    await assert.rejects(discoverSkills([root]), /范围过大/);
});

test("大量普通文件的目录也有元数据上限，不能绕过目录与候选限额", () =>
  tree(async (root) => {
    for (let start = 0; start < 10001; start += 100)
      await Promise.all(
        Array.from({ length: Math.min(100, 10001 - start) }, (_, offset) =>
          writeFile(join(root, `${start + offset}.txt`), ""),
        ),
      );
    const result = await discoverSkills([root]);
    assert.equal(result.truncated, true);
    assert.ok(result.errors.some((e) => /10000|元数据/.test(e.message)));
  }));

test("本机完整包保留中文、隐藏资源、空目录、二进制和普通权限", () =>
  tree(async (root) => {
    const path = join(root, "示例"),
      content = "---\nname: sample\n---\n中文入口\n";
    await mkdir(join(path, "assets"), { recursive: true });
    await mkdir(join(path, "empty"));
    await writeFile(join(path, "SKILL.md"), content);
    await writeFile(join(path, ".hidden"), "普通资源");
    await writeFile(
      join(path, "assets", "中文.bin"),
      new Uint8Array([0, 255, 128]),
    );
    await writeFile(join(path, "run.sh"), "#!/bin/sh\nexit 0\n");
    await chmod(join(path, "run.sh"), 0o755);
    const result = await readLocalSkill([root], path);
    assert.equal(result.location, await realpath(path));
    assert.equal(result.name, "sample");
    assert.equal(result.content, content);
    assert.deepEqual(
      result.files.map((f) => f.path),
      [".hidden", "SKILL.md", "assets", "assets/中文.bin", "empty", "run.sh"],
    );
    assert.deepEqual(
      Array.from(result.files.find((f) => f.path === "assets/中文.bin").data),
      [0, 255, 128],
    );
    assert.equal(result.files.find((f) => f.path === "empty").directory, true);
    assert.equal(result.files.find((f) => f.path === "run.sh").mode, 0o755);
    assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(
      result.bytes,
      Buffer.byteLength(content) +
        Buffer.byteLength("普通资源") +
        3 +
        Buffer.byteLength("#!/bin/sh\nexit 0\n"),
    );
  }));

test("来源缺失或权限失败给出可操作错误，不以空包或部分包成功返回", () =>
  tree(async (root) => {
    const path = join(root, "skill");
    await mkdir(path);
    await writeFile(join(path, "SKILL.md"), "入口");
    await assert.rejects(
      readLocalSkill([root], join(root, "missing")),
      (error) => error.status === 404 && /不存在/.test(error.message),
    );
    await chmod(join(path, "SKILL.md"), 0o000);
    try {
      await assert.rejects(
        readLocalSkill([root], path),
        (error) => error.status === 403 && /权限/.test(error.message),
      );
    } finally {
      await chmod(join(path, "SKILL.md"), 0o600);
    }
  }));

test("来源指纹忽略修改时间但响应字节、权限、路径与目录结构变化", () =>
  tree(async (root) => {
    const path = join(root, "skill"),
      entry = join(path, "SKILL.md");
    await mkdir(path);
    await writeFile(entry, "原文");
    const original = await readLocalSkill([root], path);
    await utimes(entry, new Date(2000, 0, 1), new Date(2000, 0, 1));
    assert.equal(
      (await readLocalSkill([root], path)).fingerprint,
      original.fingerprint,
    );
    await writeFile(entry, "改文");
    const changed = await readLocalSkill([root], path);
    assert.notEqual(changed.fingerprint, original.fingerprint);
    await chmod(entry, 0o700);
    const executable = await readLocalSkill([root], path);
    assert.notEqual(executable.fingerprint, changed.fingerprint);
    await mkdir(join(path, "empty"));
    const directory = await readLocalSkill([root], path);
    assert.notEqual(directory.fingerprint, executable.fingerprint);
    await writeFile(join(path, "empty", "resource"), "");
    assert.notEqual(
      (await readLocalSkill([root], path)).fingerprint,
      directory.fingerprint,
    );
  }));

test("候选目录别名仅在显式根之间解析，去重显示且完整读取仍拒绝包内链接", () =>
  tree(async (base) => {
    const codex = join(base, "codex-skills"),
      shared = join(base, "shared-skills"),
      outside = join(base, "outside");
    const target = join(shared, "sample"),
      alias = join(codex, "alias");
    await mkdir(codex);
    await mkdir(target, { recursive: true });
    await mkdir(outside);
    await writeFile(join(target, "SKILL.md"), "真实入口");
    await writeFile(join(outside, "SKILL.md"), "未授权根");
    await symlink(target, alias);
    await symlink(outside, join(codex, "external"));
    const result = await discoverSkills([codex, shared]);
    assert.equal(
      result.items.filter((f) => f.status === "candidate").length,
      1,
    );
    assert.equal(
      result.items.find((f) => f.path === alias)?.status,
      "candidate",
    );
    assert.equal(
      result.items.find((f) => f.path.endsWith("/external"))?.status,
      "blocked",
    );
    const bytes = await readLocalSkill([codex, shared], alias);
    assert.equal(bytes.location, await realpath(target));
    assert.equal(
      bytes.fingerprint,
      (await readLocalSkill([codex, shared], target)).fingerprint,
    );
    assert.equal(
      bytes.fingerprint,
      (await readLocalSkill([codex, shared], bytes.location)).fingerprint,
    );
    await assert.rejects(readLocalSkill([codex], alias), /范围|真实 Skill 根/);
    await symlink(join(target, "SKILL.md"), join(target, "link"));
    await assert.rejects(readLocalSkill([codex, shared], alias), /符号链接/);
  }));

test("扫描深度、候选和目录数量封顶时明确返回不完整，而非伪称无结果", () =>
  tree(async (base) => {
    const deepRoot = join(base, "deep");
    await mkdir(join(deepRoot, "a", "b", "c", "d", "e"), { recursive: true });
    await writeFile(
      join(deepRoot, "a", "b", "c", "d", "e", "SKILL.md"),
      "太深",
    );
    const deep = await discoverSkills([deepRoot]);
    assert.equal(deep.items.length, 0);
    assert.equal(deep.truncated, true);
    assert.ok(deep.errors.some((e) => /深度/.test(e.message)));
    const many = join(base, "many");
    await mkdir(many);
    for (let n = 0; n < 501; n++) {
      const path = join(many, `skill-${n}`);
      await mkdir(path);
      await writeFile(join(path, "SKILL.md"), "入口");
    }
    const capped = await discoverSkills([many]);
    assert.equal(capped.items.length, 500);
    assert.equal(capped.truncated, true);
    const directories = join(base, "directories");
    await mkdir(directories);
    for (let n = 0; n < 3001; n++) await mkdir(join(directories, `dir-${n}`));
    const bounded = await discoverSkills([directories]);
    assert.equal(bounded.truncated, true);
    assert.ok(bounded.errors.some((e) => /3000/.test(e.message)));
  }));

test("无 frontmatter 名称回退目录名，入口正文超过主库限额明确拒绝而不截断", () =>
  tree(async (root) => {
    const path = join(root, "中文方法");
    await mkdir(path);
    await writeFile(join(path, "SKILL.md"), "普通入口");
    assert.equal((await readLocalSkill([root], path)).name, "中文方法");
    await writeFile(join(path, "SKILL.md"), "字".repeat(1000001));
    await assert.rejects(readLocalSkill([root], path), /正文|100 万/);
    await rm(join(path, "SKILL.md"));
    await mkdir(join(path, "nested"));
    await writeFile(join(path, "nested", "SKILL.md"), "嵌套入口");
    await assert.rejects(readLocalSkill([root], path), /入口|SKILL.md/);
  }));

test("发现仅返回候选元数据，止于首个入口并明确受阻根", () =>
  tree(async (root) => {
    assert.deepEqual(defaultSkillRoots("/example/user"), [
      "/example/user/.codex/skills",
      "/example/user/.agents/skills",
      "/example/user/.hermes/skills",
    ]);
    const packagePath = join(root, "category", "sample");
    await mkdir(join(packagePath, "nested"), { recursive: true });
    await writeFile(join(packagePath, "SKILL.md"), new Uint8Array([0xff]));
    await writeFile(join(packagePath, "nested", "SKILL.md"), "不可额外收录");
    const missing = join(root, "missing");
    const result = await discoverSkills([root + "/", missing]);
    assert.deepEqual(result.roots, [root, missing]);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].path, packagePath);
    assert.equal(result.items[0].status, "candidate");
    assert.equal(result.items[0].name, "sample");
    assert.equal(result.items[0].root, root);
    assert.equal(result.errors[0].path, missing);
    assert.equal(result.truncated, false);
    assert.ok(Number.isFinite(Date.parse(result.at)));
    assert.deepEqual(Object.keys(result.items[0]).sort(), [
      "id",
      "message",
      "name",
      "path",
      "root",
      "status",
    ]);
  }));

test("入口须为 UTF-8 文本，完整包遵守文件数、大小与安全路径限制", () =>
  tree(async (root) => {
    const path = join(root, "skill");
    await mkdir(path);
    const entry = join(path, "SKILL.md");
    for (const data of [
      new Uint8Array([0xff, 0xfe]),
      new Uint8Array([65, 0, 66]),
    ]) {
      await writeFile(entry, data);
      await assert.rejects(readLocalSkill([root], path), /UTF-8|二进制/);
    }
    await writeFile(entry, "入口");
    const large = join(path, "large.bin");
    await writeFile(large, "");
    await truncate(large, 25 * 1024 * 1024 + 1);
    await assert.rejects(readLocalSkill([root], path), /25 M/);
    await rm(large);
    await Promise.all(
      Array.from({ length: 300 }, (_, n) =>
        writeFile(join(path, `${n}.txt`), ""),
      ),
    );
    await assert.rejects(readLocalSkill([root], path), /300/);
    await Promise.all(
      Array.from({ length: 300 }, (_, n) => rm(join(path, `${n}.txt`))),
    );
    const long = join(path, "a".repeat(240), "b".repeat(240), "c".repeat(30));
    await mkdir(long, { recursive: true });
    await assert.rejects(readLocalSkill([root], path), /路径/);
  }));

test("凭据路径及依赖或版本目录阻断整个包，普通隐藏资源仍保留", () =>
  tree(async (root) => {
    const path = join(root, "skill");
    await mkdir(path);
    await writeFile(join(path, "SKILL.md"), "入口");
    for (const name of [
      ".env",
      ".env.local",
      "auth.json",
      "credentials.json",
      "server.pem",
      "private.key",
      "id_ed25519",
      ".git",
      "node_modules",
      ".ssh",
    ]) {
      const target = join(path, name);
      if ([".git", "node_modules", ".ssh"].includes(name)) await mkdir(target);
      else await writeFile(target, "不应作为完整包收录");
      await assert.rejects(
        readLocalSkill([root], path),
        /凭据|依赖|版本控制|敏感/,
      );
      await rm(target, { recursive: true });
    }
    await writeFile(join(path, ".hidden"), "合法资源");
    assert.equal((await readLocalSkill([root], path)).files.length, 2);
  }));

test("认证配置 .netrc、.npmrc、.pypirc 在打开任何正文前整包阻断", () =>
  tree(async (root) => {
    const path = join(root, "skill");
    await mkdir(path);
    await writeFile(join(path, "SKILL.md"), "普通入口");
    await writeFile(join(path, ".hidden"), "应保留的普通隐藏资源");
    const canonical = await realpath(path);
    const originalOpen = filesystem.open;
    for (const name of [".netrc", ".npmrc", ".pypirc"]) {
      const target = join(path, name);
      await writeFile(
        target,
        "synthetic authentication fixture, no real credential",
      );
      const opened = [];
      filesystem.open = async function (location, ...options) {
        if (
          typeof location === "string" &&
          location.startsWith(canonical + "/")
        )
          opened.push(location);
        return originalOpen(location, ...options);
      };
      syncBuiltinESMExports();
      try {
        await assert.rejects(readLocalSkill([root], path), /凭据|敏感/);
      } finally {
        filesystem.open = originalOpen;
        syncBuiltinESMExports();
      }
      assert.deepEqual(opened, []);
      await rm(target);
    }
    const accepted = await readLocalSkill([root], path);
    assert.equal(accepted.files.length, 2);
    assert.ok(accepted.files.some((file) => file.path === ".hidden"));
  }));

test("完整读取阻断包内符号链接、硬链接、特殊文件和特殊权限", () =>
  tree(async (root) => {
    const path = join(root, "skill");
    await mkdir(path);
    await writeFile(join(path, "SKILL.md"), "入口");
    await writeFile(join(root, "outside"), "不能收录");
    const target = join(path, "resource");
    await symlink(join(root, "outside"), target);
    await assert.rejects(readLocalSkill([root], path), /链接/);
    await rm(target);
    await link(join(root, "outside"), target);
    await assert.rejects(readLocalSkill([root], path), /硬链接/);
    await rm(target);
    await promisify(execFile)("/usr/bin/mkfifo", [target]);
    await assert.rejects(readLocalSkill([root], path), /特殊文件|普通文件/);
    await rm(target);
    await writeFile(target, "普通内容");
    await chmod(target, 0o4755);
    await assert.rejects(readLocalSkill([root], path), /特殊权限/);
  }));

test("读取仅限显式具体根，拒绝越界、宽泛根和目录链符号链接", () =>
  tree(async (base) => {
    const root = join(base, "skills"),
      outside = join(base, "skills-other");
    await mkdir(root);
    await mkdir(outside);
    await writeFile(join(outside, "SKILL.md"), "外部文件");
    await symlink(outside, join(base, "root-link"));
    await symlink(outside, join(root, "outside-link"));
    for (const roots of [
      [],
      ["/"],
      [homedir()],
      [join(homedir(), "Documents")],
      ["relative"],
      Array(21).fill(root),
    ])
      await assert.rejects(readLocalSkill(roots, outside), /目录|范围|根/);
    await assert.rejects(readLocalSkill([root], outside), /范围/);
    await assert.rejects(
      readLocalSkill([join(base, "root-link")], join(base, "root-link")),
      /符号链接/,
    );
    await assert.rejects(
      readLocalSkill([root], join(root, "outside-link")),
      /符号链接|范围/,
    );
  }));

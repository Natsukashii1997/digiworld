// 智能体群内容清单的合成 Agent 家目录（G3）。只在临时目录里构造，从不触碰真实用户目录。
// 覆盖：共享池链接、失效链接、独立副本、外部链接、与仓库同内容/旧版本/不同内容的 Skill、不可读目录。
import filesystem from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readLocalSkill } from "../server/skill-files.mjs";
import { makeAsset, revise, seed } from "../src/store.js";

const skillBody = (name, line) =>
  `---\nname: ${name}\ndescription: 合成 Skill ${name}\n---\n# ${name}\n${line}\n`;

export async function contentsFixture() {
  const base = await filesystem.realpath(
    await filesystem.mkdtemp(join(tmpdir(), "guiji-agent-contents-")),
  );
  const user = join(base, "synthetic-user");
  const pool = join(user, ".agents", "skills");
  const claude = join(user, ".claude");
  const codex = join(user, ".codex");
  const hermes = join(user, ".hermes");
  const elsewhere = join(base, "elsewhere", "outside-tool");
  async function skill(directory, name, line = "只读核对，不执行。") {
    await filesystem.mkdir(directory, { recursive: true, mode: 0o755 });
    await filesystem.chmod(directory, 0o755);
    await filesystem.writeFile(
      join(directory, "SKILL.md"),
      skillBody(name, line),
      { mode: 0o644 },
    );
  }
  await skill(join(pool, "shared-writer"), "shared-writer");
  await skill(join(pool, "shared-reviewer"), "shared-reviewer");
  await skill(elsewhere, "outside-tool");
  // Claude Code：共享池链接、失效链接、独立副本、外部链接
  await filesystem.mkdir(join(claude, "skills"), { recursive: true });
  await filesystem.symlink(
    join(pool, "shared-writer"),
    join(claude, "skills", "shared-writer"),
  );
  await filesystem.symlink(
    join(pool, "deleted-bundle-skill"),
    join(claude, "skills", "gone-helper"),
  );
  await skill(join(claude, "skills", "local-notes"), "local-notes");
  await filesystem.symlink(elsewhere, join(claude, "skills", "outside-link"));
  await filesystem.writeFile(join(claude, "settings.json"), '{"合成":"哨兵"}\n');
  await filesystem.writeFile(join(claude, "CLAUDE.md"), "合成说明哨兵\n");
  await filesystem.mkdir(join(claude, "plugins", "marketplaces"), {
    recursive: true,
  });
  await filesystem.writeFile(
    join(claude, "plugins", "installed_plugins.json"),
    "{}\n",
  );
  // Codex：与仓库当前版本同内容、与仓库旧版本同内容
  await skill(join(codex, "skills", "codex-same"), "codex-same");
  await skill(join(codex, "skills", "codex-old"), "codex-old", "第一版内容。");
  await filesystem.writeFile(
    join(codex, "config.toml"),
    "# 合成配置哨兵：不能读取正文\n",
  );
  // Hermes：有来源关系但内容不同；一个不可读的 Skill 目录与不可读的插件目录
  await skill(join(hermes, "skills", "hermes-drift"), "hermes-drift", "本机改过。");
  await skill(join(hermes, "skills", "locked-skill"), "locked-skill");
  await filesystem.mkdir(join(hermes, "plugins", "sample-plugin"), {
    recursive: true,
  });
  await filesystem.writeFile(join(hermes, "config.yaml"), "合成: 哨兵\n");
  const denied = new Set([
    join(hermes, "skills", "locked-skill"),
    join(hermes, "plugins"),
  ]);
  // root 运行时 chmod 不能阻止读取，所以另外通过注入的文件系统模拟“无权限”。
  const deny = (path) => {
    if (denied.has(path))
      throw Object.assign(new Error(`EACCES: ${path}`), { code: "EACCES" });
  };
  const fs = {
    ...filesystem,
    async access(path, mode) {
      deny(path);
      return filesystem.access(path, mode);
    },
    async opendir(path, options) {
      deny(path);
      return filesystem.opendir(path, options);
    },
    async readdir(path, options) {
      deny(path);
      return filesystem.readdir(path, options);
    },
  };
  async function snapshot() {
    const rows = [];
    async function walk(path) {
      const info = await filesystem.lstat(path);
      const row = [path, info.mode, info.size, info.mtimeMs, info.ino];
      if (info.isSymbolicLink()) row.push(await filesystem.readlink(path));
      else if (info.isFile())
        row.push((await filesystem.readFile(path)).toString("base64"));
      rows.push(JSON.stringify(row));
      if (info.isDirectory())
        for (const name of (await filesystem.readdir(path)).sort())
          await walk(join(path, name));
    }
    await walk(base);
    return rows.join("\n");
  }
  return {
    base,
    user,
    pool,
    claude,
    codex,
    hermes,
    elsewhere,
    filesystem: fs,
    snapshot,
    close: () => filesystem.rm(base, { recursive: true, force: true }),
  };
}

// 按“收录本机 Skill”同一读取函数构造仓库资产，使指纹口径与真实收录一致。
export async function contentsState(fixture) {
  const read = (root, name) => readLocalSkill([root], join(root, name));
  const same = await read(join(fixture.codex, "skills"), "codex-same");
  const old = await read(join(fixture.codex, "skills"), "codex-old");
  const writer = await read(fixture.pool, "shared-writer");
  const asset = (id, title, local) => {
    const value = makeAsset({
      type: "Skill",
      title,
      content: local.content,
      files: local.files,
    });
    value.id = id;
    return value;
  };
  const sameAsset = asset("asset-codex-same", "仓库 · codex-same", same);
  const writerAsset = asset("asset-shared-writer", "仓库 · shared-writer", writer);
  let oldAsset = asset("asset-codex-old", "仓库 · codex-old", old);
  const newer = skillBody("codex-old", "仓库已更新到第二版。");
  oldAsset = revise(oldAsset, {
    content: newer,
    files: old.files.map((f) =>
      f.path === "SKILL.md" ? { ...f, data: new TextEncoder().encode(newer) } : f,
    ),
  });
  const driftBody = skillBody("hermes-drift", "仓库里的原始内容。");
  const driftAsset = {
    ...asset("asset-hermes-drift", "仓库 · hermes-drift", {
      content: driftBody,
      files: [
        {
          path: "SKILL.md",
          text: false,
          data: new TextEncoder().encode(driftBody),
          mode: 0o644,
        },
      ],
    }),
    origin: {
      kind: "local",
      location: join(fixture.hermes, "skills", "hermes-drift"),
      fingerprint: "0".repeat(64),
      capturedAt: "2026-09-30T00:00:00.000Z",
    },
  };
  return {
    ...seed(),
    assets: [sameAsset, writerAsset, oldAsset, driftAsset],
  };
}

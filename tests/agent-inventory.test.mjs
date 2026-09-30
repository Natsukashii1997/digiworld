import test from "node:test";
import assert from "node:assert/strict";
import filesystem from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inspectAgentInventory } from "../server/agent-inventory.mjs";

async function tree(run) {
  const directory = await filesystem.mkdtemp(
    join(tmpdir(), "guiji-agent-inventory-"),
  );
  const home = await filesystem.realpath(directory);
  try {
    await run(home);
  } finally {
    await filesystem.rm(home, { recursive: true, force: true });
  }
}

test("Codex 默认 Home 与共享用户 Skill 来源分开展示，刷新身份稳定", () =>
  tree(async (home) => {
    await filesystem.mkdir(join(home, ".codex", "skills"), { recursive: true });
    await filesystem.mkdir(join(home, ".agents", "skills"), {
      recursive: true,
    });
    const first = await inspectAgentInventory("codex", {
      home,
      environment: {},
    });
    const again = await inspectAgentInventory("codex", {
      home,
      environment: {},
    });
    assert.equal(first.agentId, "codex");
    assert.ok(Number.isFinite(Date.parse(first.at)));
    assert.deepEqual(
      first.homes.map((item) => item.path),
      [join(home, ".codex"), join(home, ".agents")],
    );
    assert.deepEqual(
      first.homes.map((item) => item.status),
      ["present", "present"],
    );
    assert.deepEqual(
      first.homes.map((item) => item.skills[0].path),
      [join(home, ".codex", "skills"), join(home, ".agents", "skills")],
    );
    assert.deepEqual(
      first.homes.map((item) => item.id),
      again.homes.map((item) => item.id),
    );
    assert.notEqual(first.homes[0].id, first.homes[1].id);
    assert.deepEqual(first.errors, []);
    assert.equal(first.truncated, false);
  }));

test("Profile 链接单独受阻，删除标记目录链接或枚举权限错误不当作无 Profile", () =>
  tree(async (home) => {
    const root = join(home, ".hermes"),
      profiles = join(root, "profiles"),
      outside = join(home, "outside");
    await filesystem.mkdir(profiles, { recursive: true });
    await filesystem.mkdir(join(outside, "skills"), { recursive: true });
    await filesystem.symlink(outside, join(profiles, "linked"));
    const linked = await inspectAgentInventory("hermes", {
      home,
      environment: {},
    });
    assert.equal(
      linked.homes.find((item) => item.path === join(profiles, "linked"))
        .status,
      "blocked",
    );
    await filesystem.symlink(outside, join(profiles, ".deleted"));
    const tombstone = await inspectAgentInventory("hermes", {
      home,
      environment: {},
    });
    assert.equal(tombstone.homes.length, 1);
    assert.ok(tombstone.errors.some((error) => /删除标记/.test(error.message)));
    const fs = {
      ...filesystem,
      opendir: async () => {
        throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      },
    };
    const denied = await inspectAgentInventory("hermes", {
      home,
      environment: {},
      filesystem: fs,
    });
    assert.ok(denied.errors.some((error) => /权限/.test(error.message)));
  }));

test("仅目录元数据 API 和对应 Home 环境变量被读取，配置秘密与 active_profile 均不读取", () =>
  tree(async (home) => {
    for (const agent of ["codex", "hermes"]) {
      const root = join(home, `.${agent}`);
      await filesystem.mkdir(join(root, "skills"), { recursive: true });
      for (const name of [
        "config.yaml",
        "config.toml",
        "auth.json",
        ".env",
        "active_profile",
      ])
        await filesystem.writeFile(
          join(root, name),
          "synthetic-private-marker",
        );
      const operations = [];
      const fs = new Proxy(filesystem, {
        get(target, name) {
          if (!["lstat", "opendir", "access"].includes(name))
            throw new Error(`Forbidden filesystem operation: ${String(name)}`);
          return (...args) => {
            operations.push(String(args[0]));
            return target[name](...args);
          };
        },
      });
      const environment = new Proxy(
        {},
        {
          get(_, name) {
            assert.equal(
              name,
              agent === "codex" ? "CODEX_HOME" : "HERMES_HOME",
            );
            return undefined;
          },
        },
      );
      const result = await inspectAgentInventory(agent, {
        home,
        environment,
        filesystem: fs,
      });
      assert.deepEqual(Object.keys(result).sort(), [
        "agentId",
        "at",
        "errors",
        "homes",
        "truncated",
      ]);
      assert.equal(
        JSON.stringify(result).includes("synthetic-private-marker"),
        false,
      );
      assert.ok(
        operations.every(
          (path) =>
            !/\/(config\.(yaml|toml)|auth\.json|\.env|active_profile)$/.test(
              path,
            ),
        ),
      );
      assert.ok(
        result.homes.every(
          (item) =>
            !Object.hasOwn(item, "running") && !Object.hasOwn(item, "enabled"),
        ),
      );
    }
  }));

test("Home 与环境路径的任一祖先是链接时受阻，不进入目标目录枚举", () =>
  tree(async (home) => {
    const outside = join(home, "outside");
    await filesystem.mkdir(
      join(outside, "profiles", "private-profile", "skills"),
      { recursive: true },
    );
    await filesystem.mkdir(join(outside, "custom", "skills"), {
      recursive: true,
    });
    await filesystem.symlink(outside, join(home, ".hermes"));
    await filesystem.symlink(outside, join(home, "alias"));
    const opened = [];
    const fs = {
      ...filesystem,
      opendir: async (path, ...args) => {
        opened.push(path);
        return filesystem.opendir(path, ...args);
      },
    };
    const result = await inspectAgentInventory("hermes", {
      home,
      environment: { HERMES_HOME: join(home, "alias", "custom") },
      filesystem: fs,
    });
    assert.equal(result.homes.length, 2);
    assert.ok(result.homes.every((item) => item.status === "blocked"));
    assert.ok(
      result.homes.every((item) =>
        item.errors.some((error) => /链接/.test(error.message)),
      ),
    );
    assert.deepEqual(opened, []);
    assert.equal(JSON.stringify(result).includes("private-profile"), false);
  }));

test("Codex 环境 Home 仅作为额外候选，规范化去重；非法宽泛路径不扫描", () =>
  tree(async (home) => {
    const custom = join(home, "custom-codex");
    await filesystem.mkdir(join(custom, "skills"), { recursive: true });
    const result = await inspectAgentInventory("codex", {
      home,
      environment: { CODEX_HOME: custom },
    });
    assert.ok(
      result.homes.some(
        (item) =>
          item.path === custom &&
          item.status === "present" &&
          item.source.includes("CODEX_HOME"),
      ),
    );
    const dedupe = await inspectAgentInventory("codex", {
      home,
      environment: { CODEX_HOME: join(home, ".codex") + "/." },
    });
    assert.equal(dedupe.homes.length, 2);
    assert.ok(dedupe.homes[0].source.includes("CODEX_HOME"));
    for (const path of [
      "relative",
      "~/.codex",
      "/",
      "/etc",
      "/private",
      "/Applications",
      "/var",
      "/private/var",
      "/usr",
      "/opt",
      home,
      join(home, "Documents"),
      "x\n/y",
    ]) {
      const invalid = await inspectAgentInventory("codex", {
        home,
        environment: { CODEX_HOME: path },
      });
      assert.equal(invalid.homes.length, 2);
      assert.ok(
        invalid.errors.some((error) => /CODEX_HOME/.test(error.message)),
        path,
      );
    }
    await assert.rejects(
      inspectAgentInventory("unsupported", { home, environment: {} }),
      (error) => error.status === 400,
    );
  }));

test("目录缺失是 missing，普通文件和无读取权限是 blocked，不假装为空成功", () =>
  tree(async (home) => {
    const missing = await inspectAgentInventory("codex", {
      home,
      environment: {},
    });
    assert.deepEqual(
      missing.homes.map((item) => item.status),
      ["missing", "missing"],
    );
    assert.deepEqual(
      missing.homes.map((item) => item.skills[0].status),
      ["missing", "missing"],
    );
    await filesystem.writeFile(join(home, ".codex"), "not a directory");
    await filesystem.mkdir(join(home, ".agents", "skills"), {
      recursive: true,
    });
    const denied = Object.assign(new Error("synthetic permission denial"), {
      code: "EACCES",
    });
    const fs = {
      ...filesystem,
      access: async (path, mode) => {
        if (path === join(home, ".agents")) throw denied;
        return filesystem.access(path, mode);
      },
    };
    const result = await inspectAgentInventory("codex", {
      home,
      environment: {},
      filesystem: fs,
    });
    assert.deepEqual(
      result.homes.map((item) => item.status),
      ["blocked", "blocked"],
    );
    assert.ok(
      result.homes[0].errors.some((error) => /目录/.test(error.message)),
    );
    assert.ok(
      result.homes[1].errors.some((error) => /权限/.test(error.message)),
    );
    assert.deepEqual(
      result.homes.map((item) => item.skills[0].status),
      ["blocked", "blocked"],
    );
  }));

test("Hermes 枚举默认和环境 Home 对应 Profiles，排除非法名字和已删除项并稳定去重", () =>
  tree(async (home) => {
    const defaultRoot = join(home, ".hermes"),
      custom = join(home, "custom-hermes");
    await filesystem.mkdir(join(defaultRoot, "profiles", "work", "skills"), {
      recursive: true,
    });
    for (const name of ["Upper", ".hidden", "default", "deleted"])
      await filesystem.mkdir(join(defaultRoot, "profiles", name), {
        recursive: true,
      });
    await filesystem.mkdir(join(defaultRoot, "profiles", ".deleted"));
    await filesystem.writeFile(
      join(defaultRoot, "profiles", ".deleted", "deleted"),
      "deleted",
    );
    await filesystem.mkdir(join(custom, "profiles", "research", "skills"), {
      recursive: true,
    });
    await filesystem.mkdir(join(custom, "profiles", "writer"), {
      recursive: true,
    });
    const environment = { HERMES_HOME: join(custom, "profiles", "research") };
    const result = await inspectAgentInventory("hermes", { home, environment });
    const paths = result.homes.map((item) => item.path);
    assert.ok(paths.includes(defaultRoot));
    assert.ok(paths.includes(join(defaultRoot, "profiles", "work")));
    assert.ok(paths.includes(join(custom, "profiles", "writer")));
    assert.equal(
      paths.filter((path) => path === environment.HERMES_HOME).length,
      1,
    );
    assert.equal(paths.length, 4);
    const second = await inspectAgentInventory("hermes", {
      home,
      environment: { HERMES_HOME: custom },
    });
    for (const item of result.homes)
      assert.equal(
        second.homes.find((other) => other.path === item.path).id,
        item.id,
      );
    assert.ok(
      result.homes.every(
        (item) => item.skills[0].path === join(item.path, "skills"),
      ),
    );
    assert.equal(result.truncated, false);
  }));

test("Profile 数量与枚举项均有界，限额不伪装成完整结果", () =>
  tree(async (home) => {
    const profiles = join(home, ".hermes", "profiles");
    await filesystem.mkdir(profiles, { recursive: true });
    await Promise.all(
      Array.from({ length: 105 }, (_, index) =>
        filesystem.mkdir(join(profiles, `p${index}`)),
      ),
    );
    const result = await inspectAgentInventory("hermes", {
      home,
      environment: {},
    });
    assert.equal(result.homes.length, 101);
    assert.equal(result.truncated, true);
    assert.ok(result.errors.some((error) => /100/.test(error.message)));
    await filesystem.rm(profiles, { recursive: true });
    await filesystem.mkdir(profiles);
    await Promise.all(
      Array.from({ length: 1005 }, (_, index) =>
        filesystem.mkdir(join(profiles, `.invalid-${index}`)),
      ),
    );
    let read = 0;
    const fs = {
      ...filesystem,
      opendir: async (...args) => {
        const directory = await filesystem.opendir(...args);
        return {
          async *[Symbol.asyncIterator]() {
            for await (const entry of directory) {
              read++;
              yield entry;
            }
          },
        };
      },
    };
    const invalids = await inspectAgentInventory("hermes", {
      home,
      environment: {},
      filesystem: fs,
    });
    assert.equal(invalids.homes.length, 1);
    assert.equal(invalids.truncated, true);
    assert.ok(read <= 1001);
    assert.ok(invalids.errors.some((error) => /枚举/.test(error.message)));
  }));

test("环境指定的 Profile 也须合法且非 tombstone，枚举失败不绕过单项核验", () =>
  tree(async (home) => {
    const root = join(home, ".hermes"),
      profiles = join(root, "profiles");
    await filesystem.mkdir(join(profiles, "deleted", "skills"), {
      recursive: true,
    });
    await filesystem.mkdir(join(profiles, ".deleted"));
    await filesystem.writeFile(
      join(profiles, ".deleted", "deleted"),
      "deleted",
    );
    const fs = {
      ...filesystem,
      opendir: async () => {
        throw Object.assign(new Error("failed"), { code: "EIO" });
      },
    };
    for (const name of ["deleted", "default", "Upper", "bad name"]) {
      const selected = join(profiles, name);
      const result = await inspectAgentInventory("hermes", {
        home,
        environment: { HERMES_HOME: selected },
        filesystem: fs,
      });
      assert.equal(
        result.homes.some((item) => item.path === selected),
        false,
        name,
      );
      assert.ok(result.errors.length > 0);
    }
  }));

test("枚举打开时 Home 被替换成链接，中止并关闭句柄，不返回外部 Profile 名称", () =>
  tree(async (home) => {
    const root = join(home, ".hermes"),
      outside = join(home, "outside");
    await filesystem.mkdir(join(root, "profiles", "safe"), { recursive: true });
    await filesystem.mkdir(join(outside, "profiles", "external-private-name"), {
      recursive: true,
    });
    let handle;
    const fs = {
      ...filesystem,
      opendir: async (path, ...args) => {
        await filesystem.rename(root, join(home, "old-root"));
        await filesystem.symlink(outside, root);
        handle = await filesystem.opendir(path, ...args);
        return handle;
      },
    };
    const result = await inspectAgentInventory("hermes", {
      home,
      environment: {},
      filesystem: fs,
    });
    assert.equal(
      JSON.stringify(result).includes("external-private-name"),
      false,
    );
    assert.ok(result.errors.some((error) => /变化|链接/.test(error.message)));
    assert.equal(result.homes.length, 1);
    assert.equal(result.homes[0].status, "blocked");
    await assert.rejects(
      handle.read(),
      (error) => error.code === "ERR_DIR_CLOSED",
    );
  }));

test("同一 Profile 枚举重复项不重置环境来源或身份", () =>
  tree(async (home) => {
    const selected = join(home, ".hermes", "profiles", "work");
    await filesystem.mkdir(selected, { recursive: true });
    const fs = {
      ...filesystem,
      opendir: async (...args) => {
        const directory = await filesystem.opendir(...args);
        return {
          close: () => directory.close(),
          async *[Symbol.asyncIterator]() {
            for await (const entry of directory) {
              yield entry;
              yield entry;
            }
          },
        };
      },
    };
    const result = await inspectAgentInventory("hermes", {
      home,
      environment: { HERMES_HOME: selected },
      filesystem: fs,
    });
    assert.equal(result.homes.length, 2);
    assert.ok(
      result.homes
        .find((item) => item.path === selected)
        .source.includes("HERMES_HOME"),
    );
  }));

import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir, userInfo } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readConfigFile, atomicReplaceConfig } from "../server/config-file.mjs";

async function fixture(t, bytes = "abc") {
  const directory = await fs.realpath(
    await fs.mkdtemp(join(tmpdir(), "guiji-config-file-")),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const path = join(directory, "config.toml");
  await fs.writeFile(path, bytes, { mode: 0o640 });
  return { directory, path };
}

test("reads an owned ordinary configuration as exact bytes with a stable fingerprint", async (t) => {
  const { path } = await fixture(t);
  const first = await readConfigFile(path);
  const second = await readConfigFile(path);
  assert.deepEqual(first.bytes, Buffer.from("abc"));
  assert.equal(
    first.hash,
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(first.identity, second.identity);
  assert.equal(first.mode, 0o640);
  assert.equal(first.uid, process.getuid());
  assert.equal(first.gid, (await fs.stat(path)).gid);
});

test("rejects relative paths and linked ancestors or files instead of following them", async (t) => {
  const { directory, path } = await fixture(t);
  await assert.rejects(readConfigFile("package.json"), { status: 400 });
  const alias = join(directory, "alias");
  await fs.symlink(path, alias);
  await assert.rejects(readConfigFile(alias), { status: 403 });
  const home = join(directory, "home");
  await fs.mkdir(home);
  await fs.writeFile(join(home, "config.toml"), "abc");
  const linkedHome = join(directory, "linked-home");
  await fs.symlink(home, linkedHome);
  await assert.rejects(readConfigFile(join(linkedHome, "config.toml")), {
    status: 403,
  });
  await assert.rejects(readConfigFile(`${home}/../config.toml`), {
    status: 400,
  });
});

test("rejects hard-linked, special-permission, foreign-owner, and oversized configuration files", async (t) => {
  const { directory, path } = await fixture(t);
  const hard = join(directory, "hard-link");
  await fs.link(path, hard);
  await assert.rejects(readConfigFile(path), { status: 403 });
  await fs.unlink(hard);
  await fs.chmod(path, 0o4640);
  await assert.rejects(readConfigFile(path), { status: 403 });
  await fs.chmod(path, 0o640);
  const foreign = {
    ...fs,
    lstat: async (p) => {
      const value = await fs.lstat(p);
      if (p === path) value.uid = process.getuid() + 1;
      return value;
    },
  };
  await assert.rejects(readConfigFile(path, { filesystem: foreign }), {
    status: 403,
  });
  await fs.writeFile(path, Buffer.alloc(256 * 1024 + 1));
  await assert.rejects(readConfigFile(path), { status: 413 });
});

test("refuses a file replaced while opening it and never exposes filesystem error details", async (t) => {
  const { path } = await fixture(t);
  let replaced = false;
  const replacement = {
    ...fs,
    open: async (...args) => {
      if (args[0] === path && !replaced) {
        replaced = true;
        await fs.rename(path, `${path}.old`);
        await fs.writeFile(path, "private-sentinel");
      }
      return fs.open(...args);
    },
  };
  await assert.rejects(readConfigFile(path, { filesystem: replacement }), {
    status: 409,
  });
  await assert.rejects(
    readConfigFile(path, {
      filesystem: {
        ...fs,
        lstat: async () => {
          throw new Error("private-sentinel");
        },
      },
    }),
    (error) =>
      error.status === 503 &&
      !JSON.stringify(error).includes("private-sentinel") &&
      !error.message.includes("private-sentinel"),
  );
});

test("applies exact bytes atomically, preserves ordinary permissions, and returns verified read-back", async (t) => {
  const { directory, path } = await fixture(
    t,
    "enabled = false\n# private-sentinel\n",
  );
  const expected = await readConfigFile(path);
  const next = Buffer.from("enabled = true\n# private-sentinel\n");
  const applied = await atomicReplaceConfig(path, expected, next, {
    checkMetadata: async () => {},
  });
  assert.deepEqual(applied.bytes, next);
  assert.equal(applied.mode, 0o640);
  assert.notEqual(applied.identity, expected.identity);
  assert.deepEqual(await fs.readdir(directory), ["config.toml"]);
  assert.deepEqual((await readConfigFile(path)).bytes, next);
});

test("refuses stale previews, scope failures, and invalid next content without changing the configuration", async (t) => {
  const { directory, path } = await fixture(t);
  const expected = await readConfigFile(path);
  await fs.writeFile(path, "external");
  await assert.rejects(
    atomicReplaceConfig(path, expected, Buffer.from("next"), {
      checkMetadata: async () => {},
    }),
    { status: 409 },
  );
  const fresh = await readConfigFile(path);
  await assert.rejects(
    atomicReplaceConfig(path, fresh, Buffer.from("next"), {
      checkMetadata: async () => {},
      verifyScope: async () => {
        throw new Error("private-sentinel");
      },
    }),
    (error) =>
      error.status === 409 && !error.message.includes("private-sentinel"),
  );
  await assert.rejects(
    atomicReplaceConfig(path, fresh, Buffer.alloc(256 * 1024 + 1), {
      checkMetadata: async () => {},
    }),
    { status: 413 },
  );
  assert.equal((await readConfigFile(path)).bytes.toString(), "external");
  assert.deepEqual(await fs.readdir(directory), ["config.toml"]);
});

test("detects an external change immediately before replacement and cleans only its own staged file", async (t) => {
  const { directory, path } = await fixture(t);
  const expected = await readConfigFile(path);
  let changed = false;
  const filesystem = {
    ...fs,
    open: async (...args) => {
      const handle = await fs.open(...args);
      if (String(args[0]).includes(".guiji-config-")) {
        const originalSync = handle.sync.bind(handle);
        handle.sync = async () => {
          await originalSync();
          if (!changed) {
            changed = true;
            await fs.writeFile(path, "external");
          }
        };
      }
      return handle;
    },
  };
  await assert.rejects(
    atomicReplaceConfig(path, expected, Buffer.from("next"), {
      filesystem,
      checkMetadata: async () => {},
    }),
    { status: 409 },
  );
  assert.equal((await readConfigFile(path)).bytes.toString(), "external");
  assert.deepEqual(await fs.readdir(directory), ["config.toml"]);
});

test("reports unknown when rename may have completed and never deletes a newly created temporary replacement", async (t) => {
  const { directory, path } = await fixture(t);
  const expected = await readConfigFile(path);
  let externalTemporary;
  const filesystem = {
    ...fs,
    rename: async (source, target) => {
      await fs.rename(source, target);
      externalTemporary = source;
      await fs.writeFile(source, "external-temporary");
      throw new Error("private-sentinel");
    },
  };
  await assert.rejects(
    atomicReplaceConfig(path, expected, Buffer.from("next"), {
      filesystem,
      checkMetadata: async () => {},
    }),
    (error) =>
      error.outcome === "unknown" &&
      error.status === 503 &&
      !error.message.includes("private-sentinel"),
  );
  assert.equal((await readConfigFile(path)).bytes.toString(), "next");
  assert.equal(
    await fs.readFile(externalTemporary, "utf8"),
    "external-temporary",
  );
  assert.equal((await fs.readdir(directory)).length, 2);
});

test("rejects mismatched read-back or failed directory durability without automatically rolling back", async (t) => {
  const { path } = await fixture(t);
  const expected = await readConfigFile(path);
  const drift = {
    ...fs,
    rename: async (source, target) => {
      await fs.rename(source, target);
      await fs.writeFile(target, "external-after-rename");
    },
  };
  await assert.rejects(
    atomicReplaceConfig(path, expected, Buffer.from("next"), {
      filesystem: drift,
      checkMetadata: async () => {},
    }),
    { outcome: "unknown" },
  );
  assert.equal(
    (await readConfigFile(path)).bytes.toString(),
    "external-after-rename",
  );
  const fresh = await readConfigFile(path);
  const failedSync = {
    ...fs,
    open: async (...args) => {
      const handle = await fs.open(...args);
      if (args[0] === path.slice(0, path.lastIndexOf("/")))
        handle.sync = async () => {
          throw new Error("private-sentinel");
        };
      return handle;
    },
  };
  await assert.rejects(
    atomicReplaceConfig(path, fresh, Buffer.from("next"), {
      filesystem: failedSync,
      checkMetadata: async () => {},
    }),
    { outcome: "unknown" },
  );
  assert.equal((await readConfigFile(path)).bytes.toString(), "next");
});

test("does not install or delete a staged file replaced by an external process", async (t) => {
  const { directory, path } = await fixture(t);
  const expected = await readConfigFile(path);
  let replacedPath,
    swapped = false;
  const filesystem = {
    ...fs,
    open: async (...args) => {
      const handle = await fs.open(...args);
      if (String(args[0]).includes(".guiji-config-")) {
        const originalClose = handle.close.bind(handle);
        handle.close = async () => {
          await originalClose();
          if (!swapped) {
            swapped = true;
            replacedPath = args[0];
            await fs.rename(args[0], join(directory, "original-staging"));
            await fs.writeFile(args[0], "unrelated-staging");
          }
        };
      }
      return handle;
    },
  };
  await assert.rejects(
    atomicReplaceConfig(path, expected, Buffer.from("next"), {
      filesystem,
      checkMetadata: async () => {},
    }),
    (error) => error.status === 409 && error.outcome !== "unknown",
  );
  assert.equal((await readConfigFile(path)).bytes.toString(), "abc");
  assert.equal(await fs.readFile(replacedPath, "utf8"), "unrelated-staging");
});

test(
  "the native metadata boundary rejects extended attributes and ACLs without exposing values",
  { skip: process.platform !== "darwin" },
  async (t) => {
    const { path } = await fixture(t);
    const run = promisify(execFile);
    await run("/usr/bin/xattr", [
      "-w",
      "org.guiji.synthetic",
      "private-sentinel",
      path,
    ]);
    await assert.rejects(
      atomicReplaceConfig(
        path,
        await readConfigFile(path),
        Buffer.from("later"),
      ),
      (error) =>
        error.status === 403 && !error.message.includes("private-sentinel"),
    );
    assert.equal((await readConfigFile(path)).bytes.toString(), "abc");
    await run("/usr/bin/xattr", ["-d", "org.guiji.synthetic", path]);
    await run("/bin/chmod", [
      "+a",
      `user:${userInfo().username} allow read`,
      path,
    ]);
    await assert.rejects(
      atomicReplaceConfig(
        path,
        await readConfigFile(path),
        Buffer.from("later"),
      ),
      { status: 403 },
    );
    assert.equal((await readConfigFile(path)).bytes.toString(), "abc");
  },
);

test(
  "the native macOS writer exactly preserves the system provenance attribute",
  { skip: process.platform !== "darwin" },
  async (t) => {
    const { path } = await fixture(t);
    const run = promisify(execFile);
    const before = (
      await run("/usr/bin/xattr", ["-px", "com.apple.provenance", path])
    ).stdout;
    const written = await atomicReplaceConfig(
      path,
      await readConfigFile(path),
      Buffer.from("next"),
    );
    assert.equal(written.bytes.toString(), "next");
    assert.equal(
      (await run("/usr/bin/xattr", ["-px", "com.apple.provenance", path]))
        .stdout,
      before,
    );
    assert.equal(Object.hasOwn(written, "provenance"), false);
  },
);

test("blocks a metadata-only change before rename even when configuration bytes stay identical", async (t) => {
  const { directory, path } = await fixture(t);
  const expected = await readConfigFile(path);
  let sourceReads = 0;
  const checkMetadata = async (checked) => {
    if (checked !== path) return { provenance: "aa" };
    return { provenance: ++sourceReads === 1 ? "aa" : "bb" };
  };
  await assert.rejects(
    atomicReplaceConfig(path, expected, Buffer.from("next"), { checkMetadata }),
    { status: 409 },
  );
  assert.equal((await readConfigFile(path)).bytes.toString(), "abc");
  assert.deepEqual(await fs.readdir(directory), ["config.toml"]);
});

test("reports unknown if provenance changes only after replacement", async (t) => {
  const { path } = await fixture(t);
  let renamed = false;
  const filesystem = {
    ...fs,
    rename: async (...args) => {
      await fs.rename(...args);
      renamed = true;
    },
  };
  const checkMetadata = async () => ({ provenance: renamed ? "bb" : "aa" });
  await assert.rejects(
    atomicReplaceConfig(path, await readConfigFile(path), Buffer.from("next"), {
      filesystem,
      checkMetadata,
    }),
    { outcome: "unknown" },
  );
  assert.equal((await readConfigFile(path)).bytes.toString(), "next");
});

test("preserves the original file group as well as mode when the directory has a different group", async (t) => {
  const group = process.getgroups().find((value) => value !== process.getgid());
  if (group === undefined)
    return t.skip("No alternate current-user group on this host");
  const { path } = await fixture(t);
  await fs.chown(path, process.getuid(), group);
  await atomicReplaceConfig(
    path,
    await readConfigFile(path),
    Buffer.from("next"),
    { checkMetadata: async () => {} },
  );
  assert.equal((await fs.lstat(path)).gid, group);
});

test("a mismatched expected group cannot authorize an atomic replacement", async (t) => {
  const { path } = await fixture(t);
  const expected = await readConfigFile(path);
  await assert.rejects(
    atomicReplaceConfig(
      path,
      { ...expected, gid: expected.gid + 1 },
      Buffer.from("next"),
      { checkMetadata: async () => {} },
    ),
    { status: 409 },
  );
  assert.equal((await readConfigFile(path)).bytes.toString(), "abc");
});

test("never attempts metadata writes on a replaced staging path", async (t) => {
  const { directory, path } = await fixture(t);
  let swapped = false,
    adjustedReplacement = false;
  const filesystem = {
    ...fs,
    open: async (...args) => {
      const handle = await fs.open(...args);
      if (String(args[0]).includes(".guiji-config-")) {
        const sync = handle.sync.bind(handle);
        handle.sync = async () => {
          await sync();
          if (!swapped) {
            swapped = true;
            await fs.rename(args[0], join(directory, "original-staging"));
            await fs.writeFile(args[0], "external-temporary");
          }
        };
      }
      return handle;
    },
  };
  const checkMetadata = async (_path, options) => {
    if (options?.preserve) adjustedReplacement = true;
    return { provenance: null };
  };
  await assert.rejects(
    atomicReplaceConfig(path, await readConfigFile(path), Buffer.from("next"), {
      filesystem,
      checkMetadata,
    }),
    { status: 409 },
  );
  assert.equal(adjustedReplacement, false);
  assert.equal((await readConfigFile(path)).bytes.toString(), "abc");
});

test("sanitizes a filesystem failure during the last pre-staging path check", async (t) => {
  const { directory, path } = await fixture(t);
  let failing = false;
  const filesystem = {
    ...fs,
    lstat: async (...args) => {
      if (failing) throw new Error("private-sentinel");
      return fs.lstat(...args);
    },
  };
  await assert.rejects(
    atomicReplaceConfig(path, await readConfigFile(path), Buffer.from("next"), {
      filesystem,
      checkMetadata: async () => {
        failing = true;
      },
    }),
    (error) =>
      error.status === 503 &&
      !error.message.includes("private-sentinel") &&
      !JSON.stringify(error).includes("private-sentinel"),
  );
  assert.equal((await readConfigFile(path)).bytes.toString(), "abc");
  assert.deepEqual(await fs.readdir(directory), ["config.toml"]);
});

test(
  "never removes quarantine to make a configuration writable",
  { skip: process.platform !== "darwin" },
  async (t) => {
    const { path } = await fixture(t);
    const run = promisify(execFile);
    await run("/usr/bin/xattr", [
      "-w",
      "com.apple.quarantine",
      "0081;00000000;synthetic-test;",
      path,
    ]);
    await assert.rejects(
      atomicReplaceConfig(
        path,
        await readConfigFile(path),
        Buffer.from("next"),
      ),
      { status: 403 },
    );
    assert.equal((await readConfigFile(path)).bytes.toString(), "abc");
    assert.match(
      (await run("/usr/bin/xattr", [path])).stdout,
      /com\.apple\.quarantine/,
    );
  },
);

test("rejects directories, missing files, and FIFO endpoints without waiting on input", async (t) => {
  const { directory } = await fixture(t);
  await assert.rejects(readConfigFile(directory), { status: 403 });
  await assert.rejects(readConfigFile(join(directory, "missing")), {
    status: 404,
  });
  const fifo = join(directory, "fifo");
  await promisify(execFile)("/usr/bin/mkfifo", [fifo]);
  await assert.rejects(readConfigFile(fifo), { status: 403 });
});

import {createCapabilitySettings} from '../server/capability-settings.mjs';
import {authorizeCapability} from './capability-fixture.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { join } from "node:path";
import { copyFixture } from "./copy-fixture.mjs";
import { createAgentConfig } from "../server/agent-config.mjs";
import { inspectAgentInventory } from "../server/agent-inventory.mjs";
import { macOnly, PLATFORM_GUARD } from "./mac-only.mjs";

async function fixture(t, options = {}) {
  const f = await copyFixture();
  await authorizeCapability(f,'agent');
  const settings=createCapabilitySettings(f.repository);
  t.after(() => f.close());
  const path = join(f.home, "config.toml");
  const text =
    '# 中文\nmodel = "PRIVATE_SENTINEL"\n[tui]\nanimations = true # keep\n';
  await fs.writeFile(path, text, { mode: 0o600 });
  await fs.chmod(path, 0o600);
  const adapters = {
    inspectAgentInventory: (agentId) =>
      inspectAgentInventory(agentId, { home: f.user, environment: {} }),
  };
  let now = Date.now();
  const manager = createAgentConfig(f.repository, adapters, {
    clock: () => now,
    settings,
    ...options,
  });
  const input = {
    targetId: f.target.id,
    key: "tui.animations",
    value: false,
    revision: (await f.repository.read()).revision,
  };
  return {
    ...f,
    path,
    text,
    adapters,
    manager,
    settings,
    input,
    advance: (ms) => {
      now += ms;
    },
  };
}

test("Explicit configuration overview and preview expose only supported values and leave source unchanged", async (t) => {
  const f = await fixture(t);
  const view = await f.manager.inspect({ targetId: f.target.id });
  assert.equal(view.fields[0].value, true);
  assert.equal(view.adoption, "unverified");
  assert.equal(view.path, f.path);
  assert.equal(JSON.stringify(view).includes("PRIVATE_SENTINEL"), false);
  const preview = await f.manager.preview(f.input);
  assert.equal(preview.beforeValue, true);
  assert.equal(preview.afterValue, false);
  assert.equal(preview.operationId, preview.token);
  assert.equal(JSON.stringify(preview).includes("PRIVATE_SENTINEL"), false);
  assert.equal(await fs.readFile(f.path, "utf8"), f.text);
});

test("Expired previews, source drift and workspace changes cannot write", async (t) => {
  const f = await fixture(t);
  let p = await f.manager.preview(f.input);
  f.advance(300001);
  await assert.rejects(
    f.manager.apply({ token: p.token, revision: p.revision }),
    /过期/,
  );
  p = await f.manager.preview(f.input);
  await fs.appendFile(f.path, "# external\n");
  await assert.rejects(
    f.manager.apply({ token: p.token, revision: p.revision }),
    /已变化/,
  );
  assert.equal(await fs.readFile(f.path, "utf8"), f.text + "# external\n");
  p = await f.manager.preview(f.input);
  await f.repository.updateConnections((c) => ({ ...c }));
  await assert.rejects(
    f.manager.apply({ token: p.token, revision: p.revision }),
    /主库已变化/,
  );
  assert.equal(
    (await f.manager.history({ targetId: f.target.id })).items.length,
    0,
  );
});

test("Known previews rejected before execution explicitly report operationNotStarted", async (t) => {
  const f = await fixture(t);
  let preview = await f.manager.preview(f.input);
  f.advance(300001);
  await assert.rejects(
    f.manager.apply({ token: preview.token, revision: preview.revision }),
    (error) =>
      error.status === 409 &&
      error.operationNotStarted === true &&
      /过期/.test(error.message),
  );
  preview = await f.manager.preview(f.input);
  await fs.appendFile(f.path, "# changed externally\n");
  await assert.rejects(
    f.manager.apply({ token: preview.token, revision: preview.revision }),
    (error) =>
      error.status === 409 &&
      error.operationNotStarted === true &&
      /已变化/.test(error.message),
  );
  preview = await f.manager.preview(f.input);
  await f.repository.updateConnections((connections) => ({ ...connections }));
  await assert.rejects(
    f.manager.apply({ token: preview.token, revision: preview.revision }),
    (error) =>
      error.status === 409 &&
      error.operationNotStarted === true &&
      /主库已变化/.test(error.message),
  );
  assert.equal(
    (await f.manager.history({ targetId: f.target.id })).items.length,
    0,
  );
});

test("Unknown or restarted previews and unreadable existing operations cannot claim operationNotStarted", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.manager.apply({
      token: "00000000-0000-4000-8000-000000000099",
      revision: f.input.revision,
    }),
    (error) => error.status === 409 && error.operationNotStarted !== true,
  );
  const preview = await f.manager.preview(f.input);
  const restarted = createAgentConfig(f.repository, f.adapters,{settings:f.settings});
  await assert.rejects(
    restarted.apply({ token: preview.token, revision: preview.revision }),
    (error) => error.status === 409 && error.operationNotStarted !== true,
  );
  await f.manager.apply({ token: preview.token, revision: preview.revision });
  const after = await fs.readFile(f.path);
  await fs.writeFile(
    join(f.repository.directory, "config-operations", preview.token + ".json"),
    "PRIVATE_CORRUPT_JOURNAL",
  );
  await assert.rejects(
    f.manager.apply({ token: preview.token, revision: preview.revision }),
    (error) =>
      error.status === 503 &&
      error.operationNotStarted !== true &&
      !error.message.includes("PRIVATE_CORRUPT_JOURNAL"),
  );
  assert.deepEqual(await fs.readFile(f.path), after);
});

test("A known preview reports a sanitized preflight failure when the scope adapter fails", async (t) => {
  const f = await fixture(t);
  const preview = await f.manager.preview(f.input);
  f.adapters.inspectAgentInventory = async () => {
    throw Object.assign(new Error("PRIVATE_SCOPE_ERROR"), { status: 409 });
  };
  await assert.rejects(
    f.manager.apply({ token: preview.token, revision: preview.revision }),
    (error) =>
      error.status === 409 &&
      error.operationNotStarted === true &&
      !error.message.includes("PRIVATE_SCOPE_ERROR"),
  );
  assert.equal(await fs.readFile(f.path, "utf8"), f.text);
});

test("A preview expiring while its durable prepared record is saved never writes or replays the configuration", async (t) => {
  let advance = () => {},
    configPath,
    configWrites = 0;
  const filesystem = new Proxy(fs, {
    get(obj, key) {
      if (key === "rename")
        return async (from, to) => {
          const result = await obj.rename(from, to);
          if (to === configPath) configWrites++;
          if (
            to.includes("/config-operations/") &&
            to.endsWith(".json") &&
            !to.endsWith(".receipt.json")
          )
            advance(300001);
          return result;
        };
      return obj[key];
    },
  });
  const f = await fixture(t, { filesystem });
  advance = f.advance;
  configPath = f.path;
  const before = await fs.stat(f.path);
  const p = await f.manager.preview(f.input);
  const result = await f.manager.apply({
    token: p.token,
    revision: p.revision,
  });
  assert.equal(result.status, "matches_before");
  assert.equal(result.completedAt, null);
  assert.equal(Object.hasOwn(result, "operationNotStarted"), false);
  assert.equal(configWrites, 0);
  assert.equal(await fs.readFile(f.path, "utf8"), f.text);
  assert.equal((await fs.stat(f.path)).ino, before.ino);
  const reopened = createAgentConfig(f.repository, f.adapters,{settings:f.settings});
  assert.equal(
    (await reopened.apply({ token: p.token, revision: p.revision })).status,
    "matches_before",
  );
  assert.equal((await fs.stat(f.path)).ino, before.ino);
  assert.equal(
    (await reopened.history({ targetId: f.target.id })).items.length,
    1,
  );
});

test("A changed binding and external edits block restoring an old operation", macOnly(PLATFORM_GUARD), async (t) => {
  const f = await fixture(t);
  const p = await f.manager.preview(f.input);
  await f.manager.apply({ token: p.token, revision: p.revision });
  await fs.appendFile(f.path, "# external\n");
  assert.equal((await f.manager.check({ id: p.token })).status, "changed");
  await assert.rejects(
    f.manager.restorePreview({ id: p.token, revision: p.revision }),
    /不能恢复/,
  );
  await f.repository.updateConnections((c) => ({
    ...c,
    agentTargets: c.agentTargets.map((x) => ({
      ...x,
      bindingId: "new-generation",
    })),
  }));
  assert.equal((await f.manager.check({ id: p.token })).status, "unknown");
  assert.equal(
    (await f.manager.apply({ token: p.token, revision: p.revision })).status,
    "unknown",
  );
  assert.equal(
    await fs.readFile(f.path, "utf8"),
    f.text.replace("animations = true", "animations = false") + "# external\n",
  );
});

test("A group-only permission change is drift and blocks restoring identical configuration bytes", macOnly(PLATFORM_GUARD), async (t) => {
  const f = await fixture(t);
  const original = await fs.stat(f.path);
  const otherGroup = process
    .getgroups()
    .find((group) => group !== original.gid);
  if (otherGroup === undefined)
    return t.skip("No alternate current-user group");
  const preview = await f.manager.preview(f.input);
  assert.equal(
    (
      await f.manager.apply({
        token: preview.token,
        revision: preview.revision,
      })
    ).status,
    "matches_after",
  );
  const after = await fs.readFile(f.path);
  await fs.chown(f.path, original.uid, otherGroup);
  assert.deepEqual(await fs.readFile(f.path), after);
  assert.equal((await fs.stat(f.path)).mode & 0o777, original.mode & 0o777);
  assert.equal(
    (await f.manager.check({ id: preview.token })).status,
    "changed",
  );
  await assert.rejects(
    f.manager.restorePreview({ id: preview.token, revision: preview.revision }),
    { status: 409 },
  );
  assert.equal(
    (
      await f.manager.apply({
        token: preview.token,
        revision: preview.revision,
      })
    ).status,
    "changed",
  );
  assert.equal((await fs.stat(f.path)).gid, otherGroup);
  const row = JSON.parse(
    await fs.readFile(
      join(
        f.repository.directory,
        "config-operations",
        preview.token + ".json",
      ),
      "utf8",
    ),
  );
  assert.equal(row.uid, original.uid);
  assert.equal(row.gid, original.gid);
});

test("Replacing the actual Home inode with identical configuration bytes invalidates old previews and operations", macOnly(PLATFORM_GUARD), async (t) => {
  const f = await fixture(t);
  const applied = await f.manager.preview(f.input);
  assert.equal(
    (
      await f.manager.apply({
        token: applied.token,
        revision: applied.revision,
      })
    ).status,
    "matches_after",
  );
  const pending = await f.manager.preview({ ...f.input, value: true });
  const before = await fs.stat(f.home),
    bytes = await fs.readFile(f.path);
  await fs.rename(f.home, f.home + "-previous");
  await fs.mkdir(f.home, { mode: 0o700 });
  await fs.writeFile(f.path, bytes, { mode: 0o600 });
  assert.notEqual((await fs.stat(f.home)).ino, before.ino);
  await assert.rejects(
    f.manager.apply({ token: pending.token, revision: pending.revision }),
    /目录身份已变化/,
  );
  assert.equal(
    (await f.manager.check({ id: applied.token })).status,
    "unknown",
  );
  await assert.rejects(
    f.manager.restorePreview({ id: applied.token, revision: applied.revision }),
    /目录身份已变化/,
  );
  assert.deepEqual(await fs.readFile(f.path), bytes);
});

test("BOM, Unicode and CRLF survive applying and restoring an exact byte-offset patch", macOnly(PLATFORM_GUARD), async (t) => {
  const f = await fixture(t);
  const text =
    '\uFEFF# 中文😀\r\nmodel = "PRIVATE_SENTINEL_你好"\r\n[tui]\r\nanimations = true # 原注释\r\n';
  const original = Buffer.from(text);
  await fs.writeFile(f.path, original);
  const p = await f.manager.preview(f.input);
  const result = await f.manager.apply({
    token: p.token,
    revision: p.revision,
  });
  assert.equal(result.status, "matches_after");
  assert.deepEqual(
    await fs.readFile(f.path),
    Buffer.from(text.replace("animations = true", "animations = false")),
  );
  const restore = await f.manager.restorePreview({
    id: p.token,
    revision: p.revision,
  });
  assert.equal(
    (
      await f.manager.apply({
        token: restore.token,
        revision: restore.revision,
      })
    ).status,
    "matches_after",
  );
  assert.deepEqual(await fs.readFile(f.path), original);
  const journal = await fs.readFile(
    join(f.repository.directory, "config-operations", p.token + ".json"),
    "utf8",
  );
  assert.equal(journal.includes("PRIVATE_SENTINEL"), false);
  assert.equal(journal.includes("原注释"), false);
});

test("A missing original journal record invalidates a restore preview with a safe conflict", macOnly(PLATFORM_GUARD), async (t) => {
  const f = await fixture(t);
  const p = await f.manager.preview(f.input);
  await f.manager.apply({ token: p.token, revision: p.revision });
  const restore = await f.manager.restorePreview({
    id: p.token,
    revision: p.revision,
  });
  await fs.unlink(
    join(f.repository.directory, "config-operations", p.token + ".json"),
  );
  const before = await fs.stat(f.path);
  await assert.rejects(
    f.manager.apply({ token: restore.token, revision: restore.revision }),
    (error) =>
      error.status === 409 && /原配置操作记录|不能恢复/.test(error.message),
  );
  assert.equal((await fs.stat(f.path)).ino, before.ino);
  assert.equal(
    await fs.readFile(f.path, "utf8"),
    f.text.replace("animations = true", "animations = false"),
  );
});

test("A failed prepared-journal write never starts a configuration write or leaks the filesystem error", async (t) => {
  let configPath,
    configWrites = 0;
  const filesystem = new Proxy(fs, {
    get(obj, key) {
      if (key === "rename")
        return async (from, to) => {
          if (to === configPath) configWrites++;
          if (to.includes("/config-operations/") && to.endsWith(".json"))
            throw Object.assign(new Error("PRIVATE_PREPARE_ERROR"), {
              code: "EIO",
            });
          return obj.rename(from, to);
        };
      return obj[key];
    },
  });
  const f = await fixture(t, { filesystem });
  configPath = f.path;
  const before = await fs.stat(f.path),
    p = await f.manager.preview(f.input);
  await assert.rejects(
    f.manager.apply({ token: p.token, revision: p.revision }),
    (error) =>
      error.status === 503 &&
      error.operationNotStarted === true &&
      !error.message.includes("PRIVATE_PREPARE_ERROR"),
  );
  assert.equal(configWrites, 0);
  assert.equal((await fs.stat(f.path)).ino, before.ino);
  assert.equal(await fs.readFile(f.path, "utf8"), f.text);
  assert.equal(
    (await f.manager.history({ targetId: f.target.id })).items.length,
    0,
  );
  assert.equal((await f.repository.read()).revision, f.input.revision);
});

test("An ambiguous prepared-record save is checked after restart instead of replaying its write", async (t) => {
  let fail = true,
    configPath,
    configWrites = 0;
  const filesystem = new Proxy(fs, {
    get(obj, key) {
      if (key === "rename")
        return async (from, to) => {
          const result = await obj.rename(from, to);
          if (to === configPath) configWrites++;
          if (
            fail &&
            to.includes("/config-operations/") &&
            to.endsWith(".json")
          ) {
            fail = false;
            throw new Error("PRIVATE_PREPARE_AFTER_RENAME_ERROR");
          }
          return result;
        };
      return obj[key];
    },
  });
  const f = await fixture(t, { filesystem });
  configPath = f.path;
  const p = await f.manager.preview(f.input);
  await assert.rejects(
    f.manager.apply({ token: p.token, revision: p.revision }),
    { status: 503, operationNotStarted: true },
  );
  assert.equal(configWrites, 0);
  const reopened = createAgentConfig(f.repository, f.adapters,{settings:f.settings});
  const checked = await reopened.apply({
    token: p.token,
    revision: p.revision,
  });
  assert.equal(checked.status, "matches_before");
  assert.equal(checked.completedAt, null);
  assert.equal(await fs.readFile(f.path, "utf8"), f.text);
  assert.equal(
    (await reopened.history({ targetId: f.target.id })).items.length,
    1,
  );
});

test("Failure syncing the new journal directory's parent cannot reach a source-file write", async (t) => {
  let directory,
    configPath,
    sourceWrites = 0,
    parentSyncs = 0;
  const filesystem = new Proxy(fs, {
    get(target, key) {
      if (key === "open")
        return async (...args) => {
          const handle = await target.open(...args);
          if (args[0] === directory)
            handle.sync = async () => {
              parentSyncs++;
              throw new Error("PRIVATE_PARENT_SYNC_FAILURE");
            };
          return handle;
        };
      if (key === "rename")
        return async (...args) => {
          if (args[1] === configPath) sourceWrites++;
          return target.rename(...args);
        };
      return target[key];
    },
  });
  const f = await fixture(t, { filesystem });
  directory = f.repository.directory;
  configPath = f.path;
  const preview = await f.manager.preview(f.input),
    before = await fs.stat(f.path);
  await assert.rejects(
    f.manager.apply({ token: preview.token, revision: preview.revision }),
    (error) =>
      error.status === 503 &&
      error.operationNotStarted === true &&
      !error.message.includes("PRIVATE_PARENT_SYNC_FAILURE"),
  );
  assert.equal(parentSyncs, 1);
  assert.equal(sourceWrites, 0);
  assert.equal((await fs.stat(f.path)).ino, before.ino);
  assert.equal(await fs.readFile(f.path, "utf8"), f.text);
  assert.deepEqual(await fs.readdir(join(directory, "config-operations")), []);
});

test("A configuration rename followed by failure returns observed state without claiming operationNotStarted", macOnly(PLATFORM_GUARD), async (t) => {
  let configPath;
  const filesystem = new Proxy(fs, {
    get(target, key) {
      if (key === "rename")
        return async (...args) => {
          const result = await target.rename(...args);
          if (args[1] === configPath)
            throw new Error("PRIVATE_POST_RENAME_FAILURE");
          return result;
        };
      return target[key];
    },
  });
  const f = await fixture(t, { filesystem });
  configPath = f.path;
  const preview = await f.manager.preview(f.input);
  const result = await f.manager.apply({
    token: preview.token,
    revision: preview.revision,
  });
  assert.equal(result.status, "matches_after");
  assert.equal(result.completedAt, null);
  assert.equal(Object.hasOwn(result, "operationNotStarted"), false);
  assert.equal(
    JSON.stringify(result).includes("PRIVATE_POST_RENAME_FAILURE"),
    false,
  );
  const after = await fs.stat(f.path);
  const repeated = await f.manager.apply({
    token: preview.token,
    revision: preview.revision,
  });
  assert.equal(repeated.status, "matches_after");
  assert.equal(Object.hasOwn(repeated, "operationNotStarted"), false);
  assert.equal((await fs.stat(f.path)).ino, after.ino);
});

test("A saved Hermes target applies and restores YAML booleans while preserving unrelated bytes", macOnly(PLATFORM_GUARD), async (t) => {
  const f = await fixture(t);
  const home = join(f.user, ".hermes"),
    path = join(home, "config.yaml");
  await fs.mkdir(home, { mode: 0o700 });
  const text =
    "# 中文😀\napi_key: PRIVATE_SENTINEL\ndisplay:\n  bell_on_complete: yes # 原注释\n";
  await fs.writeFile(path, text, { mode: 0o600 });
  const inventory = await f.adapters.inspectAgentInventory("hermes");
  const selected = inventory.homes.find((item) => item.path === home);
  const target = {
    ...f.target,
    id: "target-hermes-config",
    agentId: "hermes",
    label: "隔离 Hermes",
    bindingId: "hermes-config-binding",
    program: { path: join(f.base, "hermes"), kind: "CLI" },
    home: { id: selected.id, path: home, label: selected.label },
  };
  const state = await f.repository.updateConnections((c) => ({
    ...c,
    agentTargets: [...c.agentTargets, target],
  }));
  const view = await f.manager.inspect({ targetId: target.id });
  assert.equal(
    view.fields.find((field) => field.key === "display.bell_on_complete").value,
    true,
  );
  assert.equal(JSON.stringify(view).includes("PRIVATE_SENTINEL"), false);
  const p = await f.manager.preview({
    targetId: target.id,
    key: "display.bell_on_complete",
    value: false,
    revision: state.revision,
  });
  assert.equal(
    (await f.manager.apply({ token: p.token, revision: p.revision })).status,
    "matches_after",
  );
  assert.equal(
    await fs.readFile(path, "utf8"),
    text.replace("bell_on_complete: yes", "bell_on_complete: false"),
  );
  const restore = await f.manager.restorePreview({
    id: p.token,
    revision: p.revision,
  });
  assert.equal(
    (
      await f.manager.apply({
        token: restore.token,
        revision: restore.revision,
      })
    ).status,
    "matches_after",
  );
  assert.equal(await fs.readFile(path, "utf8"), text);
  assert.equal(
    (await f.manager.check({ id: p.token })).status,
    "matches_before",
  );
  assert.equal(await fs.readFile(f.path, "utf8"), f.text);
});

test("Receipt failure after file write stays recoverable and repeating the operation does not rewrite", macOnly(PLATFORM_GUARD), async (t) => {
  let shouldFail = true;
  const filesystem = new Proxy(fs, {
    get(obj, key) {
      if (key === "rename")
        return async (from, to) => {
          if (shouldFail && to.endsWith(".receipt.json")) {
            shouldFail = false;
            throw Object.assign(new Error("PRIVATE_RECEIPT_ERROR"), {
              code: "EIO",
            });
          }
          return obj.rename(from, to);
        };
      return obj[key];
    },
  });
  const f = await fixture(t, { filesystem });
  const p = await f.manager.preview(f.input);
  const result = await f.manager.apply({
    token: p.token,
    revision: p.revision,
  });
  assert.equal(result.status, "matches_after");
  assert.equal(result.completedAt, null);
  assert.equal(Object.hasOwn(result, "operationNotStarted"), false);
  assert.equal(JSON.stringify(result).includes("PRIVATE_RECEIPT_ERROR"), false);
  const before = await fs.stat(f.path);
  const reopened = createAgentConfig(f.repository, f.adapters,{settings:f.settings});
  const repeated = await reopened.apply({
    token: p.token,
    revision: p.revision,
  });
  assert.equal(repeated.status, "matches_after");
  assert.equal(repeated.completedAt, null);
  assert.equal((await fs.stat(f.path)).ino, before.ino);
  const restore = await reopened.restorePreview({
    id: p.token,
    revision: p.revision,
  });
  assert.equal(
    (await reopened.apply({ token: restore.token, revision: restore.revision }))
      .status,
    "matches_after",
  );
  assert.equal(await fs.readFile(f.path, "utf8"), f.text);
});

test("A forged inverse patch cannot authorize editing another boolean", macOnly(PLATFORM_GUARD), async (t) => {
  const f = await fixture(t);
  const p = await f.manager.preview(f.input);
  await f.manager.apply({ token: p.token, revision: p.revision });
  const file = join(
    f.repository.directory,
    "config-operations",
    p.token + ".json",
  );
  const record = JSON.parse(await fs.readFile(file, "utf8"));
  record.key = "tui.show_tooltips";
  await fs.writeFile(file, JSON.stringify(record));
  await assert.rejects(
    f.manager.restorePreview({ id: p.token, revision: p.revision }),
    /恢复记录/,
  );
  assert.equal(
    await fs.readFile(f.path, "utf8"),
    f.text.replace("animations = true", "animations = false"),
  );
});

test("Restart recovery checks the same operation without replay; explicit restore returns original bytes", macOnly(PLATFORM_GUARD), async (t) => {
  const f = await fixture(t);
  const preview = await f.manager.preview({
    ...f.input,
    key: "tui.show_tooltips",
    value: false,
  });
  await f.manager.apply({ token: preview.token, revision: preview.revision });
  const reopened = createAgentConfig(f.repository, f.adapters,{settings:f.settings});
  assert.equal(
    (await reopened.apply({ token: preview.token, revision: preview.revision }))
      .status,
    "matches_after",
  );
  const undo = await reopened.restorePreview({
    id: preview.token,
    revision: preview.revision,
  });
  assert.equal(undo.afterValue, null);
  const restored = await reopened.apply({
    token: undo.token,
    revision: undo.revision,
  });
  assert.equal(restored.status, "matches_after");
  assert.equal(await fs.readFile(f.path, "utf8"), f.text);
  assert.equal(
    (await reopened.check({ id: preview.token })).status,
    "matches_before",
  );
  assert.equal(
    (await reopened.history({ targetId: f.target.id })).items.length,
    2,
  );
});

test("Confirmed apply persists a minimal journal, reads back the file and never increments the workspace revision", macOnly(PLATFORM_GUARD), async (t) => {
  const f = await fixture(t);
  const preview = await f.manager.preview(f.input);
  const result = await f.manager.apply({
    token: preview.token,
    revision: preview.revision,
  });
  assert.equal(result.status, "matches_after");
  assert.equal(result.adoption, "unverified");
  assert.ok(result.completedAt);
  assert.equal(
    await fs.readFile(f.path, "utf8"),
    f.text.replace("animations = true", "animations = false"),
  );
  assert.equal((await f.repository.read()).revision, f.input.revision);
  const repeat = await f.manager.apply({
    token: preview.token,
    revision: preview.revision,
  });
  assert.equal(repeat.id, result.id);
  assert.equal(
    (await f.manager.history({ targetId: f.target.id })).items.length,
    1,
  );
  for (const name of await fs.readdir(
    join(f.repository.directory, "config-operations"),
  )) {
    const raw = await fs.readFile(
      join(f.repository.directory, "config-operations", name),
      "utf8",
    );
    assert.equal(raw.includes("PRIVATE_SENTINEL"), false);
  }
});

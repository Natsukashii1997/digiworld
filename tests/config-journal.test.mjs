import test from "node:test";
import assert from "node:assert/strict";
import filesystem from "node:fs/promises";
import {
  mkdtemp,
  realpath,
  rm,
  readFile,
  readdir,
  writeFile,
  symlink,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createConfigJournal,
  validateConfigOperation,
} from "../server/config-journal.mjs";

export const sampleOperation = () => ({
  schema: 1,
  id: "00000000-0000-4000-8000-000000000001",
  kind: "apply",
  restores: null,
  targetId: "target-one",
  agentId: "codex",
  key: "tui.animations",
  beforeValue: true,
  afterValue: false,
  targetSignature: "a".repeat(64),
  homeSignature: "b".repeat(64),
  beforeHash: "c".repeat(64),
  afterHash: "d".repeat(64),
  mode: 0o600,
  uid: process.getuid(),
  gid: process.getgid(),
  patch: { offset: 30, before: "true", after: "false" },
  at: "2026-09-26T00:00:00.000Z",
});

test("Journal rejects foreign paths, private patch text, unsafe fields and corrupted records", async (t) => {
  for (const patch of [
    { path: "/private/file" },
    { key: "approval_policy" },
    { patch: { offset: 0, before: "# PRIVATE_SENTINEL", after: "true" } },
    { patch: { offset: -1, before: "true", after: "false" } },
    { agentId: "other" },
    { uid: -1 },
    { gid: 0x100000000 },
    { uid: undefined },
    { gid: 1.5 },
  ])
    assert.throws(() =>
      validateConfigOperation({ ...sampleOperation(), ...patch }),
    );
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "guiji-config-journal-")),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const journal = createConfigJournal(root),
    record = sampleOperation();
  await journal.prepare(record);
  await assert.rejects(journal.prepare(record), /已存在/);
  const file = join(root, "config-operations", record.id + ".json");
  await writeFile(file, '{"PRIVATE_SENTINEL":');
  await assert.rejects(
    journal.list(),
    (e) => !e.message.includes("PRIVATE_SENTINEL"),
  );
  await writeFile(file, JSON.stringify(record));
  await chmod(file, 0o644);
  await assert.rejects(journal.get(record.id));
  await chmod(file, 0o600);
  await symlink(
    file,
    join(
      root,
      "config-operations",
      "00000000-0000-4000-8000-000000000002.json",
    ),
  );
  await assert.rejects(journal.list());
});
test("Prepared operation survives reopen without storing full configuration; completed receipt is separate", async (t) => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "guiji-config-journal-")),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const journal = createConfigJournal(root),
    record = sampleOperation();
  assert.deepEqual(await journal.list(), []);
  await journal.prepare(record);
  assert.deepEqual(await createConfigJournal(root).get(record.id), {
    ...record,
    completedAt: null,
  });
  await journal.complete(record.id, "2026-09-26T00:01:00.000Z");
  const rows = await createConfigJournal(root).list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].completedAt, "2026-09-26T00:01:00.000Z");
  const files = await readdir(join(root, "config-operations"));
  assert.equal(files.length, 2);
  for (const file of files)
    assert.equal(
      (await readFile(join(root, "config-operations", file), "utf8")).includes(
        "api_key",
      ),
      false,
    );
});

test("Prepared records require a durable journal-directory entry before writing their own files", async (t) => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "guiji-config-journal-")),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  let parentSyncs = 0;
  const injected = new Proxy(filesystem, {
    get(target, key) {
      if (key === "open")
        return async (...args) => {
          const handle = await target.open(...args);
          if (args[0] === root)
            handle.sync = async () => {
              parentSyncs++;
              assert.equal(
                (
                  await filesystem.stat(join(root, "config-operations"))
                ).isDirectory(),
                true,
              );
              throw new Error("PRIVATE_PARENT_SYNC_ERROR");
            };
          return handle;
        };
      return target[key];
    },
  });
  const record = sampleOperation();
  await assert.rejects(
    createConfigJournal(root, { filesystem: injected }).prepare(record),
    (error) =>
      error.status === 503 &&
      !error.message.includes("PRIVATE_PARENT_SYNC_ERROR"),
  );
  assert.equal(parentSyncs, 1);
  assert.deepEqual(await readdir(join(root, "config-operations")), []);
  await assert.rejects(
    createConfigJournal(root, { filesystem: injected }).prepare(record),
    { status: 503 },
  );
  assert.equal(parentSyncs, 2);
  await createConfigJournal(root).prepare(record);
  assert.equal((await createConfigJournal(root).get(record.id)).id, record.id);
});

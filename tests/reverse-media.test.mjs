import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createReverseMedia } from "../server/reverse-media.mjs";
import { validateState, validateHistory } from "../server/schema.mjs";
import { seed } from "../src/store.js";
import {
  createSpecimen,
  prepareReplica,
  confirmReplica,
  replicaContext,
  currentVerification,
  validateRecipe,
  parseRecipeReply,
  specimenRows,
} from "../src/reverse-recipe.js";
const png = () =>
  new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3, 4,
  ]);
const recipe = () => ({
  version: 1,
  type: "TXT",
  blocks: ["structure", "tone", "techniques"].map((kind, i) => ({
    id: "b" + i,
    kind,
    label: kind,
    mark: "观察",
    text: "合成配方",
  })),
});
async function fixture(run) {
  const root = await fs.realpath(
    await fs.mkdtemp(join(tmpdir(), "guiji-reverse-media-")),
  );
  try {
    await run(root, createReverseMedia(root));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}
test("媒体内容寻址去重、权限、定位、SHA逐字校验；不创建目录直到上传", () =>
  fixture(async (root, media) => {
    await assert.rejects(fs.stat(join(root, "reverse-media")), {
      code: "ENOENT",
    });
    const m = await media.store({ data: png() });
    assert.equal(m.sha256, createHash("sha256").update(png()).digest("hex"));
    assert.equal(m.type, "image/png");
    assert.deepEqual(await media.store({ data: png() }), m);
    assert.deepEqual((await media.read(m)).data, png());
    assert.equal((await fs.stat(join(root, m.path))).nlink, 1);
    assert.equal((await fs.stat(join(root, m.path))).mode & 0o777, 0o600);
    assert.equal(
      (await media.locate({ media: [m] }))[0].localPath,
      join(root, m.path),
    );
    assert.deepEqual(await fs.readdir(join(root, "reverse-media")), [
      m.path.split("/")[1],
    ]);
  }));
test("媒体拒绝格式、超限、请求额外字段、越界、篡改、硬链接与符号链接", () =>
  fixture(async (root, media) => {
    await assert.rejects(media.store({ data: new Uint8Array(13) }));
    await assert.rejects(
      media.store({ data: new Uint8Array(8 * 1024 * 1024 + 1) }),
      { status: 413 },
    );
    await assert.rejects(media.store({ data: png(), path: "../x" }));
    const m = await media.store({ data: png() }),
      file = join(root, m.path);
    await assert.rejects(media.read({ ...m, path: "../image.png" }));
    await assert.rejects(media.read({ ...m, size: m.size + 1 }));
    await fs.link(file, join(root, "own-hardlink"));
    await assert.rejects(media.read(m));
    await fs.unlink(join(root, "own-hardlink"));
    const tampered = png();
    tampered[19] = 5;
    await fs.writeFile(file, tampered);
    await assert.rejects(media.read(m), /SHA256/);
    await fs.unlink(file);
    await fs.writeFile(join(root, "own-target"), png());
    await fs.symlink(join(root, "own-target"), file);
    await assert.rejects(media.read(m));
    await assert.rejects(media.store({ data: png() }));
  }));
test("媒体目录链接与读取期间替换身份拒绝", () =>
  fixture(async (root) => {
    const own = join(root, "own-folder");
    await fs.mkdir(own);
    await fs.symlink(own, join(root, "reverse-media"));
    await assert.rejects(createReverseMedia(root).store({ data: png() }));
    await fs.unlink(join(root, "reverse-media"));
    const service = createReverseMedia(root),
      m = await service.store({ data: png() });
    let replaced = false;
    const proxy = new Proxy(fs, {
      get(target, key) {
        if (key !== "open") return target[key];
        return async (path, ...rest) => {
          if (path === join(root, m.path) && !replaced) {
            replaced = true;
            await fs.rename(path, join(root, "old-own-image"));
            await fs.writeFile(path, png());
          }
          return target.open(path, ...rest);
        };
      },
    });
    await assert.rejects(
      createReverseMedia(root, { filesystem: proxy }).read(m),
      /身份变化/,
    );
  }));
test("新记录schema允许图片only并守护旧记录、新类型及不可改写确认历史", () => {
  const state = seed(),
    r = createSpecimen({ type: "TXT", text: "合成原文" });
  r.recipe = recipe();
  r.replicaDraft = prepareReplica(r, { text: "实际复刻" });
  state.reverseRecords = [r];
  validateState(state);
  const ready = {
    ...r.replicaDraft,
    scores: { structure: 5, tone: 5, techniques: 5 },
  };
  const next = confirmReplica(r, ready);
  delete next.replicaDraft;
  const completed = { ...state, reverseRecords: [next] };
  validateState(completed);
  validateHistory(state, completed);
  const forged = structuredClone(completed);
  forged.reverseRecords[0].replicas[0].total = 1;
  assert.throws(() => validateState(forged));
  const changed = structuredClone(completed);
  changed.reverseRecords[0].replicas[0].note = "重写历史";
  assert.throws(() => validateHistory(completed, changed));
  const bad = structuredClone(state);
  delete bad.reverseRecords[0].type;
  assert.throws(() => validateState(bad));
});
test("伪造passed、旧快照、新正文不放行；只改标记可继续认证；默认阈值显式保存", () => {
  const r = createSpecimen({ type: "TXT", text: "原件" });
  r.recipe = recipe();
  const a = {
    ...prepareReplica(r, { text: "实际复刻" }),
    scores: { structure: 5, tone: 5, techniques: 5 },
  };
  delete a.threshold;
  const saved = confirmReplica(r, a);
  assert.equal(saved.replicas[0].threshold, 90);
  const marked = structuredClone(saved);
  marked.recipe.blocks.forEach((b) => (b.mark = "已验证"));
  assert.ok(currentVerification(marked));
  for (const mutate of [
    (a) => delete a.confirmedAt,
    (a) => (a.scores.structure = 1),
    (a) => (a.total = 0),
    (a) => (a.artifact.text = ""),
    (a) => (a.threshold = 101),
  ]) {
    const bad = structuredClone(saved);
    mutate(bad.replicas[0]);
    assert.equal(currentVerification(bad), null);
  }
  const changed = structuredClone(r);
  changed.recipe.blocks[0].text = "改变";
  assert.throws(() => confirmReplica(changed, a), /已变化/);
  assert.equal(currentVerification({ ...saved, recipe: changed.recipe }), null);
  assert.throws(() => confirmReplica(saved, a), /已保存/);
  const without = {
    ...r,
    replicas: [{ conclusion: "passed", ...replicaContext(r) }],
  };
  assert.equal(currentVerification(without), null);
  assert.notEqual(
    specimenRows({ ...seed(), reverseRecords: [{ ...r, forge: {} }] })[0]
      .status,
    "已炼成",
  );
});
test("JSON唯一完整围栏、HTML唯一来源及嵌套块白名单", () => {
  const good = JSON.stringify({ recipe: recipe() }),
    block = "```json\n" + good + "\n```";
  for (const raw of [
    block + "\n```json\n{",
    block + "\n```JSON\n" + good + "\n```",
    block + "\n```txt\nx\n```",
  ])
    assert.equal(parseRecipeReply(raw, "TXT").ok, false);
  const bad = recipe();
  bad.blocks[0].cases = [{ id: "a", text: "错误类型" }];
  assert.throws(() => validateRecipe(bad));
  bad.blocks[0].cases = undefined;
  delete bad.blocks[0].cases;
  bad.blocks[0].html = "x";
  assert.throws(() => validateRecipe(bad));
  const tooLong = recipe();
  tooLong.blocks[0].text = "x".repeat(6001);
  assert.throws(() => validateRecipe(tooLong));
  assert.equal(
    parseRecipeReply(
      JSON.stringify({ recipe: { ...recipe(), html: "<p>x</p>" } }),
      "TXT",
    ).ok,
    false,
  );
});

test("新增记录不能夹带过期的passed确认；合法旧历史仍可初始化读取", () => {
  const previous = seed();
  previous.reverseRecords = [];
  const original = createSpecimen({ type: "TXT", text: "合成原件" });
  original.recipe = recipe();
  const candidate = confirmReplica(original, {
    ...prepareReplica(original, { text: "合成实际复刻" }),
    scores: { structure: 5, tone: 5, techniques: 5 },
  });
  candidate.recipe.blocks[0].text = "本次保存已改变配方";
  const next = { ...previous, reverseRecords: [candidate] };
  assert.equal(currentVerification(candidate), null);
  assert.doesNotThrow(() => validateState(next));
  assert.throws(() => validateHistory(previous, next), /已变化|当前/);
});

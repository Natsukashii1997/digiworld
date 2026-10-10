// 派单173切片B候选：复制到项目 tests/reverse-skill.test.mjs 后，由根代理在隔离运行器运行。
// 仅纯规则、内存 repository 与注入 reader；不读写文件，不启动服务、应用或网络。
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8, strToU8 } from "fflate";
import { fixtureRecipe } from "./reverse-v16-fixture.mjs";
import {
  createSpecimen,
  prepareReplica,
  confirmReplica,
  currentVerification,
  replicaContext,
  SCORE_FIELDS,
} from "../src/reverse-recipe.js";
import { generateRecipeSkill } from "../src/reverse-skill.js";
import {
  planSkillVersion,
  materializeSkillVersion,
} from "../src/skill-version.js";
import { makeAsset, current, revise, restore } from "../src/store.js";
import { buildSkillZip, fileBytes } from "../src/skill-package.js";
import { createSkillSources } from "../server/skill-sources.mjs";
import {
  buildWorkflowBundle,
  buildWorkflowDeploymentBundle,
} from "../src/workflow-references.js";

const LIMIT = 25 * 1024 * 1024;
const AT = "2026-10-05T04:12:00.000Z";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const clone = (value) => structuredClone(value);

function image(seed = 1) {
  // 单元规则的合成PNG字节；不用于浏览器图像解码。
  const data = Uint8Array.from([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    0,
    0,
    0,
    13,
    73,
    72,
    68,
    82,
    seed,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
  ]);
  const sha256 = sha(data);
  return {
    metadata: {
      path: `reverse-media/${sha256}.png`,
      size: data.length,
      sha256,
      type: "image/png",
    },
    data,
  };
}
const pictures = [image(1), image(2), image(3), image(4)];
const entry = (picture = pictures[0], path = "assets/reference.png") => ({
  path,
  file: picture.metadata.path,
  size: picture.metadata.size,
  sha256: picture.metadata.sha256,
  type: picture.metadata.type,
});

function memoryReader(pool = pictures) {
  const calls = [];
  const byFile = new Map(pool.map((p) => [p.metadata.path, p]));
  const readMedia = async (metadata) => {
    calls.push(clone(metadata));
    const source = byFile.get(metadata.path);
    if (!source) throw new Error("合成媒体不存在");
    assert.deepEqual(
      metadata,
      source.metadata,
      "reader只收到该固定引用的完整metadata",
    );
    return { ...clone(source.metadata), data: new Uint8Array(source.data) };
  };
  return { readMedia, calls };
}

function verifiedRecord(
  type = "TXT",
  { picturePool = pictures, withVariations = true } = {},
) {
  let record = createSpecimen({
    type,
    title: `${type}合成样本`,
    text: type === "IMG" ? "" : "原件\r\n逐字保留中文与变量{主题}。",
    media: type === "IMG" ? [clone(picturePool[0].metadata)] : [],
  });
  record.id = `synthetic-${type.toLowerCase()}`;
  record.createdAt = AT;
  record.recipe = fixtureRecipe(type);
  record.recipe.blocks[0].text += "\n针对{主题}保留结构与边界。";
  const draft = prepareReplica(record, {
    text: ["TXT", "FN"].includes(type) ? "实际复刻\r\n{主题}产物。" : "",
    html:
      type === "WEB"
        ? "<!doctype html>\r\n<html><body>合成固定复刻</body></html>\n"
        : "",
    media: type === "IMG" ? [clone(picturePool[1].metadata)] : [],
    threshold: 90,
  });
  draft.at = AT;
  draft.scores = Object.fromEntries(
    SCORE_FIELDS[type].map(([key]) => [key, 5]),
  );
  draft.checks = draft.checks.map((c) => ({ ...c, result: true }));
  record = confirmReplica(record, draft);
  if (type === "IMG" && withVariations)
    record.variations = [
      {
        id: "variation-1",
        at: AT,
        agentId: "codex",
        text: "",
        html: "",
        media: [clone(picturePool[2].metadata)],
      },
    ];
  assert.ok(currentVerification(record), "fixture必须经真实评分/确认规则达标");
  return record;
}

function versionWithMedia(mediaManifest = [entry()], extraFiles = []) {
  return {
    files: [
      {
        path: "SKILL.md",
        text: true,
        mode: 0o600,
        data: "---\nname: synthetic-skill\n---\n# 合成固定版本\n",
      },
      {
        path: "media-manifest.json",
        text: true,
        mode: 0o600,
        data: JSON.stringify({
          kind: "guiji-local-media/v1",
          entries: mediaManifest,
        }),
      },
      ...extraFiles,
    ],
    mediaManifest: clone(mediaManifest),
  };
}
const textAt = (generated, path) => {
  const f = generated.files.find((f) => f.path === path);
  assert.ok(f, `资源缺失：${path}`);
  assert.equal(f.text, true, `${path}应为纯文本资源`);
  return f.data;
};

test("四类型从真实人工达标配方生成Skill，入口/变量/资源/媒体清单可核对", () => {
  for (const type of ["TXT", "IMG", "WEB", "FN"]) {
    const record = verifiedRecord(type),
      before = clone(record);
    const generated = generateRecipeSkill(record);
    assert.equal(typeof generated.then, "undefined", "生成是同步纯规则");
    assert.equal(generated.title, `${record.title}配方`);
    const skill = textAt(generated, "SKILL.md");
    assert.equal(generated.content, skill);
    for (const name of [
      "用途",
      "使用步骤",
      "变量",
      "风格或行为说明",
      "证据边界",
    ])
      assert.ok(skill.includes(`## ${name}`), `${type}入口缺少${name}`);
    assert.ok(skill.includes("{主题}"));
    assert.ok(skill.includes(currentVerification(record).id));
    assert.ok(skill.includes("不证明目标 Agent 已采用"));
    assert.deepEqual(
      JSON.parse(textAt(generated, "recipe.json")),
      record.recipe,
    );
    const manifest = JSON.parse(textAt(generated, "media-manifest.json"));
    assert.equal(manifest.kind, "guiji-local-media/v1");
    assert.deepEqual(manifest.entries, generated.mediaManifest);
    assert.ok(
      generated.files.every((f) => f.text),
      "主库资源不嵌入媒体bytes",
    );
    for (const b of record.recipe.blocks)
      assert.ok(skill.includes(b.text), `${type}配方块正文不得遗漏`);
    if (type === "TXT") {
      assert.equal(
        textAt(generated, "examples/original.txt"),
        record.material.text,
      );
      assert.equal(
        textAt(generated, "examples/replica.txt"),
        currentVerification(record).artifact.text,
      );
      for (const kind of ["structure", "tone", "techniques"])
        textAt(generated, `blocks/${kind}.md`);
    }
    if (type === "IMG") {
      assert.deepEqual(
        JSON.parse(textAt(generated, "palette.json")),
        record.recipe.blocks.flatMap((b) => b.palette || []),
      );
      assert.equal(
        textAt(generated, "prompt.txt"),
        record.recipe.blocks.find((b) => b.kind === "prompt").text,
      );
      assert.equal(
        textAt(generated, "negative.txt"),
        record.recipe.blocks.find((b) => b.kind === "negative").text,
      );
      assert.deepEqual(
        generated.mediaManifest.map((m) => m.file).sort(),
        pictures
          .slice(0, 3)
          .map((p) => p.metadata.path)
          .sort(),
      );
      for (const m of generated.mediaManifest) {
        const source = pictures.find((p) => p.metadata.path === m.file);
        assert.deepEqual(
          { path: m.file, size: m.size, sha256: m.sha256, type: m.type },
          source.metadata,
        );
        assert.ok(skill.includes(m.path));
      }
    } else assert.deepEqual(generated.mediaManifest, []);
    if (type === "WEB") {
      assert.equal(
        textAt(generated, "replica/index.html"),
        currentVerification(record).artifact.html,
      );
      const tokens = record.recipe.blocks.flatMap((b) => b.tokens || []);
      assert.deepEqual(JSON.parse(textAt(generated, "tokens.json")), tokens);
      for (const t of tokens)
        assert.ok(
          textAt(generated, "tokens.css").includes(`${t.value}${t.unit}`),
        );
    }
    if (type === "FN") {
      assert.equal(
        textAt(generated, "replica/implementation.txt"),
        currentVerification(record).artifact.text,
      );
      for (const c of record.recipe.blocks.flatMap((b) => b.cases || []))
        assert.ok(textAt(generated, "acceptance.md").includes(c.text));
    }
    assert.deepEqual(record, before, "生成不能修改原件、配方、人工历史或变体");
  }
});

test("无当前人工达标、旧已验证/imports、伪造passed与快照漂移均禁止炼成", () => {
  const ready = verifiedRecord(),
    recipeOnly = clone(ready);
  recipeOnly.replicas = [];
  const pending = clone(recipeOnly);
  pending.replicaDraft = prepareReplica(pending, { text: "尚未完整打分" });
  pending.replicaDraft.scores = { structure: 5 };
  const failedDraft = prepareReplica(recipeOnly, { text: "实际低分复刻" });
  failedDraft.scores = { structure: 1, tone: 1, techniques: 1 };
  const failed = confirmReplica(recipeOnly, failedDraft);
  const forged = clone(recipeOnly);
  forged.replicas = [{ conclusion: "passed", ...replicaContext(forged) }];
  const staleRecipe = clone(ready);
  staleRecipe.recipe.blocks[0].text += "新规则";
  const staleOriginal = clone(ready);
  staleOriginal.material.text += "新原件";
  const staleMedia = verifiedRecord("IMG");
  staleMedia.referenceMedia = [clone(pictures[3].metadata)];
  const old = {
    id: "legacy-record",
    title: "旧报告",
    material: { text: "原文", url: "" },
    reply: JSON.stringify({
      report: {
        structure: [{ mark: "已验证", text: "旧观察" }],
        techniques: [],
        reusable: [],
      },
      candidates: [],
    }),
    imports: [{ kind: "prompt", assetId: "old", versionId: "v1" }],
  };
  for (const record of [
    createSpecimen({ text: "尚未逆推" }),
    recipeOnly,
    pending,
    failed,
    forged,
    staleRecipe,
    staleOriginal,
    staleMedia,
    old,
  ]) {
    const before = clone(record);
    assert.throws(() => generateRecipeSkill(record), /达标|证据/);
    assert.deepEqual(record, before, "拒绝不能改变原记录");
  }
  const marked = clone(ready);
  marked.recipe.blocks.forEach((b) => {
    b.mark = "已验证";
  });
  assert.doesNotThrow(
    () => generateRecipeSkill(marked),
    "仅晋升合法标记保留当前证据",
  );
});

test("计划不读取媒体；同步预算含实体；展开返回原始二进制并且不改版本", async () => {
  const version = versionWithMedia(),
    before = clone(version),
    reader = memoryReader();
  const plan = planSkillVersion(version);
  assert.equal(plan.root, "");
  assert.deepEqual(plan.media, version.mediaManifest);
  assert.equal(
    plan.fileCount,
    version.files.length + version.mediaManifest.length,
  );
  assert.equal(
    plan.byteLength,
    version.files.reduce((n, f) => n + fileBytes(f).length, 0) +
      pictures[0].data.length,
  );
  assert.deepEqual(reader.calls, []);
  const materialized = await materializeSkillVersion(version, {
    readMedia: reader.readMedia,
  });
  assert.equal(materialized.mediaCount, 1);
  assert.equal(materialized.byteLength, plan.byteLength);
  const file = materialized.files.find(
    (f) => f.path === version.mediaManifest[0].path,
  );
  assert.ok(file);
  assert.equal(file.text, false);
  assert.equal(file.mode, 0o600);
  assert.deepEqual(file.data, pictures[0].data);
  assert.equal(sha(file.data), version.mediaManifest[0].sha256);
  assert.deepEqual(reader.calls, [pictures[0].metadata]);
  assert.deepEqual(version, before);
  const nested = {
    ...version,
    files: version.files.map((f) => ({ ...f, path: "tool/" + f.path })),
  };
  const expanded = await materializeSkillVersion(nested, {
    readMedia: memoryReader().readMedia,
  });
  assert.ok(
    expanded.files.some(
      (f) => f.path === "tool/" + version.mediaManifest[0].path,
    ),
    "包内资源必须跟随唯一入口根",
  );
});

test("旧无媒体版本不需要reader；有媒体无reader、reader缺失/SHA篡改/metadata不符拒绝整包", async () => {
  const legacy = versionWithMedia([]);
  delete legacy.mediaManifest;
  assert.deepEqual((await materializeSkillVersion(legacy)).files, legacy.files);
  const version = versionWithMedia(),
    before = clone(version);
  await assert.rejects(materializeSkillVersion(version), /媒体|缺图/);
  await assert.rejects(
    materializeSkillVersion(version, {
      readMedia: async () => {
        throw new Error("合成媒体不存在");
      },
    }),
    /不存在/,
  );
  for (const change of [
    (result) => {
      result.path = pictures[1].metadata.path;
    },
    (result) => {
      result.size++;
    },
    (result) => {
      result.sha256 = pictures[1].metadata.sha256;
    },
    (result) => {
      result.type = "image/jpeg";
    },
    (result) => {
      result.data = result.data.slice(0, -1);
    },
    (result) => {
      result.data = Array.from(result.data);
    },
  ])
    await assert.rejects(
      materializeSkillVersion(version, {
        readMedia: async (metadata) => {
          const result = {
            ...metadata,
            data: new Uint8Array(pictures[0].data),
          };
          change(result);
          return result;
        },
      }),
      /媒体|清单/,
    );
  await assert.rejects(
    materializeSkillVersion(version, {
      readMedia: async (metadata) => {
        const data = new Uint8Array(pictures[0].data);
        data[data.length - 1] ^= 1;
        return { ...metadata, data };
      },
    }),
    /SHA256/,
  );
  assert.deepEqual(version, before);
});

test("reader返回bytes的后续改变不会改变已展开的固定包", async () => {
  let returned;
  const out = await materializeSkillVersion(versionWithMedia(), {
    readMedia: async (metadata) => {
      returned = new Uint8Array(pictures[0].data);
      return { ...metadata, data: returned };
    },
  });
  returned[returned.length - 1] ^= 1;
  assert.deepEqual(
    out.files.find((f) => f.path === "assets/reference.png").data,
    pictures[0].data,
  );
});

test("媒体清单字段/路径、files冲突、目录冲突、大小写及NFC冲突在计划阶段阻断", () => {
  const valid = versionWithMedia();
  const cases = [
    { ...valid, mediaManifest: {} },
    { ...valid, mediaManifest: [{ ...entry(), extra: true }] },
    { ...valid, mediaManifest: [{ ...entry(), file: "../private.png" }] },
    { ...valid, mediaManifest: [{ ...entry(), size: 8 * 1024 * 1024 + 1 }] },
    { ...valid, mediaManifest: [{ ...entry(), sha256: "b".repeat(64) }] },
    { ...valid, mediaManifest: [{ ...entry(), type: "image/jpeg" }] },
    ...[
      "../escape.png",
      "/tmp/private.png",
      "assets\\private.png",
      "assets/./image.png",
    ].map((path) => ({ ...valid, mediaManifest: [entry(pictures[0], path)] })),
    versionWithMedia([entry(), entry()]),
    versionWithMedia(
      [entry()],
      [{ path: "assets/reference.png", text: true, data: "原文件" }],
    ),
    versionWithMedia(
      [entry()],
      [{ path: "assets", text: true, data: "文件不能成为父目录" }],
    ),
    versionWithMedia(
      [entry(pictures[0], "ASSETS/reference.png")],
      [{ path: "assets/reference.png", text: true, data: "大小写冲突" }],
    ),
    versionWithMedia(
      [entry(pictures[0], "assets/café.png")],
      [{ path: "assets/cafe\u0301.png", text: true, data: "Unicode等价冲突" }],
    ),
    versionWithMedia(
      [entry(pictures[0], "assets/cafe\u0301/image.png")],
      [
        {
          path: "assets/café/info.txt",
          text: true,
          data: "父目录Unicode等价冲突",
        },
      ],
    ),
  ];
  for (const version of cases) assert.throws(() => planSkillVersion(version));
});

test("完整Skill的300项与25MiB含媒体：边界接受，超过边界拒绝", () => {
  const extra = Array.from({ length: 297 }, (_, i) => ({
    path: `notes/n-${i}.txt`,
    text: true,
    data: "x",
  }));
  const countBoundary = versionWithMedia([entry()], extra);
  assert.equal(planSkillVersion(countBoundary).fileCount, 300);
  assert.throws(
    () =>
      planSkillVersion({
        ...countBoundary,
        files: [
          ...countBoundary.files,
          { path: "notes/extra.txt", text: true, data: "x" },
        ],
      }),
    /300|限制/,
  );
  const base = versionWithMedia(),
    initial = base.files.reduce((n, f) => n + fileBytes(f).length, 0);
  const budgetBoundary = {
    ...base,
    files: [
      ...base.files,
      {
        path: "assets/filler.bin",
        text: false,
        data: new Uint8Array(LIMIT - initial - pictures[0].data.length),
      },
    ],
  };
  assert.equal(planSkillVersion(budgetBoundary).byteLength, LIMIT);
  assert.throws(
    () =>
      planSkillVersion({
        ...budgetBoundary,
        mediaManifest: [
          ...budgetBoundary.mediaManifest,
          entry(pictures[1], "assets/over.png"),
        ],
      }),
    /25|限制/,
  );
});

test("展开后的固定Skill ZIP实际包含全部参照/复刻/变体图片并可逐字校验", async () => {
  const generated = generateRecipeSkill(verifiedRecord("IMG")),
    before = clone(generated);
  const materialized = await materializeSkillVersion(generated, {
    readMedia: memoryReader().readMedia,
  });
  const zip = unzipSync(buildSkillZip(materialized.files));
  assert.deepEqual(
    Object.keys(zip).sort(),
    materialized.files.map((f) => f.path + (f.directory ? "/" : "")).sort(),
  );
  for (const m of generated.mediaManifest) {
    assert.deepEqual(
      zip[m.path],
      pictures.find((p) => p.metadata.path === m.file).data,
    );
    assert.equal(zip[m.path].length, m.size);
    assert.equal(sha(zip[m.path]), m.sha256);
  }
  assert.deepEqual(generated, before);
});

test("makeAsset/revise/restore保存固定版本媒体；恢复旧无媒体版本不继承新图", () => {
  const first = generateRecipeSkill(verifiedRecord("IMG"));
  const asset = makeAsset({ ...first, type: "Skill" }),
    v1 = current(asset),
    original = clone(asset);
  assert.deepEqual(v1.mediaManifest, first.mediaManifest);
  const second = generateRecipeSkill(
    verifiedRecord("IMG", {
      picturePool: [pictures[3], pictures[0], pictures[1]],
    }),
  );
  const revised = revise(asset, second),
    v2 = current(revised);
  assert.deepEqual(v2.mediaManifest, second.mediaManifest);
  assert.deepEqual(revised.versions[0], original.versions[0]);
  const restored = restore(revised, v1.id);
  assert.notEqual(current(restored).id, v1.id);
  assert.equal(current(restored).restoredFrom, v1.id);
  assert.deepEqual(current(restored).mediaManifest, v1.mediaManifest);
  assert.deepEqual(restored.versions.slice(0, 2), revised.versions);
  assert.deepEqual(asset, original);
  const legacy = makeAsset({
    type: "Skill",
    title: "旧文字Skill",
    files: versionWithMedia([]).files,
  });
  const legacyId = current(legacy).id;
  const restoredLegacy = restore(revise(legacy, first), legacyId);
  assert.deepEqual(
    current(restoredLegacy).mediaManifest ?? [],
    [],
    "恢复无媒体旧版不可继承当前图片",
  );
});

test("derive调用真实固定版本派生规则，内存repository保留独立mediaManifest与来源历史", async () => {
  const source1 = makeAsset({
      ...generateRecipeSkill(verifiedRecord("IMG")),
      type: "Skill",
    }),
    v1 = current(source1);
  const source = revise(
    source1,
    generateRecipeSkill(
      verifiedRecord("IMG", {
        picturePool: [pictures[3], pictures[0], pictures[1]],
      }),
    ),
  );
  let state = { revision: 1, assets: [clone(source)] };
  const repository = {
    read: async () => clone(state),
    updateAssets: async (update, { expectedRevision } = {}) => {
      assert.equal(expectedRevision, state.revision);
      const assets = await update(clone(state.assets));
      state = { ...state, revision: state.revision + 1, assets };
      return clone(state);
    },
  };
  const before = clone(state),
    service = createSkillSources(repository);
  const result = await service.derive({
    assetId: source.id,
    versionId: v1.id,
    revision: 1,
    title: "合成个人派生",
  });
  const derived = result.state.assets.find((a) => a.id === result.assetId);
  assert.notEqual(derived.id, source.id);
  assert.notEqual(current(derived).id, v1.id);
  assert.deepEqual(derived.origin, {
    kind: "derived",
    assetId: source.id,
    versionId: v1.id,
  });
  assert.deepEqual(current(derived).files, v1.files);
  assert.deepEqual(current(derived).mediaManifest, v1.mediaManifest);
  assert.deepEqual(
    result.state.assets.find((a) => a.id === source.id),
    before.assets[0],
  );
  assert.notDeepEqual(
    current(derived).mediaManifest,
    current(source).mediaManifest,
    "不可派生最新版本替代指定旧版",
  );
  current(derived).mediaManifest[0].path = "assets/independent.png";
  assert.deepEqual(
    state.assets.find((a) => a.id === source.id),
    before.assets[0],
    "派生对象后续改动不能改变来源",
  );
});

function workflowScene() {
  const generated = generateRecipeSkill(verifiedRecord("IMG"));
  const skill1 = makeAsset({ ...generated, type: "Skill" }),
    v1 = current(skill1);
  const skill = revise(
    skill1,
    generateRecipeSkill(
      verifiedRecord("IMG", {
        picturePool: [pictures[3], pictures[0], pictures[1]],
      }),
    ),
  );
  const prompt = makeAsset({
    type: "Prompt",
    title: "原字节提示词",
    content: "逐字保留\r\n中文🚀\n",
  });
  const workflow = makeAsset({
    type: "Workflow",
    title: "含图工作流",
    content: "先复刻，再人工验收。",
    references: [
      { assetId: skill.id, versionId: v1.id },
      { assetId: prompt.id, versionId: current(prompt).id },
    ],
  });
  return {
    generated,
    skill,
    v1,
    prompt,
    workflow,
    assets: [skill, prompt, workflow],
  };
}

test("工作流资料包内嵌固定版本Skill ZIP含图片，外层manifest哈希匹配", async () => {
  const s = workflowScene(),
    before = clone(s.assets),
    reader = memoryReader();
  const zip = unzipSync(
    await buildWorkflowBundle(s.workflow, current(s.workflow), s.assets, {
      readMedia: reader.readMedia,
    }),
  );
  const skillPath = `refs/skills/${s.skill.id}/${s.v1.id}.zip`,
    images = unzipSync(zip[skillPath]);
  for (const m of s.v1.mediaManifest) {
    assert.deepEqual(
      images[m.path],
      pictures.find((p) => p.metadata.path === m.file).data,
    );
    assert.equal(sha(images[m.path]), m.sha256);
  }
  assert.deepEqual(
    zip[`refs/prompts/${s.prompt.id}/${current(s.prompt).id}.md`],
    strToU8(current(s.prompt).content),
  );
  const manifest = JSON.parse(strFromU8(zip["manifest.json"]));
  assert.equal(manifest.references[0].versionId, s.v1.id);
  assert.equal(manifest.references[0].sha256, sha(zip[skillPath]));
  assert.deepEqual(s.assets, before);
});

test("工作流部署包展开全部固定图片，逐图大小/哈希清单对应实际bytes", async () => {
  const s = workflowScene(),
    before = clone(s.assets),
    reader = memoryReader();
  const zip = unzipSync(
    await buildWorkflowDeploymentBundle(
      s.workflow,
      current(s.workflow),
      s.assets,
      { readMedia: reader.readMedia },
    ),
  );
  const root = `workflow-${s.workflow.id}-${current(s.workflow).id}`;
  const manifest = JSON.parse(strFromU8(zip[`${root}/manifest.json`]));
  const prefix = `assets/skills/${s.skill.id}/${s.v1.id}/`;
  for (const m of s.v1.mediaManifest) {
    const path = prefix + m.path,
      data = zip[`${root}/${path}`];
    assert.deepEqual(
      data,
      pictures.find((p) => p.metadata.path === m.file).data,
    );
    const row = manifest.files.find((f) => f.path === path);
    assert.ok(row);
    assert.equal(row.size, m.size);
    assert.equal(row.sha256, m.sha256);
  }
  assert.equal(manifest.references[0].versionId, s.v1.id);
  assert.deepEqual(s.assets, before);
});

test("两种工作流包缺reader/缺图/篡改均整体拒绝，不能返回文字成功包", async () => {
  const s = workflowScene(),
    before = clone(s.assets);
  for (const build of [buildWorkflowBundle, buildWorkflowDeploymentBundle]) {
    await assert.rejects(
      build(s.workflow, current(s.workflow), s.assets),
      /媒体|缺图/,
    );
    await assert.rejects(
      build(s.workflow, current(s.workflow), s.assets, {
        readMedia: async () => {
          throw new Error("合成媒体不存在");
        },
      }),
      /不存在/,
    );
    await assert.rejects(
      build(s.workflow, current(s.workflow), s.assets, {
        readMedia: async (metadata) => {
          const data = new Uint8Array(
            pictures.find((p) => p.metadata.path === metadata.path).data,
          );
          data[data.length - 1] ^= 1;
          return { ...metadata, data };
        },
      }),
      /SHA256/,
    );
  }
  assert.deepEqual(s.assets, before);
});

test("两种工作流包总预算计算媒体实体，超过25MiB在reader调用前阻断", async () => {
  const declared = {
    path: `reverse-media/${"a".repeat(64)}.png`,
    size: 8 * 1024 * 1024,
    sha256: "a".repeat(64),
    type: "image/png",
  };
  const skills = Array.from({ length: 4 }, (_, i) =>
    makeAsset({
      type: "Skill",
      title: `预算合成${i}`,
      ...versionWithMedia([
        {
          path: "assets/image.png",
          file: declared.path,
          size: declared.size,
          sha256: declared.sha256,
          type: declared.type,
        },
      ]),
    }),
  );
  const workflow = makeAsset({
    type: "Workflow",
    title: "超过实体预算",
    content: "合成流程",
    references: skills.map((a) => ({
      assetId: a.id,
      versionId: current(a).id,
    })),
  });
  for (const build of [buildWorkflowBundle, buildWorkflowDeploymentBundle]) {
    let reads = 0;
    await assert.rejects(
      build(workflow, current(workflow), [...skills, workflow], {
        readMedia: async () => {
          reads++;
          throw new Error("预算检查前不得读取图片");
        },
      }),
      /25|超|限制/,
    );
    assert.equal(reads, 0);
  }
});

test("非空媒体版本的文本清单不可删除或漂移，更新ZIP不能绕过raw缺图守护", () => {
  const v = versionWithMedia();
  const missing = {
    ...v,
    files: v.files.filter((f) => f.path !== "media-manifest.json"),
  };
  assert.throws(() => planSkillVersion(missing), /清单/);
  const drift = clone(v);
  drift.files.find((f) => f.path === "media-manifest.json").data =
    JSON.stringify({ kind: "guiji-local-media/v1", entries: [] });
  assert.throws(() => planSkillVersion(drift), /清单/);
  const a = makeAsset({ type: "Skill", title: "合成", ...v });
  const updated = revise(a, { files: missing.files });
  assert.throws(() => planSkillVersion(current(updated)), /清单/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8, strToU8 } from "fflate";
import { makeAsset, revise, current } from "../src/store.js";
import { readSkillZip } from "../src/skill-package.js";
import {
  resolveReferences,
  workflowText,
  buildWorkflowBundle,
  referencedDemoIds,
} from "../src/workflow-references.js";

const prompt = (content = "保留原文\r\n不要改写") =>
  makeAsset({ type: "Prompt", title: "问题定义", content });
const flow = (references = []) => {
  const asset = makeAsset({
    type: "Workflow",
    title: "交付流程",
    content: "先确认，再实施。",
  });
  current(asset).references = references;
  return asset;
};
const ref = (asset, version = current(asset)) => ({
  assetId: asset.id,
  versionId: version.id,
});

test("工作流引用按固定版本和原顺序解析，上游更新不漂移", () => {
  const a = prompt("旧原文"),
    b = prompt("第二项");
  const before = current(a);
  const updated = revise(a, { title: "新版名称", content: "新原文" });
  const version = current(flow([ref(b), ref(a, before)]));
  const resolved = resolveReferences(version, [updated, b]);
  assert.deepEqual(
    resolved.map(({ assetId, versionId, number, status, usable }) => ({
      assetId,
      versionId,
      number,
      status,
      usable,
    })),
    [
      { ...ref(b), number: 1, status: "current", usable: true },
      { ...ref(a, before), number: 1, status: "updated", usable: true },
    ],
  );
  assert.equal(resolved[1].version.content, "旧原文");
  assert.equal(resolved[1].asset.id, a.id);
  assert.deepEqual(resolveReferences({ content: "旧流程" }, [a]), []);
});

test("完整流程资料包保存 Prompt 原字节、Skill 全部文件权限及固定版本清单", async () => {
  const p = prompt("原始 Prompt\r\n🚀\r\n");
  const files = [
    {
      path: "tool/SKILL.md",
      data: "---\nname: tool\n---\n# Skill\n",
      text: true,
      mode: 0o644,
    },
    {
      path: "tool/.hidden",
      data: new Uint8Array([0, 255, 128, 1]),
      text: false,
      mode: 0o600,
    },
    {
      path: "tool/scripts/run.sh",
      data: "#!/bin/sh\necho ready\n",
      text: true,
      mode: 0o755,
    },
    {
      path: "tool/empty",
      data: new Uint8Array(),
      text: false,
      directory: true,
      mode: 0o700,
    },
  ];
  const s = makeAsset({ type: "Skill", title: "完整 Skill", files });
  const workflow = flow([ref(s), ref(p)]);
  const nextPrompt = revise(p, { content: "上游新文本" });
  const bytes = await buildWorkflowBundle(workflow, current(workflow), [
    s,
    nextPrompt,
    workflow,
  ]);
  assert.ok(bytes instanceof Uint8Array);
  const entries = unzipSync(bytes),
    manifest = JSON.parse(strFromU8(entries["manifest.json"]));
  const skillPath = `refs/skills/${s.id}/${current(s).id}.zip`;
  const promptPath = `refs/prompts/${p.id}/${current(p).id}.md`;
  assert.deepEqual(
    Object.keys(entries).sort(),
    ["workflow.md", "manifest.json", skillPath, promptPath].sort(),
  );
  assert.deepEqual(entries[promptPath], strToU8(current(p).content));
  assert.equal(
    strFromU8(entries["workflow.md"]),
    workflowText(current(workflow), [s, nextPrompt]),
  );
  assert.deepEqual(
    manifest.references.map(({ type, assetId, versionId, number, file }) => ({
      type,
      assetId,
      versionId,
      number,
      file,
    })),
    [
      { type: "Skill", ...ref(s), number: 1, file: skillPath },
      { type: "Prompt", ...ref(p), number: 1, file: promptPath },
    ],
  );
  assert.equal(manifest.workflow.assetId, workflow.id);
  assert.equal(manifest.workflow.versionId, current(workflow).id);
  assert.equal(manifest.workflow.type, "Workflow");
  assert.equal(manifest.workflow.number, 1);
  assert.equal(manifest.workflow.file, "workflow.md");
  for (const record of [manifest.workflow, ...manifest.references])
    assert.equal(
      record.sha256,
      createHash("sha256").update(entries[record.file]).digest("hex"),
    );
  const decoded = readSkillZip(entries[skillPath]).files;
  for (const expected of files) {
    const actual = decoded.find((file) => file.path === expected.path);
    assert.deepEqual(
      actual.data,
      expected.text ? strToU8(expected.data) : expected.data,
    );
    assert.equal(actual.mode, expected.mode);
    assert.equal(Boolean(actual.directory), Boolean(expected.directory));
  }
  assert.equal(current(workflow).references[1].versionId, current(p).id);
});

test("缺失优先于归档，归档与非 Skill/Prompt 不可交付", () => {
  const a = prompt(),
    nested = flow();
  const archived = { ...a, archived: true };
  const refs = [
    { assetId: "deleted", versionId: "deleted-v1" },
    { assetId: a.id, versionId: "missing-v1" },
    ref(archived),
    ref(nested),
  ];
  const resolved = resolveReferences(current(flow(refs)), [archived, nested]);
  assert.deepEqual(
    resolved.map(({ status, usable }) => ({ status, usable })),
    [
      { status: "missing-asset", usable: false },
      { status: "missing-version", usable: false },
      { status: "archived", usable: false },
      { status: "invalid-type", usable: false },
    ],
  );
  assert.equal(resolveReferences(current(flow([ref(a)])), [a])[0].usable, true);
});

test("可复制流程包含固定引用标识、Prompt 原文和需附送的 Skill 包路径", () => {
  const p = prompt("# 输入\r\n```\n逐字保留🚀\n```\r\n");
  const s = makeAsset({
    type: "Skill",
    title: "检查",
    files: [{ path: "SKILL.md", text: true, data: "# 检查" }],
  });
  const workflow = flow([ref(p), ref(s)]);
  const text = workflowText(current(workflow), [p, s]);
  assert.ok(text.includes("先确认，再实施。"));
  assert.ok(text.includes(current(p).content));
  assert.ok(text.includes(p.id));
  assert.ok(text.includes(current(p).id));
  assert.ok(text.includes("v1.0"));
  assert.ok(text.includes(`refs/skills/${s.id}/${current(s).id}.zip`));
  assert.match(text, /需.*附送.*ZIP/);
  assert.ok(text.indexOf(p.id) < text.indexOf(s.id));
  assert.equal(workflowText({ content: "原始流程\r\n" }, []), "原始流程\r\n");
  for (const [asset, reference, message] of [
    [{ ...p, archived: true }, ref(p), /已归档/],
    [p, { assetId: p.id, versionId: "absent" }, /版本.*缺失/],
    [p, { assetId: "absent", versionId: "absent" }, /资产.*缺失/],
    [workflow, ref(workflow), /仅.*Skill.*Prompt/],
  ])
    assert.throws(
      () => workflowText(current(flow([reference])), [asset]),
      message,
    );
});

test("资料包仅使用合法固定 ID 建路径，并拒绝失效或越界的工作流输入", async () => {
  const p = prompt(),
    workflow = flow([ref(p)]);
  current(p).title = "../evil/" + "长标题".repeat(400);
  current(workflow).title = "../工作流\\";
  const bundle = unzipSync(
    await buildWorkflowBundle(workflow, current(workflow), [p]),
  );
  assert.deepEqual(
    Object.keys(bundle).sort(),
    [
      "manifest.json",
      "workflow.md",
      `refs/prompts/${p.id}/${current(p).id}.md`,
    ].sort(),
  );
  assert.equal(
    JSON.parse(strFromU8(bundle["manifest.json"])).references[0].title,
    current(p).title,
  );
  const empty = flow();
  assert.equal(
    strFromU8(
      unzipSync(await buildWorkflowBundle(empty, current(empty), []))[
        "workflow.md"
      ],
    ),
    "先确认，再实施。",
  );
  await assert.rejects(
    buildWorkflowBundle({ ...workflow, archived: true }, current(workflow), [
      p,
    ]),
    /工作流.*归档/,
  );
  await assert.rejects(buildWorkflowBundle(p, current(p), [p]), /工作流/);
  await assert.rejects(
    buildWorkflowBundle(workflow, { ...current(workflow), id: "missing" }, [p]),
    /工作流版本.*缺失/,
  );
  await assert.rejects(
    buildWorkflowBundle(workflow, current(workflow), [
      { ...p, archived: true },
    ]),
    /已归档/,
  );
  await assert.rejects(
    buildWorkflowBundle(workflow, current(workflow), []),
    /资产.*缺失/,
  );
  const malicious = { ...p, id: "../outside" };
  const invalid = flow([ref(malicious)]);
  await assert.rejects(
    buildWorkflowBundle(invalid, current(invalid), [malicious]),
    /ID.*无效/,
  );
  assert.throws(() => workflowText(current(invalid), [malicious]), /ID.*无效/);
  const duplicate = flow([ref(p), ref(p)]);
  await assert.rejects(
    buildWorkflowBundle(duplicate, current(duplicate), [p]),
    /重复/,
  );
  const tooMany = flow(
    Array.from({ length: 51 }, (_, n) => ({
      assetId: `a${n}`,
      versionId: `v${n}`,
    })),
  );
  await assert.rejects(
    buildWorkflowBundle(tooMany, current(tooMany), []),
    /50/,
  );
});

test("清理示例保留非示例工作流任意历史引用的示例资产", () => {
  const old = { ...prompt(), demo: true },
    recent = { ...prompt(), demo: true };
  const disposable = { ...prompt(), demo: true },
    regular = prompt();
  const workflow = revise(flow([ref(old)]), {
    references: [
      ref(recent),
      ref(regular),
      { assetId: "missing", versionId: "missing" },
    ],
  });
  const demoFlow = { ...flow([ref(disposable)]), demo: true };
  assert.deepEqual(
    [
      ...referencedDemoIds([
        old,
        recent,
        disposable,
        regular,
        workflow,
        demoFlow,
      ]),
    ].sort(),
    [old.id, recent.id].sort(),
  );
  assert.equal(referencedDemoIds([old, demoFlow]).size, 0);
  assert.equal(
    referencedDemoIds([{ ...flow([ref(old)]), archived: true }, old]).has(
      old.id,
    ),
    true,
  );
});

test("资料包原始输入以 UTF-8 和二进制字节累计，25 MiB 接受且超限拒绝", async () => {
  const limit = 25 * 1024 * 1024;
  const workflow = flow();
  current(workflow).content = "x".repeat(limit);
  const boundary = unzipSync(
    await buildWorkflowBundle(workflow, current(workflow), []),
  );
  assert.equal(boundary["workflow.md"].length, limit);
  current(workflow).content += "x";
  await assert.rejects(
    buildWorkflowBundle(workflow, current(workflow), []),
    /25 MiB/,
  );
  const p = prompt("汉".repeat(Math.ceil(limit / 3)));
  const multiByte = flow([ref(p)]);
  await assert.rejects(
    buildWorkflowBundle(multiByte, current(multiByte), [p]),
    /25 MiB/,
  );
  const files = [
    { path: "SKILL.md", data: "Skill", text: true },
    { path: "large.bin", data: new Uint8Array(limit - 5), text: false },
  ];
  const s = makeAsset({ type: "Skill", title: "容量边界", files });
  const mixed = flow([ref(s)]);
  await assert.rejects(
    buildWorkflowBundle(mixed, current(mixed), [s]),
    /25 MiB/,
  );
});

test("固定 ID 仍须避免默认大小写不敏感磁盘上的导出路径冲突", async () => {
  const first = { ...prompt("第一份"), id: "Asset-A" };
  const second = { ...prompt("第二份"), id: "asset-a" };
  current(first).id = "version-one";
  current(second).id = "VERSION-ONE";
  const workflow = flow([ref(first), ref(second)]);
  await assert.rejects(
    buildWorkflowBundle(workflow, current(workflow), [first, second]),
    /路径.*大小写冲突.*移除冲突引用后重试/,
  );
});

test("复制流程与资料包共用 25 MiB 原始输入限制，不生成超限回退文本", () => {
  const limit = 25 * 1024 * 1024;
  assert.equal(workflowText({ content: "x".repeat(limit) }, []).length, limit);
  assert.throws(
    () => workflowText({ content: "x".repeat(limit + 1) }, []),
    /25 MiB/,
  );
  const many = Array.from({ length: 50 }, () =>
    prompt("x".repeat(1024 * 1024)),
  );
  assert.throws(
    () => workflowText(current(flow(many.map((asset) => ref(asset)))), many),
    /25 MiB/,
  );
  const skill = makeAsset({
    type: "Skill",
    title: "完整包也计入复制预算",
    files: [
      { path: "SKILL.md", data: "Skill", text: true },
      { path: "large.bin", data: new Uint8Array(limit - 5), text: false },
    ],
  });
  assert.throws(
    () => workflowText(current(flow([ref(skill)])), [skill]),
    /25 MiB/,
  );
});

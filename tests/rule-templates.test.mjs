import test from "node:test";
import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
  readdir,
  stat,
  symlink,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import fs, { chmod } from "node:fs/promises";
import { openRepository } from "../server/repository.mjs";
import { contextFixture } from "./context-fixture.mjs";
import { makeAsset, revise } from "../src/store.js";
import {
  renderRuleBlock,
  parseRuleBlock,
  planRuleChange,
  createRuleTemplates,
} from "../server/rule-templates.mjs";
import { macOnly, PLATFORM_GUARD } from "./mac-only.mjs";

const sha = (text) => createHash("sha256").update(text).digest("hex");
const template = (body, versionId = "v-1") => ({
  assetId: "rule-1",
  versionId,
  body,
});

test("首次装入：原有字节原样保留，区块追加在末尾并可解析", () => {
  const original = "# 项目规则\n\n仅修改当前项目。\n";
  const plan = planRuleChange(original, template("先读 CURRENT.md。\n"));
  assert.equal(plan.action, "append");
  assert.ok(plan.content.startsWith(original));
  const block = parseRuleBlock(plan.content);
  assert.equal(block.assetId, "rule-1");
  assert.equal(block.versionId, "v-1");
  assert.equal(block.inner, "先读 CURRENT.md。\n");
  assert.equal(block.sha256, sha("先读 CURRENT.md。\n"));
  assert.equal(block.drift, false);
  assert.equal(plan.patch.offset, Buffer.byteLength(original));
  assert.equal(plan.patch.before, "");
  assert.equal(original + plan.patch.after, plan.content);
});

test("首次装入：没有换行结尾的文件先补空行，空文件不加前导空行", () => {
  const noNewline = planRuleChange("结尾无换行", template("规则\n"));
  assert.ok(noNewline.content.startsWith("结尾无换行\n\n<!-- guiji:rules:begin"));
  const empty = planRuleChange("", template("规则\n"));
  assert.ok(empty.content.startsWith("<!-- guiji:rules:begin"));
});

test("文件不存在时计划为新建，正文缺换行时补齐", () => {
  const plan = planRuleChange(null, template("规则"));
  assert.equal(plan.action, "create");
  assert.equal(parseRuleBlock(plan.content).inner, "规则\n");
  assert.equal(plan.content, renderRuleBlock(template("规则")) + "\n");
});

test("升级只替换区块，区块前后字节逐字节不变", () => {
  const before = "前言\n";
  const after = "\n## 项目自己的补充\n手写内容保留。\n";
  const text =
    before + "\n" + renderRuleBlock(template("旧规则\n")) + after;
  const plan = planRuleChange(text, template("新规则\n", "v-2"));
  assert.equal(plan.action, "upgrade");
  assert.equal(plan.previous.versionId, "v-1");
  const block = parseRuleBlock(plan.content);
  assert.equal(block.versionId, "v-2");
  assert.equal(block.inner, "新规则\n");
  assert.ok(plan.content.startsWith(before + "\n"));
  assert.ok(plan.content.endsWith(after));
  const bytes = Buffer.from(text);
  const next = Buffer.concat([
    bytes.subarray(0, plan.patch.offset),
    Buffer.from(plan.patch.after),
    bytes.subarray(plan.patch.offset + Buffer.byteLength(plan.patch.before)),
  ]);
  assert.equal(next.toString(), plan.content);
});

test("同一版本且未手改时不需要写入", () => {
  const text = renderRuleBlock(template("规则\n")) + "\n";
  assert.equal(planRuleChange(text, template("规则\n")).action, "same");
});

test("区块被手改：默认拒绝写入，勾选覆盖后才计划升级", () => {
  const text = renderRuleBlock(template("原规则\n")).replace(
    "原规则",
    "被手改的规则",
  );
  const refused = planRuleChange(text, template("原规则\n", "v-2"));
  assert.equal(refused.action, "drift");
  assert.equal(refused.content, undefined);
  assert.equal(refused.previous.inner, "被手改的规则\n");
  const forced = planRuleChange(text, template("原规则\n", "v-2"), {
    overwriteDrift: true,
  });
  assert.equal(forced.action, "upgrade");
  assert.equal(forced.previous.drift, true);
  assert.equal(parseRuleBlock(forced.content).drift, false);
  const sameVersion = planRuleChange(text, template("原规则\n"));
  assert.equal(sameVersion.action, "drift");
});

test("畸形或多个托管标记一律拒绝，不猜", () => {
  const block = renderRuleBlock(template("规则\n"));
  const cases = [
    block + "\n" + block,
    block.replace(/<!-- guiji:rules:end -->/, ""),
    "<!-- guiji:rules:end -->\n" + block.replace(/<!-- guiji:rules:end -->/, ""),
    block.replace(/version=\S+/, "version="),
    block.replace(/sha256=[a-f0-9]+/, "sha256=zz"),
    "正文提到 guiji:rules:begin 但不是标记\n",
    "  " + block,
  ];
  for (const text of cases)
    assert.throws(() => planRuleChange(text, template("规则\n")), /托管区块/);
});

test("文件里是另一个模板的区块时拒绝，不替换", () => {
  const text = renderRuleBlock({ ...template("别的\n"), assetId: "rule-9" });
  assert.throws(
    () => planRuleChange(text, template("规则\n")),
    /另一个规则模板/,
  );
});

test("模板正文不能包含托管标记", () => {
  assert.throws(
    () => planRuleChange("", template("<!-- guiji:rules:end -->\n")),
    /托管标记/,
  );
});

test("CRLF 文件：追加与升级都不改动原有换行", () => {
  const original = "第一行\r\n第二行\r\n";
  const appended = planRuleChange(original, template("规则\n"));
  assert.ok(appended.content.startsWith(original));
  const upgraded = planRuleChange(
    appended.content + "尾部\r\n",
    template("规则二\n", "v-2"),
  );
  assert.ok(upgraded.content.startsWith(original));
  assert.ok(upgraded.content.endsWith("尾部\r\n"));
});

async function withRule(app, body = "## 协同协议\n先读 CURRENT.md。\n") {
  const state = (await app.call("/workspace")).body;
  const asset = makeAsset({
    title: "项目协同协议",
    type: "Rule",
    description: "所有 Agent 共用的接力规则",
    content: body,
    tags: ["协同"],
  });
  const saved = await app.call(
    "/workspace",
    { state: { ...state, assets: [...state.assets, asset] } },
    "PUT",
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  return { asset, revision: saved.body.revision };
}
async function reviseRule(app, asset, content) {
  const state = (await app.call("/workspace")).body;
  const stored = state.assets.find((a) => a.id === asset.id);
  const next = revise(stored, { content });
  const saved = await app.call(
    "/workspace",
    {
      state: {
        ...state,
        assets: state.assets.map((a) => (a.id === asset.id ? next : a)),
      },
    },
    "PUT",
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  return { asset: next, revision: saved.body.revision };
}
const target = (app, asset, extra = {}) => ({
  projectId: app.input.projectId,
  root: app.input.root,
  file: "AGENTS.md",
  assetId: asset.id,
  versionId: asset.versions.at(-1).id,
  overwriteDrift: false,
  ...extra,
});
async function install(app, input, revision) {
  const preview = await app.call("/rule-templates/preview", {
    ...input,
    revision,
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.ok(preview.body.token, JSON.stringify(preview.body));
  const applied = await app.call("/rule-templates/apply", {
    token: preview.body.token,
    revision,
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  return { preview: preview.body, applied: applied.body };
}

test("规则资产类型可以保存，复制记为 copy-rule 使用", async () => {
  const app = await contextFixture();
  try {
    const { asset, revision } = await withRule(app);
    const used = await app.call("/asset-activity", {
      id: crypto.randomUUID(),
      assetId: asset.id,
      versionId: asset.versions[0].id,
      kind: "use",
      action: "copy-rule",
      usedAt: new Date().toISOString(),
      expectedRevision: revision,
    });
    assert.equal(used.status, 200, JSON.stringify(used.body));
    const wrong = await app.call("/asset-activity", {
      id: crypto.randomUUID(),
      assetId: asset.id,
      versionId: asset.versions[0].id,
      kind: "use",
      action: "copy-prompt",
      usedAt: new Date().toISOString(),
      expectedRevision: used.body.state.revision,
    });
    assert.equal(wrong.status, 400);
  } finally {
    await app.close();
  }
});

test("装入、升级、区块外手写内容不受影响，撤回恢复写入前字节", macOnly(PLATFORM_GUARD), async () => {
  const app = await contextFixture();
  try {
    const path = join(app.root, "AGENTS.md");
    const original = await readFile(path, "utf8");
    const { asset, revision } = await withRule(app);
    const first = await install(app, target(app, asset), revision);
    assert.equal(first.preview.action, "append");
    assert.equal(first.preview.path.endsWith("/AGENTS.md"), true);
    assert.equal(first.applied.status, "matches_after");
    const installed = await readFile(path, "utf8");
    assert.ok(installed.startsWith(original));
    assert.equal(parseRuleBlock(installed).versionId, asset.versions[0].id);

    const tail = "\n## 本项目补充\n手写：发布前人工确认。\n";
    await writeFile(path, installed + tail);
    const handEdited = await readFile(path, "utf8");

    const v2 = await reviseRule(app, asset, "## 协同协议 v2\n先读 CURRENT.md，再认领。\n");
    const listed = (await app.call("/rule-templates/installs", {})).body.items;
    assert.equal(listed.length, 1);
    assert.equal(listed[0].versionId, asset.versions[0].id);
    assert.equal(listed[0].file, "AGENTS.md");

    const second = await install(app, target(app, v2.asset), v2.revision);
    assert.equal(second.preview.action, "upgrade");
    assert.equal(second.preview.previous.versionId, asset.versions[0].id);
    const upgraded = await readFile(path, "utf8");
    assert.ok(upgraded.startsWith(original));
    assert.ok(upgraded.endsWith(tail));
    assert.equal(parseRuleBlock(upgraded).versionId, v2.asset.versions[1].id);
    const now = (await app.call("/rule-templates/installs", {})).body.items;
    assert.equal(now[0].versionId, v2.asset.versions[1].id);

    const same = await app.call("/rule-templates/preview", {
      ...target(app, v2.asset),
      revision: v2.revision,
    });
    assert.equal(same.body.action, "same");
    assert.equal(same.body.token, null);

    const revert = await app.call("/rule-templates/revert-preview", {
      id: second.applied.id,
      revision: v2.revision,
    });
    assert.equal(revert.status, 200, JSON.stringify(revert.body));
    const reverted = await app.call("/rule-templates/apply", {
      token: revert.body.token,
      revision: v2.revision,
    });
    assert.equal(reverted.body.status, "matches_after");
    assert.equal(await readFile(path, "utf8"), handEdited);
  } finally {
    await app.close();
  }
});

test("区块手改默认拒绝；勾选覆盖后写入并可撤回到手改内容", macOnly(PLATFORM_GUARD), async () => {
  const app = await contextFixture();
  try {
    const path = join(app.root, "AGENTS.md");
    const { asset, revision } = await withRule(app);
    await install(app, target(app, asset), revision);
    const edited = (await readFile(path, "utf8")).replace(
      "先读 CURRENT.md。",
      "先读 CURRENT.md，手改一句。",
    );
    await writeFile(path, edited);
    const v2 = await reviseRule(app, asset, "## 协同协议 v2\n");
    const refused = await app.call("/rule-templates/preview", {
      ...target(app, v2.asset),
      revision: v2.revision,
    });
    assert.equal(refused.status, 200);
    assert.equal(refused.body.action, "drift");
    assert.equal(refused.body.token, null);
    assert.match(refused.body.blockBefore, /手改一句/);
    assert.equal(await readFile(path, "utf8"), edited);
    const forced = await install(
      app,
      target(app, v2.asset, { overwriteDrift: true }),
      v2.revision,
    );
    assert.equal(forced.preview.action, "upgrade");
    assert.equal(forced.preview.drift, true);
    const revert = await app.call("/rule-templates/revert-preview", {
      id: forced.applied.id,
      revision: v2.revision,
    });
    await app.call("/rule-templates/apply", {
      token: revert.body.token,
      revision: v2.revision,
    });
    assert.equal(await readFile(path, "utf8"), edited);
  } finally {
    await app.close();
  }
});

test("文件不存在时新建；新建的文件不提供撤回", async () => {
  const app = await contextFixture();
  try {
    const { asset, revision } = await withRule(app);
    const created = await install(
      app,
      target(app, asset, { file: "CLAUDE.md" }),
      revision,
    );
    assert.equal(created.preview.action, "create");
    const text = await readFile(join(app.root, "CLAUDE.md"), "utf8");
    assert.equal(parseRuleBlock(text).assetId, asset.id);
    const revert = await app.call("/rule-templates/revert-preview", {
      id: created.applied.id,
      revision,
    });
    assert.equal(revert.status, 409);
    assert.match(revert.body.error, /手动删除/);
  } finally {
    await app.close();
  }
});

test("预览后文件变化、主库变化或过期都拒绝写入，并声明未开始", async () => {
  const app = await contextFixture();
  try {
    const path = join(app.root, "AGENTS.md");
    const { asset, revision } = await withRule(app);
    const preview = await app.call("/rule-templates/preview", {
      ...target(app, asset),
      revision,
    });
    await writeFile(path, "外部编辑\n");
    const stale = await app.call("/rule-templates/apply", {
      token: preview.body.token,
      revision,
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.operationNotStarted, true);
    assert.equal(await readFile(path, "utf8"), "外部编辑\n");

    const fresh = await app.call("/rule-templates/preview", {
      ...target(app, asset),
      revision,
    });
    const wrongRevision = await app.call("/rule-templates/apply", {
      token: fresh.body.token,
      revision: revision + 1,
    });
    assert.equal(wrongRevision.status, 409);
    const unknownToken = await app.call("/rule-templates/apply", {
      token: crypto.randomUUID(),
      revision,
    });
    assert.equal(unknownToken.status, 409);
    assert.equal(await readFile(path, "utf8"), "外部编辑\n");
  } finally {
    await app.close();
  }
});

test("重复提交同一令牌只写一次，返回核对结果", macOnly(PLATFORM_GUARD), async () => {
  const app = await contextFixture();
  try {
    const path = join(app.root, "AGENTS.md");
    const { asset, revision } = await withRule(app);
    const { preview, applied } = await install(app, target(app, asset), revision);
    const once = await readFile(path, "utf8");
    const again = await app.call("/rule-templates/apply", {
      token: preview.token,
      revision,
    });
    assert.equal(again.status, 200);
    assert.equal(again.body.id, applied.id);
    assert.equal(again.body.status, "matches_after");
    assert.equal(await readFile(path, "utf8"), once);
    const checked = await app.call("/rule-templates/check", { id: applied.id });
    assert.equal(checked.body.status, "matches_after");
  } finally {
    await app.close();
  }
});

test("只接受白名单文件与已发现项目，拒绝符号链接", async () => {
  const app = await contextFixture();
  try {
    const { asset, revision } = await withRule(app);
    const bad = async (extra) =>
      (
        await app.call("/rule-templates/preview", {
          ...target(app, asset, extra),
          revision,
        })
      ).status;
    assert.equal(await bad({ file: "README.md" }), 400);
    assert.equal(await bad({ file: "../AGENTS.md" }), 400);
    assert.equal(await bad({ projectId: "unknown" }), 404);
    assert.equal(await bad({ root: join(app.dir, "projects") }), 404);
    assert.equal(await bad({ assetId: "missing" }), 404);
    const outside = join(app.dir, "outside.md");
    await writeFile(outside, "外部文件\n");
    await rm(join(app.root, "AGENTS.md"));
    await symlink(outside, join(app.root, "AGENTS.md"));
    assert.equal(await bad({}), 403);
    assert.equal(await readFile(outside, "utf8"), "外部文件\n");
  } finally {
    await app.close();
  }
});

test("操作记录私有，只存区块片段，不存区块外正文", async () => {
  const app = await contextFixture();
  try {
    const path = join(app.root, "AGENTS.md");
    await writeFile(path, "区块外哨兵-OUTSIDE-SENTINEL\n");
    const { asset, revision } = await withRule(app);
    await install(app, target(app, asset), revision);
    const folder = join(app.dir, "data", "rule-operations");
    assert.equal((await stat(folder)).mode & 0o777, 0o700);
    const names = await readdir(folder);
    assert.ok(names.length >= 1);
    for (const name of names) {
      assert.equal((await stat(join(folder, name))).mode & 0o777, 0o600);
      assert.doesNotMatch(
        await readFile(join(folder, name), "utf8"),
        /OUTSIDE-SENTINEL/,
      );
    }
  } finally {
    await app.close();
  }
});

// ---------- 返修 WB-20260929-73：Codex 复核 D-R4 / D-R5 / D-R6 ----------

test("D-R4：写入中途失败的操作不替代已装版本，单独标为未确认", macOnly(PLATFORM_GUARD), async () => {
  const app = await contextFixture();
  try {
    const { asset, revision } = await withRule(app);
    await install(app, target(app, asset), revision);
    const v2 = await reviseRule(app, asset, "## 协同协议 v2\n");
    const preview = await app.call("/rule-templates/preview", {
      ...target(app, v2.asset),
      revision: v2.revision,
    });
    assert.ok(preview.body.token);
    await chmod(app.root, 0o555); // 目录不可写：记录已准备，临时文件无法创建
    let applied;
    try {
      applied = await app.call("/rule-templates/apply", {
        token: preview.body.token,
        revision: v2.revision,
      });
    } finally {
      await chmod(app.root, 0o755);
    }
    assert.equal(applied.status, 200);
    assert.equal(applied.body.completedAt, null);
    assert.equal(applied.body.status, "matches_before");
    const items = (await app.call("/rule-templates/installs", {})).body.items;
    assert.equal(items.length, 1);
    assert.equal(items[0].versionId, asset.versions[0].id, "仍是已完成的 v1");
    assert.equal(items[0].pending?.versionId, v2.asset.versions[1].id);
  } finally {
    await app.close();
  }
});

test("D-R5：核对等待在途写入完成，不会在 rename 前给出写入前结论", macOnly(PLATFORM_GUARD), async () => {
  const app = await contextFixture();
  let repository, release;
  try {
    const { asset, revision } = await withRule(app);
    await app.stop();
    repository = await openRepository(join(app.dir, "data"));
    let reached;
    const gate = new Promise((r) => (release = r));
    const renaming = new Promise((r) => (reached = r));
    const filesystem = {
      ...fs,
      rename: async (from, to) => {
        if (from.includes(".guiji-config-")) {
          reached();
          await gate;
        }
        return fs.rename(from, to);
      },
    };
    const rules = createRuleTemplates(repository, { filesystem });
    const preview = await rules.preview({ ...target(app, asset), revision });
    const applying = rules.apply({ token: preview.token, revision });
    // 写入若在 rename 前就结束（成功或失败），不再无限等待被拦住的 rename，直接以真实结果失败。
    const early = await Promise.race([
      renaming.then(() => null),
      applying.then((r) => ({ r }), (e) => ({ e })),
    ]);
    if (early) throw early.e || new Error("写入未经过被拦截的 rename 就结束：" + JSON.stringify(early.r));
    let checked = null;
    const checking = rules.check({ id: preview.token }).then((r) => (checked = r));
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(checked, null, "核对必须等在途写入结束");
    release();
    assert.equal((await applying).status, "matches_after");
    assert.equal((await checking).status, "matches_after");
  } finally {
    release?.(); // 断言失败时也放行被拦住的写入，避免进程挂住
    await repository?.close();
    await app.close();
  }
});

test("D-R6：约 140 KiB 的模板两版升级后，记录仍可读、列表正常", macOnly(PLATFORM_GUARD), async () => {
  const app = await contextFixture();
  try {
    const big = (tag) =>
      Array.from({ length: 3300 }, (_, i) => `- ${tag} 第 ${i} 条规则：先读 CURRENT。`).join("\n") + "\n";
    const { asset, revision } = await withRule(app, big("v1"));
    assert.ok(Buffer.byteLength(big("v1")) > 140 * 1024);
    assert.ok(Buffer.byteLength(big("v1")) < 200 * 1024);
    await install(app, target(app, asset), revision);
    const v2 = await reviseRule(app, asset, big("v2"));
    const second = await install(app, target(app, v2.asset), v2.revision);
    assert.equal(second.applied.status, "matches_after");
    const listed = await app.call("/rule-templates/installs", {});
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    assert.equal(listed.body.items[0].versionId, v2.asset.versions[1].id);
  } finally {
    await app.close();
  }
});

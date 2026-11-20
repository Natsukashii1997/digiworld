import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import fs from "node:fs/promises";
import { openRepository } from "../server/repository.mjs";
import { contextFixture } from "./context-fixture.mjs";
import { makeAsset } from "../src/store.js";
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
const target = (app, asset, extra = {}) => ({
  projectId: app.input.projectId,
  root: app.input.root,
  file: "AGENTS.md",
  assetId: asset.id,
  versionId: asset.versions.at(-1).id,
  overwriteDrift: false,
  ...extra,
});
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

// ---------- 返修 WB-20260929-73：Codex 复核 D-R4 / D-R5 / D-R6 ----------

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


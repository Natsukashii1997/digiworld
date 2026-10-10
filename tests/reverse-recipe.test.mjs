import test from "node:test";
import assert from "node:assert/strict";
import {
  parseRecipeReply,
  scoreReplica,
  specimenRows,
  recipeOf,
  createSpecimen,
  confirmReplica,
  currentVerification,
  replicaContext,
} from "../src/reverse-recipe.js";
const media = {
  path: "reverse-media/" + "a".repeat(64) + ".png",
  size: 20,
  sha256: "a".repeat(64),
  type: "image/png",
};
const recipe = (type = "TXT") => ({
  version: 1,
  type,
  blocks: (type === "TXT"
    ? ["structure", "tone", "techniques"]
    : type === "IMG"
      ? ["palette", "font", "composition", "texture", "prompt", "negative"]
      : type === "WEB"
        ? ["colors", "font", "spacing", "layout", "components", "motion"]
        : ["flow", "state", "data", "boundary", "copy", "acceptance"]
  ).map((kind, i) => ({
    id: "b" + i,
    kind,
    label: kind,
    mark: "观察",
    text: kind,
    ...(kind === "palette" || kind === "colors"
      ? { palette: [{ name: "ink", value: "#141414" }] }
      : {}),
    ...(kind === "spacing"
      ? { tokens: [{ name: "gap", value: 24, unit: "px" }] }
      : {}),
    ...(kind === "acceptance"
      ? { cases: [{ id: "AC-01", text: "失败提示" }] }
      : {}),
  })),
});
test("四类严格解析，WEB提取唯一HTML文本资源", () => {
  for (const type of ["TXT", "IMG", "WEB", "FN"]) {
    const r = parseRecipeReply(
      "```json\n" +
        JSON.stringify({ recipe: recipe(type) }) +
        "\n```" +
        (type === "WEB"
          ? "\n```html\n<html><body>合成复刻</body></html>\n```"
          : ""),
      type,
    );
    assert.equal(r.ok, true, r.error);
    assert.equal(r.recipe.type, type);
    if (type === "WEB") assert.match(r.html, /合成复刻/);
  }
});
test("缺字段、超长、截断、非JSON、错类型、重复块与未知字段不猜补", () => {
  for (const reply of [
    "不是JSON",
    '{"recipe":',
    "{}",
    JSON.stringify({ recipe: recipe("IMG") }),
    JSON.stringify({ recipe: { ...recipe(), unknown: 1 } }),
    JSON.stringify({ recipe: { ...recipe(), blocks: [] } }),
    "x".repeat(200001),
  ])
    assert.equal(parseRecipeReply(reply, "TXT").ok, false);
  const r = recipe();
  r.blocks[1].id = r.blocks[0].id;
  assert.equal(
    parseRecipeReply(JSON.stringify({ recipe: r }), "TXT").ok,
    false,
  );
});
test("旧记录读时TXT映射，旧引用只读并架，旧入库不伪装新炼成", () => {
  const old = {
    id: "old",
    title: "旧文字",
    material: { text: "原文", url: "" },
    createdAt: "2026-10-01T00:00:00Z",
    pack: "旧包",
    reply: JSON.stringify({
      report: {
        structure: [{ mark: "已验证", text: "原观察", quote: "原文" }],
        techniques: [],
        reusable: [],
      },
      candidates: [],
    }),
    imports: [
      {
        index: 0,
        kind: "prompt",
        assetId: "a",
        versionId: "v",
        at: "2026-10-01T00:00:00Z",
      },
    ],
  };
  const state = {
    reverseRecords: [old],
    references: [
      { id: "old", title: "旧链接", url: "https://example.test", note: "备注" },
    ],
  };
  const before = JSON.stringify(state),
    rows = specimenRows(state);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].key, rows[1].key);
  assert.equal(recipeOf(old).type, "TXT");
  assert.equal(recipeOf(old).blocks[0].text, "原观察");
  assert.equal(currentVerification(old), null);
  assert.equal(JSON.stringify(state), before);
});
test("四类输入，图片可只带本机引用；URL不抓取；非法路径拒绝", () => {
  assert.equal(
    createSpecimen({
      type: "IMG",
      title: "合成海报",
      text: "",
      url: "",
      why: "",
      media: [media],
    }).type,
    "IMG",
  );
  assert.throws(() => createSpecimen({ type: "IMG", title: "x", media: [] }));
  assert.throws(() =>
    createSpecimen({ type: "WEB", title: "x", url: "javascript:alert(1)" }),
  );
  assert.throws(() =>
    createSpecimen({
      type: "IMG",
      title: "x",
      media: [{ ...media, path: "../private.png" }],
    }),
  );
});
test("不四舍五入放行，未打完分不能确认，功能空/未查验不伪100", () => {
  assert.equal(
    scoreReplica(
      "IMG",
      { composition: 5, color: 5, font: 4, texture: 4 },
      [],
      90,
    ).total,
    90,
  );
  assert.equal(
    scoreReplica("IMG", { composition: 5, color: 5, font: 4 }, [], 90).complete,
    false,
  );
  const fn = scoreReplica(
    "FN",
    { interaction: 3, copy: 4 },
    Array.from({ length: 9 }, (_, i) => ({ id: "AC-" + i, result: i !== 7 })),
    90,
  );
  assert.ok(Math.abs(fn.total - 76.296296) < 0.00001);
  assert.equal(fn.passed, false);
  assert.equal(
    scoreReplica("FN", { interaction: 5, copy: 5 }, [], 90).complete,
    false,
  );
  assert.equal(
    scoreReplica(
      "FN",
      { interaction: 5, copy: 5 },
      [{ id: "a", result: null }],
      90,
    ).complete,
    false,
  );
  assert.equal(
    scoreReplica(
      "FN",
      { interaction: 5, copy: 5 },
      [{ id: "a", result: true }],
      100,
    ).passed,
    true,
  );
  assert.throws(() =>
    scoreReplica("TXT", { structure: 6, tone: 5, techniques: 5 }, [], 90),
  );
});
test("达标证据绑定配方及原件快照；新设置不改历史", () => {
  const r = createSpecimen({
    type: "TXT",
    title: "文字",
    text: "原件",
    url: "",
  });
  r.recipe = recipe();
  const a = {
    id: "rep",
    at: "2026-10-05T00:00:00Z",
    agentId: "codex",
    artifact: { text: "只凭配方复刻", html: "", media: [] },
    scores: { structure: 5, tone: 5, techniques: 5 },
    checks: [],
    threshold: 90,
    note: "",
    ...replicaContext(r),
  };
  const saved = confirmReplica(r, a);
  assert.equal(saved.replicas[0].conclusion, "passed");
  assert.equal(currentVerification(saved).threshold, 90);
  const changed = structuredClone(saved);
  changed.recipe.blocks[0].text = "新配方";
  assert.equal(currentVerification(changed), null);
  const changedOriginal = structuredClone(saved);
  changedOriginal.material.text = "新原件";
  assert.equal(currentVerification(changedOriginal), null);
  assert.throws(() =>
    confirmReplica(r, { ...a, artifact: { text: "", html: "", media: [] } }),
  );
});

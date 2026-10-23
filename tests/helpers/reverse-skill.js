// 前端已不再引用；几个现役测试仍用它生成配方 Skill 夹具，2026-10-23 从 src 移到这里。
import {
  currentVerification,
  validateRecipe,
  BLOCK_LABELS,
} from "../../src/reverse-recipe.js";
import { filterRelayText } from "../../src/relay-prompt.js";
import { planSkillVersion } from "../../src/skill-version.js";
const clean = (v) =>
  typeof v === "string"
    ? filterRelayText(v).text
    : Array.isArray(v)
      ? v.map(clean)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]))
        : v;
export function generateRecipeSkill(record) {
  const proof = currentVerification(record);
  if (!proof) throw new Error("当前配方尚无人工达标证据，不能炼成 Skill");
  validateRecipe(record.recipe);
  const recipe = clean(record.recipe),
    title = clean(record.title) + "配方",
    files = [],
    mediaManifest = [];
  const text = (path, data) =>
      files.push({ path, data, text: true, mode: 0o600 }),
    json = (path, value) => text(path, JSON.stringify(value, null, 2) + "\n");
  const addMedia = (media, group) =>
    media.forEach((m, i) => {
      const path = `assets/${group}-${String(i + 1).padStart(2, "0")}.${m.path.split(".").at(-1)}`;
      mediaManifest.push({
        path,
        file: m.path,
        size: m.size,
        sha256: m.sha256,
        type: m.type,
      });
    });
  addMedia(record.referenceMedia || [], "reference");
  addMedia(proof.artifact.media || [], "replica");
  for (const [i, v] of (record.variations || []).entries())
    addMedia(v.media || [], `variation-${i + 1}`);
  const description = recipe.blocks
      .map(
        (b) =>
          `### ${b.label || BLOCK_LABELS[b.kind]} · ${b.mark}\n\n${b.text}`,
      )
      .join("\n\n"),
    variables = [...new Set(description.match(/\{[^{}\n]{1,100}\}/g) || [])];
  const target = record.material?.target;
  const reaBoundary = target ? `取证方式：REA；目标种类：${target.kind === "electron" ? "Electron应用" : "网站"}。只覆盖本次功能及所列证据，不证明软件已完整还原。\n\n证据 ID 清单：\n${[...new Set(recipe.blocks.flatMap((b) => b.evidence || []))].map((id) => "- " + id).join("\n") || "- 未提供证据编号"}\n\n未知项清单：\n${(recipe.unknowns || []).map((v) => "- " + v.id + "：" + v.text).join("\n") || "- 未列出未知项；不代表已完整取证"}\n\n` : "";
  text(
    "SKILL.md",
    `---\nname: reverse-${
      record.id
        .replace(/[^a-z0-9-]/gi, "")
        .toLowerCase()
        .slice(0, 55) || "recipe"
    }\ndescription: "${recipe.type} 参照配方的复刻流程"\n---\n\n# ${title}\n\n## 用途\n\n按已回收并人工验收的配方复刻同类作品。先查看本包资源，再逐项执行和验收。\n\n## 使用步骤\n\n1. 打开 recipe.json 和配套文本，确认目标类型与变量。\n2. 替换变量，保留配方的结构、数值和边界。\n3. 执行复刻，回收实际产物。\n4. 按 acceptance.md 检查；没有目标环境回执时不宣称采用成功。\n\n## 变量\n\n${variables.length ? variables.join("、") : "配方未声明变量；修改输入时保留上述约束。"}\n\n## 风格或行为说明\n\n${description}\n\n## 证据边界\n\n本包绑定逆向记录 ${record.id}、人工复刻 ${proof.id}，总分 ${proof.total}%、当时达标线 ${proof.threshold}%。这是本机人工验收记录，不证明目标 Agent 已采用。图片随完整包交付；主库媒体清单不是独立图片备份。\n\n${reaBoundary}${mediaManifest.length ? "## 图片资源\n\n" + mediaManifest.map((m) => "- " + m.path).join("\n") : ""}`,
  );
  json("recipe.json", recipe);
  const palette = recipe.blocks.flatMap((b) => b.palette || []);
  if (palette.length) json("palette.json", palette);
  const tokens = recipe.blocks.flatMap((b) => b.tokens || []);
  if (tokens.length) {
    json("tokens.json", tokens);
    text(
      "tokens.css",
      `:root {\n${tokens.map((t, i) => `  --recipe-${i + 1}: ${t.value}${t.unit}; /* ${t.name.replace(/\*\//g, "")} */`).join("\n")}\n}\n`,
    );
  }
  for (const b of recipe.blocks) {
    if (b.kind === "prompt") text("prompt.txt", b.text);
    else if (b.kind === "negative") text("negative.txt", b.text);
    else text(`blocks/${b.kind}.md`, `# ${b.label} · ${b.mark}\n\n${b.text}\n`);
  }
  if (recipe.type === "WEB" && (proof.artifact.html || recipe.html))
    text("replica/index.html", proof.artifact.html || recipe.html);
  if (recipe.type === "FN" && proof.artifact.text)
    text("replica/implementation.txt", clean(proof.artifact.text));
  if (recipe.type === "TXT") {
    text("examples/original.txt", clean(record.material.text));
    text("examples/replica.txt", clean(proof.artifact.text));
  }
  const cases = recipe.blocks.flatMap((b) => b.cases || []);
  text(
    "acceptance.md",
    `# 复刻验收\n\n${cases.length ? cases.map((c) => "- [ ] " + c.text).join("\n") : recipe.blocks.map((b) => "- [ ] 核对" + b.label + "：" + b.text).join("\n")}\n\n人工达标线：${proof.threshold}%。未打完各项不得确认。\n`,
  );
  json("media-manifest.json", {
    kind: "guiji-local-media/v1",
    entries: mediaManifest,
  });
  const result = {
    title,
    description: "人工复刻达标后生成的固定配方",
    content: files[0].data,
    tags: ["逆向配方", recipe.type],
    files,
    mediaManifest,
    source: "逆向工程 · " + record.id,
  };
  planSkillVersion(result);
  return result;
}

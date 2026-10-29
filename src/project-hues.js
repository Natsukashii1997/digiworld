// 项目空间的代表色、两字母代号与副标题（简报 §9 第 1 条：放数码世界这边，按名册 id 对应，不改数字分身名册）。
// 名册里新增、这里没登记的项目：代号取名字前两个字母，颜色按 id 从 7 色里稳定地取一个。
export const PROJECT_HUES = {
  "personal-ai-workbench": { code: "DW", hue: "#4de3ff", sub: "个人 AI 工作台" },
  "work-desk": { code: "NM", hue: "#ffd166", sub: "work-desk · 个人工作台" },
  "digital-twin": { code: "DT", hue: "#a891ff", sub: "Hermes 中枢" },
  "github-center": { code: "GH", hue: "#ff8fb8", sub: "私人项目发现站" },
  "agent-kit": { code: "AK", hue: "#a6e36e", sub: "协作底座 · 全局坑" },
  "my-skills": { code: "SK", hue: "#b4bfda", sub: "my-skills" },
  carvomoto: { code: "CM", hue: "#ff6a3d", sub: "汽配出海获客" },
};
const PALETTE = ["#4de3ff", "#ffd166", "#a891ff", "#ff8fb8", "#a6e36e", "#b4bfda", "#ff6a3d"];

function stableIndex(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % PALETTE.length;
}

// 名字前两个字母（芯片上是 5×7 像素字，只认字母和数字）：名字里不够两个时取 id 的，再不够写 ??。
export function fallbackCode(name, id) {
  for (const source of [name, id]) {
    const letters = String(source || "").match(/[A-Za-z0-9]/g) || [];
    if (letters.length >= 2) return (letters[0] + letters[1]).toUpperCase();
  }
  return "??";
}

export function projectHue({ id, name } = {}) {
  const known = PROJECT_HUES[id];
  if (known) return known;
  return { code: fallbackCode(name, id), hue: PALETTE[stableIndex(id || name)], sub: "" };
}

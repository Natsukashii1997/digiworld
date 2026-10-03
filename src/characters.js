// Agent 形象数据（UI v14e，用户 2026-10-03 决定映射）：换素材或改对应关系只改这一个文件。
// 像素图在 sprites-refs.js（由图纸生成）；这里只登记“角色 → 像素图”和“Agent → 角色”。
// sprite 为 null 表示素材还没到，显示字母牌；head 可选 [x, y, w, h] 手动指定头像裁切。

export const CHARACTERS = {
  metalgreymon: { name: "机械暴龙兽", sprite: null },
  // “机械系”图纸：背负双炮的灰色机械龙，按机械邪龙兽使用（待用户确认）。
  machinedramon: { name: "机械邪龙兽", sprite: "mecha" },
  agumon: { name: "亚古兽", sprite: "agumon" },
  gabumon: { name: "加布兽", sprite: null },
};

// 顺序即名册顺序。aliases 用于从 CURRENT 写入者、角色卡 ID 等文字里认出 Agent。
export const AGENT_CAST = [
  { id: "claude", name: "Claude Code", aliases: ["claude code", "claude-code", "claude"], character: "metalgreymon", hue: "255,138,36", initials: "CC" },
  { id: "codex", name: "Codex", aliases: ["codex"], character: "machinedramon", hue: "77,227,255", initials: "CO" },
  { id: "hermes", name: "Hermes", aliases: ["hermes"], character: "agumon", hue: "168,145,255", initials: "HE" },
  { id: "openclaw", name: "OpenClaw", aliases: ["openclaw"], character: "gabumon", hue: "255,143,184", initials: "OC" },
];

// 认不出的 Agent 返回 null，由调用方显示中性字母牌。
export function castOf(agent) {
  const key = String(agent || "").trim().toLowerCase();
  if (!key) return null;
  return (
    AGENT_CAST.find((a) => a.id === key || a.aliases.includes(key)) ||
    AGENT_CAST.find((a) => a.aliases.some((alias) => key.startsWith(alias))) ||
    null
  );
}
export function characterOf(agent) {
  const cast = castOf(agent);
  return cast ? { ...CHARACTERS[cast.character], id: cast.character } : null;
}

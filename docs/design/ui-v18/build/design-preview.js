// 设计资产的复制内容：风格底座 + 已勾选招式，外面套哪段话由「交给谁」决定。构建时（make.jsx）和运行时共用。
// 「ChatGPT 生图」的首尾两句与 src/design-asset.js 的 designPromptText 一字不差；「编程 Agent 做界面」是本稿新拟的示意话术。
export const WRAP = {
  agent: {
    label: "编程 Agent 做界面",
    head: "请按以下设计规范实现界面：风格底座全程遵守，招式只用在合适的位置，不要为了用而用。",
    tail: "完成后给我每个改动页面的截图核对。",
  },
  image: {
    label: "ChatGPT 生图",
    head: "请使用 ChatGPT 默认的生图能力，按以下要求直接生成图片。",
    tail: "请交付生成的图片。若当前对话无法生成图片，请如实说明。",
  },
};

export function previewLines({ base, moves }, checked, target) {
  const w = WRAP[target];
  return [
    { key: "head", text: w.head, wrap: true },
    { key: "base-h", text: "【风格底座】", label: true },
    ...base.map((b, i) => ({ key: `base-${i}`, text: `${i + 1}. ${b}` })),
    { key: "moves-h", text: "【招式】", label: true },
    ...moves.flatMap((m, i) => (checked[i] ? [{ key: `move-${i}`, text: `· ${m.name}：${m.prompt}` }] : [])),
    { key: "tail", text: w.tail, wrap: true },
  ];
}

export function previewMeta(lines, target) {
  const chars = lines.reduce((n, l) => n + l.text.length, 0);
  return `${WRAP[target].label}版 · ${chars} 字`;
}

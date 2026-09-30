export const DB_NAME = "guiji-workbench-v1";
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export function makeAsset(input) {
  const {
    title,
    type,
    description = "",
    content = "",
    tags = [],
    files = [],
    source = "个人创建",
    demo = false,
    references,
  } = input;
  if (!title?.trim()) throw new Error("请填写资产名称");
  if (!["Skill", "Prompt", "Workflow", "Rule"].includes(type))
    throw new Error("请选择资产类型");
  if (type === "Skill" && !files.some((f) => /(^|\/)SKILL\.md$/.test(f.path)))
    throw new Error("Skill 包中必须包含 SKILL.md");
  const version = {
    id: uid(),
    at: now(),
    title: title.trim(),
    description,
    content,
    tags,
    files,
    source,
    ...(references === undefined ? {} : { references }),
  };
  return {
    id: uid(),
    type,
    demo,
    favorite: false,
    archived: false,
    createdAt: now(),
    versions: [version],
  };
}
export function current(asset) {
  return asset.versions.at(-1);
}
export function revise(asset, values) {
  const next = { ...current(asset), ...values, id: uid(), at: now() };
  if (!next.title.trim()) throw new Error("请填写资产名称");
  return { ...asset, versions: [...asset.versions, next] };
}
export function restore(asset, versionId) {
  const version = asset.versions.find((v) => v.id === versionId);
  if (!version) throw new Error("找不到该版本");
  return revise(asset, {
    ...version,
    ...(asset.type === "Workflow"
      ? { references: version.references ?? [] }
      : {}),
    restoredFrom: version.id,
  });
}
export function safePath(path) {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").some((p) => p === ".." || p === "") &&
    !path.includes("\0") &&
    !/^[a-z]:/i.test(path)
  );
}
let dbPromise;
function db() {
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("state");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new Error("无法打开本地数据库，请检查浏览器存储权限"));
    });
  return dbPromise;
}
export async function readState() {
  const database = await db();
  return new Promise((resolve, reject) => {
    const r = database
      .transaction("state")
      .objectStore("state")
      .get("workspace");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function writeState(state, { initialize = false } = {}) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const t = database.transaction("state", "readwrite");
    const records = t.objectStore("state");
    const request = records.get("workspace");
    let result;
    let conflict;
    request.onsuccess = () => {
      const stored = request.result;
      if (initialize && stored) {
        result = stored;
        return;
      }
      if ((stored?.revision ?? 0) !== (state.revision ?? 0)) {
        conflict = new Error(
          "另一个页面已更新工作台。本次没有覆盖数据；请先复制未保存内容，再刷新页面。",
        );
        t.abort();
        return;
      }
      result = { ...state, revision: (stored?.revision ?? 0) + 1 };
      try {
        records.put(result, "workspace");
      } catch {
        conflict = new Error(
          "保存失败，请检查浏览器存储空间和权限。原数据未改变。",
        );
        t.abort();
      }
    };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(new Error("保存失败，浏览器存储空间可能不足"));
    t.onabort = () => reject(conflict || new Error("保存中断，请重试"));
  });
}
export const seed = () => ({
  assets: [
    {
      type: "Skill",
      title: "设计的最后一公里",
      description: "从排版到微交互，把「能用」打磨成「好用」。",
      tags: ["设计", "质量检查"],
      source: "工作台演示资产",
      content:
        "# 设计的最后一公里\n\n适用：已完成初稿的产品界面。\n\n1. 确认页面唯一主任务。\n2. 检查字体层级、留白、对齐和状态对比度。\n3. 验证键盘操作、窄屏和异常路径。\n4. 交付具体问题清单和截图证据。",
      files: [
        {
          path: "SKILL.md",
          data: "# 设计的最后一公里\n\n检查排版、留白、对齐、键盘、窄屏和异常路径。\n输出问题清单和截图证据。",
          text: true,
        },
      ],
    },
    {
      type: "Prompt",
      title: "把模糊想法，变成清晰问题",
      description: "不急着给答案。先找到真正要解决的那个问题。",
      tags: ["思考", "问题定义"],
      content:
        "请帮我梳理以下想法。先区分事实、判断与假设，再明确真实目标、当前差距、关键约束和需要验证的问题。不要直接跳到方案；如果信息不足，集中提出会改变方向的关键问题。\n\n我的想法：\n[在这里补充背景]",
    },
    {
      type: "Workflow",
      title: "从灵感到上线",
      description: "让一次网站创作，有起点、有判断，也有交付标准。",
      tags: ["开发", "网站"],
      content:
        "## 输入\n目标用户、核心任务、内容材料、约束。\n\n## 过程\n1. 定义最小交付与验收标准\n2. 设计关键页面并确认方向\n3. 实现主路径\n4. 测试空态、错误态、移动端和键盘\n5. 人工验收后决定是否部署\n\n## 输出\n可运行网站、测试证据、使用说明。\n\n## 边界\n部署、付费和外部数据写入需要单独授权。",
    },
    {
      type: "Prompt",
      title: "一次真正有用的复盘",
      description: "还原判断如何变化，让一次经历成为下次的依据。",
      tags: ["复盘", "知识沉淀"],
      content:
        "请依据真实材料复盘，不补造事实。按起点认知、发生的事实、偏差、认知变化、当前判断、下一步整理。区分稳定机制与仅适用于当时情境的策略，标明证据不足的部分。",
    },
    {
      type: "Skill",
      title: "有依据的深度研究",
      description: "从问题出发，核对来源，保留不确定性。",
      tags: ["研究", "证据"],
      content:
        "# 有依据的深度研究\n\n先定义需要消除的不确定性，再优先查找一手资料。区分来源事实与分析推断，交叉核对关键结论。交付来源、限制与下一步。",
      files: [
        {
          path: "SKILL.md",
          data: "# 有依据的深度研究\n\n定义问题，寻找一手来源，区分事实与推断，交叉核对结论，保留限制。",
          text: true,
        },
      ],
    },
    {
      type: "Workflow",
      title: "把经验，留在知识里",
      description: "原始资料 → 综合提炼 → 人工确认 → 可复用知识。",
      tags: ["知识沉淀", "Obsidian"],
      content:
        "## 输入\n会议记录、项目复盘或日常想法。\n\n## 流程\n1. 原始资料保留不动\n2. 关联已有主题并整理证据\n3. 标记新结论、冲突与适用边界\n4. 生成知识候选\n5. 经本人确认后写入正式知识\n\n## 禁止\n不要将收藏观点当作本人观点；未经确认不晋升正式知识。",
    },
  ].map((a, i) => ({
    ...makeAsset({ ...a, demo: true, source: "工作台演示资产" }),
    favorite: i === 0 || i === 1,
    cover: i,
  })),
  notes: [],
  projects: [],
  agents: [],
  references: [],
  night: {
    time: "23:00",
    end: "07:00",
    budget: "20",
    task: "",
    enabled: false,
  },
  model: { provider: "", model: "", endpoint: "" },
});

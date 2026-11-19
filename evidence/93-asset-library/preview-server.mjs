// #93 实测用：临时目录 + 合成数据起一个工作台（不碰正式 5178 数据目录、不读真实 Vault）。
// 用法：npm run build && PORT=5193 node evidence/93-asset-library/preview-server.mjs
import { randomUUID } from "node:crypto";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../../server/http.mjs";
import { seed, makeAsset, current } from "../../src/store.js";

const DAY = 864e5;
const now = Date.now();
const iso = (daysAgo) => new Date(now - daysAgo * DAY).toISOString();

function asset(type, title, description, content, daysAgo, extra = {}) {
  const a = makeAsset({
    type, title, description, content, tags: extra.tags || [], source: "个人创建",
    files: extra.self ? [{ path: "SKILL.md", data: `# ${title}\n${content}`, text: true }] : [],
    ...(type === "Skill" && !extra.self ? { installUrl: "https://github.com/example/skills/tree/main/demo" } : {}),
    ...(type === "Design" ? { design: { kind: "prompt" } } : {}),
  });
  a.createdAt = a.versions[0].at = iso(daysAgo);
  if (extra.editedDaysAgo !== undefined) {
    a.versions.push({ ...a.versions[0], id: randomUUID(), at: iso(extra.editedDaysAgo) });
  }
  if (extra.category) a.category = extra.category;
  if (extra.pinned) a.pinned = true;
  return a;
}

const P = (...args) => asset("Prompt", ...args);
const assets = [
  P("第一性原理拆问题", "把模糊问题拆到不可再分的假设", "你是一名严谨的分析师。\n1. 先复述问题，列出隐含假设。\n2. 逐条追问每个假设是否成立，给出证据。\n3. 只保留被证据支撑的假设，从它们重新推演结论。\n4. 最后列出仍不确定的部分与验证办法。", 40, { tags: ["思考"], pinned: true }),
  P("反方视角校准决策", "做决定前先找最强反方", "请站在反对者立场，给出三条最有力的反对理由，每条附一个可以验证的事实。然后评估我的方案在这些反对理由下还剩多少把握。", 3),
  P("代码交接 Handoff", "让下一位开发者十分钟接上手", "请按以下结构写交接：目标与验收标准；已完成与提交号；剩余步骤；相关文件；已否掉的方案与注意事项。不要复述代码，只写判断。", 12, { editedDaysAgo: 2 }),
  P("前端调试三步法", "先复现、再缩小、后修复", "先给出最小复现步骤；再用二分法缩小到具体组件或样式；修复后写一条回归测试，说明为什么之前没测到。", 60),
  P("周复盘提纲", "一周结束时把经验沉淀下来", "本周做成了什么？卡在哪里？哪一个判断事后看是错的？下周只改一件事是什么？把可复用的经验写成一条笔记。", 20),
  P("业务落地访谈", "一线访谈前的提纲", "访谈对象一天怎么过？哪一步最费时间？现在用什么工具？如果有一个助手，你最想先交给它哪件事？", 9, { category: "biz" }),
  P("海报视觉风格", "统一配色与排版的设计说明", "画面主题、风格参照、主色与辅色、字体层级、留白比例与交付尺寸，逐项写清。", 5),
  P("自动化体检提示", "看看定时任务有没有挂", "列出本机所有定时任务与常驻服务，分「需要处理 / 注意 / 正常」三档，并说明原因与处理办法。", 45),
  P("随便写写", "", "没有关键词的一条，应当落到待归类。", 8),
  asset("Skill", "grill-me 追问", "把计划问到底", "逐条追问计划的前提和风险。", 15, { category: "think" }),
  asset("Skill", "deploy 发布清单", "上线前逐项核对", "部署前检查构建、测试、回滚方案。", 35),
  asset("Skill", "周报整理", "自建：把一周记录整理成周报", "读随手记与提交记录，按模板生成周报。", 6, { self: true, category: "retro" }),
  asset("Design", "像素风封面", "数码世界像素风格", "16 色像素风，深色背景，霓虹描边，主体居中。", 4),
];

const records = [];
const use = (a, daysAgo) => records.push({ id: randomUUID(), assetId: a.id, versionId: current(a).id, kind: "use", action: `copy-${a.type.toLowerCase()}`, usedAt: iso(daysAgo) });
for (let i = 0; i < 7; i++) use(assets[0], i + 1);
for (let i = 0; i < 2; i++) use(assets[2], i + 3);
for (let i = 0; i < 5; i++) use(assets[5], i + 1);

const directory = await realpath(await mkdtemp(join(tmpdir(), "digiworld-93-")));
const app = await startServer({ directory, port: Number(process.env.PORT || 0), staticRoot: join(import.meta.dirname, "../../dist") });
let state = await app.repository.write({ ...seed(), assets }, { initialize: true });
// 使用记录只能经专用接口追加；usedAt 回填到过去，才能点亮 HOT。
const { token } = await (await fetch(app.url + "/api/session", { headers: { "x-workbench-client": "1" } })).json();
for (const r of records) {
  const res = await fetch(app.url + "/api/asset-activity", { method: "POST", headers: { "x-workbench-token": token, "content-type": "application/json" }, body: JSON.stringify({ ...r, expectedRevision: state.revision }) });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || res.status);
  state = body.state;
}
console.log(`READY ${app.url} data=${directory}`);

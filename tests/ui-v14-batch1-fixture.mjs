// 批次1只用合成资料；日期/ID固定，改前dist与改后dist使用同一输入。
import { seed, makeAsset, revise } from "../src/store.js";
import { createRecord, buildPack } from "../src/reverse.js";
export function batch1State(long = false) {
  const state = seed();
  const text = long
    ? "长标题与EnglishWithoutSpaces".repeat(7)
    : "设计的最后一公里";
  let asset = makeAsset({
    type: "Prompt",
    title: text,
    description: "将设计落为可验证的页面",
    content: "## 验收\n逐项核对设计稿\n保留来源",
    tags: ["设计"],
    source: "合成资料",
  });
  asset = revise(asset, {
    description: "补充窄屏检查",
    content:
      "## 验收\n逐项核对设计稿，并在390与320检查溢出\n给出前后截图\n保留来源",
    tags: ["设计", "验收"],
  });
  asset = revise(asset, {
    title: text + " · 终版",
    content:
      "## 验收\n逐项核对设计稿，并在390与320检查溢出\n给出前后截图\n保留来源\n检查减少动态效果",
  });
  asset.id = "batch-history";
  asset.createdAt = "2026-10-01T10:00:00.000Z";
  asset.versions.forEach((v, i) => {
    v.id = `batch-v${i + 1}`;
    v.at = `2026-10-0${i + 1}T10:00:00.000Z`;
  });
  const archived = makeAsset({
    type: "Prompt",
    title: "旧版周报模板",
    content: "保留历史",
  });
  archived.id = "batch-archive";
  archived.createdAt = "2026-10-01T08:00:00.000Z";
  archived.archived = true;
  archived.versions[0].id = "batch-archive-v1";
  archived.versions[0].at = "2026-10-01T08:00:00.000Z";
  state.assets = [asset, archived];
  state.notes = [
    {
      id: "batch-note",
      text: long ? text : "一句可复用的判断：先给结论再给理由",
      at: "2026-10-02T08:00:00.000Z",
    },
  ];
  state.revisionCandidates = [];
  state.profileProposals = [];
  state.reverseRecords = [
    "一个爆款开头的拆解",
    "别人的代码评审 prompt",
    "先给结论再给理由",
  ].map((title, i) => {
    const r = createRecord(
      {
        text:
          (long ? text : title) +
          "\n别再堆功能了。\n先回答用户要完成什么，再决定保留哪些功能。",
        url: "https://example.com/material",
      },
      "开头把判断摆在前面",
    );
    r.id = `batch-reverse-${i}`;
    r.title = long ? text.slice(0, 100) : title;
    r.createdAt = "2026-10-03T08:00:00.000Z";
    r.pack = buildPack(r);
    if (i !== 1)
      r.reply = JSON.stringify({
        report: {
          summary: "反常识开头引出判断标准",
          structure: [{ mark: "原文观察", text: "先给结论，再解释决定依据。" }],
          techniques: [
            { mark: "推断", text: long ? text : "用前后对照说明取舍。" },
          ],
          reusable: [{ mark: "已验证", text: "先回答目标，再决定形式。" }],
        },
        candidates: [
          {
            type: "prompt",
            title: "三问拆需求",
            description: "合成候选",
            content: "发生了什么？为什么值得解决？怎样验证？",
            tags: [],
            mark: "推断",
          },
        ],
      });
    if (i === 2)
      r.imports = [
        {
          index: 0,
          kind: "prompt",
          assetId: asset.id,
          versionId: asset.versions.at(-1).id,
          at: r.createdAt,
        },
      ];
    return r;
  });
  return state;
}

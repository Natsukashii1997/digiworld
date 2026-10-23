// 六种批准状态，全由合成材料构造；实际PNG来自批准稿SVG/占位帧，所有媒体只写自己的临时库。
import fs from "node:fs/promises";
import { generateRecipeSkill } from "./helpers/reverse-skill.js";
import { fixture } from "./fixture.mjs";
import { seed, makeAsset, current } from "../src/store.js";
import { createReverseMedia } from "../server/reverse-media.mjs";
import {
  createSpecimen,
  prepareReplica,
  confirmReplica,
  RECIPE_BLOCKS,
  BLOCK_LABELS,
} from "../src/reverse-recipe.js";
const stamp = "2026-10-05T04:12:00.000Z";
export const fixtureRecipe = (type) => ({
  version: 1,
  type,
  blocks: RECIPE_BLOCKS[type].map((kind, i) => ({
    id: "b" + i,
    kind,
    label: BLOCK_LABELS[kind],
    mark: "观察",
    text: kind,
    ...(["palette", "colors"].includes(kind)
      ? { palette: [{ name: "墨黑", value: "#141414" }] }
      : {}),
    ...(kind === "spacing"
      ? { tokens: [{ name: "gap", value: 24, unit: "px" }] }
      : {}),
    ...(kind === "acceptance"
      ? {
          cases: Array.from({ length: 9 }, (_, n) => ({
            id: "AC-" + String(n + 1).padStart(2, "0"),
            text: [
              "切换会话只显示该会话原话",
              "会话不可读时如实说明",
              "预览和复制逐字一致",
              "默认不读取会话",
              "凭据过滤",
              "复制成功才打开",
              "未检测到应用不打开",
              "错误提示不泄露目录细节",
              "取消选择保留已有内容",
            ][n],
          })),
        }
      : {}),
  })),
});
export async function reverseV16Fixture({
  empty = false,
  legacy = false,
} = {}) {
  const app = await fixture();
  try {
    const media = createReverseMedia(
      await fs.realpath(app.repository.directory),
    );
    const image = async (name) =>
      media.store({
        data: new Uint8Array(
          await fs.readFile(
            new URL("./fixtures/reverse-v16/" + name + ".png", import.meta.url),
          ),
        ),
      });
    const genes = JSON.parse(
      await fs.readFile(
        new URL("./fixtures/reverse-v16/genes.json", import.meta.url),
        "utf8",
      ),
    );
    const make = (id, type, title, date, text, url) => ({
      ...createSpecimen({ type, title, text, url }),
      id,
      createdAt: date + "T00:00:00.000Z",
    });
    const poster = make(
      "0415",
      "IMG",
      "SUMMER NOISE 音乐节海报",
      "2026-10-04",
      "",
      "https://behance.net/synthetic",
    );
    poster.referenceMedia = [await image("reverse-0")];
    poster.recipe = fixtureRecipe("IMG");
    for (let i = 0; i < 5; i++) {
      const g = genes.reverse[i],
        b = poster.recipe.blocks[i];
      b.label = g.label;
      b.mark = g.mark;
      b.text = g.code || g.texts.join("\n");
      if (g.colors.length) b.palette = g.colors;
    }
    poster.recipe.blocks[2].tokens = Object.entries({
      width: 300,
      height: 400,
      circleX: 196,
      circleY: 210,
      radius: 118,
      bandY: 270,
      tilt: -12,
    }).map(([name, value]) => ({ name, value, unit: "px" }));
    poster.recipe.blocks[5].text = "photo, 3d, gradient, glow, serif, clutter";
    poster.replicaDraft = {
      ...prepareReplica(poster, { media: [await image("reverse-1")] }),
      id: "rep-poster",
      at: stamp,
      scores: { composition: 5, color: 5, font: 4, texture: 4 },
    };
    const web = make(
      "0414",
      "WEB",
      "Linear 更新日志页",
      "2026-10-03",
      "",
      "https://linear.app/synthetic",
    );
    web.referenceMedia = [await image("reverse-web-0")];
    web.recipe = fixtureRecipe("WEB");
    for (let i = 0; i < 4; i++) {
      const g = genes["reverse-web"][i],
        b = web.recipe.blocks[i];
      b.label = g.label;
      b.mark = g.mark;
      b.text = g.texts.join("\n");
      if (g.colors.length) b.palette = g.colors;
    }
    web.recipe.blocks[2].tokens = [
      { name: "区块", value: 52, unit: "px" },
      { name: "圆角", value: 6, unit: "px" },
    ];
    web.recipe.blocks[4].label = "复刻页";
    web.recipe.blocks[4].text = "组件样式由配方令牌构成";
    web.recipe.blocks[5].text = "无过渡";
    web.recipe.html =
      '<!doctype html><html lang="zh-CN"><style>body{background:#0f1013;color:#f7f8f8;font:13px Arial}h1{font-size:22px}</style><h1>Changelog</h1><p>合成复刻页，未抓取原网页</p></html>';
    let fn = make(
      "0416",
      "FN",
      "炉子 · 上下文接力",
      "2026-10-05",
      "合成功能界面",
      "",
    );
    fn.referenceMedia = await Promise.all(
      [0, 1, 2].map((i) => image("reverse-fn-" + i)),
    );
    fn.recipe = fixtureRecipe("FN");
    const approvedCases = [
      "点“上下文接力”后自动找出最近一段会话",
      "可换一段，显示总段数",
      "可找更早的会话",
      "选择接力目标，提示能否直接填入",
      "“只复制提示词”只写剪贴板",
      "“带到 X 继续”复制并打开应用",
      "会话只在本机，页脚说明不上传",
      "不可读目录给出红色提示条",
      "目标按钮名随选择变化",
    ];
    fn.recipe.blocks[5].cases.forEach((c, i) => (c.text = approvedCases[i]));
    fn.recipe.blocks[0].text = genes["reverse-fn"][0].texts[0];
    fn.recipe.blocks[3].mark = "推断";
    fn.recipe.blocks[3].text = genes["reverse-fn"][1].texts[0];
    fn.replicaDraft = {
      ...prepareReplica(fn, {
        text: "合成实现的逐条人工验收",
        media: await Promise.all(
          [0, 1, 2].map((i) => image("reverse-fn-rep-" + i)),
        ),
      }),
      id: "rep-fn",
      at: stamp,
      scores: { interaction: 3, copy: 4 },
      checks: fn.recipe.blocks[5].cases.map((c, i) => ({
        id: c.id,
        result: i !== 7,
      })),
    };
    fn = confirmReplica(fn, {
      ...fn.replicaDraft,
      note: "异常分支恢复失败，需要补上重试状态。",
    });
    delete fn.replicaDraft;
    const txt = make(
      "0412",
      "TXT",
      "产品发布帖的节奏",
      "2026-10-02",
      "过去三个月，我们把 17 个工作流挤进了一个按钮。\n\n今天它终于能交给你。不是又一个聊天框，而是能接住你上一段工作的地方。",
      "https://x.com/synthetic",
    );
    let done = make(
      "0408",
      "IMG",
      "野口勇展览海报",
      "2026-09-30",
      "",
      "https://example.test/synthetic",
    );
    done.referenceMedia = [await image("reverse-done-0")];
    done.recipe = structuredClone(poster.recipe);
    done.recipe.blocks.forEach((b) => (b.mark = "已验证"));
    done = confirmReplica(done, {
      ...prepareReplica(done, { media: [await image("reverse-done-1")] }),
      id: "rep-done",
      at: stamp,
      scores: { composition: 5, color: 5, font: 5, texture: 4 },
    });
    done.variations = await Promise.all(
      [2, 3].map(async (i) => ({
        id: "var-" + i,
        title: ["", "", "换主色 · 摄影展", "换标题 · 讲座"][i],
        at: stamp,
        agentId: "doubao",
        text: "",
        html: "",
        media: [await image("reverse-done-" + i)],
      })),
    );
    let end = make(
      "0406",
      "TXT",
      "先给结论，再给理由",
      "2026-09-28",
      "合成文字参照",
      "https://mp.weixin.qq.com/synthetic",
    );
    end.recipe = fixtureRecipe("TXT");
    end = confirmReplica(end, {
      ...prepareReplica(end, { text: "合成复刻正文" }),
      id: "rep-txt",
      at: stamp,
      scores: { structure: 5, tone: 5, techniques: 5 },
    });
    const state = seed();
    state.assets = [];
    state.notes = [];
    state.references = [];
    state.reverseRecords = empty ? [] : [poster, web, fn, txt, done, end];
    if (!empty)
      for (const r of [done, end]) {
        const a = makeAsset({
          type: "Skill",
          title: r.type === "IMG" ? "瑞士海报风格" : "先结论后理由",
          ...generateRecipeSkill(r),
          title: r.type === "IMG" ? "瑞士海报风格" : "先结论后理由",
        });
        state.assets.push(a);
        r.forge = {
          assetId: a.id,
          versionId: current(a).id,
          at: stamp,
          replicaId: r.replicas.at(-1).id,
        };
      }
    if (legacy) {
      const { createRecord, saveReply } = await import("../src/reverse.js");
      const r = createRecord(
        { text: "原句。原句。\n末句。", url: "https://example.test/old" },
        "旧备注",
      );
      r.id = "legacy-text";
      state.reverseRecords.push(r);
      const old = saveReply(
        state,
        r.id,
        JSON.stringify({
          report: {
            summary: "旧报告",
            structure: [
              {
                mark: "原文观察",
                text: "重叠引用",
                quote: "原句。",
                occurrence: 2,
              },
            ],
            techniques: [{ mark: "推断", text: "旧手法" }],
            reusable: [{ mark: "已验证", text: "旧标记" }],
          },
          candidates: [
            {
              type: "prompt",
              title: "旧Prompt候选",
              mark: "推断",
              content: "合成候选正文",
              description: "",
              tags: [],
            },
            {
              type: "scroll",
              title: "旧焚决候选",
              mark: "推断",
              text: "合成焚决",
              content: "合成焚决",
              description: "",
              tags: [],
            },
          ],
        }),
      );
      Object.assign(state, old);
      state.references = [
        {
          id: r.id,
          title: "旧参考链接",
          url: "https://example.test/link",
          note: "旧备注原样保留",
        },
      ];
    }
    await app.repository.write(state, { initialize: true });
    return { ...app, media };
  } catch (error) {
    await app.close();
    throw error;
  }
}

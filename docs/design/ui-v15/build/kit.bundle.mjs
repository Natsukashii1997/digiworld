// docs/design/ui-v15/build/kit-entry.jsx
import React31 from "react";
import { renderToStaticMarkup as R } from "react-dom/server";

// src/Assets.jsx
import React18, { useMemo as useMemo2, useState as useState15 } from "react";
import {
  Search,
  Plus as Plus3,
  Pin,
  Grid2X2,
  List,
  ArrowUpRight,
  Copy as Copy5,
  Download as Download4,
  Archive as Archive2,
  FileText as FileText2,
  Upload,
  PenLine as PenLine4,
  Folder,
  FolderSearch as FolderSearch3
} from "lucide-react";
import { strToU8 as strToU83 } from "fflate";

// src/skill-package.js
import { Inflate, zipSync, strToU8, strFromU8 } from "fflate";

// src/store.js
var now = () => (/* @__PURE__ */ new Date()).toISOString();
var uid = () => crypto.randomUUID();
function makeAsset(input) {
  const {
    title,
    type,
    description = "",
    content = "",
    tags = [],
    files = [],
    source = "\u4E2A\u4EBA\u521B\u5EFA",
    demo = false,
    references
  } = input;
  if (!title?.trim()) throw new Error("\u8BF7\u586B\u5199\u8D44\u4EA7\u540D\u79F0");
  if (!["Skill", "Prompt", "Workflow", "Rule"].includes(type))
    throw new Error("\u8BF7\u9009\u62E9\u8D44\u4EA7\u7C7B\u578B");
  if (type === "Skill" && !files.some((f) => /(^|\/)SKILL\.md$/.test(f.path)))
    throw new Error("Skill \u5305\u4E2D\u5FC5\u987B\u5305\u542B SKILL.md");
  const version = {
    id: uid(),
    at: now(),
    title: title.trim(),
    description,
    content,
    tags,
    files,
    source,
    ...references === void 0 ? {} : { references }
  };
  return {
    id: uid(),
    type,
    demo,
    favorite: false,
    archived: false,
    createdAt: now(),
    versions: [version]
  };
}
function current(asset) {
  return asset.versions.at(-1);
}
var seed = () => ({
  assets: [
    {
      type: "Skill",
      title: "\u8BBE\u8BA1\u7684\u6700\u540E\u4E00\u516C\u91CC",
      description: "\u4ECE\u6392\u7248\u5230\u5FAE\u4EA4\u4E92\uFF0C\u628A\u300C\u80FD\u7528\u300D\u6253\u78E8\u6210\u300C\u597D\u7528\u300D\u3002",
      tags: ["\u8BBE\u8BA1", "\u8D28\u91CF\u68C0\u67E5"],
      source: "\u5DE5\u4F5C\u53F0\u6F14\u793A\u8D44\u4EA7",
      content: "# \u8BBE\u8BA1\u7684\u6700\u540E\u4E00\u516C\u91CC\n\n\u9002\u7528\uFF1A\u5DF2\u5B8C\u6210\u521D\u7A3F\u7684\u4EA7\u54C1\u754C\u9762\u3002\n\n1. \u786E\u8BA4\u9875\u9762\u552F\u4E00\u4E3B\u4EFB\u52A1\u3002\n2. \u68C0\u67E5\u5B57\u4F53\u5C42\u7EA7\u3001\u7559\u767D\u3001\u5BF9\u9F50\u548C\u72B6\u6001\u5BF9\u6BD4\u5EA6\u3002\n3. \u9A8C\u8BC1\u952E\u76D8\u64CD\u4F5C\u3001\u7A84\u5C4F\u548C\u5F02\u5E38\u8DEF\u5F84\u3002\n4. \u4EA4\u4ED8\u5177\u4F53\u95EE\u9898\u6E05\u5355\u548C\u622A\u56FE\u8BC1\u636E\u3002",
      files: [
        {
          path: "SKILL.md",
          data: "# \u8BBE\u8BA1\u7684\u6700\u540E\u4E00\u516C\u91CC\n\n\u68C0\u67E5\u6392\u7248\u3001\u7559\u767D\u3001\u5BF9\u9F50\u3001\u952E\u76D8\u3001\u7A84\u5C4F\u548C\u5F02\u5E38\u8DEF\u5F84\u3002\n\u8F93\u51FA\u95EE\u9898\u6E05\u5355\u548C\u622A\u56FE\u8BC1\u636E\u3002",
          text: true
        }
      ]
    },
    {
      type: "Prompt",
      title: "\u628A\u6A21\u7CCA\u60F3\u6CD5\uFF0C\u53D8\u6210\u6E05\u6670\u95EE\u9898",
      description: "\u4E0D\u6025\u7740\u7ED9\u7B54\u6848\u3002\u5148\u627E\u5230\u771F\u6B63\u8981\u89E3\u51B3\u7684\u90A3\u4E2A\u95EE\u9898\u3002",
      tags: ["\u601D\u8003", "\u95EE\u9898\u5B9A\u4E49"],
      content: "\u8BF7\u5E2E\u6211\u68B3\u7406\u4EE5\u4E0B\u60F3\u6CD5\u3002\u5148\u533A\u5206\u4E8B\u5B9E\u3001\u5224\u65AD\u4E0E\u5047\u8BBE\uFF0C\u518D\u660E\u786E\u771F\u5B9E\u76EE\u6807\u3001\u5F53\u524D\u5DEE\u8DDD\u3001\u5173\u952E\u7EA6\u675F\u548C\u9700\u8981\u9A8C\u8BC1\u7684\u95EE\u9898\u3002\u4E0D\u8981\u76F4\u63A5\u8DF3\u5230\u65B9\u6848\uFF1B\u5982\u679C\u4FE1\u606F\u4E0D\u8DB3\uFF0C\u96C6\u4E2D\u63D0\u51FA\u4F1A\u6539\u53D8\u65B9\u5411\u7684\u5173\u952E\u95EE\u9898\u3002\n\n\u6211\u7684\u60F3\u6CD5\uFF1A\n[\u5728\u8FD9\u91CC\u8865\u5145\u80CC\u666F]"
    },
    {
      type: "Workflow",
      title: "\u4ECE\u7075\u611F\u5230\u4E0A\u7EBF",
      description: "\u8BA9\u4E00\u6B21\u7F51\u7AD9\u521B\u4F5C\uFF0C\u6709\u8D77\u70B9\u3001\u6709\u5224\u65AD\uFF0C\u4E5F\u6709\u4EA4\u4ED8\u6807\u51C6\u3002",
      tags: ["\u5F00\u53D1", "\u7F51\u7AD9"],
      content: "## \u8F93\u5165\n\u76EE\u6807\u7528\u6237\u3001\u6838\u5FC3\u4EFB\u52A1\u3001\u5185\u5BB9\u6750\u6599\u3001\u7EA6\u675F\u3002\n\n## \u8FC7\u7A0B\n1. \u5B9A\u4E49\u6700\u5C0F\u4EA4\u4ED8\u4E0E\u9A8C\u6536\u6807\u51C6\n2. \u8BBE\u8BA1\u5173\u952E\u9875\u9762\u5E76\u786E\u8BA4\u65B9\u5411\n3. \u5B9E\u73B0\u4E3B\u8DEF\u5F84\n4. \u6D4B\u8BD5\u7A7A\u6001\u3001\u9519\u8BEF\u6001\u3001\u79FB\u52A8\u7AEF\u548C\u952E\u76D8\n5. \u4EBA\u5DE5\u9A8C\u6536\u540E\u51B3\u5B9A\u662F\u5426\u90E8\u7F72\n\n## \u8F93\u51FA\n\u53EF\u8FD0\u884C\u7F51\u7AD9\u3001\u6D4B\u8BD5\u8BC1\u636E\u3001\u4F7F\u7528\u8BF4\u660E\u3002\n\n## \u8FB9\u754C\n\u90E8\u7F72\u3001\u4ED8\u8D39\u548C\u5916\u90E8\u6570\u636E\u5199\u5165\u9700\u8981\u5355\u72EC\u6388\u6743\u3002"
    },
    {
      type: "Prompt",
      title: "\u4E00\u6B21\u771F\u6B63\u6709\u7528\u7684\u590D\u76D8",
      description: "\u8FD8\u539F\u5224\u65AD\u5982\u4F55\u53D8\u5316\uFF0C\u8BA9\u4E00\u6B21\u7ECF\u5386\u6210\u4E3A\u4E0B\u6B21\u7684\u4F9D\u636E\u3002",
      tags: ["\u590D\u76D8", "\u77E5\u8BC6\u6C89\u6DC0"],
      content: "\u8BF7\u4F9D\u636E\u771F\u5B9E\u6750\u6599\u590D\u76D8\uFF0C\u4E0D\u8865\u9020\u4E8B\u5B9E\u3002\u6309\u8D77\u70B9\u8BA4\u77E5\u3001\u53D1\u751F\u7684\u4E8B\u5B9E\u3001\u504F\u5DEE\u3001\u8BA4\u77E5\u53D8\u5316\u3001\u5F53\u524D\u5224\u65AD\u3001\u4E0B\u4E00\u6B65\u6574\u7406\u3002\u533A\u5206\u7A33\u5B9A\u673A\u5236\u4E0E\u4EC5\u9002\u7528\u4E8E\u5F53\u65F6\u60C5\u5883\u7684\u7B56\u7565\uFF0C\u6807\u660E\u8BC1\u636E\u4E0D\u8DB3\u7684\u90E8\u5206\u3002"
    },
    {
      type: "Skill",
      title: "\u6709\u4F9D\u636E\u7684\u6DF1\u5EA6\u7814\u7A76",
      description: "\u4ECE\u95EE\u9898\u51FA\u53D1\uFF0C\u6838\u5BF9\u6765\u6E90\uFF0C\u4FDD\u7559\u4E0D\u786E\u5B9A\u6027\u3002",
      tags: ["\u7814\u7A76", "\u8BC1\u636E"],
      content: "# \u6709\u4F9D\u636E\u7684\u6DF1\u5EA6\u7814\u7A76\n\n\u5148\u5B9A\u4E49\u9700\u8981\u6D88\u9664\u7684\u4E0D\u786E\u5B9A\u6027\uFF0C\u518D\u4F18\u5148\u67E5\u627E\u4E00\u624B\u8D44\u6599\u3002\u533A\u5206\u6765\u6E90\u4E8B\u5B9E\u4E0E\u5206\u6790\u63A8\u65AD\uFF0C\u4EA4\u53C9\u6838\u5BF9\u5173\u952E\u7ED3\u8BBA\u3002\u4EA4\u4ED8\u6765\u6E90\u3001\u9650\u5236\u4E0E\u4E0B\u4E00\u6B65\u3002",
      files: [
        {
          path: "SKILL.md",
          data: "# \u6709\u4F9D\u636E\u7684\u6DF1\u5EA6\u7814\u7A76\n\n\u5B9A\u4E49\u95EE\u9898\uFF0C\u5BFB\u627E\u4E00\u624B\u6765\u6E90\uFF0C\u533A\u5206\u4E8B\u5B9E\u4E0E\u63A8\u65AD\uFF0C\u4EA4\u53C9\u6838\u5BF9\u7ED3\u8BBA\uFF0C\u4FDD\u7559\u9650\u5236\u3002",
          text: true
        }
      ]
    },
    {
      type: "Workflow",
      title: "\u628A\u7ECF\u9A8C\uFF0C\u7559\u5728\u77E5\u8BC6\u91CC",
      description: "\u539F\u59CB\u8D44\u6599 \u2192 \u7EFC\u5408\u63D0\u70BC \u2192 \u4EBA\u5DE5\u786E\u8BA4 \u2192 \u53EF\u590D\u7528\u77E5\u8BC6\u3002",
      tags: ["\u77E5\u8BC6\u6C89\u6DC0", "Obsidian"],
      content: "## \u8F93\u5165\n\u4F1A\u8BAE\u8BB0\u5F55\u3001\u9879\u76EE\u590D\u76D8\u6216\u65E5\u5E38\u60F3\u6CD5\u3002\n\n## \u6D41\u7A0B\n1. \u539F\u59CB\u8D44\u6599\u4FDD\u7559\u4E0D\u52A8\n2. \u5173\u8054\u5DF2\u6709\u4E3B\u9898\u5E76\u6574\u7406\u8BC1\u636E\n3. \u6807\u8BB0\u65B0\u7ED3\u8BBA\u3001\u51B2\u7A81\u4E0E\u9002\u7528\u8FB9\u754C\n4. \u751F\u6210\u77E5\u8BC6\u5019\u9009\n5. \u7ECF\u672C\u4EBA\u786E\u8BA4\u540E\u5199\u5165\u6B63\u5F0F\u77E5\u8BC6\n\n## \u7981\u6B62\n\u4E0D\u8981\u5C06\u6536\u85CF\u89C2\u70B9\u5F53\u4F5C\u672C\u4EBA\u89C2\u70B9\uFF1B\u672A\u7ECF\u786E\u8BA4\u4E0D\u664B\u5347\u6B63\u5F0F\u77E5\u8BC6\u3002"
    }
  ].map((a, i) => ({
    ...makeAsset({ ...a, demo: true, source: "\u5DE5\u4F5C\u53F0\u6F14\u793A\u8D44\u4EA7" }),
    favorite: i === 0 || i === 1,
    cover: i
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
    enabled: false
  },
  model: { provider: "", model: "", endpoint: "" }
});

// src/SkillDelivery.jsx
import React5, { useEffect as useEffect4, useState as useState3, useRef as useRef4 } from "react";
import { Copy, Download, PenLine, RefreshCw } from "lucide-react";

// src/serialization.js
function stringify(value, spacing = 0) {
  return JSON.stringify(
    value,
    (_key, item) => {
      if (!(item instanceof Uint8Array)) return item;
      let binary = "";
      for (let i = 0; i < item.length; i += 8192)
        binary += String.fromCharCode(...item.subarray(i, i + 8192));
      return { __binary: btoa(binary) };
    },
    spacing
  );
}
function parse(text) {
  return JSON.parse(text, (_key, item) => {
    if (item && typeof item === "object" && Object.keys(item).length === 1) {
      if (typeof item.__binary === "string") {
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          item.__binary
        ))
          throw new Error("\u4E8C\u8FDB\u5236\u7F16\u7801\u65E0\u6548");
        return Uint8Array.from(atob(item.__binary), (c) => c.charCodeAt(0));
      }
      if (Array.isArray(item.__bytes)) {
        if (item.__bytes.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
          throw new Error("\u4E8C\u8FDB\u5236\u6570\u636E\u65E0\u6548");
        return new Uint8Array(item.__bytes);
      }
    }
    return item;
  });
}

// src/api.js
var sessionPromise;
function session() {
  if (!sessionPromise)
    sessionPromise = fetch("/api/session", {
      headers: { "X-Workbench-Client": "1" }
    }).then(async (r2) => {
      if (!r2.ok) throw new Error("\u672C\u5730\u670D\u52A1\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u542F\u52A8\u5DE5\u4F5C\u53F0");
      return r2.json();
    }).catch((e) => {
      sessionPromise = null;
      throw e;
    });
  return sessionPromise;
}
async function request(path, data, method = data === void 0 ? "GET" : "POST", retry = true) {
  const { token } = await session();
  let r2;
  try {
    r2 = await fetch("/api" + path, {
      method,
      headers: {
        "X-Workbench-Token": token,
        ...data === void 0 ? {} : { "Content-Type": "application/json" }
      },
      ...data === void 0 ? {} : { body: stringify(data) }
    });
  } catch {
    throw new Error(
      "\u672C\u5730\u670D\u52A1\u8FDE\u63A5\u4E2D\u65AD\u3002\u64CD\u4F5C\u7ED3\u679C\u672A\u786E\u8BA4\uFF0C\u8BF7\u4FDD\u7559\u5F53\u524D\u5185\u5BB9\uFF0C\u91CD\u65B0\u8FDE\u63A5\u540E\u6838\u5BF9\u3002"
    );
  }
  if (r2.status === 403 && retry) {
    sessionPromise = null;
    return request(path, data, method, false);
  }
  const result = parse(await r2.text());
  if (!r2.ok)
    throw Object.assign(new Error(result.error || "\u672C\u5730\u670D\u52A1\u5904\u7406\u5931\u8D25"), {
      status: r2.status,
      operationNotStarted: result.operationNotStarted === true,
      unknownResult: result.unknownResult === true
    });
  return result;
}

// src/components.jsx
import React4, { useEffect as useEffect3, useRef as useRef3 } from "react";
import { X, Layers, Quote, Workflow, Flame } from "lucide-react";

// src/asset-usage.js
var usageTime = (record) => record.usedAt || record.at;
function usageByAsset(assets, activity = []) {
  const groups = /* @__PURE__ */ new Map();
  for (const record of activity) {
    if (!groups.has(record.assetId)) groups.set(record.assetId, []);
    groups.get(record.assetId).push(record);
  }
  return new Map(
    assets.map((asset) => [
      asset.id,
      usageOf(asset, groups.get(asset.id) || [])
    ])
  );
}
function usageOf(asset, activity = []) {
  const records = activity.filter((r2) => r2.assetId === asset.id);
  const uses = records.filter((r2) => r2.kind === "use");
  const versionId = asset.versions.at(-1).id;
  const currentUses = uses.filter((r2) => r2.versionId === versionId);
  const latest = (items) => items.reduce((a, b) => !a || b.at >= a.at ? b : a, null);
  const feedback = latest(
    records.filter((r2) => r2.kind === "feedback" && r2.versionId === versionId)
  );
  const verified = feedback?.rating === "good" && currentUses.some((r2) => r2.id === feedback.useId);
  return {
    count: uses.length,
    lastAt: uses.reduce(
      (at, use) => usageTime(use) > at ? usageTime(use) : at,
      ""
    ),
    currentUses,
    feedback,
    stage: verified ? 3 : currentUses.length ? 2 : 1,
    evidence: !currentUses.length ? "\u5F53\u524D\u7248\u672C\u5C1A\u65E0\u4F7F\u7528\u8BC1\u636E" : feedback?.rating === "improve" ? "\u5F53\u524D\u7248\u672C\u9700\u6539\u8FDB \xB7 \u672C\u4EBA\u53CD\u9988" : verified ? "\u5F53\u524D\u7248\u672C\u597D\u7528 \xB7 \u672C\u4EBA\u53CD\u9988" : "\u5DF2\u6210\u529F\u590D\u5236 \xB7 \u672A\u9A8C\u8BC1\u5B9E\u9645\u6548\u679C"
  };
}

// src/pixel.jsx
import React from "react";

// src/sprites-refs.js
var REF_SPRITES = {
  koromon: {
    name: "\u6EDA\u7403\u517D",
    stage: "\u5E7C\u5E74\u671F II",
    palette: { K: "#000002", A: "#2f2b2e", B: "#5a2022", C: "#e5669d", D: "#f2b5c7", E: "#fcdbe9", F: "#fcfffe" },
    frames: [
      [
        "...................K.....",
        "....K.............KEK....",
        "...KEK............KEK....",
        "...KEEK...........KEK....",
        "...KEEK...........KEEK...",
        "..KEEEK............KEEK..",
        ".KEDKK...............KEK.",
        "KEEKKKKK..........KKKKDDK",
        "KEDDDEEEK........KEEEDDDK",
        "KEEDDKKEEK......KEEKKDDK.",
        ".KDKK..KEKKKKKKKEEK..KK..",
        "..K....KEEEEEEEEEK.......",
        ".....KKEEEEEEEEEEEK......",
        "....KEEEEEEEEEEEEEEK.....",
        "...KEEKKKEEEEEEEKKKEK....",
        "...KEKKFFEEEEEEEAFFKEK...",
        "...KEKBKBKEEEEEKBKBKEK...",
        "..KEEKDFBKEEEEEKDFBKEEK..",
        "..KEEEKKKEEEEEEEKKKEEEK..",
        ".KEEEDDEEKKKKKKKEEDDEEEK.",
        ".KEEEKKKKAAAAAAAKKKKEEEK.",
        ".KEEEEKAFAAAAAAAFAKEEEEK.",
        ".KEEEEEKAAAAAAAAAKEEEEDK.",
        "..KDEEEKCCCCCCCCCKEEEDK..",
        "...KDDEEKCCCCCCCKEEEDK...",
        "....KKDEEKECCCEKEEEKK....",
        "......KKEEKEEEKEEKK......",
        "........KKKKKKKKK........"
      ]
    ]
  },
  agumon: {
    name: "\u4E9A\u53E4\u517D",
    stage: "\u6210\u957F\u671F",
    palette: { K: "#000104", A: "#229950", B: "#dd7b35", C: "#f7ad51", D: "#eede4c", E: "#fbfdfd" },
    frames: [
      [
        "...............KKKKKK......KKKKK.........................",
        ".............KKDDDDDDKKKKKKDDDDDKK.......................",
        "............KDDDDDDDDDKDDDDBBDDDDDK......................",
        "...........KDDDDDDDDDDDKDDDDDBBDDDDK.....................",
        "..........KKDDDDDDDDDDDDKDDDDDDDDDDK.....................",
        ".........KKBDDDDKKKKDDDDKDDDDDDDDKDK.....................",
        "........KBDDDDDKAAAAKDDDKDDDDDDDDDKK.....................",
        "........KBDDDKKAEKKEAKDDDDDDDDDDDDDKK....................",
        "........KBKDDDKAKKKEAKDDDDDDDDDDDDDDDKK..................",
        "........KBDDDDKAKKKKAKDDDDDDDDDDDDDDDDDK.................",
        "........KBDDDDKAKKKKAKKDDDDDDDDDDDDDDDDDK................",
        "........KBDDDDKAAKKAAKKDDDDDDDDDDDDDDDDDDK...............",
        "........KBDDDDDKAAAAKDDDDDDDDDDDDDDDDDDDDK...............",
        "........KBDDDDDDKKKKDDDDDDDDDDDDDKKDDDDDKDK..............",
        "........KBDDDDDDDDDDDDDDDDDDDDDDDDKDDDDDKDK..............",
        "........KBDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDK..............",
        "........KBBDDDDKDDDDDDDDDDDDDDDDDDDDDDDDDDK..............",
        "........KBBDDDDDKDDDDDDDDDDDDDDDDDDDDDDDDDK..............",
        ".........KBBDDDDDKKKKDDDDDEDDDDDDDDDDDDDDDK..............",
        "..........KBDDDDDEDDDKKKKKKKDDDDDDDDDDDDDK...............",
        "..........KBBDDDDDDDDEDDDDDDKKKDDDDDDDDDDK...............",
        "...........KBBDDDDDDDDDDDDDDDDDKKKKKKKKKK................",
        "............KBBBDDDDDDDDDDDDDDDD.DDDDDDDK................",
        ".............KKBKKDDDDDDDDDDDDDDDDDDDDDK.................",
        "..............KBBBKKBBBKKKKKBBBBBBBBBKK.........KKKK.....",
        "............KKKBBBBBBBBBBBBBKKKKKKKKK.........KKEEEEKKKK.",
        "...........KDDDBBBBBBBBBBBBBKKK............KKKEEEEKKEEEEK",
        "..........KDDDDDDDBBBBBBBKKKBDDK.........KKDDDKEEKKEEEKK.",
        "..........KDDDDDDDDDBBBBBBBBDDDDK.......KDDDDDDKKKBEEK...",
        ".........KDDDDDDDDDDDDDDDDDDDDDDDK.....KDDDDDBBKBBBKK....",
        ".........KDDDDBBDDDDDDDDDDDDDKDDDDK..KKDDDDDBKKBBBKKKKK..",
        "........KDDDDBKKDDDDDDDDDDDDDKBDDDDKKDDDDDDBKBBBBKBKEEEKK",
        ".......KDDDDDKBKDDDDDDDDDDDDDKBBDDDDKDDDDDDBBBBBBBBKEEEEK",
        "......KDDDDDKKBBKDDDDBBDDBBDDKKBBDDKDDDDDDBBBBBBBBBKKKKK.",
        "......KDDDDBKKBBBKKKBDDDDDBKKK.KBBDDDDDDBBBBBBBBBBKK.....",
        ".....KDDDDBKKBBBBBBBDDDDDDDBBK..KBBBDDBBBBBBBBKKKK.......",
        "....KDDDDDKEKBBDDDDDDDDDDDDDDBK..KBBBBBBBBKKKK...........",
        "....KDDDDDKEKBDDDDDDDDDDDDDDDDK...KBBBBKKK...............",
        "....KDDDDDDKBBDDDDDDDDDDDDDDDDK....KKKK..................",
        "...KDDDDDDDKBBDDDDDDDDDDDDDDDDK..........................",
        "...KDDDDDDDKBBDDDDDDDDDDDDDDDDK..........................",
        "..KBDDDDDDDKBBBDCDDDDDDDDDDDDDK..........................",
        "..KBDDDDDDDKBBBDDDDDDDDDDDDDDBK..........................",
        "..KBDDDDDBDDKBDKDDDDDDDDDDDDBBK..........................",
        "..KBDBDDDKDDKBDDKBDDDDDDDDDBBBDK.........................",
        "..KBDKDDDKDKKDDDDKBBBBBBBBKBBDDK.........................",
        "..KBDKDDDKKEKDDDDBBBBBBBKKBBBDDDK........................",
        "..KBDKBKKBKEKDDDDBKKKKKKBBBBBDDDK........................",
        "..KKKEKEEKKEKDDDBK......KBBBBDDDK........................",
        "...KEEKEEEKKKDDBBK.......KBBBBDDK........................",
        "...KEEKKEEKKBDBBK.......KBBBBBBK.........................",
        "....KEEKEEKBBBBBK.......KBBBBBBK.........................",
        ".....KEKKEKBBBBBBK.....KBBBBDDKKK........................",
        "......KKKKKDDDBBBK.....KBBBDDDDDDKKKKKK..................",
        "....KKBBBBKKKDDDBK.....KBBDDDDDKKDDDKBBK.................",
        "..KKBKKKBKDDDDDDBBK...KBBBDDDDDDDKBKEKBEK................",
        ".K..KKEBKEKDDDDDBBK...KBBBBDDDDDKEKEEEKEEK...............",
        "KE..KEEKEEEKDDBBBBK...KBBBBBBDDKEEEKEEEKEEK..............",
        "KEEKEEKEEEEKBBBBBBK....KBBBBBBBKEEEEKEEKKEK..............",
        "KKKKKKKKKKKKKKKKKK......KKKKKKKKKKKKKKKKKKK.............."
      ]
    ]
  },
  greymon: {
    name: "\u66B4\u9F99\u517D",
    stage: "\u6210\u719F\u671F",
    palette: { K: "#000202", A: "#582020", B: "#96193a", C: "#894528", D: "#1d569d", E: "#a4866b", F: "#d58d3c", G: "#db6a7b", H: "#f68b51", I: "#f4af58", J: "#fefdfd" },
    frames: [
      [
        "..............KK.......................................",
        ".............KEK....KK.................................",
        "............KEAK...KAK.................................",
        "...........KEAK...KAAK.................................",
        "..........KEEAK..KAEK...................K..............",
        ".........KEEAK...KAAK..................KEK.............",
        ".........KEAAK...KAAK..................KEK.............",
        "........KEEAK....KAKAK.................KEK.............",
        "........KEAAK....KKKKKKK..............KEEK.............",
        ".......KEEAAKK..KAKKEEEKKKKK..........KEAK.............",
        "......KKEEAKAEKKKKEEAKKEEEEAK.......KKEAAK.............",
        ".....KEEKKKAAAEEEEAAKEAAAAAAAK..K.KKKEAAAK.............",
        ".....KEEAAAAAAAAEAAKEAAKKKKAAAKKKKEEKAAAAK.............",
        "....KEEAAAAAAAAAAAAKAAKJBBKKAKEEKAAAKKAKK..............",
        "....KEAAAAAAAAAAAAAKAKIJKBKKAKAAKKAAAKK................",
        "....KKKKKKAAAAAAAAAAKKBKKJKAAKAAAKKKK..................",
        "....KJBBJBKAAAAAAAAAAKBBIKAAAAKKKK.....................",
        "....KJKBJKJKKKKKAAAAAAKKKAAAAKAAAKK....................",
        "....KKEGKKJBGJBBKKAAAAAAAAAAEKAAAAK....................",
        ".....KEK.KJKK.GKBJKKKKKKKAAEAAKAAAAK....KKKK...........",
        "......K...K.KJKBBJBBJJKEKKAAAAKKKKKK....KIIIKK.........",
        "............KKBBGJBBBJKIIKKAAAKIIIK......KKIIIKK.......",
        "...........KJKBGBBBBBGKIKKIKKKIDDDK........KIIIIK......",
        "..........KJKBGGBBGJGKKKDIIIFIDIIK..........KIIIIK.....",
        "........KKKJBGBBJGGJKDIIIDIIIIIIFK...........KIIDDK....",
        "........KJKBBBBBJJKKIIDIIDIIKIDDDK............KDDIIK...",
        "........KJBBJBGGKKIIIIDIIDIKIDIIDK............KDIIIK...",
        ".......KIKGGJJKKIDDIIIDIDDKHIIIDDK.............KIIIIK..",
        "........KIKKKKKIIIDIIDDIKIIEKIIDDIIK.KKK........KIDIIK..",
        ".........KHIIIIHIKKKKKKKHIIEKIDIIIIIKIIIK........KIIIIK.",
        "..........KHHHIKK.KKHHHHIIEKIIIIIIIIJJJIIK.......KIIIIK.",
        "...........KKKK....KHKIIIEKIIIIDIEKHKJEAIIIK......KIDDIIK",
        "..................KKKEKEKIIIIIIDHEKHHKJKIIIIIKK....KDDDDIK",
        ".................KIDIIIIIIIIDDEKHEKKKKIKEKIIIIIK...KDIIDDK",
        "..KKKK..........KIIDIIIHEKIIDDIEKHKIIEKIIIEKIAJIK...KIIIIDK",
        ".KJJIIK........KIIKDDHEKEKEKDDHHEKHKJIIIEKIEKIKJJIK..KIIIIIIK",
        "KJJIIIIKKKKKKKKIIIKIDEKIIIEKEKEKEKHKJJIIKKIIIKJKK..KIIIIIIIK",
        "KJKKIIIEKEKIIIIIIEKIHKHEKIIIIIIIHEKKKKKKDIKKKKKJJKKIIIIDIIIK",
        "KKJJKKIIIEKIIIIIIEKHKEKIIIIIIEKEKEKFHKIDDIIIIIKKKKDDIIIIIDIIK",
        "..KKKIIIKIIIEKIIIEKKKIIIIIIIIIIIIIIDIIIDDDIIIIIDDIIIIDIK.",
        ".KIIIIIKIIIEKHHHHK.KIIIIIIDIIIIIIDDIIIIIIIIIIIIDIIIIDIK.",
        "KJJIIIIKJIIKHKKK..KIDIIIIIDDDIIDDEKEKEKEKIIIIIIIIIDDIIIDIK.",
        "KJJIKKKJJIKKK....KDDIIIIIIIIDDDDEKIKIIEKEKIIIIIIIDDIIIDK..",
        "KJKK..KJKKK......KDIIIIIIIIIIIIEKDKIDDDDEKEKIIIDIIDIIIDK..",
        ".K....KJK......KKKIIDIIIIIDDIIEKDIKDDDDDDIEKKIDIIDIIIK...",
        ".......K......KDIKIDDIIIIIIIDDDHKDDIIIIDDIKIDIDDIIK....",
        ".............KDDDKDDIIIIIIIIIDDIKDIIIIIIIDKIDIDDIK.....",
        "............KIIIDDIIIIIIIIIIIIHHHIIDDDDIIIKIDIDDK......",
        "............KDIIIIKDHIIIIIIIIHHKHHDDDIADIIKIDIDK.......",
        "...........KIDDDIIEKKHHIIIIIHHHHKHHDEKIIEKIDIKDDKK........",
        "...........KIIIIDEKIHKHHHHHHHHHHKHDIEKIIEKHIKIDKK.........",
        "...........KIIEKIEKIIHHKIHHIHHHHHKHHEKIIIIEKKKKK...........",
        "............KIEKIEKEKHHKKKKHHHHHHHKHEKIIIIIEKIK.............",
        ".............KIIIIEKHHIK.KKKKKKKKKEKIIIIIIEKIK............",
        "..............KIIIIEKEKEKK.........KKIIIIHHEKIK............",
        "..............KKIIIIHHK..........KEKEKIHHEKIIK............",
        "........KKKKKKEKIIIIIIHK..........KHHEKEKHHIIIK...........",
        ".......KIIKKHIIEKIIIIIIHK.........KIIIIIIIIIK...........",
        "......KJHHHHIIIIEKEKEKIHHHK........KIIIHIIIIIIIK..........",
        ".....K.KJJIIKIIIIIIIHHHK.......KHIIIIIIIIIIIK..........",
        "....KEKJJEIKJJIIIIIHKKK.......KJJHHKJJIIIIJJK..........",
        "....KKKEKKKJJJIIKKKK.........KJJEHHKJEIIKIEJJK.........",
        "......KKKKEEKKKK.............KJEKKKKJEKK.KKEJK.........",
        ".........KKK.................KKK...KJKK....KEK.........",
        "....................................KK......KK........."
      ]
    ]
  },
  bakemon: {
    name: "\u731B\u9B3C\u517D",
    palette: { K: "#000001", A: "#b1042c", B: "#862a96", C: "#87858b", D: "#fcfeff" },
    frames: [
      [
        ".................KKKKKKKKK...................",
        "..............KKKDDDDDDDDDKK.................",
        "............KKDDDDDDDDDDDDDDKK...............",
        "...........KKDDDDDDDDDDDDDDDDKK..............",
        "..........KDDDDDDDDDDDDDDDDDDDDK.............",
        ".........KDDDDDDDDDDDDDDDDDDDDDDK............",
        ".........KDKKKDDDDDDDKKKDDDDDDDDDK...........",
        ".........KDKKKKDDDDCKKKKKDDDDDDDDK...........",
        "........KDKKKKKDDDDCKKKKKDDDDDDDDKK..........",
        "........KDKKKKKDDDDCKKKKKDDDDDDDDDK..........",
        "........KDDKKKDDDDDDDKKKDDDDDDDDDDK..........",
        "........KDDDDDDDDDDDDDDDDDDDDDDDDDDK.........",
        ".......KDDDKKKKKKKKKKKKKDDDDDDDDDDDK.........",
        ".......KDDKAAAAAAAAAAAAAKDDDDDDDDDDDK........",
        ".......KDDKDDKKDDKDCKDKKKDDDDDDDDDDDK........",
        "......KKDDKDKBKDKKDKKDBBKDDDDDDDDDDDK........",
        "....KKKKDDKDKBKDKKDKKDBBKDDDDDDDDDDDKC.......",
        "...KDDDDDDDKBBBKBKKBBKBBKDDDDDDDDDDDDK.......",
        "..KDDDDDDDDDKBBBBBBBBBBBKDKKDDDDDDDDDK.......",
        "..KDDDDDDDDDKBBBBAAAAAAKDDDDKKDDDDDDDDK......",
        ".KDDDDDDKDDKKBKAAAAKAAAKDKDDDDKDDDDDDDK......",
        ".KDDDDDDKDKDKKDKKCKDKAKDDKDDDDDDDDDDDDDK.....",
        "KDDDKDDDKDKDDKDKKDKDDKKDKDDDDDDDDDDDDDDK.....",
        "KDDDKKDKKDKAAAAAAAAAAKDKDDDDDDDDDDDKDDDDK....",
        "KDDDDKKKKDDKKKKKKKKKKDDKDDDDDKDDDDDKDDDDDK...",
        "KDDDDKK.KDDDDDDDDDDDDDKDDDDKKKDDDDDDDKDKDDKK.",
        "KDKDKK..KDDDDDDDDDDDDDKDDDKKDDDDDDKDDKDDDDDK.",
        "KDKKK...KDDDDDDDDDDDDDKDDDKDDDDDDDDKDDKDDDDK.",
        "KDKK....KDDDKDDDDDDDDDKDDKDDDDDDDKDKDDKDDDDK.",
        "KK.....KDDDDKKDDDDDDDDKDKDDDDDDDDKDKKDKKKDDD.",
        ".K.....KDDDDDDDDDDDDDDDKDDDDDDDKDDDDKDKKKKDDK",
        "......KDDDDDDDKDDDDDDDDDDKDDDDDKKDDDKDKKKKKDK",
        "......KDDDKDDKKDDDKDDDDDDKDDDDDKKDDDKKKDKKKKK",
        "......KDKDKDDKDDDDKDKDDKDDDDDDDKKDDDKKKK.C.KK",
        "......KKKDKDDKDDDDKDKDDKCDDDDDDKKDDDKKKK.C.KK",
        "......KKKDDDDKDDDDDDKDDKKKCDDDDKKKDDKKKK...K.",
        "........KDDDKKKDDDKDKKDKK.KDDKDKKKDDKKK......",
        "........KDDDCKKKDDKK.KDKK.KDDKDK.KDK.K.......",
        ".........KDDDK.KDDDK..KK...KDDDK.KDK.........",
        ".........KDKDK..KDDK...K...KKDK..KK..........",
        ".........KDKK....KDK........KDK..............",
        "..........KK.....KK.........KDK..............",
        ".................K..........KK..............."
      ]
    ]
  },
  numemon: {
    name: "\u5927\u4FBF\u517D",
    palette: { K: "#000101", A: "#186e43", B: "#923733", C: "#c23778", D: "#9aaf3f", E: "#8655ae", F: "#87858c", G: "#ea3d73", H: "#faaaad", I: "#fdfeff" },
    frames: [
      [
        ".......KKK......KKKK................",
        "......KIIIK....KIIIKK...............",
        ".....KIBBIIK..KIIBHIIK..............",
        ".....KIIKIIK..KIBKHIIK..............",
        ".....KIBBIIK..KIBBHIIK..............",
        ".....KIIIIAK..KIIIIAAK..............",
        "......KKKAK....KKKAKK...............",
        "........KDK......KDKK...............",
        "........KDKK.....KDKK...............",
        "........KDKK.....AK.................",
        ".........KDK....KDK.................",
        ".........KDK...KKDKKK...............",
        ".........KDKKKKKKDKKK...............",
        ".......KKDFEEEDDDDDAAK..............",
        ".....KKDDDDDDDDDDDDDDDK.............",
        "....KDDDDDDDDDDDDDDDDDEK............",
        "....KDAAAAAAADDDDDADDDEK............",
        "....KDKKKKKKKKDDDDKDDDEEKK..........",
        ".....KIKCIICCKKKKKIKKDDDDAK.........",
        ".....KIIKIIKKIIKKIIKKDDDDAK.........",
        "......KKAKKBBKKBBKBKKDDFFFK.........",
        "......KKDKBBBBBBBBBKKDDEEEK.........",
        ".......KKKBBBBBBBBBKKADEEEA.........",
        ".......KKKKKKKKKKKBBBKDDDDAK........",
        ".......KK.CKK....CKBBKDDDDAK........",
        ".......KK.CKK....CKBBKDDDDAK........",
        "......K..CK....CCCCKKKDDDDDK........",
        ".....K...K...CKCCKCKKKDDFEDAKK......",
        ".....K..K..CCKIKKIKIIKDDDDDAKK......",
        ".....K..K.GCCKKKKIKIIKDDDDDAKK......",
        "....KK.G.G.CKDDAKKKKKADDDDDDAKK.....",
        "....KK....CKKKDDDDDDDDDDDDADDAK.....",
        "....KK.G.CKAADKAADDDDDEEFDADDDAKKKKK",
        "...KKK...CKAADAAADDDDDEEFDADDDAKKKKK",
        "..KDDKCCCKADDDDDDDDDDDEEFDDKADDDDDDK",
        ".KDDDDKKKADDDDDDDDDDDDDDDDDDAAAAAAK.",
        "KDDAAAAAAAAAAADDDDDDDDAAAAADDDKKKK..",
        "KDDAAAAAAAAAAADDDDDDDDAAAAADDDKKKK..",
        "KKKKKKKKKKKKKKAAAAAAAAKKKKKKKK......",
        "..............KKKKKKKK.............."
      ]
    ]
  },
  mecha: {
    name: "\u673A\u68B0\u7CFB",
    palette: { K: "#010303", A: "#2e2c2f", B: "#6c3a2d", C: "#44464c", D: "#ac062b", E: "#16559c", F: "#84828d", G: "#e3ae50", H: "#f4937d", I: "#b4b0b8", J: "#e2e0ea", L: "#fcfdfd" },
    frames: [
      [
        ".....................................KKKKKK.................",
        ".............KKKKKK................KKIII.FIKK...............",
        "............KIIIJIFKKK............KIIIKK..CIIKK.............",
        "...........KIIKK.IIFIIK..........KI.FKFFK..KIIKK............",
        "..........KJJKFFKIIFFIIKK........K..KFKKKI.KIIIKKKK.........",
        "..........K.KFKKKKIIKFIKIK.......K..KFKKKI.KFFIKIKIK........",
        "..........K.KFKKKKIIKFFIAK....KK.KJ.KFKKKI.KFFKKIKDIK.......",
        "..........KIKFKKKI.IKFFKCIK...KCKKII.KKKIIIKFFKICKDKIK......",
        "..........KIIKKKII.KF.KIICK.KKKCCKFI...IIIKFF.KIAFKKIK......",
        "..........KFIIIIIIFKFFKIFFK.KCKKCCKCI.JIFKFFFKICFKFFFK......",
        "...........KFIIIIKKFFFKIFFKKKCCKKCAKKKKKKFFFFKICFKFAFK......",
        "............KKKKKFFFFKICFFKIKKCCKKCKFFFFFKKFIIKFFKFFFK......",
        ".............KFFFFFKKICFFKFIIKKCCKKCKKFFKIIKKKFFKKKKK.......",
        "..............KKFKKIICFFFKFICIKKCCKACKKKIICFFFFFKFKDK.......",
        "...............KKKFFF..KKFFFCFKCKCCKACKCKKFFFFFKFFKDK.......",
        "..................KKKKKKDKFAFFKCCKCAKCKCAAKKKKKFFAKK........",
        "......................KDKKKFFKCKKKAAAKCAAAKDKAKKKFK.........",
        ".......................KCKKKKKKCKKKKKKKKACKDDKFFFFK.........",
        "...................KKKKCAKKIIKCAKIIIIFFFKKKDKKKKKFFK........",
        "..................KIIK.CKKIKKCCKKKKKIIFFFFKKII.FKK.K........",
        ".................KDDKCCAKKKKCCAKKKKKKIFFFFKKKFFKKKKK...KKK..",
        ".................KHDKCCKIIKCACKFFIFKKIFFFKHHDFKIKIIFK.KIIIK.",
        "................KDDKAKKKKKCCAKKIICFKKIFFFKHDDKIKIICCK.KIIIFK",
        "................KKKCCCCCCCAKKKICFFAKKIFFKKDDDKIKIC.FFKKIIIFK",
        "................KCCCCCCCCAAAKIFCFCFKKIFFKIKKKIKIICFFKKKIIIFK",
        "...............KCCCCCCCCAKAAKFFAAFFKKIFFKIIIIIKIICFKKKCCCCFK",
        "..............KCCCCAACCKKKAAKFAFCFKKKIFFK.....KIICKKFKIIIFCK",
        ".............KCCCCCCCAKDKKAKKKFFKKIIKIFFKFFFFFKIICKFFKIIIFCK",
        "............KCCCCCCCAKDDKACKDKKKIIKKKIFFKIIIIIAIICFFCKCCIFFK",
        "...........K.FCIFFICCKKKACCKDKIIKKFKCIFIFKCCCCCKFFCCKIIICFAK",
        "...........KCCCCCCCCCKAAAACKKKKKIIKIIFFIFKFFFFFCKFFKKIIICFCK",
        "...........KCKACCCKKCCAAAKKIIIIIIKIIFFJFFFKKKKKKKKKKIIIIFAFK",
        "............KCCCCCCCACCKKKIKKKKKKFFFF.IFFFKKIIIIFAFKCCIFFAFK",
        "............KCCCCCCCAKKKKKKAKFFFFFII.FFFFKDKIKKIFCFKIICFFCK.",
        "............KCKKCKCCKKKCKCAAKFFFFFFFFFFFKDDKIGKIFCFKIICFCFK.",
        ".............KKCKCKCKAKACCAKKKKKKKKKKKKKDDKKIKKIFCKKKICFCFK.",
        ".............KCKCKCKAAAACKKDKFKFFKBKKKFFKKCKIIIIFKIFKKFAFK..",
        ".............KCCCCCCCAAAKFKDKKIKKKKDKIKKKKIKIKKKKKKKKIICFKAAFK..",
        "............KKKCCCCCCCKKFFKKIIKDDDKIKIKIKIKIKKI.IIIKKICIFKAFK...",
        "..........KKCCCKKKKKKKFFKKIIIIIKKKIIIKKKKI.IIIIFKICIFKF.K...",
        ".........KCCCCCCCCCCCKFKIIICIIFFCKIIIIIKI.IIIIFFKICFFKFK....",
        "........KCCCCCCCCCCCAKKIIIIIIFFCFKIIIIKI.CCCIFFKIKIFKFKK....",
        ".......KCKKKCCCCCCCKKKKKKIIIFFCFFKIIIKIJIIIIF.KIIFKKFFK.....",
        "......KCKCCCKCCCCCKKIIIIIKI.FCF.FKKKKIJIIIIFFKIIFFKFFK......",
        ".....KKKKFCCCKCCCKI..IIIIFKFFCFFFKIIKKKKKKKFFKIIFKFKFK.......",
        "....KIJIKKCCCKCCCKIIIIKKIFKFFCFKKIIKIFIIIIFKFIIFAGFKK........",
        "...KII.FFKCCCCKCCKKIIKKKIFKKKKKIIIIKI..CCCCIIKIFKGGFKFK.......",
        "...KI.F.FKKCCCCKCKKIIKKIIKIKFFFKKKI.IIIIIIIFKFKGFKFFK.......",
        "..K..FF.KKKKCCCAKKIKIIIIKI.KFFK.KIK.KKIIIIIIKFKKFKFFK.......",
        "..K.FFFKFFIIKCAKKKIIIIIFFKKFFFKKFCKKFKIIIIIIFKAFKF.K........",
        ".KIFFFKFI.IFKAK..KIKIKIFKFFFFKKFCCKFFKIIKKIIFKFKFFFK........",
        ".KIFKKF..IFFKK....KKKKKKKKKKKKFCCKFFCKIKFKIFFKKFFFFKK.......",
        "KI.KAF.IFFKK..........KKCCFFKFCCKFFCCKKFFKFFAKKKKKKFFK......",
        "KIKF.FFKKK............KIIKFKFCCKFFCCKFKFCKFAKF.FFFKKFK......",
        "KK.FFKK...............KKKKKKCCKKFCCKKKFCCKKKKKIIIKIFKK......",
        ".KKKK.............KKKKCCCCKCCKKFCCKIIKFCCK..KAKKKKKFFKK......",
        "...............KKKCKCCKCCKFCKKFCCKIIKFCCK..KCCACCCCKKKK......",
        "..............K.IKKCCKIKCKFKKKFCKIIIIK.CK..KCCCCCCCCCCCAK.....",
        ".............K.FK.IIKJIIKFCKKFCKKIIKFCK...KKCCKCCCKCKKCK.....",
        "............K.FK.FFKJIICKFKCKCKKKIIKFK...K.ICKCKKCKAJIKK.....",
        "............KKKKKKKIFFKKKKKKFCK..KFCK..K.IICKK.IKKAI.IK.....",
        "...............KK..KKK..K..KFK...KFK...KIIFKKK.IKKKCIIK.....",
        "...........................KK....KK....KIKK..KJIK..KKIK.....",
        "...........................K.....K.....KK.....FA.....KK.....",
        "..............................................KK............"
      ]
    ]
  }
};

// src/pixel.jsx
import { jsx, jsxs } from "react/jsx-runtime";
var INK = "var(--px-ink)";
var mono = (rows) => ({ palette: { X: "currentColor" }, frames: [rows] });
var SPRITES = {
  // 数码蛋：最初的对称椭圆（用户 2026-09-30 改回），与伙伴液晶屏里的蛋同一形状。
  egg: {
    palette: { X: INK, O: "var(--px-egg)", S: "var(--px-egg-spot)", H: "#fff" },
    frames: [
      [
        "....XXXX....",
        "..XXOOOOXX..",
        ".XOHOOOOOOX.",
        ".XHOOSSOOOX.",
        "XOOOSSSSOOOX",
        "XOOOOSSOOOOX",
        "XOSOOOOOOSOX",
        "XOSSOOOOSSOX",
        "XOOOOOOOOOOX",
        "XOOOSSSOOOOX",
        ".XOOSSSSOOX.",
        ".XOOOOOOOOX.",
        "..XXOOOOXX..",
        "....XXXX...."
      ]
    ]
  },
  // 滚球兽：按用户提供的 25×28 拼豆图纸逐格转录。
  koromon: {
    name: "\u6EDA\u7403\u517D",
    stage: "\u5E7C\u5E74\u671F II",
    palette: {
      K: INK,
      P: "#ffc9dd",
      Q: "#f6a3c0",
      M: "#e8589a",
      B: "#5b1f22",
      W: "#ffffff",
      D: "#2a2a2e"
    },
    frames: [
      [
        "...................K.....",
        ".....K............KPK....",
        "....KPK...........KPK....",
        "....KPPK..........KPK....",
        "....KPPK..........KPPK...",
        "...KPPPK...........KPPK..",
        "..KPQKK..............KPK.",
        "KPPKKKK...........KKKKQQK",
        "KPQQQPPPK........KPPPQQQK",
        "KPPQQKKPPK......KPPKKQQK.",
        ".KQKK..KPKKKKKKKPPK..KK..",
        "..K....KPPPPPPPPPK.......",
        ".....KKPPPPPPPPPPPK......",
        "....KPPPPPPPPPPPPPPK.....",
        "...KPPKKKPPPPPPPKKKPK....",
        "...KPKKWWPPPPPPDWWKPK....",
        "...KPKBKBKPPPPPKBKBKPK...",
        "..KPPKQWBKPPPPPKQWBKPPK..",
        "..KPPPKKKPPPPPPPKKKPPPK..",
        ".KPPPQQPPKKKKKKKPPQQPPPK.",
        ".KPPPKKKDDDDDDDDDKKKPPPK.",
        ".KPPPPKDWDDDDDDDWDKPPPPK.",
        ".KPPPPPKDDDDDDDDDKPPPPQK.",
        "..KQPPPKMMMMMMMMKPPPQK...",
        "...KQQPPKMMMMMMMKPPPQK...",
        "....KKQPPKPMMMPKPPKK.....",
        "......KKPPKPPPKPPKK......",
        "........KKKKKKKKK........"
      ]
    ]
  },
  agumon: {
    name: "\u4E9A\u53E4\u517D",
    stage: "\u6210\u957F\u671F",
    palette: { K: INK, O: "#ff9a1f", H: "#ffc46b", L: "#ffe0ad", W: "#fff", G: "#3fbf5a" },
    frames: [
      [
        "....KKKKKK......",
        "...KOHHOOOK.....",
        "..KOHOOOOOOK....",
        "..KOWGOOOOOOK...",
        "..KOWKOOOOOOOK..",
        "..KOOOOOOOOOOOK.",
        "..KOOOKWKWKWKK..",
        "...KOOOOOOOOK...",
        "....KKOOOOKK....",
        "...KOOKLLLLKOK..",
        "..KOOKLLLLLLKOK.",
        "..KWKKLLLLLLKWK.",
        "....KOLLLLLLOK..",
        "....KOOOKKOOOK..",
        "...KOOOK..KOOOK.",
        "...KKKK....KKKK."
      ],
      [
        "....KKKKKK......",
        "...KOHHOOOK.....",
        "..KOHOOOOOOK....",
        "..KOOOOOOOOOK...",
        "..KOKKOOOOOOOK..",
        "..KOOOOOOOOOOOK.",
        "..KOOOKWKWKWKK..",
        "...KOOOOOOOOK...",
        "....KKOOOOKK....",
        "...KOOKLLLLKOK..",
        "..KOOKLLLLLLKOK.",
        "..KWKKLLLLLLKWK.",
        "....KOLLLLLLOK..",
        "....KOOOKKOOOK..",
        "...KOOOK..KOOOK.",
        "...KKKK....KKKK."
      ]
    ]
  },
  // 八颗数码蛋：按用户提供的 68×37 拼豆图纸逐行转录（外形 14×16，配色取图纸色号）。
  egg1: {
    palette: { K: INK, o: "#ffd28a", O: "#ffab45", c: "#2672d6", n: "#1d2a8f" },
    frames: [
      [
        ".....KKKK.....",
        "....KooonK....",
        "...KoOOccnK...",
        "..KnOccOccnK..",
        "..KcOOcccOoK..",
        ".KnccOOOOOOoK.",
        ".KncccOOOOOoK.",
        "KnccccccccOOoK",
        "KnOOccccOOOOnK",
        "KoOOOOOOccccnK",
        "KoOOOOOOcccnnK",
        ".KoOccccccnnK.",
        ".KoOOccccOooK.",
        "..KnnOOooonK..",
        "...KnnnnnnK...",
        "....KKKKKK...."
      ]
    ]
  },
  egg2: {
    palette: { K: INK, l: "#b9c2ff", v: "#dcd4ff", b: "#4b5ad9" },
    frames: [
      [
        ".....KKKK.....",
        "....KblllK....",
        "...KbvvvvbK...",
        "..KlvvbvvvbK..",
        "..KlvvbbvvbK..",
        ".KlvvbbbvvbbK.",
        ".KbvvvvvvvvlK.",
        "KlvbvvvvvvvblK",
        "KlbbvvbbvvvvlK",
        "KbbbvvvbvvbvbK",
        "KlvvvvbbbvvbbK",
        ".KlvvvvvvvvlK.",
        ".KbbbvvbbvvlK.",
        "..KbvvvbbbbK..",
        "...KlllbbbK...",
        "....KKKKKK...."
      ]
    ]
  },
  egg3: {
    palette: { K: INK, a: "#ff9f68", r: "#ff4f63", x: "#ff3a2a" },
    frames: [
      [
        ".....KKKK.....",
        "....KraaaK....",
        "...KrraaraK...",
        "..KraaaarxrK..",
        "..KaaaaaaraK..",
        ".KaaaaaarrrrK.",
        ".KaaaaaaaaaaK.",
        "KarraaarrraaaK",
        "KarrraarraaaaK",
        "KarraaaraaaaaK",
        "KrrrraaaaarraK",
        ".KaaaaaaarrrK.",
        ".KraaaaaaarrK.",
        "..KrraaaaaaK..",
        "...KraaaarK...",
        "....KKKKKK...."
      ]
    ]
  },
  egg4: {
    palette: { K: INK, p: "#fde6f0", e: "#f9c9e3", d: "#d596d6" },
    frames: [
      [
        ".....KKKK.....",
        "....KeeedK....",
        "...KepppddK...",
        "..KeppppdddK..",
        "..KeppdddddK..",
        ".KeppppppdddK.",
        ".KedddpppddeK.",
        "KddddpppppppeK",
        "KdddppppppppeK",
        "KdddddppppppeK",
        "KddddddppdppeK",
        ".KdddddppdppK.",
        ".KdpppppddddK.",
        "..KeppppdddK..",
        "...KeeedddK...",
        "....KKKKKK...."
      ]
    ]
  },
  egg5: {
    palette: { K: INK, g: "#45cf33", c: "#fffbe2", L: "#c6f0a4" },
    frames: [
      [
        ".....KKKK.....",
        "....KLLLgK....",
        "...KgcccggK...",
        "..KggcccgggK..",
        "..KgggccccLK..",
        ".KLggccccccLK.",
        ".KLcccccggcLK.",
        "KLcccccggggcLK",
        "KLggcccggggcLK",
        "KggggccggcccgK",
        "KggggcccccccgK",
        ".KgggccccccLK.",
        ".KLccccggggLK.",
        "..KLcccggggK..",
        "...KLLLgggK...",
        "....KKKKKK...."
      ]
    ]
  },
  egg6: {
    palette: { K: INK, w: "#fbf1dc", m: "#b98aa6", r: "#cdb0bd" },
    frames: [
      [
        ".....KKKK.....",
        "....KrrrrK....",
        "...KmwwwwmK...",
        "..KmmwwwmmmK..",
        "..KmwwwwmmmK..",
        ".KrwwwwwwmmrK.",
        ".KrwwwmmwwwwK.",
        "KrwwmmmmwwwwrK",
        "KrwwwmmwwwwwmK",
        "KrwwwmmwwwwmmK",
        "KmmwwwwwwwwmmK",
        ".KmmwwwwwwwrK.",
        ".KmmwwwwmwwrK.",
        "..KrwwwmmmmK..",
        "...KrrrmmmK...",
        "....KKKKKK...."
      ]
    ]
  },
  egg7: {
    palette: { K: INK, y: "#fde36a", W: "#ffffff", a: "#fdf6c8" },
    frames: [
      [
        ".....KKKK.....",
        "....KaaaaK....",
        "...KyWWWWyK...",
        "..KyyyyyyyyK..",
        "..KayyyyyyaK..",
        ".KaWWWWWWWWaK.",
        ".KyWWWWWWWWyK.",
        "KyyyWWWWWWyyyK",
        "KyyyyyyyyyyyyK",
        "KayyyyyyyyyyaK",
        "KaWyyyyyyyyWaK",
        ".KaWWWWWWWWaK.",
        ".KyWWWWWWWyyK.",
        "..KyyyyyyyyK..",
        "...KyyyyyyK...",
        "....KKKKKK...."
      ]
    ]
  },
  egg8: {
    palette: { K: INK, p: "#fde6f0", e: "#f9c9e3", m: "#e8559a" },
    frames: [
      [
        ".....KKKK.....",
        "....KeemmK....",
        "...KepmmpeK...",
        "..KepmmpppeK..",
        "..KempppmmmK..",
        ".KmmpppmmppmK.",
        ".KeppppmmppmK.",
        "KeppppmppppmmK",
        "KemppppmpppmeK",
        "KmmmmppmpppmeK",
        "KeppmmpmmmmmeK",
        ".KeppmmmpppeK.",
        ".KeppmpppmmeK.",
        "..KepmppmmeK..",
        "...KemmemeK...",
        "....KKKKKK...."
      ]
    ]
  },
  // Prompt：像素对话框，三行文字与一个闪烁的光标。
  Prompt: {
    mode: "cursor",
    palette: {
      K: "currentColor",
      B: "var(--px-glyph-fill)",
      L: "#e6fbff",
      S: "color-mix(in srgb, currentColor 35%, #000)",
      W: "#ffffff",
      U: "#ffffff"
    },
    frames: [
      [
        ".KKKKKKKKKKKKKK.",
        "KWBBBBBBBBBBBBBK",
        "KBLLLLLLLLLBBBBK",
        "KBBBBBBBBBBBBBBK",
        "KBLLLLLLLBBBBBBK",
        "KBBBBBBBBBBBBBBK",
        "KBLLLLLUBBBBBBBK",
        "KBBBBBBUBBBBBBBK",
        "KSSSSSSSSSSSSSSK",
        ".KKKKSSKKKKKKKK.",
        "....KSK.........",
        "....KK.........."
      ],
      [
        ".KKKKKKKKKKKKKK.",
        "KWBBBBBBBBBBBBBK",
        "KBLLLLLLLLLBBBBK",
        "KBBBBBBBBBBBBBBK",
        "KBLLLLLLLBBBBBBK",
        "KBBBBBBBBBBBBBBK",
        "KBLLLLLBBBBBBBBK",
        "KBBBBBBBBBBBBBBK",
        "KSSSSSSSSSSSSSSK",
        ".KKKKSSKKKKKKKK.",
        "....KSK.........",
        "....KK.........."
      ]
    ]
  },
  // 工作流：三个节点经箭头依次连接；悬停时节点按顺序点亮，像信号沿流程流动。
  Workflow: {
    mode: "cycle",
    palette: {
      K: "currentColor",
      N: "var(--px-glyph-fill)",
      P: "color-mix(in srgb, currentColor 55%, transparent)",
      L: "#ffffff"
    },
    frames: [0, 1, 2].map((lit) => [
      "................",
      ".KKKK...........",
      `.K${lit === 0 ? "LL" : "NN"}KPPPPPP.....`,
      `.K${lit === 0 ? "LL" : "NN"}K.....P.....`,
      ".KKKK.....P.....",
      ".........PPP....",
      "..........P.....",
      "........KKKKK...",
      `........K${lit === 1 ? "LLL" : "NNN"}K...`,
      `...PPPPPK${lit === 1 ? "LLL" : "NNN"}K...`,
      "...P....KKKKK...",
      "..PPP...........",
      "...P............",
      ".KKKKK..........",
      `.K${lit === 2 ? "LLL" : "NNN"}K..........`,
      ".KKKKK.........."
    ])
  },
  // 规则封面（用户 2026-09-30 与小角标对调）：lucide ScrollText 的像素版——左上卷起的轴头、
  // 三行条款、右下卷起的纸尾。描边 currentColor、填充 --px-glyph-fill，右侧一列阴影（P），条款依次点亮。
  Rule: {
    mode: "cycle",
    palette: {
      K: "currentColor",
      N: "var(--px-glyph-fill)",
      P: "color-mix(in srgb, currentColor 40%, transparent)",
      Q: "color-mix(in srgb, currentColor 55%, transparent)",
      L: "#ffffff"
    },
    frames: [0, 1, 2].map((n) => {
      const clause = (on, row) => row.replace(/x/g, on ? "L" : "Q");
      return [
        "..KKKKKKKKKKK...",
        ".KNNKNNNNNNNPK..",
        ".KLNKNNNNNNNPK..",
        clause(n === 0, ".KNNKNxxxxxNPK.."),
        "..KKKNNNNNNNPK..",
        clause(n === 1, "....KNxxxxNNPK.."),
        "....KNNNNNNNPK..",
        clause(n === 2, "....KNxxxxxxPK.."),
        "....KNNNNNNNPK..",
        "....KNNKKKKKKKK.",
        "....KNNKLNNNNNPK",
        "....KNNKNNNNNNPK",
        ".....KKKKKKKKKK."
      ];
    })
  },
  // 规则小角标：原封面的展开卷轴（用户 2026-09-29 选定，2026-09-30 改作小角标）。
  // 上下轴有高光（L）与背光（P），纸面右侧一列阴影；小尺寸下由样式固定在第一帧。
  rule_scroll: {
    mode: "cycle",
    palette: {
      K: "currentColor",
      N: "var(--px-glyph-fill)",
      P: "color-mix(in srgb, currentColor 40%, transparent)",
      Q: "color-mix(in srgb, currentColor 55%, transparent)",
      L: "#ffffff"
    },
    frames: [0, 1, 2].map((n) => {
      const clause = (on, len) => `..KN${(on ? "L" : "Q").repeat(len)}${"N".repeat(8 - len)}PK..`;
      return [
        ".KKKKKKKKKKKKKK.",
        "KLLNNNNNNNNNNPPK",
        "KLNNNNNNNNNNNNPK",
        ".KKKKKKKKKKKKKK.",
        "..KNNNNNNNNNNK..",
        clause(n === 0, 6),
        "..KNNNNNNNNNPK..",
        clause(n === 1, 7),
        "..KNNNNNNNNNPK..",
        clause(n === 2, 4),
        "..KNNNNNNNNNPK..",
        ".KKKKKKKKKKKKKK.",
        "KLLNNNNNNNNNNPPK",
        "KLNNNNNNNNNNNNPK",
        ".KKKKKKKKKKKKKK."
      ];
    })
  },
  // 焚决封面（切片 1.3）：像素火焰。描边 currentColor、外焰 --px-glyph-fill、内焰黄、焰心白；
  // 与其他资产封面同一套调色规则，悬停时三帧交替像火苗跳动。
  Scroll: {
    mode: "cycle",
    palette: {
      K: "currentColor",
      N: "var(--px-glyph-fill)",
      Y: "#ffd166",
      L: "#ffffff"
    },
    frames: [
      [
        "......K.........",
        "......KK........",
        ".....KNK....K...",
        ".....KNNK..KK...",
        "....KNNNK.KNK...",
        "...KNNNNNKKNNK..",
        "...KNNYNNNNNNK..",
        "..KNNNYYNNNNNNK.",
        "..KNNYYYYNNNNNK.",
        ".KNNNYYLYYNNNNK.",
        ".KNNYYLLLYYNNNK.",
        ".KNNYYLLLYYNNK..",
        "..KNNYYLYYNNNK..",
        "...KNNYYYNNNK...",
        "....KKNNNNKK....",
        "......KKKK......"
      ],
      [
        ".......K........",
        "......KK........",
        "......KNK...K...",
        ".....KNNK..KNK..",
        ".....KNNNK.KNK..",
        "....KNNNNNKNNK..",
        "...KNNNYNNNNNK..",
        "..KNNNNYYNNNNNK.",
        "..KNNNYYYNNNNNK.",
        ".KNNNYYLYYNNNNK.",
        ".KNNYYLLLYYNNNK.",
        ".KNNYYLLLYYNNK..",
        "..KNNYYLYYNNNK..",
        "...KNNYYYNNNK...",
        "....KKNNNNKK....",
        "......KKKK......"
      ],
      [
        "......K.........",
        ".....KK......K..",
        ".....KNK....KK..",
        "....KNNK...KNK..",
        "....KNNNK..KNK..",
        "...KNNNNNKKNNK..",
        "...KNNNYNNNNNK..",
        "..KNNNYYNNNNNNK.",
        "..KNNYYYYNNNNNK.",
        ".KNNNYYLYYNNNNK.",
        ".KNNYYLLLYYNNNK.",
        ".KNNYYLLLYYNNK..",
        "..KNNYYLYYNNNK..",
        "...KNNYYYNNNK...",
        "....KKNNNNKK....",
        "......KKKK......"
      ]
    ]
  },
  // 勇气之纹章（数码宝贝原作徽章，按像素参考图绘制）：品牌标志使用。
  crest: {
    palette: { O: "#ff8a24", L: "#ffc27a", Y: "#ffffff" },
    frames: [
      [
        "........O........",
        ".O......O......O.",
        "..OO...OOO...OO..",
        "..O...........O..",
        "......OOOOO......",
        ".....OO...OO.....",
        "....OO.LLL.OO....",
        "..O.O.L...L.O.O..",
        "OOO.O.L.Y.L.O.OOO",
        "..O.O.L...L.O.O..",
        "....OO.LLL.OO....",
        ".....OO...OO.....",
        "......OOOOO......",
        "..O...........O..",
        "..OO...OOO...OO..",
        ".O......O......O.",
        "........O........"
      ]
    ]
  },
  // 页面背景纹样（单色，取 currentColor，大尺寸低透明度使用）。
  mark_crest: mono([
    "........X........",
    ".X......X......X.",
    "..XX...XXX...XX..",
    "..X...........X..",
    "......XXXXX......",
    ".....XX...XX.....",
    "....XX.XXX.XX....",
    "..X.X.X...X.X.X..",
    "XXX.X.X.X.X.X.XXX",
    "..X.X.X...X.X.X..",
    "....XX.XXX.XX....",
    ".....XX...XX.....",
    "......XXXXX......",
    "..X...........X..",
    "..XX...XXX...XX..",
    ".X......X......X.",
    "........X........"
  ]),
  mark_egg: mono([
    "....XXXX....",
    "..XX....XX..",
    ".X...XX...X.",
    ".X..XXXX..X.",
    "X....XX....X",
    "X.XX....XX.X",
    "X.XX....XX.X",
    "X....XX....X",
    "X...XXXX...X",
    ".X...XX...X.",
    "..XX....XX..",
    "....XXXX...."
  ]),
  mark_agent: mono([
    ".....X......",
    ".....X......",
    "..XXXXXXXX..",
    ".X........X.",
    ".X.XX..XX.X.",
    ".X.XX..XX.X.",
    ".X........X.",
    ".X..XXXX..X.",
    ".X........X.",
    "..XXXXXXXX..",
    "...X....X...",
    "..XX....XX.."
  ]),
  mark_folder: mono([
    "............",
    ".XXXX.......",
    "X....X......",
    "X.....XXXXXX",
    "XXXXXXXXXXXX",
    "X..........X",
    "X..........X",
    "X..........X",
    "X..........X",
    "X..........X",
    "XXXXXXXXXXXX",
    "............"
  ]),
  mark_book: mono([
    "............",
    ".XXXX..XXXX.",
    "X....XX....X",
    "X.XX.XX.XX.X",
    "X....XX....X",
    "X.XX.XX.XX.X",
    "X....XX....X",
    "X.XX.XX.XX.X",
    "X....XX....X",
    "XXXXXXXXXXXX",
    ".....XX.....",
    "............"
  ]),
  mark_pencil: mono([
    "..........XX",
    ".........X.X",
    "........X.X.",
    ".......X.X..",
    "......X.X...",
    ".....X.X....",
    "....X.X.....",
    "...X.X......",
    "..X.X.......",
    ".XXX........",
    ".XX.........",
    "X..........."
  ]),
  mark_flame: mono([
    ".....X......",
    ".....XX.....",
    "....X.X.....",
    "....X..X..X.",
    "...X...X.XX.",
    "..X.....XX.X",
    "..X........X",
    ".X....X....X",
    ".X...X.X...X",
    ".X...X.X..X.",
    "..X...X..X..",
    "...XXXXXX..."
  ]),
  mark_branch: mono([
    ".XX......XX.",
    "X..X....X..X",
    "X..X....X..X",
    ".XX......XX.",
    "..X.......X.",
    "..X......X..",
    "..X.....X...",
    "..X...XX....",
    "..XXXX......",
    ".XX.........",
    "X..X........",
    ".XX........."
  ]),
  mark_scan: mono([
    "XXX......XXX",
    "X..........X",
    "X..........X",
    "............",
    "....XXXX....",
    "...X....X...",
    "...X....X...",
    "....XXXX....",
    "............",
    "X..........X",
    "X..........X",
    "XXX......XXX"
  ]),
  mark_moon: mono([
    "....XXXX....",
    "..XXXX......",
    ".XXXX.......",
    ".XXX........",
    "XXXX........",
    "XXXX.....X..",
    "XXXX........",
    "XXXXX.......",
    ".XXXXX......",
    ".XXXXXXX..XX",
    "..XXXXXXXXX.",
    "....XXXXX..."
  ]),
  mark_gear: mono([
    "....XXXX....",
    "..X.XXXX.X..",
    ".XXXXXXXXXX.",
    "..XXX..XXX..",
    "XXXX....XXXX",
    "XXX......XXX",
    "XXX......XXX",
    "XXXX....XXXX",
    "..XXX..XXX..",
    ".XXXXXXXXXX.",
    "..X.XXXX.X..",
    "....XXXX...."
  ]),
  // 漂浮小符号
  bit_plus: mono(["..X..", "..X..", "XXXXX", "..X..", "..X.."]),
  bit_dia: mono(["..X..", ".X.X.", "X...X", ".X.X.", "..X.."]),
  bit_block: mono(["XX.", "XX.", "..X"])
};
SPRITES.Skill = SPRITES.egg1;
Object.assign(SPRITES, REF_SPRITES);
for (const key of ["bakemon", "mecha"])
  SPRITES[`mark_${key}`] = {
    palette: { X: "currentColor" },
    frames: [REF_SPRITES[key].frames[0].map((r2) => r2.replace(/[^.]/g, "X"))]
  };
function glyphOf(asset) {
  if (asset.type !== "Skill") return asset.type;
  const h2 = [...asset.id].reduce((n, ch) => n * 33 + ch.charCodeAt(0) >>> 0, 5381);
  return `egg${h2 % 8 + 1}`;
}
function runs(rows, palette, dots = false) {
  const out = [];
  if (dots) {
    rows.forEach(
      (row, y) => [...row].forEach((ch, x) => {
        if (ch === "." || !palette[ch]) return;
        out.push(
          /* @__PURE__ */ jsx("circle", { cx: x + 0.5, cy: y + 0.5, r: 0.2, fill: palette[ch] }, `${y}-${x}`)
        );
      })
    );
    return out;
  }
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || !palette[ch]) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      out.push(
        /* @__PURE__ */ jsx(
          "rect",
          {
            x,
            y,
            width: end - x + 0.02,
            height: 1.02,
            fill: palette[ch]
          },
          `${y}-${x}`
        )
      );
      x = end;
    }
  });
  return out;
}
function Pixel({ sprite, size = 48, fit, scale, crop, className = "", palette, title, dots = false }) {
  const art = SPRITES[sprite];
  if (!art) return null;
  const colors = { ...art.palette, ...palette };
  const rows = art.frames[0];
  const fullWidth = Math.max(...rows.map((r2) => r2.length));
  const [x0, y0, width, height] = crop || [0, 0, fullWidth, rows.length];
  if (scale) size = width * scale;
  else if (fit) size = fit * width / Math.max(width, height);
  return /* @__PURE__ */ jsx(
    "svg",
    {
      className: `pixel ${art.mode || (art.frames.length > 1 ? "animated" : "")} ${className}`,
      viewBox: `${x0} ${y0} ${width} ${height}`,
      width: size,
      height: size * height / width,
      shapeRendering: dots && width <= 20 ? "geometricPrecision" : "crispEdges",
      "aria-hidden": title ? void 0 : "true",
      role: title ? "img" : void 0,
      "aria-label": title,
      children: art.frames.map((frame, i) => /* @__PURE__ */ jsx("g", { className: `pixel-frame f${i}`, children: runs(frame, colors, dots && width <= 20) }, i))
    }
  );
}
function partnerOf(state) {
  const own = state.assets.filter((a) => !a.demo && !a.archived).length;
  return { sprite: "egg", name: "\u6570\u7801\u86CB", stage: "\u5B75\u5316\u524D", own };
}
var STAGES = ["\u5E7C\u5E74\u671F", "\u6210\u957F\u671F", "\u6210\u719F\u671F", "\u5B8C\u5168\u4F53", "\u7A76\u6781\u4F53"];
function stageOf(asset, activity = []) {
  return usageOf(asset, activity).stage;
}
function StageBar({ stage, label = true, pop = false }) {
  return /* @__PURE__ */ jsxs(
    "span",
    {
      className: "stage-bar",
      title: `\u4F7F\u7528\u8BC1\u636E\u9636\u6BB5\uFF1A${STAGES[stage]}\uFF08\u6210\u957F\u671F\uFF1A\u5DF2\u6536\u5F55\uFF1B\u6210\u719F\u671F\uFF1A\u6210\u529F\u590D\u5236\uFF1B\u5B8C\u5168\u4F53\uFF1A\u672C\u4EBA\u6B63\u5411\u53CD\u9988\uFF1B\u4E0D\u4EE3\u8868 Agent \u5DF2\u91C7\u7528\uFF09`,
      children: [
        label && /* @__PURE__ */ jsx("span", { className: "stage-name", children: STAGES[stage] }),
        /* @__PURE__ */ jsx("span", { className: "stage-cells", "aria-hidden": "true", children: STAGES.map((_, i) => /* @__PURE__ */ jsx(
          "i",
          {
            className: `${i <= stage ? "on" : ""} ${pop && i === stage ? "pop" : ""}`
          },
          i
        )) })
      ]
    }
  );
}
function DigiviceArt({ children, size = 220, className = "" }) {
  const id = React.useId().replaceAll(":", "");
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `digivice-art ${className}`,
      style: { width: size, height: size },
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ jsxs("svg", { viewBox: "0 0 200 200", width: size, height: size, children: [
          /* @__PURE__ */ jsxs("defs", { children: [
            /* @__PURE__ */ jsxs("linearGradient", { id: `${id}b`, x1: "0", y1: "0", x2: "1", y2: "1", children: [
              /* @__PURE__ */ jsx("stop", { offset: "0", stopColor: "#1b2d4d" }),
              /* @__PURE__ */ jsx("stop", { offset: "1", stopColor: "#0a1426" })
            ] }),
            /* @__PURE__ */ jsxs("radialGradient", { id: `${id}s`, cx: ".5", cy: ".45", r: ".6", children: [
              /* @__PURE__ */ jsx("stop", { offset: "0", stopColor: "#10283a" }),
              /* @__PURE__ */ jsx("stop", { offset: "1", stopColor: "#07111d" })
            ] }),
            /* @__PURE__ */ jsxs("filter", { id: `${id}g`, x: "-20%", y: "-20%", width: "140%", height: "140%", children: [
              /* @__PURE__ */ jsx("feGaussianBlur", { stdDeviation: "2.2", result: "blur" }),
              /* @__PURE__ */ jsxs("feMerge", { children: [
                /* @__PURE__ */ jsx("feMergeNode", { in: "blur" }),
                /* @__PURE__ */ jsx("feMergeNode", { in: "SourceGraphic" })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("g", { className: "dv-antenna", children: [
            /* @__PURE__ */ jsx("rect", { x: "22", y: "10", width: "9", height: "16", rx: "3", transform: "rotate(-28 26 18)" }),
            /* @__PURE__ */ jsx("rect", { x: "24.5", y: "24", width: "4", height: "8", transform: "rotate(-28 26 28)" })
          ] }),
          /* @__PURE__ */ jsx(
            "path",
            {
              className: "dv-body",
              fill: `url(#${id}b)`,
              d: "M60 24 H140 Q168 24 176 50 L178 70 Q190 76 190 100 Q190 124 178 130 L176 150 Q168 176 140 176 H60 Q32 176 24 150 L22 130 Q10 124 10 100 Q10 76 22 70 L24 50 Q32 24 60 24 Z"
            }
          ),
          /* @__PURE__ */ jsxs("g", { className: "dv-lines", filter: `url(#${id}g)`, children: [
            /* @__PURE__ */ jsx("path", { d: "M60 24 H140 Q168 24 176 50 L178 70 Q190 76 190 100 Q190 124 178 130 L176 150 Q168 176 140 176 H60 Q32 176 24 150 L22 130 Q10 124 10 100 Q10 76 22 70 L24 50 Q32 24 60 24 Z" }),
            /* @__PURE__ */ jsx(
              "path",
              {
                className: "dv-inner",
                d: "M62 31 H138 Q162 31 169 53 L171 73 Q182 79 182 100 Q182 121 171 127 L169 147 Q162 169 138 169 H62 Q38 169 31 147 L29 127 Q18 121 18 100 Q18 79 29 73 L31 53 Q38 31 62 31 Z"
              }
            ),
            /* @__PURE__ */ jsx("rect", { x: "66", y: "16", width: "22", height: "12", rx: "3" }),
            /* @__PURE__ */ jsx("rect", { x: "112", y: "16", width: "22", height: "12", rx: "3" }),
            /* @__PURE__ */ jsx("rect", { x: "66", y: "172", width: "22", height: "12", rx: "3" }),
            /* @__PURE__ */ jsx("rect", { x: "112", y: "172", width: "22", height: "12", rx: "3" }),
            /* @__PURE__ */ jsx("path", { d: "M38 44 L56 58 M162 44 L144 58 M38 156 L56 142 M162 156 L144 142" }),
            /* @__PURE__ */ jsx("circle", { cx: "100", cy: "100", r: "66" }),
            /* @__PURE__ */ jsx("circle", { cx: "100", cy: "100", r: "48" })
          ] }),
          /* @__PURE__ */ jsx("g", { className: "dv-code", children: /* @__PURE__ */ jsx("circle", { cx: "100", cy: "100", r: "57" }) }),
          /* @__PURE__ */ jsx("g", { className: "dv-arrows", children: /* @__PURE__ */ jsx("path", { d: "M53 86 l-5 -3 m5 3 l-5 3 M147 114 l5 -3 m-5 3 l5 3" }) }),
          /* @__PURE__ */ jsx("circle", { cx: "100", cy: "100", r: "46", fill: `url(#${id}s)`, className: "dv-bezel" }),
          /* @__PURE__ */ jsxs("g", { className: "dv-circuit", children: [
            /* @__PURE__ */ jsx("path", { d: "M66 82 h8 v-6 M66 118 h8 v6 M134 82 h-8 v-6 M134 118 h-8 v6 M84 62 v8 h6 M116 62 v8 h-6 M84 138 v-8 h6 M116 138 v-8 h-6 M62 100 h6 M132 100 h6" }),
            /* @__PURE__ */ jsx("circle", { cx: "74", cy: "76", r: "1.4" }),
            /* @__PURE__ */ jsx("circle", { cx: "126", cy: "76", r: "1.4" }),
            /* @__PURE__ */ jsx("circle", { cx: "74", cy: "124", r: "1.4" }),
            /* @__PURE__ */ jsx("circle", { cx: "126", cy: "124", r: "1.4" })
          ] }),
          /* @__PURE__ */ jsx("rect", { x: "71", y: "71", width: "58", height: "58", rx: "7", className: "dv-lcd-frame", filter: `url(#${id}g)` }),
          /* @__PURE__ */ jsxs("g", { className: "dv-buttons", filter: `url(#${id}g)`, children: [
            /* @__PURE__ */ jsx("circle", { cx: "24", cy: "100", r: "11" }),
            /* @__PURE__ */ jsx("circle", { cx: "24", cy: "100", r: "6" }),
            /* @__PURE__ */ jsx("ellipse", { cx: "176", cy: "80", rx: "11", ry: "9" }),
            /* @__PURE__ */ jsx("ellipse", { cx: "176", cy: "80", rx: "6", ry: "4.5" }),
            /* @__PURE__ */ jsx("ellipse", { cx: "176", cy: "120", rx: "11", ry: "9" }),
            /* @__PURE__ */ jsx("ellipse", { cx: "176", cy: "120", rx: "6", ry: "4.5" })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "digivice-lcd", children })
      ]
    }
  );
}
var CRESTS = [
  {
    name: "\u52C7\u6C14",
    color: "#ff8a24",
    d: "M20 1 L22.6 9.5 H17.4 Z M20 39 L22.6 30.5 H17.4 Z M1 20 L9.5 17.4 V22.6 Z M39 20 L30.5 17.4 V22.6 Z M7 7 L10.2 12.6 L12.6 10.2 Z M33 7 L29.8 12.6 L27.4 10.2 Z M7 33 L10.2 27.4 L12.6 29.8 Z M33 33 L29.8 27.4 L27.4 29.8 Z",
    circles: [[20, 20, 7.5], [20, 20, 3]]
  },
  {
    name: "\u7231\u5FC3",
    color: "#ff4d4d",
    d: "M20 35 L8 22 C3 16 6 7 13 7 C17 7 20 10 20 13 C20 10 23 7 27 7 C34 7 37 16 32 22 Z M13.5 18 C9.5 16.5 10 11 14 11 C17 11 17.2 15 14.3 15",
    circles: [[27, 14.5, 4], [27, 14.5, 1.8]]
  },
  {
    name: "\u5149\u660E",
    color: "#ff7ad1",
    d: [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
      const r2 = (v, k) => {
        const t = a * Math.PI / 180;
        const [x, y] = v;
        return `${(20 + x * Math.cos(t) - y * Math.sin(t)).toFixed(2)} ${(20 + x * Math.sin(t) + y * Math.cos(t)).toFixed(2)}`;
      };
      return `M${r2([0, -18.5])} L${r2([2.6, -11])} L${r2([0, -6.8])} L${r2([-2.6, -11])} Z`;
    }).join(" "),
    circles: [[20, 20, 3.4]]
  },
  {
    name: "\u8BDA\u5B9E",
    color: "#e9eeff",
    d: "M17.5 2 H22.5 V16.5 H34 V21.5 H22.5 V38 H17.5 V21.5 H6 V16.5 H17.5 Z M9 3 H15 V14 Z M31 3 H25 V14 Z M9 37 H15 V26 Z M31 37 H25 V26 Z"
  },
  {
    name: "\u53CB\u60C5",
    color: "#3d8bff",
    d: "M20 11.5 C14 16 26 24 20 28.5 M11.8 22 Q7 25.5 1.5 25.5 Q8 21 12.1 17.6 M28.2 18 Q33 14.5 38.5 14.5 Q32 19 27.9 22.4",
    circles: [[20, 20, 8.5]]
  },
  {
    name: "\u7EAF\u771F",
    color: "#35d05a",
    d: "M20 3 L27.6 24.5 A8.6 8.6 0 1 1 12.4 24.5 Z",
    circles: [[20, 28, 5], [20, 28, 2.2]]
  },
  {
    name: "\u5E0C\u671B",
    color: "#ffd23f",
    d: "M20 1 L21.4 4.6 H18.6 Z M28.5 4.5 L27.2 8.2 L25.6 6.6 Z M11.5 4.5 L12.8 8.2 L14.4 6.6 Z M31 12 L27.3 12.8 L27.3 10.6 Z M9 12 L12.7 12.8 L12.7 10.6 Z M15.6 14.8 L12.6 37 L15.6 33 L18.1 37 L20.6 33 L23.1 37 L25.6 33 L27.6 37 L24.4 14.8",
    circles: [[20, 11, 4.6]]
  },
  {
    name: "\u77E5\u8BC6",
    color: "#a66bff",
    d: "M16.8 18.6 Q20.5 15.8 24.4 18.6",
    circles: [[10.5, 20, 7], [10.5, 20, 3.4], [30, 20, 6], [30, 20, 2.8]]
  }
];
function CrestRing() {
  return /* @__PURE__ */ jsx("div", { className: "crest-ring", "aria-hidden": "true", children: CRESTS.map((c, i) => /* @__PURE__ */ jsx(
    "span",
    {
      className: "crest",
      style: { "--a": `${i * 45}deg`, "--c": c.color, "--i": i },
      title: c.name,
      children: /* @__PURE__ */ jsxs("svg", { viewBox: "0 0 40 40", children: [
        /* @__PURE__ */ jsx("path", { d: c.d }),
        c.circles?.map(([cx, cy, r2], k) => /* @__PURE__ */ jsx("circle", { cx, cy, r: r2 }, k))
      ] })
    },
    c.name
  )) });
}

// src/Odometer.jsx
import React2, { useEffect, useRef, useState } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function prefersReduced() {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}
function Odometer({ value, from, className = "" }) {
  const text = String(value);
  const shown = useRef(from === void 0 || prefersReduced() ? text : String(from));
  const [old, setOld] = useState(null);
  useEffect(() => {
    if (shown.current === text) return void 0;
    if (prefersReduced()) {
      shown.current = text;
      setOld(null);
      return void 0;
    }
    setOld(shown.current);
    shown.current = text;
    const timer = setTimeout(() => setOld(null), 460);
    return () => clearTimeout(timer);
  }, [text]);
  const width = Math.max(text.length, old?.length || 0);
  const pad = (s) => s.padStart(width, " ");
  const now2 = pad(text), before = old === null ? null : pad(old);
  return /* @__PURE__ */ jsx2("span", { className: `odometer ${old !== null ? "is-rolling" : ""} ${className}`, children: [...now2].map(
    (digit, i) => before !== null && before[i] !== digit ? /* @__PURE__ */ jsxs2("span", { className: "odo-digit roll", children: [
      /* @__PURE__ */ jsx2("span", { className: "odo-old", "aria-hidden": "true", children: before[i].trim() }),
      /* @__PURE__ */ jsx2("span", { className: "odo-new", children: digit.trim() })
    ] }, `${i}-${digit}`) : /* @__PURE__ */ jsx2("span", { className: "odo-digit", children: digit.trim() }, i)
  ) });
}

// src/v14.jsx
import React3, { useEffect as useEffect2, useRef as useRef2, useState as useState2 } from "react";

// src/characters.js
var CHARACTERS = {
  metalgreymon: { name: "\u673A\u68B0\u66B4\u9F99\u517D", sprite: null },
  // “机械系”图纸：背负双炮的灰色机械龙，按机械邪龙兽使用（待用户确认）。
  machinedramon: { name: "\u673A\u68B0\u90AA\u9F99\u517D", sprite: "mecha" },
  agumon: { name: "\u4E9A\u53E4\u517D", sprite: "agumon" },
  gabumon: { name: "\u52A0\u5E03\u517D", sprite: null }
};
var AGENT_CAST = [
  { id: "claude", name: "Claude Code", aliases: ["claude code", "claude-code", "claude"], character: "metalgreymon", hue: "255,138,36", initials: "CC" },
  { id: "codex", name: "Codex", aliases: ["codex"], character: "machinedramon", hue: "77,227,255", initials: "CO" },
  { id: "hermes", name: "Hermes", aliases: ["hermes"], character: "agumon", hue: "168,145,255", initials: "HE" },
  { id: "openclaw", name: "OpenClaw", aliases: ["openclaw"], character: "gabumon", hue: "255,143,184", initials: "OC" }
];
function castOf(agent) {
  const key = String(agent || "").trim().toLowerCase();
  if (!key) return null;
  return AGENT_CAST.find((a) => a.id === key || a.aliases.includes(key)) || AGENT_CAST.find((a) => a.aliases.some((alias) => key.startsWith(alias))) || null;
}

// src/v14.jsx
import { Fragment, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var REDUCE = "(prefers-reduced-motion: reduce)";
function prefersReduced2() {
  try {
    return matchMedia(REDUCE).matches;
  } catch {
    return false;
  }
}
function useReducedMotion() {
  const [reduced, setReduced] = useState2(prefersReduced2);
  useEffect2(() => {
    let query;
    try {
      query = matchMedia(REDUCE);
    } catch {
      return;
    }
    const sync = () => setReduced(query.matches);
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);
  return reduced;
}
var G = {
  0: "01110100011001110101110011000101110",
  1: "00100011000010000100001000010001110",
  2: "01110100010000100010001000100011111",
  3: "11111000100010000010000011000101110",
  4: "00010001100101010010111110001000010",
  5: "11111100001111000001000011000101110",
  6: "00110010001000011110100011000101110",
  7: "11111000010001000100010000100001000",
  8: "01110100011000101110100011000101110",
  9: "01110100011000101111000010001001100",
  " ": "00000000000000000000000000000000000",
  "-": "00000000000000011111000000000000000",
  A: "01110100011000111111100011000110001",
  B: "11110100011000111110100011000111110",
  C: "01110100011000010000100001000101110",
  D: "11100100101000110001100011001011100",
  E: "11111100001000011110100001000011111",
  F: "11111100001000011110100001000010000",
  G: "01110100011000010111100011000101111",
  H: "10001100011000111111100011000110001",
  I: "01110001000010000100001000010001110",
  J: "00111000100001000010000101001001100",
  K: "10001100101010011000101001001010001",
  L: "10000100001000010000100001000011111",
  M: "10001110111010110101100011000110001",
  N: "10001110011010110011100011000110001",
  O: "01110100011000110001100011000101110",
  P: "11110100011000111110100001000010000",
  Q: "01110100011000110001101011001001101",
  R: "11110100011000111110101001001010001",
  S: "01111100001000001110000010000111110",
  T: "11111001000010000100001000010000100",
  U: "10001100011000110001100011000101110",
  V: "10001100011000110001100010101000100",
  W: "10001100011000110101101011010101010",
  X: "10001100010101000100010101000110001",
  Y: "10001100010101000100001000010000100",
  Z: "11111000010001000100010001000011111",
  ".": "00000000000000000000000000110001100",
  "\xB7": "00000000000000001100011000000000000",
  ":": "00000011000110000000011000110000000",
  "/": "00001000100001000100010000100010000",
  "+": "00000001000010011111001000010000000",
  "?": "01110100010000100010001000000000100",
  "!": "00100001000010000100001000000000100",
  "#": "01010010101111101010111110101001010",
  "%": "11000110010001000100010001001100011",
  "(": "00010001000100001000010000010000010",
  ")": "01000001000001000010000100010001000",
  "&": "01100100101010001000101011001001101"
};
function LcdText({ text, px = 3, pad = 0, boot = false, label, className = "", style }) {
  const value = String(text ?? "").toUpperCase().padStart(pad, " ");
  const gap = px >= 5 ? 1 : px >= 3 ? 0.6 : 0.35;
  const w = Math.max(1, value.length * 6 - 1) * px, h2 = 7 * px;
  const on = [], off = [];
  [...value].forEach((ch, i) => {
    const g = G[ch] || G[" "];
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 5; x++) {
        const col = i * 6 + x;
        (g[y * 5 + x] === "1" ? on : off).push(
          /* @__PURE__ */ jsx3("rect", { x: col * px, y: y * px, width: px - gap, height: px - gap, style: { "--c": col } }, `${col}-${y}`)
        );
      }
  });
  const named = label !== null;
  return /* @__PURE__ */ jsx3("span", { className: `lcd-num ${className}`, style, children: /* @__PURE__ */ jsxs3(
    "svg",
    {
      width: w,
      height: h2,
      viewBox: `0 0 ${w} ${h2}`,
      role: named ? "img" : void 0,
      "aria-label": named ? label || String(text ?? "").trim() : void 0,
      "aria-hidden": named ? void 0 : "true",
      children: [
        /* @__PURE__ */ jsx3("g", { fill: "currentColor", opacity: ".1", children: off }),
        /* @__PURE__ */ jsx3("g", { className: boot ? "on" : void 0, fill: "currentColor", children: on })
      ]
    }
  ) });
}
function useCountUp(target, key) {
  const reduced = useReducedMotion();
  const text = String(target ?? "");
  const counts = (value) => /^\d+$/.test(value) && Number(value) >= 4;
  const [shown, setShown] = useState2(() => !prefersReduced2() && counts(text) ? "0".padStart(text.length, "0") : text);
  useEffect2(() => {
    const n = Number(text);
    if (reduced || !counts(text)) {
      setShown(text);
      return;
    }
    let k = 0;
    setShown("0".padStart(text.length, "0"));
    let timer = setTimeout(function tick() {
      k++;
      setShown(String(Math.round(n * k / 9)));
      if (k < 9) timer = setTimeout(tick, 45);
    }, 260);
    return () => clearTimeout(timer);
  }, [text, key, reduced]);
  return reduced ? text : shown;
}
function LcdCount({ value, run, ...rest }) {
  const shown = useCountUp(value, run);
  return /* @__PURE__ */ jsx3(LcdText, { text: shown, label: String(value ?? ""), boot: true, ...rest });
}
function Corners() {
  return /* @__PURE__ */ jsxs3(Fragment, { children: [
    /* @__PURE__ */ jsx3("span", { className: "corner tl", "aria-hidden": "true" }),
    /* @__PURE__ */ jsx3("span", { className: "corner tr", "aria-hidden": "true" }),
    /* @__PURE__ */ jsx3("span", { className: "corner bl", "aria-hidden": "true" }),
    /* @__PURE__ */ jsx3("span", { className: "corner br", "aria-hidden": "true" })
  ] });
}
function headCrop(rows) {
  const W = Math.max(...rows.map((r2) => r2.length)), H = rows.length, c = Math.min(40, W, H);
  if (W <= 40 && H <= 40) return [0, 0, W, H];
  let sx = 0, n = 0;
  for (let y = 0; y < c; y++)
    [...rows[y]].forEach((ch, x) => {
      if (ch !== ".") {
        sx += x;
        n++;
      }
    });
  return [Math.max(0, Math.min(W - c, Math.round(sx / Math.max(n, 1) - c / 2))), 0, c, c];
}
var LETTER = { head: 36, body: 60, dossier: 120 };
function AgentSprite({ agent, mode = "head", className = "" }) {
  const cast = castOf(agent);
  const character = cast && CHARACTERS[cast.character];
  const art = character?.sprite && SPRITES[character.sprite];
  if (!art) {
    const size = LETTER[mode] || 36;
    return /* @__PURE__ */ jsx3(
      "span",
      {
        className: `agent-letter ${className}`,
        "aria-hidden": "true",
        style: { width: size, height: size, fontSize: Math.round(size / 3), color: cast ? `rgb(${cast.hue})` : "var(--muted)" },
        children: cast?.initials || String(agent || "?").slice(0, 2).toUpperCase()
      }
    );
  }
  const crop = mode === "head" ? character.head || headCrop(art.frames[0]) : void 0;
  return /* @__PURE__ */ jsx3(Pixel, { sprite: character.sprite, crop, scale: mode === "dossier" ? 3 : 1, className: `agent-sprite ${className}` });
}

// src/pages.js
var MATURITY = {
  ready: "\u53EF\u7528",
  partial: "\u90E8\u5206\u53EF\u7528",
  draft: "\u8349\u7A3F",
  planned: "\u89C4\u5212\u4E2D"
};
var PAGES = [
  {
    id: "home",
    group: "\u4ECA\u65E5",
    code: "00",
    label: "\u4E16\u754C\u603B\u89C8",
    title: "\u4E16\u754C\u603B\u89C8",
    eyebrow: "TODAY \xB7 BASE",
    maturity: "ready",
    lead: "\u4ECA\u5929\u7684\u5B89\u6392\u3001\u5F85\u5904\u7406\u4E8B\u9879\u548C\u5E38\u7528\u5165\u53E3\u90FD\u5728\u8FD9\u91CC\u3002\u8FD9\u662F\u4F60\u6BCF\u5929\u6253\u5F00\u7684\u90A3\u4E00\u4E2A\u5165\u53E3\u3002"
  },
  {
    id: "inbox",
    group: "\u4ECA\u65E5",
    // 入口在顶栏与今日页；侧栏不重复，给伙伴屏留出空间。
    navHidden: true,
    code: "IN",
    label: "\u5F85\u5904\u7406",
    title: "\u5F85\u5904\u7406",
    eyebrow: "INBOX",
    maturity: "ready",
    lead: "\u9700\u8981\u4F60\u5224\u65AD\u7684\u4E8B\u9879\u96C6\u4E2D\u5728\u8FD9\u91CC\uFF0C\u53EA\u505A\u6C47\u603B\u548C\u8DF3\u8F6C\uFF0C\u52A8\u4F5C\u5728\u5BF9\u5E94\u9875\u9762\u5B8C\u6210\u3002\u76EE\u524D\u53EA\u6C47\u603B\u80FD\u4ECE\u672C\u673A\u6570\u636E\u76F4\u63A5\u8BFB\u51FA\u7684\u7EBF\u7D22\u3002",
    stage: "\u6C47\u603B \xB7 \u8DF3\u8F6C",
    plan: {
      will: [
        "\u6C47\u603B\u80FD\u529B\u4F53\u68C0\u7ED3\u679C\u3001\u77E5\u8BC6\u6574\u7406\u5019\u9009\u3001\u6539\u7248\u5019\u9009\u3001\u56DE\u6536\u53D1\u73B0\u3001\u591C\u95F4\u7ED3\u679C\u3001\u534F\u540C\u9000\u56DE\u3002",
        "\u6BCF\u6761\u4E8B\u9879\u9644\u5E26\u6765\u6E90\u3001\u5EFA\u8BAE\u52A8\u4F5C\u548C\u5F71\u54CD\uFF0C\u70B9\u51FB\u8DF3\u5230\u5BF9\u5E94\u9875\u9762\u5904\u7406\u3002"
      ],
      route: "\u8DEF\u7EBF 2.2\uFF08\u7B2C\u4E00\u7248\uFF09\xB7 3.4\uFF08\u6269\u5C55\uFF09",
      needs: "\u968F\u5404\u529F\u80FD\u4E0A\u7EBF\u9010\u7C7B\u63A5\u5165\uFF1B\u672C\u8EAB\u4E0D\u6267\u884C\u4EFB\u4F55\u52A8\u4F5C\u3002"
    }
  },
  {
    id: "assets",
    group: "\u8D44\u4EA7",
    code: "01",
    label: "\u8D44\u4EA7\u4ED3\u5E93",
    title: "\u8D44\u4EA7\u4ED3\u5E93",
    eyebrow: "ASSET LIBRARY",
    maturity: "ready",
    lead: "Skill\u3001Prompt\u3001\u5DE5\u4F5C\u6D41\u3001\u89C4\u5219\u6A21\u677F\u4E0E\u711A\u51B3\u5728\u8FD9\u91CC\u6536\u5F55\u4E0E\u8FED\u4EE3\uFF0C\u590D\u5236\u540E\u4EA4\u7ED9\u4EFB\u610F Agent\uFF0C\u89C4\u5219\u8FD8\u80FD\u88C5\u8FDB\u9879\u76EE\u3002",
    stage: "\u6536\u96C6 \xB7 \u8FED\u4EE3 \xB7 \u4EA4\u4ED8"
  },
  {
    id: "references",
    group: "\u8D44\u4EA7",
    code: "02",
    label: "\u9006\u5411\u5DE5\u7A0B",
    title: "\u9006\u5411\u5DE5\u7A0B",
    eyebrow: "REVERSE ENGINEERING",
    maturity: "ready",
    lead: "\u628A\u4F60\u8BA4\u4E3A\u597D\u7684\u5185\u5BB9\uFF08\u6587\u7AE0\u3001\u5E16\u5B50\u3001prompt\uFF09\u751F\u6210\u62C6\u89E3\u4EFB\u52A1\u5305\u4EA4\u7ED9 Agent\uFF0C\u56DE\u6536\u62A5\u544A\u540E\u7531\u4F60\u786E\u8BA4\uFF0C\u6C89\u6DC0\u4E3A\u711A\u51B3\u6761\u76EE\u6216 Prompt\u3002",
    stage: "\u6295\u7D20\u6750 \xB7 \u62C6\u89E3 \xB7 \u5165\u5E93"
  },
  {
    id: "agents",
    group: "\u76EE\u6807",
    code: "03",
    label: "\u667A\u80FD\u4F53\u7FA4",
    title: "\u667A\u80FD\u4F53\u7FA4",
    eyebrow: "SELECT AGENT",
    maturity: "partial",
    lead: "\u4F60\u7684\u961F\u4F0D\uFF1A\u6BCF\u4E2A Agent \u7684\u64C5\u957F\u3001\u6210\u672C\u4E0E\u5185\u5BB9\u68C0\u67E5\uFF1B\u4E5F\u5728\u8FD9\u91CC\u53D1\u73B0\u672C\u673A\u5165\u53E3\u3001\u786E\u8BA4\u7BA1\u7406\u76EE\u6807\u3001\u4E3A\u6362\u624B\u51C6\u5907\u4E0A\u4E0B\u6587\u3002\u4FEE\u6539\u771F\u5B9E\u914D\u7F6E\u524D\u90FD\u8981\u4F60\u786E\u8BA4\u3002",
    stage: "\u53D1\u73B0 \xB7 \u7BA1\u7406 \xB7 \u63A5\u529B"
  },
  {
    id: "projects",
    group: "\u76EE\u6807",
    code: "04",
    label: "\u9879\u76EE\u7A7A\u95F4",
    title: "\u9879\u76EE\u7A7A\u95F4",
    eyebrow: "PROJECTS",
    maturity: "ready",
    lead: "\u6BCF\u4E2A\u5728\u63A8\u8FDB\u7684\u9879\u76EE\u662F\u4E00\u5F20\u5B58\u6863\uFF1A\u6700\u8FD1\u6D3B\u52A8\u3001\u63A5\u529B\u8D70\u5230\u54EA\u3001\u8C01\u5728\u6301\u7B14\u3001\u4E0B\u4E00\u6B65\u662F\u4EC0\u4E48\u3002\u9879\u76EE\u7531\u672C\u5730\u4E0E GitHub \u81EA\u52A8\u53D1\u73B0\uFF0C\u53EA\u4FDD\u5B58 Current \u4E0E\u89C4\u5219\u7684\u6307\u9488\u3002",
    stage: "\u8BC6\u522B \xB7 \u5BF9\u9F50 \xB7 \u4EA4\u63A5"
  },
  {
    // 产品定义 v1.2 §2.2：能力体检不再是独立页面，并入智能体群的“能力体检”分区。
    // 保留注册项只为旧链接 #health 与站内搜索能落到该分区（mergedInto + anchor），侧栏不显示。
    id: "health",
    group: "\u76EE\u6807",
    navHidden: true,
    mergedInto: "agents",
    anchor: "agent-health",
    code: "03",
    label: "\u80FD\u529B\u4F53\u68C0",
    title: "\u80FD\u529B\u4F53\u68C0",
    eyebrow: "HEALTH CHECK",
    maturity: "partial",
    lead: "\u68C0\u67E5\u5404 Agent \u7684 Skill \u94FE\u63A5\u3001\u6302\u8F7D\u4E0E\u526F\u672C\u662F\u5426\u4E00\u81F4\uFF0C\u53D1\u73B0\u95EE\u9898\u8FDB\u5165\u5F85\u5904\u7406\uFF0C\u7531\u4F60\u786E\u8BA4\u540E\u624D\u4FEE\u590D\u3002",
    stage: "\u68C0\u67E5 \xB7 \u62A5\u544A \xB7 \u4FEE\u590D",
    plan: {
      will: [
        "\u53EA\u8BFB\u68C0\u67E5\uFF1ASkill \u94FE\u63A5\u662F\u5426\u5931\u6548\u3001\u6302\u8F7D\u4E0E\u53D1\u5E03\u8BB0\u5F55\u662F\u5426\u4E00\u81F4\u3001\u526F\u672C\u662F\u5426\u843D\u540E\u3001Agent \u914D\u7F6E\u662F\u5426\u53EF\u8BFB\u3001Hermes gateway \u662F\u5426\u5728\u7EBF\u3002",
        "\u7ED3\u679C\u8FDB\u5165\u5F85\u5904\u7406\uFF0C\u9644\u5EFA\u8BAE\u52A8\u4F5C\u3001\u5F71\u54CD\u548C\u6062\u590D\u65B9\u6CD5\uFF1B\u4FEE\u590D\u9700\u8981\u4F60\u786E\u8BA4\u540E\u6267\u884C\uFF0C\u5E76\u590D\u9A8C\u3002",
        "\u9996\u6279\u4FEE\u590D\u53EA\u505A\u4E24\u7C7B\u4F4E\u98CE\u9669\u52A8\u4F5C\uFF1A\u6E05\u7406\u5931\u6548\u94FE\u63A5\u3001\u6309\u53D1\u5E03\u8BB0\u5F55\u91CD\u5EFA\u6302\u8F7D\u3002"
      ],
      route: "\u8DEF\u7EBF 2.2\uFF08\u53EA\u8BFB\u4F53\u68C0\uFF09\xB7 4.3\uFF08\u4FEE\u590D\uFF09",
      needs: "\u4FEE\u590D\u5C5E\u4E8E\u771F\u5B9E\u7CFB\u7EDF\u5199\u5165\uFF0C\u9700\u8981\u4F60\u5355\u72EC\u6388\u6743\u3002"
    }
  },
  {
    id: "collab",
    group: "\u8FD0\u884C",
    code: "05",
    label: "\u534F\u540C",
    title: "\u534F\u540C",
    eyebrow: "DATA LINK",
    maturity: "partial",
    lead: "\u4E24\u53F0\u66B4\u9F99\u673A\u5BF9\u63A5\uFF1A\u5DE6\u8FB9\u662F\u6301\u7B14\u8005\uFF0C\u53F3\u8FB9\u662F\u4E0B\u4E00\u68D2\u3002\u8FDE\u63A5\u7EBF\u4E0A\u662F\u6A21\u677F #1 \u7684\u9636\u6BB5\u706F\uFF1B\u5230\u4EA4\u63A5\u70B9\u751F\u6210\u4E0B\u4E00\u68D2\u53E3\u4EE4\uFF0C\u4F60\u786E\u8BA4\u540E\u590D\u5236\uFF0C\u5C31\u662F\u4E00\u6B21\u6570\u636E\u4F20\u8F93\u3002",
    stage: "\u770B\u677F \xB7 \u6D3E\u53D1",
    plan: {
      will: [
        "\u5DF2\u53EF\u7528\uFF1A\u770B\u677F\u6309\u9879\u76EE CURRENT.md \u63A8\u65AD\u6A21\u677F #1 \u9636\u6BB5\u4E0E\u6301\u7B14\u8005\uFF0C\u64CD\u4F5C\u7559\u75D5\u5217\u51FA\u72B6\u6001\u94FE\u3001\u4EA4\u63A5\u6587\u6863\u4E0E\u590D\u5236\u8BB0\u5F55\uFF0C\u4E00\u952E\u6D3E\u53D1\u751F\u6210\u4E0B\u4E00\u68D2\u53E3\u4EE4\u3002",
        "\u53EF\u9A8C\u8BC1\u4EFB\u52A1\u81EA\u52A8\u6D3E\u53D1\uFF1A\u56DE\u5F52\u3001\u7A33\u5B9A\u6027\u77E9\u9635\u3001\u72EC\u7ACB\u590D\u6838\u6D3E\u5230\u4E91\u7AEF\u6216\u540E\u53F0\uFF0C\u7ED3\u679C\u4EE5\u5206\u652F\u6216\u62A5\u544A\u56DE\u6536\u8FDB\u5F85\u5904\u7406\u3002",
        "\u6267\u884C + \u76D1\u5DE5\uFF1ACodex \u6267\u884C\u3001Hermes \u5728\u540E\u53F0\u5BA1\u67E5\u9636\u6BB5\u4E0E\u5B8C\u6210\u58F0\u660E\uFF08\u5148\u5728\u4E00\u4E2A\u771F\u5B9E\u9879\u76EE\u4E0A\u8DD1\u901A\u8BD5\u70B9\uFF09\u3002"
      ],
      route: "\u8DEF\u7EBF 2.3\uFF08\u770B\u677F\u4E0E\u7559\u75D5\uFF09\xB7 2.4\uFF08\u4E00\u952E\u6D3E\u53D1\uFF09\u5DF2\u5F00\u53D1 \xB7 2.5\uFF08\u53EF\u9A8C\u8BC1\u4EFB\u52A1\u6D3E\u5F80\u4E91\u7AEF\uFF09\xB7 \u6A21\u677F #2 \u5F85\u8BD5\u70B9",
      needs: "\u76D1\u5DE5\u8BD5\u70B9\u9700\u8981\u4F60\u6307\u5B9A\u4E00\u4E2A\u771F\u5B9E\u9879\u76EE\uFF1B\u81EA\u52A8\u901A\u77E5\u9700\u8981\u9010\u9879\u5B9E\u6D4B\u6D88\u606F\u901A\u9053\u3002"
    }
  },
  {
    id: "night",
    group: "\u8FD0\u884C",
    code: "06",
    label: "\u591C\u5DE1",
    title: "\u591C\u5DE1",
    eyebrow: "NIGHT SHIFT",
    maturity: "planned",
    lead: "\u5148\u767B\u8BB0\u8F93\u5165\u3001\u9884\u89C8\u5E76\u6279\u51C6\u591C\u5DE1\u4EFB\u52A1\uFF1B\u9ED8\u8BA4\u5173\u95ED\uFF0C\u6388\u6743\u540E\u670D\u52A1\u53EF\u5728\u6307\u5B9A\u7A97\u53E3\u81EA\u52A8\u6267\u884C\u3002\u4EBA\u6C11\u5E01\u610F\u5411\u8349\u7A3F\u4E0E\u771F\u5B9E USD \u8BA1\u5212\u5206\u5F00\u4FDD\u5B58\u3002",
    stage: "\u89C4\u5212"
  },
  {
    id: "knowledge",
    group: "\u77E5\u8BC6",
    code: "07",
    label: "\u77E5\u8BC6\u4ED3\u5E93",
    title: "\u77E5\u8BC6\u4ED3\u5E93",
    eyebrow: "KNOWLEDGE",
    maturity: "partial",
    lead: "\u53EA\u8BFB\u8FDE\u63A5 Obsidian\uFF0C\u6309\u539F\u6587\u67E5\u8BE2\uFF1B\u4EA4\u7ED9\u672C\u4EBA Codex \u6574\u7406\uFF0C\u5019\u9009\u7ECF\u786E\u8BA4\u624D\u843D\u5230\u201C00 \u5F85\u6574\u7406\u201D\u3002",
    stage: "\u8FDE\u63A5 \xB7 \u67E5\u8BE2 \xB7 \u6574\u7406 \xB7 \u7EF4\u62A4"
  },
  {
    // 路线 v3 切片 5.2：周视图 + 今天、拖出规划块写入“工作台”日历、todo 读写“工作台”提醒事项；
    // 依赖本机小助手（EventKit），非 macOS 或未授权时页面如实显示，标“部分可用”。
    id: "calendar",
    group: "\u751F\u6D3B",
    code: "08",
    label: "\u65E5\u5386",
    title: "\u65E5\u5386",
    eyebrow: "CALENDAR",
    maturity: "partial",
    lead: "\u4F60\u7684\u65F6\u95F4\u89C4\u5212\u672C\uFF1A\u5728\u65F6\u95F4\u8F74\u4E0A\u62D6\u51FA\u89C4\u5212\u5757\u5199\u4E00\u53E5\u8BDD\uFF0C\u65C1\u8FB9\u662F\u9632\u6B62\u9057\u5FD8\u7684 todo\u3002\u6570\u636E\u5728 macOS \u65E5\u5386\u4E0E\u63D0\u9192\u4E8B\u9879\uFF0C\u624B\u673A\u4E5F\u80FD\u6536\u5230\u63D0\u9192\u3002",
    stage: "\u89C4\u5212 \xB7 \u5B89\u6392"
  },
  {
    id: "notes",
    group: "\u751F\u6D3B",
    code: "09",
    label: "\u968F\u624B\u8BB0",
    title: "\u968F\u624B\u8BB0",
    eyebrow: "QUICK NOTES",
    maturity: "ready",
    lead: "\u5148\u628A\u5FF5\u5934\u8BB0\u4E0B\u6765\uFF0C\u652F\u6301\u5217\u8868\u3001\u4EFB\u52A1\u548C\u4E94\u79CD\u5B57\u8272\u3002\u5148\u4FDD\u5B58\u5728\u672C\u5E94\u7528\uFF1B\u5199\u5165 Obsidian \u8981\u53E6\u884C\u6388\u6743\u3001\u9884\u89C8\u5E76\u786E\u8BA4\uFF0C\u503C\u5F97\u53CD\u590D\u7528\u7684\u53EF\u70BC\u5165\u711A\u51B3\u3002",
    stage: "\u6355\u6349"
  },
  {
    // 路线 v3 切片 5.3：公开只读接口 + 本机缓存。接口字段映射尚未在本机对真实接口实测，标“部分可用”。
    id: "aihot",
    group: "\u751F\u6D3B",
    code: "10",
    label: "AI HOT",
    title: "AI HOT",
    eyebrow: "AI HOT \xB7 DAILY",
    maturity: "partial",
    lead: "\u6BCF\u65E5 AI \u8D44\u8BAF\uFF1A\u7CBE\u9009\u3001\u70ED\u70B9\u3001\u65E5\u62A5\uFF0C\u4ECE aihot.news \u516C\u5F00\u63A5\u53E3\u62C9\u53D6\u540E\u7F13\u5B58\u5728\u672C\u673A\u3002\u770B\u5230\u503C\u5F97\u5B66\u7684\uFF0C\u6536\u85CF\u5230\u5B66\u4E60\u6210\u957F\u3002",
    stage: "\u6D4F\u89C8 \xB7 \u6536\u85CF"
  },
  {
    // 路线 v3 切片 5.4：书架只读索引、学习状态、链接收藏；内容解析以后再做，标“部分可用”。
    id: "learning",
    group: "\u751F\u6D3B",
    code: "11",
    label: "\u5B66\u4E60\u6210\u957F",
    title: "\u5B66\u4E60\u6210\u957F",
    eyebrow: "LEARNING",
    maturity: "partial",
    lead: "\u7535\u5B50\u4E66\u548C\u94FE\u63A5\u96C6\u4E2D\u5728\u4E00\u5904\uFF0C\u8BB0\u4E0B\u60F3\u5B66\u3001\u5728\u5B66\u3001\u5B66\u5B8C\u3002\u539F\u4EF6\u7559\u5728\u539F\u5904\uFF0C\u5DE5\u4F5C\u53F0\u53EA\u5EFA\u7D22\u5F15\u3002",
    stage: "\u7D22\u5F15 \xB7 \u5B66\u4E60"
  },
  {
    id: "silver",
    group: "\u751F\u6D3B",
    code: "12",
    label: "\u94F6\u9970\u8BA1\u5212",
    title: "\u94F6\u9970\u8BA1\u5212",
    eyebrow: "SILVER",
    // 路线 v3 5.5（云端提前开发）：欣赏墙、收藏格、白色描边剪影；自动抠图只在 macOS 上可用，需本机验证。
    // 用户 2026-10-03：视觉待改版，先标“部分可用”。
    maturity: "partial",
    lead: "\u94F6\u9970\u7684\u6B23\u8D4F\u5899\u548C\u4E2A\u4EBA\u6536\u85CF\u683C\uFF0C\u53EA\u7ED9\u81EA\u5DF1\u770B\u3002\u56FE\u7247\u53EA\u5B58\u5728\u672C\u673A\uFF1B\u6536\u85CF\u683C\u7528\u767D\u8272\u63CF\u8FB9\u526A\u5F71\u5C55\u793A\uFF0C\u53EF\u4EE5\u624B\u52A8\u66FF\u6362\u3002",
    stage: "\u6B23\u8D4F \xB7 \u6536\u85CF"
  },
  {
    id: "settings",
    group: "\u7CFB\u7EDF",
    code: "13",
    label: "\u8BBE\u7F6E",
    title: "\u8BBE\u7F6E",
    eyebrow: "SETTINGS",
    maturity: "partial",
    lead: "\u672C\u5730\u6570\u636E\u7684\u4F4D\u7F6E\u3001\u5907\u4EFD\u4E0E\u5408\u5E76\uFF0CAI HOT \u7F51\u7EDC\u8BBF\u95EE\u4E0E\u5B66\u4E60\u6210\u957F\u4E66\u67B6\u6587\u4EF6\u5939\uFF1B\u6A21\u578B\u8FDE\u63A5\u9ED8\u8BA4\u5173\u95ED\uFF0C\u6388\u6743\u540E\u5148\u9884\u89C8\u518D\u786E\u8BA4\u8BF7\u6C42\u3002",
    stage: "\u6570\u636E \xB7 \u6A21\u578B"
  },
  {
    // 产品定义 v1.2 §2.2：版本归档下移到系统分组最下方；单个资产的版本在资产详情的“历史”标签里查看。
    id: "history",
    group: "\u7CFB\u7EDF",
    code: "14",
    label: "\u7248\u672C\u5F52\u6863",
    title: "\u7248\u672C\u5F52\u6863",
    eyebrow: "VERSIONS & ARCHIVE",
    maturity: "ready",
    lead: "\u6BCF\u6B21\u4FEE\u6539\u90FD\u662F\u4E00\u4E2A\u65B0\u7248\u672C\u3002\u6062\u590D\u65E7\u7248\u540C\u6837\u662F\u8FFD\u52A0\uFF0C\u5386\u53F2\u4E0D\u4F1A\u88AB\u6539\u5199\u3002",
    stage: "\u8FFD\u6EAF \xB7 \u6062\u590D"
  }
];
var page = (id) => PAGES.find((p) => p.id === id);
var ZONES = [
  { id: "today", label: "\u4ECA\u65E5", groups: ["\u4ECA\u65E5"] },
  { id: "work", label: "\u5DE5\u4F5C\u533A", en: "WORK", groups: ["\u8D44\u4EA7", "\u76EE\u6807", "\u8FD0\u884C", "\u77E5\u8BC6"] },
  { id: "life", label: "\u751F\u6D3B\u533A", en: "LIFE", groups: ["\u751F\u6D3B"] },
  { id: "system", label: "\u7CFB\u7EDF", en: "SYSTEM", groups: ["\u7CFB\u7EDF"] }
];
var LAYERS = [
  { id: "\u8D44\u4EA7", zone: "work", en: "ASSETS", question: "\u6211\u6709\u4EC0\u4E48", pages: ["assets", "references"] },
  { id: "\u76EE\u6807", zone: "work", en: "TARGETS", question: "\u4EA4\u7ED9\u8C01\u3001\u5728\u54EA\u91CC", pages: ["agents", "projects"] },
  { id: "\u8FD0\u884C", zone: "work", en: "RUNTIME", question: "\u600E\u4E48\u8DD1\u8D77\u6765", pages: ["collab", "night"] },
  { id: "\u77E5\u8BC6", zone: "work", en: "KNOWLEDGE", question: "\u6211\u77E5\u9053\u4EC0\u4E48", pages: ["knowledge"] },
  {
    id: "\u751F\u6D3B",
    zone: "life",
    en: "LIFE",
    question: "\u6211\u7684\u65E5\u5B50",
    pages: ["calendar", "notes", "aihot", "learning", "silver"]
  }
];

// src/components.jsx
import { Fragment as Fragment2, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var MARKS = {
  home: "mark_crest",
  assets: "mark_egg",
  agents: "mark_agent",
  projects: "mark_folder",
  knowledge: "mark_book",
  notes: "mark_pencil",
  history: "mark_branch",
  references: "mark_scan",
  night: "mark_moon",
  settings: "mark_gear"
};
var typeLabel = {
  Skill: "Skill",
  Prompt: "Prompt",
  Workflow: "\u5DE5\u4F5C\u6D41",
  Rule: "\u89C4\u5219",
  // 焚决（切片 1.3b）：资产仓库第五种类型，数据仍在主库顶层 scrolls，不进 assets。
  Scroll: "\u711A\u51B3"
};
var typeCode = {
  Skill: "SKL",
  Prompt: "PRM",
  Workflow: "WFL",
  Rule: "RUL",
  Scroll: "FJ"
};
function TypeIcon({ type, size = 24, className = "" }) {
  if (type === "Rule")
    return /* @__PURE__ */ jsx4(
      Pixel,
      {
        sprite: "rule_scroll",
        fit: size,
        className: `type-icon-pixel ${className}`
      }
    );
  const Icon = type === "Skill" ? Layers : type === "Prompt" ? Quote : type === "Scroll" ? Flame : Workflow;
  return /* @__PURE__ */ jsx4(Icon, { size, className: className || void 0 });
}
function Button({
  children,
  secondary = false,
  className = "",
  ...props
}) {
  return /* @__PURE__ */ jsx4(
    "button",
    {
      className: `${secondary ? "button secondary" : "button"} ${className}`,
      ...props,
      children
    }
  );
}
function Badge({ children, tone = "" }) {
  return /* @__PURE__ */ jsx4("span", { className: `badge ${tone}`, children });
}
function Maturity({ level }) {
  if (!level) return null;
  return /* @__PURE__ */ jsxs4("span", { className: `maturity ${level}`, children: [
    /* @__PURE__ */ jsx4("i", { "aria-hidden": "true" }),
    MATURITY[level]
  ] });
}
function Steps({ items, current: current2, label = "\u6D41\u7A0B" }) {
  return /* @__PURE__ */ jsx4("ol", { className: "steps", "aria-label": label, children: items.map((item, i) => /* @__PURE__ */ jsxs4(
    "li",
    {
      className: i < current2 ? "done" : i === current2 ? "now" : "",
      "aria-current": i === current2 ? "step" : void 0,
      children: [
        /* @__PURE__ */ jsx4("span", { className: "steps-dot", "aria-hidden": "true", children: i < current2 ? "\u2713" : i + 1 }),
        /* @__PURE__ */ jsxs4("span", { className: "steps-text", children: [
          item,
          i === current2 && /* @__PURE__ */ jsx4("small", { children: "\u4E0B\u4E00\u6B65" })
        ] })
      ]
    },
    item
  )) });
}
function Empty({ icon: Icon, sprite = "egg", title, children, action }) {
  return /* @__PURE__ */ jsxs4("div", { className: "empty", children: [
    /* @__PURE__ */ jsx4("div", { className: "empty-screen", "aria-hidden": "true", children: Icon ? /* @__PURE__ */ jsx4(Icon, { size: 24, strokeWidth: 1.6 }) : /* @__PURE__ */ jsx4(Pixel, { sprite, size: 40 }) }),
    /* @__PURE__ */ jsx4("small", { className: "empty-code", "aria-hidden": "true", children: "NO DATA" }),
    /* @__PURE__ */ jsx4("h3", { children: title }),
    children && /* @__PURE__ */ jsx4("p", { children }),
    action
  ] });
}
function PageHeading({ page: page2, eyebrow, title, description, action }) {
  const meta = page2 ? page(page2) : null;
  return /* @__PURE__ */ jsxs4("header", { className: "page-heading", children: [
    page2 && MARKS[page2] && /* @__PURE__ */ jsx4(Pixel, { sprite: MARKS[page2], size: 210, className: "page-mark", dots: true }),
    /* @__PURE__ */ jsxs4("div", { className: "page-heading-main", children: [
      /* @__PURE__ */ jsxs4("div", { className: "page-eyebrow", children: [
        meta && /* @__PURE__ */ jsx4("span", { className: "page-code", children: meta.code }),
        page2 === "silver" ? /* @__PURE__ */ jsx4("span", { children: eyebrow || meta?.eyebrow }) : /* @__PURE__ */ jsx4(LcdText, { text: eyebrow || meta?.eyebrow, px: 2, boot: true }),
        meta?.maturity && /* @__PURE__ */ jsx4(Maturity, { level: meta.maturity })
      ] }),
      /* @__PURE__ */ jsx4("h1", { children: title || meta?.title }),
      (description || meta?.lead) && /* @__PURE__ */ jsx4("p", { className: "page-lead", children: description || meta.lead })
    ] }),
    action && /* @__PURE__ */ jsx4("div", { className: "page-heading-action", children: action })
  ] });
}
function Dialog({ title, children, onClose, drawer = false, recoverFocus = false }) {
  const ref = useRef3();
  const closeRef = useRef3(onClose);
  closeRef.current = onClose;
  useEffect3(() => {
    const previous = document.activeElement;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handle = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const els = ref.current.querySelectorAll(
          'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]'
        );
        const first = els[0], last = els[els.length - 1];
        if (!els.length) {
          e.preventDefault();
          return;
        }
        if (recoverFocus && !ref.current.contains(document.activeElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
          return;
        }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, []);
  return /* @__PURE__ */ jsx4(
    "div",
    {
      className: `overlay ${drawer ? "drawer-overlay" : ""}`,
      onMouseDown: (e) => e.target === e.currentTarget && onClose(),
      children: /* @__PURE__ */ jsxs4(
        "section",
        {
          ref,
          tabIndex: -1,
          role: "dialog",
          "aria-modal": "true",
          "aria-label": title,
          className: drawer ? "drawer" : "modal",
          children: [
            /* @__PURE__ */ jsxs4("div", { className: "dialog-top", children: [
              /* @__PURE__ */ jsx4("span", { children: title }),
              /* @__PURE__ */ jsx4(
                "button",
                {
                  className: "icon-button dialog-close",
                  onClick: onClose,
                  "aria-label": "\u5173\u95ED",
                  children: /* @__PURE__ */ jsx4(X, { size: 18 })
                }
              )
            ] }),
            children
          ]
        }
      )
    }
  );
}
function Cover({ type, sprite, serial = 1, version = 1, stage, large = false, bump = false, uses }) {
  return /* @__PURE__ */ jsxs4(
    "div",
    {
      className: `cover lcd type-${type} ${large ? "large" : ""}`,
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ jsxs4("span", { className: "cover-code", children: [
          typeCode[type],
          ".",
          String(serial).padStart(2, "0")
        ] }),
        version !== null && /* @__PURE__ */ jsxs4("span", { className: "cover-version", children: [
          "v",
          version,
          ".0"
        ] }),
        uses !== void 0 && /* @__PURE__ */ jsx4("span", { className: "cover-uses", children: /* @__PURE__ */ jsx4(Odometer, { value: uses }) }),
        large && /* @__PURE__ */ jsx4("span", { className: "cover-ring" }),
        /* @__PURE__ */ jsx4(Pixel, { sprite: sprite || type, size: large ? 96 : 64, className: "cover-glyph" }),
        bump && /* @__PURE__ */ jsxs4(Fragment2, { children: [
          /* @__PURE__ */ jsx4("span", { className: "version-scan" }),
          /* @__PURE__ */ jsx4("span", { className: "version-tag", children: "NEW VERSION" })
        ] }),
        large && stage !== void 0 && /* @__PURE__ */ jsx4("span", { className: "cover-stage", children: /* @__PURE__ */ jsx4(StageBar, { stage }) })
      ]
    }
  );
}

// src/SkillDelivery.jsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";

// src/SkillCopies.jsx
import React6, { useEffect as useEffect5, useRef as useRef5, useState as useState4, useId } from "react";
import { Plus, RefreshCw as RefreshCw2, FolderSearch } from "lucide-react";
import { Fragment as Fragment3, jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";

// src/AgentWriteUI.jsx
import React9, { useEffect as useEffect6, useRef as useRef7, useState as useState6 } from "react";

// src/PageChoices.jsx
import React7 from "react";
import { jsx as jsx7 } from "react/jsx-runtime";

// src/capability-ui-core.jsx
import React8, { useRef as useRef6, useState as useState5 } from "react";
import { Fragment as Fragment4, jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";

// src/AgentWriteUI.jsx
import { Fragment as Fragment5, jsx as jsx9, jsxs as jsxs8 } from "react/jsx-runtime";

// src/SkillSourceUpdate.jsx
import React10, { useRef as useRef8, useState as useState7 } from "react";
import { Fragment as Fragment6, jsx as jsx10, jsxs as jsxs9 } from "react/jsx-runtime";

// src/SkillSources.jsx
import React11, { useEffect as useEffect7, useRef as useRef9, useState as useState8 } from "react";
import { FolderSearch as FolderSearch2, GitFork, RefreshCw as RefreshCw3 } from "lucide-react";
import { jsx as jsx11, jsxs as jsxs10 } from "react/jsx-runtime";
var messageOf = (error) => error.message || "\u672C\u5730\u670D\u52A1\u5904\u7406\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002";
var timeLabel = (value) => new Date(value).toLocaleString("zh-CN");
function SkillSourceImport({
  state,
  adoptState,
  notify,
  onClose,
  onSelect,
  initialRoots,
  initialSearch = ""
}) {
  const [roots, setRoots] = useState8(initialRoots?.join("\n") || "");
  const pendingSearch = useRef9(initialSearch);
  const [result, setResult] = useState8(null);
  const [fresh, setFresh] = useState8(false);
  const [search, setSearch] = useState8("");
  const [preview, setPreview] = useState8(null);
  const [title, setTitle] = useState8("");
  const [busy, setBusy] = useState8("loading");
  const [error, setError] = useState8("");
  const [expired, setExpired] = useState8(false);
  const lock = useRef9(true);
  const alive = useRef9(true);
  useEffect7(() => {
    alive.current = true;
    if (initialRoots?.length) {
      lock.current = false;
      setBusy("");
      return () => {
        alive.current = false;
      };
    }
    request("/skill-sources").then((value) => {
      if (alive.current) setRoots(value.roots.join("\n"));
    }).catch((e) => {
      if (alive.current) setError(messageOf(e));
    }).finally(() => {
      if (alive.current) {
        lock.current = false;
        setBusy("");
      }
    });
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect7(() => {
    setExpired(false);
    if (!preview) return;
    const remaining = new Date(preview.expiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      setExpired(true);
      return;
    }
    const timer = setTimeout(() => setExpired(true), remaining);
    return () => clearTimeout(timer);
  }, [preview]);
  function close() {
    if (!lock.current) onClose();
  }
  function clearPreview() {
    setPreview(null);
    setTitle("");
    setError("");
  }
  async function discover() {
    if (lock.current || !roots.trim()) return;
    lock.current = true;
    setBusy("scan");
    clearPreview();
    setFresh(false);
    try {
      const value = await request("/skill-sources/discover", {
        roots: [
          ...new Set(
            roots.split(/\r?\n/).map((p) => p.trim()).filter(Boolean)
          )
        ]
      });
      if (!alive.current) return;
      setResult(value);
      setFresh(true);
      setSearch(pendingSearch.current);
      pendingSearch.current = "";
    } catch (e) {
      if (alive.current) setError(messageOf(e));
    } finally {
      lock.current = false;
      if (alive.current) setBusy("");
    }
  }
  async function inspect(item, retainTitle = false) {
    if (lock.current || !fresh || item.status !== "candidate") return;
    lock.current = true;
    setBusy(`preview:${item.id}`);
    if (retainTitle) setError("");
    else clearPreview();
    try {
      const value = await request("/skill-sources/preview", {
        candidateId: item.id
      });
      const latest = await request("/workspace");
      if (!alive.current) return;
      if (!latest) throw new Error("\u8D44\u4EA7\u5E93\u6682\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u8BD5\u9884\u89C8\u3002");
      adoptState(latest);
      setPreview({ ...value, candidateId: item.id });
      if (!retainTitle) setTitle(value.name.slice(0, 80));
    } catch (e) {
      if (alive.current)
        setError(`${item.name}\uFF1A\u672A\u53D6\u5F97\u5B8C\u6574\u5305\uFF0C\u4E0D\u80FD\u786E\u8BA4\u6536\u5F55\u3002${messageOf(e)}`);
    } finally {
      lock.current = false;
      if (alive.current) setBusy("");
    }
  }
  const changed = !!preview && preview.revision !== state.revision;
  const canImport = !!preview && fresh && !expired && !changed && !!title.trim();
  async function confirm(e) {
    e.preventDefault();
    if (lock.current || !canImport) return;
    lock.current = true;
    setBusy("import");
    setError("");
    try {
      const value = await request("/skill-sources/import", {
        token: preview.token,
        revision: preview.revision,
        title: title.trim()
      });
      if (!alive.current) return;
      adoptState(value.state);
      notify(
        value.alreadyImported ? "\u5DF2\u627E\u5230\u76F8\u540C\u6765\u6E90\u5FEB\u7167\uFF0C\u672A\u91CD\u590D\u6536\u5F55" : "Skill \u5DF2\u6536\u5F55\uFF0C\u672A\u5B89\u88C5\u6216\u6267\u884C"
      );
      onClose();
      onSelect(value.assetId);
    } catch (e2) {
      if (alive.current) setError(messageOf(e2));
    } finally {
      lock.current = false;
      if (alive.current) setBusy("");
    }
  }
  const shown = (result?.items || []).filter(
    (item) => `${item.name} ${item.path}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  return /* @__PURE__ */ jsx11(Dialog, { title: "\u6536\u5F55\u672C\u673A Skill", onClose: close, children: /* @__PURE__ */ jsxs10("form", { className: "asset-form", onSubmit: confirm, "aria-busy": !!busy, children: [
    /* @__PURE__ */ jsxs10("div", { className: "import-head", children: [
      /* @__PURE__ */ jsx11(
        Steps,
        {
          items: ["\u626B\u63CF\u76EE\u5F55", "\u9884\u89C8\u5B8C\u6574\u5305", "\u786E\u8BA4\u6536\u5F55"],
          current: preview ? 2 : result && fresh ? 1 : 0
        }
      ),
      /* @__PURE__ */ jsx11(Badge, { tone: "muted", children: "\u4EC5\u9650\u672C\u673A" })
    ] }),
    /* @__PURE__ */ jsxs10("label", { children: [
      "\u626B\u63CF\u76EE\u5F55",
      /* @__PURE__ */ jsx11(
        "textarea",
        {
          "aria-label": "\u626B\u63CF\u76EE\u5F55",
          rows: 3,
          value: roots,
          disabled: !!busy,
          placeholder: "\u6BCF\u884C\u4E00\u4E2A\u5177\u4F53 Skill \u76EE\u5F55",
          onChange: (e) => {
            setRoots(e.target.value);
            setResult(null);
            setFresh(false);
            clearPreview();
          }
        }
      )
    ] }),
    /* @__PURE__ */ jsx11("p", { className: "detail-footnote", children: "\u53EA\u626B\u63CF\u8FD9\u4E9B\u76EE\u5F55\uFF1B\u4E0D\u5B89\u88C5\u3001\u6FC0\u6D3B\u6216\u6267\u884C\u5176\u4E2D\u7684\u5185\u5BB9\u3002" }),
    /* @__PURE__ */ jsx11("div", { className: "heading-actions", children: /* @__PURE__ */ jsxs10(
      Button,
      {
        type: "button",
        secondary: true,
        disabled: !!busy || !roots.trim(),
        onClick: discover,
        children: [
          /* @__PURE__ */ jsx11(FolderSearch2, { size: 16 }),
          busy === "loading" ? "\u8BFB\u53D6\u76EE\u5F55\u2026" : busy === "scan" ? "\u626B\u63CF\u4E2D\u2026" : "\u626B\u63CF\u76EE\u5F55"
        ]
      }
    ) }),
    result && /* @__PURE__ */ jsxs10("section", { className: "skill-source-results", "aria-label": "\u626B\u63CF\u7ED3\u679C", children: [
      /* @__PURE__ */ jsxs10("p", { className: "context-receipt", role: "status", children: [
        fresh ? `\u53D1\u73B0 ${result.items.length} \u9879` : "\u4E0A\u6B21\u626B\u63CF\u7ED3\u679C \xB7 \u8BF7\u91CD\u65B0\u626B\u63CF",
        result.truncated ? " \xB7 \u626B\u63CF\u672A\u5B8C\u6210\uFF0C\u8BF7\u7F29\u5C0F\u76EE\u5F55\u8303\u56F4" : ""
      ] }),
      result.errors.length > 0 && /* @__PURE__ */ jsxs10("div", { className: "error", role: "alert", children: [
        /* @__PURE__ */ jsx11("p", { children: "\u4EE5\u4E0B\u76EE\u5F55\u672A\u5B8C\u6210\u626B\u63CF\uFF1A" }),
        result.errors.map((item, index) => /* @__PURE__ */ jsxs10(
          "p",
          {
            className: "reference-identity",
            children: [
              item.path,
              " \xB7 ",
              item.message
            ]
          },
          `${item.path}:${index}`
        ))
      ] }),
      /* @__PURE__ */ jsxs10("label", { children: [
        "\u641C\u7D22\u626B\u63CF\u7ED3\u679C",
        /* @__PURE__ */ jsx11(
          "input",
          {
            "aria-label": "\u641C\u7D22\u626B\u63CF\u7ED3\u679C",
            value: search,
            disabled: !!busy,
            placeholder: "\u540D\u79F0\u6216\u8DEF\u5F84",
            onChange: (e) => {
              setSearch(e.target.value);
              clearPreview();
            }
          }
        )
      ] }),
      shown.length ? /* @__PURE__ */ jsx11(
        "div",
        {
          className: "skill-source-list",
          tabIndex: 0,
          "aria-label": "\u672C\u673A Skill \u5019\u9009",
          children: shown.map((item) => /* @__PURE__ */ jsxs10(
            "div",
            {
              className: `context-preview source-candidate ${item.status === "candidate" ? "" : "blocked"}`,
              children: [
                /* @__PURE__ */ jsxs10("div", { className: "workflow-reference-heading", children: [
                  /* @__PURE__ */ jsx11("strong", { children: item.name }),
                  /* @__PURE__ */ jsx11(Badge, { tone: "muted", children: item.status === "candidate" ? "\u5F85\u9884\u89C8" : "\u65E0\u6CD5\u5B8C\u6574\u6536\u5F55" })
                ] }),
                /* @__PURE__ */ jsx11("p", { className: "reference-identity", children: item.path }),
                item.message && /* @__PURE__ */ jsx11("p", { className: "detail-footnote", children: item.message }),
                item.status === "candidate" && /* @__PURE__ */ jsx11("div", { className: "heading-actions", children: /* @__PURE__ */ jsxs10(
                  Button,
                  {
                    type: "button",
                    secondary: true,
                    disabled: !!busy || !fresh,
                    "aria-label": `\u9884\u89C8 ${item.name}`,
                    onClick: () => inspect(item),
                    children: [
                      /* @__PURE__ */ jsx11(RefreshCw3, { size: 15 }),
                      busy === `preview:${item.id}` ? "\u8BFB\u53D6\u4E2D\u2026" : "\u9884\u89C8"
                    ]
                  }
                ) })
              ]
            },
            item.id
          ))
        }
      ) : /* @__PURE__ */ jsx11("p", { className: "detail-footnote", children: result.items.length ? "\u6CA1\u6709\u5339\u914D\u9879\uFF0C\u8BF7\u4FEE\u6539\u5173\u952E\u8BCD\u3002" : "\u672A\u53D1\u73B0 Skill\uFF0C\u8BF7\u8C03\u6574\u626B\u63CF\u76EE\u5F55\u3002" })
    ] }),
    preview && /* @__PURE__ */ jsxs10(
      "section",
      {
        className: "context-preview source-preview",
        "aria-label": "\u5B8C\u6574\u5305\u9884\u89C8",
        children: [
          /* @__PURE__ */ jsxs10("div", { className: "workflow-reference-heading", children: [
            /* @__PURE__ */ jsx11("strong", { children: preview.name }),
            /* @__PURE__ */ jsx11(Badge, { tone: "muted", children: preview.existingAssetId ? "\u5DF2\u6709\u76F8\u540C\u5FEB\u7167" : "\u5B8C\u6574\u5305 \xB7 \u5F85\u786E\u8BA4" })
          ] }),
          /* @__PURE__ */ jsx11("p", { className: "reference-identity", children: preview.location }),
          /* @__PURE__ */ jsxs10("p", { className: "detail-footnote", children: [
            preview.files.length,
            " \u9879 \xB7 ",
            preview.bytes.toLocaleString(),
            " B"
          ] }),
          /* @__PURE__ */ jsxs10("code", { className: "context-hash", children: [
            "SHA-256 \xB7 ",
            preview.fingerprint
          ] }),
          /* @__PURE__ */ jsxs10("small", { children: [
            "\u9884\u89C8\u6709\u6548\u671F\u81F3 ",
            timeLabel(preview.expiresAt)
          ] }),
          /* @__PURE__ */ jsxs10("details", { children: [
            /* @__PURE__ */ jsx11("summary", { children: "\u5165\u53E3\u5168\u6587 \xB7 SKILL.md" }),
            /* @__PURE__ */ jsx11(
              "pre",
              {
                className: "history-text",
                tabIndex: 0,
                "aria-label": "Skill \u5165\u53E3\u5168\u6587",
                children: preview.content
              }
            )
          ] }),
          /* @__PURE__ */ jsxs10("details", { children: [
            /* @__PURE__ */ jsxs10("summary", { children: [
              "\u5B8C\u6574\u6587\u4EF6\u6E05\u5355 \xB7 ",
              preview.files.length,
              " \u9879"
            ] }),
            /* @__PURE__ */ jsx11(
              "div",
              {
                className: "history-files history-text",
                tabIndex: 0,
                "aria-label": "\u5B8C\u6574\u6587\u4EF6\u6E05\u5355",
                children: preview.files.map((file) => /* @__PURE__ */ jsxs10("div", { children: [
                  /* @__PURE__ */ jsxs10("strong", { children: [
                    file.path,
                    file.directory ? "/" : ""
                  ] }),
                  /* @__PURE__ */ jsxs10("small", { children: [
                    file.directory ? "\u76EE\u5F55" : `${file.bytes.toLocaleString()} B`,
                    " ",
                    "\xB7 \u6743\u9650 ",
                    Number(file.mode).toString(8)
                  ] }),
                  file.sha256 && /* @__PURE__ */ jsxs10("code", { className: "context-hash", children: [
                    "SHA-256 \xB7 ",
                    file.sha256
                  ] })
                ] }, file.path))
              }
            )
          ] }),
          /* @__PURE__ */ jsx11("p", { className: "detail-footnote", children: "\u5B8C\u6574\u5305\u4EC5\u8868\u793A\u6587\u4EF6\u8BFB\u53D6\u5B8C\u6574\uFF0C\u4E0D\u4EE3\u8868\u5B89\u5168\u3001\u5DF2\u5B89\u88C5\u6216\u5DF2\u91C7\u7528\u3002" }),
          !preview.existingAssetId && /* @__PURE__ */ jsxs10("label", { children: [
            "\u6536\u5F55\u540D\u79F0",
            /* @__PURE__ */ jsx11(
              "input",
              {
                "aria-label": "\u6536\u5F55\u540D\u79F0",
                value: title,
                required: true,
                maxLength: 80,
                disabled: !!busy,
                onChange: (e) => setTitle(e.target.value)
              }
            )
          ] }),
          (expired || changed) && /* @__PURE__ */ jsx11("p", { className: "error", role: "alert", children: expired ? "\u9884\u89C8\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u540E\u786E\u8BA4\u3002" : "\u8D44\u4EA7\u5E93\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u540E\u786E\u8BA4\u3002" })
        ]
      }
    ),
    error && /* @__PURE__ */ jsx11("p", { className: "error", role: "alert", children: error }),
    /* @__PURE__ */ jsxs10("div", { className: "form-actions", children: [
      /* @__PURE__ */ jsx11(Button, { type: "button", secondary: true, disabled: !!busy, onClick: close, children: "\u53D6\u6D88" }),
      preview && (error || expired || changed) && /* @__PURE__ */ jsx11(
        Button,
        {
          type: "button",
          secondary: true,
          disabled: !!busy || !fresh,
          onClick: () => {
            const item = result?.items.find(
              (item2) => item2.id === preview.candidateId
            );
            if (item) inspect(item, true);
          },
          children: "\u91CD\u65B0\u9884\u89C8"
        }
      ),
      /* @__PURE__ */ jsx11(Button, { type: "submit", disabled: !!busy || !canImport, children: busy === "import" ? "\u6B63\u5728\u6838\u5BF9\u2026" : preview?.existingAssetId ? "\u67E5\u770B\u5DF2\u6536\u5F55\u8D44\u4EA7" : "\u786E\u8BA4\u6536\u5F55" })
    ] })
  ] }) });
}

// src/AssetHistory.jsx
import React13, { useEffect as useEffect8, useMemo, useRef as useRef11, useState as useState10 } from "react";
import { Download as Download3, RotateCcw } from "lucide-react";

// src/WorkflowReferences.jsx
import React12, { useRef as useRef10, useState as useState9 } from "react";
import { Plus as Plus2, X as X2, Copy as Copy2, Download as Download2, PenLine as PenLine2 } from "lucide-react";

// src/workflow-references.js
import { zipSync as zipSync2, strToU8 as strToU82 } from "fflate";

// src/WorkflowReferences.jsx
import { Fragment as Fragment7, jsx as jsx12, jsxs as jsxs11 } from "react/jsx-runtime";

// src/AssetHistory.jsx
import { Fragment as Fragment8, jsx as jsx13, jsxs as jsxs12 } from "react/jsx-runtime";

// src/AssetUsage.jsx
import React14, { useEffect as useEffect9, useRef as useRef12, useState as useState11 } from "react";

// src/data-flight.js
var DATA_CAUGHT = "guiji:data-caught";

// src/AssetUsage.jsx
import { Fragment as Fragment9, jsx as jsx14, jsxs as jsxs13 } from "react/jsx-runtime";

// src/AssetEvolution.jsx
import React15, { useRef as useRef13, useState as useState12 } from "react";
import { Copy as Copy3, FileText } from "lucide-react";

// src/evolution.js
var PACKET_MARKERS = Object.freeze({
  contentStart: "\u3010\u65B0\u7248\u672C\u6B63\u6587\xB7\u5F00\u59CB\u3011",
  contentEnd: "\u3010\u65B0\u7248\u672C\u6B63\u6587\xB7\u7ED3\u675F\u3011",
  noteStart: "\u3010\u6539\u52A8\u8BF4\u660E\xB7\u5F00\u59CB\u3011",
  noteEnd: "\u3010\u6539\u52A8\u8BF4\u660E\xB7\u7ED3\u675F\u3011"
});
var CANDIDATE_LIMITS = Object.freeze({
  candidates: 500,
  pending: 50,
  content: 1e6,
  changeNote: 5e3,
  returnReason: 500
});

// src/AssetEvolution.jsx
import { Fragment as Fragment10, jsx as jsx15, jsxs as jsxs14 } from "react/jsx-runtime";

// src/RuleInstall.jsx
import React16, { useEffect as useEffect10, useRef as useRef14, useState as useState13 } from "react";
import { FolderOpen } from "lucide-react";
import { Fragment as Fragment11, jsx as jsx16, jsxs as jsxs15 } from "react/jsx-runtime";

// src/search.js
var SNIPPET = 40;
function terms(query) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}
function field(label, text, long = false) {
  const value = typeof text === "string" ? text : "";
  return { label, text: value, lower: value.toLowerCase(), long };
}
var versionIndex = /* @__PURE__ */ new WeakMap();
function indexVersion(v) {
  let entry = versionIndex.get(v);
  if (!entry) {
    const fields = [
      field("\u6807\u9898", v.title),
      field("\u8BF4\u660E", v.description),
      field("\u6807\u7B7E", v.tags.join(" ")),
      field("\u6B63\u6587", v.content, true),
      ...v.files.filter((f) => f.text && !f.directory).flatMap((f) => [
        field("\u6587\u4EF6\u8DEF\u5F84", f.path),
        field(`\u6587\u4EF6 ${f.path}`, f.data, true)
      ])
    ];
    entry = { fields, all: fields.map((f) => f.lower).join("\n") };
    versionIndex.set(v, entry);
  }
  return entry;
}
function locate(fields, words) {
  const labels = [];
  let snippet;
  for (const f of fields) {
    const hits = words.map((w) => [f.lower.indexOf(w), w]).filter(([at2]) => at2 !== -1);
    if (!hits.length) continue;
    if (!labels.includes(f.label)) labels.push(f.label);
    if (!f.long || snippet !== void 0) continue;
    const [at, word] = hits.reduce((a, b) => b[0] < a[0] ? b : a);
    const source = f.lower.length === f.text.length ? f.text : f.lower;
    const start = Math.max(0, at - SNIPPET), end = Math.min(source.length, at + word.length + SNIPPET);
    snippet = (start > 0 ? "\u2026" : "") + source.slice(start, end).replace(/\s+/g, " ").trim() + (end < source.length ? "\u2026" : "");
  }
  const where = labels.length > 3 ? `${labels.slice(0, 3).join("\u3001")}\u7B49` : labels.join("\u3001") || "\u591A\u4E2A\u5B57\u6BB5";
  return snippet === void 0 ? { where } : { where, snippet };
}
function matches(all, words) {
  return words.every((w) => all.includes(w));
}
function assetHit(asset, words) {
  if (!words.length) return null;
  const { fields, all } = indexVersion(current(asset));
  return matches(all, words) ? locate(fields, words) : null;
}
function tagCounts(assets) {
  const counts = /* @__PURE__ */ new Map();
  for (const a of assets) {
    if (a.archived) continue;
    for (const tag of new Set(current(a).tags))
      counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh")
  );
}

// src/Scrolls.jsx
import React17, { useState as useState14 } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy as Copy4,
  PenLine as PenLine3,
  RotateCcw as RotateCcw2,
  Trash2,
  Archive
} from "lucide-react";

// src/scrolls.js
var scrollsOf = (state) => state.scrolls || [];
var liveEntries = (scroll) => scroll.entries.filter((e) => !e.deletedAt);
var orderScrolls = (scrolls) => scrolls.filter((s) => !s.deletedAt).sort(
  (a, b) => Number(b.pinned) - Number(a.pinned) || a.createdAt.localeCompare(b.createdAt)
);
var shortText = (text) => {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > 20 ? `${s.slice(0, 20)}\u2026` : s;
};
var mapScroll = (scrolls, id, fn) => scrolls.map((s) => s.id === id ? fn(s) : s);
var mapEntry = (scrolls, scrollId, entryId, fn) => mapScroll(scrolls, scrollId, (s) => ({
  ...s,
  entries: s.entries.map((e) => e.id === entryId ? fn(e) : e)
}));
var pinScroll = (scrolls, id, pinned) => mapScroll(scrolls, id, (s) => ({ ...s, pinned, updatedAt: now() }));
var restoreScroll = (scrolls, id) => mapScroll(scrolls, id, ({ deletedAt, ...s }) => ({ ...s, updatedAt: now() }));
var restoreEntry = (scrolls, scrollId, entryId) => mapEntry(scrolls, scrollId, entryId, ({ deletedAt, ...e }) => e);
function scrollSerials(scrolls) {
  const out = {};
  [...scrolls].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((s, i) => out[s.id] = i + 1);
  return out;
}
function scrollStats(scroll) {
  const live = liveEntries(scroll);
  const counts = /* @__PURE__ */ new Map();
  for (const e of live) for (const t of e.tags) counts.set(t, (counts.get(t) || 0) + 1);
  return {
    count: live.length,
    uses: live.reduce((n, e) => n + e.uses, 0),
    lastAt: live.reduce((at, e) => e.lastUsedAt && e.lastUsedAt > at ? e.lastUsedAt : at, ""),
    tags: [...counts].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  };
}
function scrollHit(scroll, words) {
  const text = [
    scroll.name,
    ...liveEntries(scroll).flatMap((e) => [e.text, e.tags.join(" ")])
  ].join("\n").toLowerCase();
  return words.every((w) => text.includes(w));
}

// src/Scrolls.jsx
import { Fragment as Fragment12, jsx as jsx17, jsxs as jsxs16 } from "react/jsx-runtime";
function ScrollRecycle({ state, save }) {
  const all = scrollsOf(state);
  const [open, setOpen] = useState14(false);
  const deletedScrolls = all.filter((s) => s.deletedAt);
  const deletedEntries = orderScrolls(all).flatMap(
    (s) => s.entries.filter((e) => e.deletedAt).map((e) => [s, e])
  );
  const count = deletedScrolls.length + deletedEntries.length;
  const persist = (scrolls) => save({ ...state, scrolls });
  return /* @__PURE__ */ jsxs16("section", { className: "scroll-recycle", "aria-label": "\u711A\u51B3\u56DE\u6536\u533A", children: [
    /* @__PURE__ */ jsxs16(
      "button",
      {
        className: "text-button recycle-toggle",
        "aria-expanded": open,
        onClick: () => setOpen((v) => !v),
        children: [
          /* @__PURE__ */ jsx17(Archive, { size: 15 }),
          "\u56DE\u6536\u533A ",
          count
        ]
      }
    ),
    open && /* @__PURE__ */ jsxs16("div", { className: "recycle-list", children: [
      !count && /* @__PURE__ */ jsx17("p", { className: "body-copy", children: "\u56DE\u6536\u533A\u662F\u7A7A\u7684\u3002" }),
      deletedScrolls.map((s) => /* @__PURE__ */ jsxs16("div", { className: "recycle-row", children: [
        /* @__PURE__ */ jsxs16("span", { children: [
          /* @__PURE__ */ jsx17("small", { children: "\u5377" }),
          s.name
        ] }),
        /* @__PURE__ */ jsx17(
          "button",
          {
            className: "icon-button",
            "aria-label": `\u6062\u590D\u5377 ${s.name}`,
            title: "\u6062\u590D",
            onClick: () => persist(restoreScroll(all, s.id)),
            children: /* @__PURE__ */ jsx17(RotateCcw2, { size: 16 })
          }
        )
      ] }, s.id)),
      deletedEntries.map(([s, e]) => /* @__PURE__ */ jsxs16("div", { className: "recycle-row", children: [
        /* @__PURE__ */ jsxs16("span", { children: [
          /* @__PURE__ */ jsx17("small", { children: s.name }),
          shortText(e.text)
        ] }),
        /* @__PURE__ */ jsx17(
          "button",
          {
            className: "icon-button",
            "aria-label": `\u6062\u590D\u6761\u76EE\uFF1A${shortText(e.text)}`,
            title: "\u6062\u590D",
            onClick: () => persist(restoreEntry(all, s.id, e.id)),
            children: /* @__PURE__ */ jsx17(RotateCcw2, { size: 16 })
          }
        )
      ] }, e.id))
    ] })
  ] });
}

// src/Assets.jsx
import { Fragment as Fragment13, jsx as jsx18, jsxs as jsxs17 } from "react/jsx-runtime";
function serialsOf(assets) {
  const out = {};
  for (const type of ["Skill", "Prompt", "Workflow", "Rule"])
    assets.filter((a) => a.type === type).sort((a, b) => a.versions[0].at.localeCompare(b.versions[0].at)).forEach((a, i) => out[a.id] = i + 1);
  return out;
}
function originLabel(a) {
  return a.demo ? "\u793A\u4F8B" : a.origin?.kind === "derived" ? "\u4E2A\u4EBA\u6539\u7248" : a.origin?.kind === "local" ? "\u672C\u673A\u6536\u5F55" : "\u6211\u7684";
}
function Assets({
  state,
  save,
  adoptState,
  notify,
  filter = "all",
  openCreate,
  select,
  onFilter,
  navigate,
  openScroll
}) {
  const [search, setSearch] = useState15(""), [layout, setLayout] = useState15("grid"), [sort, setSort] = useState15("recent"), [tag, setTag] = useState15("");
  const [collecting, setCollecting] = useState15(false);
  const words = terms(search);
  const tags = useMemo2(() => tagCounts(state.assets), [state.assets]);
  const assets = state.assets.filter((a) => !a.archived);
  const serials = serialsOf(state.assets);
  const usage = usageByAsset(assets, state.assetActivity);
  const allScrolls = scrollsOf(state);
  const scrolls = allScrolls.filter((s) => !s.deletedAt);
  const scrollSerial = scrollSerials(allScrolls);
  const ofType = filter === "Scroll" ? [] : assets.filter((a) => filter === "all" || a.type === filter);
  const scrollsOfType = filter === "all" || filter === "Scroll" ? scrolls : [];
  const narrowed = !!(words.length || tag);
  const archivedHits = words.length ? state.assets.filter((a) => a.archived && assetHit(a, words)).length : 0;
  const clearFilters = () => {
    setSearch("");
    setTag("");
  };
  const items = [
    ...ofType.filter(
      (a) => (!tag || current(a).tags.includes(tag)) && (!words.length || assetHit(a, words))
    ).map((a) => {
      const u = usage.get(a.id);
      return {
        kind: "asset",
        item: a,
        pinned: !!a.pinned,
        count: u.count,
        lastAt: u.lastAt,
        at: current(a).at,
        title: current(a).title
      };
    }),
    ...scrollsOfType.map((s) => ({ s, stats: scrollStats(s) })).filter(
      ({ s, stats }) => (!tag || stats.tags.includes(tag)) && (!words.length || scrollHit(s, words))
    ).map(({ s, stats }) => ({
      kind: "scroll",
      item: s,
      stats,
      pinned: !!s.pinned,
      count: stats.uses,
      lastAt: stats.lastAt,
      at: s.updatedAt || s.createdAt,
      title: s.name
    }))
  ];
  const byUse = (a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt);
  const bySort = (a, b) => sort === "name" ? a.title.localeCompare(b.title, "zh") : sort === "most" ? byUse(a, b) || b.at.localeCompare(a.at) : sort === "used" ? b.lastAt.localeCompare(a.lastAt) || b.at.localeCompare(a.at) : b.at.localeCompare(a.at);
  const shown = items.sort(
    (a, b) => b.pinned - a.pinned || a.pinned && b.pinned && byUse(a, b) || bySort(a, b)
  );
  const pinnedCount = shown.filter((x) => x.pinned).length;
  const typeCount = { all: assets.length + scrolls.length, Scroll: scrolls.length };
  const hasAny = ofType.length + scrollsOfType.length > 0;
  return /* @__PURE__ */ jsxs17(Fragment13, { children: [
    /* @__PURE__ */ jsx18(
      PageHeading,
      {
        page: "assets",
        action: /* @__PURE__ */ jsxs17(Fragment13, { children: [
          /* @__PURE__ */ jsxs17(Button, { secondary: true, onClick: () => setCollecting(true), children: [
            /* @__PURE__ */ jsx18(FolderSearch3, { size: 16 }),
            "\u6536\u5F55\u672C\u673A Skill"
          ] }),
          /* @__PURE__ */ jsxs17(
            Button,
            {
              onClick: () => openCreate(filter === "all" ? "Skill" : filter),
              children: [
                /* @__PURE__ */ jsx18(Plus3, { size: 16 }),
                "\u65B0\u5EFA\u8D44\u4EA7"
              ]
            }
          )
        ] })
      }
    ),
    /* @__PURE__ */ jsxs17("div", { className: "asset-toolbar", children: [
      /* @__PURE__ */ jsx18("div", { className: "segmented", role: "group", "aria-label": "\u8D44\u4EA7\u7C7B\u578B", children: [
        ["all", "\u5168\u90E8"],
        ["Skill", "Skills"],
        ["Prompt", "Prompts"],
        ["Workflow", "\u5DE5\u4F5C\u6D41"],
        ["Rule", "\u89C4\u5219"],
        ["Scroll", "\u711A\u51B3"]
      ].map(([id, name]) => /* @__PURE__ */ jsxs17(
        "button",
        {
          "aria-pressed": filter === id,
          className: filter === id ? "active" : "",
          onClick: () => onFilter(id),
          children: [
            name,
            /* @__PURE__ */ jsx18("span", { children: typeCount[id] ?? assets.filter((a) => a.type === id).length })
          ]
        },
        id
      )) }),
      /* @__PURE__ */ jsxs17("label", { className: "inline-search", children: [
        /* @__PURE__ */ jsx18(Search, { size: 15 }),
        /* @__PURE__ */ jsx18(
          "input",
          {
            placeholder: "\u641C\u7D22\u6807\u9898\u3001\u8BF4\u660E\u3001\u6B63\u6587\u3001\u6807\u7B7E\u3001\u5377\u540D",
            "aria-label": "\u5728\u8D44\u4EA7\u4E2D\u641C\u7D22",
            value: search,
            onChange: (e) => setSearch(e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsxs17("div", { className: "toolbar-right", children: [
        (tags.length > 0 || tag) && /* @__PURE__ */ jsxs17(
          "select",
          {
            "aria-label": "\u6309\u6807\u7B7E\u7B5B\u9009",
            value: tag,
            onChange: (e) => setTag(e.target.value),
            children: [
              /* @__PURE__ */ jsx18("option", { value: "", children: "\u5168\u90E8\u6807\u7B7E" }),
              tag && !tags.some(([name]) => name === tag) && /* @__PURE__ */ jsxs17("option", { value: tag, children: [
                tag,
                " \xB7 0"
              ] }),
              tags.map(([name, count]) => /* @__PURE__ */ jsxs17("option", { value: name, children: [
                name,
                " \xB7 ",
                count
              ] }, name))
            ]
          }
        ),
        /* @__PURE__ */ jsxs17(
          "select",
          {
            "aria-label": "\u6392\u5E8F\u65B9\u5F0F",
            value: sort,
            onChange: (e) => setSort(e.target.value),
            children: [
              /* @__PURE__ */ jsx18("option", { value: "recent", children: "\u6700\u8FD1\u66F4\u65B0" }),
              /* @__PURE__ */ jsx18("option", { value: "most", children: "\u6700\u5E38\u7528" }),
              /* @__PURE__ */ jsx18("option", { value: "used", children: "\u6700\u8FD1\u4F7F\u7528" }),
              /* @__PURE__ */ jsx18("option", { value: "name", children: "\u540D\u79F0\u6392\u5E8F" })
            ]
          }
        ),
        /* @__PURE__ */ jsx18("span", { className: "divider" }),
        /* @__PURE__ */ jsx18(
          "button",
          {
            className: `icon-button ${layout === "grid" ? "selected" : ""}`,
            "aria-label": "\u7F51\u683C\u89C6\u56FE",
            "aria-pressed": layout === "grid",
            onClick: () => setLayout("grid"),
            children: /* @__PURE__ */ jsx18(Grid2X2, { size: 16 })
          }
        ),
        /* @__PURE__ */ jsx18(
          "button",
          {
            className: `icon-button ${layout === "list" ? "selected" : ""}`,
            "aria-label": "\u5217\u8868\u89C6\u56FE",
            "aria-pressed": layout === "list",
            onClick: () => setLayout("list"),
            children: /* @__PURE__ */ jsx18(List, { size: 17 })
          }
        )
      ] })
    ] }),
    filter === "Scroll" && /* @__PURE__ */ jsx18(ScrollRecycle, { state, save }),
    /* @__PURE__ */ jsxs17("div", { className: "collection-meta", children: [
      /* @__PURE__ */ jsxs17("span", { children: [
        "\u5168\u90E8\u8D44\u4EA7 \xB7 ",
        /* @__PURE__ */ jsx18("b", { children: shown.length }),
        pinnedCount > 0 && /* @__PURE__ */ jsxs17(Fragment13, { children: [
          " ",
          "\xB7 \u7F6E\u9876 ",
          /* @__PURE__ */ jsx18("b", { children: pinnedCount })
        ] })
      ] }),
      /* @__PURE__ */ jsx18("span", { className: "collection-hint", children: "\u8FDB\u5316\u9636\u6BB5\u7ED3\u5408\u5F53\u524D\u7248\u672C\u7684\u590D\u5236\u8BB0\u5F55\u4E0E\u672C\u4EBA\u53CD\u9988\uFF0C\u7248\u672C\u6570\u5355\u72EC\u4FDD\u7559\u3002" })
    ] }),
    archivedHits > 0 && /* @__PURE__ */ jsx18("div", { className: "search-scope asset-scope", role: "note", children: /* @__PURE__ */ jsxs17("div", { children: [
      /* @__PURE__ */ jsxs17("span", { children: [
        "\u53E6\u6709 ",
        archivedHits,
        " \u4E2A\u5DF2\u5F52\u6863\u8D44\u4EA7\u5339\u914D\uFF0C\u4E0D\u5728\u8D44\u4EA7\u5E93\u5217\u51FA\u3002"
      ] }),
      /* @__PURE__ */ jsx18("button", { type: "button", onClick: () => navigate("history"), children: "\u53BB\u7248\u672C\u5F52\u6863" })
    ] }) }),
    /* @__PURE__ */ jsx18("div", { className: `asset-grid ${layout === "list" ? "list-layout" : ""}`, children: shown.map(({ kind, item: a, stats }, i) => {
      if (kind === "scroll")
        return /* @__PURE__ */ jsx18(
          ScrollCard,
          {
            scroll: a,
            stats,
            serial: scrollSerial[a.id],
            index: i,
            onOpen: () => openScroll(a.id),
            onPin: () => save({ ...state, scrolls: pinScroll(allScrolls, a.id, !a.pinned) })
          },
          a.id
        );
      const v = current(a);
      return /* @__PURE__ */ jsxs17(
        "article",
        {
          className: "asset-card",
          style: { "--i": Math.min(i, 12) },
          children: [
            /* @__PURE__ */ jsxs17(
              "button",
              {
                className: `card-open type-${a.type}`,
                onClick: () => select(a.id),
                "aria-label": `\u67E5\u770B ${v.title}`,
                children: [
                  /* @__PURE__ */ jsxs17("span", { className: "lock", "aria-hidden": "true", children: [
                    /* @__PURE__ */ jsx18("i", {}),
                    /* @__PURE__ */ jsx18("i", {}),
                    /* @__PURE__ */ jsx18("i", {}),
                    /* @__PURE__ */ jsx18("i", {})
                  ] }),
                  /* @__PURE__ */ jsx18(
                    Cover,
                    {
                      type: a.type,
                      sprite: glyphOf(a),
                      serial: serials[a.id],
                      version: a.versions.length,
                      uses: usage.get(a.id).count
                    }
                  ),
                  /* @__PURE__ */ jsxs17("div", { className: "card-body", children: [
                    /* @__PURE__ */ jsxs17("div", { className: "card-type", children: [
                      /* @__PURE__ */ jsx18(TypeIcon, { type: a.type, size: 13 }),
                      typeLabel[a.type],
                      /* @__PURE__ */ jsx18("span", { children: originLabel(a) })
                    ] }),
                    /* @__PURE__ */ jsx18("h3", { children: v.title }),
                    /* @__PURE__ */ jsx18("p", { children: v.description || "\u8FD8\u6CA1\u6709\u4E00\u53E5\u8BDD\u8BF4\u660E\u3002" }),
                    /* @__PURE__ */ jsxs17("span", { className: "sr-only", children: [
                      "\u4F7F\u7528 ",
                      usage.get(a.id).count,
                      " \u6B21"
                    ] }),
                    /* @__PURE__ */ jsxs17("div", { className: "card-bottom", children: [
                      /* @__PURE__ */ jsx18("div", { className: "card-tags", children: v.tags.slice(0, 2).map((t) => /* @__PURE__ */ jsx18("span", { children: t }, t)) }),
                      /* @__PURE__ */ jsx18(StageBar, { stage: usage.get(a.id).stage })
                    ] })
                  ] })
                ]
              }
            ),
            /* @__PURE__ */ jsx18(
              "button",
              {
                "aria-label": `${a.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876"} ${v.title}`,
                "aria-pressed": !!a.pinned,
                title: a.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876",
                className: `pin-button ${a.pinned ? "is-pinned" : ""}`,
                onClick: () => save({
                  ...state,
                  assets: state.assets.map(
                    (x) => x.id === a.id ? { ...x, pinned: !x.pinned } : x
                  )
                }),
                children: /* @__PURE__ */ jsx18(Pin, { size: 16, fill: a.pinned ? "currentColor" : "none" })
              }
            )
          ]
        },
        a.id
      );
    }) }),
    shown.length === 0 && narrowed && /* @__PURE__ */ jsx18(
      Empty,
      {
        sprite: "numemon",
        title: "\u6CA1\u6709\u5339\u914D\u7684\u8D44\u4EA7",
        action: /* @__PURE__ */ jsxs17("div", { className: "empty-actions", children: [
          !hasAny && filter !== "all" && /* @__PURE__ */ jsx18(Button, { secondary: true, onClick: () => onFilter("all"), children: "\u67E5\u770B\u5168\u90E8\u7C7B\u578B" }),
          /* @__PURE__ */ jsx18(Button, { secondary: true, onClick: clearFilters, children: "\u6E05\u9664\u7B5B\u9009" })
        ] }),
        children: !hasAny ? "\u5F53\u524D\u7C7B\u578B\u8FD8\u6CA1\u6709\u8D44\u4EA7\uFF0C\u6E05\u9664\u7B5B\u9009\u540E\u8FD9\u91CC\u4ECD\u4F1A\u662F\u7A7A\u7684\u3002" : words.length ? `\u6CA1\u6709\u8D44\u4EA7\u540C\u65F6\u5339\u914D\u201C${words.join(" ")}\u201D\u548C\u5F53\u524D\u7B5B\u9009\u6761\u4EF6\u3002` : "\u5F53\u524D\u7B5B\u9009\u6761\u4EF6\u4E0B\u6CA1\u6709\u8D44\u4EA7\u3002"
      }
    ),
    shown.length === 0 && !narrowed && /* @__PURE__ */ jsx18(
      Empty,
      {
        sprite: "numemon",
        title: filter === "Scroll" ? "\u8FD8\u6CA1\u6709\u5377" : "\u8FD8\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u8D44\u4EA7",
        action: /* @__PURE__ */ jsxs17(
          Button,
          {
            secondary: true,
            onClick: () => openCreate(filter === "all" ? "Skill" : filter),
            children: [
              /* @__PURE__ */ jsx18(Plus3, { size: 16 }),
              "\u65B0\u5EFA\u8D44\u4EA7"
            ]
          }
        ),
        children: filter === "Scroll" ? "\u5148\u5EFA\u4E00\u5377\uFF0C\u6BD4\u5982\u201C\u5FC3\u6CD5\u201D\u6216\u201Cprompt \u788E\u7247\u201D\uFF0C\u628A\u63D0\u70BC\u8FC7\u3001\u4F1A\u53CD\u590D\u7528\u7684\u788E\u7247\u653E\u8FDB\u53BB\u3002" : "\u4ECE\u4E00\u4EFD\u65B0\u7684 Skill\u3001Prompt\u3001\u5DE5\u4F5C\u6D41\u3001\u89C4\u5219\u6216\u711A\u51B3\u5F00\u59CB\u3002"
      }
    ),
    collecting && /* @__PURE__ */ jsx18(
      SkillSourceImport,
      {
        state,
        adoptState,
        notify,
        onClose: () => setCollecting(false),
        onSelect: select
      }
    )
  ] });
}
function ScrollCard({ scroll, stats, serial, index, onOpen, onPin }) {
  return /* @__PURE__ */ jsxs17("article", { className: "asset-card", style: { "--i": Math.min(index, 12) }, children: [
    /* @__PURE__ */ jsxs17(
      "button",
      {
        className: "card-open type-Scroll",
        onClick: onOpen,
        "aria-label": `\u6253\u5F00\u5377 ${scroll.name}`,
        children: [
          /* @__PURE__ */ jsxs17("span", { className: "lock", "aria-hidden": "true", children: [
            /* @__PURE__ */ jsx18("i", {}),
            /* @__PURE__ */ jsx18("i", {}),
            /* @__PURE__ */ jsx18("i", {}),
            /* @__PURE__ */ jsx18("i", {})
          ] }),
          /* @__PURE__ */ jsx18(Cover, { type: "Scroll", serial, version: null, uses: stats.uses }),
          /* @__PURE__ */ jsxs17("div", { className: "card-body", children: [
            /* @__PURE__ */ jsxs17("div", { className: "card-type", children: [
              /* @__PURE__ */ jsx18(TypeIcon, { type: "Scroll", size: 13 }),
              typeLabel.Scroll,
              /* @__PURE__ */ jsx18("span", { children: "\u5377" })
            ] }),
            /* @__PURE__ */ jsx18("h3", { children: scroll.name }),
            /* @__PURE__ */ jsxs17("p", { children: [
              stats.count,
              " \u6761"
            ] }),
            /* @__PURE__ */ jsxs17("span", { className: "sr-only", children: [
              "\u4F7F\u7528 ",
              stats.uses,
              " \u6B21"
            ] }),
            /* @__PURE__ */ jsx18("div", { className: "card-bottom", children: /* @__PURE__ */ jsx18("div", { className: "card-tags", children: stats.tags.slice(0, 2).map((t) => /* @__PURE__ */ jsx18("span", { children: t }, t)) }) })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsx18(
      "button",
      {
        "aria-label": `${scroll.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876"} ${scroll.name}`,
        "aria-pressed": !!scroll.pinned,
        title: scroll.pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876",
        className: `pin-button ${scroll.pinned ? "is-pinned" : ""}`,
        onClick: onPin,
        children: /* @__PURE__ */ jsx18(Pin, { size: 16, fill: scroll.pinned ? "currentColor" : "none" })
      }
    )
  ] });
}

// src/Home.jsx
import React30, { useEffect as useEffect21, useRef as useRef24, useState as useState27 } from "react";
import {
  ArrowUpRight as ArrowUpRight6,
  Layers as Layers2,
  Bot,
  Folder as Folder2,
  BookOpen as BookOpen2,
  PenLine as PenLine5,
  Moon,
  GitBranch,
  ScanLine,
  Settings2,
  Inbox,
  Stethoscope,
  Handshake,
  CalendarDays,
  Newspaper,
  GraduationCap,
  Gem,
  Plus as Plus6
} from "lucide-react";

// src/pending.js
function rulePendingReady(ruleInstalls) {
  return !!ruleInstalls?.loaded && !ruleInstalls?.error;
}
function pendingItems(state, ruleInstalls = { items: [], error: "" }, projectStatus = { items: [], error: "" }, agentHealth = {}, nightReports = { items: [], loaded: false }, vaultReceipts = { noteIds: [], loaded: false }) {
  ruleInstalls ||= { items: [], error: "" };
  const items = [];
  const c = state.connections || {};
  if (ruleInstalls.error)
    items.push({
      id: "rule-installs-error",
      kind: "\u8D44\u4EA7",
      title: "\u89C4\u5219\u6A21\u677F\u88C5\u5165\u8BB0\u5F55\u8BFB\u53D6\u5931\u8D25",
      detail: "\u5347\u7EA7\u63D0\u793A\u6682\u65F6\u4E0D\u53EF\u7528\uFF1B\u5728\u4EFB\u610F\u89C4\u5219\u8BE6\u60C5\u91CC\u53EF\u4EE5\u91CD\u65B0\u8BFB\u53D6\u3002",
      to: "assets"
    });
  for (const asset of state.assets) {
    if (asset.archived || asset.type !== "Rule") continue;
    const behind = ruleInstalls.items.filter(
      (i) => i.assetId === asset.id && i.versionId !== current(asset).id
    );
    if (behind.length)
      items.push({
        id: `rule-upgrade-${asset.id}`,
        kind: "\u8D44\u4EA7",
        title: `\u89C4\u5219\u300C${current(asset).title}\u300D\u6709 ${behind.length} \u4E2A\u9879\u76EE\u53EF\u5347\u7EA7`,
        detail: "\u6A21\u677F\u5DF2\u6709\u65B0\u7248\u672C\uFF1B\u5728\u89C4\u5219\u8BE6\u60C5\u91CC\u9010\u4E2A\u9884\u89C8\u5DEE\u5F02\uFF0C\u786E\u8BA4\u540E\u5347\u7EA7\u3002",
        to: "assets",
        assetId: asset.id
      });
  }
  for (const asset of state.assets) {
    if (asset.archived) continue;
    if (usageOf(asset, state.assetActivity).feedback?.rating === "improve")
      items.push({
        id: `improve-${asset.id}`,
        kind: "\u8D44\u4EA7",
        title: `\u300C${current(asset).title}\u300D\u88AB\u6807\u8BB0\u4E3A\u9700\u6539\u8FDB`,
        detail: "\u5F53\u524D\u7248\u672C\u7684\u6700\u65B0\u53CD\u9988\u662F\u201C\u9700\u6539\u8FDB\u201D\uFF0C\u53EF\u4EE5\u4FEE\u6539\u540E\u4FDD\u5B58\u4E3A\u65B0\u7248\u672C\u3002",
        to: "assets",
        assetId: asset.id
      });
  }
  for (const c2 of state.revisionCandidates || []) {
    if (c2.status !== "pending") continue;
    const asset = state.assets.find((a) => a.id === c2.assetId);
    if (!asset || asset.archived) continue;
    items.push({
      id: `candidate-${c2.id}`,
      kind: "\u8D44\u4EA7",
      title: `\u300C${current(asset).title}\u300D\u6709\u6539\u7248\u5019\u9009\u5F85\u6BD4\u8F83`,
      detail: "\u5728\u8D44\u4EA7\u8BE6\u60C5\u91CC\u4E0E\u5F53\u524D\u7248\u672C\u5E76\u6392\u6BD4\u8F83\uFF0C\u51B3\u5B9A\u91C7\u7528\u6216\u9000\u56DE\u3002",
      to: "assets",
      assetId: asset.id
    });
  }
  for (const p of state.profileProposals || []) {
    if (p.status !== "pending") continue;
    items.push({
      id: `profile-${p.id}`,
      kind: "\u77E5\u8BC6",
      title: `\u4E2A\u4EBA\u8BF4\u660E\u4FEE\u6539\u5EFA\u8BAE \xB7 ${p.path}`,
      detail: `\u6765\u81EA ${p.proposer}\uFF1A${p.reason.length > 60 ? p.reason.slice(0, 60) + "\u2026" : p.reason}`,
      to: "inbox"
    });
  }
  const tasks = (state.knowledgeTasks || []).filter((t) => !t.archived);
  if (tasks.length)
    items.push({
      id: "knowledge-tasks",
      kind: "\u77E5\u8BC6",
      title: `${tasks.length} \u4E2A\u77E5\u8BC6\u6574\u7406\u4EFB\u52A1\u8FDB\u884C\u4E2D`,
      detail: "\u5019\u9009\u9700\u8981\u4F60\u6838\u5BF9\uFF0C\u786E\u8BA4\u540E\u624D\u4F1A\u5199\u5165\u201C00 \u5F85\u6574\u7406\u201D\u3002",
      to: "knowledge"
    });
  const receiptsReady = !!vaultReceipts?.loaded && !vaultReceipts?.error;
  const localNotes = receiptsReady ? state.notes.filter((n) => !vaultReceipts?.noteIds?.includes(n.id)) : [];
  if (!receiptsReady && state.notes.length) items.push({ id: "notes-receipts-unknown", kind: "\u77E5\u8BC6", title: vaultReceipts?.error ? "\u968F\u624B\u8BB0\u5F52\u4F4D\u56DE\u6267\u8BFB\u53D6\u5931\u8D25" : "\u968F\u624B\u8BB0\u5F52\u4F4D\u56DE\u6267\u5F85\u8BFB\u53D6", detail: "\u5C1A\u65E0\u53EF\u9760\u56DE\u6267\u7EDF\u8BA1\uFF1B\u672A\u5F52\u4F4D\u6570\u91CF\u672A\u77E5\uFF0C\u4E0D\u63A8\u65AD\u6CA1\u6709\u5199\u5165\u3002", to: "notes" });
  if (localNotes.length)
    items.push({
      id: "notes-local",
      foundAt: earliest(localNotes.map((n) => n.at)),
      kind: "\u77E5\u8BC6",
      title: `${localNotes.length} \u6761\u968F\u624B\u8BB0\u5C1A\u65E0\u5F53\u524D\u6B63\u6587\u5339\u914D\u7684 Vault \u5199\u5165\u56DE\u6267`,
      detail: "\u6309\u672C\u673A\u56DE\u6267\u7EDF\u8BA1\uFF0C\u672A\u91CD\u65B0\u8BFB\u53D6 Vault\uFF1B\u53EF\u4EE5\u4ECE\u968F\u624B\u8BB0\u9884\u89C8\u5F52\u4F4D\u3002",
      to: "notes"
    });
  if (projectStatus?.error)
    items.push({
      id: "project-status-error",
      kind: "\u9879\u76EE",
      title: "\u5728\u63A8\u8FDB\u9879\u76EE\u7684\u72B6\u6001\u4E0E\u4F53\u68C0\u8BFB\u53D6\u5931\u8D25",
      detail: "\u505C\u6EDE\u4E0E\u5B89\u5168\u63D0\u793A\u6682\u65F6\u4E0D\u53EF\u7528\uFF1B\u5728\u9879\u76EE\u7A7A\u95F4\u53EF\u4EE5\u91CD\u65B0\u8BFB\u53D6\u3002",
      to: "projects"
    });
  for (const p of projectStatus?.items || []) {
    const issues = p.safety?.issues || [];
    if (issues.length)
      items.push({
        id: `project-safety-${p.projectId}`,
        kind: "\u9879\u76EE",
        title: `\u9879\u76EE\u300C${p.name}\u300D\u5B89\u5168\u4F53\u68C0\u53D1\u73B0 ${issues.length} \u9879\u95EE\u9898`,
        detail: issues.map((i) => i.text).join("\uFF1B"),
        to: "projects"
      });
    if (p.activity?.state === "stalled")
      items.push({
        id: `project-stall-${p.projectId}`,
        kind: "\u9879\u76EE",
        title: `\u9879\u76EE\u300C${p.name}\u300D\u5DF2 ${p.activity.idleDays} \u5929\u6CA1\u6709\u72B6\u6001\u66F4\u65B0\u6216\u63D0\u4EA4`,
        detail: "\u5728\u63A8\u8FDB\u9879\u76EE\u8D85\u8FC7\u505C\u6EDE\u9608\u503C\uFF1B\u5230\u9879\u76EE\u7A7A\u95F4\u67E5\u770B\u72B6\u6001\u5361\uFF0C\u51B3\u5B9A\u7EE7\u7EED\u63A8\u8FDB\u8FD8\u662F\u53D6\u6D88\u5728\u63A8\u8FDB\u3002",
        to: "projects"
      });
  }
  const targeted = new Set((c.agentTargets || []).map((t) => t.agentId));
  const untargeted = (c.agents || []).filter(
    (a) => a.status === "detected" && !targeted.has(a.id)
  );
  if (untargeted.length)
    items.push({
      id: "agents-untargeted",
      kind: "\u76EE\u6807",
      title: `${untargeted.map((a) => a.name).join("\u3001")} \u5DF2\u68C0\u6D4B\u5230\uFF0C\u5C1A\u672A\u8BBE\u7F6E\u7BA1\u7406\u76EE\u6807`,
      detail: "\u8BBE\u7F6E\u7BA1\u7406\u76EE\u6807\u540E\uFF0C\u624D\u80FD\u67E5\u770B\u76EE\u5F55\u3001\u5173\u8054 Skill \u548C\u53D7\u63A7\u4FEE\u6539\u914D\u7F6E\u3002",
      to: "agents"
    });
  for (const [agentId, entry] of Object.entries(agentHealth || {})) {
    if (entry?.error) items.push({ id: `agent-health-error-${agentId}`, kind: "\u667A\u80FD\u4F53", title: `${entry.name}\uFF1A\u80FD\u529B\u4F53\u68C0\u7ED3\u679C\u672A\u77E5`, detail: entry.error, to: "agents", foundAt: entry.at });
    const h2 = entry?.health;
    if (!h2) continue;
    const parts = [
      h2.brokenLinks && `${h2.brokenLinks} \u6761\u5931\u6548\u94FE\u63A5`,
      h2.drift && `${h2.drift} \u4E2A\u526F\u672C\u4E0E\u4ED3\u5E93\u7248\u672C\u4E0D\u4E00\u81F4`,
      h2.unreadable && `${h2.unreadable} \u9879\u65E0\u6CD5\u8BFB\u53D6`
    ].filter(Boolean);
    if (parts.length)
      items.push({
        id: `agent-health-${agentId}`,
        kind: "\u667A\u80FD\u4F53",
        title: `${entry.name}\uFF1A${parts.join("\u3001")}`,
        detail: "\u4F53\u68C0\u53EA\u8BFB\uFF1B\u6E05\u7406\u3001\u91CD\u5EFA\u6216\u540C\u6B65\u9700\u8981\u4F60\u5728\u672C\u673A\u5355\u72EC\u6388\u6743\u540E\u6267\u884C\u3002",
        to: "agents"
      });
  }
  for (const report of nightReports?.items || []) items.push({ id: `night-report-${report.operationId}`, kind: "\u591C\u5DE1", title: `\u591C\u5DE1\u6668\u62A5 \xB7 ${report.nightDate || "\u65E5\u671F\u672A\u77E5"}`, detail: "\u67E5\u770B\u5DF2\u4FDD\u5B58\u7684\u4EFB\u52A1\u56DE\u6267\u3001\u4EA7\u7269\u4E0E\u8D39\u7528\uFF1B\u672C\u673A\u8BB0\u5F55\u4E0D\u4EE3\u8868\u8D26\u5355\u5DF2\u6838\u9A8C\u3002", to: "night", foundAt: report.at });
  if (nightReports?.error) items.push({ id: "night-error", kind: "\u591C\u5DE1", title: "\u591C\u5DE1\u6668\u62A5\u8BB0\u5F55\u8BFB\u53D6\u5931\u8D25", detail: "\u672C\u673A\u8BB0\u5F55\u672A\u77E5\uFF0C\u8BF7\u5728\u591C\u5DE1\u660E\u786E\u91CD\u65B0\u8BFB\u53D6\uFF1B\u4E0D\u63A8\u65AD\u6CA1\u6709\u7ED3\u679C\u3002", to: "night" });
  return triageItems(items, state, projectStatus, agentHealth);
}
var TRIAGE_LABELS = ["\u9700\u8981\u51B3\u5B9A", "\u7B49\u4F60\u786E\u8BA4", "\u987A\u624B\u770B\u770B"];
var TRIAGE_RULES = [
  ["night-error", "\u9700\u8981\u51B3\u5B9A", "\u6668\u62A5\u8BB0\u5F55\u8BFB\u53D6\u5931\u8D25"],
  ["rule-installs-error", "\u9700\u8981\u51B3\u5B9A", "\u89C4\u5219\u8BB0\u5F55\u8BFB\u53D6\u5931\u8D25"],
  ["rule-upgrade-", "\u7B49\u4F60\u786E\u8BA4", "\u5DF2\u88C5\u89C4\u5219\u843D\u540E\u4E8E\u5F53\u524D\u7248\u672C"],
  ["improve-", "\u9700\u8981\u51B3\u5B9A", "\u5F53\u524D\u7248\u672C\u9700\u6539\u8FDB\u53CD\u9988"],
  ["candidate-", "\u9700\u8981\u51B3\u5B9A", "\u5F85\u91C7\u7528\u6539\u7248\u5019\u9009"],
  ["profile-", "\u9700\u8981\u51B3\u5B9A", "\u4E2A\u4EBA\u8BF4\u660E\u4FEE\u6539\u5EFA\u8BAE"],
  ["knowledge-tasks", "\u7B49\u4F60\u786E\u8BA4", "\u77E5\u8BC6\u6574\u7406\u5019\u9009\u6838\u5BF9"],
  ["notes-local", "\u7B49\u4F60\u786E\u8BA4", "\u672A\u5F52\u4F4D\u968F\u624B\u8BB0"],
  ["notes-receipts-unknown", "\u9700\u8981\u51B3\u5B9A", "\u5F52\u4F4D\u56DE\u6267\u672A\u77E5"],
  ["project-status-error", "\u9700\u8981\u51B3\u5B9A", "\u9879\u76EE\u4F53\u68C0\u8BFB\u53D6\u5931\u8D25"],
  ["project-safety-", "\u9700\u8981\u51B3\u5B9A", "\u9879\u76EE\u5B89\u5168\u95EE\u9898"],
  ["project-stall-", "\u9700\u8981\u51B3\u5B9A", "\u5728\u63A8\u8FDB\u9879\u76EE\u505C\u6EDE"],
  ["agents-untargeted", "\u7B49\u4F60\u786E\u8BA4", "\u68C0\u6D4B\u5230\u4F46\u672A\u8BBE\u7F6E\u76EE\u6807"],
  ["agent-health-", "\u9700\u8981\u51B3\u5B9A", "\u4F53\u68C0\u53D1\u73B0\u5F02\u5E38"],
  ["night-report-", "\u987A\u624B\u770B\u770B", "\u591C\u5DE1\u6668\u62A5"]
];
var validTime = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
var earliest = (values) => values.map(validTime).filter(Boolean).sort()[0] || null;
function triageItems(items, state, projectStatus = {}, agentHealth = {}) {
  return items.map((item) => {
    const rule = TRIAGE_RULES.find(([key]) => key.endsWith("-") ? item.id.startsWith(key) : item.id === key);
    let at = item.foundAt || null;
    if (item.id.startsWith("rule-upgrade-")) at = current(state.assets.find((a) => a.id === item.assetId))?.at;
    if (item.id.startsWith("improve-")) at = usageOf(state.assets.find((a) => a.id === item.assetId), state.assetActivity).feedback?.at;
    if (item.id.startsWith("candidate-")) at = state.revisionCandidates?.find((c) => item.id === `candidate-${c.id}`)?.createdAt;
    if (item.id.startsWith("profile-")) at = state.profileProposals?.find((p) => item.id === `profile-${p.id}`)?.createdAt;
    if (item.id === "knowledge-tasks") at = earliest((state.knowledgeTasks || []).filter((t) => !t.archived).map((t) => t.createdAt));
    if (item.id === "agents-untargeted") at = state.connections?.agentScannedAt;
    if (item.id === "notes-local" && !item.foundAt) at = null;
    if (item.id.startsWith("project-safety-") || item.id.startsWith("project-stall-")) at = projectStatus?.at;
    if (item.id.startsWith("agent-health-")) at = agentHealth[item.id.slice("agent-health-".length)]?.at || at;
    return { ...item, triage: rule?.[1] || null, triageRule: rule?.[2] || "\u672A\u77E5\u6765\u6E90\u7C7B\u578B", foundAt: validTime(at) };
  }).sort((a, b) => (a.foundAt === null) - (b.foundAt === null) || (a.foundAt || "").localeCompare(b.foundAt || "") || a.id.localeCompare(b.id));
}
function triageSummary(items) {
  return TRIAGE_LABELS.map((label) => ({ label, count: items.filter((i) => i.triage === label).length }));
}
function mergeAgentHealth(audit, live = {}) {
  const result = Object.fromEntries((audit?.items || []).map((x) => [x.agentId, x]));
  for (const [id, item] of Object.entries(live || {})) {
    if (!result[id] || (Date.parse(item.at) || 0) >= (Date.parse(result[id].at) || 0)) result[id] = item;
  }
  return result;
}

// src/PlannedPage.jsx
import React21, { useState as useState18 } from "react";
import {
  ArrowUpRight as ArrowUpRight2,
  Route,
  KeyRound,
  Sparkles,
  Inbox as InboxIcon
} from "lucide-react";

// src/VaultWriteUI.jsx
import React19, { useEffect as useEffect11, useRef as useRef15, useState as useState16 } from "react";
import { Fragment as Fragment14, jsx as jsx19, jsxs as jsxs18 } from "react/jsx-runtime";

// src/ProfileProposals.jsx
import React20, { useEffect as useEffect12, useRef as useRef16, useState as useState17 } from "react";
import { Eye, X as X3, RefreshCw as RefreshCw4 } from "lucide-react";
import { Fragment as Fragment15, jsx as jsx20, jsxs as jsxs19 } from "react/jsx-runtime";

// src/PlannedPage.jsx
import { Fragment as Fragment16, jsx as jsx21, jsxs as jsxs20 } from "react/jsx-runtime";
function PendingList({ items, navigate, select, limit }) {
  const shown = limit ? items.slice(0, limit) : items;
  return /* @__PURE__ */ jsx21("ul", { className: "pending-list", children: shown.map((item) => /* @__PURE__ */ jsx21("li", { children: /* @__PURE__ */ jsxs20(
    "button",
    {
      className: "pending-item",
      onClick: () => item.assetId ? select(item.assetId) : navigate(item.to),
      children: [
        /* @__PURE__ */ jsx21("span", { className: "pending-kind", children: item.kind }),
        /* @__PURE__ */ jsxs20("span", { className: "pending-main", children: [
          /* @__PURE__ */ jsx21("strong", { children: item.title }),
          /* @__PURE__ */ jsx21("small", { children: item.detail })
        ] }),
        /* @__PURE__ */ jsx21(ArrowUpRight2, { size: 15 })
      ]
    }
  ) }, item.id)) });
}

// src/KnowledgeZones.jsx
import React22, { useEffect as useEffect13, useRef as useRef17, useState as useState19 } from "react";
import { BarChart3, Plus as Plus4, RotateCcw as RotateCcw3, Save, Trash2 as Trash22, ArrowUpRight as ArrowUpRight3 } from "lucide-react";

// src/knowledge-zones.js
var DEFAULT_ZONE_RULES = Object.freeze([
  Object.freeze({ pattern: "GET NOTES/**", zone: "input" }),
  Object.freeze({ pattern: "\u4E2A\u4EBA\u4E0A\u4E0B\u6587/**", zone: "profile" })
]);
var ZONE_LIMITS = Object.freeze({ rules: 20, pattern: 200 });

// src/KnowledgeZones.jsx
import { jsx as jsx22, jsxs as jsxs21 } from "react/jsx-runtime";
function useZoneSummary() {
  const [summary, setSummary] = useState19({ latest: null, mcp: null, loaded: false });
  useEffect13(() => {
    let alive = true;
    request("/knowledge/zones/summary", {}).then((value) => alive && setSummary({ ...value, loaded: true })).catch(() => alive && setSummary((current2) => ({ ...current2, loaded: true })));
    return () => {
      alive = false;
    };
  }, []);
  return [summary, setSummary];
}

// src/PartnerScreen.jsx
import React23, { forwardRef, useEffect as useEffect14, useImperativeHandle, useRef as useRef18, useState as useState20 } from "react";

// src/partner-lcd.js
var SEASONS = [
  { id: "spring", label: "\u6625 \xB7 \u82B1\u5F00" },
  { id: "summer", label: "\u590F \xB7 \u9AA4\u96E8" },
  { id: "autumn", label: "\u79CB \xB7 \u843D\u53F6" },
  { id: "winter", label: "\u51AC \xB7 \u521D\u96EA" }
];
var SEASON_STEPS = 15 * 20;
var EGG_ROWS = [
  "....XXXX....",
  "..XXOOOOXX..",
  ".XOHOOOOOOX.",
  ".XHOOSSOOOX.",
  "XOOOSSSSOOOX",
  "XOOOOSSOOOOX",
  "XOSOOOOOOSOX",
  "XOSSOOOOSSOX",
  "XOOOOOOOOOOX",
  "XOOOSSSOOOOX",
  ".XOOSSSSOOX.",
  ".XOOOOOOOOX.",
  "..XXOOOOXX..",
  "....XXXX...."
];
var EGG_W = EGG_ROWS[0].length;
var EGG_H = EGG_ROWS.length;
var eggAt = (col, row) => row >= 0 && row < EGG_H && col >= 0 && col < EGG_W ? EGG_ROWS[row][col] : ".";
function rasterEgg(angle, { sx = 1, sy = 1 } = {}) {
  const cos = Math.cos(-angle), sin = Math.sin(-angle);
  const sample = (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    const u = (px * cos - py * sin) / sx + EGG_W / 2, v = (px * sin + py * cos) / sy + EGG_H / 2;
    return eggAt(Math.floor(u), Math.floor(v));
  };
  const inside = /* @__PURE__ */ new Map();
  const R2 = 10;
  for (let y = -R2; y <= R2; y++)
    for (let x = -R2; x <= R2; x++) {
      const ch = sample(x, y);
      if (ch !== ".") inside.set(`${x},${y}`, ch);
    }
  const cells = /* @__PURE__ */ new Map();
  let bottom = -Infinity, top = Infinity;
  for (const [key, ch] of inside) {
    const [x, y] = key.split(",").map(Number);
    bottom = Math.max(bottom, y);
    top = Math.min(top, y);
    const edge = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ].some(([dx, dy]) => !inside.has(`${x + dx},${y + dy}`));
    cells.set(key, edge ? 3 : ch === "S" ? 6 : ch === "H" ? 16 : 5);
  }
  return { cells, bottom, top };
}
var INK2 = "28, 38, 22";
var C = { grass: 7, cloudDark: 8, rain: 9, leafDark: 10, leaf: 11, pink: 12, sun: 13, cloud: 14, snow: 15 };
var SHADE = [0, 0.26, 0.55, 0.92, 0, 1, 1, 0.95, 0.55, 0.9, 1, 1, 1, 1, 0.95, 1, 1];
var COLOR = {
  5: "246, 242, 228",
  6: "255, 138, 36",
  7: "74, 150, 60",
  8: "120, 132, 150",
  9: "58, 118, 200",
  10: "170, 64, 36",
  11: "226, 124, 36",
  12: "232, 96, 150",
  13: "255, 205, 60",
  14: "250, 252, 255",
  15: "255, 255, 255",
  16: "255, 255, 255"
};
var ease = (t) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
function prng(seed2) {
  let s = seed2;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}
function createPartnerLcd(canvas, { mode = "roam", cols: fixedCols, rows: fixedRows, dot: fixedDot, onSeason, reduced = false, startStep = 0 } = {}) {
  const ctx = canvas.getContext("2d");
  const rnd = prng(11);
  const box = canvas.parentElement;
  const cols = fixedCols ?? Math.max(24, Math.floor((box?.clientWidth || 180) / (fixedDot || 3)));
  const rows = fixedRows ?? Math.max(16, Math.floor((box?.clientHeight || 78) / (fixedDot || 3)));
  const ground = rows - 3;
  const glow = new Float32Array(cols * rows);
  let target = new Uint8Array(cols * rows);
  const tint = new Uint8Array(cols * rows);
  let step = startStep, raf = 0, last = 0, acc = 0, running = false;
  let action = null, view = "egg", number = 0, pokes = 0, catching = null, lightning = 0, seasonIndex = -1, snowOnEgg = 0;
  let dot = 3;
  function fit() {
    const w = box?.clientWidth || cols * 3, h2 = box?.clientHeight || rows * 3;
    dot = fixedDot || Math.max(2, Math.floor(Math.min(w / cols, h2 / rows)));
    const ratio = window.devicePixelRatio || 1;
    canvas.width = cols * dot * ratio;
    canvas.height = rows * dot * ratio;
    canvas.style.width = `${cols * dot}px`;
    canvas.style.height = `${rows * dot}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  const put = (x, y, shade) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    const i = y * cols + x;
    if (shade > target[i]) target[i] = shade;
  };
  const force = (x, y, code) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    target[y * cols + x] = code;
  };
  const petals = Array.from({ length: 10 }, () => ({ x: rnd() * cols, y: rnd() * ground, p: rnd() * 6 }));
  const rain = Array.from({ length: 22 }, () => ({ x: rnd() * (cols + 12), y: rnd() * ground }));
  const splashes = [];
  const leaves = Array.from({ length: 10 }, () => ({ x: rnd() * cols, y: rnd() * ground, p: rnd() * 6, dark: rnd() > 0.5 }));
  const gusts = Array.from({ length: 4 }, () => ({ x: -rnd() * 60, y: 2 + rnd() * (ground - 6), l: 4 + Math.floor(rnd() * 5) }));
  const snow = Array.from({ length: 20 }, () => ({ x: rnd() * cols, y: rnd() * ground, p: rnd() * 6, big: rnd() > 0.72 }));
  const at = (f) => Math.round(cols * f);
  const clouds = [
    { x: at(0.07), y: 1, w: Math.max(6, at(0.18)) },
    { x: at(0.55), y: 0, w: Math.max(5, at(0.13)) },
    { x: at(0.83), y: 2, w: Math.max(4, at(0.11)) }
  ];
  const grassCols = Array.from({ length: Math.floor(cols / 5) }, (_, i) => 2 + i * 5);
  const flowerCols = [0.13, 0.32, 0.68, 0.87].map(at);
  const piles = [[0.1, 4], [0.38, 3], [0.74, 5], [0.92, 3]].map(([f, w]) => [at(f), w]);
  function drawSeason(id, t, clip) {
    const P = (x, y, s) => clip(x) && put(x, y, s);
    const groundColor = { spring: C.grass, summer: C.grass, autumn: C.leaf, winter: C.snow }[id];
    for (let x = 0; x < cols; x++) {
      P(x, ground, groundColor);
      if (x % 2 === 0) P(x, ground + 1, 2);
    }
    if (id === "spring" || id === "summer") {
      grassCols.forEach((gx, i) => {
        const lean = (Math.floor(t / 8) + i) % 2;
        P(gx, ground - 1, C.grass);
        P(gx + lean, ground - 2, C.grass);
        P(gx + 2, ground - 1, C.grass);
        if (i % 3 === 0) P(gx + 1 + lean, ground - 3, C.grass);
      });
    }
    if (id === "spring") {
      flowerCols.forEach((fx, i) => {
        const open = Math.sin(t / 20 + i * 1.7) > -0.4;
        for (let y = 1; y <= 3; y++) P(fx, ground - y, C.grass);
        P(fx + 1, ground - 2, C.grass);
        P(fx, ground - 5, C.sun);
        const ring = open ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] : [[-1, 0], [1, 0], [0, -1]];
        ring.forEach(([dx, dy]) => P(fx + dx, ground - 5 + dy, C.pink));
      });
      petals.forEach((p) => {
        p.x += 0.34;
        p.y += 0.22 + Math.sin(t / 7 + p.p) * 0.14;
        if (p.x > cols || p.y > ground - 1) Object.assign(p, { x: -rnd() * 10, y: rnd() * 10 });
        P(p.x, p.y, C.pink);
        if (p.p > 3) P(p.x + 1, p.y, C.pink);
      });
    }
    if (id === "summer") {
      clouds.forEach((c) => {
        c.x += 0.06;
        if (c.x > cols + 2) c.x = -c.w - 2;
        for (let i = 0; i < c.w; i++) {
          P(c.x + i, c.y + 1, C.cloud);
          P(c.x + i, c.y + 2, C.cloudDark);
          if (i > 1 && i < c.w - 2) P(c.x + i, c.y, C.cloud);
        }
      });
      rain.forEach((r2) => {
        r2.x -= 0.5;
        r2.y += 1.6;
        if (r2.y >= ground - 1) {
          splashes.push({ x: r2.x, life: 3 });
          Object.assign(r2, { x: rnd() * (cols + 12), y: 3 + rnd() * 3 });
        }
        P(r2.x, r2.y, C.rain);
        P(r2.x + 0.3, r2.y - 1, C.rain);
      });
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i];
        P(s.x - 1, ground - 1, C.rain);
        P(s.x + 1, ground - 1, C.rain);
        if (s.life === 3) P(s.x, ground - 2, C.rain);
        if (--s.life <= 0) splashes.splice(i, 1);
      }
    }
    if (id === "autumn") {
      gusts.forEach((g) => {
        g.x += 2.4;
        if (g.x > cols + 10) Object.assign(g, { x: -10 - rnd() * 50, y: 2 + rnd() * (ground - 6), l: 4 + Math.floor(rnd() * 5) });
        for (let i = 0; i < g.l; i++) P(g.x - i, g.y, i === 0 ? 2 : 1);
      });
      leaves.forEach((l, i) => {
        l.x += 0.42 + Math.sin(t / 9 + l.p) * 0.32;
        l.y += 0.24;
        if (l.x > cols || l.y > ground - 1) Object.assign(l, { x: -rnd() * 12, y: rnd() * 6 });
        const code = l.dark ? C.leafDark : C.leaf;
        const flip = Math.floor(t / 3 + i) % 2;
        P(l.x, l.y, code);
        P(l.x + 1, l.y, code);
        P(l.x + (flip ? 1 : 0), l.y + 1, code);
      });
      piles.forEach(([px, w], i) => {
        for (let k = 0; k < w; k++) P(px + k, ground - 1, i % 2 ? C.leafDark : C.leaf);
        P(px + 1, ground - 2, C.leaf);
      });
    }
    if (id === "winter") {
      snow.forEach((f) => {
        f.y += f.big ? 0.14 : 0.2;
        f.x += Math.sin(t / 10 + f.p) * 0.18;
        if (f.y > ground - 1) Object.assign(f, { x: rnd() * cols, y: -rnd() * 4 });
        P(f.x, f.y, C.snow);
        if (f.big) [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => P(f.x + dx, f.y + dy, C.snow));
      });
      const depth = Math.min(1, t % SEASON_STEPS / SEASON_STEPS * 1.6);
      for (let x = 0; x < cols; x++) {
        if (x * 7 % 10 < depth * 10) P(x, ground - 1, C.snow);
        if (depth > 0.7 && x * 3 % 7 === 0) P(x, ground - 2, C.snow);
      }
    }
  }
  const STOPS = mode === "roam" ? [Math.round(cols / 2), Math.round(cols * 0.76), Math.round(cols / 2), Math.round(cols * 0.24)] : [];
  const SEG = 50;
  const R2 = 5.3;
  function eggPose(t) {
    if (mode !== "roam") {
      const phase = t % 80;
      let angle = 0, hop = 0, sy = 1, sx = 1;
      if (phase >= 44 && phase < 62) angle = Math.sin((phase - 44) / 18 * Math.PI * 3) * 0.28 * (1 - (phase - 44) / 18);
      if (phase >= 62 && phase < 70) hop = Math.sin((phase - 62) / 8 * Math.PI) * 2.2;
      if (phase >= 70 && phase < 73) [sx, sy] = [1.1, 0.88];
      return { x: cols / 2, angle, hop, sx, sy, resting: phase < 44 };
    }
    const seg = Math.floor(t / SEG) % 4, f = t % SEG / SEG;
    const to = STOPS[seg], from = STOPS[(seg + 3) % 4], dir = Math.sign(to - from);
    const roll = Math.abs(to - from) / R2;
    if (f < 0.4) {
      const e = ease(f / 0.4);
      return { x: from + (to - from) * e, angle: dir * roll * e, hop: 0, sx: 1, sy: 1, resting: false };
    }
    if (f < 0.5) {
      const k = (f - 0.4) / 0.1;
      return { x: to, angle: dir * (roll + Math.sin(k * Math.PI * 2) * 0.22 * (1 - k)), hop: 0, sx: 1, sy: 1, resting: false };
    }
    const upright = dir * Math.PI * 2 * Math.ceil(roll / (Math.PI * 2) + 0.01);
    if (f < 0.62) {
      const k = (f - 0.5) / 0.12;
      return { x: to, angle: dir * roll + (upright - dir * roll) * ease(k), hop: Math.sin(k * Math.PI) * 3.2, sx: 1, sy: 1, resting: false };
    }
    if (f < 0.68) return { x: to, angle: upright, hop: 0, sx: 1.12, sy: 0.86, resting: false };
    return { x: to, angle: upright, hop: 0, sx: 1, sy: 1, resting: true };
  }
  function drawEgg(t) {
    const pose = eggPose(t);
    let hop = pose.hop, angle = pose.angle, sx = pose.sx, sy = pose.sy;
    if (action) {
      const k = action.k / action.len;
      if (action.type === "hop") {
        hop += Math.sin(Math.min(1, k / 0.8) * Math.PI) * 6;
        if (k > 0.8) [sx, sy] = [1.15, 0.82];
      } else if (action.type === "spin") {
        angle += ease(k) * Math.PI * 2;
        hop += Math.sin(k * Math.PI) * 2.5;
      } else if (action.type === "wiggle") {
        angle += Math.sin(k * Math.PI * 8) * 0.42 * (1 - k);
      } else if (action.type === "bounce") {
        hop += Math.abs(Math.sin(k * Math.PI * 2)) * 3.5 * (1 - k * 0.4);
        if (Math.abs(Math.sin(k * Math.PI * 2)) < 0.15) [sx, sy] = [1.12, 0.86];
      }
    }
    const egg = rasterEgg(angle, { sx, sy });
    const baseY = (mode === "roam" ? ground - 1 : rows - 1) - egg.bottom;
    const ox = Math.round(pose.x), oy = Math.max(-egg.top, Math.round(baseY - hop));
    for (const [key, shade] of egg.cells) {
      const [x, y] = key.split(",").map(Number);
      force(ox + x, oy + y, shade);
    }
    if (mode === "roam" && SEASONS[seasonIndex]?.id === "winter" && pose.resting) snowOnEgg = Math.min(4, snowOnEgg + 0.03);
    else if (!pose.resting) snowOnEgg = 0;
    for (let i = 0; i < Math.floor(snowOnEgg); i++) force(ox - 1 + i, oy + egg.top - 1, C.snow);
    return { x: ox, y: oy + egg.top };
  }
  const SEGMENTS = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abfgcd" };
  function drawNumber() {
    const text = String(Math.min(99, Math.max(0, number)));
    const width = 6, gap = 2, total = text.length * width + (text.length - 1) * gap;
    const left = Math.floor((cols - total) / 2), topY = Math.max(0, Math.floor((rows - 14) / 2) - 1);
    [...text].forEach((ch, k) => {
      const ox = left + k * (width + gap), segs = SEGMENTS[ch];
      const H = (y) => {
        for (let x = 1; x <= 4; x++) for (let d = 0; d < 2; d++) force(ox + x, topY + y + d, 3);
      };
      const V = (x, y0) => {
        for (let y = y0; y < y0 + 4; y++) for (let d = 0; d < 2; d++) force(ox + x + d, topY + y, 3);
      };
      if (segs.includes("a")) H(0);
      if (segs.includes("g")) H(6);
      if (segs.includes("d")) H(12);
      if (segs.includes("f")) V(0, 2);
      if (segs.includes("b")) V(4, 2);
      if (segs.includes("e")) V(0, 8);
      if (segs.includes("c")) V(4, 8);
    });
  }
  function tick() {
    target = new Uint8Array(cols * rows);
    const t = step;
    if (view === "number") {
      drawNumber();
      step++;
      return;
    }
    if (mode === "roam") {
      const index = Math.floor(t / SEASON_STEPS) % 4, into = t % SEASON_STEPS;
      if (index !== seasonIndex) {
        seasonIndex = index;
        canvas.dataset.season = SEASONS[index].id;
        onSeason?.(SEASONS[index]);
      }
      const wipe = into < 16 ? into / 16 * cols : cols + 1;
      drawSeason(SEASONS[index].id, t, (x) => x < wipe);
      if (wipe <= cols) {
        drawSeason(SEASONS[(index + 3) % 4].id, t, (x) => x >= wipe);
        for (let y = 0; y < rows; y++) put(wipe, y, 1);
      }
      if (SEASONS[index].id === "summer" && lightning <= 0 && rnd() < 4e-3) lightning = 3;
    } else if (t % 80 >= 70 && t % 80 < 76) {
      put(cols / 2 - 7, 4, C.sun);
      put(cols / 2 + 6, 6, C.sun);
    }
    const head = drawEgg(t);
    if (catching) {
      catching.k++;
      for (let i = 0; i < 4; i++) {
        const y = catching.k * 1.4 - i * 2;
        if (y < head.y) put(head.x + (i % 2 ? 1 : -1), y, 3 - (i > 1 ? 1 : 0));
      }
      if (catching.k * 1.4 - 6 >= head.y) {
        catching = null;
        action = { type: "hop", k: 0, len: 18 };
      }
    }
    if (action && ++action.k >= action.len) action = null;
    step++;
  }
  function render() {
    const w = cols * dot, h2 = rows * dot, size = dot - (dot > 2 ? 1 : 0);
    ctx.clearRect(0, 0, w, h2);
    const flash = lightning > 0;
    if (flash) lightning--;
    for (let i = 0; i < glow.length; i++) {
      const code = target[i], want = SHADE[code];
      if (code) tint[i] = code;
      glow[i] = code ? want : glow[i] * 0.52;
      const x = i % cols * dot, y = Math.floor(i / cols) * dot;
      const color = COLOR[tint[i]];
      if (color && glow[i] > 0.08) {
        ctx.fillStyle = `rgba(${INK2}, 0.06)`;
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = `rgba(${color}, ${flash ? glow[i] * 0.6 : glow[i]})`;
        ctx.fillRect(x, y, size, size);
        continue;
      }
      const alpha = flash ? Math.max(0.3, glow[i] * 0.4) : glow[i];
      ctx.fillStyle = `rgba(${INK2}, ${Math.max(alpha, 0.06)})`;
      ctx.fillRect(x, y, size, size);
    }
  }
  function frame(now2) {
    if (!running) return;
    acc += Math.min(200, now2 - (last || now2));
    last = now2;
    let changed = false;
    while (acc >= 50) {
      tick();
      acc -= 50;
      changed = true;
    }
    if (changed) render();
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running || reduced) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }
  function redraw() {
    tick();
    if (reduced) glow.fill(0);
    render();
  }
  const visibility = () => document.hidden ? stop() : start();
  const resize = () => {
    fit();
    render();
  };
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("resize", resize);
  fit();
  canvas.dataset.motion = reduced ? "static" : "live";
  if (reduced) {
    step = mode === "roam" ? 40 : 0;
    tick();
    glow.fill(0);
    render();
  } else {
    tick();
    render();
    start();
  }
  return {
    // 戳一下：跳高 → 原地转一圈 → 左右扭 → 连弹两下，依次轮换
    poke() {
      if (reduced) return;
      const types = [
        ["hop", 18],
        ["spin", 20],
        ["wiggle", 18],
        ["bounce", 22]
      ];
      const [type, len] = types[pokes++ % types.length];
      action = { type, k: 0, len };
    },
    catchData() {
      if (!reduced) catching = { k: 0 };
    },
    // 首页暴龙机 A 键：在数码蛋与待处理条数之间切换
    showNumber(n) {
      view = "number";
      number = n;
      canvas.dataset.view = "number";
      redraw();
    },
    showEgg() {
      view = "egg";
      canvas.dataset.view = "egg";
      redraw();
    },
    get running() {
      return running;
    },
    destroy() {
      stop();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("resize", resize);
    }
  };
}

// src/PartnerScreen.jsx
import { jsx as jsx23 } from "react/jsx-runtime";
var REDUCE2 = "(prefers-reduced-motion: reduce)";
function prefersReduced3() {
  try {
    return matchMedia(REDUCE2).matches;
  } catch {
    return false;
  }
}
var roamDot = (height) => height >= 80 ? 4 : 3;
var PartnerScreen = forwardRef(function PartnerScreen2({ mode = "roam", cols, rows, onSeason, className = "", ...rest }, ref) {
  const host = useRef18(), canvas = useRef18(), engine = useRef18(), seasonRef = useRef18(onSeason), shown = useRef18(null);
  seasonRef.current = onSeason;
  const [reduced, setReduced] = useState20(prefersReduced3);
  const [size, setSize] = useState20("");
  useImperativeHandle(
    ref,
    () => ({
      poke: () => engine.current?.poke(),
      showNumber: (n) => {
        shown.current = n;
        engine.current?.showNumber(n);
      },
      showEgg: () => {
        shown.current = null;
        engine.current?.showEgg();
      }
    }),
    []
  );
  useEffect14(() => {
    let media;
    try {
      media = matchMedia(REDUCE2);
    } catch {
      return void 0;
    }
    const change = () => setReduced(media.matches);
    media.addEventListener?.("change", change);
    return () => media.removeEventListener?.("change", change);
  }, []);
  useEffect14(() => {
    if (mode !== "roam" || typeof ResizeObserver !== "function") return void 0;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const dot = roamDot(height);
      setSize(`${Math.floor(width / dot)}x${Math.floor(height / dot)}x${dot}`);
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [mode]);
  useEffect14(() => {
    const height = host.current?.clientHeight || 0;
    const lcd = createPartnerLcd(canvas.current, {
      mode,
      reduced,
      ...mode === "roam" ? { dot: roamDot(height), cols, rows } : { cols: cols ?? 16, rows: rows ?? 18 },
      onSeason: (season) => {
        canvas.current?.closest(".partner-screen")?.setAttribute("data-season", season.id);
        seasonRef.current?.(season);
      }
    });
    engine.current = lcd;
    if (shown.current !== null) lcd.showNumber(shown.current);
    const caught = () => lcd.catchData();
    window.addEventListener(DATA_CAUGHT, caught);
    return () => {
      window.removeEventListener(DATA_CAUGHT, caught);
      lcd.destroy();
    };
  }, [mode, cols, rows, reduced, size]);
  return /* @__PURE__ */ jsx23("span", { ref: host, className: `lcd-screen lcd-${mode} ${className}`, "aria-hidden": "true", ...rest, children: /* @__PURE__ */ jsx23("canvas", { ref: canvas }) });
});

// src/ModelCapabilityUI.jsx
import React24, { useEffect as useEffect15, useRef as useRef19, useState as useState21 } from "react";
import { Fragment as Fragment17, jsx as jsx24, jsxs as jsxs22 } from "react/jsx-runtime";

// src/LifePages.jsx
import React25, { useCallback, useEffect as useEffect16, useLayoutEffect, useRef as useRef20, useState as useState22 } from "react";
import {
  Globe,
  RefreshCw as RefreshCw5,
  ExternalLink,
  BookmarkPlus,
  Star,
  Plus as Plus5,
  Trash2 as Trash23,
  RotateCcw as RotateCcw4,
  Archive as Archive3,
  FolderOpen as FolderOpen2,
  BookOpen,
  ArrowUpRight as ArrowUpRight4,
  ShieldCheck,
  Hourglass
} from "lucide-react";

// src/learning.js
var STATUS = [
  ["want", "\u60F3\u5B66"],
  ["learning", "\u5728\u5B66"],
  ["done", "\u5B66\u5B8C"]
];
var statusLabel = Object.fromEntries(STATUS);

// src/LifePages.jsx
import { Fragment as Fragment18, jsx as jsx25, jsxs as jsxs23 } from "react/jsx-runtime";
var when = (iso) => iso ? new Date(iso).toLocaleString("zh-CN", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
}) : "";
function useAiHot() {
  const [data, setData] = useState22(null), [error, setError] = useState22("");
  const load = useCallback(async () => {
    try {
      setData(await request("/aihot"));
      setError("");
    } catch (e) {
      setError(e.message || "\u8BFB\u53D6\u5931\u8D25");
    }
  }, []);
  useEffect16(() => {
    load();
  }, [load]);
  return { data, error, setData, reload: load };
}
function HomeHot({ navigate }) {
  const { data, error } = useAiHot();
  const cache = data?.cache;
  const pool = cache ? cache.sections.hot.items.length ? cache.sections.hot.items : cache.sections.selected.items : [];
  const items = pool.filter((i) => i.url).slice(0, 5);
  return /* @__PURE__ */ jsxs23("section", { className: "home-section home-hot", "aria-labelledby": "home-hot-title", children: [
    /* @__PURE__ */ jsxs23("div", { className: "v14-sh", children: [
      /* @__PURE__ */ jsx25("span", { className: "v14-idx", "aria-hidden": "true", children: "E" }),
      /* @__PURE__ */ jsx25("h2", { id: "home-hot-title", children: "\u4ECA\u65E5\u70ED\u70B9" }),
      /* @__PURE__ */ jsx25("span", { className: "v14-sub", children: "\u6765\u81EA AI HOT \u7684\u672C\u673A\u7F13\u5B58" })
    ] }),
    error ? /* @__PURE__ */ jsxs23("p", { className: "recent-empty", children: [
      "\u8BFB\u53D6 AI HOT \u7F13\u5B58\u5931\u8D25\uFF1A",
      error
    ] }) : !data ? /* @__PURE__ */ jsx25("p", { className: "recent-empty", children: "\u6B63\u5728\u8BFB\u53D6\u672C\u673A\u7F13\u5B58\u2026" }) : !items.length ? /* @__PURE__ */ jsxs23("p", { className: "recent-empty", children: [
      cache.status === "never" ? "\u5C1A\u672A\u62C9\u53D6\u3002" : "\u7F13\u5B58\u91CC\u6682\u65F6\u6CA1\u6709\u5E26\u539F\u6587\u94FE\u63A5\u7684\u70ED\u70B9\u3002",
      "\u5728 AI HOT \u9875\u786E\u8BA4\u8BBF\u95EE\u8BF4\u660E\u540E\u624D\u4F1A\u8BBF\u95EE aihot.news\u3002"
    ] }) : /* @__PURE__ */ jsxs23(Fragment18, { children: [
      /* @__PURE__ */ jsxs23("div", { className: "hot-ticker", "aria-hidden": "true", children: [
        /* @__PURE__ */ jsx25("span", { className: "lead", children: "LIVE" }),
        /* @__PURE__ */ jsx25("div", { className: "run", children: [...items, ...items].map((item, i) => /* @__PURE__ */ jsx25("span", { children: item.title }, i)) })
      ] }),
      /* @__PURE__ */ jsx25("ol", { className: "hot-card-list", children: items.map((item, i) => /* @__PURE__ */ jsxs23("li", { className: "m-panel sheen", "data-tilt": "", children: [
        /* @__PURE__ */ jsxs23("span", { className: "hot-rank", "aria-hidden": "true", children: [
          "#",
          i + 1
        ] }),
        /* @__PURE__ */ jsx25("a", { className: "hot-card-link", href: item.url, target: "_blank", rel: "noopener noreferrer", children: item.title }),
        item.source && /* @__PURE__ */ jsx25("small", { children: item.source })
      ] }, `${item.url}-${i}`)) }),
      /* @__PURE__ */ jsx25("p", { className: "hot-card-status", children: cache.status === "failed" ? `\u62C9\u53D6\u5931\u8D25\uFF0C\u663E\u793A ${when(cache.lastSuccessAt)} \u7684\u7F13\u5B58` : `\u66F4\u65B0\u4E8E ${when(cache.lastSuccessAt)}` })
    ] }),
    /* @__PURE__ */ jsxs23("button", { className: "plan-link", onClick: () => navigate("aihot"), children: [
      /* @__PURE__ */ jsx25("span", { children: "\u67E5\u770B AI HOT" }),
      /* @__PURE__ */ jsx25(ArrowUpRight4, { size: 15 })
    ] })
  ] });
}

// src/ProjectBrief.jsx
import React29, { useCallback as useCallback4, useEffect as useEffect20, useRef as useRef23, useState as useState26 } from "react";
import { ArrowUpRight as ArrowUpRight5, Check, RefreshCw as RefreshCw9 } from "lucide-react";

// src/ProjectStatus.jsx
import React28, { useEffect as useEffect19, useState as useState25 } from "react";
import { createPortal as createPortal2 } from "react-dom";
import { RefreshCw as RefreshCw8, Flag, Play } from "lucide-react";

// src/collab.js
var COLLAB_AGENTS = [
  { id: "codex", label: "Codex" },
  { id: "claude-code", label: "Claude Code" },
  { id: "hermes", label: "Hermes" }
];
var agentLabel = (id) => COLLAB_AGENTS.find((a) => a.id === id)?.label || "";
var REDACTED = "\uFF08\u542B\u7591\u4F3C\u51ED\u636E\uFF0C\u5DF2\u7701\u7565\uFF1B\u8BF7\u5230\u9879\u76EE\u539F\u6587\u67E5\u770B\uFF09";
var SECRET = /\b(?:sk-|ghp_|gho_|ghs_|github_pat_|xox[baprs]-|AKIA)[A-Za-z0-9_-]+|-----BEGIN[A-Z ]*-----|(?:api[_ -]?key|secret|password|passwd|token|access[_ -]?key|密钥|密码)\s*[:=：]\s*\S+/i;
function redactSecrets(value) {
  const text = String(value ?? "");
  return SECRET.test(text) ? REDACTED : text;
}
var line = (value) => redactSecrets(String(value ?? "").replace(/[\x00-\x1f\x7f]+/g, " ").trim());
function projectRoot(root) {
  if (typeof root !== "string" || !root.startsWith("/") || root.length > 2e3 || /[\x00-\x1f\x7f]/.test(root) || root.split("/").some((part) => part === "." || part === ".."))
    throw new Error("\u9879\u76EE\u8DEF\u5F84\u65E0\u6548\uFF1A\u53EA\u80FD\u4F7F\u7528\u5DE5\u4F5C\u53F0\u767B\u8BB0\u8FC7\u7684\u672C\u5730\u76EE\u5F55");
  return root;
}
function agentOf(id) {
  const label = agentLabel(id);
  if (!label) throw new Error("\u53EA\u80FD\u9009\u62E9 Codex\u3001Claude Code \u6216 Hermes \u8FD9\u4E09\u4E2A Agent");
  return label;
}
function statusOf(item) {
  const current2 = item?.current;
  const readable = current2?.state === "ok" || current2?.state === "partial";
  const f = readable ? current2.fields || {} : {};
  return {
    readable,
    path: line(current2?.path) || "CURRENT.md",
    stateId: f.stateId ? line(f.stateId) : "",
    writer: f.writer ? line(f.writer) : "",
    next: f.next ? line(f.next) : "",
    handoffText: f.handoff?.text ? line(f.handoff.text) : "",
    handoffHref: f.handoff?.href ? line(f.handoff.href) : "",
    reason: current2?.state === "absent" ? `\u9879\u76EE\u91CC\u6CA1\u6709 ${line(current2.path) || "CURRENT.md"}` : current2?.state === "unparsed" ? `${line(current2.path) || "CURRENT.md"} \u6CA1\u6709\u534F\u4F5C\u72B6\u6001\u8868` : !readable ? "CURRENT.md \u65E0\u6CD5\u8BFB\u53D6" : ""
  };
}
function startPrompt(item, agentId) {
  const agent = agentOf(agentId);
  const root = projectRoot(item?.root);
  const s = statusOf(item);
  return [
    `\u3010\u534F\u540C \xB7 \u4E00\u952E\u5F00\u5DE5\u3011\u5F00\u5DE5\uFF1A${agent}`,
    `\u9879\u76EE\uFF1A${line(item?.name)}`,
    `\u9879\u76EE\u8DEF\u5F84\uFF1A${root}`,
    "",
    "\u5148\u8BFB\uFF08\u6309\u987A\u5E8F\uFF09\uFF1A",
    "1. AGENTS.md\uFF08\u9879\u76EE\u5165\u53E3\u4E0E\u89C4\u5219\uFF1B\u6CA1\u6709\u5C31\u8DF3\u8FC7\uFF09",
    `2. ${s.path}\uFF08\u552F\u4E00\u5F53\u524D\u72B6\u6001\uFF1B\u8BB0\u4E0B state_id \u4E0E\u5F53\u524D\u5199\u5165\u8005\uFF09`,
    "",
    ...s.stateId ? [`\u8F93\u5165\u72B6\u6001\uFF1Astate_id ${s.stateId}`] : [],
    `\u552F\u4E00\u4E0B\u4E00\u6B65\uFF1A${s.next || `\u672A\u77E5\uFF08${s.reason || "\u72B6\u6001\u8868\u7F3A\u5C11\u6B64\u9879"}\uFF1B\u5148\u5411\u7528\u6237\u786E\u8BA4\uFF09`}`,
    "",
    "\u5F00\u5DE5\u89C4\u5219\uFF1A\u5F53\u524D\u5199\u5165\u8005\u4E0D\u662F\u201C\u65E0\u201D\u65F6\u53EA\u505A\u53EA\u8BFB\u68C0\u67E5\uFF1B\u4E3A\u201C\u65E0\u201D\u65F6\u5148\u5728 CURRENT.md \u767B\u8BB0\u8BA4\u9886\u5E76\u56DE\u8BFB\uFF0C\u518D\u6539\u5176\u4ED6\u6587\u4EF6\u3002\u4E0D\u8BFB\u53D6\u51ED\u636E\u3001\u79C1\u4EBA\u4F1A\u8BDD\u6216\u5DE5\u4F5C\u53F0\u4E3B\u5E93\u5185\u5BB9\uFF1B\u63D0\u4EA4\u3001\u63A8\u9001\u7B49\u5916\u90E8\u52A8\u4F5C\u987B\u7528\u6237\u5F53\u8F6E\u6388\u6743\u3002"
  ].join("\n");
}
async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// src/Collab.jsx
import React26, { useCallback as useCallback2, useEffect as useEffect17, useRef as useRef21, useState as useState23 } from "react";
import { createPortal } from "react-dom";
import { RefreshCw as RefreshCw6, Send, Copy as Copy6, FolderKanban } from "lucide-react";
import { Fragment as Fragment19, jsx as jsx26, jsxs as jsxs24 } from "react/jsx-runtime";
var STATE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function usePromptCopy({ adoptState, notify, onRecorded }) {
  const [busy, setBusy] = useState23(false);
  const [error, setError] = useState23("");
  const [pending, setPending] = useState23(null);
  const live = useRef21(true);
  useEffect17(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  function reset() {
    setError("");
    setPending(null);
  }
  async function record(payload) {
    const result = await request("/collab/record", payload);
    adoptState(result.state);
    onRecorded?.(result.record);
    return result.record;
  }
  async function copy2({ text, kind, projectId, agent, stateId, stage }) {
    setBusy(true);
    setError("");
    try {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        if (live.current)
          setError("\u590D\u5236\u5931\u8D25\uFF0C\u53E3\u4EE4\u6CA1\u6709\u8FDB\u5165\u526A\u8D34\u677F\uFF0C\u4E5F\u6CA1\u6709\u8BA1\u5165\u7559\u75D5\u3002\u53EF\u4EE5\u624B\u52A8\u9009\u4E2D\u4E0A\u9762\u7684\u53E3\u4EE4\u6587\u672C\u3002");
        return false;
      }
      const payload = {
        id: `collab-${crypto.randomUUID()}`,
        kind,
        projectId,
        agent,
        ...stateId && STATE_ID.test(stateId) ? { stateId } : {},
        ...stage ? { stage } : {},
        promptSha256: await sha256Hex(text)
      };
      try {
        await record(payload);
        notify("\u53E3\u4EE4\u5DF2\u590D\u5236\uFF0C\u5DF2\u8BA1\u5165\u64CD\u4F5C\u7559\u75D5");
        return true;
      } catch (e) {
        if (live.current) {
          setPending(payload);
          setError(`\u53E3\u4EE4\u5DF2\u590D\u5236\uFF0C\u4F46\u7559\u75D5\u6CA1\u6709\u5199\u5165\uFF1A${e.message}\u3002\u53EF\u4EE5\u8865\u8BB0\uFF0C\u4E0D\u9700\u8981\u518D\u590D\u5236\u3002`);
        }
        return false;
      }
    } finally {
      if (live.current) setBusy(false);
    }
  }
  async function retry() {
    if (!pending) return false;
    setBusy(true);
    try {
      await record(pending);
      if (live.current) {
        setPending(null);
        setError("");
      }
      notify("\u5DF2\u8865\u8BB0\u64CD\u4F5C\u7559\u75D5");
      return true;
    } catch (e) {
      if (live.current) setError(`\u8865\u8BB0\u4ECD\u672A\u6210\u529F\uFF1A${e.message}`);
      return false;
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return { busy, error, pending, copy: copy2, retry, reset };
}
function PromptDialog({ title, lead, text, onClose, copier, onConfirm, stale = "" }) {
  return /* @__PURE__ */ jsx26(Dialog, { title, onClose, children: /* @__PURE__ */ jsxs24("div", { className: "prompt-dialog", children: [
    /* @__PURE__ */ jsx26("p", { className: "body-copy", children: lead }),
    /* @__PURE__ */ jsx26("pre", { className: "prompt-preview", tabIndex: 0, "aria-label": "\u53E3\u4EE4\u9884\u89C8", children: text }),
    copier.error && /* @__PURE__ */ jsx26("p", { className: "inline-error", role: "alert", children: copier.error }),
    stale && !copier.pending && /* @__PURE__ */ jsx26("p", { className: "inline-error", role: "alert", children: stale }),
    /* @__PURE__ */ jsxs24("div", { className: "prompt-actions", children: [
      /* @__PURE__ */ jsx26(Button, { secondary: true, onClick: onClose, children: copier.pending ? "\u5173\u95ED" : "\u53D6\u6D88" }),
      copier.pending ? /* @__PURE__ */ jsx26(Button, { disabled: copier.busy, onClick: copier.retry, children: "\u8865\u8BB0\u7559\u75D5" }) : /* @__PURE__ */ jsxs24(Button, { disabled: copier.busy || !!stale, onClick: onConfirm, children: [
        /* @__PURE__ */ jsx26(Copy6, { size: 16 }),
        copier.busy ? "\u590D\u5236\u4E2D\u2026" : "\u786E\u8BA4\u5E76\u590D\u5236"
      ] })
    ] })
  ] }) });
}
function AgentPicker({ id, label, value, onChange }) {
  return /* @__PURE__ */ jsxs24("label", { className: "agent-picker", htmlFor: id, children: [
    /* @__PURE__ */ jsx26("span", { children: label }),
    /* @__PURE__ */ jsx26("select", { id, value, onChange: (e) => onChange(e.target.value), children: COLLAB_AGENTS.map((a) => /* @__PURE__ */ jsx26("option", { value: a.id, children: a.label }, a.id)) })
  ] });
}
function staleNote(prompt, stateId, stage) {
  if (!prompt) return "";
  if ((prompt.stateId || "") === (stateId || "") && (stage === void 0 || prompt.stage === stage)) return "";
  return `\u770B\u677F\u5DF2\u5237\u65B0\u5230 ${stateId || "\u672A\u77E5\u72B6\u6001"}\uFF0C\u8FD9\u4EFD\u53E3\u4EE4\u57FA\u4E8E ${prompt.stateId || "\u672A\u77E5\u72B6\u6001"}\uFF0C\u5DF2\u8FC7\u671F\u3002\u8BF7\u5173\u95ED\u540E\u91CD\u65B0\u751F\u6210\u3002`;
}

// src/ProjectGithub.jsx
import React27, { useCallback as useCallback3, useEffect as useEffect18, useRef as useRef22, useState as useState24 } from "react";
import { RefreshCw as RefreshCw7 } from "lucide-react";
import { Fragment as Fragment20, jsx as jsx27, jsxs as jsxs25 } from "react/jsx-runtime";

// src/ProjectStatus.jsx
import { Fragment as Fragment21, jsx as jsx28, jsxs as jsxs26 } from "react/jsx-runtime";
function StartWork({ item, adoptState, notify, label = "\u751F\u6210\u5F00\u5DE5\u53E3\u4EE4", variant = "default" }) {
  const [agent, setAgent] = useState25("codex");
  const [prompt, setPrompt] = useState25(null);
  const copier = usePromptCopy({ adoptState, notify });
  const blocked = !item.root || item.current.state === "error";
  function open() {
    try {
      copier.reset();
      setPrompt({
        text: startPrompt(item, agent),
        agent,
        projectId: item.projectId,
        stateId: item.current.fields?.stateId
      });
    } catch (e) {
      notify(e.message, "error");
    }
  }
  const dialog = prompt && /* @__PURE__ */ jsx28(
    PromptDialog,
    {
      title: `\u5F00\u5DE5\u53E3\u4EE4\uFF1A${item.name}`,
      stale: staleNote(prompt, item.current.fields?.stateId),
      lead: "\u786E\u8BA4\u540E\u590D\u5236\u5230\u526A\u8D34\u677F\uFF0C\u5E76\u8BA1\u5165\u8FD9\u4E2A\u9879\u76EE\u7684\u534F\u540C\u7559\u75D5\uFF1B\u628A\u53E3\u4EE4\u7C98\u8D34\u7ED9\u6240\u9009 Agent \u5373\u53EF\u5F00\u5DE5\uFF0C\u5DE5\u4F5C\u53F0\u4E0D\u4F1A\u66FF\u4F60\u6253\u5F00\u6216\u6267\u884C\u3002",
      text: prompt.text,
      copier,
      onClose: () => setPrompt(null),
      onConfirm: async () => {
        const done = await copier.copy({
          text: prompt.text,
          kind: "start",
          projectId: prompt.projectId,
          agent: prompt.agent,
          stateId: prompt.stateId
        });
        if (done) setPrompt(null);
      }
    }
  );
  return /* @__PURE__ */ jsxs26("div", { className: `status-start ${variant === "save" ? "project-save-start" : ""}`, "aria-label": "\u4E00\u952E\u5F00\u5DE5", role: "group", children: [
    variant === "save" ? /* @__PURE__ */ jsxs26("div", { className: "project-save-picker", children: [
      /* @__PURE__ */ jsxs26("span", { children: [
        "\u5F00\u5DE5 Agent \xB7 ",
        COLLAB_AGENTS.find((a) => a.id === agent)?.label
      ] }),
      /* @__PURE__ */ jsx28("div", { role: "group", "aria-label": "\u5F00\u5DE5 Agent", children: COLLAB_AGENTS.map((choice) => /* @__PURE__ */ jsx28(
        "button",
        {
          type: "button",
          "aria-label": choice.label,
          title: choice.label,
          "aria-pressed": agent === choice.id,
          onClick: () => setAgent(choice.id),
          children: /* @__PURE__ */ jsx28("span", { "aria-hidden": "true", children: /* @__PURE__ */ jsx28(AgentSprite, { agent: choice.id }) })
        },
        choice.id
      )) })
    ] }) : /* @__PURE__ */ jsx28(AgentPicker, { id: `start-${item.projectId}`, label: "\u5F00\u5DE5 Agent", value: agent, onChange: setAgent }),
    /* @__PURE__ */ jsxs26(Button, { secondary: true, disabled: blocked, onClick: open, children: [
      /* @__PURE__ */ jsx28(Play, { size: 16 }),
      label
    ] }),
    variant === "save" && dialog ? createPortal2(dialog, document.body) : dialog
  ] });
}

// src/ProjectBrief.jsx
import { Fragment as Fragment22, jsx as jsx29, jsxs as jsxs27 } from "react/jsx-runtime";
var since = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
var READ = {
  read: ["success", "\u5DF2\u8BFB"],
  changed: ["warning", "\u6709\u66F4\u65B0"],
  unread: ["muted", "\u672A\u8BFB"]
};
function useBrief(activeKey) {
  const [brief, setBrief] = useState26({ items: [], error: "", loaded: true });
  const run = useRef23(0);
  const load = useCallback4(async (refresh = false) => {
    const id = ++run.current;
    setBrief((prev) => ({ ...prev, error: "", loaded: false }));
    try {
      const result = await request("/project-brief/today", refresh ? { refresh: true } : {});
      if (id === run.current) setBrief({ ...result, error: "", loaded: true });
    } catch (e) {
      if (id === run.current) setBrief({ items: [], error: e.message || "\u8BFB\u53D6\u5931\u8D25", loaded: true });
    }
  }, []);
  useEffect20(() => {
    if (!activeKey) {
      run.current++;
      setBrief({ items: [], error: "", loaded: true });
    } else load();
  }, [activeKey, load]);
  return [brief, load, setBrief];
}
function BriefParagraph({ item, onRead, busy, adoptState, notify }) {
  const [tone, label] = READ[item.read] || READ.unread;
  return /* @__PURE__ */ jsxs27(
    "article",
    {
      className: `brief-item ${item.read === "read" ? "is-read" : ""}`,
      "aria-label": `\u9879\u76EE\u7B80\u62A5\uFF1A${item.name}`,
      children: [
        /* @__PURE__ */ jsxs27("header", { children: [
          /* @__PURE__ */ jsx29("h3", { children: item.name }),
          /* @__PURE__ */ jsx29(Badge, { tone, children: label })
        ] }),
        item.since && /* @__PURE__ */ jsxs27("small", { className: "brief-since", children: [
          "\u7EDF\u8BA1\u81EA ",
          since(item.since),
          " \u8D77"
        ] }),
        /* @__PURE__ */ jsxs27("div", { className: "brief-text", children: [
          /* @__PURE__ */ jsxs27("p", { children: [
            /* @__PURE__ */ jsx29("strong", { children: "\u6628\u5929\u5230\u4ECA\u5929\uFF1A" }),
            item.happened.join("\uFF1B"),
            "\u3002"
          ] }),
          /* @__PURE__ */ jsxs27("p", { children: [
            /* @__PURE__ */ jsx29("strong", { children: "\u4ECA\u5929\u7684\u552F\u4E00\u4E0B\u4E00\u6B65\uFF1A" }),
            item.next,
            "\u3002"
          ] }),
          /* @__PURE__ */ jsxs27("p", { children: [
            /* @__PURE__ */ jsx29("strong", { children: "\u5361\u70B9\uFF1A" }),
            item.blockers.length ? item.blockers.join("\uFF1B") : "\u672A\u53D1\u73B0",
            "\u3002"
          ] })
        ] }),
        /* @__PURE__ */ jsxs27("div", { className: "brief-actions", children: [
          /* @__PURE__ */ jsxs27(
            Button,
            {
              secondary: true,
              disabled: busy || item.read === "read",
              onClick: () => onRead([item]),
              children: [
                /* @__PURE__ */ jsx29(Check, { size: 16 }),
                item.read === "read" ? "\u5DF2\u8BFB" : "\u6807\u4E3A\u5DF2\u8BFB"
              ]
            }
          ),
          /* @__PURE__ */ jsx29(StartWork, { item, adoptState, notify, label: "\u4E00\u952E\u5F00\u5DE5" })
        ] })
      ]
    }
  );
}
function HomeBrief({ state, adoptState, notify, navigate }) {
  const active = (state.connections?.projects || []).filter((p) => p.active);
  const activeKey = active.map((p) => p.id).join(",");
  const [brief, load, setBrief] = useBrief(activeKey);
  const [busy, setBusy] = useState26(false);
  async function markRead(items) {
    setBusy(true);
    try {
      const next = await request("/project-brief/read", {
        date: brief.date,
        items: items.map((i) => ({ projectId: i.projectId, digest: i.digest }))
      });
      adoptState(next);
      const ids = new Set(items.map((i) => i.projectId));
      setBrief((prev) => ({
        ...prev,
        items: prev.items.map((i) => ids.has(i.projectId) ? { ...i, read: "read" } : i)
      }));
      notify(items.length > 1 ? "\u4ECA\u65E5\u7B80\u62A5\u5DF2\u5168\u90E8\u6807\u4E3A\u5DF2\u8BFB" : `\u5DF2\u8BFB\uFF1A${items[0].name}`);
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  const unread = brief.items.filter((i) => i.read !== "read");
  return /* @__PURE__ */ jsxs27("section", { className: "home-section home-brief", "aria-labelledby": "home-brief-title", children: [
    /* @__PURE__ */ jsxs27("div", { className: "v14-sh", children: [
      /* @__PURE__ */ jsx29("span", { className: "v14-idx", "aria-hidden": "true", children: "B" }),
      /* @__PURE__ */ jsx29("h2", { id: "home-brief-title", children: "\u4ECA\u65E5\u9879\u76EE\u7B80\u62A5" }),
      /* @__PURE__ */ jsx29("span", { className: "v14-sub", children: brief.date ? `\u7EDF\u8BA1\u533A\u95F4\uFF1A\u4ECE\u4E0A\u6B21\u6807\u4E3A\u5DF2\u8BFB\u8D77\uFF0C\u6CA1\u6807\u8FC7\u4ECE\u6628\u5929 0:00 \u8D77 \xB7 \u7531\u672C\u673A\u6570\u636E\u6309\u89C4\u5219\u751F\u6210\uFF0C\u4E0D\u8C03\u7528\u6A21\u578B` : "\u7531\u672C\u673A\u6570\u636E\u6309\u89C4\u5219\u751F\u6210\uFF0C\u4E0D\u8C03\u7528\u6A21\u578B" })
    ] }),
    !active.length ? /* @__PURE__ */ jsx29("p", { className: "recent-empty", children: "\u8FD8\u6CA1\u6709\u5728\u63A8\u8FDB\u9879\u76EE\u3002\u5728\u9879\u76EE\u7A7A\u95F4\u628A\u9879\u76EE\u6807\u4E3A\u201C\u5728\u63A8\u8FDB\u201D\uFF0C\u8FD9\u91CC\u6BCF\u5929\u7ED9\u51FA\u4E00\u6BB5\u7B80\u62A5\u3002" }) : /* @__PURE__ */ jsxs27(Fragment22, { children: [
      /* @__PURE__ */ jsxs27("div", { className: "brief-tools", children: [
        /* @__PURE__ */ jsxs27(Button, { secondary: true, disabled: !brief.loaded, onClick: () => load(true), children: [
          /* @__PURE__ */ jsx29(RefreshCw9, { size: 16, className: brief.loaded ? "" : "spinning" }),
          "\u5237\u65B0\u7B80\u62A5"
        ] }),
        /* @__PURE__ */ jsxs27(
          Button,
          {
            secondary: true,
            disabled: busy || !brief.loaded || !unread.length,
            onClick: () => markRead(unread),
            children: [
              /* @__PURE__ */ jsx29(Check, { size: 16 }),
              "\u5168\u90E8\u6807\u4E3A\u5DF2\u8BFB"
            ]
          }
        )
      ] }),
      brief.error && /* @__PURE__ */ jsxs27("p", { className: "inline-error", role: "alert", children: [
        "\u7B80\u62A5\u8BFB\u53D6\u5931\u8D25\uFF1A",
        brief.error
      ] }),
      !brief.loaded && !brief.items.length && /* @__PURE__ */ jsx29("p", { className: "recent-empty", role: "status", children: "\u6B63\u5728\u6C47\u603B\u5728\u63A8\u8FDB\u9879\u76EE\u7684 CURRENT\u3001Git \u4E0E GitHub\u2026" }),
      /* @__PURE__ */ jsx29("div", { className: "brief-list", children: brief.items.map((item) => /* @__PURE__ */ jsx29(
        BriefParagraph,
        {
          item,
          busy,
          onRead: markRead,
          adoptState,
          notify
        },
        item.projectId
      )) })
    ] }),
    /* @__PURE__ */ jsxs27("button", { className: "plan-link", onClick: () => navigate("projects"), children: [
      /* @__PURE__ */ jsx29("span", { children: "\u67E5\u770B\u9879\u76EE\u7A7A\u95F4" }),
      /* @__PURE__ */ jsx29(ArrowUpRight5, { size: 15 })
    ] })
  ] });
}

// src/Home.jsx
import { jsx as jsx30, jsxs as jsxs28 } from "react/jsx-runtime";
var REGION_HUE = { ASSETS: "255,138,36", TARGETS: "77,227,255", RUNTIME: "168,145,255", KNOWLEDGE: "166,227,110", LIFE: "255,143,184" };
var ICONS = {
  inbox: Inbox,
  assets: Layers2,
  references: ScanLine,
  history: GitBranch,
  agents: Bot,
  projects: Folder2,
  health: Stethoscope,
  collab: Handshake,
  calendar: CalendarDays,
  night: Moon,
  knowledge: BookOpen2,
  notes: PenLine5,
  aihot: Newspaper,
  learning: GraduationCap,
  silver: Gem,
  settings: Settings2
};
function homeFacts(state, zoneLatest) {
  const c = state.connections || {};
  const live = state.assets.filter((a) => !a.archived);
  const detected = (c.agents || []).filter((a) => a.status === "detected");
  return {
    // 焚决属于资产仓库（用户 2026-09-30 纠正），在这一行注明，不单列。
    assets: `${live.length} \u4EFD\u8D44\u4EA7 \xB7 \u542B\u711A\u51B3 ${(state.scrolls || []).filter((s) => !s.deletedAt).length} \u5377`,
    references: `${state.references.length} \u6761\u53C2\u8003`,
    history: `${state.assets.reduce((n, a) => n + a.versions.length, 0)} \u4E2A\u7248\u672C \xB7 ${state.assets.filter((a) => a.archived).length} \u4EFD\u5F52\u6863`,
    // 能力体检已并入智能体群（产品定义 v1.2 §2.2），在这一行注明，不单列。
    agents: `${c.agentScannedAt ? `\u5DF2\u68C0\u6D4B ${detected.length} \u4E2A` : "\u5C1A\u672A\u68C0\u6D4B"} \xB7 \u542B\u80FD\u529B\u4F53\u68C0`,
    projects: c.projectScannedAt ? `${(c.projects || []).length} \u4E2A\u9879\u76EE` : "\u5C1A\u672A\u626B\u63CF",
    health: "\u80FD\u529B\u4F53\u68C0 \xB7 \u5DF2\u5E76\u5165\u667A\u80FD\u4F53\u7FA4",
    collab: `\u770B\u677F \xB7 \u63A5\u529B\u53E3\u4EE4 \xB7 ${(state.collabLog || []).length} \u6761\u672C\u673A\u590D\u5236\u8BB0\u5F55`,
    calendar: "\u672C\u673A\u65E5\u5386\u4E0E\u63D0\u9192\u4E8B\u9879 \xB7 \u9700\u6388\u6743",
    night: "\u8BA1\u5212\u8349\u7A3F \xB7 \u672A\u542F\u7528",
    // 知识仓库的主要指标（切片 3.2）：“我的知识”本周新增或更新篇数，来自最近一次三区统计。
    knowledge: `${(c.knowledgeSources || []).length} \u4E2A\u77E5\u8BC6\u6E90 \xB7 ${(state.knowledgeTasks || []).length} \u4E2A\u4EFB\u52A1 \xB7 ${zoneLatest ? `\u6211\u7684\u77E5\u8BC6\u672C\u5468 +${zoneLatest.zones.mine.changedThisWeek}` : "\u4E09\u533A\u5C1A\u672A\u7EDF\u8BA1"}`,
    notes: `${state.notes.length} \u6761\u672C\u673A\u8349\u7A3F`,
    aihot: "\u7CBE\u9009 \xB7 \u70ED\u70B9 \xB7 \u65E5\u62A5 \xB7 \u672C\u673A\u7F13\u5B58",
    learning: `${(state.learning?.books || []).length} \u672C\u5DF2\u6807\u8BB0 \xB7 ${(state.learning?.links || []).filter((l) => !l.deletedAt).length} \u6761\u94FE\u63A5`,
    silver: silverSummary(state.silver),
    settings: state.model?.provider ? `\u6A21\u578B\u914D\u7F6E\uFF1A${state.model.provider} \xB7 \u51ED\u636E\u4E0E\u8FDE\u901A\u6027\u672A\u6838\u9A8C` : "\u6A21\u578B\u5C1A\u672A\u914D\u7F6E \xB7 \u8FDE\u63A5\u6D4B\u8BD5\u5728\u8BBE\u7F6E\u4E2D"
  };
}
function Home({ state, navigate, select, openCreate, ruleInstalls, projectStatus, agentContents, healthAudit, nightReports, vaultReceipts, adoptState, notify }) {
  const partner = partnerOf(state);
  const stageScreen = useRef24();
  const [dvView, setDvView] = useState27("egg"), [lit, setLit] = useState27(false);
  const live = state.assets.filter((a) => !a.archived);
  const [zoneSummary] = useZoneSummary();
  const f = homeFacts(state, zoneSummary.latest);
  const pending = pendingItems(state, ruleInstalls, projectStatus, mergeAgentHealth(healthAudit, agentContents), nightReports, vaultReceipts);
  useEffect21(() => {
    if (dvView === "number") stageScreen.current?.showNumber(pending.length);
  }, [dvView, pending.length]);
  const poke = () => {
    if (dvView !== "egg") {
      setDvView("egg");
      stageScreen.current?.showEgg();
    }
    stageScreen.current?.poke();
  };
  const recent = [...live].sort((a, b) => current(b).at.localeCompare(current(a).at)).slice(0, 5);
  const today = (/* @__PURE__ */ new Date()).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  });
  const actions = [
    [PenLine5, "\u8BB0\u4E00\u7B14", () => navigate("notes")],
    [Plus6, "\u65B0\u5EFA\u8D44\u4EA7", () => openCreate?.("Skill")],
    [Bot, "\u4E0A\u4E0B\u6587\u63A5\u529B", () => navigate("agents")]
  ];
  return /* @__PURE__ */ jsxs28("div", { className: "home today", children: [
    /* @__PURE__ */ jsxs28("section", { className: "home-hero today-hero", children: [
      /* @__PURE__ */ jsxs28("div", { className: "hero-copy", children: [
        /* @__PURE__ */ jsxs28("div", { className: "page-eyebrow", children: [
          /* @__PURE__ */ jsx30("span", { className: "page-code", children: "00" }),
          /* @__PURE__ */ jsx30("span", { children: "TODAY \xB7 \u4ECA\u65E5" })
        ] }),
        /* @__PURE__ */ jsxs28("h1", { children: [
          "\u4ECA\u65E5",
          /* @__PURE__ */ jsx30("em", { children: "\xB7" }),
          /* @__PURE__ */ jsx30("span", { className: "today-date", children: today })
        ] }),
        /* @__PURE__ */ jsx30("p", { className: "page-lead", children: page("home").lead }),
        /* @__PURE__ */ jsx30("div", { className: "hero-actions", children: actions.map(([Icon, label, run], i) => /* @__PURE__ */ jsxs28(
          "button",
          {
            className: `button ${i ? "secondary" : ""}`,
            onClick: run,
            children: [
              /* @__PURE__ */ jsx30(Icon, { size: 16 }),
              label
            ]
          },
          label
        )) }),
        /* @__PURE__ */ jsx30("div", { className: "partner-card", children: /* @__PURE__ */ jsxs28("div", { className: "partner-head", children: [
          /* @__PURE__ */ jsx30("small", { children: "PARTNER \xB7 \u4F19\u4F34" }),
          /* @__PURE__ */ jsxs28("strong", { children: [
            partner.name,
            /* @__PURE__ */ jsx30("span", { children: partner.stage })
          ] }),
          /* @__PURE__ */ jsxs28("p", { children: [
            "\u4F60\u7684\u6570\u7801\u86CB \xB7 \u5DF2\u6536\u5F55 ",
            partner.own,
            " \u4EFD\u4F60\u81EA\u5DF1\u7684\u8D44\u4EA7\u3002"
          ] })
        ] }) })
      ] }),
      /* @__PURE__ */ jsxs28("div", { className: "hero-stage", children: [
        /* @__PURE__ */ jsx30("span", { className: "hero-orbit a", "aria-hidden": "true" }),
        /* @__PURE__ */ jsx30("span", { className: "hero-orbit b", "aria-hidden": "true" }),
        /* @__PURE__ */ jsx30(CrestRing, {}),
        /* @__PURE__ */ jsxs28("div", { className: "dv-wrap", children: [
          /* @__PURE__ */ jsxs28(DigiviceArt, { size: 290, className: lit ? "lit" : "", children: [
            /* @__PURE__ */ jsx30(PartnerScreen, { ref: stageScreen, mode: "stage" }),
            dvView === "number" && /* @__PURE__ */ jsx30("span", { className: "dv-label", "aria-hidden": "true", children: "\u5F85\u5904\u7406" })
          ] }),
          /* @__PURE__ */ jsx30(
            "button",
            {
              type: "button",
              className: "digivice-poke",
              "aria-label": `\u6233\u4E00\u4E0B${partner.name}`,
              onClick: poke
            }
          ),
          /* @__PURE__ */ jsx30(
            "button",
            {
              type: "button",
              className: "dv-key a",
              "data-key": "A",
              "aria-label": dvView === "egg" ? `A \u952E\uFF1A\u663E\u793A\u5F85\u5904\u7406\u6761\u6570\uFF08${pending.length}\uFF09` : "A \u952E\uFF1A\u5207\u56DE\u6570\u7801\u86CB",
              "aria-pressed": dvView === "number",
              onClick: () => {
                const next = dvView === "egg" ? "number" : "egg";
                setDvView(next);
                if (next === "number") stageScreen.current?.showNumber(pending.length);
                else stageScreen.current?.showEgg();
              }
            }
          ),
          /* @__PURE__ */ jsx30(
            "button",
            {
              type: "button",
              className: "dv-key b",
              "data-key": "B",
              "aria-label": "B \u952E\uFF1A\u80CC\u5149",
              "aria-pressed": lit,
              onClick: () => setLit(!lit)
            }
          ),
          /* @__PURE__ */ jsx30(
            "button",
            {
              type: "button",
              className: "dv-key c",
              "data-key": "C",
              "aria-label": `C \u952E\uFF1A\u6233\u4E00\u4E0B${partner.name}`,
              onClick: poke
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs28("section", { className: "home-section home-alarm", "aria-labelledby": "home-pending-title", children: [
      /* @__PURE__ */ jsxs28("div", { className: "v14-sh", children: [
        /* @__PURE__ */ jsx30("span", { className: "v14-idx", "aria-hidden": "true", children: "A" }),
        /* @__PURE__ */ jsxs28("h2", { id: "home-pending-title", children: [
          page("inbox").label,
          " \xB7 ",
          pending.length
        ] }),
        /* @__PURE__ */ jsxs28("button", { className: "plan-link v14-end", onClick: () => navigate("inbox"), children: [
          /* @__PURE__ */ jsx30("span", { children: "\u67E5\u770B\u5168\u90E8\u5F85\u5904\u7406" }),
          /* @__PURE__ */ jsx30(ArrowUpRight6, { size: 15 })
        ] })
      ] }),
      /* @__PURE__ */ jsxs28("div", { className: "alarm m-screen", children: [
        /* @__PURE__ */ jsxs28("div", { className: "alarm-top", children: [
          /* @__PURE__ */ jsx30("span", { className: "alarm-lcd", "aria-hidden": "true", children: /* @__PURE__ */ jsx30(LcdCount, { value: pending.length, px: 7, label: null }) }),
          /* @__PURE__ */ jsxs28("span", { className: "alarm-copy", children: [
            /* @__PURE__ */ jsx30("b", { children: pending.length ? `${pending.length} \u4EF6\u4E8B\u7B49\u4F60` : "\u6CA1\u6709\u5F85\u5904\u7406" }),
            /* @__PURE__ */ jsx30("small", { children: triageSummary(pending).map((g) => `${g.count} \u4EF6${g.label}`).join(" \xB7 ") })
          ] })
        ] }),
        /* @__PURE__ */ jsxs28("div", { className: "today-pending", children: [
          !rulePendingReady(ruleInstalls) && !ruleInstalls?.error && /* @__PURE__ */ jsx30("p", { className: "recent-empty", role: "status", children: "\u89C4\u5219\u88C5\u5165\u8BB0\u5F55\u8FD8\u5728\u8BFB\u53D6\uFF0C\u8BFB\u5B8C\u524D\u4E0D\u80FD\u786E\u5B9A\u5F85\u5904\u7406\u662F\u5426\u5B8C\u6574\u3002" }),
          pending.length ? /* @__PURE__ */ jsx30(PendingList, { items: pending, navigate, select, limit: 5 }) : rulePendingReady(ruleInstalls) && /* @__PURE__ */ jsx30("p", { className: "recent-empty", children: "\u5DF2\u8BFB\u5B8C\u7684\u6765\u6E90\u91CC\u6CA1\u6709\u5F85\u5904\u7406\u4E8B\u9879\uFF1B\u80FD\u529B\u4F53\u68C0\u4E0E\u6668\u62A5\u6309\u672C\u673A\u56DE\u6267\u6C47\u603B\uFF0C\u5C1A\u672A\u8BFB\u53D6\u6216\u672A\u6267\u884C\u7684\u6765\u6E90\u4FDD\u6301\u672A\u77E5\u3002" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx30(HomeBrief, { state, adoptState, notify, navigate }),
    /* @__PURE__ */ jsxs28("div", { className: "home-row home-world", children: [
      /* @__PURE__ */ jsxs28("section", { className: "home-section structure-map", "aria-labelledby": "home-map-title", children: [
        /* @__PURE__ */ jsxs28("div", { className: "v14-sh", children: [
          /* @__PURE__ */ jsx30("span", { className: "v14-idx", "aria-hidden": "true", children: "C" }),
          /* @__PURE__ */ jsx30("h2", { id: "home-map-title", children: "\u4E16\u754C\u5730\u56FE" }),
          /* @__PURE__ */ jsx30("span", { className: "v14-sub", children: "\u60AC\u505C\u6216\u805A\u7126\u5730\u6807\u770B\u4E8B\u5B9E \xB7 \u8FF7\u96FE\u4E3A\u5C1A\u672A\u89E3\u9501" })
        ] }),
        /* @__PURE__ */ jsxs28("div", { className: "world m-screen", children: [
          /* @__PURE__ */ jsx30("div", { className: "world-zones", children: ZONES.filter((zone) => LAYERS.some((l) => l.zone === zone.id)).map((zone) => /* @__PURE__ */ jsxs28("h3", { className: `map-zone-title map-zone-${zone.id}`, children: [
            zone.label,
            /* @__PURE__ */ jsx30("small", { "aria-hidden": "true", children: zone.en })
          ] }, zone.id)) }),
          /* @__PURE__ */ jsx30("div", { className: "world-grid", children: LAYERS.map((layer) => /* @__PURE__ */ jsxs28("div", { className: `region region-${layer.en.toLowerCase()}`, style: { "--hue": REGION_HUE[layer.en] }, children: [
            /* @__PURE__ */ jsx30("span", { className: "rk", "aria-hidden": "true", children: layer.en }),
            /* @__PURE__ */ jsx30("span", { className: "rn", children: layer.id }),
            /* @__PURE__ */ jsx30("small", { className: "rq", children: layer.question }),
            /* @__PURE__ */ jsx30("div", { className: "pins", children: layer.pages.map((id) => {
              const p = page(id);
              const fog = p.maturity === "planned";
              return /* @__PURE__ */ jsxs28("button", { className: `manage-row pin${fog ? " fog" : ""}`, onClick: () => navigate(id), children: [
                /* @__PURE__ */ jsx30("i", { className: `pin-dot ${p.maturity || "ready"}`, "aria-hidden": "true" }),
                /* @__PURE__ */ jsxs28("span", { children: [
                  /* @__PURE__ */ jsx30("strong", { children: p.label }),
                  /* @__PURE__ */ jsxs28("small", { className: "pin-tip", children: [
                    f[id],
                    p.maturity ? ` \xB7 ${MATURITY[p.maturity]}` : ""
                  ] })
                ] })
              ] }, id);
            }) })
          ] }, layer.id)) }),
          /* @__PURE__ */ jsx30("div", { className: "system-rows", children: ["settings", "history"].map((id) => {
            const Icon = ICONS[id];
            return /* @__PURE__ */ jsxs28("button", { className: "manage-row system-row", onClick: () => navigate(id), children: [
              /* @__PURE__ */ jsx30(Icon, { size: 15, strokeWidth: 1.7 }),
              /* @__PURE__ */ jsxs28("span", { children: [
                /* @__PURE__ */ jsx30("strong", { children: page(id).label }),
                /* @__PURE__ */ jsxs28("small", { children: [
                  "\u7CFB\u7EDF \xB7 ",
                  f[id]
                ] })
              ] }),
              /* @__PURE__ */ jsx30(Maturity, { level: page(id).maturity })
            ] }, id);
          }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs28("section", { className: "home-section side", "aria-labelledby": "home-slots-title", children: [
        /* @__PURE__ */ jsxs28("div", { className: "v14-sh", children: [
          /* @__PURE__ */ jsx30("span", { className: "v14-idx", "aria-hidden": "true", children: "D" }),
          /* @__PURE__ */ jsx30("h2", { id: "home-slots-title", children: "\u5B58\u6863\u69FD" }),
          /* @__PURE__ */ jsx30("span", { className: "v14-sub", children: "\u6700\u8FD1\u8FED\u4EE3 \xB7 \u6309\u6700\u540E\u4FDD\u5B58\u65F6\u95F4" })
        ] }),
        /* @__PURE__ */ jsxs28("div", { className: "recent-list saves m-panel", children: [
          recent.map((a, i) => {
            const v = current(a);
            return /* @__PURE__ */ jsxs28("button", { className: `recent saveslot type-${a.type}`, onClick: () => select(a.id), children: [
              /* @__PURE__ */ jsxs28("span", { className: "slot-no", "aria-hidden": "true", children: [
                "SLOT ",
                String(i + 1).padStart(2, "0")
              ] }),
              /* @__PURE__ */ jsx30("span", { className: "recent-glyph", children: /* @__PURE__ */ jsx30(Pixel, { sprite: glyphOf(a), size: 22 }) }),
              /* @__PURE__ */ jsxs28("span", { className: "recent-main", children: [
                /* @__PURE__ */ jsx30("strong", { children: v.title }),
                /* @__PURE__ */ jsxs28("small", { children: [
                  /* @__PURE__ */ jsx30(TypeIcon, { type: a.type, size: 12 }),
                  typeLabel[a.type],
                  " \xB7 v",
                  a.versions.length,
                  ".0 \xB7",
                  " ",
                  new Date(v.at).toLocaleDateString("zh-CN")
                ] })
              ] }),
              /* @__PURE__ */ jsx30(StageBar, { stage: stageOf(a, state.assetActivity), label: false })
            ] }, a.id);
          }),
          !recent.length && /* @__PURE__ */ jsx30("p", { className: "recent-empty", children: "\u8FD8\u6CA1\u6709\u8D44\u4EA7\u3002\u53BB\u8D44\u4EA7\u4ED3\u5E93\u6536\u5F55\u7B2C\u4E00\u4EFD\u5427\u3002" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx30(HomeHot, { navigate })
  ] });
}
function silverSummary(silver) {
  if (!silver) return "\u8FD8\u6CA1\u6709\u6536\u5F55";
  const live = (list) => list.filter((r2) => !r2.deletedAt);
  const categories = live(silver.categories);
  const ids = new Set(categories.map((c) => c.id));
  const target = categories.reduce((n, c) => n + c.target, 0);
  const filled = live(silver.items).filter((i) => ids.has(i.categoryId)).length;
  return `${live(silver.wall).length} \u5F20\u6B23\u8D4F\u56FE \xB7 \u5DF2\u586B ${filled}/${target} \u683C`;
}

// docs/design/ui-v15/build/kit-entry.jsx
import * as L from "lucide-react";
var h = React31.createElement;
var noop = () => {
};
var common = { save: noop, adoptState: noop, notify: noop, openCreate: noop, select: noop, onFilter: noop, onSelect: noop, onClose: noop, onEdit: noop, navigate: noop, openScroll: noop };
var safe = (f) => {
  try {
    return f();
  } catch (e) {
    return `<!-- \u6E32\u67D3\u5931\u8D25\uFF1A${String(e.message).replace(/--/g, "")} -->`;
  }
};
function kit() {
  const state = seed();
  const out = { headings: {}, covers: {}, sprites: {}, agents: {}, stages: [], lcd: {}, icons: {} };
  out.assetsPage = safe(() => R(h(Assets, { ...common, state })));
  out.homePage = safe(() => R(h(Home, { ...common, state, ruleInstalls: [], projectStatus: {}, agentContents: {}, healthAudit: null, nightReports: null, vaultReceipts: null })));
  for (const id of ["home", "inbox", "assets", "references", "agents", "projects", "collab", "knowledge", "calendar", "notes", "aihot", "settings", "history"])
    out.headings[id] = safe(() => R(h(PageHeading, { page: id })));
  for (const type of ["Skill", "Prompt", "Workflow", "Rule", "Scroll"])
    for (const uses of [0, 3, 12]) out.covers[`${type}-${uses}`] = safe(() => R(h(Cover, { type, serial: uses + 1, version: 2, uses })));
  out.coverLarge = safe(() => R(h(Cover, { type: "Skill", serial: 1, version: 3, uses: 12, large: true, stage: 2 })));
  for (const key of Object.keys(SPRITES)) for (const size of [32, 64, 120]) out.sprites[`${key}-${size}`] = safe(() => R(h(Pixel, { sprite: key, size })));
  out.digivice = safe(() => R(h(DigiviceArt, { size: 240 }, h(Pixel, { sprite: "egg", size: 56 }))));
  out.crest = safe(() => R(h(CrestRing)));
  for (const a of AGENT_CAST) for (const mode of ["head", "dossier", "full"]) out.agents[`${a.id}-${mode}`] = safe(() => R(h(AgentSprite, { agent: a.id, mode })));
  for (let s = 0; s < 5; s++) out.stages.push(safe(() => R(h(StageBar, { stage: s }))));
  for (const t of ["SKILL", "PLUGIN", "BROKEN", "UNREAD", "INBOX", "TODAY", "0", "3", "12", "42", "ZONE MONITOR", "SLOT 01"]) out.lcd[t] = safe(() => R(h(LcdText, { text: t, px: 3 })));
  for (const type of ["Skill", "Prompt", "Workflow", "Rule", "Scroll"]) out.icons[type] = safe(() => R(h(TypeIcon, { type, size: 14 })));
  out.maturity = { ready: R(h(Maturity, { level: "ready" })), partial: R(h(Maturity, { level: "partial" })) };
  out.corners = R(h(Corners));
  return out;
}
var r = {
  lcd: (text, px = 3, cls = "") => R(h(LcdText, { text: String(text), px, className: cls })),
  pixel: (sprite, size = 48, extra = {}) => R(h(Pixel, { sprite, size, ...extra })),
  cover: (props) => R(h(Cover, props)),
  agent: (id, mode = "head", className = "") => R(h(AgentSprite, { agent: id, mode, className })),
  stage: (n) => R(h(StageBar, { stage: n })),
  icon: (type, size = 14) => R(h(TypeIcon, { type, size })),
  maturity: (level) => R(h(Maturity, { level })),
  heading: (page2, over = {}) => R(h(PageHeading, { page: page2, ...over })),
  digivice: (sprite = "egg", size = 240, inner = 56) => R(h(DigiviceArt, { size }, h(Pixel, { sprite, size: inner }))),
  digiviceAgent: (id, size = 200) => R(h(DigiviceArt, { size }, h(AgentSprite, { agent: id, mode: "head" }))),
  digiviceLcd: (text, size = 200) => R(h(DigiviceArt, { size }, h(LcdText, { text, px: 5 }))),
  crest: () => R(h(CrestRing)),
  corners: () => R(h(Corners)),
  assets: () => R(h(Assets, { ...common, state: seed() })),
  spriteKeys: () => Object.keys(SPRITES),
  ic: (name, size = 16) => L[name] ? R(h(L[name], { size, strokeWidth: 1.8 })) : `<!-- \u65E0\u56FE\u6807 ${name} -->`
};
export {
  kit,
  r
};

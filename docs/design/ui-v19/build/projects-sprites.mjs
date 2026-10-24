// 项目空间二、三用的像素图：直接用现版 src/pixel.jsx + src/characters.js 渲染（与正式页同一份数据），写进 build/projects-sprites.json。
// 用法（项目根目录）：node docs/design/ui-v19/build/projects-sprites.mjs
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const here = import.meta.dirname, root = path.resolve(here, "../../../..");
const entry = `
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Pixel, SPRITES } from "./src/pixel.jsx";
import { CHARACTERS, AGENT_CAST } from "./src/characters.js";
import { AgentSprite } from "./src/v14.jsx";
const out = { agents: [], egg: renderToStaticMarkup(<Pixel sprite="egg" scale={1} />), scroll: renderToStaticMarkup(<Pixel sprite="Prompt" scale={1} />) };
for (const a of AGENT_CAST) {
  const c = CHARACTERS[a.character];
  out.agents.push({ id: a.id, name: a.name, character: c.name, hue: a.hue,
    head: renderToStaticMarkup(<AgentSprite agent={a.id} mode="head" />),
    full: renderToStaticMarkup(<Pixel sprite={c.sprite} scale={1} />),
    frames: SPRITES[c.sprite].frames.length });
}
process.stdout.write(JSON.stringify(out));
`;
const r = await build({ stdin: { contents: entry, resolveDir: root, loader: "jsx" }, bundle: true, platform: "node", format: "cjs", write: false, jsx: "automatic", logLevel: "error", loader: { ".css": "empty", ".svg": "text", ".png": "empty" } });
const file = path.join(here, ".sprites-tmp.cjs");
fs.writeFileSync(file, r.outputFiles[0].text);
const { execFileSync } = await import("node:child_process");
const json = execFileSync(process.execPath, [file], { cwd: root, maxBuffer: 1 << 26 }).toString();
fs.unlinkSync(file);
fs.writeFileSync(path.join(here, "projects-sprites.json"), json);
const d = JSON.parse(json);
console.log("已写 projects-sprites.json：", d.agents.map((a) => `${a.character}(${a.frames} 帧)`).join("、"));

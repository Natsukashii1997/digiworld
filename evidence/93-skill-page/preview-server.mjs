// #93 第二批实测用：临时目录 + 合成数据起一个工作台，不碰正式 5178 数据目录、不读真实 Vault。
// 仓库是公开的：默认用合成 my-skills（临时 home + 假 git 记录 + 假调用记录），截图可入库；
// REAL_MY_SKILLS=1 时改为只读本机真实 my-skills 与调用记录，只供本机看效果，截图不入库。
// 用法：npm run build && PORT=5194 node evidence/93-skill-page/preview-server.mjs
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../../server/http.mjs";
import { seed, makeAsset } from "../../src/store.js";

const DAY = 864e5;
const now = Date.now();
const iso = (daysAgo) => new Date(now - daysAgo * DAY).toISOString();
const day = (daysAgo) => iso(daysAgo).slice(0, 10);

// 合成 my-skills：名字、说明都是虚构的。
const SKILLS = [
  ["decision-review", "「决策评审」：方案成形、准备大量实施前，先找最强反方，逐条核对假设与证据，再决定是否继续。", "1.1.0", ["claude"], 40, 2],
  ["ui-palette", "「界面风格库」：做给人看的网页时先选风格，再按令牌、字体和组件照做；共 8 种定稿风格。", "2.0.0", ["claude", "agents"], 12, 1],
  ["weekly-retro", "「周复盘」：读一周的随手记与提交记录，整理成可复用的经验笔记，沉淀进知识库。", null, ["claude", "agents"], 3, 3],
  ["deploy-checklist", "「发布清单」：上线前逐项核对构建、测试、回滚方案与定时任务，体检本机常驻服务。", null, ["codex"], 25, 25],
  ["growth-interview", "「业务访谈」：推进一线业务落地前，先设计访谈提纲，再把访谈翻译成技术方案与执行规范。", "1.0.0", ["claude", "codex"], 9, 9],
  ["pixel-poster", "「像素海报」：16 色像素风海报的配色、排版与交付尺寸说明。", "0.3.0", ["agents"], 30, 30],
  ["misc-helper", "一个没有关键词的小工具。", null, ["claude"], 50, 50],
];

async function fakeHome() {
  const home = await realpath(await mkdtemp(join(tmpdir(), "digiworld-93b-home-")));
  const root = join(home, "Documents", "ChatGPT", "个人", "work", "my-skills");
  const links = ["# 合成登记清单"];
  for (const [name, description, version, targets] of SKILLS) {
    await mkdir(join(root, "skills", name), { recursive: true });
    await writeFile(join(root, "skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${description}\n${version ? `metadata:\n  version: "${version}"\n` : ""}---\n`);
    for (const t of targets) links.push(`${name}\t~/.${t}/skills`);
  }
  await writeFile(join(root, "links.tsv"), links.join("\n") + "\n");
  const kit = join(home, "Library", "Application Support", "agent-kit");
  await mkdir(kit, { recursive: true });
  const usage = [];
  const use = (skill, daysAgo) => usage.push(JSON.stringify({ time: iso(daysAgo), session: randomUUID(), cwd: "/synthetic", skill }));
  for (let i = 0; i < 9; i++) use("decision-review", i + 1);
  for (let i = 0; i < 2; i++) use("ui-palette", i + 2);
  use("weekly-retro", 1);
  use("other-skill", 12);
  await writeFile(join(kit, "skill-usage.jsonl"), usage.join("\n") + "\n");
  // 假 git 记录：新的在前，与 git log --date=short --format=@%ad --name-status -- skills 同格式。
  const commits = [];
  for (const [name, , , , firstDays, lastDays] of SKILLS) {
    commits.push([lastDays, `M\tskills/${name}/SKILL.md`], [firstDays, `A\tskills/${name}/SKILL.md`]);
  }
  const log = commits.sort((a, b) => a[0] - b[0]).map(([d, line]) => `@${day(d)}\n${line}\n`).join("\n");
  return { home, git: async () => log };
}

function prompt(title, content, daysAgo) {
  const a = makeAsset({ type: "Prompt", title, description: "", content, tags: [], source: "个人创建", files: [] });
  a.createdAt = a.versions[0].at = iso(daysAgo);
  return a;
}

const mySkills = process.env.REAL_MY_SKILLS === "1" ? { home: homedir() } : await fakeHome();
const directory = await realpath(await mkdtemp(join(tmpdir(), "digiworld-93b-")));
const app = await startServer({ directory, port: Number(process.env.PORT || 0), staticRoot: join(import.meta.dirname, "../../dist"), discovery: { mySkills } });
await app.repository.write({
  ...seed(),
  assets: [prompt("第一性原理拆问题", "先复述问题，列出隐含假设，逐条追问。", 3), prompt("代码交接 Handoff", "目标、已完成、剩余步骤、相关文件。", 10)],
  skillMeta: { "pixel-poster": { category: "design", pinned: true } },
}, { initialize: true });
console.log(`READY ${app.url} data=${directory} my-skills=${mySkills.home === homedir() ? "真实（只读）" : "合成"}`);

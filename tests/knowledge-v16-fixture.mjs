import { mkdtemp, realpath, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startServer } from "../server/http.mjs";
import { parse, stringify } from "../src/serialization.js";
import { seed } from "../src/store.js";
import { createKnowledgeFiles } from "../server/knowledge-files.mjs";
export const profile193 = "# 关于我\n\n## 角色\n合成测试角色。\n\n## 沟通\n结论先行。\n";
export async function knowledge193Fixture({ empty = false, mcp = true, staticRoot = process.env.WORKBENCH_TEST_STATIC_ROOT || join(import.meta.dirname, "../dist"), feishuKnowledge } = {}) {
  const base = await realpath(await mkdtemp(join(tmpdir(), "guiji-knowledge193-")));
  const roots = ["我的 Vault", "研究资料", "本机笔记"].map((n) => join(base, "sources", n));
  for (const root of roots) await mkdir(join(root, "方法"), { recursive: true });
  await mkdir(join(roots[0], "个人上下文"));
  await mkdir(join(roots[0], "排除"));
  await writeFile(join(roots[0], "个人上下文/关于我.md"), profile193);
  await writeFile(join(roots[0], "排除/私密.md"), "# 排除内容\n接力 私密合成\n");
  for (const [i, root] of roots.entries()) await writeFile(join(root, "方法/接力提示词.md"), `# 接力提示词${i}\n交接时提示词带上 CURRENT 与接力规则。\n<script>window.knowledgeExecuted=true</script>\n`);
  const app = await startServer({ directory: join(base, "database"), port: 0, ...(mcp ? { mcpPort: 0 } : {}), ...(staticRoot ? { staticRoot } : {}), discovery: { defaultRoots: () => [], knowledgeFiles: createKnowledgeFiles(), ...(feishuKnowledge ? { feishuKnowledge } : {}), detectAgents: async () => ({ items: [], at: new Date().toISOString() }) } });
  const session = await (await fetch(app.url + "/api/session", { headers: { "x-workbench-client": "1" } })).json();
  const headers = { "content-type": "application/json", "x-workbench-token": session.token };
  async function call(path, body, method = body === undefined ? "GET" : "POST") {
    const response = await fetch(app.url + "/api" + path, { method, headers, ...(body === undefined ? {} : { body: stringify(body) }) });
    return { status: response.status, body: parse(await response.text()) };
  }
  const initial = seed(); initial.notes = []; initial.projects = [];
  const initialized = await call("/workspace", { state: initial, initialize: true }, "PUT");
  if(initialized.status !== 200) throw new Error(JSON.stringify(initialized));
  if (!empty) for (const [i, root] of roots.entries()) {
    const state = (await call("/workspace")).body;
    const result = await call("/knowledge/connect", { name: ["我的 Vault", "研究资料", "本机笔记"][i], kind: i === 0 ? "obsidian" : "markdown", root, confirmed: true, expectedRevision: state.revision });
    if (result.status !== 200) throw new Error(JSON.stringify(result));
  }
  return { base, roots, repository: app.repository, url: app.url, mcpUrl: app.mcpUrl, call, workspace: async () => (await call("/workspace")).body, original: () => readFile(join(roots[0], "个人上下文/关于我.md"), "utf8"), close: async () => { await app.close(); await rm(base, { recursive: true, force: true }); } };
}

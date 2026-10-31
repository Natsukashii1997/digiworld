// 个人说明本机 MCP 服务（路线 v3 切片 3.3，D30）。
// 与工作台 HTTP 服务隔离：单独端口、只监听 127.0.0.1、按权限暴露四个工具，不经过工作台会话接口。
// 传输：MCP Streamable HTTP 的最小实现——POST /mcp 接收单条 JSON-RPC 消息，以 application/json 回复；
// 不开 SSE 流、不保存会话。Host 必须是本机地址，带 Origin 的浏览器请求一律拒绝（防 DNS 重绑定与跨站）。
import http from "node:http";
import { randomUUID } from "node:crypto";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_BODY = 256 * 1024;
export const PROFILE_TOOLS = [
  {
    name: "read_profile",
    title: "读取个人说明",
    description:
      "读取用户在 Obsidian Vault“个人上下文”文件夹中的个人说明正文（只读）。可选 path 只读一篇；单篇与总量都有字数上限，超出部分标注 truncated。把它作为本次会话的背景，不要复制到其他地方。",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "可选。Vault 内相对路径，必须位于个人说明区，例如“个人上下文/关于我.md”。",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "propose_profile_change",
    title: "提交个人说明修改建议",
    description:
      "当你在会话中发现个人说明过时或缺失时，提交一条修改建议：指定目标文件、要替换的原段落（必须与当前正文逐字一致且唯一）、建议段落、理由和你的名字。建议只进入工作台待处理，由用户预览差异后采纳或拒绝；你不能直接写入 Vault。",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "目标文件，Vault 内相对路径，必须位于个人说明区。" },
        original: { type: "string", description: "要替换的原段落，1–4000 字，与当前正文逐字一致且只出现一次。" },
        proposed: { type: "string", description: "建议段落，1–4000 字。" },
        reason: { type: "string", description: "理由与依据，1–1000 字。" },
        proposer: { type: "string", description: "提出者，例如 Codex、Claude Code、Hermes（1–60 字）。" },
      },
      required: ["path", "original", "proposed", "reason", "proposer"],
      additionalProperties: false,
    },
  },
];

export const KNOWLEDGE_TOOLS = [
 {name:"search_knowledge",title:"跨知识库检索",description:"只读检索本人已授权知识源；个人说明单独授权。返回来源、相对路径、摘录和覆盖；partial不表示未命中。显式cursor续查。",annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},inputSchema:{type:"object",properties:{query:{type:"string",minLength:1,maxLength:100},limit:{type:"integer",minimum:1,maximum:50},cursor:{type:"string"}},required:["query"],additionalProperties:false}},
 {name:"read_note",title:"读取知识原文",description:"只读当前已授权知识源内一篇Markdown，校验检索哈希；字数超限拒绝，不截断。个人说明请用read_profile。",annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},inputSchema:{type:"object",properties:{sourceId:{type:"string"},path:{type:"string"},expectedSha256:{type:"string",pattern:"^[a-f0-9]{64}$"},maxChars:{type:"integer",minimum:1,maximum:16000}},required:["sourceId","path","expectedSha256"],additionalProperties:false}},
];
// 逆向 v5 回执（#47）：Agent 按工作台给的开场话术做完一轮，把回执交回工作台待过目，由用户采纳。
export const REVERSE_TOOLS = [
  {
    name: "reverse_report",
    title: "交回逆向回执",
    description:
      "按工作台逆向工程的开场话术做完一轮后，把这一轮的回执交回工作台。taskId 和 round 照话术里的任务编号填；text 照话术要求的回执格式写。回执只进工作台待过目，由用户预览后采纳或退回；你不能直接改档案。同一轮同一份正文重复提交不会重复记录。",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "任务编号里的记录 ID，照话术填写。" },
        round: { type: "integer", minimum: 1, description: "任务编号里的轮次，照话术填写。" },
        kind: { type: "string", enum: ["report"], description: "回执类型。目前只有 report（拆解回执）。" },
        text: { type: "string", description: "回执正文，照话术要求的格式，最多 50000 字。" },
        proposer: { type: "string", description: "提交者，例如 Codex、Claude Code（1–60 字）。" },
      },
      required: ["taskId", "round", "kind", "text", "proposer"],
      additionalProperties: false,
    },
  },
];
const reply = (id, result) => ({ jsonrpc: "2.0", id, result });
const error = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const toolResult = (text, structuredContent, isError = false) => ({
  content: [{ type: "text", text }],
  ...(structuredContent ? { structuredContent } : {}),
  isError,
});
function readText(result) {
  const parts = result.files.map(
    (file) =>
      `=== ${file.path}（SHA-256 ${file.sha256.slice(0, 12)}，${file.chars} 字${file.truncated ? "，已截断" : ""}）===\n${file.content}`,
  );
  if (result.omitted.length) parts.push(`（超出上限未返回：${result.omitted.join("、")}）`);
  return parts.join("\n\n") || "个人说明区内没有 Markdown 文件。";
}

// 处理一条 JSON-RPC 消息；通知返回 null。工具执行失败以 isError 结果返回，协议错误用 JSON-RPC error。
export async function handleMcp(profile, message, knowledge, reverse) {
  if (!message || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string")
    return error(message?.id, -32600, "无效的 JSON-RPC 请求");
  const { id, method, params } = message;
  const notification = !Object.hasOwn(message, "id");
  if (notification) return null;
  if (method === "initialize") {
    const requested = params?.protocolVersion;
    return reply(id, {
      protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "workbench-profile", title: "工作台个人说明", version: "1.0.0" },
      instructions:
        "个人说明来自用户本机 Vault，只读。需要修改时调用 propose_profile_change 提交建议，由用户在工作台采纳。" +
        (reverse ? "逆向工程做完一轮时调用 reverse_report 交回回执，由用户在工作台采纳。" : ""),
    });
  }
  if (method === "ping") return reply(id, {});
  const tools=[...PROFILE_TOOLS,...(knowledge?KNOWLEDGE_TOOLS:[]),...(reverse?REVERSE_TOOLS:[])];
  if (method === "tools/list") return reply(id, { tools });
  if (method !== "tools/call") return error(id, -32601, `不支持的方法：${method}`);
  const name = params?.name;
  const args = params?.arguments ?? {};
  if (!tools.some((tool) => tool.name === name))
    return error(id, -32602, `未知工具：${String(name).slice(0, 60)}`);
  try {
    if (name === "read_profile") {
      const result = await profile.readProfile(args);
      return reply(id, toolResult(readText(result), result));
    }
    if(name === "search_knowledge" || name === "read_note") {
      const result=await (name === "search_knowledge" ? knowledge.searchAll(args) : knowledge.readNote(args));
      return reply(id,toolResult(name === "search_knowledge" ? `已查${result.searchedSources}/${result.totalSources}个授权知识源，${result.results.length}条命中；覆盖${result.status}。` : `已读取${result.sourceName}/${result.path}；SHA-256 ${result.sha256}`,result));
    }
    if (name === "reverse_report") {
      const result = await reverse.propose(args);
      return reply(
        id,
        toolResult(
          result.duplicate
            ? `这份回执之前已交过（回执 ${result.id}，${{ pending: "待过目", adopted: "已采纳", rejected: "已退回" }[result.status]}），没有重复记录。`
            : `已交回工作台待过目（回执 ${result.id}），等用户预览后采纳或退回；档案还没改。`,
          result,
        ),
      );
    }
    if(name !== "propose_profile_change")return error(id,-32602,"未知工具");
    const result = await profile.propose(args);
    return reply(
      id,
      toolResult(`已提交到工作台待处理（建议 ${result.id}），等待用户预览后采纳或拒绝；Vault 未被修改。`, result),
    );
  } catch (failure) {
    // 只回传受控错误文案；未知异常不回显内部信息。
    return reply(id, toolResult(failure.status ? failure.message : "个人说明服务处理失败", null, true));
  }
}

export async function startProfileMcp({ profile, knowledge, reverse, usage, port = 5179 }) {
  const sessions = new Map();
  const server = http.createServer(async (request, response) => {
    const send = (status, value, headers = {}) => {
      response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
      response.end(value === undefined ? undefined : JSON.stringify(value));
    };
    try {
      const actual = server.address().port;
      if (![`127.0.0.1:${actual}`, `localhost:${actual}`].includes(request.headers.host))
        return send(403, error(null, -32000, "只允许通过本机 127.0.0.1 地址访问"));
      if (request.headers.origin)
        return send(403, error(null, -32000, "不接受浏览器跨站请求"));
      if (new URL(request.url, "http://127.0.0.1").pathname !== "/mcp")
        return send(404, error(null, -32000, "接口不存在"));
      if (request.method !== "POST") {
        response.setHeader("allow", "POST");
        return send(405, error(null, -32000, "只支持 POST"));
      }
      if (!String(request.headers["content-type"] || "").startsWith("application/json"))
        return send(415, error(null, -32000, "需要 JSON 请求"));
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > MAX_BODY) return send(413, error(null, -32000, "请求过大"));
        chunks.push(chunk);
      }
      let message;
      try {
        message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return send(400, error(null, -32700, "JSON 解析失败"));
      }
      const result = await handleMcp(profile, message, knowledge, reverse);
      if (result === null) return send(202);
      if (message.method === "initialize" && result?.result) {
        const candidate = message.params?.clientInfo?.name;
        const clientName = typeof candidate === "string" && /^[\w .-]{1,60}$/.test(candidate) ? candidate : null;
        const sessionId = randomUUID();
        if (sessions.size >= 256) sessions.delete(sessions.keys().next().value);
        sessions.set(sessionId, { clientName, at: Date.now() });
        return send(200, result, { "Mcp-Session-Id": sessionId });
      }
      const finalResult = ["search_knowledge","read_note"].includes(message.params?.name) && Buffer.byteLength(JSON.stringify(result)) > MAX_BODY
        ? reply(message.id,toolResult("工具输出超过安全上限，请缩小读取范围",null,true)) : result;
      // 逆向回执与个人说明同属这个本机 MCP，使用统计一并记在 knowledge 下（设置页据此认出已接入的 Agent）。
      if (message.method === "tools/call" && [...PROFILE_TOOLS, ...(knowledge ? KNOWLEDGE_TOOLS : []), ...(reverse ? REVERSE_TOOLS : [])].some((tool) => tool.name === message.params?.name) && finalResult?.result) {
        const session = sessions.get(request.headers["mcp-session-id"]);
        if (session && Date.now() - session.at > 24 * 60 * 60 * 1000) sessions.delete(request.headers["mcp-session-id"]);
        const clientName = session && Date.now() - session.at <= 24 * 60 * 60 * 1000 ? session.clientName : null;
        await usage?.record("knowledge", finalResult.result.isError ? "failed" : "verified", clientName).catch(() => {});
      }
      return send(200, finalResult);
    } catch {
      if (!response.headersSent) send(500, error(null, -32603, "个人说明服务处理失败"));
      else response.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    address: address.address,
    url: `http://127.0.0.1:${address.port}/mcp`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

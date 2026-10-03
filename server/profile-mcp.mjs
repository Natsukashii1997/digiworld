// 个人说明本机 MCP 服务（路线 v3 切片 3.3，D30）。
// 与工作台 HTTP 服务隔离：单独端口、只监听 127.0.0.1、只暴露两个工具，不经过工作台会话接口。
// 传输：MCP Streamable HTTP 的最小实现——POST /mcp 接收单条 JSON-RPC 消息，以 application/json 回复；
// 不开 SSE 流、不保存会话。Host 必须是本机地址，带 Origin 的浏览器请求一律拒绝（防 DNS 重绑定与跨站）。
import http from "node:http";

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
export async function handleMcp(profile, message) {
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
        "个人说明来自用户本机 Vault，只读。需要修改时调用 propose_profile_change 提交建议，由用户在工作台采纳。",
    });
  }
  if (method === "ping") return reply(id, {});
  if (method === "tools/list") return reply(id, { tools: PROFILE_TOOLS });
  if (method !== "tools/call") return error(id, -32601, `不支持的方法：${method}`);
  const name = params?.name;
  const args = params?.arguments ?? {};
  if (!PROFILE_TOOLS.some((tool) => tool.name === name))
    return error(id, -32602, `未知工具：${String(name).slice(0, 60)}`);
  try {
    if (name === "read_profile") {
      const result = await profile.readProfile(args);
      return reply(id, toolResult(readText(result), result));
    }
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

export async function startProfileMcp({ profile, port = 5179 }) {
  const server = http.createServer(async (request, response) => {
    const send = (status, value) => {
      response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
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
      const result = await handleMcp(profile, message);
      if (result === null) return send(202);
      return send(200, result);
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

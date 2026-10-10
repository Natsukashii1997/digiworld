// 接力提示词只由规则生成；同一字符串同时供预览与复制，不调用模型。
import { redactSecrets } from "./collab.js";
export const REDACTED = "[已隐去]";
export function filterRelayText(value) {
  let count = 0;
  const text = String(value ?? "")
    .replace(/\x00/g, "")
    .replace(
      /-----BEGIN ([A-Z ]*PRIVATE KEY(?: BLOCK)?)-----[\s\S]*?(?:-----END \1-----|$)/g,
      () => {
        count++;
        return REDACTED;
      },
    );
  const blocks = text.replace(
    /["']?(?:api[_ -]?key|secret|password|passwd|token|access[_ -]?key|密钥|密码)["']?\s*[:=：]\s*[|>][+-]?[^\r\n]*(?:\r?\n(?:[ \t]+[^\r\n]*|[ \t]*(?=\r?\n|$)))+/gi,
    () => {
      count++;
      return REDACTED;
    },
  );
  const guarded = blocks.replace(
    /[\"']?(?:api[_ -]?key|secret|password|passwd|token|access[_ -]?key|密钥|密码)[\"']?\s*[:=：]\s*(?:\r?\n\s*)?[\"']?[^\r\n]+/gi,
    () => {
      count++;
      return REDACTED;
    },
  );
  const clean = guarded
    .split("\n")
    .map((line) => {
      if (
        redactSecrets(line) !== line ||
        /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]+|https?:\/\/[^\s/]+:[^\s@]+@|[?&](?:sig|signature|access_token|token|api_key)=[^\s&]+/i.test(
          line,
        )
      ) {
        count++;
        return REDACTED;
      }
      return line;
    })
    .join("\n");
  return { text: clean, count };
}
export function buildRelayPrompt({
  title,
  agentName,
  project,
  updatedAt,
  messages = [],
  next = "",
  rounds = 8,
}) {
  let redactions = 0;
  const safe = (value) => {
    const r = filterRelayText(value);
    redactions += r.count;
    return r.text;
  };
  const one = (value) =>
    safe(value)
      .replace(/[\r\n]/g, " ")
      .slice(0, 300);
  const n = Math.max(1, Math.min(8, Number(rounds) || 8));
  let selected = messages;
  const starts = messages
    .map((m, i) => (m.role === "user" ? i : -1))
    .filter((i) => i >= 0);
  if (starts.length > n) selected = messages.slice(starts.at(-n));
  const agent = one(agentName);
  const footer = "\n\n请先核对项目 CURRENT.md 与最新交接，再继续。";
  const head = `# 上下文接力 · ${one(title)}\n\n来源：${agent} · ${one(project) || "未记录项目目录"} · ${one(updatedAt)}${next ? "\n项目唯一下一步：" + one(next) : ""}\n\n## 最后 ${n} 轮（原话）\n`;
  const budget = 6000 - head.length - footer.length;
  const rendered = selected.map((m) => ({
    role: m.role,
    prefix: `${m.role === "user" ? "用户" : agent}：`,
    text: safe(m.text),
  }));
  // 极端多消息时从末尾保留可容纳的消息，并明确标出省略；不截掉最后一轮。
  let omitted = 0,
    reserved = rendered.reduce((sum, m) => sum + m.prefix.length + 66, 0);
  while (rendered.length > 1 && reserved > budget - 80) {
    let index = rendered.findIndex(
      (m, i) => m.role !== "user" && i < rendered.length - 1,
    );
    if (index < 0) index = 0;
    const [removed] = rendered.splice(index, 1);
    reserved -= removed.prefix.length + 66;
    omitted++;
  }
  const note = omitted ? `[较早 ${omitted} 条文本因总长度上限省略]\n\n` : "";
  const per = Math.max(
    0,
    Math.min(
      600,
      Math.floor(
        (budget -
          note.length -
          rendered.reduce((sum, m) => sum + m.prefix.length + 2, 0)) /
          Math.max(1, rendered.length),
      ),
    ),
  );
  const clip = (t) =>
    t.length <= per ? t : per >= 2 ? t.slice(0, per - 2) + "……" : "";
  const body = note + rendered.map((m) => m.prefix + clip(m.text)).join("\n\n");
  const prompt = head + body + footer;
  return {
    prompt,
    redactions,
    quote: filterRelayText(messages.at(-1)?.text || "").text.slice(0, 180),
  };
}

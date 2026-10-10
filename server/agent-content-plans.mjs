// 接入项目既有 toml-eslint-parser；此候选注入parseTOML，不加依赖。
import { isAbsolute, resolve } from "node:path";
const fail = message => { throw Object.assign(new Error(message), { code: "UNSUPPORTED_MAPPING" }); };
const keyNames = k => k.keys.map(n => n.type === "TOMLBare" ? n.name : n.value);
function parse(text, parseTOML) {
  if (typeof text !== "string" || Buffer.byteLength(text) > 256 * 1024) fail("配置容量无效");
  try { return parseTOML(text.startsWith("\ufeff") ? " " + text.slice(1) : text, { tomlVersion: "1.0.0" }).body[0].body; }
  catch { fail("配置语法无法安全解析"); }
}
const patch = (text, start, end, after) => ({ text: text.slice(0, start) + after + text.slice(end),
  diff: { start, end, before: text.slice(start, end), after } });
export function planCodexContentBoolean({ text, kind, ref, enabled, parseTOML }) {
  if (typeof enabled !== "boolean" || !["skill", "plugin"].includes(kind)) fail("只允许正式Skill/插件的启用布尔值");
  if (kind === "skill" && (!isAbsolute(ref || "") || resolve(ref) !== ref || !ref.endsWith("/SKILL.md") || /[\r\n\0]/.test(ref))) fail("Skill引用不合法");
  if (kind === "plugin" && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}@[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(ref || "")) fail("插件引用必须是已登记name@marketplace");
  const body = parse(text, parseTOML), matches = [];
  for (const table of body) {
    if (table.type !== "TOMLTable") continue;
    const p = table.resolvedKey;
    if (kind === "plugin" && table.kind === "standard" && JSON.stringify(p) === JSON.stringify(["plugins", ref])) matches.push(table);
    if (kind === "skill" && table.kind === "array" && p[0] === "skills" && p[1] === "config" && p.length === 3) {
      const selector = table.body.filter(n => n.type === "TOMLKeyValue" && JSON.stringify(keyNames(n.key)) === '["path"]');
      if (selector.length === 1 && selector[0].value.kind === "string" && selector[0].value.value === ref) matches.push(table);
    }
  }
  if (matches.length > 1) fail("存在重复定义，不能猜采用哪个条目");
  const table = matches[0], newline = text.includes("\r\n") ? "\r\n" : "\n";
  let result;
  if (table) {
    const values = table.body.filter(n => n.type === "TOMLKeyValue" && JSON.stringify(keyNames(n.key)) === '["enabled"]');
    if (values.length > 1 || values[0] && values[0].value.kind !== "boolean") fail("启用字段不是受支持布尔值");
    if (values[0]) {
      const node = values[0].value;
      if (node.value === enabled) fail("内容没有变化");
      result = patch(text, node.range[0], node.range[1], String(enabled));
    } else {
      const at = text.indexOf("\n", table.key.range[1]), insertAt = at < 0 ? text.length : at + 1;
      result = patch(text, insertAt, insertAt, (at < 0 ? newline : "") + "enabled = " + enabled + newline);
    }
  } else {
    // 不支持其他形式的skills.config/inline插件表，避免新增定义与原语义冲突。
    const conflicting = body.some(n => n.type === "TOMLKeyValue" && ["skills", "plugins"].includes(keyNames(n.key)[0])
      || n.type === "TOMLTable" && n.kind === "standard" && n.resolvedKey[0] === "skills" && n.resolvedKey.length === 1);
    if (conflicting) fail("现有配置使用未适配布局，不能安全新增");
    const addition = kind === "skill" ? "[[skills.config]]" + newline + "path = " + JSON.stringify(ref) + newline + "enabled = " + enabled + newline
      : "[plugins." + JSON.stringify(ref) + "]" + newline + "enabled = " + enabled + newline;
    result = patch(text, text.length, text.length, (text && !text.endsWith("\n") ? newline : "") + addition);
  }
  parse(result.text, parseTOML);
  return { ...result, kind, ref, enabled, fieldsChanged: ["enabled"], adoption: "配置已准备；回读后仍需重启Agent核验运行采用",
    source: kind === "skill" ? "https://developers.openai.com/codex/skills" : "https://developers.openai.com/codex/config-reference" };
}
export function createUserRelayPackage({ sourceName, targetName, goal, providedContext, nextStep }) {
  for (const value of [sourceName, targetName, goal, providedContext, nextStep]) if (typeof value !== "string" || Buffer.byteLength(value) > 64 * 1024) fail("接力输入无效");
  return ["# 会话接力包", "", "来源：" + sourceName, "目标：" + targetName, "", "## 目标", goal, "",
    "## 用户明确提供的上下文", providedContext, "", "## 唯一下一步", nextStep, "",
    "由用户复制到目标Agent；本功能没有读取或发送私人会话。"].join("\n");
}

import { parseTOML } from "toml-eslint-parser";
import {
  parseDocument,
  parseAllDocuments,
  isMap,
  isScalar,
  isAlias,
  isPair,
  visit as visitYaml,
} from "yaml";
import { failure } from "./repository.mjs";

const fields = {
  codex: [
    { key: "tui.animations", label: "终端动画" },
    { key: "tui.show_tooltips", label: "终端提示" },
  ],
  hermes: [
    { key: "display.bell_on_complete", label: "完成提醒" },
    { key: "display.show_reasoning", label: "显示推理内容" },
  ],
};
function parsed(agentId, text) {
  if (!fields[agentId]) throw failure("此 Agent 尚不支持配置管理");
  if (typeof text !== "string" || Buffer.byteLength(text) > 256 * 1024)
    throw failure("配置超过256 KiB限制");
  let ast, data;
  const nodes = new Map();
  try {
    if (agentId === "hermes") {
      const options = {
        version: "1.1",
        keepSourceTokens: true,
        prettyErrors: false,
        logLevel: "silent",
        uniqueKeys: true,
      };
      const documents = parseAllDocuments(text, options);
      if (documents.length > 1) throw new Error();
      ast = documents[0] || parseDocument(text, options);
      if (
        ast.errors.length ||
        ast.warnings.length ||
        (ast.contents !== null && !isMap(ast.contents))
      )
        throw new Error();
      visitYaml(ast, (_key, node) => {
        if (node && (isAlias(node) || node.anchor || node.tag))
          throw new Error();
        if (
          isPair(node) &&
          (!isScalar(node.key) ||
            typeof node.key.value === "symbol" ||
            node.key.value === "<<")
        )
          throw new Error();
      });
      data = Object.create(null);
      const parent = ast.get("display", true);
      if (parent && !isMap(parent)) data.display = "unsupported";
      else if (parent) {
        data.display = Object.create(null);
        for (const field of fields.hermes) {
          const child = field.key.split(".")[1];
          const value = parent.get(child, true);
          if (value !== undefined) {
            const boolean =
              isScalar(value) &&
              typeof value.value === "boolean" &&
              /^(true|false|yes|no|on|off)$/i.test(
                text.slice(value.range[0], value.range[1]),
              );
            data.display[child] = boolean ? value.value : null;
            nodes.set(JSON.stringify(field.key.split(".")), {
              kind: boolean ? "boolean" : "unsupported",
              value: value.value,
              range: value.range,
            });
          }
        }
      }
      return { ast, data, nodes };
    }
    // The target reads UTF-8 with an optional leading BOM. A same-length space
    // lets the parser accept it without shifting any original source ranges.
    const tomlText = text.startsWith("\ufeff") ? " " + text.slice(1) : text;
    ast = parseTOML(tomlText, { tomlVersion: "1.0.0" });
  } catch {
    throw failure("配置语法无法安全解析，未展示原始内容");
  }
  const names = (key) =>
    key.keys.map((k) => (k.type === "TOMLBare" ? k.name : k.value));
  function visit(body, prefix = []) {
    for (const node of body) {
      if (node.type === "TOMLTable") {
        nodes.set(JSON.stringify(node.resolvedKey), node);
        if (
          node.kind === "array" &&
          node.resolvedKey[0] === "tui" &&
          node.resolvedKey.length <= 2
        )
          nodes.set(JSON.stringify(["tui"]), { type: "unsupported" });
        visit(node.body, node.resolvedKey);
      }
      if (node.type !== "TOMLKeyValue") continue;
      const path = [...prefix, ...names(node.key)];
      nodes.set(JSON.stringify(path), node.value);
      if (node.value.type === "TOMLInlineTable") visit(node.value.body, path);
    }
  }
  visit(ast.body[0].body);
  // Project only declared fields. Never turn arbitrary source keys into an
  // ordinary object: keys such as __proto__ must remain inert AST data.
  data = Object.create(null);
  const parent = nodes.get(JSON.stringify(["tui"]));
  if (parent && !["TOMLTable", "TOMLInlineTable"].includes(parent.type))
    data.tui = "unsupported";
  else {
    data.tui = Object.create(null);
    for (const field of fields.codex) {
      const node = nodes.get(JSON.stringify(field.key.split(".")));
      if (node)
        data.tui[field.key.split(".")[1]] =
          node.kind === "boolean" ? node.value : null;
    }
  }
  return { ast, data, nodes };
}
export function inspectConfigDocument(agentId, text) {
  const { data } = parsed(agentId, text);
  return {
    fields: fields[agentId].map((field) => {
      const [parent, key] = field.key.split(".");
      const parentInvalid =
        Object.hasOwn(data, parent) &&
        (!data[parent] ||
          typeof data[parent] !== "object" ||
          Array.isArray(data[parent]));
      const exists =
        !parentInvalid && data[parent] && Object.hasOwn(data[parent], key);
      const value = exists ? data[parent][key] : undefined;
      return {
        ...field,
        status: parentInvalid
          ? "unsupported"
          : exists
            ? typeof value === "boolean"
              ? "configured"
              : "unsupported"
            : "unset",
        value: typeof value === "boolean" ? value : null,
      };
    }),
  };
}
export function planConfigChange(agentId, text, key, value) {
  if (
    typeof value !== "boolean" ||
    !fields[agentId]?.some((f) => f.key === key)
  )
    throw failure("只允许修改受支持的布尔显示设置");
  const { ast, data, nodes } = parsed(agentId, text),
    node = nodes.get(JSON.stringify(key.split(".")));
  if (node && node.kind !== "boolean") throw failure("此字段暂不能安全修改");
  if (node?.value === value) throw failure("设置未发生变化");
  let start,
    end,
    after = String(value);
  if (node) [start, end] = node.range;
  else {
    const [parent, child] = key.split(".");
    if (
      Object.hasOwn(data, parent) &&
      (!data[parent] ||
        typeof data[parent] !== "object" ||
        Array.isArray(data[parent]))
    )
      throw failure("此字段暂不能安全修改");
    const newline = text.includes("\r\n") ? "\r\n" : "\n";
    if (agentId === "hermes") {
      const map = ast.get(parent, true);
      const container = map || ast.contents;
      if (container?.flow) {
        // Insert after the opening brace, leaving existing trailing commas and
        // comment/newline tokens untouched. The separator also prevents an
        // adjacent comment from becoming part of the new scalar value.
        start = end = container.range[0] + 1;
        after =
          (map ? `${child}: ${value}` : `${parent}: { ${child}: ${value} }`) +
          (container.items.length ? ", " : " ");
      } else if (map?.items.length || ast.contents?.items.length) {
        const first = container.items[0].key.range[0];
        const lineStart = text.lastIndexOf("\n", first - 1) + 1;
        const line =
          lineStart === 0 && text.startsWith("\ufeff") ? 1 : lineStart;
        const indent = text.slice(line, first);
        if (!/^ *$/.test(indent)) throw failure("此字段暂不能安全修改");
        start = end = line;
        after = map
          ? `${indent}${child}: ${value}${newline}`
          : `${indent}${parent}:${newline}${indent}  ${child}: ${value}${newline}`;
      } else {
        start = end = text.length;
        after =
          (text && !text.endsWith("\n") ? newline : "") +
          `${parent}:${newline}  ${child}: ${value}${newline}`;
      }
    } else {
      const inline = nodes.get(JSON.stringify([parent]));
      const table = ast.body[0].body.find(
        (n) =>
          n.type === "TOMLTable" &&
          n.kind === "standard" &&
          n.resolvedKey.length === 1 &&
          n.resolvedKey[0] === parent,
      );
      if (inline?.type === "TOMLInlineTable") {
        start = end = inline.range[1] - 1;
        after = (inline.body.length ? ", " : "") + `${child} = ${value}`;
      } else if (table) {
        const newlineAt = text.indexOf("\n", table.key.range[1]);
        start = end = newlineAt < 0 ? text.length : newlineAt + 1;
        after =
          (newlineAt < 0 ? newline : "") + `${child} = ${value}${newline}`;
      } else {
        start = end = text.startsWith("\ufeff") ? 1 : 0;
        after = `${key} = ${value}${newline}`;
      }
    }
  }
  const before = text.slice(start, end);
  const content = text.slice(0, start) + after + text.slice(end);
  parsed(agentId, content);
  return {
    content,
    patch: { offset: Buffer.byteLength(text.slice(0, start)), before, after },
    before: node?.value ?? null,
    after: value,
  };
}

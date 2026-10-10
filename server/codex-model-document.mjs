import { parseTOML } from 'toml-eslint-parser';

// A model ID is data inside a quoted TOML value, never an executable fragment.
export const CODEX_MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
// A syntax check alone cannot establish that a mistaken value is a model ID.
// Refuse common credential forms and opaque high-entropy-looking strings.
export function isSafeModelId(value) {
  if (typeof value !== 'string' || !CODEX_MODEL_ID_RE.test(value)) return false;
  if (/^(?:sk-|gh[pousr]_|AIza|A(?:K|S)IA|xox[baprs]-|Bearer|api[_-]?key|token[_-]|secret[_-]|pat[_-])/i.test(value)) return false;
  if (value.length >= 32 && /^[A-Za-z0-9_-]+$/.test(value) &&
    /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value)) return false;
  return true;
}

const MAX_PATCH_FRAGMENT_BYTES = 1024;
const TOML_VERSION = '1.0.0';

export class CodexModelTomlError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CodexModelTomlError';
    this.code = code;
  }
}

function fail(code) {
  throw new CodexModelTomlError(code);
}

function declarationName(node) {
  return node.key.keys.map((part) => part.name ?? part.value);
}

function parseConfig(text) {
  if (typeof text !== 'string') fail('CONFIG_TEXT_REQUIRED');

  // toml-eslint-parser rejects a UTF-8 BOM. Strip it only while parsing, then
  // translate every AST range back to the untouched source string.
  const bomLength = text.startsWith('\uFEFF') ? 1 : 0;
  let program;
  try {
    program = parseTOML(text.slice(bomLength), { tomlVersion: TOML_VERSION });
  } catch {
    // Parser errors can contain source excerpts. Do not expose them or attach
    // them as a cause to this public error.
    fail('CONFIG_TOML_INVALID');
  }

  const topLevel = program.body[0];
  let modelNode = null;
  let providerNode = null;
  let firstTable = null;

  for (const node of topLevel.body) {
    if (node.type === 'TOMLTable') {
      firstTable ??= node;
    }

    const keys = declarationName(node);
    const field = keys[0];
    if (field !== 'model' && field !== 'model_provider') continue;

    // A dotted assignment or table header creates a namespace rather than the
    // scalar field this adapter is allowed to edit.
    if (node.type !== 'TOMLKeyValue' || keys.length !== 1) {
      fail('CONFIG_FIELD_AMBIGUOUS');
    }

    if (field === 'model') {
      if (modelNode) fail('CONFIG_MODEL_DUPLICATE');
      if (node.value.type !== 'TOMLValue' || node.value.kind !== 'string') {
        fail('CONFIG_MODEL_NOT_STRING');
      }
      modelNode = node;
    } else {
      if (providerNode) fail('CONFIG_PROVIDER_DUPLICATE');
      if (node.value.type !== 'TOMLValue' || node.value.kind !== 'string' || node.value.value !== 'openai') {
        fail('CONFIG_PROVIDER_UNSUPPORTED');
      }
      providerNode = node;
    }
  }

  // Historical values can be shown in the preview and used in an inverse patch.
  // Treat only model-shaped scalar values as non-credential data in this slice.
  if (modelNode && !isSafeModelId(modelNode.value.value)) {
    fail('CONFIG_MODEL_VALUE_UNSUPPORTED');
  }

  return { text, bomLength, modelNode, providerNode, firstTable };
}

function lineEnding(text) {
  const match = /\r\n|\n/.exec(text);
  return match?.[0] ?? '\n';
}

function insertionOffset(config) {
  const { text, bomLength, firstTable } = config;
  if (!firstTable) return text.length;
  const tableOffset = firstTable.range[0] + bomLength;
  const lineStart = text.lastIndexOf('\n', tableOffset - 1) + 1;
  return Math.max(bomLength, lineStart);
}

function planEdit(config, modelId) {
  const { text, bomLength, modelNode } = config;
  const value = `"${modelId}"`;

  if (modelNode) {
    const start = modelNode.value.range[0] + bomLength;
    const end = modelNode.value.range[1] + bomLength;
    const before = text.slice(start, end);
    if (Buffer.byteLength(before, 'utf8') > MAX_PATCH_FRAGMENT_BYTES) {
      fail('CONFIG_MODEL_LITERAL_TOO_LARGE');
    }
    return { start, end, before, after: value };
  }

  const start = insertionOffset(config);
  const eol = lineEnding(text);
  let after;
  if (config.firstTable) {
    after = `model = ${value}${eol}`;
  } else if (start === bomLength) {
    after = `model = ${value}${eol}`;
  } else if (text.endsWith('\n')) {
    after = `model = ${value}${eol}`;
  } else {
    after = `${eol}model = ${value}`;
  }
  return { start, end: start, before: '', after };
}

/**
 * Inspect only the top-level Codex model fields. Nested profile model values
 * are deliberately outside this function's authority.
 *
 * @returns {{model: string|null, provider: 'openai'}}
 */
export function inspectCodexModel(text) {
  const config = parseConfig(text);
  return { model: config.modelNode?.value.value ?? null, provider: 'openai' };
}

/**
 * Produce a localized edit plus the complete patched text for a private write
 * layer. Never log/serialize the returned text or parser input.
 * `patch.offset` is a UTF-8 byte offset, while before/after are exact UTF-8
 * strings. A writer must still do its own file-identity and content CAS.
 *
 * @returns {{text: string, patch: {offset: number, before: string, after: string}, beforeModel: string|null, afterModel: string, changed: boolean}}
 */
export function planCodexModel(text, modelId) {
  if (!isSafeModelId(modelId)) {
    fail('MODEL_ID_INVALID');
  }

  const config = parseConfig(text);
  const beforeModel = config.modelNode?.value.value ?? null;
  if (beforeModel === modelId) {
    return {
      text,
      patch: { offset: 0, before: '', after: '' },
      beforeModel,
      afterModel: modelId,
      changed: false,
    };
  }

  const edit = planEdit(config, modelId);
  const patched = text.slice(0, edit.start) + edit.after + text.slice(edit.end);
  const verified = parseConfig(patched);
  if (verified.modelNode?.value.value !== modelId) fail('CONFIG_PATCH_UNVERIFIED');

  return {
    text: patched,
    patch: {
      offset: Buffer.byteLength(text.slice(0, edit.start), 'utf8'),
      before: edit.before,
      after: edit.after,
    },
    beforeModel,
    afterModel: modelId,
    changed: true,
  };
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CodexModelTomlError,
  inspectCodexModel,
  planCodexModel,
} from '../server/codex-model-document.mjs';

function applyBytePatch(source, patch) {
  const input = Buffer.from(source, 'utf8');
  const before = Buffer.from(patch.before, 'utf8');
  const after = Buffer.from(patch.after, 'utf8');
  assert.deepEqual(input.subarray(patch.offset, patch.offset + before.length), before);
  return Buffer.concat([
    input.subarray(0, patch.offset),
    after,
    input.subarray(patch.offset + before.length),
  ]).toString('utf8');
}

function invertBytePatch(patched, patch) {
  return applyBytePatch(patched, {
    offset: patch.offset,
    before: patch.after,
    after: patch.before,
  });
}

function assertSafeFailure(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof CodexModelTomlError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

test('replaces only the top-level string literal; nested profile and inline comment stay intact', () => {
  const source = 'model = "old-model" # current\r\n[profiles.alpha]\r\nmodel = "nested"\r\n';
  const result = planCodexModel(source, 'gpt-5.3-codex');
  assert.equal(result.text, 'model = "gpt-5.3-codex" # current\r\n[profiles.alpha]\r\nmodel = "nested"\r\n');
  assert.deepEqual(result.patch, { offset: 8, before: '"old-model"', after: '"gpt-5.3-codex"' });
  assert.equal(applyBytePatch(source, result.patch), result.text);
  assert.equal(invertBytePatch(result.text, result.patch), source);
  assert.deepEqual(inspectCodexModel(result.text), { model: 'gpt-5.3-codex', provider: 'openai' });
});

test('replacement offset is measured in UTF-8 bytes after non-ASCII source', () => {
  const source = '# 数码世界 😀\nmodel = "old-model" # retained\n';
  const result = planCodexModel(source, 'new-id');
  assert.equal(result.patch.offset, Buffer.byteLength('# 数码世界 😀\nmodel = ', 'utf8'));
  assert.equal(result.patch.before, '"old-model"');
  assert.equal(applyBytePatch(source, result.patch), result.text);
  assert.equal(invertBytePatch(result.text, result.patch), source);
});

test('quoted top-level key, literal string, and multiline string are located through the AST', () => {
  const quoted = '"model" = \'old\' # keep\n';
  const quotedPlan = planCodexModel(quoted, 'new-id');
  assert.equal(quotedPlan.text, '"model" = "new-id" # keep\n');
  assert.equal(applyBytePatch(quoted, quotedPlan.patch), quotedPlan.text);

  const multiline = 'model = """old-model""" # keep\n';
  const multilinePlan = planCodexModel(multiline, 'new-id');
  assert.equal(multilinePlan.text, 'model = "new-id" # keep\n');
  assert.equal(applyBytePatch(multiline, multilinePlan.patch), multilinePlan.text);
});

test('inserts before the first table and preserves BOM, indentation, CRLF, and UTF-8 byte offset', () => {
  const source = '\uFEFF# 😀\r\n  [profiles.alpha]\r\nmodel = "nested"\r\n';
  const result = planCodexModel(source, 'gpt-5.3-codex');
  assert.equal(result.text, '\uFEFF# 😀\r\nmodel = "gpt-5.3-codex"\r\n  [profiles.alpha]\r\nmodel = "nested"\r\n');
  assert.equal(result.patch.offset, Buffer.byteLength('\uFEFF# 😀\r\n', 'utf8'));
  assert.deepEqual(result.patch.before, '');
  assert.equal(applyBytePatch(source, result.patch), result.text);
});

test('appends after top-level assignments or a final comment without rewriting them', () => {
  const assignments = 'model_provider = "openai"\n# retained\n';
  const assignmentPlan = planCodexModel(assignments, 'new-id');
  assert.equal(assignmentPlan.text, 'model_provider = "openai"\n# retained\nmodel = "new-id"\n');
  assert.equal(applyBytePatch(assignments, assignmentPlan.patch), assignmentPlan.text);

  const comment = '# retained';
  assert.equal(planCodexModel(comment, 'new-id').text, '# retained\nmodel = "new-id"');
  assert.equal(planCodexModel('', 'new-id').text, 'model = "new-id"\n');
  assert.equal(planCodexModel('\uFEFF', 'new-id').text, '\uFEFFmodel = "new-id"\n');
});

test('existing matching model is a no-op with an empty patch', () => {
  const source = 'model = "gpt-5.3-codex"\n';
  const result = planCodexModel(source, 'gpt-5.3-codex');
  assert.equal(result.changed, false);
  assert.equal(result.text, source);
  assert.deepEqual(result.patch, { offset: 0, before: '', after: '' });
});

test('provider must be absent or exactly openai', () => {
  assert.deepEqual(inspectCodexModel('model = "x"\n'), { model: 'x', provider: 'openai' });
  assert.deepEqual(inspectCodexModel("model_provider = 'openai'\n"), { model: null, provider: 'openai' });
  assertSafeFailure(() => inspectCodexModel('model_provider = "azure"\n'), 'CONFIG_PROVIDER_UNSUPPORTED');
  assertSafeFailure(() => inspectCodexModel('model_provider = 1\n'), 'CONFIG_PROVIDER_UNSUPPORTED');
  assertSafeFailure(() => inspectCodexModel('[model_provider]\nfoo = "x"\n'), 'CONFIG_FIELD_AMBIGUOUS');
  assertSafeFailure(() => inspectCodexModel('model_provider.foo = "x"\n'), 'CONFIG_FIELD_AMBIGUOUS');
});

test('rejects non-string, dotted, and table model declarations, but ignores nested models', () => {
  assertSafeFailure(() => inspectCodexModel('model = 4\n'), 'CONFIG_MODEL_NOT_STRING');
  assertSafeFailure(() => inspectCodexModel('model = { foo = "x" }\n'), 'CONFIG_MODEL_NOT_STRING');
  assertSafeFailure(() => inspectCodexModel('model.foo = "x"\n'), 'CONFIG_FIELD_AMBIGUOUS');
  assertSafeFailure(() => inspectCodexModel('[model]\nfoo = "x"\n'), 'CONFIG_FIELD_AMBIGUOUS');
  assert.deepEqual(inspectCodexModel('[profiles.a]\nmodel = "nested"\n'), { model: null, provider: 'openai' });
  assert.deepEqual(inspectCodexModel('"model.foo" = "other"\n'), { model: null, provider: 'openai' });
});

test('rejects duplicate and invalid TOML with a non-leaking error', () => {
  const privateValue = 'PRIVATE_SENTINEL_9137';
  for (const source of [
    `# ${privateValue}\nmodel = "x"\nmodel = "y"\n`,
    `# ${privateValue}\nmodel = `,
    `# ${privateValue}\nmodel = "x"\n"model" = "y"\n`,
  ]) {
    assert.throws(() => inspectCodexModel(source), (error) => {
      assert.equal(error.code, 'CONFIG_TOML_INVALID');
      assert.ok(!String(error).includes(privateValue));
      assert.ok(!String(error.stack).includes(privateValue));
      return true;
    });
  }
});

test('rejects unsafe model IDs and overlong replacement fragments', () => {
  for (const id of ['', ' bad', 'x\nmodel_provider = "other"', 'x"', '../x', 'x;rm', 'x'.repeat(129)]) {
    assertSafeFailure(() => planCodexModel('', id), 'MODEL_ID_INVALID');
  }
  assert.equal(planCodexModel('', 'vendor/model:latest').afterModel, 'vendor/model:latest');
  const longLiteral = `model = "${'x'.repeat(1025)}"\n`;
  assertSafeFailure(() => planCodexModel(longLiteral, 'new-id'), 'CONFIG_MODEL_VALUE_UNSUPPORTED');
  assertSafeFailure(() => inspectCodexModel('model = "possibly secret text"\n'), 'CONFIG_MODEL_VALUE_UNSUPPORTED');
  assertSafeFailure(() => inspectCodexModel('model = "sk-proj-testtoken"\n'), 'CONFIG_MODEL_VALUE_UNSUPPORTED');
  assertSafeFailure(() => planCodexModel('', 'sk-proj-testtoken'), 'MODEL_ID_INVALID');
});

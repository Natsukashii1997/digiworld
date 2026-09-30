import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  inspectConfigDocument,
  planConfigChange,
} from "../server/config-document.mjs";

test("Configuration keys never mutate JavaScript prototypes or become inherited settings", () => {
  const module = new URL("../server/config-document.mjs", import.meta.url).href;
  const result = spawnSync(process.execPath, [
    "--input-type=module",
    "-e",
    `import {inspectConfigDocument} from ${JSON.stringify(module)}; for (const text of ['__proto__.tui.animations = true\\n','tui.__proto__.animations = true\\n','__proto__ = {tui={animations=true}}\\n']) { const view=inspectConfigDocument('codex',text); if(view.fields.some(f=>f.status==='configured') || Object.hasOwn(Object.prototype,'tui') || Object.hasOwn(Object.prototype,'animations')) process.exit(12); }`,
  ]);
  assert.equal(result.status, 0);
});

test("Codex display change preserves comments and unrelated private text byte for byte", () => {
  const text =
    '# 中文注释\r\nmodel = "private-sentinel"\r\n[tui]\r\nanimations = true # 保留\r\nshow_tooltips = false\r\n';
  const view = inspectConfigDocument("codex", text);
  assert.deepEqual(
    view.fields.map(({ key, value, status }) => ({ key, value, status })),
    [
      { key: "tui.animations", value: true, status: "configured" },
      { key: "tui.show_tooltips", value: false, status: "configured" },
    ],
  );
  assert.equal(JSON.stringify(view).includes("private-sentinel"), false);
  const change = planConfigChange("codex", text, "tui.animations", false);
  assert.equal(
    change.content,
    text.replace("animations = true", "animations = false"),
  );
  assert.equal(change.patch.before, "true");
  assert.equal(change.patch.after, "false");
  assert.equal(
    Buffer.from(text)
      .subarray(change.patch.offset, change.patch.offset + 4)
      .toString(),
    "true",
  );
});

test("A quoted dotted key is not the supported nested field", () => {
  const text = 'tui.animations = true\n"tui.animations" = false # unrelated\n';
  assert.equal(
    planConfigChange("codex", text, "tui.animations", false).content,
    'tui.animations = false\n"tui.animations" = false # unrelated\n',
  );
});

test("A leading UTF-8 BOM survives supported edits with original byte offsets", () => {
  const cases = [
    [
      "codex",
      "tui.animations",
      "\ufeff# 中文🔒\r\n[tui]\r\nanimations = true # 保留\r\n",
      "\ufeff# 中文🔒\r\n[tui]\r\nanimations = false # 保留\r\n",
    ],
    [
      "codex",
      "tui.animations",
      '\ufeffmodel = "PRIVATE_SENTINEL"\r\n',
      '\ufefftui.animations = false\r\nmodel = "PRIVATE_SENTINEL"\r\n',
    ],
    [
      "hermes",
      "display.show_reasoning",
      "\ufeffmodel: PRIVATE_SENTINEL\r\n",
      "\ufeffdisplay:\r\n  show_reasoning: false\r\nmodel: PRIVATE_SENTINEL\r\n",
    ],
  ];
  for (const [agent, key, text, expected] of cases) {
    const result = planConfigChange(agent, text, key, false);
    assert.equal(result.content, expected);
    const originalBytes = Buffer.from(text);
    const patch = result.patch;
    assert.equal(
      Buffer.concat([
        originalBytes.subarray(0, patch.offset),
        Buffer.from(patch.after),
        originalBytes.subarray(patch.offset + Buffer.byteLength(patch.before)),
      ]).toString(),
      expected,
    );
    assert.equal(
      inspectConfigDocument(agent, expected).fields.find(
        (field) => field.key === key,
      ).value,
      false,
    );
  }
});

test("Hermes refuses YAML merge/complex keys and PyYAML-incompatible one-letter booleans", () => {
  for (const text of [
    "<<: {display: {show_reasoning: true, bell_on_complete: true, custom: PRIVATE}}\n",
    "? [private,key]\n: value\ndisplay: {show_reasoning: true}\n",
    "? {private: key}\n: value\n",
  ])
    assert.throws(() => inspectConfigDocument("hermes", text));
  for (const raw of ["y", "Y", "n", "N"]) {
    const text = `display:\n  show_reasoning: ${raw}\n`;
    assert.equal(
      inspectConfigDocument("hermes", text).fields[1].status,
      "unsupported",
    );
    assert.throws(() =>
      planConfigChange("hermes", text, "display.show_reasoning", false),
    );
  }
});

test("Invalid/private values, syntax and unsafe YAML constructs never leak into a view or error", () => {
  for (const [agent, text] of [
    ["codex", 'tui = "PRIVATE_SENTINEL"\n'],
    ["codex", '[tui]\nanimations = "PRIVATE_SENTINEL"\n'],
    ["hermes", "display: PRIVATE_SENTINEL\n"],
    ["hermes", 'display:\n  show_reasoning: "PRIVATE_SENTINEL"\n'],
  ]) {
    const view = inspectConfigDocument(agent, text);
    assert.equal(JSON.stringify(view).includes("PRIVATE_SENTINEL"), false);
    const key = agent === "codex" ? "tui.animations" : "display.show_reasoning";
    assert.equal(view.fields.find((f) => f.key === key).status, "unsupported");
    assert.throws(
      () => planConfigChange(agent, text, key, true),
      (e) => !e.message.includes("PRIVATE_SENTINEL"),
    );
  }
  for (const text of [
    "display: &a {show_reasoning: true}\ncopy: *a\n",
    "display:\n  show_reasoning: true\n  show_reasoning: false\n",
    "---\ndisplay: {}\n---\nsecret: PRIVATE_SENTINEL\n",
    "display: !bad PRIVATE_SENTINEL\n",
  ])
    assert.throws(
      () => inspectConfigDocument("hermes", text),
      (e) => !e.message.includes("PRIVATE_SENTINEL"),
    );
  assert.throws(
    () => inspectConfigDocument("codex", 'bad = "PRIVATE_SENTINEL'),
    (e) => !e.message.includes("PRIVATE_SENTINEL"),
  );
  assert.throws(() => planConfigChange("codex", "", "approval_policy", true));
  assert.throws(() =>
    planConfigChange("hermes", "", "display.show_reasoning", "false"),
  );
});

test("Unset boolean insertion supports empty, dotted, inline and nested configuration without reserializing", () => {
  const examples = [
    ["codex", '# keep\nmodel="secret"\n', "tui.animations", false],
    ["codex", "tui.show_tooltips = true\n", "tui.animations", true],
    ["codex", "tui = { show_tooltips = true }\n", "tui.animations", false],
    ["codex", '[tui.keymap]\nfoo="x"\n', "tui.animations", true],
    [
      "hermes",
      "model: private\ndisplay:\n  show_reasoning: true\nagent:\n  max_turns: 2\n",
      "display.bell_on_complete",
      true,
    ],
    ["hermes", "# keep\nmodel: private\n", "display.show_reasoning", false],
    [
      "hermes",
      "display: {show_reasoning: true}\n",
      "display.bell_on_complete",
      false,
    ],
    ["hermes", "{}\n", "display.show_reasoning", true],
  ];
  for (const [agent, text, key, value] of examples) {
    const change = planConfigChange(agent, text, key, value);
    assert.equal(
      inspectConfigDocument(agent, change.content).fields.find(
        (f) => f.key === key,
      ).value,
      value,
      agent + text,
    );
    const b = Buffer.from(change.content),
      p = change.patch;
    assert.equal(
      Buffer.concat([
        b.subarray(0, p.offset),
        Buffer.from(p.before),
        b.subarray(p.offset + Buffer.byteLength(p.after)),
      ]).toString(),
      text,
    );
    assert.equal(p.before, "");
    assert.equal(change.content.includes("private"), text.includes("private"));
  }
});

test("Hermes replaces only an explicit boolean without exposing private scalars", () => {
  const text =
    "model:\n  api_key: NEVER-SHOW-THIS\ndisplay:\n  bell_on_complete: false # keep\n  show_reasoning: true\n";
  const view = inspectConfigDocument("hermes", text);
  assert.equal(JSON.stringify(view).includes("NEVER-SHOW"), false);
  assert.equal(view.fields[0].value, false);
  const change = planConfigChange(
    "hermes",
    text,
    "display.bell_on_complete",
    true,
  );
  assert.equal(
    change.content,
    text.replace("bell_on_complete: false", "bell_on_complete: true"),
  );
  assert.equal(change.patch.before, "false");
});

test("Hermes can add a setting to flow maps with trailing commas or comments without changing existing bytes", () => {
  const cases = [
    [
      "display: {bell_on_complete: false,}\n",
      "display: {show_reasoning: true, bell_on_complete: false,}\n",
    ],
    [
      "{model: PRIVATE_SENTINEL,}\n",
      "{display: { show_reasoning: true }, model: PRIVATE_SENTINEL,}\n",
    ],
    [
      "display: { #内部注释🔒\r\n}\r\nmodel: PRIVATE_SENTINEL\r\n",
      "display: {show_reasoning: true  #内部注释🔒\r\n}\r\nmodel: PRIVATE_SENTINEL\r\n",
    ],
    ["{ #内部注释\n}\n", "{display: { show_reasoning: true }  #内部注释\n}\n"],
  ];
  for (const [text, expected] of cases) {
    const result = planConfigChange(
      "hermes",
      text,
      "display.show_reasoning",
      true,
    );
    assert.equal(result.content, expected);
    assert.equal(result.patch.before, "");
    const bytes = Buffer.from(result.content);
    assert.equal(
      Buffer.concat([
        bytes.subarray(0, result.patch.offset),
        bytes.subarray(
          result.patch.offset + Buffer.byteLength(result.patch.after),
        ),
      ]).toString(),
      text,
    );
    assert.equal(
      inspectConfigDocument("hermes", result.content).fields[1].value,
      true,
    );
  }
});

test("Codex adds an unset field within an existing table without changing private content", () => {
  const text =
    '[tui]\nshow_tooltips = true # keep\n[profiles.work]\nmodel = "SENTINEL"\n';
  assert.equal(inspectConfigDocument("codex", text).fields[0].status, "unset");
  const change = planConfigChange("codex", text, "tui.animations", false);
  assert.equal(
    change.content,
    '[tui]\nanimations = false\nshow_tooltips = true # keep\n[profiles.work]\nmodel = "SENTINEL"\n',
  );
  assert.equal(change.patch.before, "");
  assert.equal(change.before, null);
});

// G3 · 智能体群内容清单、单项开关预览、存入资产仓库入口与能力体检汇总（只读）。
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  readAgentContents,
  annotateAgentContents,
  CONTENT_AGENTS,
} from "../server/agent-contents.mjs";
import { readLocalSkill, skillFingerprint } from "../server/skill-files.mjs";
import { current } from "../src/store.js";
import { pendingItems } from "../src/pending.js";
import { startServer } from "../server/http.mjs";
import { parse, stringify } from "../src/serialization.js";
import { contentsFixture, contentsState } from "./agent-contents-fixture.mjs";

async function withFixture(run) {
  const fixture = await contentsFixture();
  try {
    await run(fixture);
  } finally {
    await fixture.close();
  }
}
const read = (fixture, agentId) =>
  readAgentContents(agentId, {
    home: fixture.user,
    filesystem: fixture.filesystem,
  });
const byName = (result) =>
  Object.fromEntries(result.groups.skills.items.map((i) => [i.name, i]));

test("主力与附属 Agent 范围：Codex、Claude Code、Hermes、OpenClaw；其他品牌明确拒绝", async () => {
  assert.deepEqual(
    CONTENT_AGENTS.map((a) => a.id),
    ["codex", "claude-code", "hermes", "openclaw"],
  );
  await assert.rejects(
    readAgentContents("cursor", { home: "/nonexistent-synthetic" }),
    /暂不支持内容清单/,
  );
});

test("按 Skill / 配置文件 / 插件 / MCP 分组；配置只给元数据，不读正文", () =>
  withFixture(async (fixture) => {
    const result = await read(fixture, "claude-code");
    assert.deepEqual(Object.keys(result.groups), [
      "skills",
      "configs",
      "plugins",
      "mcp",
    ]);
    assert.equal(result.home.status, "present");
    assert.equal(result.groups.skills.status, "ok");
    const configs = Object.fromEntries(
      result.groups.configs.items.map((i) => [i.name, i]),
    );
    assert.equal(configs["settings.json"].status, "present");
    assert.equal(configs["CLAUDE.md"].status, "present");
    assert.equal(configs["settings.local.json"].status, "missing");
    assert.ok(Number.isInteger(configs["settings.json"].bytes));
    assert.deepEqual(
      result.groups.plugins.items.map((i) => i.name).sort(),
      ["installed_plugins.json", "marketplaces"],
    );
    // MCP 定义在配置正文里：如实标为未读取，不猜测
    assert.equal(result.groups.mcp.status, "not_read");
    assert.match(result.groups.mcp.reason, /配置正文/);
    const text = JSON.stringify(result);
    assert.doesNotMatch(text, /哨兵/, "配置正文不得出现在清单里");
  }));

test("Skill 链接分类：共享池链接、失效链接、独立副本、外部链接", () =>
  withFixture(async (fixture) => {
    const items = byName(await read(fixture, "claude-code"));
    assert.equal(items["shared-writer"].source, "pool");
    assert.equal(items["shared-writer"].target, join(fixture.pool, "shared-writer"));
    assert.equal(items["gone-helper"].source, "broken");
    assert.equal(
      items["gone-helper"].target,
      join(fixture.pool, "deleted-bundle-skill"),
    );
    assert.equal(items["local-notes"].source, "copy");
    assert.equal(items["outside-link"].source, "link");
    // 可读的池链接与副本带内容指纹；失效与外部链接不读取内容
    assert.match(items["shared-writer"].fingerprint, /^[a-f0-9]{64}$/);
    assert.match(items["local-notes"].fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(items["gone-helper"].fingerprint, undefined);
    assert.equal(items["outside-link"].fingerprint, undefined);
    // Codex 原生读取共享池：池里的 Skill 也列入，标为共享池本体
    const codex = byName(await read(fixture, "codex"));
    assert.equal(codex["shared-reviewer"].source, "pool");
    assert.equal(codex["shared-reviewer"].native, true);
    assert.equal(codex["codex-same"].source, "copy");
  }));

test("读不到的分组与条目如实标为无法读取；缺失的 Home 不伪装成空清单", () =>
  withFixture(async (fixture) => {
    const hermes = await read(fixture, "hermes");
    assert.equal(hermes.groups.plugins.status, "unreadable");
    assert.match(hermes.groups.plugins.reason, /权限/);
    assert.equal(byName(hermes)["locked-skill"].source, "unreadable");
    const openclaw = await read(fixture, "openclaw");
    assert.equal(openclaw.home.status, "missing");
    for (const group of Object.values(openclaw.groups))
      assert.notEqual(group.status, "ok");
  }));

test("指纹口径与“收录本机 Skill”一致；与资产仓库比对出同内容、旧版本、不一致、未收录", () =>
  withFixture(async (fixture) => {
    const local = await readLocalSkill(
      [join(fixture.codex, "skills")],
      join(fixture.codex, "skills", "codex-same"),
    );
    assert.equal(skillFingerprint(local.files), local.fingerprint);
    const state = await contentsState(fixture);
    const codex = byName(annotateAgentContents(await read(fixture, "codex"), state));
    assert.equal(codex["codex-same"].match.status, "same");
    assert.equal(codex["codex-same"].match.assetId, "asset-codex-same");
    assert.equal(codex["codex-old"].match.status, "older");
    assert.equal(codex["codex-old"].match.versionNumber, 1);
    assert.equal(codex["codex-old"].match.currentNumber, 2);
    assert.equal(codex["shared-reviewer"].match.status, "none");
    const hermes = byName(annotateAgentContents(await read(fixture, "hermes"), state));
    assert.equal(hermes["hermes-drift"].match.status, "drift");
    assert.equal(hermes["hermes-drift"].match.assetId, "asset-hermes-drift");
    assert.equal(hermes["locked-skill"].match.status, "unknown");
    const claude = byName(annotateAgentContents(await read(fixture, "claude-code"), state));
    assert.equal(claude["shared-writer"].match.status, "same");
    assert.equal(claude["gone-helper"].match.status, "unknown");
    // 名称相同不算同内容：归档资产不参与比对
    const archived = {
      ...state,
      assets: state.assets.map((a) =>
        a.id === "asset-codex-same" ? { ...a, archived: true } : a,
      ),
    };
    const again = byName(annotateAgentContents(await read(fixture, "codex"), archived));
    assert.equal(again["codex-same"].match.status, "none");
    assert.ok(current(state.assets[2]));
  }));

test("体检汇总：失效链接数、与仓库版本不一致的副本数、无法读取项", () =>
  withFixture(async (fixture) => {
    const state = await contentsState(fixture);
    const summary = async (id) =>
      annotateAgentContents(await read(fixture, id), state).health;
    assert.deepEqual(await summary("claude-code"), {
      brokenLinks: 1,
      drift: 0,
      unreadable: 0,
    });
    assert.deepEqual(await summary("codex"), {
      brokenLinks: 0,
      drift: 1,
      unreadable: 0,
    });
    // Hermes：1 个有来源关系但内容不同，1 个 Skill 目录与插件分组不可读
    assert.deepEqual(await summary("hermes"), {
      brokenLinks: 0,
      drift: 1,
      unreadable: 2,
    });
  }));

test("单项开关只给预览：说明将移动哪条链接或目录，并标注需单独授权；清单读取不写任何文件", () =>
  withFixture(async (fixture) => {
    const before = await fixture.snapshot();
    const claude = byName(await read(fixture, "claude-code"));
    const link = claude["shared-writer"].toggle;
    assert.equal(link.action, "move");
    assert.equal(link.from, join(fixture.claude, "skills", "shared-writer"));
    assert.equal(
      link.to,
      join(fixture.claude, "skills.disabled", "shared-writer"),
    );
    assert.match(link.effect, /只移动链接本身/);
    assert.match(link.authorization, /需要用户单独授权后在本机执行/);
    assert.equal(claude["local-notes"].toggle.action, "move");
    assert.match(claude["local-notes"].toggle.effect, /整个目录/);
    assert.equal(claude["gone-helper"].toggle.action, "none");
    assert.match(claude["gone-helper"].toggle.effect, /失效/);
    const codex = byName(await read(fixture, "codex"));
    assert.equal(codex["shared-reviewer"].toggle.action, "blocked");
    assert.match(codex["shared-reviewer"].toggle.effect, /所有/);
    // 存入资产仓库入口：给出限定扫描范围（池链接需同时包含共享池），不自行收录
    assert.deepEqual(claude["shared-writer"].store.roots, [
      join(fixture.claude, "skills"),
      fixture.pool,
    ]);
    assert.deepEqual(claude["local-notes"].store.roots, [
      join(fixture.claude, "skills"),
    ]);
    assert.equal(claude["gone-helper"].store, null);
    assert.equal(claude["outside-link"].store, null);
    await read(fixture, "hermes");
    await read(fixture, "openclaw");
    assert.equal(await fixture.snapshot(), before, "合成目录必须逐字节不变");
  }));

test("待处理只汇总已体检的问题并跳到智能体群；未体检或无问题不产生线索", () => {
  const state = { assets: [], notes: [], connections: {} };
  assert.deepEqual(pendingItems(state, undefined, undefined, {}), []);
  const items = pendingItems(state, undefined, undefined, {
    "claude-code": {
      name: "Claude Code",
      health: { brokenLinks: 233, drift: 0, unreadable: 1 },
    },
    codex: { name: "Codex", health: { brokenLinks: 0, drift: 0, unreadable: 0 } },
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "agent-health-claude-code");
  assert.equal(items[0].to, "agents");
  assert.equal(items[0].kind, "智能体");
  assert.match(items[0].title, /Claude Code/);
  assert.match(items[0].title, /233 条失效链接/);
  assert.match(items[0].title, /1 项无法读取/);
  assert.doesNotMatch(items[0].title, /不一致/);
});

test("HTTP：/api/agent-contents 只接受支持的 agentId，返回带仓库比对的清单", () =>
  withFixture(async (fixture) => {
    const app = await startServer({
      directory: join(fixture.base, "database"),
      port: 0,
      staticRoot: join(import.meta.dirname, "../dist"),
      discovery: {
        defaultRoots: () => [],
        readAgentContents: (agentId) => read(fixture, agentId),
      },
    });
    try {
      const session = await (
        await fetch(app.url + "/api/session", {
          headers: { "x-workbench-client": "1" },
        })
      ).json();
      const call = async (path, data, method = "POST") => {
        const response = await fetch(app.url + "/api" + path, {
          method,
          headers: {
            "x-workbench-token": session.token,
            "content-type": "application/json",
          },
          body: stringify(data),
        });
        return { status: response.status, value: parse(await response.text()) };
      };
      const state = await contentsState(fixture);
      const init = await call(
        "/workspace",
        { state: { ...state, assets: state.assets.filter((a) => !a.origin) }, initialize: true },
        "PUT",
      );
      assert.equal(init.status, 200, JSON.stringify(init.value));
      for (const bad of [
        { agentId: "cursor" },
        { agentId: "codex", home: "/" },
        {},
      ]) {
        const { status } = await call("/agent-contents", bad);
        assert.equal(status, 400);
      }
      const { status, value } = await call("/agent-contents", {
        agentId: "codex",
      });
      assert.equal(status, 200);
      assert.equal(byName(value)["codex-same"].match.status, "same");
      assert.deepEqual(value.health, { brokenLinks: 0, drift: 1, unreadable: 0 });
    } finally {
      await app.close();
    }
  }));

// 本轮UI合成验证；所有读取/写入/应用打开均由fixture替代。
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { agentsV16Fixture } from "./agents-v16-fixture.mjs";
import { axe, settle } from "./ui-v14-checks.mjs";
const out = process.env.AGENT_CONTINUITY_OUT || "work/agents537/browser-regression";
await mkdir(out, { recursive: true });
const app = await agentsV16Fixture({ workHandoff: true }),
  browser = await chromium.launch(),
  errors = [],
  checks = [];
const targets = ["codex", "hermes"].map((id) => ({
  schema: 1,
  id: "migration-" + id,
  bindingId: "synthetic-" + id,
  agentId: id,
  label: "合成 " + id,
  program: { kind: "CLI", path: "/fixture/" + id },
  home: {
    id: "home-" + id,
    path: "/fixture/" + id + "-home",
    label: "合成Home",
  },
  createdAt: "2026-10-16T00:00:00.000Z",
  updatedAt: "2026-10-16T00:00:00.000Z",
}));
await app.repository.updateConnections((c) => ({
  ...c,
  agentTargets: targets,
}));
const token = "00000000-0000-4000-8000-000000000533",
  docId = "00000000-0000-4000-8000-000000000534",
  skillId = "00000000-0000-4000-8000-000000000535",
  skillRestoreToken = "00000000-0000-4000-8000-000000000536",
  skillRestoreId = "00000000-0000-4000-8000-000000000537",
  documentRestoreToken = "00000000-0000-4000-8000-000000000538",
  documentRestoreId = "00000000-0000-4000-8000-000000000539",
  completedAt = "2026-10-16T00:00:00.000Z";
const items = [
  {
    id: "instructions",
    type: "personality",
    name: "AGENTS.md",
    actionable: true,
    preview: "先核对当前事实。",
  },
  {
    id: "memory",
    type: "memory",
    name: "memories/MEMORY.md",
    actionable: true,
    preview: "中文交付偏好",
  },
  { id: "skill", type: "capability", name: "合成技能", actionable: true },
  {
    id: "connections",
    type: "connection",
    name: "MCP 连接导入草稿",
    actionable: true,
  },
];
const plan = {
  token,
  revision: 1,
  source: "合成 codex",
  target: "合成 hermes",
  enabled: true,
  items: [
    {
      id: docId,
      kind: "document",
      name: "AGENTS.md",
      file: "SOUL.md",
      before: "",
      after:
        "<!-- 来源标识 -->\n迁入参考规则。\n" + "超长中文路径与规则".repeat(20),
    },
    { id: skillId, kind: "skill", name: "合成技能", changes: [{ path: "skills", action: "create_skill_root", reason: "目标缺技能目录" }, { path: "SKILL.md", beforeHash: null, afterHash: "a".repeat(64), size: 120 }] },
  ],
};
try {
  for (const width of [1440, 768, 430, 393, 375, 320]) {
    const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion: "reduce",
      }),
      page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.copies = [];
      window.failCopy = false;
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (s) => {
            if (window.failCopy) throw Error("合成失败");
            window.copies.push(s);
          },
        },
      });
    });
    let applied = 0,
      partial = width === 1440,
      checked = false,
      skillRestored = false,
      documentRestored = false,
      restoreApplies = 0,
      lostSkillResponse = false,
      adoptionReads = 0;
    const migrationItems = () => [
      { id: docId, kind: "document", name: "AGENTS.md", file: "SOUL.md", status: documentRestored ? "matches_before" : "matches_after", completedAt },
      { id: skillId, kind: "skill", name: "合成技能", status: skillRestored ? "matches_before" : partial && !checked ? "unknown" : "matches_after", completedAt: partial && !checked ? null : completedAt },
    ];
    const restoreResult = (id, itemId, kind, name) => ({ id, status: "verified", unresolved: false, adoption: "unverified", completedAt, items: [{ id: itemId, kind, name, status: "matches_after", completedAt }] });
    await context.route("**/api/capabilities/agent/*", async (route) => {
      const action = new URL(route.request().url()).pathname.split("/").at(-1),
        input = route.request().postDataJSON();
      let value;
      if (action === "migration-capture") value = { revision: 1, items };
      else if (action === "migration-batch-preview") value = plan;
      else if (action === "migration-batch-apply") {
        if (input.token === skillRestoreToken) {
          restoreApplies++;
          skillRestored = true;
          assert.equal(lostSkillResponse, false, "撤回结果未知时不得重放 apply");
          lostSkillResponse = true;
          await route.abort("failed");
          return;
        }
        if (input.token === documentRestoreToken) {
          restoreApplies++;
          documentRestored = true;
          value = restoreResult(documentRestoreToken, documentRestoreId, "restore", "恢复 SOUL.md");
        } else {
          assert.equal(input.token, token);
          applied++;
          value = { id: token, status: partial && !checked ? "partial" : "verified", unresolved: partial && !checked, adoption: "unverified", items: migrationItems() };
        }
      } else if (action === "migration-batch-check") {
        if (input.id === skillRestoreToken) value = restoreResult(skillRestoreToken, skillRestoreId, "skill", "合成技能");
        else if (input.id === documentRestoreToken) value = restoreResult(documentRestoreToken, documentRestoreId, "restore", "恢复 SOUL.md");
        else {
          assert.equal(input.id, token);
          checked = true;
          value = { id: token, status: skillRestored || documentRestored ? "partial" : "verified", unresolved: false, adoption: "unverified", completedAt, items: migrationItems() };
        }
      } else if (action === "migration-batch-history")
        value = { items: [
          { id: token, kind: "migration", at: completedAt, items: plan.items },
          ...(skillRestored ? [{ id: skillRestoreToken, kind: "restore", at: completedAt, items: [{ id: skillRestoreId, kind: "skill", name: "合成技能" }] }] : []),
          ...(documentRestored ? [{ id: documentRestoreToken, kind: "restore", at: completedAt, items: [{ id: documentRestoreId, kind: "restore", name: "恢复 SOUL.md" }] }] : []),
        ] };
      else if (action === "migration-batch-rollback-preview") {
        assert.ok([skillId, docId].includes(input.id));
        value = input.id === skillId ? {
          token: skillRestoreToken, revision: 1, enabled: true, target: "合成 hermes", items: [{ id: skillRestoreId, kind: "skill", name: "合成技能", changes: [{ before: "/fixture/hermes-home/skills/demo", after: "/fixture/hermes-home/skills.disabled/demo" }] }],
        } : {
          ...plan, token: documentRestoreToken, items: [{ id: documentRestoreId, kind: "restore", name: "恢复 SOUL.md", file: "SOUL.md", before: "迁入参考规则", after: "" }],
        };
      } else if (action === "migration-batch-adoption") {
        assert.equal(input.id, token);
        adoptionReads++;
        value = {
          id: token, target: { id: targets[1].id, label: targets[1].label, agentId: "hermes", homePath: targets[1].home.path, programPath: targets[1].program.path, programKind: "CLI" }, checkedAt: completedAt,
          materialStatus: "ready", runtimeStatus: "unverified",
          items: [{ id: skillId, kind: "skill", name: "合成技能", skillName: "synthetic-demo", path: "/fixture/hermes-home/skills/demo/SKILL.md", file: "SKILL.md", status: "matches_after", completedAt, fileStatus: "available", configurationStatus: "unset", ready: true, reason: "文件已核对；原生读取仍待验证" }],
          prompt: "先确认 Home 为 /fixture/hermes-home，再读取 /fixture/hermes-home/skills/demo/SKILL.md；实际使用尚待确认。",
          startCommand: "/usr/bin/env 'HERMES_HOME=/fixture/hermes-home' '/fixture/hermes' chat",
          notice: "文件核对不启动 Agent；原生采用尚未验证。",
        };
      } else throw Error("旧接口或未预期请求：" + action);
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(value) });
    });
    await context.route("**/*", async (r) => {
      if (new URL(r.request().url()).origin !== new URL(app.url).origin) {
        errors.push("外部请求");
        await r.abort();
      } else await r.fallback();
    });
    await page.goto(app.url + "/#agents");
    await page.getByRole("button", { name: "上下文接力", exact: true }).click();
    await page.locator(".relay-title").filter({ hasText: "UI v16" }).waitFor();
    await page.getByRole("button", { name: /换一段/ }).click();
    const beforeSearch = app.relayCalls.list;
    await page.getByLabel("搜索会话", { exact: true }).fill("不存在");
    assert.equal(app.relayCalls.list, beforeSearch, "输入关键词不自动扫描");
    await page.getByRole("button", { name: "搜索正文", exact: true }).click();
    await page.getByText("已扫描范围找到 0 段，搜索：不存在 · 已扫描 15 / 15", { exact: true }).waitFor();
    assert.equal(app.relayCalls.listInputs.at(-1).query, "不存在");
    await page.getByLabel("搜索会话", { exact: true }).fill("亚古兽");
    await page.getByRole("button", { name: "搜索正文", exact: true }).click();
    await page.getByText("已扫描范围找到 15 段，搜索：亚古兽 · 已扫描 15 / 15", { exact: true }).waitFor();
    await page.getByLabel("筛选来源 AI").selectOption("claude-code");
    assert.equal(app.relayCalls.listInputs.at(-1).query, "亚古兽", "正文命中不依赖标题");
    assert.equal(await page.locator(".relay-choice").count(), 15);
    await settle(page);
    await page.screenshot({ path: `${out}/${width}-search.png` });
    await page.locator(".relay-choice").first().click();
    await page.getByLabel("接力材料范围").selectOption("extended");
    await page.getByRole("button", { name: /预览提示词/ }).click();
    const editor = page.getByRole("textbox", { name: "提示词", exact: true });
    await editor.fill("我已校正目标：先确认课程预算，再继续。");
    await page
      .locator("button:visible")
      .filter({ hasText: /^只复制提示词$/ })
      .first()
      .click();
    await page.waitForFunction(() => window.copies.length > 0);
    assert.equal(
      await page.evaluate(() => window.copies.at(-1)),
      "我已校正目标：先确认课程预算，再继续。",
    );
    const opened = app.relayCalls.open.length;
    await page.evaluate(() => {
      window.failCopy = true;
    });
    await page.getByRole("button", { name: /带到.*继续/ }).click();
    assert.equal(app.relayCalls.open.length, opened);
    await page
      .getByText("复制失败，编辑内容已保留，可重试或从预览中手动复制；应用尚未打开")
      .waitFor();
    await page.evaluate(() => {
      window.failCopy = false;
    });
    await page.screenshot({ path: `${out}/${width}-handoff.png` });
    await page
      .getByRole("button", { name: "⇄ Agent 迁移", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Agent 迁移",
      exact: true,
    });
    await dialog
      .getByRole("radiogroup", { name: "迁移来源", exact: true })
      .getByRole("radio", { name: "合成 codex · codex", exact: true })
      .click();
    await dialog
      .getByRole("radiogroup", { name: "迁移目标", exact: true })
      .getByRole("radio", { name: "合成 hermes · hermes", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "读取来源内容", exact: true })
      .click();
    await dialog.getByLabel("迁移 AGENTS.md", { exact: true }).check();
    await dialog.getByLabel("迁移 合成技能", { exact: true }).check();
    await dialog
      .getByRole("button", { name: "预览迁移计划", exact: true })
      .click();
    await dialog.getByRole("region", { name: "迁移计划" }).waitFor();
    await dialog.getByText("目标还没有技能目录。本次确认后会在所选 Home 下创建 skills 文件夹，再复制技能。", { exact: true }).waitFor();
    await settle(page);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `${width} page overflow`,
    );
    const geometry = await dialog.evaluate((d) =>
      [...d.querySelectorAll("*")]
        .filter((e) => e.checkVisibility())
        .filter((e) => !e.closest("svg"))
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width && (r.right > innerWidth + 1 || r.left < -1);
        })
        .map((e) => e.tagName + "." + e.className),
    );
    assert.deepEqual(geometry, [], `${width} dialog overflow`);
    await axe(page, `migration ${width}`);
    await page.screenshot({ path: `${out}/${width}-migration-preview.png` });
    await dialog
      .getByRole("button", { name: "确认本次迁移", exact: true })
      .click();
    if (partial) {
      await dialog.getByText("部分项未完成或已变化，请核对", { exact: true }).waitFor();
      assert.equal(
        await dialog
          .getByRole("button", { name: "读取来源内容", exact: true })
          .isDisabled(),
        true,
      );
      await dialog
        .getByRole("button", { name: "查询本次迁移结果", exact: true })
        .click();
    }
    await dialog.getByText("写后回读一致", { exact: true }).waitFor();
    assert.equal(applied, 1);
    await dialog.getByRole("button", { name: "开始使用本次迁移内容", exact: true }).click();
    await dialog.getByText("Skill 名称：synthetic-demo", { exact: true }).waitFor();
    assert.match(await dialog.getByRole("region", { name: "开始使用迁移内容", exact: true }).innerText(), /原生 Agent 的读取和调用尚待确认/);
    await dialog.getByRole("button", { name: "复制接手提示", exact: true }).click();
    await page.waitForFunction(() => window.copies.at(-1)?.includes("/fixture/hermes-home/skills/demo/SKILL.md"));
    assert.match(await page.evaluate(() => window.copies.at(-1)), /\/fixture\/hermes-home\/skills\/demo\/SKILL.md/);
    assert.equal(adoptionReads, 2, "打开材料与复制前各核对一次");
    await dialog.getByRole("button", { name: "预览撤回 合成技能", exact: true }).click();
    await dialog.getByRole("button", { name: "确认撤回本次迁移内容", exact: true }).click();
    await dialog.getByRole("button", { name: "重新核对未决撤回", exact: true }).waitFor();
    assert.equal(lostSkillResponse, true);
    assert.equal(restoreApplies, 1);
    assert.equal(await dialog.getByRole("button", { name: "读取来源内容", exact: true }).isDisabled(), true);
    assert.ok((await page.evaluate(() => Object.keys(localStorage).filter(key => key.includes(":operation:")).map(key => localStorage.getItem(key)))).includes(skillRestoreToken));
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByRole("button", { name: "⇄ Agent 迁移", exact: true }).click();
    await dialog.getByRole("radiogroup", { name: "迁移目标", exact: true }).getByRole("radio", { name: "合成 hermes · hermes", exact: true }).click();
    await dialog.getByRole("button", { name: "重新核对未决撤回", exact: true }).waitFor();
    await dialog.getByRole("button", { name: "读取目标迁移记录", exact: true }).click();
    await dialog.getByRole("button", { name: "重新核对撤回 " + skillRestoreToken, exact: true }).click();
    await dialog.getByRole("heading", { name: "撤回结果", exact: true }).waitFor();
    assert.equal(restoreApplies, 1, "重开后仅查询，不重复撤回");
    assert.equal((await page.evaluate(() => Object.keys(localStorage).filter(key => key.includes(":operation:")).map(key => localStorage.getItem(key)))).includes(skillRestoreToken), false);
    await dialog.getByRole("button", { name: "查询迁移 " + token, exact: true }).click();
    await dialog.getByRole("button", { name: "预览撤回 AGENTS.md", exact: true }).click();
    await dialog.getByRole("button", { name: "确认撤回本次迁移内容", exact: true }).click();
    await dialog.getByText("写后回读一致", { exact: true }).waitFor();
    assert.equal(await dialog.getByRole("radiogroup", { name: "迁移来源", exact: true }).getByRole("radio", { name: "合成 codex · codex", exact: true }).isEnabled(), true);
    assert.equal(applied, 1);
    assert.equal(restoreApplies, 2);
    assert.equal(documentRestored, true);
    await dialog.getByRole("heading", { name: "撤回结果", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/${width}-result.png` });
    await dialog.getByRole("radiogroup", { name: "迁移来源", exact: true }).getByRole("radio", { name: "合成 codex · codex", exact: true }).click();
    assert.equal(await dialog.getByRole("button", { name: "读取来源内容", exact: true }).isEnabled(), true, "撤回核对完成后可开始新读取");
    checks.push({
      width,
      search: true,
      editCopy: true,
      copyFailure: true,
      migration: true,
      restore: true,
      reopenedRestore: true,
      adoption: true,
      overflow: false,
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    out + "/result.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks: checks.length, errors }));
} finally {
  await browser.close();
  await app.close();
}

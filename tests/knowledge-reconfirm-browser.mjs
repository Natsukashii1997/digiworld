// 知识目录身份变化后的本人重新确认，按现行界面一路点到底（L-08）：
// 设置 → 自检「知识开放」要处理 → 管理 → 个人说明 MCP「接入与授权」→ 去重新确认 → 勾选确认 → 再开启个人说明 MCP。
// 只用合成目录与隔离服务；截图等字体和画面就绪后再截（全局 G-11）。
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { knowledge193Fixture } from "./knowledge-v16-fixture.mjs";

const shots = process.env.RECONFIRM_SHOTS || "";
const app = await knowledge193Fixture();
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
try {
  const source = (await app.workspace()).connections.knowledgeSources[0];
  await rename(app.roots[0], `${app.roots[0]}-old`);
  await mkdir(join(app.roots[0], "个人上下文"), { recursive: true });
  await writeFile(join(app.roots[0], "合成.md"), "只用于测试目录换代");
  const failure = await app.call("/knowledge/scan", { sourceId: source.id });
  assert.equal(failure.status, 409);
  assert.equal(failure.body.code, "KNOWLEDGE_ROOT_IDENTITY_CHANGED");

  // 窄屏只核对自检行与无溢出，必须排在确认之前。
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    page.setDefaultTimeout(15000);
    const snap = async (name) => {
      if (!shots) return;
      await page.evaluate(async () => { await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
      await page.screenshot({ path: join(shots, `${viewport.width}-${name}.png`) });
    };
    await page.goto(`${app.url}/#settings`);
    const line = page.locator('[data-line="knowledge"]');
    // 自检行逐字显示，按整行文字轮询，不按单个元素匹配。
    const lineText = async (pattern, present = true) => {
      for (const until = Date.now() + 15000; Date.now() < until; await page.waitForTimeout(100))
        if (pattern.test(await line.innerText()) === present) return;
      assert.fail(`自检行${present ? "未出现" : "仍有"} ${pattern}`);
    };
    await lineText(/「我的 Vault」需重新确认目录/);
    assert.match(await line.getAttribute("class"), /\bbad\b/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "无横向溢出");
    await snap("1-selftest");
    if (viewport.width === 390) { await page.close(); continue; }

    await line.getByRole("button", { name: "管理" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("需重新确认").first().waitFor();
    await dialog.getByRole("button", { name: "接入与授权" }).click();
    await dialog.getByText(/需重新确认目录，确认前不能开启个人说明 MCP/).waitFor();
    await snap("2-profile-hint");
    await dialog.getByRole("button", { name: "去重新确认" }).click();
    const form = dialog.getByRole("region", { name: "重新确认目录" });
    await form.getByText(/目录身份已变化，读取与 Agent 共享已暂停/).waitFor();
    await form.getByRole("checkbox", { name: "我确认仅只读访问此目录" }).check();
    await snap("3-reconfirm-form");
    await form.getByRole("button", { name: "确认重新连接" }).click();
    await form.waitFor({ state: "detached" });
    let state = await app.workspace();
    const receipt = state.connections.knowledgeSourceHealth.find((h) => h.sourceId === source.id);
    assert.equal(receipt.status, "confirmed");
    assert.ok(receipt.confirmedAt);
    assert.equal(state.connections.knowledgeSources.find((s) => s.id === source.id).agentSharing, false);
    assert.equal(state.knowledgeZones?.profileSharing === true, false, "重新确认不替本人开放个人说明");
    await snap("4-confirmed");

    await page.keyboard.press("Escape");
    await lineText(/需重新确认目录/, false);
    await line.getByRole("button", { name: "管理" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "接入与授权" }).click();
    const panel = page.getByRole("dialog");
    await panel.getByRole("checkbox", { name: /我确认允许本机 Agent 通过 MCP 读取/ }).check();
    await panel.getByRole("button", { name: "开启 MCP 读取" }).click();
    await panel.getByText("MCP 读取已开启").waitFor();
    state = await app.workspace();
    assert.equal(state.knowledgeZones.profileSharing, true);
    await snap("5-profile-on");
    await page.close();
  }
  console.log("PASS 设置自检→知识开放→个人说明→去重新确认→本人确认→开启个人说明 MCP；1440/390 无溢出");
} finally { await browser.close(); await app.close(); }

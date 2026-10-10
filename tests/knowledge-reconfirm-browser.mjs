import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { knowledge193Fixture } from "./knowledge-v16-fixture.mjs";

const app = await knowledge193Fixture();
const browser = await chromium.launch();
try {
  const source = (await app.workspace()).connections.knowledgeSources[0];
  await rename(app.roots[0], `${app.roots[0]}-old`);
  await mkdir(app.roots[0]);
  await writeFile(join(app.roots[0], "合成.md"), "只用于测试目录换代");
  const failure = await app.call("/knowledge/scan", { sourceId:source.id });
  assert.equal(failure.status, 409);
  assert.equal(failure.body.code, "KNOWLEDGE_ROOT_IDENTITY_CHANGED");
  const page = await browser.newPage({ viewport:{width:390,height:844}, reducedMotion:"reduce" });
  page.setDefaultTimeout(10000);
  await page.goto(`${app.url}/#home`);
  await page.locator(".topbar-inbox").click();
  const card = page.locator(`[data-item-id="knowledge-source-reconfirm-${source.id}"]`);
  await card.getByText(/需重新确认目录/).waitFor();
  await card.getByRole("button").click();
  const drawer = page.getByRole("dialog", { name:source.name });
  await drawer.getByText(/需重新确认目录：目录身份已变化/).waitFor();
  assert.equal(await drawer.getByRole("button", { name:"扫描文件" }).isDisabled(), true);
  await drawer.getByRole("button", { name:"重新确认目录" }).click();
  const confirm = page.getByRole("dialog", { name:"重新确认目录" });
  await confirm.getByRole("checkbox", { name:"我确认仅只读访问此目录" }).check();
  await confirm.getByRole("button", { name:"确认重新连接" }).click();
  await drawer.getByText(/目录重新确认回执已保存/).waitFor();
  const state = await app.workspace();
  assert.equal(state.connections.knowledgeSourceHealth.find((h) => h.sourceId === source.id).status, "confirmed");
  assert.equal(state.connections.knowledgeSources.find((s) => s.id === source.id).agentSharing, false);
  console.log("PASS 知识身份变化待处理跳转、本人重新确认、持久回执与共享保持关闭");
  await page.close();
} finally { await browser.close(); await app.close(); }

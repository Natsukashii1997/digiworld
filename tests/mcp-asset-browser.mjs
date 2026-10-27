// Run after applying the patch in an isolated fixture build:
// npm run build && node tests/mcp-asset-browser.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { geometry, axe } from './ui-v14-checks.mjs';
import { createRequire } from 'node:module';
import { fixture } from './fixture.mjs';
import { seed, makeAsset } from '../src/store.js';
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
  '/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
);
const app = await fixture({ discovery: { inspectAgentInventory: async () => ({ agentId: 'codex', at: new Date().toISOString(), homes: [], errors: [], truncated: false }) } });
const browser = await chromium.launch();
const errors = [];
try {
  // 用户 2026-10-27 起不再新建 MCP；已有 MCP 资产照常查看、复制与下载，这里直接放进合成主库。
  const initial = seed();
  initial.assets.push(makeAsset({ type: 'MCP', title: 'openai_docs', mcpConfig: { schema: 1, transport: 'streamable-http',
    serverId: 'openai_docs', origin: 'https://developers.openai.com', path: '/mcp', credentialEnvVar: 'DOCS_MCP_TOKEN' } }));
  await app.repository.write(initial, { initialize: true });
  const stamp = '2026-10-07T00:00:00.000Z';
  await app.repository.updateConnections(() => ({
    roots: [], projects: [], agents: [{ id: 'codex', name: 'Codex', kind: '开发 Agent',
      status: 'detected', programs: [{ path: '/fixture/bin/codex', kind: 'CLI' }], configFound: true }],
    github: { status: 'not_connected', login: '', message: '', at: '' },
    projectScannedAt: stamp, agentScannedAt: stamp, errors: [], truncated: false,
    agentTargets: [{ schema: 1, id: 'codex-one', agentId: 'codex', bindingId: 'binding-one',
      label: '合成 Codex CLI', program: { path: '/fixture/bin/codex', kind: 'CLI' },
      home: { id: 'home-one', path: '/fixture/home/codex', label: '合成 Home' },
      createdAt: stamp, updatedAt: stamp }],
  }));
  const context = await browser.newContext({ acceptDownloads: true, reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    window.syntheticCopies = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true,
      value: { writeText: async text => { window.syntheticCopies.push(text); } } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(app.url + '/#assets');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  const form = page.getByRole('dialog', { name: '新建资产' });
  assert.equal(await form.getByRole('radio', { name: 'MCP 配置' }).count(), 0, '新建弹窗不再出现 MCP');
  await form.getByRole('button', { name: '取消' }).click();
  await page.getByRole('button', { name: '查看 openai_docs' }).click();
  const detail = page.getByRole('dialog', { name: '资产详情' });
  assert.equal(await detail.getByLabel('Codex MCP TOML 片段').count(), 0, '未选目标不能生成片段');
  await detail.getByLabel('MCP 配置交付目标').selectOption('codex-one');
  assert.equal(await detail.getByLabel('Codex MCP TOML 片段').innerText(),
    '[mcp_servers."openai_docs"]\nurl = "https://developers.openai.com/mcp"\nbearer_token_env_var = "DOCS_MCP_TOKEN"\n');
  if (process.env.MCP_SCREENSHOT_PATH) {
    await page.waitForTimeout(900); // decorative save animation must finish before visual evidence
    await page.screenshot({ path: process.env.MCP_SCREENSHOT_PATH, fullPage: true });
  }
  await detail.getByRole('button', { name: '复制 Codex 配置片段' }).click();
  await detail.getByRole('status').filter({ hasText: '使用记录已保存' }).waitFor();
  assert.equal((await page.evaluate(() => window.syntheticCopies)).length, 1);
  const stored = await app.repository.read();
  assert.equal(stored.assetActivity.filter(row => row.action === 'copy-mcp-config').length, 1);
  assert.equal(stored.assets.find(row => row.type === 'MCP').versions.length, 1);
  const download = page.waitForEvent('download');
  await detail.getByRole('button', { name: '下载 TOML 片段' }).click();
  assert.match((await download).suggestedFilename(), /^mcp-openai_docs-.*\.toml$/);
  await page.locator('.is-transferred').waitFor({state:'detached'});
  const out=process.env.GUIJI_TEST_RESULTS||'test-results/mcp-asset';
  await mkdir(out,{recursive:true});
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});
    await geometry(page,'[role=dialog]',`MCP ${width}`);
    await axe(page,`MCP ${width}`);
    await page.screenshot({path:join(out,`mcp-${width}.png`),fullPage:true});
  }
  await page.reload();
  await page.getByRole('button', { name: '查看 openai_docs' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '查看 openai_docs' }).count(), 1);
  assert.deepEqual(errors, []);
  console.log('mcp-asset-browser: no-create, target, copy/count, download, reload passed');
  await context.close();
} finally {
  await browser.close();
  await app.close();
}

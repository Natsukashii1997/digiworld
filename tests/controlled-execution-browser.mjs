// Run only after applying the candidate patch and building the isolated UI.
// No real Agent, project, Vault, network endpoint, or live 5178 service.
import assert from 'node:assert/strict';
import {geometry,axe} from './ui-v14-checks.mjs';
import {sameEventClickAndEscape} from './ui-capability-browser-guards.mjs';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { fixture } from './fixture.mjs';
import { seed } from '../src/store.js';

const sha = text => createHash('sha256').update(text).digest('hex');
const artifacts = new Map();
const calls = [];
const controlledExecution = {
  executionMode: 'synthetic',
  resolveTarget: async ({ projectId, targetId }) => ({ projectId, targetId,
    identity: sha('synthetic-target'), workspaceRef: 'synthetic-worktree' }),
  authorizeRun: async input => ({ ...input, enabled: true, generation: 'browser-synthetic-grant' }),
  adapter: {
    discover: async () => ({ recognized: true, identity: sha('synthetic-executor'),
      canExecute: true, canStop: true, canProbe: true, canCollect: true,
      hardLimits: true, isolation: 'synthetic' }),
    executeRound: async input => {
      calls.push(input.step.id);
      const content = `合成产物：${input.step.id} · ${input.goal}`;
      const artifactRef = `controlled-artifact:${input.runId}-${input.step.id}`;
      artifacts.set(artifactRef, Buffer.from(content));
      return { status: 'verified', acceptanceMet: true,
        outputReceipt: { artifactRef, sha256: sha(content) } };
    },
    probeProcess: async () => ({ status: 'running' }),
    stop: async () => ({ requested: true }),
    readArtifact: async ({ artifactRef }) => artifacts.get(artifactRef),
  },
};
const app = await fixture({ controlledExecution });
assert.notEqual(new URL(app.url).port, '5178');
const projectRoot = await realpath(await mkdtemp(join(tmpdir(), 'guiji-controlled-project-')));
await app.repository.write(seed(), { initialize: true });
await app.repository.updateConnections(() => ({
  roots: [], projects: [{ id: 'project-1', name: '合成项目', kind: 'Git',
    repoKey: '', localPaths: [projectRoot], branch: 'main', active: true }],
  agents: [], github: { status: 'not_connected', login: '', message: '', at: '' },
  projectScannedAt: '', agentScannedAt: '', errors: [], truncated: false,
}));
const output = process.env.GUIJI_TEST_RESULTS || join(tmpdir(), 'guiji-controlled-browser-results');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce' });
const page = await context.newPage();
const forbidden = [], pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => {
  const url = new URL(request.url());
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol !== 'data:')
    forbidden.push(url.href);
});
try {
  await page.goto(app.url + '/#collab');
  await page.getByRole('button', { name: '受控执行状态' }).click();
  const drawer = page.getByRole('dialog', { name: '受控执行' });
  await drawer.getByText('仅合成执行适配器可用').waitFor();
  await drawer.getByLabel('目标', { exact: true }).fill('验证合成项目');
  await drawer.getByLabel('可核验标准').fill('产物 SHA 一致');
  await drawer.getByLabel('两步任务').check();
  await drawer.getByLabel('第二步目标').fill('复核第一步产物');
  await drawer.getByRole('button', { name: '预览锁定目标与预算' }).click();
  await drawer.getByText('核验详情', { exact: true }).click();
  await drawer.getByText('计划 SHA-256').waitFor();
  await drawer.getByLabel('我确认只运行这份锁定的合成任务与预算').check();
  let confirms=0;await page.route('**/api/controlled-execution/confirm',async route=>{confirms++;const response=await route.fetch();assert.equal(response.status(),200);await route.abort();});
  await sameEventClickAndEscape(page,drawer.getByRole('button',{name:'确认计划',exact:true}),'/api/controlled-execution/confirm');
  await drawer.getByRole('alert').filter({hasText:'原操作结果待核对'}).waitFor();assert.equal(confirms,1);
  await drawer.getByRole('button',{name:'查询原编号',exact:true}).click();
  await drawer.getByText(/^运行编号：/).waitFor();
  await drawer.getByRole('button', { name: '开始当前步骤' }).click();
  for (let i = 0; i < 30; i++) {
    await drawer.getByRole('button', { name: '刷新记录' }).click();
    if (await drawer.getByRole('button', { name: '核对第一步与下一步' }).isVisible().catch(() => false)) break;
    await page.waitForTimeout(30);
  }
  assert.equal(calls.length, 1, 'second step must not start before human gate');
  await drawer.getByRole('button', { name: '核对第一步与下一步' }).click();
  await drawer.getByLabel('我已核对第一步证据，允许开放第二步').check();
  await drawer.getByRole('button', { name: '确认人工门' }).click();
  assert.equal(calls.length, 1, 'gate approval itself must not launch step two');
  await drawer.getByRole('button', { name: '开始当前步骤' }).click();
  for (let i = 0; i < 30; i++) {
    await drawer.getByRole('button', { name: '刷新记录' }).click();
    if (await drawer.getByText('step-2 · verified').isVisible().catch(() => false)) break;
    await page.waitForTimeout(30);
  }
  assert.deepEqual(calls, ['step-1', 'step-2']);
  await drawer.getByRole('button', { name: '取回已核验产物' }).last().click();
  await drawer.getByText('合成产物：step-2').waitFor();
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:950});await geometry(page,'[role=dialog]',`受控执行 ${width}`);await axe(page,`受控执行 ${width}`);await page.screenshot({path:join(output,`controlled-execution-${width}.png`)});}
  assert.deepEqual(forbidden, []);
  assert.deepEqual(pageErrors, []);
  console.log('PASS T06 synthetic browser: two steps, human gate, artifact recovery');
} finally {
  await browser.close();
  await app.close();
  await rm(projectRoot, { recursive: true, force: true });
}

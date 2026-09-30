import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import {
  projectIdentityFixture,
  identityCurrent,
} from "./project-identity-fixture.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const output = process.env.GUIJI_TEST_RESULTS || "test-results";
await mkdir(output, { recursive: true });
const app = await projectIdentityFixture();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
page.setDefaultTimeout(6000);
const errors = [],
  flows = [],
  audits = [],
  calls = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (r.url().includes("/api/project-identity/"))
    calls.push(new URL(r.url()).pathname);
});
const button = (name) => page.getByRole("button", { name, exact: true });
const panel = () =>
  page.getByRole("region", { name: "项目目录与身份", exact: true });
const preview = () =>
  page.getByRole("region", { name: "项目关联预览", exact: true });
const confirmation = () =>
  page.getByRole("checkbox", {
    name: "只修改工作台关联，不搬移或删除文件",
    exact: true,
  });
const passed = (name) => {
  flows.push(name);
  console.log("PASS " + name);
};
const audit = async (name) => {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  audits.push({ name, violations: result.violations });
  assert.deepEqual(result.violations, []);
};
const screenshot = (name) =>
  page.screenshot({ path: join(output, `project-identity-${name}.png`) });
async function open(projectId, fixture = app) {
  await page.goto(fixture.url + "/#projects");
  await page.reload();
  const project = (await fixture.workspace()).connections.projects.find(
    (p) => p.id === projectId,
  );
  assert.ok(project);
  await page
    .locator(".project-discovery-row")
    .filter({ hasText: project.name })
    .click();
  await panel().waitFor();
}
async function makePreview(candidateId, replacePath = "") {
  if (await button("返回选择").count()) await button("返回选择").click();
  if (await button("关联已发现目录").count())
    await button("关联已发现目录").click();
  await page.getByLabel("已发现的项目目录").selectOption(candidateId);
  await page.getByLabel("替换缺失目录（可选）").selectOption(replacePath);
  await button("预览关联").click();
  await preview().waitFor();
}
async function confirm() {
  await confirmation().check();
  await button("确认关联").click();
}
async function refresh() {
  await button("刷新核对关联").click();
  await page
    .getByText("已刷新关联，请核对目录列表。", { exact: true })
    .waitFor();
}
const confirmCount = () => calls.filter((p) => p.endsWith("/confirm")).length;
let other;
try {
  const original = await app.projectAt(app.original),
    id = original.id;
  await app.bind(id, app.original);
  const beforeBinding = (await app.workspace()).connections.contextBindings[0];
  const destination = await app.move(app.original, "P01移动后的项目目录");
  const moved = await app.scan();
  assert.equal(
    moved.connections.projects
      .find((p) => p.id === id)
      .locations.find((l) => l.path === app.original).status,
    "missing",
  );
  const candidate = await app.projectAt(destination);
  await open(id);
  await page.getByText("目录缺失", { exact: true }).waitFor();
  await button("复制项目 ID").click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), id);
  assert.equal(
    await panel().count(),
    1,
    "通知触发重新渲染后只允许一个项目目录面板",
  );
  await screenshot("missing-1440");
  await audit("missing overview");
  passed("移动后保留原身份，旧目录明确缺失，项目 ID 可真实复制");

  await makePreview(candidate.id, app.original);
  assert.equal(await button("确认关联").isDisabled(), true);
  assert.equal(
    await preview().evaluate((el) => el === document.activeElement),
    true,
  );
  assert.match(await preview().innerText(), /Current 来源选择保留/);
  await screenshot("merge-preview-1440");
  await preview().screenshot({
    path: join(output, "project-identity-preview-crop.png"),
  });
  await audit("replace preview");
  await confirm();
  await page
    .getByText("项目关联已更新，原文件未改动。", { exact: true })
    .waitFor();
  const merged = await app.workspace(),
    stable = merged.connections.projects.find((p) => p.id === id);
  assert.deepEqual(stable.localPaths, [destination]);
  assert.ok(stable.aliases.includes(candidate.id));
  assert.equal(
    merged.connections.projects.some((p) => p.id === candidate.id),
    false,
  );
  assert.deepEqual(merged.connections.contextBindings[0], beforeBinding);
  assert.equal(
    await readFile(join(destination, "CURRENT.md"), "utf8"),
    identityCurrent,
  );
  await page
    .getByText("Current 需重新预览并保存连接。", { exact: true })
    .waitFor();
  assert.equal(await button("复制项目交接包").isDisabled(), true);
  await screenshot("merged-1440");
  passed(
    "预览与明确确认后保留 ID/别名；替换只改关联；Current 指针不被静默迁移",
  );

  await page.getByLabel("来源目录").selectOption(destination);
  await button("预览文件").click();
  await page.getByText("已读取 2 份来源", { exact: true }).waitFor();
  await button("保存连接").click();
  await page.getByText("已连接 · 仅保存来源位置", { exact: true }).waitFor();
  await button("复制项目交接包").click();
  await page.getByText("已复制 · 未发送给 Agent", { exact: true }).waitFor();
  const pack = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(pack.includes(destination));
  assert.ok(!pack.includes(app.original));
  assert.ok(!pack.includes("当前目标：核验项目身份"));
  await app.restart();
  await open(id);
  assert.deepEqual((await app.projectAt(destination)).localPaths, [
    destination,
  ]);
  assert.equal(await page.getByLabel("来源目录").inputValue(), destination);
  const rescanned = await app.scan();
  assert.equal(
    rescanned.connections.projects.filter((p) =>
      p.localPaths.includes(destination),
    ).length,
    1,
  );
  assert.equal((await app.projectAt(destination)).id, id);
  passed("Current 重新预览保存后可交接；服务重启持久化与重扫无重复身份");

  const oldIdentity = (await app.projectAt(destination)).locations[0].identity;
  const retained = await app.replace(destination);
  await app.remote(destination, "synthetic/replaced-directory");
  await app.scan();
  await open(id);
  await page.getByText("目录已更换 · 待确认", { exact: true }).waitFor();
  assert.equal(await button("复制项目交接包").isDisabled(), true);
  const changedIdentity = (await app.projectAt(destination)).locations[0]
    .observedIdentity;
  assert.ok(changedIdentity && changedIdentity !== oldIdentity);
  await app.unknownLocation(destination);
  await open(id);
  await page.getByText("未核实", { exact: true }).waitFor();
  assert.equal(
    (await app.projectAt(destination)).locations[0].observedIdentity,
    changedIdentity,
  );
  assert.equal(await button("复制项目交接包").isDisabled(), true);
  assert.equal(
    await button("重新确认目录").count(),
    1,
    "changed 后观测 unknown 不能隐藏目录重新确认入口",
  );
  passed("目录更换后暂时未核实仍保留重确认入口，旧 Current 继续阻断");
  await button("重新确认目录").click();
  await preview().waitFor();
  await page.getByText("目录身份变化", { exact: true }).click();
  assert.ok((await preview().innerText()).includes(oldIdentity));
  assert.match(
    await preview().innerText(),
    /未关联 → synthetic\/replaced-directory/,
  );
  await screenshot("changed-remote-preview-1440");
  await confirm();
  await page
    .getByText("项目关联已更新，原文件未改动。", { exact: true })
    .waitFor();
  assert.notEqual(
    (await app.projectAt(destination)).locations[0].identity,
    oldIdentity,
  );
  assert.equal(
    (await app.projectAt(destination)).locations[0].status,
    "present",
  );
  assert.equal(
    await readFile(join(retained, "CURRENT.md"), "utf8"),
    identityCurrent,
  );
  assert.equal(
    await readFile(join(destination, "CURRENT.md"), "utf8"),
    identityCurrent,
  );
  await audit("accepted directory replacement");
  passed("同路径目录更换保持待确认；显式接受新身份，不改原/新文件");
  assert.equal((await app.projectAt(destination)).id, id);
  assert.equal(
    (await app.projectAt(destination)).repoKey,
    "synthetic/replaced-directory",
  );
  assert.equal(await button("复制项目交接包").isDisabled(), true);
  await page
    .getByText("Current 需重新预览并保存连接。", { exact: true })
    .waitFor();
  passed(
    "目录更换的新远端先显示旧→新；确认保留 ID、采用新 repo 并要求重存 Current",
  );

  other = await projectIdentityFixture();
  const second = await other.addProject("P01第二个有来源的项目");
  await other.remote(other.original, "synthetic/one");
  await other.remote(second, "synthetic/two");
  await other.scan();
  const one = await other.projectAt(other.original),
    two = await other.projectAt(second);
  await other.bind(one.id, other.original);
  await other.bind(two.id, second);
  await other.remote(second, "synthetic/one");
  await other.scan();
  await open(one.id, other);
  assert.equal((await other.workspace()).connections.projects.length, 2);
  await page.getByText("项目身份待确认", { exact: true }).last().waitFor();
  await button("关联已发现目录").click();
  await page.getByLabel("已发现的项目目录").selectOption(two.id);
  await button("预览关联").click();
  await page
    .getByRole("alert")
    .filter({ hasText: /候选项目已有 Current/ })
    .waitFor();
  assert.equal(await page.getByLabel("已发现的项目目录").inputValue(), two.id);
  assert.equal(await preview().count(), 0);
  assert.equal((await other.workspace()).connections.contextBindings.length, 2);
  await audit("dual Current conflict");
  await screenshot("conflict-1440");
  await open(two.id, other);
  await button("断开连接").click();
  await page
    .getByText("选择已有状态文件，原文件保持不变。", { exact: true })
    .waitFor();
  await open(one.id, other);
  await makePreview(two.id);
  assert.equal(await button("确认关联").isDisabled(), true);
  assert.equal(
    await readFile(join(second, "CURRENT.md"), "utf8"),
    identityCurrent,
  );
  passed(
    "双 Current 冲突拒绝且保留两指针；显式解绑候选后可重新预览，无自动选来源",
  );
  await other.close();
  other = null;

  const additional = await app.addProject("P01待追加目录");
  await app.scan();
  const extra = await app.projectAt(additional);
  await open(id);
  await makePreview(extra.id);
  const untouched = (await app.projectAt(destination)).localPaths;
  await app.newVersion();
  await confirm();
  await page
    .getByRole("alert")
    .filter({ hasText: /更新主库|主库已变化/ })
    .waitFor();
  assert.deepEqual((await app.projectAt(destination)).localPaths, untouched);
  assert.equal(await preview().count(), 0);
  assert.equal(
    await page.getByLabel("已发现的项目目录").inputValue(),
    extra.id,
  );
  await refresh();
  passed("跨客户端 revision 改变拒绝旧确认；保留选择并先刷新核对");

  await makePreview(extra.id);
  app.advance(300001);
  await confirm();
  await page
    .getByRole("alert")
    .filter({ hasText: /预览已失效/ })
    .waitFor();
  assert.deepEqual((await app.projectAt(destination)).localPaths, untouched);
  app.resetClock();
  await refresh();
  passed("过期预览拒绝，不修改目录关系，也不复用旧凭证");

  await makePreview(extra.id);
  let dispatched = 0;
  await page.route("**/api/project-identity/confirm", async (route) => {
    dispatched++;
    await route.fetch();
    await route.abort("failed");
  });
  await confirmation().check();
  const attempts = confirmCount();
  await button("确认关联").evaluate((el) => {
    el.click();
    el.click();
  });
  await page
    .getByRole("status")
    .filter({ hasText: /关联结果待核对/ })
    .waitFor();
  await page
    .getByRole("alert")
    .filter({ hasText: /本地服务连接中断/ })
    .waitFor();
  assert.equal(dispatched, 1);
  assert.equal(confirmCount() - attempts, 1);
  assert.equal(await preview().count(), 0);
  assert.equal(await button("预览关联").isDisabled(), true);
  assert.ok((await app.projectAt(destination)).localPaths.includes(additional));
  await page.unroute("**/api/project-identity/confirm");
  await refresh();
  assert.equal(confirmCount() - attempts, 1);
  await open(id);
  assert.equal(confirmCount() - attempts, 1);
  assert.ok((await app.projectAt(destination)).aliases.includes(extra.id));
  passed("双击只发一次确认；已提交响应丢失后刷新恢复，不重放写请求");

  const longPath = await app.addProject(
    "P01长目录-" + "abcdefghijklmnopqrstuvwxyz".repeat(3),
  );
  await app.scan();
  const longCandidate = await app.projectAt(longPath);
  await open(id);
  let release, arrived;
  const gate = new Promise((r) => {
    release = r;
  });
  const waiting = new Promise((r) => {
    arrived = r;
  });
  let finished;
  const done = new Promise((r) => {
    finished = r;
  });
  await page.route("**/api/project-identity/preview", async (route) => {
    const response = await route.fetch();
    arrived();
    await gate;
    await route.fulfill({ response });
    finished();
  });
  await button("关联已发现目录").click();
  await page.getByLabel("已发现的项目目录").selectOption(longCandidate.id);
  await button("预览关联").click();
  await waiting;
  await button("关闭").click();
  release();
  await done;
  await page.unroute("**/api/project-identity/preview");
  await open(id);
  assert.equal(await preview().count(), 0);
  assert.equal(
    await page
      .getByRole("region", { name: "项目关联结果", exact: true })
      .count(),
    0,
  );
  passed("关闭抽屉后忽略晚到预览，不污染重新打开的项目");

  await makePreview(longCandidate.id);
  await confirmation().focus();
  await page.keyboard.press("Space");
  assert.equal(await confirmation().isChecked(), true);
  await page.keyboard.press("Tab");
  assert.equal(
    await button("返回选择").evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await button("确认关联").evaluate((el) => el === document.activeElement),
    true,
  );
  assert.ok(
    await button("确认关联").evaluate(
      (el) => parseFloat(getComputedStyle(el).outlineWidth) > 0,
    ),
  );
  passed("确认框可键盘 Space 操作，Tab 顺序与可见焦点正常");
  for (const width of [320, 375, 390, 393, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width >= 768 ? 1000 : 852 });
    await preview().scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    for (const region of [panel(), preview()])
      assert.equal(
        await region.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        true,
      );
    const bounds = await preview()
      .locator("button")
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const r = button.getBoundingClientRect();
          return { width: r.width, height: r.height };
        }),
      );
    assert.ok(
      bounds.every((b) => b.width >= 44 && b.height >= 44),
      JSON.stringify(bounds),
    );
    assert.ok(
      (await preview().locator(".project-location-confirm").boundingBox())
        .height >= 44,
    );
    await screenshot(`preview-${width}`);
    await audit(`preview ${width}`);
    passed(`${width}px 长路径预览无溢出，主要操作44px，axe无违规`);
  }
  assert.deepEqual(errors, []);
  await writeFile(
    join(output, "project-identity-report.json"),
    JSON.stringify(
      { flows, audits, errors, staticRoot: app.staticRoot },
      null,
      2,
    ),
  );
  console.log(
    `PASS project identity browser: ${flows.length} flows, ${audits.length} axe scans`,
  );
} catch (error) {
  await screenshot("failure").catch(() => {});
  await writeFile(
    join(output, "project-identity-report.json"),
    JSON.stringify(
      {
        flows,
        audits,
        errors,
        failure: error.stack,
        staticRoot: app.staticRoot,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
  await other?.close();
  await app.close();
}

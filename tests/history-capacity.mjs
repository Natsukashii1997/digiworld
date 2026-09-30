import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture } from "./fixture.mjs";
import { makeAsset, revise, seed } from "../src/store.js";
import { stringify } from "../src/serialization.js";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const lineCount = 499;
const browser = await chromium.launch({ headless: true });

function skillFiles(fileCount, line) {
  return [
    { path: "SKILL.md", text: true, data: "# 容量验收\n", mode: 0o644 },
    ...Array.from({ length: fileCount - 1 }, (_, i) => ({
      path: `docs/file-${i}.md`,
      text: true,
      data: `${line}\n`.repeat(lineCount),
      mode: 0o644,
    })),
  ];
}

try {
  // 101 reproduces the review finding; 300 is the accepted package-file limit.
  for (const fileCount of [101, 300]) {
    const app = await fixture();
    let page;
    try {
      const session = await (
        await fetch(`${app.url}/api/session`, {
          headers: { "x-workbench-client": "1" },
        })
      ).json();
      const title = `历史容量验收 ${fileCount} 文件`;
      const original = makeAsset({
        type: "Skill",
        title,
        content: "# 容量验收\n",
        files: skillFiles(fileCount, "old"),
      });
      const updated = revise(original, {
        files: skillFiles(fileCount, "new"),
      });
      const response = await fetch(`${app.url}/api/workspace`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-workbench-token": session.token,
        },
        body: stringify({ state: { ...seed(), assets: [updated] } }),
      });
      assert.equal(response.status, 200, "容量样本必须通过主库正常校验");

      page = await browser.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${app.url}/#assets`);
      await page
        .getByRole("button", { name: `查看 ${title}`, exact: true })
        .click();
      await page
        .getByRole("button", { name: "版本记录 2", exact: true })
        .click();
      const changes = page.locator(".history-file-changes");
      await changes.waitFor();
      assert.equal(
        await changes.locator(":scope > details").count(),
        fileCount - 1,
      );
      assert.equal(await changes.locator("details[open]").count(), 0);
      assert.equal(
        await page.locator(".diff-line").count(),
        0,
        "折叠文件不得提前挂载隐藏差异行",
      );
      const collapsedNodes = await page.locator("*").count();
      // A generous linear allowance for shell, file inventory and summaries;
      // this rejects the former ~4,000 DOM nodes per closed 499-line file.
      const nodeBudget = 3000 + fileCount * 20;
      assert.ok(
        collapsedNodes <= nodeBudget,
        `默认 DOM ${collapsedNodes} 超出线性摘要预算 ${nodeBudget}`,
      );

      const firstFile = changes.locator(":scope > details").first();
      await firstFile.locator("summary").click();
      await page.waitForFunction(
        (expected) =>
          document.querySelectorAll(".diff-line").length === expected,
        lineCount * 2,
      );
      assert.equal(await changes.locator("details[open]").count(), 1);
      assert.deepEqual(
        await firstFile.locator(".diff-line.removed pre").allTextContents(),
        Array(lineCount).fill("old"),
      );
      assert.deepEqual(
        await firstFile.locator(".diff-line.added pre").allTextContents(),
        Array(lineCount).fill("new"),
      );
      assert.equal(await firstFile.locator(".diff-line.same").count(), 0);
      assert.deepEqual(
        await firstFile.locator(".line-ending").allTextContents(),
        Array(lineCount * 2).fill("LF"),
      );
      const expandedNodes = await page.locator("*").count();
      assert.ok(
        expandedNodes <= collapsedNodes + lineCount * 2 * 5 + 30,
        "展开只应增加当前文件的差异节点，不应挂载其他折叠文件",
      );

      await firstFile.locator("summary").click();
      await page.waitForFunction(
        () => document.querySelectorAll(".diff-line").length === 0,
      );
      assert.equal(await changes.locator("details[open]").count(), 0);
      assert.equal(await changes.locator(".text-difference").count(), 0);
      const releasedNodes = await page.locator("*").count();
      assert.ok(
        releasedNodes <= collapsedNodes + 10,
        "折叠后应释放差异 DOM，不只是通过 CSS 隐藏",
      );
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${fileCount} 文件 × ${lineCount} 行：默认 0 差异行，展开 ${lineCount * 2} 行准确差异，折叠释放；DOM ${collapsedNodes} → ${expandedNodes} → ${releasedNodes}`,
      );
    } finally {
      if (page) await page.close();
      await app.close();
    }
  }
} finally {
  await browser.close();
}

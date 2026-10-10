import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
import { seed, revise } from "../src/store.js";
import { readFile } from "node:fs/promises";
import { parse, stringify } from "../src/serialization.js";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const app = await fixture(),
  browser = await chromium.launch();
try {
  const p = await browser.newPage();
  await p.route(app.url + "/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Legacy fixture</title>",
    }),
  );
  await p.goto(app.url + "/#assets");
  const legacy = seed();
  legacy.revision = 14;
  legacy.notes = [
    {
      id: "legacy-note",
      text: "旧版记录必须保留",
      at: new Date().toISOString(),
    },
  ];
  legacy.assets[0] = revise(legacy.assets[0], {
    type: "Skill",
    title: "旧版编辑资产",
  });
  await p.evaluate(
    (s) =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("guiji-workbench-v1", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("state");
        r.onsuccess = () => {
          const tx = r.result.transaction("state", "readwrite");
          tx.objectStore("state").put(s, "workspace");
          tx.oncomplete = () => resolve();
          tx.onerror = reject;
        };
      }),
    legacy,
  );
  await p.unroute(app.url + "/");
  await p.goto(app.url + "/#notes");
  await p.reload();
  await p.getByText("旧版记录必须保留", { exact: true }).waitFor();
  const old = await p.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("guiji-workbench-v1", 1);
        r.onsuccess = () => {
          const q = r.result
            .transaction("state")
            .objectStore("state")
            .get("workspace");
          q.onsuccess = () => resolve(q.result);
        };
      }),
  );
  assert.equal(old.revision, 14);
  assert.equal(old.notes[0].id, "legacy-note");
  const fresh = await browser.newPage();
  await fresh.goto(app.url + "/#notes");
  await fresh.getByText("旧版记录必须保留", { exact: true }).waitFor();
  await fresh.close();
  console.log("PASS 旧版自动迁移不修改 IndexedDB；新浏览器读取相同文件主库");
  await p.goto(app.url + "/#settings");
  await p.getByRole("radio",{name:"数据与备份",exact:true}).click();
  const waiting = p.waitForEvent("download");
  await p.getByRole("button", { name: "导出可合并数据 JSON", exact: true }).click();
  const backup = parse(await readFile(await (await waiting).path(), "utf8"));
  assert.equal(backup.format, "guiji-backup");
  assert.equal(backup.state.notes[0].id, "legacy-note");
  backup.state.notes.push({
    id: "backup-note",
    text: "从备份新增的记录",
    at: new Date().toISOString(),
  });
  await p
    .getByLabel("导入备份文件")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(stringify(backup)),
    });
  await p.getByRole("dialog", { name: "确认合并备份" }).waitFor();
  await p.getByRole("button", { name: "确认合并", exact: true }).click();
  await p.getByRole("status").filter({ hasText: "备份已合并" }).waitFor();
  await p.goto(app.url + "/#notes");
  await p.getByText("旧版记录必须保留", { exact: true }).waitFor();
  await p.getByText("从备份新增的记录", { exact: true }).waitFor();
  console.log("PASS UI 导出、选择备份、预览、确认合并、回读及保留旧记录");
} finally {
  await browser.close();
  await app.close();
}

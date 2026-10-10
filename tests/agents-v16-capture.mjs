import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { agentsV16Fixture } from "./agents-v16-fixture.mjs";
import { selectAgentTab } from "./agents-v16-helpers.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const out = resolve(
    process.env.GUIJI_TEST_RESULTS || "test-results/agents-v16-capture",
  ),
  before = process.env.GUIJI_CAPTURE_BEFORE === "1";
await mkdir(out, { recursive: true });
const app = await agentsV16Fixture(),
  b = await chromium.launch();
const measurements = [];
try {
  for (const width of [1440, 390]) {
    const context = await b.newContext({
        viewport: { width, height: 1000 },
        timezoneId: "Asia/Shanghai",
        reducedMotion: "reduce",
      }),
      p = await context.newPage();
    p.setDefaultTimeout(10000);
    await context.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== new URL(app.url).origin) throw new Error("非合成来源");
      return r.continue();
    });
    await p.goto(app.url + "/#agents");
    await p.locator("main h1").waitFor();
    if (before) {
      await p.locator(".role-roster [role=radio]").first().waitFor();
      await p.screenshot({
        path: join(out, `before-${width}.png`),
        fullPage: true,
      });
    } else {
      await p
        .getByRole("button", { name: "找最近的会话", exact: true })
        .click();
      await p
        .locator(".relay-title")
        .getByText("UI v16", { exact: false })
        .waitFor();
      await p.locator(".prompt-toggle:not([disabled])").waitFor();
      await selectAgentTab(p, "codex", "内容");
      await p.getByRole("button", { name: "展开清单", exact: true }).click();
      await p.getByRole("button", { name: "收起清单", exact: true }).waitFor();
      await p
        .locator(".role-check-legend")
        .getByText(/■ 失效链接 2：/)
        .waitFor();
      await selectAgentTab(p, "codex", "档案");
      await p.addStyleTag({ content: ".launch{position:static!important}" });
      await p.evaluate(() => scrollTo(0, 0));
      const shot = async (name) => {
        await p.evaluate(() => {
          document.activeElement?.blur?.();
          scrollTo(0, 0);
        });
        await p.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        await p.screenshot({
          path: join(out, `${name}-${width}.png`),
          fullPage: true,
        });
        measurements.push({
          name,
          width,
          regions: await p.evaluate(() =>
            Object.fromEntries(
              ["page-heading", "relay", "select", "launch", "archive"].map(
                (c) => {
                  const e = document.querySelector("main ." + c);
                  if (!e) return [c, null];
                  const r = e.getBoundingClientRect();
                  return [
                    c,
                    {
                      x: r.x,
                      y: r.y + scrollY,
                      width: r.width,
                      height: r.height,
                    },
                  ];
                },
              ),
            ),
          ),
        });
      };
      await shot("main");
      await p.getByRole("button", { name: /预览提示词/ }).click();
      await p.locator("pre.prompt").waitFor();
      await shot("preview");
      app.model.empty = true;
      await p.getByRole("button", { name: "找更早的", exact: true }).click();
      await p
        .getByRole("heading", { name: "没找到最近 7 天的会话", exact: true })
        .waitFor();
      await shot("empty");
      app.model.empty = false;
    }
    await context.close();
  }
} finally {
  await b.close();
  await app.close();
}
await writeFile(
  join(out, "regions.json"),
  JSON.stringify(measurements, null, 2),
);
console.log("PASS 合成截图 " + measurements.length + "组");

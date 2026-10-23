// FN-516 视觉稿截图与基本检查：node docs/design/floating-notes/build/shoot.mjs
// 只读取本目录的静态 HTML，不启动服务、不读真实数据。
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(dirname(fileURLToPath(import.meta.url)));
const url = pathToFileURL(join(dir, "floating-notes-v1.html")).href;
const out = join(dir, "shots");
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const report = { url, checks: [] };
const check = (name, ok, detail = "") => report.checks.push({ name, ok, detail });

async function page(width, height = 900, reduced = false) {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: reduced ? "reduce" : "no-preference" });
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await p.goto(url);
  await p.waitForTimeout(300);
  return { p, errors };
}

// 1440：整页与分区
{
  const { p, errors } = await page(1440, 900, true);
  await p.screenshot({ path: join(out, "board-1440-full.png"), fullPage: true });
  for (const id of ["main", "ball-sec", "panel-sec", "pos-sec", "spec-sec", "rec-sec"]) {
    await p.locator("#" + id).screenshot({ path: join(out, `${id}-1440.png`) });
  }
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check("1440 无横向溢出", overflow <= 0, `scrollWidth-innerWidth=${overflow}`);
  // 便签栏内部不溢出、控件命中区
  const geo = await p.evaluate(() => {
    const bad = [];
    document.querySelectorAll(".fn-panel").forEach((pn, i) => {
      pn.querySelectorAll(".sn, .fn-ft, .fn-hd").forEach((el) => { if (el.scrollWidth > el.clientWidth + 1) bad.push(`panel${i}:${el.className}`); });
    });
    const small = [...document.querySelectorAll("#panels .fn-hd .fn-icon, #panels .fn-ft .open")].filter((b) => { const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length;
    const ball = document.querySelector("#ball").getBoundingClientRect();
    return { bad, small, ball: [ball.width, ball.height] };
  });
  check("便签栏内容无横向溢出", geo.bad.length === 0, geo.bad.join(","));
  check("栏头/栏底按钮命中区 ≥44px", geo.small === 0, `不达标 ${geo.small}`);
  check("球直径 52px（主画面 1:1 时）", Math.round(geo.ball[0]) === 52, JSON.stringify(geo.ball));
  check("1440 无脚本错误", errors.length === 0, errors.join(" | "));
  await p.close();
}

// 演示交互：收起、悬停、拖到左边、编辑与自动保存、状态切换
{
  const { p, errors } = await page(1440, 900);
  const ball = p.locator("#ball");
  await ball.click();
  await p.waitForTimeout(350);
  check("点球收起", await p.locator("#dp.is-hidden").count() === 1);
  await ball.hover();
  await p.waitForTimeout(250);
  await p.locator("#main .desk-fit").screenshot({ path: join(out, "demo-collapsed-hover.png") });
  const b = await ball.boundingBox();
  await p.mouse.move(b.x + 26, b.y + 26);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(b.x + 26 - i * 90, b.y + 26 + i * 20);
  await p.locator("#main .desk-fit").screenshot({ path: join(out, "demo-dragging.png") });
  await p.mouse.up();
  await p.waitForTimeout(200);
  await ball.click();
  await p.waitForTimeout(350);
  const side = await p.evaluate(() => { const bl = document.querySelector("#ball").getBoundingClientRect(), pn = document.querySelector("#dp").getBoundingClientRect(); return { ballLeft: bl.left, panelLeft: pn.left, panelRight: pn.right }; });
  check("拖到左侧后吸边且栏向右展开", side.panelLeft > side.ballLeft, JSON.stringify(side));
  await p.locator("#main .desk-fit").screenshot({ path: join(out, "demo-left-open.png") });
  await p.locator("#dp [data-new]").click();
  await p.keyboard.type("周日给爸妈打电话");
  await p.waitForTimeout(1200);
  const saving = await p.locator("#dp .fn-ft").getAttribute("data-s");
  await p.locator("#main .desk-fit").screenshot({ path: join(out, "demo-editing-saving.png") });
  await p.waitForTimeout(1000);
  const saved = await p.locator("#dp .fn-ft").getAttribute("data-s");
  check("停手后 保存中 → 已保存", saving === "saving" && saved === "ok", `${saving}→${saved}`);
  for (const m of ["draft", "failed", "conflict", "empty"]) {
    await p.locator(`[data-demo=${m}]`).click();
    await p.waitForTimeout(300);
    await p.locator("#main .desk-fit").screenshot({ path: join(out, `demo-${m}.png`) });
  }
  check("球状态点随状态切换", await p.locator("#ball").getAttribute("data-s") === "ok");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  check("Esc 收起", await p.locator("#dp.is-hidden").count() === 1);
  check("演示无脚本错误", errors.length === 0, errors.join(" | "));
  await p.close();
}

// 390：看板在手机宽度可读（设计稿自身的可读性，不代表产品有手机形态）
{
  const { p, errors } = await page(390, 844, true);
  await p.screenshot({ path: join(out, "board-390-viewport.png") });
  await p.locator("#panel-sec").screenshot({ path: join(out, "panel-sec-390.png") });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check("390 无横向溢出", overflow <= 0, `scrollWidth-innerWidth=${overflow}`);
  check("390 无脚本错误", errors.length === 0, errors.join(" | "));
  await p.close();
}

await browser.close();
await writeFile(join(out, "checks.json"), JSON.stringify(report, null, 2));
for (const c of report.checks) console.log(c.ok ? "PASS" : "FAIL", c.name, c.detail);

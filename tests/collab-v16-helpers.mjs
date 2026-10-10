import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
export const button = (p, name) => p.getByRole("button", { name, exact: true });
export async function openCollab(
  browser,
  app,
  width = 1440,
  motion = "reduce",
) {
  const context = await browser.newContext({
    viewport: { width, height: width < 760 ? 844 : 1000 },
    reducedMotion: motion,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const p = await context.newPage();
  p.setDefaultTimeout(10000);
  await p.goto(app.url + "/#collab");
  await p.locator("main h1").waitFor();
  await p.waitForFunction(() => !document.querySelector(".scanning"));
  return p;
}
export async function ready(p) {
  await p.locator(".cx-foot").waitFor();
  await button(p, "刷新看板").waitFor();
  await p.waitForFunction(
    () => !document.querySelector('[aria-label="刷新看板"]').disabled,
  );
}
export async function preview(p) {
  if (!(await p.getByLabel("下一棒 Agent").isVisible())) await button(p, "下一棒口令").click();
  const launch = p.locator(".cx-launch");
  const toggle = launch.getByRole("button", { name: /PROMPT/ });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await launch.getByLabel("提示词", { exact: true }).waitFor();
  return launch;
}
export async function copyPrompt(p) {
  await p.locator(".cx-launch").getByRole("button", { name: /^(只复制提示词|已复制)$/ }).click();
}
export async function copied(p) {
  await p.locator(".cx-receipt").getByText("已复制", { exact: true }).waitFor();
}
export async function selectAgent(p, agent) {
  if (!(await p.getByLabel("下一棒 Agent").isVisible())) await button(p, "下一棒口令").click();
  await p.getByLabel("下一棒 Agent").selectOption(agent);
}
export async function axe(p) {
  const a = await new AxeBuilder({ page: p })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    a.violations.map(
      (v) => v.id + ": " + v.nodes.map((n) => n.target).join(" "),
    ),
    [],
  );
}
export async function geometry(p, label) {
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    label + " document",
  );
  const bad = await p.evaluate(() =>
    [...document.querySelectorAll(".collab-v16 *")].flatMap((e) => {
      if (
        e.closest(".tm-scroll") ||
        e.closest("svg") ||
        e.classList.contains("sr-only")
      )
        return [];
      const r = e.getBoundingClientRect(),
        s = getComputedStyle(e);
      if (!r.width || !r.height || s.visibility === "hidden") return [];
      // 已批准标签为单行横滚：核对实际可见边界，容器本身仍须在视口内。
      const tabs = e.closest(".cx-runs");
      const clip = tabs && tabs !== e ? tabs.getBoundingClientRect() : null;
      const left = clip ? Math.max(r.left, clip.left) : r.left;
      const right = clip ? Math.min(r.right, clip.right) : r.right;
      if (right <= left) return [];
      return left < -0.5 || right > innerWidth + 0.5
        ? [`${e.tagName}.${e.className} ${r.left}..${r.right}`]
        : [];
    }),
  );
  assert.deepEqual(bad, [], label);
  for (const e of await p
    .locator(".collab-v16 button,.collab-v16 .tm-s")
    .all()) {
    if (!(await e.isVisible())) continue;
    const r = await e.boundingBox();
    assert(
      r.width >= 44 && r.height >= 44,
      `${label} ${await e.getAttribute("aria-label")} ${JSON.stringify(r)}`,
    );
  }
}

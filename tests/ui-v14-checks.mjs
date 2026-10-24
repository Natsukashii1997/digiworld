import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
export async function settle(p) {
  await p.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) =>
          a.playState !== "running" ||
          a.effect?.getComputedTiming().iterations === Infinity,
      ),
  );
}
export async function geometry(p, route, label) {
  assert.deepEqual(
    await p.evaluate((selector) => {
      const root = document.querySelector(selector),
        bad = [];
      if (document.documentElement.scrollWidth > innerWidth)
        bad.push("整页横向越界");
      for (const e of [root, ...root.querySelectorAll("*")]) {
        if (e.closest("svg,.sr-only") || !e.checkVisibility({ checkOpacity: true })) continue;
        const r = e.getBoundingClientRect(),
          s = getComputedStyle(e);
        if (!r.width && !r.height) continue;
        const name = e.tagName + "." + [...e.classList].join(".");
        if (!e.closest(".page-agents.v16 .cast") && !e.parentElement?.closest(".projects-v16 .pj-slots,.projects-v16 .pj-lscroll") && !e.parentElement?.closest(".settings-v16 .st-nav,.sp-v16 .sp-dirs[tabindex='0'][role='region']") && (r.left < -0.5 || r.right > innerWidth + 0.5))
          bad.push(name + " 边界 " + r.left + ".." + r.right);
        if (
          ["hidden", "clip"].includes(s.overflowX) &&
          e.scrollWidth > e.clientWidth + 1
        )
          bad.push(name + " 横向裁切");
        if (
          ["hidden", "clip"].includes(s.overflowY) &&
          e.scrollHeight > e.clientHeight + 1
        )
          bad.push(name + " 纵向裁切");
      }
      return bad;
    }, route),
    [],
    label,
  );
  for (const control of await p
    .locator(route)
    .locator("button,a,input,select,textarea,summary")
    .all()) {
    if (!(await control.isVisible())) continue;
    const hit = await control.evaluate((e) => {
      const type = e.getAttribute("type");
      const box = (
        ["checkbox", "radio", "file"].includes(type) ? e.closest("label") : e
      )?.getBoundingClientRect();
      return box ? { width: box.width, height: box.height } : null;
    });
    assert(
      hit && hit.width >= 44 && hit.height >= 44,
      label +
        " 44px " +
        (await control.getAttribute("aria-label")) +
        " " +
        JSON.stringify(hit),
    );
  }
}
export async function axe(p, label) {
  await settle(p);
  const results=await new AxeBuilder({ page: p })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  // Axe聚合会打开空白页；明确恢复被测页供后续截图和键盘操作。
  await p.bringToFront();
  assert.deepEqual(
    results.violations.map(
      (v) => label + " " + v.id + " " + v.nodes.map((n) => n.target).join(" "),
    ),
    [],
  );
}

export async function motion(p, selector, verifyGeometry = geometry) {
 await p.emulateMedia({reducedMotion:"no-preference"});
 await p.waitForFunction(()=>document.getAnimations().some(a=>a.playState==="running"));
 await p.emulateMedia({reducedMotion:"reduce"});
 await p.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=="running"));
 const snapshot=()=>p.locator("main svg").evaluateAll(es=>es.map(e=>e.outerHTML).join(""));
 const before=await snapshot();await p.waitForTimeout(200);assert.equal(await snapshot(),before,"reduce SVG稳定");
 await verifyGeometry(p,selector,"运行中reduce");
}

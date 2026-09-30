// 探针 4（预加载）：每 2 秒把仍存活的资源（含定时器的间隔与 ref 状态）打到 stderr；探针自己的定时器 unref。
// 用法：node --import ./docs/agents/handoffs/cloud-env-diff-probes/preload-active-handles.mjs --test-name-pattern=D-R5 tests/rule-templates.test.mjs
const t0 = Date.now();
const timer = setInterval(() => {
  const info = process.getActiveResourcesInfo();
  const handles = process._getActiveHandles().map((h) => {
    const name = h?.constructor?.name;
    if (name === "Server") return `Server(listening=${h.listening})`;
    if (name === "Socket") return `Socket(${h.remoteAddress}:${h.remotePort} destroyed=${h.destroyed})`;
    return name;
  });
  process.stderr.write(`[handles +${Date.now() - t0}ms] resources=${JSON.stringify(info)} handles=${JSON.stringify(handles)}\n`);
}, 2000);
timer.unref();
// 记录所有 ref 状态的 setTimeout/setInterval 的创建位置与时长
const orig = { setTimeout: globalThis.setTimeout, setInterval: globalThis.setInterval };
for (const kind of ["setTimeout", "setInterval"]) {
  globalThis[kind] = function (fn, ms, ...rest) {
    const t = orig[kind].call(this, fn, ms, ...rest);
    if (Number(ms) >= 10000) {
      const where = new Error().stack.split("\n").slice(2, 5).map((s) => s.trim()).join(" <- ");
      process.stderr.write(`[timer] ${kind}(${ms}ms) 创建于 ${where}\n`);
    }
    return t;
  };
}

// 本机 Playwright 1.62.1 要 chromium 1234，缓存只有 1248（CURRENT.md #53 先例）。
// 预加载：chromium.launch 未指定 executablePath 时用 PLAYWRIGHT_CHROMIUM；不改测试文件。
// 测试里有两份 Playwright：项目 node_modules 的，和 64 个测试写死的 Codex 运行时那份，两份都接上。
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
const CODEX = "/Users/nat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const targets = [chromium];
if (existsSync(CODEX)) targets.push(createRequire(import.meta.url)(CODEX).chromium);
for (const c of targets) {
  const launch = c.launch.bind(c);
  c.launch = (options = {}) => launch({ ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}), ...options });
}

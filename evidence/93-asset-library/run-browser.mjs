// #93：批量跑浏览器测试（tests/*-browser.mjs 不在 npm test 里）。
// 用法：node evidence/93-asset-library/run-browser.mjs <输出目录> <测试文件...>
// 每个测试单独进程、限时 5 分钟、4 路并发；逐个写日志，最后写 summary.txt。
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const [out, ...files] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const results = [];
const queue = [...files];
async function worker() {
  while (queue.length) {
    const file = queue.shift();
    const started = Date.now();
    const log = [];
    const code = await new Promise((done) => {
      const child = spawn(process.execPath, ["--import", new URL("./pw-exec.mjs", import.meta.url).href, file], { env: { ...process.env, ASSETS_TEST_RESULTS: join(out, "artifacts", basename(file, ".mjs")) } });
      const timer = setTimeout(() => { log.push("\n[超时 300s，已终止]"); child.kill("SIGKILL"); }, 300_000);
      child.stdout.on("data", (d) => log.push(d));
      child.stderr.on("data", (d) => log.push(d));
      child.on("close", (c) => { clearTimeout(timer); done(c); });
    });
    await writeFile(join(out, basename(file, ".mjs") + ".log"), log.join(""));
    results.push(`${code === 0 ? "PASS" : "FAIL"} ${file} ${Math.round((Date.now() - started) / 1000)}s`);
    console.log(results.at(-1));
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
results.sort();
await writeFile(join(out, "summary.txt"), results.join("\n") + `\n通过 ${results.filter((r) => r.startsWith("PASS")).length} / ${results.length}\n`);

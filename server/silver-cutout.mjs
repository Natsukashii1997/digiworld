// 银饰剪影的“抠图器”接口（产品定义 v1.2 §4.8、基线 D36）。可替换：startServer 的 discovery.silverCutout 可注入别的实现。
// 默认实现只在 macOS 上用 osascript 运行 JXA 脚本 silver-cutout.jxa.js，调用 Vision 的
// VNGenerateForegroundInstanceMaskRequest（macOS 14+）做主体抠图，输出透明背景 PNG。
// 其他平台、脚本出错、超时、没有识别到主体、输出不是 PNG，一律返回“不可用”并说明原因，由用户手动上传剪影。
// 注意：Vision 部分在云端（Linux）无法验证，需本机 macOS 实测。
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const CUTOUT_SCRIPT = fileURLToPath(new URL("./silver-cutout.jxa.js", import.meta.url));
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const exec = promisify(execFile);

async function runOsascript(script, args, { timeoutMs }) {
  return exec("/usr/bin/osascript", ["-l", "JavaScript", script, ...args], {
    timeout: timeoutMs,
    maxBuffer: 64 * 1024,
  });
}

export function createCutout({
  platform = process.platform,
  run = runOsascript,
  timeoutMs = 60000,
} = {}) {
  const unsupported = platform !== "darwin";
  const unavailable = (reason) => ({ status: "unavailable", reason });
  return {
    async available() {
      return unsupported
        ? { available: false, reason: "自动抠图只在 macOS 上可用（Vision 主体抠图）" }
        : { available: true, reason: "" };
    },
    // input / output 是数据目录内的绝对路径，由调用方（silver.mjs）生成和校验。
    async cutout(input, output) {
      if (unsupported)
        return unavailable("当前平台不是 macOS，无法使用 Vision 自动抠图，请手动上传剪影 PNG");
      let result;
      try {
        result = await run(CUTOUT_SCRIPT, [input, output], { timeoutMs });
      } catch (error) {
        await rm(output, { force: true });
        if (error?.killed || error?.signal === "SIGTERM")
          return unavailable("自动抠图超时，请手动上传剪影 PNG");
        return unavailable(
          `自动抠图失败（可能是系统低于 macOS 14 或 Vision 不可用），请手动上传剪影 PNG`,
        );
      }
      if (String(result?.stdout || "").includes("NO_SUBJECT")) {
        await rm(output, { force: true });
        return unavailable("没有识别到主体，请换一张背景更干净的图，或手动上传剪影 PNG");
      }
      let bytes;
      try {
        bytes = await readFile(output);
      } catch {
        return unavailable("自动抠图没有产出文件，请手动上传剪影 PNG");
      }
      if (bytes.length < PNG.length || PNG.some((b, i) => bytes[i] !== b)) {
        await rm(output, { force: true });
        return unavailable("自动抠图产出的不是 PNG，请手动上传剪影 PNG");
      }
      return { status: "ok" };
    },
  };
}

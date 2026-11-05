// 测试辅助：判断合成子进程是否已终止。
// 被 SIGKILL 的孤儿进程要等收养它的 init/launchd 回收后才从进程表消失；回收前是僵尸，
// kill(pid,0) 仍会成功。负载下 launchd 回收可能晚于几十毫秒，部分容器的 PID 1 甚至从不回收。
// 僵尸已不再运行、不持有任何文件或管道，因此“不存在或已是僵尸”都算已终止。
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const missing = (pid) => {
  try { process.kill(pid, 0); return false; } catch (error) { if (error.code === "ESRCH") return true; throw error; }
};

export function terminated(pid) {
  if (missing(pid)) return true;
  try {
    const state = process.platform === "linux"
      ? readFileSync(`/proc/${pid}/stat`, "utf8").replace(/^.*\) /s, "")[0]
      : execFileSync("/bin/ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" }).trim()[0];
    return state === "Z";
  } catch {
    return missing(pid);
  }
}

export async function waitTerminated(pid, timeoutMs = 10000) {
  for (const deadline = Date.now() + timeoutMs; !terminated(pid) && Date.now() < deadline;) await delay(20);
  return terminated(pid);
}

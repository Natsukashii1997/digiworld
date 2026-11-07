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
      : execFileSync("/bin/ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8", timeout: 2000 }).trim()[0];
    return state === "Z";
  } catch {
    return missing(pid);
  }
}

// 进程身份 = pid + 启动时间（ps lstart，秒级）。超时兜底只杀身份仍一致的进程，避免 pid 被复用后误杀别的进程。
// group：该进程是进程组组长（被测服务以 detached 启动的 leader），连同组内没登记 pid 的孙进程一起杀。
export function processIdentity(pid, group = false) {
  try { const start = execFileSync("/bin/ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8", timeout: 2000 }).trim(); return start ? { pid, start, group } : undefined; }
  catch { return undefined; }
}

export function killIdentified(identity) {
  if (!identity || terminated(identity.pid) || processIdentity(identity.pid)?.start !== identity.start) return;
  if (identity.group) try { process.kill(-identity.pid, "SIGKILL"); return; } catch {}
  try { process.kill(identity.pid, "SIGKILL"); } catch {}
}

export async function waitTerminated(pid, timeoutMs = 10000) {
  for (const deadline = Date.now() + timeoutMs; !terminated(pid) && Date.now() < deadline;) await delay(20);
  return terminated(pid);
}

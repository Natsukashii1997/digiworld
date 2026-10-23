// 写入尝试（阶段 2 公共写入能力）：各页原来内联的“尝试编号 → 发送 → 回读核对”收在这一处，语义不变：
// - 调用方先生成固定编号的尝试并存进本机草稿，再调用这里；同一尝试的重试始终用同一编号。
// - 只有回读查到目标状态才算完成；发送报成功但回读没查到，记为“未确认”。
// - 发送失败或结果未知时先查询：查到即完成，查不到只报告，不自动重放。
// - 只有用户明确“核对并重试”（mode 为 retry）且回读确实没有，才用同一尝试重发一次，之后再回读。
// - 回读发现同一记录已是别的内容，记为冲突，停下不覆盖。
// check(): 回读结果 { state: "done" | "absent" | "conflict", value }；
// send(value): 写入报成功返回真值；重试时 value 是刚回读到的状态，可作为写入起点（首次为 undefined）。
export const ATTEMPT_MODES = ["first", "retry", "recover"];

export async function settleAttempt(mode, { send, check }) {
  if (!ATTEMPT_MODES.includes(mode)) throw new Error("写入尝试方式无效");
  try {
    if (mode === "first") {
      // 发送抛错（连接中断、服务报错）同样按结果未知处理：先查询。
      const sent = await Promise.resolve().then(() => send()).catch(() => false);
      const read = await check();
      if (read.state === "done") return { outcome: "done", value: read.value };
      if (sent) return { outcome: "unconfirmed", replayed: false, value: read.value };
      return { outcome: read.state, value: read.value };
    }
    const read = await check();
    if (read.state !== "absent" || mode === "recover") return { outcome: read.state, value: read.value };
    await Promise.resolve(read.value).then(send).catch(() => false);
    const after = await check();
    return after.state === "done"
      ? { outcome: "done", value: after.value }
      : { outcome: "unconfirmed", replayed: true, value: after.value };
  } catch {
    return { outcome: "unknown" };
  }
}

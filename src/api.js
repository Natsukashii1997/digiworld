import { parse, stringify } from "./serialization.js";
import { readState as readLegacy, seed } from "./store.js";

let sessionPromise;
export function session() {
  if (!sessionPromise)
    sessionPromise = fetch("/api/session", {
      headers: { "X-Workbench-Client": "1" },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("本地服务不可用，请重新启动工作台");
        return r.json();
      })
      .catch((e) => {
        sessionPromise = null;
        throw e;
      });
  return sessionPromise;
}
export async function request(
  path,
  data,
  method = data === undefined ? "GET" : "POST",
  retry = true,
) {
  const { token } = await session();
  let r;
  try {
    r = await fetch("/api" + path, {
      method,
      headers: {
        "X-Workbench-Token": token,
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(data === undefined ? {} : { body: stringify(data) }),
    });
  } catch {
    throw new Error(
      "本地服务连接中断。操作结果未确认，请保留当前内容，重新连接后核对。",
    );
  }
  if (r.status === 403 && retry) {
    sessionPromise = null;
    return request(path, data, method, false);
  }
  const result = parse(await r.text());
  if (!r.ok)
    throw Object.assign(new Error(result.error || "本地服务处理失败"), {
      status: r.status,
      operationNotStarted: result.operationNotStarted === true,
      unknownResult: result.unknownResult === true,
    });
  return result;
}
export const writeState = (state, options = {}) =>
  request("/workspace", { state, ...options }, "PUT");
let initialization;
export function initializeWorkspace() {
  if (!initialization)
    initialization = (async () => {
      const stored = await request("/workspace");
      if (stored) return stored;
      const legacy = await readLegacy();
      return writeState(legacy || seed(), { initialize: true });
    })().catch((e) => {
      initialization = null;
      throw e;
    });
  return initialization;
}

// A shared in-flight request prevents StrictMode/remounts from starting duplicate scans.
const scans = new Map();
export function scan(kind, data = {}) {
  if (!scans.has(kind))
    scans.set(
      kind,
      request("/scan/" + kind, data).finally(() => scans.delete(kind)),
    );
  return scans.get(kind);
}

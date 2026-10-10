import { parse, stringify } from "./serialization.js";
import { readState as readLegacy, seed } from "./store.js";

let sessionPromise;
let pageRootIdentity;
let pageRootObserved = false;
const ROOT_IDENTITY = /^[a-f0-9]{64}$/;

function bindPageRoot(value) {
  // A missing identity keeps legacy reads available, but scoped writes stay closed.
  const identity = ROOT_IDENTITY.test(value?.dataRootIdentity || "")
    ? value.dataRootIdentity
    : null;
  if (pageRootObserved && identity !== pageRootIdentity)
    throw new Error(
      "本机数据目录已切换，请刷新工作台后核对原操作；本页不会向新目录重试写入。",
    );
  pageRootObserved = true;
  pageRootIdentity = identity;
  return { ...value, dataRootIdentity: identity };
}
export function session() {
  if (!sessionPromise)
    sessionPromise = fetch("/api/session", {
      headers: { "X-Workbench-Client": "1" },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("本地服务不可用，请重新启动工作台");
        return bindPageRoot(await r.json());
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
  options = {},
) {
  const { token } = await session();
  let r;
  try {
    r = await fetch("/api" + path, {
      method,
      keepalive: options.keepalive === true,
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
    return request(path, data, method, false, options);
  }
  const result = parse(await r.text());
  if (!r.ok)
    throw Object.assign(new Error(result.error || "本地服务处理失败"), {
      status: r.status,
      operationNotStarted: result.operationNotStarted === true,
      unknownResult: result.unknownResult === true,
      code: result.code === "KNOWLEDGE_ROOT_IDENTITY_CHANGED" || /^FEISHU_[A-Z_]+$/.test(result.code || "") ? result.code : undefined,
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

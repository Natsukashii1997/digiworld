import { createHash } from "node:crypto";
const sha = value => createHash("sha256").update(value).digest("hex");
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
export const MODEL_PROVIDERS = Object.freeze({
  anthropic: Object.freeze({ origin: "https://api.anthropic.com", listPath: "/v1/models", generatePath: "/v1/messages" }),
  openai: Object.freeze({ origin: "https://api.openai.com", listPath: "/v1/models", generatePath: "/v1/responses" }),
});
export function previewModelRequest({ provider, model, text, maxOutputTokens = 512, operationId, rate }) {
  if (!MODEL_PROVIDERS[provider] || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(model || "")) fail("UNSUPPORTED_PROVIDER", "提供方或模型不支持");
  if (typeof text !== "string" || !text.trim() || Buffer.byteLength(text) > 64*1024) fail("INVALID_INPUT", "输入为空或超过64KiB单书请求上限");
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 4096) fail("INVALID_LIMIT", "输出上限无效");
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(operationId || "")) fail("INVALID_OPERATION", "操作ID无效");
  const body = provider === "anthropic" ? { model, max_tokens: maxOutputTokens, messages: [{ role: "user", content: text }] }
    : { model, max_output_tokens: maxOutputTokens, input: [{ role: "user", content: [{ type: "input_text", text }] }], store: false };
  const bytes = Buffer.byteLength(JSON.stringify(body));
  // 字节保守估计仅为预览，并非计费保证；没有有来源的价格时不编成本。
  const estimatedUpperInputTokens = bytes + 4096;
  const priceKnown = rate && rate.currency === "USD" && typeof rate.source === "string" && rate.source.startsWith("https://")
    && typeof rate.asOf === "string" && Number.isFinite(rate.inputMicrosPerToken) && rate.inputMicrosPerToken >= 0
    && Number.isFinite(rate.outputMicrosPerToken) && rate.outputMicrosPerToken >= 0;
  const estimateMicrosUsd = priceKnown ? Math.ceil(estimatedUpperInputTokens * rate.inputMicrosPerToken + maxOutputTokens * rate.outputMicrosPerToken) : null;
  return { provider, model, operationId, body, bodySha256: sha(JSON.stringify(body)), inputBytes: bytes,
    estimatedUpperInputTokens, maxOutputTokens, estimateMicrosUsd, priceSource: priceKnown ? rate.source : "",
    rateSnapshot: priceKnown ? { ...rate } : null,
    costMessage: priceKnown ? "保守估算；以提供方最终账单为准" : "待接入数据：没有可核验价格，不编费用" };
}
async function readBoundedResponse(response, limit = 2 * 1024 * 1024) {
  if (!response.body?.getReader) fail("UNKNOWN_RESPONSE", "响应无法有界回读");
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try { while (true) {
    const { done, value } = await reader.read(); if (done) break; size += value.length;
    if (size > limit) { await reader.cancel(); fail("RESPONSE_LIMIT", "响应超过回读上限"); }
    chunks.push(Buffer.from(value));
  } } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { fail("UNKNOWN_RESPONSE", "响应JSON无法核验"); }
}
export function createModelHttpAdapter({ getCredential, transport = fetch, started, completed, checkExisting, beforeSend, now = () => new Date().toISOString() }) {
  async function once({ operationId, provider, model, purpose, plan, signal }) {
    const spec = MODEL_PROVIDERS[provider]; if (!spec) fail("UNSUPPORTED_PROVIDER", "仅支持登记的官方端点");
    const prior = await checkExisting(operationId);
    if (!prior.exists || prior.phase !== "prepared" || prior.executionStarted !== false) return prior;
    if (purpose !== "connection" && purpose !== "single-book") fail("INVALID_PURPOSE", "操作用途无效");
    if (purpose === "single-book" && (!plan || plan.provider !== provider || plan.model !== model || plan.operationId !== operationId || sha(JSON.stringify(plan.body)) !== plan.bodySha256))
      fail("PLAN_CHANGED", "必须使用已确认的同一请求草稿");
    if (purpose === "single-book" && (plan.estimateMicrosUsd === null || !Number.isSafeInteger(plan.estimateMicrosUsd) || plan.estimateMicrosUsd < 0))
      fail("COST_UNKNOWN", "没有可信费用预览，本次单书生成未开始；仍可测试模型连接");
    if (signal?.aborted) return { status: "not_started", reason: "已停止", billedCost: null };
    const key = await getCredential(provider + "/main");
    if (typeof key !== "string" || key.length < 8 || /[\r\n\0]/.test(key)) fail("CREDENTIAL_MISSING", "钥匙串凭据不可用");
    const claimed = await started(operationId, { at: now(), purpose, provider, bodySha256: plan?.bodySha256 || "" });
    if (claimed !== true) return await checkExisting(operationId);
    let receipt;
    try {
      const headers = { accept: "application/json" };
      if (provider === "anthropic") { headers["x-api-key"] = key; headers["anthropic-version"] = "2023-06-01"; }
      else headers.authorization = "Bearer " + key;
      if (purpose === "single-book") headers["content-type"] = "application/json";
      // 恰好一次、禁止重定向、无自动重试；网络异常只查，不补发。
      const timeoutSignal = AbortSignal.timeout(15_000);
      const boundedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      if(beforeSend)await beforeSend({operationId,provider,model,plan,purpose});
      if(boundedSignal.aborted)fail("STOPPED","请求发送前已停止");
      const response = await transport(spec.origin + (purpose === "connection" ? spec.listPath : spec.generatePath), {
        method: purpose === "connection" ? "GET" : "POST", headers, redirect: "error", signal: boundedSignal,
        ...(purpose === "single-book" ? { body: JSON.stringify(plan.body) } : {}),
      });
      if (response.status < 200 || response.status >= 300) {
        receipt = { status: "failed", httpStatus: response.status, reason: response.status === 401 || response.status === 403 ? "授权被拒绝" : "提供方返回失败", billedCost: null };
        await response.body?.cancel?.();
      } else {
        const data = await readBoundedResponse(response);
        // 提供方可以在任意字段回显Key；不能只筛正文。整个响应一旦含本次Key即未知，绝不日志/返回原对象。
        const containsSecret = v => typeof v === "string" ? v.includes(key) : Array.isArray(v) ? v.some(containsSecret)
          : v && typeof v === "object" ? Object.entries(v).some(([k,item])=>k.includes(key)||containsSecret(item)) : false;
        if(containsSecret(data))fail("UNKNOWN_RESPONSE","响应包含凭据，拒绝留存或展示");
        if (purpose === "connection") {
          if (!Array.isArray(data.data) || data.data.length > 10_000) fail("UNKNOWN_RESPONSE", "模型清单无法核验");
          receipt = { status: "verified", reachable: true, generationVerified: false, models: data.data.map(m => m?.id).filter(id => typeof id === "string" && /^[a-zA-Z0-9._:-]{1,128}$/.test(id)).slice(0, 500), billedCost: null };
        } else {
          const text = provider === "anthropic" ? (data.content || []).filter(c => c?.type === "text" && typeof c.text === "string").map(c => c.text).join("\n")
            : (data.output || []).filter(c => c?.type === "message").flatMap(c => c.content || []).filter(c => c?.type === "output_text" && typeof c.text === "string").map(c => c.text).join("\n");
          if (!text || text.includes(key) || Buffer.byteLength(text) > 1_000_000) fail("UNKNOWN_RESPONSE", "输出无法安全回读");
          const usage = data.usage && typeof data.usage === "object" ? Object.fromEntries(["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"].filter(k => Number.isSafeInteger(data.usage[k]) && data.usage[k] >= 0).map(k => [k, data.usage[k]])) : null;
          // 含未支持cache计费或缺token回执时费用未知；不把缺失当0，已发生请求不重放。
          const knownUsage = Number.isSafeInteger(usage?.input_tokens) && Number.isSafeInteger(usage?.output_tokens)
            && !usage?.cache_creation_input_tokens && !usage?.cache_read_input_tokens && plan.rateSnapshot;
          const costMicrosUsd = knownUsage ? Math.ceil(usage.input_tokens * plan.rateSnapshot.inputMicrosPerToken
            + usage.output_tokens * plan.rateSnapshot.outputMicrosPerToken) : null;
          receipt = { status: "verified", output: text, outputSha256: sha(text), usage, costMicrosUsd,
            costSource: costMicrosUsd === null ? "unknown" : "provider-usage-price-estimate", billedCost: null,
            requestRef: typeof data.id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(data.id) ? data.id : "" };
        }
      }
    } catch { receipt = { status: "unknown", reason: "请求可能已执行，结果无法核验；禁止自动重试", billedCost: null }; }
    // 此写失败向上抛，持久started仍在；前端只能check，不能再生成。
    await completed(operationId, receipt); return receipt;
  }
  return {
    testConnection: input => once({ ...input, purpose: "connection" }),
    generateSingleBook: input => once({ ...input, purpose: "single-book" }),
    async check(operationId) { return await checkExisting(operationId); },
  };
}

import { randomUUID, createHash } from "node:crypto";
import { join } from "node:path";
import {
  DEFAULT_ZONE_RULES,
  profileFolders,
  foldedPath as folded,
  inside,
  sourcesOverlap as overlaps,
  pendingReconfirmFor,
} from "../src/knowledge-zones.js";
import { failure } from "./repository.mjs";

export { inside };

export const knowledgeSources = (state) =>
  state?.connections?.knowledgeSources || [];
export const pendingIdentityOverlap = (state, source) =>
  pendingReconfirmFor(state, source).length > 0;
export function policyKey(state) {
  return createHash("sha256")
    .update(
      JSON.stringify([knowledgeSources(state), state?.knowledgeZones || null]),
    )
    .digest("hex");
}
export function validateExcluded(value) {
  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    new Set(value).size !== value.length
  )
    throw failure("排除目录最多20个且不能重复");
  for (const folder of value) {
    if (
      typeof folder !== "string" ||
      !folder ||
      folder.length > 200 ||
      /[\\:*?\x00-\x1f\x7f-\x9f\u2028\u2029]/.test(folder) ||
      folder
        .split("/")
        .some(
          (p) =>
            !p ||
            p !== p.trim() ||
            p.startsWith(".") ||
            /^(?:node_modules|vendor|dist|build|target|cache|caches|keychains|secrets?|credentials?|tokens?|passwords?|private[-_]?keys?)(?:[._-]|$)/i.test(
              p,
            ),
        )
    )
      throw failure(
        "排除目录应是可见的来源内相对文件夹，不能含越界、隐藏或秘密目录",
      );
  }
  return [...value];
}
export function selectedProfileSource(state) {
  const sources = knowledgeSources(state).filter((s) => s.kind !== "feishu"),
    id = state?.knowledgeZones?.sourceId;
  return id
    ? sources.find((s) => s.id === id) || null
    : sources.find((s) => s.kind === "obsidian") || sources[0] || null;
}
export function scopedSource(state, source, { excludeProfile = false } = {}) {
  if (source.kind === "feishu")
    return { ...source, rootBlocked: false, excludedFolders: [] };
  const denied = knowledgeSources(state).flatMap((s) =>
    s.kind === "feishu" ? [] :
    (s.excludedFolders || []).map((f) => join(s.root, f)),
  );
  if (excludeProfile) {
    const vault = selectedProfileSource(state);
    if (vault)
      denied.push(
        ...profileFolders(
          state?.knowledgeZones?.rules || DEFAULT_ZONE_RULES,
        ).map((f) => join(vault.root, f)),
      );
  }
  return {
    ...source,
    rootBlocked: denied.some((p) => inside(source.root, p)),
    excludedFolders: [
      ...new Set(
        denied
          .filter(
            (p) => inside(p, source.root) && folded(p) !== folded(source.root),
          )
          .map((p) =>
            p.split("/").slice(source.root.split("/").length).join("/"),
          ),
      ),
    ],
  };
}
// Conservative revocation prevents an existing parent/child grant expanding when
// a protecting scope is removed. The user's explicit target can be regranted.
export function sourceScopeKey(state, source, options = {}) {
  const active = knowledgeSources(state).find((s) => s.id === source.id);
  if (!active) return "disconnected";
  const scoped = scopedSource(state, active, options);
  return createHash("sha256")
    .update(
      JSON.stringify([
        active,
        scoped.rootBlocked,
        [...scoped.excludedFolders].sort(),
      ]),
    )
    .digest("hex");
}
export function revokeOverlaps(state, roots, { targetId, target } = {}) {
  const scopes = roots.map((root) =>
    knowledgeSources(state).find((source) => source.root === root) ||
    (target?.root === root ? target : { root, kind: root.startsWith("feishu://") ? "feishu" : "markdown" }));
  const sources = knowledgeSources(state).map((s) => {
    if (s.id === targetId && target) return target;
    return scopes.some((scope) => overlaps(s, scope))
      ? { ...s, agentSharing: false, generation: randomUUID() }
      : s;
  });
  return { connections: { ...state.connections, knowledgeSources: sources } };
}
export function createPolicyKnowledgeFiles(repository, raw) {
  const revokesFeishuGrant = (code) => [
    "FEISHU_WRONG_IDENTITY", "FEISHU_AUTH_REQUIRED", "FEISHU_PERMISSION_DENIED",
    "FEISHU_SCOPE_MISSING", "FEISHU_SCOPE_CHANGED",
  ].includes(code);
  async function identityChanged(source) {
    await repository.updateKnowledgeAccess((state) => {
      const active = knowledgeSources(state).find((item) => item.id === source.id);
      if (!active || active.generation !== source.generation || active.root !== source.root || active.identity !== source.identity)
        return { connections: state.connections };
      const target = { ...active, agentSharing: false, generation: randomUUID() };
      const patch = revokeOverlaps(state, [active.root], { targetId: active.id, target });
      const health = (patch.connections.knowledgeSourceHealth || []).filter((item) => item.sourceId !== active.id);
      patch.connections.knowledgeSourceHealth = [...health, {
        sourceId: active.id, status: "needs_reconfirmation", detectedAt: new Date().toISOString(),
        confirmedAt: null, beforeIdentity: active.identity, afterIdentity: null,
      }];
      const profile = selectedProfileSource(state);
      if (state.knowledgeZones && profile && (inside(active.root, profile.root) || inside(profile.root, active.root)))
        patch.knowledgeZones = { ...state.knowledgeZones, profileSharing: false };
      return patch;
    });
  }
  async function capture(source, options) {
    const state = await repository.read(),
      active = knowledgeSources(state).find((s) => s.id === source.id);
    if (pendingIdentityOverlap(state, source)) {
      const error = failure("知识目录需重新确认后才能读取", 409);
      error.code = "KNOWLEDGE_ROOT_IDENTITY_CHANGED";
      throw error;
    }
    if (
      !active ||
      active.generation !== source.generation ||
      active.root !== source.root ||
      active.identity !== source.identity
    )
      throw failure("知识来源或授权已变化，请重新查询", 409);
    return {
      source: scopedSource(state, active, options),
      key: sourceScopeKey(state, active, options),
    };
  }
  async function guarded(method, source, input, options) {
    const captured = await capture(source, options);
    if (captured.source.rootBlocked)
      throw failure("该物理范围已被排除，不能通过另一来源读取", 403);
    let result;
    try { result = await raw[method](captured.source, input); }
    catch (error) {
      if (error.code === "KNOWLEDGE_ROOT_IDENTITY_CHANGED" ||
          (source.kind === "feishu" && revokesFeishuGrant(error.code))) await identityChanged(source);
      throw error;
    }
    if (
      sourceScopeKey(await repository.read(), source, options) !== captured.key
    )
      throw failure("读取期间知识范围已变化，请重新查询", 409);
    return result;
  }
  return {
    limits: raw.limits,
    inspectRoot: (...args) => raw.inspectRoot(...args),
    async verifyRoot(source) {
      await capture(source);
      let current;
      try { current = await raw.inspectRoot(source.root); }
      catch (error) {
        if (source.kind === "feishu" && revokesFeishuGrant(error.code)) await identityChanged(source);
        throw error;
      }
      if (current.root !== source.root || current.identity !== source.identity ||
          (source.kind === "feishu" && current.principalHash !== source.feishuPrincipalHash)) {
        await identityChanged(source);
        const error = failure("知识目录身份已变化，请重新确认连接", 409);
        error.code = "KNOWLEDGE_ROOT_IDENTITY_CHANGED";
        throw error;
      }
      return current;
    },
    scan: (s, input = {}, options = {}) => guarded("scan", s, input, options),
    read: (s, input, options = {}) => guarded("read", s, input, options),
    current: (s, input, options = {}) => guarded("current", s, input, options),
  };
}

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { digest, failure } from "./repository.mjs";
import { discoverSkills, readLocalSkill } from "./skill-files.mjs";
import {materializeSkillVersion} from "../src/skill-version.js";
import {skillMediaReader} from "./skill-version-media.mjs";
import { compareSkillCopy } from "../src/skill-copy-diff.js";

const signature = (t) =>
  digest(
    JSON.stringify([
      t.agentId,
      t.program.path,
      t.program.kind,
      t.home.id,
      t.home.path,
      t.bindingId || null,
    ]),
  );
function shape(input, fields) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).length !== fields.length ||
    Object.keys(input).some((key) => !fields.includes(key))
  )
    throw failure("副本请求字段无效");
  for (const field of fields) {
    const v = input[field];
    if (
      field === "revision"
        ? !Number.isSafeInteger(v) || v < 0
        : typeof v !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(v)
    )
      throw failure("副本身份或主库版本无效");
  }
}

// A relationship is a fixed-version pointer, never an install or activation claim.
export function createSkillCopies(repository, adapters, clock = Date.now) {
  const scans = new Map(),
    previews = new Map();
  const at = () => new Date(clock()).toISOString();
  function put(map, value) {
    for (const [key, item] of map) if (item.expires <= clock()) map.delete(key);
    if (map.size >= 20) map.delete(map.keys().next().value);
    const token = randomUUID(),
      expires = clock() + 300000;
    map.set(token, { ...value, expires });
    return { token, expiresAt: new Date(expires).toISOString() };
  }
  function get(map, token, expected) {
    const value = map.get(token);
    if (!value || value.expires <= clock() || (expected && expected !== value))
      throw failure("副本预览已过期，请重新查找并预览", 409);
    return value;
  }
  function selection(state, input) {
    const target = state?.connections?.agentTargets?.find(
      (t) => t.id === input.targetId,
    );
    if (!target) throw failure("管理目标已不存在，请重新选择", 409);
    const asset = state.assets.find(
      (a) => a.id === input.assetId && a.type === "Skill" && !a.archived,
    );
    const version = asset?.versions.find((v) => v.id === input.versionId);
    if (!version) throw failure("Skill 或固定版本不可用，请重新选择", 409);
    return {
      target,
      asset,
      version,
      versionNumber: asset.versions.indexOf(version) + 1,
    };
  }
  async function scope(target) {
    const inventory = await adapters.inspectAgentInventory(target.agentId);
    if (inventory.errors.length || inventory.truncated)
      throw failure("目标目录检查不完整，请稍后重试", 409);
    const home = inventory.homes.find(
      (h) =>
        h.id === target.home.id &&
        h.path === target.home.path &&
        !h.source.includes("用户共享"),
    );
    if (!home || home.status === "missing")
      throw failure("目标 Home 目录不存在", 404);
    if (home.status !== "present" || home.errors.length || !home.identity)
      throw failure("无法核验目标 Home 目录", 403);
    const roots = home.skills.filter(
      (r) => r.path === join(home.path, "skills"),
    );
    if (!roots.length || roots.every((r) => r.status === "missing"))
      throw failure("目标 Skills 目录不存在", 404);
    if (roots.some((r) => r.status !== "present" || !r.identity))
      throw failure("无法核验目标 Skills 目录", 403);
    return {
      roots: roots.map((r) => r.path),
      signature: digest(
        JSON.stringify([home.identity, roots.map((r) => [r.path, r.identity])]),
      ),
    };
  }
  async function verifiedScope(target, expected) {
    const current = await scope(target);
    if (expected && expected.signature !== current.signature)
      throw failure("目标目录身份已变化，请重新预览", 409);
    return current;
  }
  function currentSelection(state, p) {
    const value = selection(state, p);
    if (signature(value.target) !== p.targetSignature)
      throw failure("目标绑定已变化，请重新查找", 409);
    return value;
  }
  return {
    async discover(input) {
      shape(input, ["assetId", "versionId", "targetId"]);
      const state = await repository.read(),
        { target } = selection(state, input),
        targetScope = await scope(target);
      const result = await discoverSkills(targetScope.roots);
      await verifiedScope(target, targetScope);
      const token = put(scans, {
        ...input,
        targetSignature: signature(target),
        scope: targetScope,
        items: result.items,
        revision: state.revision,
      });
      return { ...result, ...token, revision: state.revision, at: at() };
    },
    async preview(input) {
      shape(input, ["token", "candidateId"]);
      const scan = get(scans, input.token),
        state = await repository.read();
      const selected = currentSelection(state, scan),
        candidate = scan.items.find(
          (i) => i.id === input.candidateId && i.status === "candidate",
        );
      if (!candidate) throw failure("请选择本次扫描的可用候选", 409);
      if (state.revision !== scan.revision)
        throw failure("主库已变化，请重新查找", 409);
      const targetScope = await verifiedScope(selected.target, scan.scope);
      const pkg = await readLocalSkill(targetScope.roots, candidate.path);
      await verifiedScope(selected.target, targetScope);
      get(scans, input.token, scan);
      const existing = (state.connections.skillCopies || []).find(
        (c) => c.targetId === scan.targetId && c.location === pkg.location,
      );
      const existingAsset =
        existing && state.assets.find((a) => a.id === existing.assetId);
      const existingCopy = existing
        ? {
            id: existing.id,
            assetId: existing.assetId,
            assetName: existingAsset?.versions.at(-1).title || "不可用资产",
            versionId: existing.versionId,
            versionNumber:
              existingAsset?.versions.findIndex(
                (v) => v.id === existing.versionId,
              ) + 1 || null,
          }
        : null;
      const value = {
        assetId: scan.assetId,
        versionId: scan.versionId,
        targetId: scan.targetId,
        targetSignature: scan.targetSignature,
        scope: targetScope,
        root: candidate.root,
        path: candidate.path,
        location: pkg.location,
        identity: pkg.identity,
        fingerprint: pkg.fingerprint,
        revision: state.revision,
      };
      const token = put(previews, value);
      return {
        ...token,
        revision: state.revision,
        targetId: scan.targetId,
        targetLabel: selected.target.label,
        assetId: scan.assetId,
        versionId: scan.versionId,
        versionNumber: selected.versionNumber,
        root: candidate.root,
        location: pkg.location,
        fingerprint: pkg.fingerprint,
        comparison: compareSkillCopy((await materializeSkillVersion(selected.version,{readMedia:adapters.readReverseMedia||skillMediaReader(repository)})).files, pkg.files),
        existingCopy,
      };
    },
    async bind(input) {
      shape(input, ["token", "revision"]);
      const p = get(previews, input.token),
        state = await repository.read();
      if (p.committed) {
        const existing = state.connections?.skillCopies?.find(
          (c) => c.id === p.committed.id,
        );
        if (
          existing &&
          JSON.stringify(existing) === JSON.stringify(p.committed)
        )
          return state;
        throw failure("该关联确认后已被修改或解除，请重新预览", 409);
      }
      if (input.revision !== p.revision || state.revision !== p.revision)
        throw failure("主库已变化，请重新查找并预览", 409);
      const { target } = currentSelection(state, p);
      await verifiedScope(target, p.scope);
      const saved = await repository.updateConnections(
        async (c) => {
          get(previews, input.token, p);
          const currentTarget = c.agentTargets?.find(
            (t) => t.id === p.targetId,
          );
          if (!currentTarget || signature(currentTarget) !== p.targetSignature)
            throw failure("管理目标已变化，请重新预览", 409);
          await verifiedScope(currentTarget, p.scope);
          const pkg = await readLocalSkill(p.scope.roots, p.path);
          if (
            pkg.location !== p.location ||
            pkg.identity !== p.identity ||
            pkg.fingerprint !== p.fingerprint
          )
            throw failure("副本内容或目录身份已变化，请重新预览", 409);
          await verifiedScope(currentTarget, p.scope);
          get(previews, input.token, p);
          const copies = c.skillCopies || [],
            old = copies.find(
              (v) => v.targetId === p.targetId && v.location === p.location,
            );
          const copy = {
            schema: 1,
            id: old?.id || `copy-${randomUUID()}`,
            assetId: p.assetId,
            versionId: p.versionId,
            targetId: p.targetId,
            targetSignature: p.targetSignature,
            scopeSignature: p.scope.signature,
            root: p.root,
            location: p.location,
            boundFingerprint: p.fingerprint,
            boundAt: at(),
          };
          return {
            ...c,
            skillCopies: old
              ? copies.map((v) => (v.id === old.id ? copy : v))
              : [...copies, copy],
          };
        },
        { expectedRevision: input.revision },
      );
      p.committed = saved.connections.skillCopies.find(
        (c) => c.targetId === p.targetId && c.location === p.location,
      );
      return saved;
    },
    async check(input) {
      shape(input, ["id"]);
      const state = await repository.read(),
        copy = state?.connections?.skillCopies?.find((c) => c.id === input.id);
      if (!copy) throw failure("副本关联已不存在", 404);
      const asset = state.assets.find((a) => a.id === copy.assetId),
        version = asset?.versions.find((v) => v.id === copy.versionId);
      const base = {
        id: copy.id,
        at: at(),
        location: copy.location,
        versionId: copy.versionId,
        versionNumber: version ? asset.versions.indexOf(version) + 1 : null,
        hasNewVersion: Boolean(
          version && asset.versions.at(-1).id !== version.id,
        ),
      };
      const result = (status, message, extra = {}) => ({
        ...base,
        status,
        message,
        ...extra,
      });
      const target = state.connections.agentTargets?.find(
        (t) => t.id === copy.targetId,
      );
      if (!target)
        return result("target_missing", "管理目标已解除；原目录未修改");
      if (signature(target) !== copy.targetSignature)
        return result("target_changed", "管理目标已改绑，请重新关联");
      if (!version || asset.type !== "Skill" || asset.archived)
        return result("asset_unavailable", "资产或固定版本不可用");
      try {
        const targetScope = await scope(target);
        if (
          targetScope.signature !== copy.scopeSignature ||
          !targetScope.roots.includes(copy.root)
        )
          return result("target_changed", "目标目录身份已变化，请重新关联");
        const pkg = await readLocalSkill(targetScope.roots, copy.location);
        if (pkg.location !== copy.location)
          return result("blocked", "关联路径已指向其他位置，请重新关联");
        await verifiedScope(target, targetScope);
        const comparison = compareSkillCopy((await materializeSkillVersion(version,{readMedia:adapters.readReverseMedia||skillMediaReader(repository)})).files, pkg.files);
        if ((await repository.read()).revision !== state.revision)
          return result("blocked", "核对期间主库已变化，请重新核对");
        return result(
          comparison.status,
          {
            identical: "文件内容与已知权限一致；不代表已启用",
            different: "副本与固定版本存在差异",
            unverified: "内容一致，部分权限尚无法核验",
          }[comparison.status],
          { comparison },
        );
      } catch (error) {
        return result(
          error.status === 404 ? "missing" : "blocked",
          error.message || "副本核对失败",
        );
      }
    },
    async remove(input) {
      shape(input, ["id", "revision"]);
      return repository.updateConnections(
        (c) => {
          if (!c?.skillCopies?.some((v) => v.id === input.id))
            throw failure("关联已不存在，请刷新后重试", 409);
          return {
            ...c,
            skillCopies: c.skillCopies.filter((v) => v.id !== input.id),
          };
        },
        { expectedRevision: input.revision },
      );
    },
  };
}

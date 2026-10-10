import {planSkillVersion} from "../src/skill-version.js";
import { randomUUID } from "node:crypto";
import { failure, digest } from "./repository.mjs";
import {
  defaultSkillRoots,
  discoverSkills,
  readLocalSkill,
} from "./skill-files.mjs";
import { makeAsset } from "../src/store.js";
import { fileBytes, validateSkillFiles } from "../src/skill-package.js";

const TTL = 5 * 60 * 1000;
function titleOf(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80)
    throw failure("请填写 80 字以内的资产名称");
  return value.trim();
}
function revisionOf(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw failure("请刷新后重新预览");
  return value;
}
const existingSource = (assets, local) =>
  assets.find(
    (a) =>
      a.origin?.kind === "local" &&
      a.origin.location === local.location &&
      a.origin.fingerprint === local.fingerprint,
  );

export function createSkillSources(repository, clock = Date.now) {
  let candidates = new Map(),
    scanning = false;
  const previews = new Map();
  function prune() {
    for (const [token, p] of previews)
      if (p.expires <= clock()) previews.delete(token);
  }
  return {
    defaults: () => ({ roots: defaultSkillRoots() }),
    async discover(input) {
      if (scanning) throw failure("正在扫描，请稍候", 409);
      scanning = true;
      previews.clear();
      candidates.clear();
      try {
        const result = await discoverSkills(input.roots);
        candidates = new Map(
          result.items.map((item) => [
            item.id,
            { ...item, roots: result.roots },
          ]),
        );
        return result;
      } finally {
        scanning = false;
      }
    },
    async preview(input) {
      const candidate = candidates.get(input.candidateId);
      if (!candidate || scanning)
        throw failure("扫描结果已失效，请重新扫描", 409);
      if (candidate.status === "blocked")
        throw failure(candidate.message || "此目录暂不能读取");
      const local = await readLocalSkill(candidate.roots, candidate.path);
      if (candidates.get(input.candidateId) !== candidate || scanning)
        throw failure("扫描范围已变化，请重新预览", 409);
      const state = await repository.read();
      if (!state) throw failure("请先初始化资产库", 409);
      prune();
      if (previews.size >= 20)
        throw failure("待确认预览过多，请等待旧预览过期或重新扫描", 409);
      const token = randomUUID(),
        expires = clock() + TTL;
      previews.set(token, {
        candidate,
        location: local.location,
        fingerprint: local.fingerprint,
        revision: state.revision,
        expires,
      });
      return {
        token,
        expiresAt: new Date(expires).toISOString(),
        revision: state.revision,
        location: local.location,
        name: local.name,
        content: local.content,
        fingerprint: local.fingerprint,
        bytes: local.bytes,
        files: local.files.map((f) => ({
          path: f.path,
          bytes: fileBytes(f).length,
          mode: f.mode,
          directory: f.directory === true,
          sha256: digest(fileBytes(f)),
        })),
        existingAssetId: existingSource(state.assets, local)?.id || null,
      };
    },
    async import(input) {
      const title = titleOf(input.title),
        revision = revisionOf(input.revision);
      prune();
      const p = previews.get(input.token);
      if (!p || p.expires <= clock())
        throw failure("预览已过期，请重新预览后确认", 409);
      if (p.completed) {
        const state = await repository.read();
        if (!state.assets.some((a) => a.id === p.completed))
          throw failure("已收录记录不再可用，请刷新", 409);
        return { state, assetId: p.completed, alreadyImported: true };
      }
      if (p.busy) throw failure("正在收录，请稍候", 409);
      if (revision !== p.revision)
        throw failure("预览版本不一致，请重新预览", 409);
      p.busy = true;
      try {
        let assetId,
          alreadyImported = false;
        const state = await repository.updateAssets(
          async (assets) => {
            if (previews.get(input.token) !== p || p.expires <= clock())
              throw failure("预览已失效，请重新预览", 409);
            const local = await readLocalSkill(
              p.candidate.roots,
              p.candidate.path,
            );
            if (
              local.location !== p.location ||
              local.fingerprint !== p.fingerprint
            )
              throw failure("来源路径或内容已变化，请重新预览后确认", 409);
            if (previews.get(input.token) !== p || p.expires <= clock())
              throw failure("扫描范围或预览已变化，请重新预览", 409);
            const existing = existingSource(assets, local);
            if (existing) {
              assetId = existing.id;
              alreadyImported = true;
              return assets;
            }
            const asset = {
              ...makeAsset({
                type: "Skill",
                title,
                content: local.content,
                files: local.files,
                source: local.location,
              }),
              origin: {
                kind: "local",
                location: local.location,
                fingerprint: local.fingerprint,
                capturedAt: new Date(clock()).toISOString(),
              },
            };
            assetId = asset.id;
            return [asset, ...assets];
          },
          { expectedRevision: revision },
        );
        p.completed = assetId;
        return { state, assetId, alreadyImported };
      } finally {
        p.busy = false;
      }
    },
    async derive(input) {
      const title = titleOf(input.title),
        revision = revisionOf(input.revision);
      let assetId;
      const state = await repository.updateAssets(
        (assets) => {
          const source = assets.find(
            (a) => a.id === input.assetId && a.type === "Skill",
          );
          const version = source?.versions.find(
            (v) => v.id === input.versionId,
          );
          if (!version || source.archived)
            throw failure("来源版本不存在或已归档，请刷新后核对", 409);
          planSkillVersion(version);
          const derived = {
            ...makeAsset({
              type: "Skill",
              title,
              description: version.description,
              content: version.content,
              tags: [...version.tags],
              files: structuredClone(version.files),
              ...(version.mediaManifest===undefined?{}:{mediaManifest:structuredClone(version.mediaManifest)}),
              source: version.source,
            }),
            origin: {
              kind: "derived",
              assetId: source.id,
              versionId: version.id,
            },
          };
          assetId = derived.id;
          return [derived, ...assets];
        },
        { expectedRevision: revision },
      );
      return { state, assetId };
    },
  };
}

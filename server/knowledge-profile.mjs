// 知识仓库三区统计与个人说明（路线 v3 切片 3.2 / 3.3；产品定义 v1.2 §4.4；D30、D32）。
// - 三区：按主库规则只读统计已连接 Vault 的 Markdown 元数据，不读正文、不移动或改写文件。
// - 个人说明：权威来源是 Vault 中归入“个人说明”区的文件夹（默认“个人上下文”）。经本人开启共享后，
//   本机 MCP 服务可读取正文（带大小上限）；Agent 只能提交修改建议，建议只进主库待处理队列。
// - 采纳：预览差异 → 本人确认。确认只记录结果；把新正文写入 Vault 需要覆盖已有文件，
//   现有知识受控写入只允许在“00 待整理”新建文件，写入接口留待本机实现并在 macOS 验证。
import { randomUUID, createHash } from "node:crypto";
import { failure } from "./repository.mjs";
import {
  DEFAULT_ZONE_RULES,
  validateZoneRules,
  zoneOf,
  zoneStats,
  profileFolders,
} from "../src/knowledge-zones.js";
import {
  PROFILE_LIMITS,
  paragraphText,
  lineText,
  vaultMarkdownPath,
} from "./knowledge-profile-schema.mjs";

const PREVIEW_TTL = 5 * 60 * 1000;
export const READ_LIMITS = Object.freeze({
  maxFiles: 20,
  maxFileChars: 16000,
  maxTotalChars: 64000,
});
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
function shape(input, required, optional = []) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    required.some((key) => !Object.hasOwn(input, key)) ||
    Object.keys(input).some((key) => !required.includes(key) && !optional.includes(key))
  )
    throw failure("请求字段无效");
}
const revisionOf = (value) => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw failure("缺少主库版本，请刷新后重试");
  return value;
};
// 把 schema 的校验错误转成面向调用方的 400（去掉“数据校验失败：”前缀）。
function checked(run) {
  try {
    return run();
  } catch (error) {
    throw failure(String(error.message).replace(/^数据校验失败：/, ""), 400);
  }
}
export const zonesOf = (state) =>
  state?.knowledgeZones || {
    schema: 1,
    rules: DEFAULT_ZONE_RULES.map((rule) => ({ ...rule })),
    sourceId: null,
    profileSharing: false,
    updatedAt: new Date(0).toISOString(),
  };
// 三区视图适用的知识源：规则里指定的来源；未指定时取第一个 Obsidian 来源，再退到第一个来源。
export function vaultSource(state) {
  const sources = state?.connections?.knowledgeSources || [];
  const { sourceId } = zonesOf(state);
  if (sourceId) return sources.find((s) => s.id === sourceId) || null;
  return sources.find((s) => s.kind === "obsidian") || sources[0] || null;
}
// 统一的“个人说明区内文件”判断：结构合法 + 按当前规则归入个人说明。
function profilePath(path, rules) {
  checked(() => vaultMarkdownPath(path));
  if (zoneOf(path, rules) !== "profile")
    throw failure("只能读取或修改“个人说明”区内的文件", 403);
  return path;
}
function occurrences(text, part) {
  let count = 0,
    index = text.indexOf(part);
  while (index !== -1 && count < 2) {
    count++;
    index = text.indexOf(part, index + 1);
  }
  return count;
}

export function createKnowledgeProfile(repository, { files, clock = Date.now }) {
  let latest = null;
  let statsRunning = false;
  const previews = new Map();
  const now = () => new Date(clock()).toISOString();
  async function state() {
    const stored = await repository.read();
    if (!stored) throw failure("请先打开工作台初始化资产库", 409);
    return stored;
  }
  async function shared() {
    const stored = await state();
    const zones = zonesOf(stored);
    if (!zones.profileSharing)
      throw failure("尚未允许 Agent 读取个人说明：请在知识仓库“个人说明”里开启 MCP 读取", 403);
    const source = vaultSource(stored);
    if (!source) throw failure("还没有连接 Vault，无法读取个人说明", 404);
    const folders = profileFolders(zones.rules);
    if (!folders.length) throw failure("划分规则里没有“个人说明”区，请先设置规则", 404);
    return { stored, zones, source, folders };
  }
  async function currentDocument(source, path) {
    const { document } = await files.current(source, path);
    return document;
  }
  return {
    async saveRules(input) {
      shape(input, ["rules", "sourceId", "expectedRevision"]);
      const rules = validateZoneRules(input.rules);
      if (input.sourceId !== null && typeof input.sourceId !== "string")
        throw failure("知识源无效");
      return repository.updateProfile(
        (stored) => {
          if (
            input.sourceId !== null &&
            !(stored.connections?.knowledgeSources || []).some((s) => s.id === input.sourceId)
          )
            throw failure("知识源已断开或不存在，请刷新", 404);
          return {
            knowledgeZones: {
              ...zonesOf(stored),
              rules,
              sourceId: input.sourceId,
              updatedAt: now(),
            },
          };
        },
        { expectedRevision: revisionOf(input.expectedRevision) },
      );
    },
    async setSharing(input) {
      shape(input, ["enabled", "confirmed", "expectedRevision"]);
      if (typeof input.enabled !== "boolean") throw failure("共享状态无效");
      if (input.confirmed !== true) throw failure("请先确认个人说明的共享范围");
      return repository.updateProfile(
        (stored) => ({
          knowledgeZones: { ...zonesOf(stored), profileSharing: input.enabled, updatedAt: now() },
        }),
        { expectedRevision: revisionOf(input.expectedRevision) },
      );
    },
    // 只读元数据扫描后按规则统计；同一时间只运行一次。结果只在内存里保留最近一次。
    async stats(input) {
      shape(input, ["sourceId"]);
      if (statsRunning) throw failure("三区统计正在进行，请稍候", 429);
      statsRunning = true;
      try {
        const stored = await state();
        const source = (stored.connections?.knowledgeSources || []).find((s) => s.id === input.sourceId);
        if (!source) throw failure("知识源已断开或不存在，请刷新", 404);
        const zones = zonesOf(stored);
        const scanned = await files.scan(source);
        const at = clock();
        const computed = zoneStats(scanned.files, zones.rules, at);
        const result = {
          sourceId: source.id,
          sourceName: source.name,
          generation: source.generation,
          at: new Date(at).toISOString(),
          status: scanned.status,
          issues: scanned.issues.length,
          rules: zones.rules,
          weekStart: computed.weekStart,
          zones: computed.zones,
          files: computed.files,
        };
        const { files: omitted, ...summary } = result;
        latest = summary;
        return result;
      } finally {
        statsRunning = false;
      }
    },
    async summary(input = {}) {
      shape(input, []);
      return { latest };
    },
    async readProfile(input = {}) {
      shape(input, [], ["path"]);
      const { zones, source, folders } = await shared();
      let paths;
      if (Object.hasOwn(input, "path")) paths = [profilePath(input.path, zones.rules)];
      else {
        const found = [];
        for (const folder of folders) {
          const scanned = await files.scan(source, { folder });
          for (const file of scanned.files)
            if (zoneOf(file.path, zones.rules) === "profile") found.push(file.path);
        }
        paths = [...new Set(found)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      }
      const result = [],
        omitted = paths.slice(READ_LIMITS.maxFiles);
      let remaining = READ_LIMITS.maxTotalChars;
      for (const path of paths.slice(0, READ_LIMITS.maxFiles)) {
        if (remaining <= 0) {
          omitted.push(path);
          continue;
        }
        const document = await currentDocument(source, path);
        const limit = Math.min(READ_LIMITS.maxFileChars, remaining);
        const content = document.content.slice(0, limit);
        remaining -= content.length;
        result.push({
          path,
          sha256: document.sha256,
          modifiedAt: document.modifiedAt,
          chars: document.content.length,
          truncated: content.length < document.content.length,
          content,
        });
      }
      return {
        source: source.name,
        readAt: now(),
        limits: READ_LIMITS,
        files: result,
        omitted,
      };
    },
    // Agent 提交修改建议：只进入主库待处理队列，不写 Vault。
    async propose(input) {
      shape(input, ["path", "original", "proposed", "reason", "proposer"]);
      checked(() => {
        paragraphText(input.original, "原段落需为 1–4000 字", PROFILE_LIMITS.paragraph);
        paragraphText(input.proposed, "建议段落需为 1–4000 字", PROFILE_LIMITS.paragraph);
        paragraphText(input.reason, "理由需为 1–1000 字", PROFILE_LIMITS.reason);
        lineText(input.proposer, "提出者需为 1–60 字的单行名称", PROFILE_LIMITS.proposer);
      });
      if (input.original === input.proposed) throw failure("建议段落与原段落相同");
      const { zones, source } = await shared();
      profilePath(input.path, zones.rules);
      const document = await currentDocument(source, input.path);
      const count = occurrences(document.content, input.original);
      if (count !== 1)
        throw failure(
          count ? "原段落在文件中出现多次，请提供更长、唯一的原段落" : "原段落不在文件中，请先用 read_profile 读取最新正文",
          409,
        );
      const proposal = {
        schema: 1,
        id: randomUUID(),
        sourceId: source.id,
        path: input.path,
        original: input.original,
        proposed: input.proposed,
        reason: input.reason,
        proposer: input.proposer.trim(),
        baseSha256: document.sha256,
        createdAt: now(),
        status: "pending",
      };
      await repository.updateProfile((stored) => {
        const list = stored.profileProposals || [];
        if (list.filter((p) => p.status === "pending").length >= PROFILE_LIMITS.pending)
          throw failure("待处理的个人说明建议已达上限，请先在工作台处理", 429);
        const next = [...list, proposal];
        // 超出总量时移除最早的已处理建议；待处理建议永不自动移除。
        while (next.length > PROFILE_LIMITS.proposals) {
          const index = next.findIndex((p) => p.status !== "pending");
          if (index === -1) break;
          next.splice(index, 1);
        }
        return { profileProposals: next };
      });
      return { id: proposal.id, status: "pending", path: proposal.path };
    },
    async preview(input) {
      shape(input, ["id"]);
      const stored = await state();
      const proposal = (stored.profileProposals || []).find((p) => p.id === input.id);
      if (!proposal) throw failure("建议不存在，请刷新待处理", 404);
      if (proposal.status !== "pending") throw failure("这条建议已处理", 409);
      const source = (stored.connections?.knowledgeSources || []).find((s) => s.id === proposal.sourceId);
      if (!source) throw failure("建议所属的 Vault 已断开，请重新连接后再预览", 409);
      profilePath(proposal.path, zonesOf(stored).rules);
      const document = await currentDocument(source, proposal.path);
      const count = occurrences(document.content, proposal.original);
      if (count !== 1)
        throw failure(
          count ? "原段落在当前文件中出现多次，无法确定修改位置" : "原段落已不在当前文件中，这条建议需要拒绝或由 Agent 重新提出",
          409,
        );
      const after = document.content.replace(proposal.original, () => proposal.proposed);
      for (const [key, value] of previews) if (value.expires <= clock()) previews.delete(key);
      if (previews.size >= 30) previews.delete(previews.keys().next().value);
      const previewId = randomUUID();
      const expires = clock() + PREVIEW_TTL;
      previews.set(previewId, {
        proposalId: proposal.id,
        source,
        path: proposal.path,
        baseSha256: document.sha256,
        resultSha256: sha256(after),
        expires,
      });
      return {
        previewId,
        proposalId: proposal.id,
        path: proposal.path,
        baseSha256: document.sha256,
        baseChanged: document.sha256 !== proposal.baseSha256,
        before: document.content,
        after,
        expiresAt: new Date(expires).toISOString(),
      };
    },
    // 确认：核对预览仍有效、文件未变化，再把建议标记为已确认。Vault 写入尚未实现（需本机验证）。
    async confirm(input) {
      shape(input, ["previewId", "confirmed", "expectedRevision"]);
      if (input.confirmed !== true) throw failure("请先勾选确认已核对差异");
      const expectedRevision = revisionOf(input.expectedRevision);
      const preview = typeof input.previewId === "string" && previews.get(input.previewId);
      if (!preview || preview.expires <= clock()) throw failure("预览已过期或不存在，请重新预览", 409);
      previews.delete(input.previewId);
      const document = await currentDocument(preview.source, preview.path);
      if (document.sha256 !== preview.baseSha256)
        throw failure("预览后文件已变化，请重新预览差异", 409);
      return repository.updateProfile(
        (stored) => {
          const list = stored.profileProposals || [];
          const proposal = list.find((p) => p.id === preview.proposalId);
          if (!proposal || proposal.status !== "pending") throw failure("这条建议已处理", 409);
          const source = (stored.connections?.knowledgeSources || []).find((s) => s.id === proposal.sourceId);
          if (
            !source ||
            source.generation !== preview.source.generation ||
            source.identity !== preview.source.identity
          )
            throw failure("Vault 连接已变化，请重新预览", 409);
          const at = now();
          return {
            profileProposals: list.map((p) =>
              p.id === proposal.id
                ? {
                    ...p,
                    status: "confirmed",
                    decidedAt: at,
                    confirmation: {
                      baseSha256: preview.baseSha256,
                      resultSha256: preview.resultSha256,
                      confirmedAt: at,
                      write: "awaiting_local",
                    },
                  }
                : p,
            ),
          };
        },
        { expectedRevision },
      );
    },
    async reject(input) {
      shape(input, ["id", "expectedRevision"]);
      return repository.updateProfile(
        (stored) => {
          const list = stored.profileProposals || [];
          const proposal = list.find((p) => p.id === input.id);
          if (!proposal) throw failure("建议不存在，请刷新待处理", 404);
          if (proposal.status !== "pending") throw failure("这条建议已处理", 409);
          const at = now();
          return {
            profileProposals: list.map((p) =>
              p.id === proposal.id ? { ...p, status: "rejected", decidedAt: at } : p,
            ),
          };
        },
        { expectedRevision: revisionOf(input.expectedRevision) },
      );
    },
  };
}

import { randomUUID } from "node:crypto";
import { failure } from "./repository.mjs";
import {
  feishuIdentity,
  feishuRoot,
  feishuSpaceIdentity,
  feishuSpaceRoot,
  feishuToken,
  isFeishuSpaceRoot,
  pendingFeishuIdentity,
  pendingFeishuSpaceIdentity,
  wikiTokenFromInput,
} from "./knowledge-feishu.mjs";

function exact(input, fields) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== fields.length || fields.some((field) => !Object.hasOwn(input, field)))
    throw failure("飞书知识请求字段无效");
  if (input.confirmed !== true) throw failure("请明确确认仅登记所选飞书 Wiki 节点及其子树");
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)
    throw failure("缺少主库版本，请刷新后重试");
}

// Connection stores only the selected Wiki pointer. The first step requires no
// account access; verification is an explicit second step after human OAuth.
export function createFeishuConnections(repository, {
  provider,
  clock = Date.now,
  initialConnections = () => ({
    roots: [], projects: [], agents: [],
    github: { status: "not_connected", login: "", message: "", at: "" },
    projectScannedAt: "", agentScannedAt: "", errors: [], truncated: false,
  }),
}) {
  return {
    async connect(input) {
      exact(input, ["name", "wikiUrl", "confirmed", "expectedRevision"]);
      const name = input.name;
      if (typeof name !== "string" || !name.trim() || name.length > 100 || /[\x00-\x1f\x7f]/.test(name))
        throw failure("飞书知识源名称无效");
      const token = wikiTokenFromInput(input.wikiUrl), root = feishuRoot(token);
      return repository.updateKnowledgeAccess((stored) => {
        const connections = stored.connections || initialConnections();
        const sources = connections.knowledgeSources || [];
        if (sources.length >= 20) throw failure("最多连接 20 个知识源", 413);
        if (sources.some((source) => source.root === root))
          throw failure("这个飞书节点已登记，请使用已有来源", 409);
        const source = {
          schema: 1, id: randomUUID(), name: name.trim(), kind: "feishu", root,
          identity: pendingFeishuIdentity(token), generation: randomUUID(),
          connectedAt: new Date(clock()).toISOString(), agentSharing: false,
          excludedFolders: [], feishuSpaceId: null, feishuVerifiedAt: null, feishuPrincipalHash: null,
        };
        return { connections: { ...connections, knowledgeSources: [...sources, source] } };
      }, { expectedRevision: input.expectedRevision });
    },
    async connectSpace(input) {
      exact(input, ["name", "spaceId", "confirmed", "expectedRevision"]);
      if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 100 ||
          /[\x00-\x1f\x7f]/.test(input.name))
        throw failure("飞书知识源名称无效");
      const root = feishuSpaceRoot(input.spaceId);
      return repository.updateKnowledgeAccess((stored) => {
        const connections = stored.connections || initialConnections();
        const sources = connections.knowledgeSources || [];
        if (sources.length >= 20) throw failure("最多连接 20 个知识源", 413);
        if (sources.some((source) => source.root === root))
          throw failure("这个飞书知识空间已登记，请使用已有来源", 409);
        const source = {
          schema: 1, id: randomUUID(), name: input.name.trim(), kind: "feishu", root,
          identity: pendingFeishuSpaceIdentity(input.spaceId), generation: randomUUID(),
          connectedAt: new Date(clock()).toISOString(), agentSharing: false,
          excludedFolders: [], feishuSpaceId: null, feishuVerifiedAt: null, feishuPrincipalHash: null,
        };
        return { connections: { ...connections, knowledgeSources: [...sources, source] } };
      }, { expectedRevision: input.expectedRevision });
    },
    async verify(input) {
      exact(input, ["sourceId", "confirmed", "expectedRevision"]);
      if (typeof input.sourceId !== "string") throw failure("飞书知识源身份无效");
      const captured = await repository.withSnapshot({}, (stored) => {
        if (!stored || stored.revision !== input.expectedRevision)
          throw failure("主库已变化，请刷新后重新核验飞书范围", 409);
        const source = stored.connections?.knowledgeSources?.find((item) => item.id === input.sourceId);
        if (!source || source.kind !== "feishu") throw failure("飞书知识源已断开，请刷新", 404);
        return source;
      });
      // Only metadata is read here. Credentials stay inside the selected CLI profile.
      const verified = await provider.resolveRoot(captured.root);
      const wholeSpace = isFeishuSpaceRoot(captured.root);
      const spaceId = verified.spaceId;
      if (!/^[0-9]{1,30}$/.test(spaceId || "") || verified.root !== captured.root ||
          verified.identity !== (wholeSpace
            ? feishuSpaceIdentity(spaceId)
            : feishuIdentity(spaceId, feishuToken(captured.root))) ||
          !/^[a-f0-9]{64}$/.test(verified.principalHash || ""))
        throw failure("飞书范围核验结果不完整，未保存授权", 503);
      return repository.updateKnowledgeAccess((stored) => {
        const sources = stored.connections?.knowledgeSources || [];
        const active = sources.find((item) => item.id === input.sourceId);
        if (!active || active.kind !== "feishu" || active.root !== captured.root ||
            active.generation !== captured.generation)
          throw failure("核验期间飞书知识源已变化，请刷新", 409);
        if (sources.some((item) => item.id !== active.id && item.kind === "feishu" && item.feishuSpaceId === spaceId))
          throw failure("同一飞书知识空间已有接入范围，请断开或使用现有来源", 409);
        const updated = { ...active, identity: verified.identity, feishuSpaceId: spaceId,
          feishuVerifiedAt: new Date(clock()).toISOString(), feishuPrincipalHash: verified.principalHash, agentSharing: false,
          generation: randomUUID() };
        const health = (stored.connections.knowledgeSourceHealth || []).filter((item) => item.sourceId !== active.id);
        return { connections: { ...stored.connections,
          knowledgeSources: sources.map((item) => item.id === active.id ? updated : item),
          knowledgeSourceHealth: health } };
      }, { expectedRevision: input.expectedRevision });
    },
  };
}

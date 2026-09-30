import { randomUUID } from "node:crypto";
import { failure } from "./repository.mjs";
import { createKnowledgeQuery } from "./knowledge-query.mjs";

const TTL = 10 * 60 * 1000;
const emptyConnections = () => ({
  roots: [],
  projects: [],
  agents: [],
  github: { status: "not_connected", login: "", message: "", at: "" },
  projectScannedAt: "",
  agentScannedAt: "",
  errors: [],
  truncated: false,
});
function shape(input, fields) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).length !== fields.length ||
    fields.some((k) => !Object.hasOwn(input, k))
  )
    throw failure("知识请求字段无效");
  for (const field of fields) {
    const value = input[field];
    if (field === "confirmed") {
      if (value !== true) throw failure("请明确确认本人只读范围");
    } else if (field === "expectedRevision" || field === "offset") {
      if (!Number.isSafeInteger(value) || value < 0)
        throw failure(
          field === "offset"
            ? "查询位置无效，请重新查询"
            : "缺少主库版本，请刷新后重试",
        );
    } else if (
      typeof value !== "string" ||
      !value.trim() ||
      (field === "query" ? value.trim().length : value.length) >
        (["root", "path"].includes(field) ? 2000 : 100) ||
      /[\x00-\x1f\x7f]/.test(value)
    )
      throw failure("知识名称、目录或身份无效");
  }
}
function sourceOf(state, id) {
  const source = state.connections?.knowledgeSources?.find((s) => s.id === id);
  if (!source) throw failure("知识连接已断开或不存在，请刷新连接", 404);
  return source;
}

// Persist only permissions/pointers; scan credentials and document bytes never
// enter the workspace snapshot or an Agent delivery package.
export function createKnowledgeConnections(
  repository,
  {
    files,
    clock = Date.now,
    initialConnections = emptyConnections,
    queryLimits,
  },
) {
  const scans = new Map();
  const query = createKnowledgeQuery({ files, clock, limits: queryLimits });
  const forget = (id) => scans.delete(id);
  const current = (state, input) => {
    const source = sourceOf(state, input.sourceId),
      scan = scans.get(source.id);
    if (
      !scan ||
      scan.scanId !== input.scanId ||
      scan.generation !== source.generation ||
      scan.expires <= clock()
    )
      throw failure("文件清单已失效，请重新扫描", 409);
    return { source, scan };
  };
  return {
    async capture(input) {
      shape(input, ["sourceId", "scanId", "path", "expectedSha256"]);
      if (!/^[a-f0-9]{64}$/.test(input.expectedSha256))
        throw failure("所选资料指纹无效");
      const captured = await repository.withSnapshot({}, (state) => {
        const { source, scan } = current(state, input);
        const selected = scan.files.get(input.path);
        if (!selected)
          throw failure("资料不在本次允许读取的清单中，请重新扫描", 403);
        return { source, scan, selected };
      });
      // Do not keep the repository queue while reading the file. A disconnect
      // must be able to invalidate the in-flight capture before it returns.
      const document = await files.read(captured.source, captured.selected);
      return repository.withSnapshot({}, (state) => {
        const active = current(state, input);
        if (
          active.scan !== captured.scan ||
          active.source.generation !== captured.source.generation ||
          active.source.root !== captured.source.root ||
          active.source.identity !== captured.source.identity
        )
          throw failure("整理期间来源已变化，请重新选择资料", 409);
        if (document.sha256 !== input.expectedSha256)
          throw failure("资料内容已变化，请重新阅读后加入整理", 409);
        return {
          sourceId: captured.source.id,
          sourceName: captured.source.name,
          root: captured.source.root,
          identity: captured.source.identity,
          generation: captured.source.generation,
          ...captured.selected,
          sha256: document.sha256,
          readAt: new Date(clock()).toISOString(),
        };
      });
    },
    async connect(input) {
      shape(input, ["name", "kind", "root", "confirmed", "expectedRevision"]);
      if (!["obsidian", "markdown"].includes(input.kind))
        throw failure("请选择本地 Obsidian 或 Markdown 来源");
      return repository.updateConnections(
        async (previous) => {
          const connections = previous || initialConnections();
          const sources = connections.knowledgeSources || [];
          if (sources.length >= 20)
            throw failure("最多连接 20 个知识目录，请先断开不用的来源", 413);
          const directory = await files.inspectRoot(input.root);
          if (sources.some((s) => s.root === directory.root))
            throw failure("这个目录已经连接，请使用已有来源", 409);
          const source = {
            schema: 1,
            id: randomUUID(),
            name: input.name.trim(),
            kind: input.kind,
            ...directory,
            generation: randomUUID(),
            connectedAt: new Date(clock()).toISOString(),
          };
          return { ...connections, knowledgeSources: [...sources, source] };
        },
        { expectedRevision: input.expectedRevision },
      );
    },
    async reconfirm(input) {
      shape(input, ["sourceId", "confirmed", "expectedRevision"]);
      const state = await repository.updateConnections(
        async (connections) => {
          const source = sourceOf({ connections }, input.sourceId);
          const directory = await files.inspectRoot(source.root);
          if (directory.root !== source.root)
            throw failure("目录位置已改变，请断开后重新连接", 409);
          const updated = {
            ...source,
            ...directory,
            generation: randomUUID(),
            connectedAt: new Date(clock()).toISOString(),
          };
          return {
            ...connections,
            knowledgeSources: connections.knowledgeSources.map((s) =>
              s.id === source.id ? updated : s,
            ),
          };
        },
        { expectedRevision: input.expectedRevision },
      );
      forget(input.sourceId);
      return state;
    },
    async remove(input) {
      shape(input, ["sourceId", "confirmed", "expectedRevision"]);
      const state = await repository.updateConnections(
        (connections) => {
          sourceOf({ connections }, input.sourceId);
          return {
            ...connections,
            knowledgeSources: connections.knowledgeSources.filter(
              (s) => s.id !== input.sourceId,
            ),
          };
        },
        { expectedRevision: input.expectedRevision },
      );
      forget(input.sourceId);
      return state;
    },
    async scan(input) {
      shape(input, ["sourceId"]);
      return repository.withSnapshot({}, async (state) => {
        const source = sourceOf(state, input.sourceId);
        forget(source.id);
        for (const [id, scan] of scans)
          if (scan.expires <= clock()) scans.delete(id);
        const result = await files.scan(source);
        const at = clock(),
          scanId = randomUUID();
        scans.set(source.id, {
          scanId,
          generation: source.generation,
          status: result.status,
          expires: at + TTL,
          files: new Map(result.files.map((f) => [f.path, f])),
        });
        return {
          ...result,
          scanId,
          sourceId: source.id,
          generation: source.generation,
          at: new Date(at).toISOString(),
          expiresAt: new Date(at + TTL).toISOString(),
        };
      });
    },
    async search(input) {
      shape(input, ["sourceId", "scanId", "query", "offset"]);
      const captured = await repository.withSnapshot({}, (state) =>
        current(state, input),
      );
      const assertCurrent = () =>
        repository.withSnapshot({}, (state) => {
          const active = current(state, input);
          if (
            active.scan !== captured.scan ||
            active.source.root !== captured.source.root ||
            active.source.identity !== captured.source.identity ||
            active.source.generation !== captured.source.generation
          )
            throw failure("知识来源已变化，请重新扫描后查询", 409);
        });
      const result = await query.search({
        source: captured.source,
        entries: [...captured.scan.files.values()].sort((a, b) =>
          a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
        ),
        query: input.query,
        offset: input.offset,
        assertCurrent,
      });
      await assertCurrent();
      return {
        ...result,
        sourceId: captured.source.id,
        generation: captured.source.generation,
        scanId: captured.scan.scanId,
        scanStatus: captured.scan.status,
        expiresAt: new Date(captured.scan.expires).toISOString(),
      };
    },
    async read(input) {
      shape(input, ["sourceId", "scanId", "path"]);
      return repository.withSnapshot({}, async (state) => {
        const { source, scan } = current(state, input);
        const selected = scan.files.get(input.path);
        if (!selected)
          throw failure("该文件不在本次允许读取的清单中，请重新扫描", 403);
        const document = await files.read(source, selected);
        if (scan.expires <= clock()) {
          forget(source.id);
          throw failure("读取期间文件清单已失效，请重新扫描", 409);
        }
        return {
          ...document,
          sourceId: source.id,
          sourceName: source.name,
          root: source.root,
          readAt: new Date(clock()).toISOString(),
        };
      });
    },
  };
}

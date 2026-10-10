import { inside, sourceScopeKey, revokeOverlaps, selectedProfileSource } from "./knowledge-access-policy.mjs";
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
  const scans = new Map(), scanTickets = new Map();
  const query = createKnowledgeQuery({ files, clock, limits: queryLimits });
  const forget = (id) => scans.delete(id);
  const current = (state, input) => {
    const source = sourceOf(state, input.sourceId),
      scan = scans.get(source.id);
    if (
      !scan ||
      scan.scanId !== input.scanId ||
      scan.generation !== source.generation ||
      scan.expires <= clock() || scan.scopeKey !== sourceScopeKey(state,source)
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
        if (source.kind === "feishu")
          throw failure("飞书来源仅支持只读检索，不进入本机整理或写回链路", 403);
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
      shape(input,["name","kind","root","confirmed","expectedRevision"]);
      if(!["obsidian","markdown"].includes(input.kind))throw failure("请选择本地 Obsidian 或 Markdown 来源");
      if(typeof input.root !== "string" || !input.root.startsWith("/"))
        throw failure("本机知识来源必须是绝对目录路径",400);
      return repository.updateKnowledgeAccess(async(stored)=>{
        const connections=stored.connections||initialConnections(),sources=connections.knowledgeSources||[];
        if(sources.length>=20)throw failure("最多连接20个知识目录",413);
        const directory=await files.inspectRoot(input.root);
        if(sources.some(s=>s.root===directory.root))throw failure("这个目录已经连接，请使用已有来源",409);
        const source={schema:1,id:randomUUID(),name:input.name.trim(),kind:input.kind,...directory,generation:randomUUID(),connectedAt:new Date(clock()).toISOString(),agentSharing:false,excludedFolders:[]};
        const revoked=revokeOverlaps({...stored,connections},[directory.root]);
        const next={...revoked,connections:{...revoked.connections,knowledgeSources:[...revoked.connections.knowledgeSources,source]}};
        const oldProfile=selectedProfileSource(stored),newProfile=selectedProfileSource({...stored,...next});
        if(oldProfile?.id!==newProfile?.id){next.connections=revokeOverlaps({...stored,...next},[oldProfile?.root,newProfile?.root].filter(Boolean)).connections;if(stored.knowledgeZones)next.knowledgeZones={...stored.knowledgeZones,profileSharing:false};}
        return next;
      },{expectedRevision:input.expectedRevision});
    },
    async reconfirm(input) {
      shape(input,["sourceId","confirmed","expectedRevision"]);
      const state=await repository.updateKnowledgeAccess(async(stored)=>{
        const source=sourceOf(stored,input.sourceId);
        if(source.kind === "feishu")throw failure("飞书来源请使用单独的范围核验",400);
        const directory=await files.inspectRoot(source.root);
        if(directory.root!==source.root)throw failure("目录位置已改变，请断开后重新连接",409);
        const target={...source,...directory,agentSharing:false,excludedFolders:source.excludedFolders||[],generation:randomUUID(),connectedAt:new Date(clock()).toISOString()};
        const patch=revokeOverlaps(stored,[source.root],{targetId:source.id,target});
        const previous=stored.connections?.knowledgeSourceHealth?.find((item)=>item.sourceId===source.id);
        patch.connections.knowledgeSourceHealth=[...(patch.connections.knowledgeSourceHealth||[]).filter((item)=>item.sourceId!==source.id),{
          sourceId:source.id,status:"confirmed",detectedAt:previous?.detectedAt||new Date(clock()).toISOString(),
          confirmedAt:new Date(clock()).toISOString(),beforeIdentity:previous?.beforeIdentity||source.identity,
          afterIdentity:directory.identity,
        }];
        if(stored.knowledgeZones && selectedProfileSource(stored) && (inside(source.root,selectedProfileSource(stored).root)||inside(selectedProfileSource(stored).root,source.root)))patch.knowledgeZones={...stored.knowledgeZones,profileSharing:false};
        return patch;
      },{expectedRevision:input.expectedRevision});forget(input.sourceId);return state;
    },
    async remove(input) {
      shape(input,["sourceId","confirmed","expectedRevision"]);
      const state=await repository.updateKnowledgeAccess((stored)=>{
        const source=sourceOf(stored,input.sourceId),patch=revokeOverlaps(stored,[source.root]);
        patch.connections.knowledgeSources=patch.connections.knowledgeSources.filter(s=>s.id!==source.id);
        patch.connections.knowledgeSourceHealth=(patch.connections.knowledgeSourceHealth||[]).filter(h=>h.sourceId!==source.id);
        if(stored.knowledgeZones && selectedProfileSource(stored)?.id===source.id)patch.knowledgeZones={...stored.knowledgeZones,sourceId:null,profileSharing:false};
        return patch;
      },{expectedRevision:input.expectedRevision});forget(input.sourceId);return state;
    },
    async scan(input) {
      shape(input,["sourceId"]);
      const captured=await repository.withSnapshot({},state=>({source:sourceOf(state,input.sourceId),key:sourceScopeKey(state,sourceOf(state,input.sourceId))}));
      const ticket=randomUUID();scanTickets.set(captured.source.id,ticket);forget(captured.source.id);
      for(const [id,scan]of scans)if(scan.expires<=clock())scans.delete(id);
      const result=await files.scan(captured.source);
      return repository.withSnapshot({},state=>{
        const source=sourceOf(state,input.sourceId);
        if(sourceScopeKey(state,source)!==captured.key||scanTickets.get(source.id)!==ticket)throw failure("扫描期间知识范围已变化，请重新扫描",409);
        const at=clock(),scanId=randomUUID();
        scans.set(source.id,{scanId,generation:source.generation,scopeKey:captured.key,status:result.status,expires:at+TTL,files:new Map(result.files.map(f=>[f.path,f]))});
        return {...result,scanId,sourceId:source.id,generation:source.generation,at:new Date(at).toISOString(),expiresAt:new Date(at+TTL).toISOString()};
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
      shape(input,["sourceId","scanId","path"]);
      const captured=await repository.withSnapshot({},state=>{const {source,scan}=current(state,input);const selected=scan.files.get(input.path);if(!selected)throw failure("该文件不在本次允许读取的清单中，请重新扫描",403);return {source,scan,selected};});
      const document=await files.read(captured.source,captured.selected);
      return repository.withSnapshot({},state=>{const active=current(state,input);if(active.scan!==captured.scan)throw failure("读取期间清单已变化，请重新扫描",409);return {...document,sourceId:captured.source.id,sourceName:captured.source.name,root:captured.source.root,readAt:new Date(clock()).toISOString()};});
    },
  };
}

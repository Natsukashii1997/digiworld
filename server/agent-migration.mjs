// 分类型迁移：固定已登记 Home、显式读取、不可变预览、逐项留痕，不启动 Agent。
import fs from "node:fs/promises";
import { guardCapabilityFilesystem } from "./guarded-capability-filesystem.mjs";
import { constants } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { parseTOML, getStaticTOMLValue } from "toml-eslint-parser";
import { parseDocument } from "yaml";
import { digest, failure } from "./repository.mjs";
import { readConfigFile, atomicReplaceConfig } from "./config-file.mjs";
import { createConfigJournal } from "./config-journal.mjs";
import { filterRelayText } from "../src/relay-prompt.js";
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,
  HASH = /^[a-f0-9]{64}$/;
const FILES = new Set([
  "AGENTS.md",
  "AGENTS.override.md",
  "SOUL.md",
  "WORKBENCH-MEMORY.md",
  "WORKBENCH-CONNECTIONS.md",
]);
const sourceFiles = (id) =>
  id === "codex"
    ? ["AGENTS.override.md", "AGENTS.md", "memories/MEMORY.md", "memories/memory_summary.md"]
    : ["SOUL.md", "memories/MEMORY.md", "memories/USER.md"];
const textOf = (f) => new TextDecoder("utf-8", { fatal: true }).decode(f.bytes);
const fail = (s, status = 409) => failure(s, status);
const proof = (p) => ({
  targetSignature: p.targetSignature,
  homeSignature: p.homeSignature,
  programSignature: p.programSignature,
});
function shape(v, keys) {
  if (
    !v ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.includes(k)) ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    throw fail("迁移请求字段无效", 400);
}
function validate(row) {
  if (
    row.schema !== 1 ||
    !UUID.test(row.id) ||
    !["batch", "document", "restore"].includes(row.kind) ||
    typeof row.targetId !== "string" ||
    !Number.isFinite(Date.parse(row.at))
  )
    throw fail("迁移记录无效");
  if (row.kind === "batch") {
    if(row.restores!==undefined&&!UUID.test(row.restores))throw fail('迁移恢复关联无效');
    if(['targetSignature','homeSignature','programSignature'].some(k=>row[k]!==undefined&&!HASH.test(row[k])))throw fail('迁移目标证明无效');
    if (
      !Array.isArray(row.items) ||
      row.items.length > 22 ||
      row.items.some(
        (i) =>
          !["skill", "document", "skipped"].includes(i.kind) ||
          typeof i.name !== "string" ||
          (i.kind !== "skipped" && !UUID.test(i.id)),
      )
    )
      throw fail("迁移批次记录无效");
  } else {
    if (
      !FILES.has(row.file) ||
      !HASH.test(row.beforeHash) ||
      !HASH.test(row.afterHash) ||
      ![row.targetSignature, row.homeSignature, row.programSignature].every(
        (x) => HASH.test(x),
      ) ||
      !Number.isSafeInteger(row.offset) ||
      row.offset < 0 ||
      typeof row.before !== "string" ||
      typeof row.after !== "string" ||
      row.before.length + row.after.length > 120000 ||
      !Number.isInteger(row.mode) ||
      row.mode < 0 ||
      row.mode > 0o777 ||
      typeof row.created !== "boolean"
    )
      throw fail("迁移文档记录无效");
    if (row.kind === "restore" && !UUID.test(row.restores))
      throw fail("恢复记录无效");
  }
  return row;
}
// Deliberately not a shell-command renderer. Redacted arguments keep their slots.
export function publicConnections(text, agentId) {
  let value;
  try {
    if(agentId==='codex') value=getStaticTOMLValue(parseTOML(text,{tomlVersion:'1.0.0'}));
    else {const doc=parseDocument(text,{uniqueKeys:true});if(doc.errors.length||doc.warnings.length)throw 0;value=doc.toJS({maxAliasCount:0});}
  } catch {throw fail('连接定义无法解析，未生成草稿');}
  const entries=value?.mcp_servers;
  if(!entries||typeof entries!=='object'||Array.isArray(entries))return [];
  const envName=v=>typeof v==='string'&&/^[A-Z_][A-Z0-9_]{0,119}$/i.test(v);
  const toolNames=v=>Array.isArray(v)?v.filter(x=>typeof x==='string'&&/^[A-Za-z0-9_.:*?\[\]-]{1,120}$/.test(x)).slice(0,100):[];
  return Object.entries(entries).slice(0,50).flatMap(([name,v])=>{
    if(!v||typeof v!=='object'||Array.isArray(v))return [];
    const item={name:filterRelayText(name).text.slice(0,120),requiresSetup:true,readyToConfigure:true,missing:[]};
    if(typeof v.command==='string'){
      item.transport='stdio';item.command=/^[a-zA-Z][a-zA-Z0-9._-]{0,79}$/.test(v.command)?v.command:'[请在目标重新选择本机程序]';
      if(item.command.startsWith('['))item.missing.push('目标本机程序');
      const args=Array.isArray(v.args)?v.args:[];
      const packageIndex=['npx','uvx'].includes(v.command)?(['-y','--yes'].includes(args[0])?1:0):-1;
      item.arguments=args.slice(0,80).map((arg,index)=>{
        const fixed=['-y','--yes'].includes(arg)&&index===0&&v.command==='npx';
        const pkg=index===packageIndex&&typeof arg==='string'&&/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:@[0-9][a-zA-Z0-9._+-]*)?$/.test(arg)&&arg.length<=180;
        if((fixed||pkg)&&!filterRelayText(arg).count)return {index,kind:'public',value:arg};
        item.missing.push(`参数 ${index+1}`);return {index,kind:'required',reason:'可能含凭据或机器路径；须在目标核对填写'};
      });
      if(v.args!==undefined&&!Array.isArray(v.args)||args.length>80)item.missing.push('参数结构或数量超出支持范围');
      item.argumentsNote='参数按原位置保留；待补槽不能删除后当作完整命令执行';
    }
    if(typeof v.url==='string'){
      item.transport=item.transport?'unsupported':'http';
      try{const u=new URL(v.url);if(!['http:','https:'].includes(u.protocol))throw 0;item.origin=u.origin;
        if(!u.username&&!u.password&&!u.search&&!u.hash&&['/','/mcp','/sse'].includes(u.pathname)&&!filterRelayText(v.url).count)item.url=u.toString();
        else {item.url='[请在目标重新填写完整地址；路径和查询可能含凭据]';item.missing.push('完整连接地址');}
      }catch{item.url='[请重新填写连接地址]';item.missing.push('连接地址');}
    }
    if(!item.transport||item.transport==='unsupported')item.missing.push('明确选择一种传输方式');
    item.requiredEnvironment=[...new Set([
      ...(v.env&&typeof v.env==='object'&&!Array.isArray(v.env)?Object.keys(v.env):[]),
      ...(Array.isArray(v.env_vars)?v.env_vars.map(x=>typeof x==='string'?x:x?.name):[]),
      ...(envName(v.bearer_token_env_var)?[v.bearer_token_env_var]:[]),
      ...(v.env_http_headers&&typeof v.env_http_headers==='object'?Object.values(v.env_http_headers):[])
    ].filter(envName))].slice(0,40);
    if(item.requiredEnvironment.length)item.missing.push('目标环境变量与授权');
    if(v.headers||v.http_headers||v.oauth||v.http_headers_helper)item.missing.push('目标原生认证配置');
    if(v.auth==='oauth'){item.authentication='oauth';item.missing.push('目标原生OAuth授权');}
    const mapped=new Set(['command','args','url','env','env_vars','bearer_token_env_var','env_http_headers','headers','http_headers','oauth','http_headers_helper','auth','enabled_tools','disabled_tools','tools','enabled']);
    if(Object.keys(v).some(k=>!mapped.has(k)))item.missing.push('未映射设置须在目标核对');
    const allowed=agentId==='codex'?v.enabled_tools:v.tools?.include,denied=agentId==='codex'?v.disabled_tools:v.tools?.exclude;
    if(allowed!==undefined||denied!==undefined){item.toolRestrictions={allowed:toolNames(allowed),disabled:toolNames(denied),sourcePrecedence:agentId==='codex'?'deny_after_allow':'include_wins',mapping:'跨Agent须核对最终有效范围，不能直接改名'};
      if([allowed,denied].some(x=>x!==undefined&&(!Array.isArray(x)||toolNames(x).length!==x.length)))item.missing.push('完整工具限制');}
    if(typeof v.enabled==='boolean')item.sourceEnabled=v.enabled;
    item.authorization='凭据、请求头与OAuth授权不复制；在目标原生应用重新设置';
    item.readyToConfigure=item.missing.length===0;
    return [item];
  });
}
export function createAgentMigration(
  repository,
  {
    api,
    scope,
    settings,
    filesystem = fs,
    clock = Date.now,
    checkMetadata,
    checkConfigMetadata,
    forgetPreview = () => {},
    skillAdoption,
  } = {},
) {
  let writeGuard = null;
  filesystem = guardCapabilityFilesystem(filesystem, async () => {
    if (writeGuard) await writeGuard();
  });
  const active = new Set(),
    plans = new Map(),
    journal = createConfigJournal(repository.directory, {
      filesystem,
      folder: "agent-migrations",
      validate,
      label: "Agent 迁移",
      readLimit: 512 * 1024,
    });
  const now = () => new Date(clock()).toISOString();
  async function optional(path) {
    try {
      return await readConfigFile(path, { filesystem, limit: 128 * 1024 });
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }
  async function instructionFile(place) {
    if (place.target.agentId !== "codex") return "SOUL.md";
    const override = await optional(
      join(place.home.path, "AGENTS.override.md"),
    );
    return override && textOf(override).trim()
      ? "AGENTS.override.md"
      : "AGENTS.md";
  }
  async function sourceDocuments(place) {
    const items = [];
    for (const file of sourceFiles(place.target.agentId)) {
      const id = digest(file).slice(0, 24),
        type = file.includes("memories/") ? "memory" : "personality";
      try {
        const value = await optional(join(place.home.path, file));
        if (!value) continue;
        const text = textOf(value),
          filtered = filterRelayText(text);
        items.push({
          id,
          type,
          name: file,
          body: filtered.text,
          hash: value.hash,
          identity: value.identity,
          file,
          actionable: filtered.count === 0 && text.trim().length > 0,
          reason: filtered.count
            ? "发现疑似凭据，整项不迁移；请先在来源清理"
            : text.trim()
              ? ""
              : "内容为空",
        });
      } catch {
        items.push({
          id,
          type,
          name: file,
          file,
          readState: "unreadable",
          actionable: false,
          reason: "无法安全读取；未把读取失败当作没有内容",
        });
      }
    }
    const file =
      place.target.agentId === "codex" ? "config.toml" : "config.yaml";
    try {
      const value = await optional(join(place.home.path, file));
      if (value) {
        const entries = publicConnections(textOf(value), place.target.agentId);
        if (entries.length)
          items.push({
            id: "connections",
            type: "connection",
            name: "MCP 连接导入草稿",
            body:
              "这些定义是安全配置草稿，不是可执行命令，不会注册或启动连接。\n先按目标Home核对每个参数槽和缺项；保留目标既有连接。请原生Agent生成配置差异，经用户确认后再写配置和认证，并用一次获准的只读工具调用验收。\n\n" +
              JSON.stringify(entries, null, 2),
            hash: value.hash,
            identity: value.identity,
            file,
            actionable: true,
            reason: "只迁公开定义；不复制密钥、不自动启用",
          });
      }
    } catch {
      items.push({
        id: "connections",
        type: "connection",
        name: "MCP 连接",
        actionable: false,
        reason: "无法解析连接配置，未读取为可迁移定义",
      });
    }
    const override = items.find(
      (i) =>
        i.file === "AGENTS.override.md" &&
        (i.body?.trim() || i.readState === "unreadable"),
    );
    return override
      ? items.filter((i) => i.file !== "AGENTS.md")
      : items.filter((i) => i.file !== "AGENTS.override.md");
  }
  async function capture(input) {
    shape(input, ["sourceTargetId"]);
    const state = await repository.read(),
      place = await scope(state, input.sourceTargetId),
      documents = await sourceDocuments(place);
    let skills = [],
      skillError = "";
    try {
      skills = (await api.migrationSkills({ targetId: input.sourceTargetId })).items
        .filter((x) => x.type === "Skill" && x.enabled !== false)
        .map((x) => ({
          ...x,
          type: "capability",
          reason: x.actionable
            ? "复制完整独立 Skill 包；不改启用配置，目标是否加载须另行确认"
            : x.reason,
        }));
    } catch {
      skillError = "Skill 清单读取受阻；其他类别仍可检查";
    }
    return {
      revision: state.revision,
      sourceTargetId: input.sourceTargetId,
      agentId: place.target.agentId,
      items: [
        ...documents.map(({ body, identity, hash, file, ...v }) => ({
          ...v,
          preview: body?.slice(0, 200),
        })),
        ...skills,
      ],
      skillError,
      categories: ["personality", "memory", "capability", "connection"],
    };
  }
  async function preview(input) {
    shape(input, ["sourceTargetId", "targetId", "revision", "items"]);
    if (
      input.sourceTargetId === input.targetId ||
      !Array.isArray(input.items) ||
      !input.items.length ||
      input.items.length > 16 ||
      new Set(input.items.map((x) => x.id)).size !== input.items.length ||
      input.items.some(
        (x) =>
          !x ||
          typeof x.id !== "string" ||
          !["skip", "replace"].includes(x.conflict),
      )
    )
      throw fail("请选择不同目标和 1–16 项内容", 400);
    const state = await repository.read();
    if (state.revision !== input.revision) throw fail("主库已变化，请重新读取");
    const source = await scope(state, input.sourceTargetId),
      target = await scope(state, input.targetId),
      docs = await sourceDocuments(source),
      catalog = await capture({ sourceTargetId: input.sourceTargetId }),
      g = await settings.get("agent");
    for (const [id, p] of plans)
      if (
        p.source.target.id === input.sourceTargetId &&
        p.target.target.id === input.targetId
      ) {
        for (const i of p.items) if (i.kind === "skill") forgetPreview(i.id);
        plans.delete(id);
      }
    const items = [],
      groups = new Map();
    for (const choice of input.items) {
      const item = catalog.items.find((i) => i.id === choice.id);
      if (!item?.actionable) throw fail("选中项不在可迁移清单，请重新读取");
      if (item.type === "capability") {
        try {
          const p = await api.migrationPreview({
            sourceTargetId: input.sourceTargetId,
            targetId: input.targetId,
            itemId: item.id,
            revision: input.revision,
          });
          items.push({ kind: "skill", id: p.token, name: item.name, plan: p });
        } catch (e) {
          if (!/同名/.test(e.message)) throw e;
          items.push({
            kind: "skipped",
            name: item.name,
            reason: "目标已有同名 Skill，保留目标；覆盖须在原生 Agent 核对",
          });
        }
        continue;
      }
      const doc = docs.find((d) => d.id === item.id);
      if (!doc?.actionable || doc.body.length > 30000)
        throw fail("文档不可迁移或超过 3 万字，请先整理");
      const file =
        doc.type === "connection"
          ? "WORKBENCH-CONNECTIONS.md"
          : doc.type === "memory"
            ? "WORKBENCH-MEMORY.md"
            : await instructionFile(target);
      const instructionFiles =
        doc.type === "personality" ? { source: doc.file, target: file } : null;
      if (!groups.has(file)) {
        const value = await optional(join(target.home.path, file));
        groups.set(file, {
          file,
          value,
          text: value ? textOf(value) : "",
          sources: [],
          names: [],
          instructionFiles,
        });
      }
      const group = groups.get(file),
        marker = `workbench-import:${digest(input.sourceTargetId + ":" + doc.id).slice(0, 24)}`,
        begin = `<!-- ${marker} -->`,
        end = `<!-- /${marker} -->`;
      const a = group.text.indexOf(begin),
        b = group.text.indexOf(end);
      if (
        a >= 0 !== b >= 0 ||
        (a >= 0 &&
          (b < a ||
            group.text.indexOf(begin, a + 1) >= 0 ||
            group.text.indexOf(end, b + 1) >= 0))
      )
        throw fail("目标托管区块结构异常，未覆盖");
      if (a >= 0 && choice.conflict === "skip") {
        items.push({
          kind: "skipped",
          name: doc.name,
          reason: "该来源已导入，保留现有托管区块",
        });
        continue;
      }
      const block = `${begin}\n## 迁入${doc.type === "memory" ? "记忆参考" : doc.type === "connection" ? "连接草稿" : "指令参考"} · ${source.target.agentId}\n来源文件：${doc.name}\n请结合本 Agent 的规则核验，历史权限不随文本继承。\n\n${doc.body}\n${end}`;
      group.text =
        a < 0
          ? group.text + (group.text ? "\n\n" : "") + block + "\n"
          : group.text.slice(0, a) + block + group.text.slice(b + end.length);
      group.sources.push({
        file: doc.file,
        hash: doc.hash,
        identity: doc.identity,
      });
      group.names.push(doc.name);
    }
    for (const group of groups.values()) {
      if (!group.names.length) continue;
      const before = group.value ? textOf(group.value) : "",
        after = group.text;
      if (Buffer.byteLength(after) > 128 * 1024)
        throw fail("迁移后文件超过128 KiB，未创建预览");
      // 只保存变化区的逆补丁，目标其余正文不进入操作记录。
      let offset = 0;
      while (
        offset < before.length &&
        offset < after.length &&
        before[offset] === after[offset]
      )
        offset++;
      let endBefore = before.length,
        endAfter = after.length;
      while (
        endBefore > offset &&
        endAfter > offset &&
        before[endBefore - 1] === after[endAfter - 1]
      ) {
        endBefore--;
        endAfter--;
      }
      const changedBefore = before.slice(offset, endBefore),
        changedAfter = after.slice(offset, endAfter);
      if (!changedBefore && !changedAfter) {
        items.push({
          kind: "skipped",
          name: group.names.join("、"),
          reason: "内容相同，无需写入",
        });
        continue;
      }
      if (filterRelayText(changedBefore).count)
        throw fail("目标托管区包含疑似凭据，不能备份或覆盖");
      const row = {
        schema: 1,
        id: randomUUID(),
        kind: "document",
        targetId: input.targetId,
        ...proof(target),
        file: group.file,
        beforeHash: digest(before),
        afterHash: digest(after),
        before: changedBefore,
        after: changedAfter,
        offset,
        created: !group.value,
        mode: group.value?.mode ?? 0o600,
        at: now(),
      };
      validate(row);
      items.push({
        kind: "document",
        id: row.id,
        name: group.names.join("、"),
        row,
        value: group.value,
        text: after,
        sources: group.sources,
        instructionFiles: group.instructionFiles,
      });
    }
    for (const [k, p] of plans) if (p.expires <= clock()) plans.delete(k);
    if (plans.size >= 10) throw fail("迁移预览过多，请稍后重试");
    const id = randomUUID(),
      p = {
        id,
        items,
        source,
        target,
        revision: state.revision,
        generation: g.generation,
        expires: clock() + 300000,
      };
    plans.set(id, p);
    return {
      token: id,
      revision: p.revision,
      source: source.target.label,
      target: target.target.label,
      expiresAt: new Date(p.expires).toISOString(),
      enabled: g.enabled,
      items: items.map((i) => ({
        kind: i.kind,
        id: i.id,
        name: i.name,
        reason: i.reason,
        file: i.row?.file,
        changes: i.plan?.changes,
        before: i.row?.before,
        after: i.row?.after,
        setupRequired: [
          "WORKBENCH-CONNECTIONS.md",
          "WORKBENCH-MEMORY.md",
        ].includes(i.row?.file),
      })),
      adoption: "unverified",
    };
  }
  async function verify(p, state) {
    if (clock() >= p.expires || state.revision !== p.revision)
      throw fail("预览已过期或主库变化，请重新预览");
    const g = await settings.get("agent");
    await settings.assertEnabled("agent");
    if (!g.enabled || g.generation !== p.generation)
      throw fail("Agent 写入授权已变化，请重新预览");
    await scope(state, p.source.target.id, p.source);
    await scope(state, p.target.target.id, p.target);
  }
  async function checkDocument(row, state) {
    try {
      const target = await scope(state, row.targetId, row),
        value = await optional(join(target.home.path, row.file));
      return {
        id: row.id,
        status:
          value?.hash === row.afterHash
            ? "matches_after"
            : (value?.hash ?? digest("")) === row.beforeHash
              ? "matches_before"
              : "changed",
        file: row.file,
        completedAt: row.completedAt || null,
        adoption: "unverified",
      };
    } catch {
      return {
        id: row.id,
        status: "unknown",
        file: row.file,
        adoption: "unverified",
      };
    }
  }
  async function check(input) {
    shape(input, ["id"]);
    if (active.has(input.id))
      return {
        id: input.id,
        status: "running",
        running: true,
        unresolved: true,
        items: [],
        adoption: "unverified",
      };
    const row = await journal.get(input.id);
    if (!row) {
      const legacy=(await legacySkillRestores()).find(r=>r.id===input.id);
      if(!legacy)throw fail('没有该迁移记录',404);
      const value=await api.check({id:input.id}),unresolved=value.status==='unknown'||value.status==='changed'&&!value.completedAt||value.status==='matches_after'&&!value.completedAt;
      return {id:input.id,items:[{...value,kind:'skill',operationKind:value.kind}],status:value.status==='matches_after'&&value.completedAt?'verified':'partial',unresolved:!!unresolved,completedAt:value.completedAt,running:false,adoption:'unverified'};
    }
    if (row.kind !== "batch")
      return checkDocument(row, await repository.read());
    const items = [];
    for (const i of row.items) {
      if (i.kind === "skipped") {
        items.push({ ...i, status: "skipped" });
        continue;
      }
      let value;
      try {
        value =
          i.kind === "skill"
            ? await api.check({ id: i.id })
            : await check({ id: i.id });
      } catch (e) {
        value = { status: e.status === 404 ? "not_started" : "unknown" };
      }
      items.push({ ...i, ...value, operationKind: value.kind, kind: i.kind });
    }
    return {
      id: row.id,
      items,
      running: active.has(row.id),
      unresolved:
        active.has(row.id) ||
        items.some(
          (i) =>
            i.status === "unknown" ||
            (i.status === "changed" && !i.completedAt) ||
            (i.status === "matches_after" && !i.completedAt),
        ),
      status: active.has(row.id)
        ? "running"
        : row.completedAt &&
            items.every(
              (i) =>
                i.status === "skipped" ||
                (i.status === "matches_after" && i.completedAt),
            )
          ? "verified"
          : "partial",
      completedAt: row.completedAt,
      adoption: "unverified",
    };
  }
  async function apply(input) {
    shape(input, ["token", "revision"]);
    if (active.has(input.token)) return check({ id: input.token });
    const existing = await journal.get(input.token);
    if (existing || active.has(input.token)) return check({ id: input.token });
    const p = plans.get(input.token);
    if (!p || input.revision !== p.revision)
      throw Object.assign(fail("迁移预览无效，请重新预览"), {
        operationNotStarted: true,
      });
    if (active.size)
      throw Object.assign(fail("另一批迁移仍在执行，请等待后重新核对"), {
        operationNotStarted: true,
      });
    active.add(p.id);
    try {
      // 先固定整批及每项编号；任一不确定立即停止。不是跨文件原子事务。
      const batch = {
        schema: 1,
        id: p.id,
        kind: "batch",
        targetId: p.target.target.id,
        ...proof(p.target),
        ...(p.restores ? { restores: p.restores } : {}),
        at: now(),
        items: p.items.map(({ kind, id, name, reason }) => ({
          kind,
          ...(id ? { id } : {}),
          name,
          ...(reason ? { reason } : {}),
        })),
      };
      try {
        await repository.withSnapshot({}, async (state) => {
          await verify(p, state);
          writeGuard = () => verify(p, state);
          try {
            await journal.prepare(batch);
          } finally {
            writeGuard = null;
          }
        });
      } catch (e) {
        const saved = await journal.get(p.id);
        if (!saved) e.operationNotStarted = true;
        throw e;
      }
      plans.delete(p.id);
      let complete = true;
      for (const item of p.items) {
        if (item.kind === "skipped") continue;
        try {
          if (item.kind === "skill") {
            const result = await api.apply({
              token: item.id,
              revision: p.revision,
            });
            if (
              result.status !== "matches_after" ||
              result.notice ||
              !result.completedAt
            ) {
              complete = false;
              break;
            }
            continue;
          }
          await repository.withSnapshot({}, async (state) => {
            const guard = async () => {
              await verify(p, state);
              if (
                item.instructionFiles &&
                ((await instructionFile(p.source)) !==
                  item.instructionFiles.source ||
                  (await instructionFile(p.target)) !==
                    item.instructionFiles.target)
              )
                throw fail("有效指令入口已变化，请重新读取和预览");
              for (const source of item.sources) {
                const value = await optional(
                  join(p.source.home.path, source.file),
                );
                if (
                  value?.hash !== source.hash ||
                  value?.identity !== source.identity
                )
                  throw fail("迁移来源已变化，已停止");
              }
            };
            writeGuard = guard;
            try {
              await guard();
              for (const source of item.sources) {
                const value = await optional(
                  join(p.source.home.path, source.file),
                );
                if (
                  value?.hash !== source.hash ||
                  value?.identity !== source.identity
                )
                  throw fail("迁移来源已变化，已停止");
              }
              const path = join(p.target.home.path, item.row.file),
                current = await optional(path);
              if (
                (current?.hash ?? digest("")) !== item.row.beforeHash ||
                current?.identity !== item.value?.identity
              )
                throw fail("目标已变化，已停止");
              if (current) await checkMetadata?.(path);
              await journal.prepare(item.row);
              await verify(p, state);
              if (current)
                await atomicReplaceConfig(
                  path,
                  current,
                  Buffer.from(item.text),
                  {
                    filesystem,
                    verifyScope: () => verify(p, state),
                    ...(checkConfigMetadata
                      ? { checkMetadata: checkConfigMetadata }
                      : {}),
                  },
                );
              else {
                await verify(p, state);
                const h = await filesystem.open(
                  path,
                  constants.O_WRONLY |
                    constants.O_CREAT |
                    constants.O_EXCL |
                    constants.O_NOFOLLOW,
                  0o600,
                );
                try {
                  await verify(p, state);
                  await h.writeFile(item.text);
                  await h.sync();
                } finally {
                  await h.close();
                }
                const parent = await filesystem.open(
                  p.target.home.path,
                  constants.O_RDONLY |
                    constants.O_DIRECTORY |
                    constants.O_NOFOLLOW,
                );
                try {
                  await parent.sync();
                } finally {
                  await parent.close();
                }
              }
              const result = await checkDocument(item.row, state);
              if (result.status !== "matches_after")
                throw fail("目标回读未确认");
              await journal.complete(item.id, now());
            } finally {
              writeGuard = null;
            }
          });
        } catch {
          complete = false;
          break;
        }
      }
      if (complete) {
        try {
          await repository.withSnapshot({}, async (state) => {
            writeGuard = () => verify(p, state);
            try {
              await verify(p, state);
              await journal.complete(p.id, now());
            } finally {
              writeGuard = null;
            }
          });
        } catch {
          /* 未取得完成回执仍为partial，查询不重放。 */
        }
      }
    } finally {
      active.delete(p.id);
    }
    return check({ id: p.id });
  }
  async function legacySkillRestores(targetId) {
    const batches=(await journal.list()).filter(r=>r.kind==='batch'&&(!targetId||r.targetId===targetId));
    const represented=new Set(batches.flatMap(r=>r.items.filter(i=>i.kind==='skill').map(i=>i.id))),rows=[];
    for(const id of new Set(batches.map(r=>r.targetId))){
      const history=await api.history({targetId:id});
      for(const r of history.items)if(r.kind==='rollback'&&represented.has(r.restores)&&!represented.has(r.id))rows.push({id:r.id,at:r.at,targetId:id,kind:'restore',restores:r.restores,legacy:true,items:[{kind:'skill',id:r.id,name:r.name}]});
    }
    return rows;
  }
  async function history(input) {
    shape(input, ['targetId']);
    const items=(await journal.list()).filter(r=>r.targetId===input.targetId&&r.kind==='batch').map(r=>({id:r.id,at:r.at,items:r.items,kind:r.restores?'restore':'migration',restores:r.restores||null}));
    return {items:[...items,...await legacySkillRestores(input.targetId)].sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id))};
  }
  async function rollbackPreview(input) {
    shape(input, ["id", "revision"]);
    const row = await journal.get(input.id);
    if (!row) {
      const owner=(await journal.list()).find(r=>r.kind==='batch'&&r.items.some(i=>i.kind==='skill'&&i.id===input.id));
      if(!owner)throw fail('请选择本迁移的文档或Skill操作');
      const state=await repository.read();if(state.revision!==input.revision)throw fail('主库已变化');
      const target=await scope(state,owner.targetId,owner.targetSignature?owner:undefined);
      const result=await api.check({id:input.id});if(result.kind!=='publish')throw fail('只支持撤回迁入Skill');
      const plan=await api.rollbackPreview(input),g=await settings.get('agent'),id=randomUUID();
      plans.set(id,{id,source:target,target,restores:input.id,revision:state.revision,generation:g.generation,expires:clock()+300000,items:[{kind:'skill',id:plan.token,name:plan.name,plan}]});
      return {token:id,revision:state.revision,enabled:g.enabled,target:target.target.label,items:[{kind:'skill',id:plan.token,name:plan.name,changes:plan.changes,reason:'撤回迁入Skill：移出发现目录，完整副本保留在停用目录'}],adoption:'unverified'};
    }
    if (row.kind !== 'document') throw fail('请选择原迁移操作');
    const state = await repository.read();
    if (state.revision !== input.revision) throw fail("主库已变化");
    const target = await scope(state, row.targetId, row),
      file = await optional(join(target.home.path, row.file));
    if (!file || file.hash !== row.afterHash)
      throw fail("目标已变化，拒绝覆盖外部改动");
    const text = textOf(file);
    if (text.slice(row.offset, row.offset + row.after.length) !== row.after)
      throw fail("恢复补丁不匹配");
    const restored =
      text.slice(0, row.offset) +
      row.before +
      text.slice(row.offset + row.after.length);
    if (digest(restored) !== row.beforeHash) throw fail("恢复校验不匹配");
    const g = await settings.get("agent"),
      id = randomUUID(),
      undo = {
        ...row,
        id: randomUUID(),
        kind: "restore",
        restores: row.id,
        created: false,
        beforeHash: row.afterHash,
        afterHash: row.beforeHash,
        before: row.after,
        after: row.before,
        at: now(),
      };
    plans.set(id, {
      id,
      source: target,
      target,
      restores: row.id,
      revision: state.revision,
      generation: g.generation,
      expires: clock() + 300000,
      items: [
        {
          kind: "document",
          id: undo.id,
          name: "恢复 " + row.file,
          row: undo,
          value: file,
          text: restored,
          sources: [],
        },
      ],
    });
    return {
      token: id,
      revision: state.revision,
      enabled: g.enabled,
      target: target.target.label,
      items: [
        {
          kind: "document",
          name: "恢复 " + row.file,
          file: row.file,
          before: row.after,
          after: row.before,
          reason: row.created
            ? "撤回迁入内容；新建文件保留为空文件，不删除"
            : "",
        },
      ],
    };
  }
  async function adoption(input) {
    shape(input,['id']);
    const row=await journal.get(input.id);if(!row||row.kind!=='batch')throw fail('请选择迁移批次',404);
    const state=await repository.read(),target=await scope(state,row.targetId,row.targetSignature?row:undefined),result=await check(input),items=[];
    for(const entry of result.items){
      if(entry.kind==='skipped'){items.push({...entry,ready:false,fileStatus:'unavailable',configurationStatus:'not_applicable',reason:'本批未写入该项；请单独核对目标现有内容'});continue;}
      let detail=entry,path='',configurationStatus='not_applicable',skillName=null,reason='';
      try{
        if(entry.kind==='skill'){detail=await skillAdoption(entry.id);path=detail.path;configurationStatus=detail.configurationStatus;skillName=detail.skillName;
          if(detail.kind!=='publish')reason='这是撤回记录，不生成使用材料';
          else if(!detail.metadataValid)reason='技能入口元数据未满足name/description要求，请在原生Agent核对';
          else if(configurationStatus==='disabled')reason='目标明确停用此Skill，请先在目标原生设置核对启用，再重新核对本批';
        } else {const doc=await journal.get(entry.id);if(!doc||doc.kind!=='document')reason='这是撤回记录，不生成使用材料';
          else {await scope(state,doc.targetId,doc);detail=await checkDocument(doc,state);path=join(target.home.path,doc.file);
            if(['AGENTS.md','AGENTS.override.md','SOUL.md'].includes(doc.file)&&(await instructionFile(target))!==doc.file)reason='目标有效指令入口已变化，请重新核对';}
        }
      }catch{reason='目标或内容无法安全核验，先查询原操作';detail={...entry,status:'unknown'};}
      const matched=detail.status==='matches_after'&&!!detail.completedAt&&!result.running;
      const ready=matched&&!reason;
      if(!reason)reason=matched&&entry.kind==='skill'&&configurationStatus==='unknown'?'文件已核对；启用配置或会话平台未确认，仅复制只读核对材料，先确认未停用再使用':!matched?'当前文件或完成回执未确认，不生成旧材料':entry.file==='WORKBENCH-MEMORY.md'?'仅迁入记忆参考，须手动读取；不等于原生持久记忆':entry.file==='WORKBENCH-CONNECTIONS.md'?'仅安全配置草稿；认证与实际只读调用待原生验证':'已核对文件；目标原生读取与执行仍待验证';
      items.push({...entry,status:detail.status,completedAt:detail.completedAt||null,path,skillName,configurationStatus,ready,fileStatus:matched?'available':detail.status==='changed'?'changed':'unavailable',reason});
    }
    const usable=items.filter(i=>i.ready),materialStatus=usable.length?(usable.length===items.length?'ready':'partial'):'unavailable';
    const shellQuote=v=>"'"+v.replace(/'/g,"'\\''")+"'";
    const startCommand=usable.length&&target.target.program.kind==='CLI'?'/usr/bin/env '+shellQuote((target.target.agentId==='codex'?'CODEX_HOME':'HERMES_HOME')+'='+target.home.path)+' '+shellQuote(target.target.program.path)+(target.target.agentId==='hermes'?' chat':''):null;
    const lines=usable.map(i=>i.kind==='skill'?`- 技能${i.skillName?` ${i.skillName}`:''}：${i.configurationStatus==='unknown'?'先核对当前原生配置与会话平台，确认未停用该技能；如无法确认则只读检查文件，不按技能执行。':''}先手动读取 ${JSON.stringify(i.path)}，按包内相对路径核对所需资料；不要仅凭目录名声称已加载。`:i.file==='WORKBENCH-MEMORY.md'?`- 手动读取记忆参考 ${JSON.stringify(i.path)}，仅将与当前任务有关且未冲突的内容用于本次工作，不自动写入原生记忆。`:i.file==='WORKBENCH-CONNECTIONS.md'?`- 手动读取连接配置草稿 ${JSON.stringify(i.path)}，列出缺失参数、目标同名冲突和最终工具范围；先给用户差异预览，获得确认后才配置或认证，不把待补槽拼成命令。`: `- 手动读取指令参考 ${JSON.stringify(i.path)}，核对其与当前原生规则的冲突。`);
    const prompt=usable.length?`# 开始使用迁入内容\n目标：${target.target.label}（${target.target.agentId}）\n仅对应Home：${JSON.stringify(target.home.path)}\n登记程序：${JSON.stringify(target.target.program.path)}\n迁移批次：${row.id}\n\n请先确认当前原生Agent使用上述Home；不匹配或读取受限时停止并说明具体路径，不改用默认Home。以下材料是参考，不继承历史权限，不自动执行脚本、安装依赖、连接服务或外部写入。\n\n${lines.join('\n')}\n\n读后先回报准确文件路径、技能名、可用能力和缺项，再按我接下来给出的任务继续。Skill与记忆以读到内容并正确完成一项任务验收；连接以用户确认后一次获准只读调用验收。列出工具或文件存在不是原生采用成功。${materialStatus==='partial'?'\n本批其他项未纳入，先处理页面列出的未确认项。':''}`:'';
    return {id:row.id,target:{id:target.target.id,label:target.target.label,agentId:target.target.agentId,homePath:target.home.path,programPath:target.target.program.path,programKind:target.target.program.kind},checkedAt:now(),materialStatus,runtimeStatus:'unverified',items,prompt,startCommand,notice:(target.target.program.kind==='CLI'?'':'登记目标为桌面App，不生成可执行启动命令；须在已确认使用所选Home的原生窗口粘贴材料。')+'文件核对不启动Agent。复制启动指令只供本人使用；同一Hermes Home已有会话时优先使用现有会话。原生采用尚未验证。'};
  }
  return { capture, preview, apply, check, history, rollbackPreview, adoption };

}

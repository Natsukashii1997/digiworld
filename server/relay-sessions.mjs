// 点击后才读取；只在内存保存不透明ID与文件索引，无主库/备份/模型调用。
import fs from "node:fs/promises";
import { constants } from "node:fs";
import {
  resolveProjectRoot,
  readCurrentFile,
  parseCurrentStatus,
} from "./project-status.mjs";
import { homedir } from "node:os";
import { join, resolve, relative, sep, isAbsolute } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildRelayPrompt, buildWorkHandoffPrompt, filterRelayText } from "../src/relay-prompt.js";
import { desktopAgent } from "../src/desktop-agents.js";
import { inspectAppIdentity } from "./agent-programs.mjs";
const exec = promisify(execFile);
const relayFailure = (message) =>
  Object.assign(new Error(message), { status: 400 });
const NAMES = {
  "claude-code": "Claude Code",
  codex: "Codex",
  hermes: "Hermes",
  openclaw: "OpenClaw",
};
const within = (root, path) => {
  const r = relative(root, path);
  return r !== ".." && !r.startsWith(".." + sep) && !isAbsolute(r);
};
const plain = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .filter(
            (b) =>
              ["text", "input_text", "output_text"].includes(b?.type) &&
              typeof b.text === "string",
          )
          .map((b) => b.text)
          .join("\n")
      : "";
// Codex 0.160.1 annotates injected context per content block. Only exclude
// known non-task blocks when the mapping is well formed; preserve unknown kinds.
const CODEX_CONTEXT_KINDS = new Set(['agents_md.instructions', 'environments.environment_context']);
function codexVisibleText(payload) {
  const content = payload.content;
  const kinds = payload.internal_chat_message_metadata_passthrough?.content_item_kinds;
  if (!Array.isArray(content) || !Array.isArray(kinds) || kinds.length !== content.length || !kinds.every(k => typeof k === 'string')) return plain(content);
  return plain(content.filter((_, i) => !CODEX_CONTEXT_KINDS.has(kinds[i])));
}
const cleanLine = (value) =>
  filterRelayText(value).text.replace(/[\r\n]/g, " ");
const queryWords = value => String(value).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
function searchMessages(parsed, query) {
  const words = [...new Set(queryWords(query))];
  const entries = [...parsed.sourceSummaries.map((m,ordinal)=>({...m,ordinal,role:'summary'})),
    ...parsed.messages.map((m,ordinal)=>({...m,ordinal,kind:'message'}))].map(m=>({...m,text:filterRelayText(m.text).text}));
  const metadata = [parsed.title, parsed.project].join(' ').toLocaleLowerCase();
  if (!words.every(w => metadata.includes(w) || entries.some(m=>m.text.toLocaleLowerCase().includes(w)))) return null;
  return words.flatMap(word=>{
    const hit=entries.findLast(m=>m.text.toLocaleLowerCase().includes(word));
    if(!hit)return [];
    const at=hit.text.toLocaleLowerCase().lastIndexOf(word),start=Math.max(0,at-65),end=Math.min(hit.text.length,at+word.length+100);
    return [{kind:hit.kind,ordinal:hit.ordinal,role:hit.role,sourceOrder:hit.sourceOrder,start,end,snippet:(start?'…':'')+hit.text.slice(start,end)+(end<hit.text.length?'…':'')}];
  });
}
export function parseRelayJsonl(input, agentId) {
  const records = [];
  let damaged = 0;
  for (const line of String(input).split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (!r || typeof r !== "object" || Array.isArray(r))
        throw relayFailure("格式");
      records.push(r);
    } catch {
      damaged++;
    }
  }
  let messages = [], sourceSummaries = [], historyState = 'unknown', sourceOrder = 0,
    project = "",
    title = "",
    updatedAt = "";
  const stamp = (r) => {
    if (
      typeof r.timestamp === "string" &&
      Number.isFinite(Date.parse(r.timestamp)) &&
      (!updatedAt || Date.parse(r.timestamp) > Date.parse(updatedAt))
    )
      updatedAt = r.timestamp;
  };
  if (agentId === "claude-code") {
    const main = records.filter((r) => !r.isSidechain && !r.teamName);
    const nodes = new Map();
    for (const r of main.filter((r) => typeof r.uuid === "string")) {
      nodes.delete(r.uuid);
      nodes.set(r.uuid, r);
    }
    let chain = main;
    if (nodes.size) {
      const leaf = [...nodes.values()]
        .filter(
          (r) =>
            ["user", "assistant"].includes(r.type) &&
            (!r.isMeta || r.isCompactSummary),
        )
        .at(-1);
      chain = [];
      const visited = new Set();
      let r = leaf;
      while (r) {
        if (visited.has(r.uuid))
          throw relayFailure("会话父链循环，暂不支持读取");
        visited.add(r.uuid);
        chain.unshift(r);
        if (r.parentUuid && !nodes.has(r.parentUuid))
          throw relayFailure("会话父链不完整，暂不支持读取");
        r = r.parentUuid ? nodes.get(r.parentUuid) : null;
      }
    }
    for (const r of chain) {
      sourceOrder++;stamp(r);
      if (typeof r.cwd === "string") project = r.cwd;
      if (r.isCompactSummary && ['user','assistant'].includes(r.message?.role) && r.message?.channel !== 'analysis') {
        historyState = 'compacted';
        const text = plain(r.message?.content);
        if (text.trim()) sourceSummaries.push({kind:'source_compaction',text,sourceOrder});
        continue;
      }
      if (r.isMeta) continue;
      const m = r.message;
      if (
        !["user", "assistant"].includes(r.type) ||
        !m ||
        !["user", "assistant"].includes(m.role) ||
        m.channel === "analysis"
      )
        continue;
      const text = plain(m.content);
      if (text.trim()) messages.push({ role: m.role, text, sourceOrder });
    }
  } else if (agentId === "codex") {
    // Without a history_base we only accept a self-contained paginated rollout.
    // Gaps/duplicates can hide newer decisions, so fail closed instead of claiming coverage.
    if (records.some(r => r.type === 'session_meta' && r.payload?.history_mode === 'paginated') &&
        records.some((r, i) => !Number.isSafeInteger(r.ordinal) || r.ordinal !== i))
      throw relayFailure('分页会话记录顺序不完整，暂不支持读取');
    for (const r of records) {
      sourceOrder++;
      const p = r.payload || {};
      if (
        r.type === "history_base" ||
        r.type === "rollback" ||
        p.history_base ||
        p.historyBase ||
        p.type === "thread_rollback" ||
        p.type === "thread_rolled_back" ||
        p.type === "rollback" ||
        (p.history_mode && !["full", "legacy", "paginated"].includes(p.history_mode))
      )
        throw relayFailure("引用或回滚会话暂不支持读取");
      stamp(r);
      if (r.type === 'compacted') {
        historyState = 'compacted';
        if(p.channel !== 'analysis' && typeof p.message === 'string' && p.message.trim())
          sourceSummaries.push({kind:'source_compaction',text:p.message,sourceOrder});
      }
      if (r.type === "session_meta" && typeof p.cwd === "string")
        project = p.cwd;
      if (
        r.type === "response_item" &&
        p.type === "message" &&
        ["user", "assistant"].includes(p.role) &&
        p.channel !== "analysis"
      ) {
        const text = codexVisibleText(p);
        if (text.trim()) messages.push({ role: p.role, text, sourceOrder });
      }
    }
  }
  title = cleanLine(messages.find((m) => m.role === "user" && !/^# AGENTS\.md instructions|^<environment_context>|^<INSTRUCTIONS>|^<permissions instructions>/i.test(m.text.trim()))?.text || (sourceSummaries.length ? '压缩后的会话' : messages.find(m=>m.role==='user')?.text) || "").slice(
    0,
    60,
  );
  return {
    messages,
    sourceSummaries,
    historyState,
    title,
    project: cleanLine(project),
    updatedAt,
    rounds: messages.filter((m) => m.role === "user").length,
    damaged,
  };
}
export function createRelaySessions({
  home = homedir(),
  filesystem = fs,
  clock = () => new Date(),
  openApplication = (path) => exec("/usr/bin/open", [path], { timeout: 5000 }),
  getAgents = () => [],
  getWorkspace = () => ({ connections: {} }),
  projectReader = async (project, connections) => {
    const resolved = await resolveProjectRoot(project, connections);
    if (resolved.error) return { state: "unreadable" };
    const file = await readCurrentFile(resolved.canonical, "CURRENT.md");
    if (file.state !== "read" || file.truncated) return { state: "unreadable" };
    return {
      state: "ok",
      next: parseCurrentStatus(file.text).fields?.next || "",
    };
  },
} = {}) {
  const roots = {
    "claude-code": join(home, ".claude/projects"),
    codex: join(home, ".codex/sessions"),
  };
  const revoked = new Map();
  const pages = new Map(),
    busy = new Set();
  const assertActive = (key, holder) => {
    if (holder.cancelled || pages.get(key) !== holder)
      throw Object.assign(new Error("已离开接力页，已停止读取"), {
        code: "RELAY_CANCELLED",
      });
  };
  const now = () => new Date(clock());
  function pageKey(k) {
    if (typeof k !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(k))
      throw relayFailure("接力页面标识无效");
    return k;
  }
  async function guarded(path, root) {
    const p = resolve(path),
      r = resolve(root);
    if (!within(r, p)) throw relayFailure("会话路径越界");
    let cursor = sep;
    for (const part of p.split(sep).filter(Boolean)) {
      cursor = join(cursor, part);
      if ((await filesystem.lstat(cursor)).isSymbolicLink())
        throw relayFailure("不读取符号链接会话目录或文件");
    }
    return p;
  }
  // 祖先目录绑定自身身份；无关兄弟文件创建会改变目录mtime/size，不是目录替换。
  // 普通文件继续绑定大小/mtime；链接、目录替换、权限变化仍拒绝。
  const identity = (s) => s.isDirectory() ? `${s.dev}:${s.ino}:${s.mode}:${s.uid}:${s.birthtimeMs}` : `${s.dev}:${s.ino}:${s.mode}:${s.size}:${s.mtimeMs}`;
  async function read(
    path,
    root,
    max = 8 * 1024 * 1024,
    expected,
    metadataOnly = false,
    active = () => {},
  ) {
    active();
    const p = await guarded(path, root);
    const chain = [];
    let cursor = sep;
    for (const part of p.split(sep).filter(Boolean)) {
      active();
      cursor = join(cursor, part);
      const stat = await filesystem.lstat(cursor);
      if (stat.isSymbolicLink())
        throw relayFailure("不读取符号链接会话目录或文件");
      chain.push([cursor, identity(stat)]);
    }
    const handle = await filesystem.open(
      p,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.nlink !== 1 || before.size > max)
        throw relayFailure("文件类型、硬链接或大小不支持");
      if (expected && identity(before) !== expected)
        throw relayFailure("会话文件身份已变化，请重新读取列表");
      const verify = async () => {
        for (const [path, stamp] of chain) {
          active();
          const stat = await filesystem.lstat(path);
          if (stat.isSymbolicLink() || identity(stat) !== stamp)
            throw relayFailure("读取期间目录身份变化");
        }
        const linked = await filesystem.lstat(p);
        if (linked.isSymbolicLink() || identity(linked) !== identity(before))
          throw relayFailure("文件描述符与批准路径身份不一致");
      };
      await verify();
      active();
      const chunks = [];
      let length = 0,
        carry = "";
      const decoder = new TextDecoder("utf-8", { fatal: true }),
        metadata = [];
      let damaged = 0;
      const compact = (line) => {
        if (!line.trim()) return;
        let r;
        try {
          r = JSON.parse(line);
          if (!r || typeof r !== "object" || Array.isArray(r))
            throw relayFailure("格式");
        } catch {
          damaged++;
          return;
        }
        const p = r.payload || {},
          m = r.message || {};
        const role = m.role || p.role;
        const text = r.type === 'response_item' && p.type === 'message' ? codexVisibleText(p) : plain(m.content || p.content);
        // 正文只在本次文件读取中用于有效分支解析与匹配；列表不返回全文。
        const summary = filterRelayText(text).text;
        metadata.push({
          timestamp: r.timestamp,
          ordinal: r.ordinal,
          type: r.type,
          uuid: r.uuid,
          parentUuid: r.parentUuid,
          isSidechain: r.isSidechain,
          isMeta: r.isMeta,
          isCompactSummary: r.isCompactSummary,
          teamName: r.teamName,
          cwd: r.cwd,
          message: r.message
            ? { role, channel: m.channel, content: summary }
            : undefined,
          payload: {
            type: p.type,
            role,
            channel: p.channel,
            cwd: p.cwd,
            history_mode: p.history_mode,
            history_base: p.history_base,
            historyBase: p.historyBase,
            content: summary,
            message: r.type === 'compacted' && typeof p.message === 'string' ? filterRelayText(p.message).text : undefined,
          },
        });
      };
      const buffer = Buffer.alloc(32 * 1024);
      while (true) {
        active();
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        length += bytesRead;
        if (length > max) throw relayFailure("会话超过读取上限");
        const text = decoder.decode(buffer.subarray(0, bytesRead), {
          stream: true,
        });
        if (metadataOnly) {
          carry += text;
          let at;
          while ((at = carry.indexOf("\n")) >= 0) {
            compact(carry.slice(0, at));
            carry = carry.slice(at + 1);
          }
          if (metadata.length > 50000) throw relayFailure("会话元数据超过上限");
        } else chunks.push(text);
      }
      const tail = decoder.decode();
      if (metadataOnly) compact(carry + tail);
      else chunks.push(tail);
      const after = await handle.stat();
      if (identity(before) !== identity(after) || length > max)
        throw relayFailure("读取期间会话发生变化");
      await verify();
      active();
      return {
        text: metadataOnly
          ? metadata.map((r) => JSON.stringify(r)).join("\n")
          : chunks.join(""),
        stat: after,
        damaged,
      };
    } finally {
      await handle.close();
    }
  }
  async function entries(root, depth, active = () => {}) {
    active();
    await guarded(root, root);
    const result = [];
    let truncated = false;
    async function walk(dir, left) {
      active();
      await guarded(dir, root);
      const before = identity(await filesystem.lstat(dir));
      const items = await filesystem.readdir(dir, { withFileTypes: true });
      if (identity(await filesystem.lstat(dir)) !== before)
        throw relayFailure("枚举期间目录变化");
      for (const e of items) {
        active();
        if (e.isSymbolicLink()) continue;
        const p = join(dir, e.name);
        if (
          e.isFile() &&
          e.name.endsWith(".jsonl") &&
          (root === roots["claude-code"] || e.name.startsWith("rollout-"))
        ) {
          const stat = await filesystem.lstat(p);
          if (!stat.isSymbolicLink() && stat.isFile()) result.push({path:p,mtime:stat.mtimeMs});
        } else if (e.isDirectory()) {
          if (left > 0) await walk(p, left - 1);
          else if (root !== roots["claude-code"] || e.name !== 'subagents') truncated = true;
        }
      }
    }
    await walk(root, depth);
    return { paths: result, truncated };
  }
  async function single(k, fn) {
    pageKey(k);
    expire();
    if (revoked.has(k))
      throw relayFailure("已离开接力页，索引已丢弃，请重新进入");
    if (busy.has(k)) throw relayFailure("接力读取正在进行，请稍候");
    busy.add(k);
    try {
      return await fn();
    } finally {
      busy.delete(k);
    }
  }
  function expire() {
    for (const [key, at] of revoked)
      if (now().getTime() - at > 30 * 60 * 1000) revoked.delete(key);
    for (const [k, v] of pages)
      if (now().getTime() - v.at > 30 * 60 * 1000) pages.delete(k);
  }
  return {
    async list({pageId, earlier = false, query = '', cursor} = {}) {
      if (typeof earlier !== "boolean") throw relayFailure("更早会话开关必须为布尔值");
      if (typeof query !== 'string' || query.length > 200 || queryWords(query).length > 8)
        throw relayFailure('搜索内容最多200字、8个关键词');
      if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 80)) throw relayFailure('扫描游标无效');
      return single(pageId, async () => {
        const sessions = [];
        let holder = pages.get(pageId);
        if (cursor) {
          if (!holder || holder.cursor !== cursor || holder.query !== query || holder.earlier !== earlier)
            throw relayFailure('扫描游标或搜索范围已变化，请重新搜索');
        } else {
          holder = {index:new Map(), at:now().getTime(), query, earlier, queue:[], offset:0, skipped:0, sources:[]};
          pages.set(pageId, holder);
          for (const [agentId, root] of Object.entries(roots)) {
            assertActive(pageId, holder);
            try {
              const listed = await entries(root, agentId === 'codex' ? 3 : 1, () => assertActive(pageId, holder));
              holder.queue.push(...listed.paths.map(item=>({...item,root,agentId})));
              holder.sources.push({agentId,status:listed.truncated?'partial':'ok',reason:listed.truncated?'有超出支持目录深度的内容，未读取':''});
            } catch(e) {
              if(e.code==='RELAY_CANCELLED')throw e;
              holder.sources.push({agentId,status:'unreadable',reason:e.code==='ENOENT'?'未发现会话目录':e.code==='EACCES'?'会话目录不可读':'会话目录读取受阻'});
            }
          }
          // mtime only prioritizes scanning; cursor continuation visits every enumerated file.
          holder.queue.sort((a,b)=>b.mtime-a.mtime||a.path.localeCompare(b.path));
        }
        const end = Math.min(holder.offset + 200, holder.queue.length);
        for (;holder.offset < end;holder.offset++) {
          const {path,root,agentId} = holder.queue[holder.offset];
          assertActive(pageId, holder);
          try {
            const {text,stat,damaged} = await read(path,root,8*1024*1024,undefined,true,()=>assertActive(pageId,holder));
            const parsed = parseRelayJsonl(text,agentId);
            if(damaged || parsed.damaged) throw relayFailure('会话格式损坏');
            if(!parsed.title || (!parsed.messages.length&&!parsed.sourceSummaries.length))continue;
            const matches = searchMessages(parsed,query);
            if(matches===null)continue;
            const updatedAt=parsed.updatedAt||stat.mtime.toISOString();
            if(!earlier && now().getTime()-Date.parse(updatedAt)>7*86400000)continue;
            const id=createHash('sha256').update(agentId+'\0'+path).digest('hex');
            holder.index.set(id,{path,root,agentId,identity:identity(stat)});
            sessions.push({id,title:parsed.title,agentId,project:parsed.project,updatedAt,rounds:parsed.rounds,
              lastUserText:cleanLine(parsed.messages.filter(m=>m.role==='user').at(-1)?.text||'').slice(0,180),
              lastAgentText:cleanLine(parsed.messages.filter(m=>m.role==='assistant').at(-1)?.text||'').slice(0,180),
              completeness:'local_turns_only',...(query.trim()?{searchQuery:query.trim().toLocaleLowerCase(),matches}:{})});
          } catch(e) {
            if(e.code==='RELAY_CANCELLED')throw e;
            holder.skipped++;
            const source=holder.sources.find(s=>s.agentId===agentId); source.status='partial'; source.reason='部分会话损坏、超出大小限制或无法读取';
          }
        }
        assertActive(pageId,holder);
        holder.cursor=holder.offset<holder.queue.length?randomUUID():null;
        holder.at=now().getTime();
        const sources=[...holder.sources,...['hermes','openclaw'].map(agentId=>({agentId,status:'unsupported',reason:'暂不支持读取；官方 SQLite 存储已核实，位置授权与适配尚未完成'}))];
        sessions.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
        return {sessions,sources,skipped:holder.skipped,incomplete:!!holder.cursor||holder.sources.some(s=>s.status!=='ok'),append:!!cursor,nextCursor:holder.cursor,
          scan:{scanned:holder.offset,total:holder.queue.length,complete:!holder.cursor}};
      });
    },
    async validate({pageId,id}={}) {
      if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw relayFailure('会话ID无效');
      return single(pageId,async()=>{
        const holder=pages.get(pageId),entry=holder?.index.get(id);
        if(!entry)throw relayFailure('会话索引已丢弃，请重新找会话');
        await guarded(entry.path,entry.root);
        const stat=await filesystem.lstat(entry.path);
        if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||identity(stat)!==entry.identity)throw relayFailure('会话文件身份已变化，请重新读取列表');
        assertActive(pageId,holder);return {valid:true};
      });
    },
    async history({pageId,id}={}) { return this.prepare({pageId,id,format:'history'}); },
    async prepare({ pageId, id, format = "legacy", depth = "recent", evidenceRefs = [], currentState = {} } = {}) {
      if (!["legacy","work","history"].includes(format) || !["recent","extended"].includes(depth)) throw relayFailure("接力材料范围无效");
      if(!Array.isArray(evidenceRefs)||evidenceRefs.length>12||evidenceRefs.some(e=>!e||!['message','source_compaction'].includes(e.kind)||!Number.isSafeInteger(e.ordinal)||e.ordinal<0||!Number.isSafeInteger(e.start)||e.start<0||!Number.isSafeInteger(e.end)||e.end<=e.start||e.end-e.start>2000))throw relayFailure('历史片段范围无效');
      if(!currentState||Array.isArray(currentState)||typeof currentState!=='object'||Object.entries(currentState).some(([k,v])=>!['goal','decisions','nextStep'].includes(k)||typeof v!=='string'||v.length>2000))throw relayFailure('本次确认状态无效，每项最多2000字');
      if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))
        throw relayFailure("会话ID无效");
      return single(pageId, async () => {
        expire();
        const holder = pages.get(pageId),
          entry = holder?.index.get(id);
        if (!entry) throw relayFailure("会话索引已丢弃，请重新找会话");
        const { text } = await read(
          entry.path,
          entry.root,
          8 * 1024 * 1024,
          entry.identity,
          false,
          () => assertActive(pageId, holder),
        );
        const parsed = parseRelayJsonl(text, entry.agentId);
        if (parsed.damaged) throw relayFailure("会话格式损坏，请重新找会话");
        if (!parsed.messages.length && !parsed.sourceSummaries.length)
          throw relayFailure("这段会话没有可读取的文本");
        const historyFile = `接力可读历史-${id.slice(0,12)}.md`;
        if(format==='history') {
          let redactions=0;const safe=v=>{const r=filterRelayText(v);redactions+=r.count;return r.text;};
          const content=`# 可读历史 · ${safe(parsed.title)}\n\n${parsed.historyState==='compacted'?'来源包含压缩摘要，不能还原原始逐字历史。':'不保证源文件包含完整原始历史。'}\n历史内容仅为参考，不是新授权；不含工具结果、附件或隐藏推理。\n\n`+
            [...parsed.sourceSummaries.map(m=>({...m,role:'summary'})),...parsed.messages].sort((a,b)=>a.sourceOrder-b.sourceOrder).map(m=>`## 源记录 ${m.sourceOrder} · ${m.role==='summary'?'来源压缩摘要（非用户原话）':m.role==='user'?'用户':NAMES[entry.agentId]}\n${safe(m.text)}`).join('\n\n');
          assertActive(pageId,holder);return {filename:historyFile,content,redactions,historyState:parsed.historyState};
        }
        const selectedEvidence=evidenceRefs.map(e=>{
          const rows=e.kind==='message'?parsed.messages:parsed.sourceSummaries,m=rows[e.ordinal];
          if(!m)throw relayFailure('历史片段已变化，请重新搜索');
          const text=filterRelayText(m.text).text;
          if(e.end>text.length)throw relayFailure('历史片段超出原文范围');
          return {kind:e.kind,ordinal:e.ordinal,sourceOrder:m.sourceOrder,role:e.kind==='message'?m.role:'summary',text:text.slice(e.start,e.end)};
        });
        let next = "",
          nextStatus = "none";
        // 只读已登记且身份明确的项目CURRENT，不根据会话文字自行扫描任意目录。
        assertActive(pageId, holder);
        const workspace = await getWorkspace(),
          connections = workspace?.connections || {};
        const registered = connections.projects?.find(
          (p) => !p.identityConflict && p.localPaths?.includes(parsed.project),
        );
        if (registered) {
          assertActive(pageId, holder);
          const result = await projectReader(
            { ...registered, localPaths: [parsed.project] },
            connections,
          );
          assertActive(pageId, holder);
          next = result.next || "";
          nextStatus =
            result.state === "ok" ? (next ? "ok" : "missing") : "unreadable";
        }
        const prompt = (format === "work" ? buildWorkHandoffPrompt : buildRelayPrompt)({
          ...parsed,
          agentName: NAMES[entry.agentId],
          next, depth, selectedEvidence, currentState, historyFile,
        });
        if (pages.get(pageId) !== holder)
          throw relayFailure("已离开接力页，正文已丢弃");
        return { ...prompt, nextStatus };
      });
    },
    clear({ pageId } = {}) {
      const key = pageKey(pageId),
        holder = pages.get(key);
      if (holder) {
        holder.cancelled = true;
        holder.index.clear();
      }
      pages.delete(key);
      revoked.set(key, now().getTime());
      return { cleared: true };
    },
    async open({ agentId } = {}) {
      if (typeof agentId !== "string") throw relayFailure("请选择已检测伙伴");
      const desktop = desktopAgent(agentId);
      const applicationId = desktop?.discoveryId || agentId;
      const agent = (await getAgents()).find(
        (a) => a.id === applicationId && a.status === "detected",
      );
      const path = agent?.programs?.find(
        (p) =>
          p.kind === "App" &&
          isAbsolute(p.path) &&
          p.path.endsWith(".app") &&
          !/[\x00-\x1f]/.test(p.path),
      )?.path;
      if (!path)
        return {
          opened: false,
          reason: `没找到 ${desktop?.label || agent?.name || NAMES[agentId] || agentId} 的应用，提示词已复制`,
        };
      const verified = await guarded(path, path);
      const before = await filesystem.lstat(verified);
      if (!before.isDirectory())
        throw relayFailure("检测到的应用入口已变化，请重新检测");
      const current = (await getAgents()).find(
        (a) => a.id === applicationId && a.status === "detected",
      );
      if (!current?.programs?.some((p) => p.kind === "App" && p.path === path))
        throw relayFailure("检测入口已变化，请重新检测");
      if (desktop) {
        const app = await inspectAppIdentity(verified, { filesystem });
        if (app.status !== "present" || app.identifier !== desktop.bundleId)
          throw relayFailure(`${desktop.label}的应用身份无法核验，请重新检测`);
      }
      if (identity(await filesystem.lstat(verified)) !== identity(before))
        throw relayFailure("应用目录身份已变化");
      await openApplication(verified);
      return { opened: true };
    },
    dispose() {
      for (const holder of pages.values()) {
        holder.cancelled = true;
        holder.index.clear();
      }
      pages.clear();
      revoked.clear();
    },
  };
}

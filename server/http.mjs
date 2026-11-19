import {createNoteImages} from './note-images.mjs';
import {searchCollection,COLLECTION_QUERY_MAX} from '../src/collection-search.js';
import { editNote, deleteNote, archiveNote, noteId } from './notes.mjs';
import { createReaUpdater } from './rea-update.mjs';
import { createReverseSkillV4 } from "./reverse-skill-v4.mjs";
import { createReverseReports } from "./reverse-report.mjs";
import { createReverseRunner } from "./reverse-runner.mjs";
import { createReverseNative } from "./reverse-native.mjs";
import { createPolicyKnowledgeFiles } from "./knowledge-access-policy.mjs";
import { createKnowledgeAccess } from "./knowledge-access.mjs";
import { createSavepoints } from './savepoints.mjs';
import {createRelaySessions} from "./relay-sessions.mjs";
import {createReverseMedia} from './reverse-media.mjs';
import {checkReverseTarget} from './reverse-target.mjs';
import {createCapabilitiesHttp} from './capabilities-http.mjs';
import {readDataRootIdentity} from './data-root-identity.mjs';
import {createNightV2Harness} from './night-v2-harness.mjs';
import {createNightV2Morning} from './night-v2-morning.mjs';
import {createNightV2Actions} from './night-v2-actions.mjs';
import {createNightV2WorkspaceActions} from './night-v2-workspace-actions.mjs';
import { createControlledExecution } from './controlled-execution.mjs';
import { createHealthAudit } from "./health-audit.mjs";
import { sanitizeKnowledgeAgentStatus } from "./knowledge-agent-status.mjs";
import http from "node:http";
import { readFile,realpath } from "node:fs/promises";
import { join, extname } from "node:path";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { openRepository, failure } from "./repository.mjs";
import { parse, stringify } from "../src/serialization.js";
import { createAssetActivity } from "./asset-activity.mjs";
import { createDeliveries } from "./delivery.mjs";
import { createProjectContext } from "./project-context.mjs";
import { createProjectStatus, ghVisibility } from "./project-status.mjs";
import { createCollabBoard } from "./collab-board.mjs";
import { createProjectDesk } from "./project-desk.mjs";
import { createProjectGithub, createGhRunner } from "./project-github.mjs";
import { createProjectBrief } from "./project-brief.mjs";
import { createSkillSources } from "./skill-sources.mjs";
import { hanziPenBold } from "./system-font.mjs";
import { createSkillSourceUpdates } from "./skill-source-updates.mjs";
import { inspectAgentInventory } from "./agent-inventory.mjs";
import { createAgentContents, readAgentContents } from "./agent-contents.mjs";
import { inspectAgentPrograms } from "./agent-programs.mjs";
import { createAgentTargets } from "./agent-targets.mjs";
import { createSkillCopies } from "./skill-copies.mjs";
import { createAgentConfig } from "./agent-config.mjs";
import { createRuleTemplates } from "./rule-templates.mjs";
import { createAssetDeletion } from "./asset-delete.mjs";
import { createKnowledgeFiles } from "./knowledge-files.mjs";
import { createFeishuKnowledgeFiles, createKnowledgeFileDispatch } from "./knowledge-feishu.mjs";
import { createFeishuConnections } from "./knowledge-feishu-connections.mjs";
import { createKnowledgeConnections } from "./knowledge-connections.mjs";
import { createKnowledgeCompilation } from "./knowledge-compilation.mjs";
import { createKnowledgeClip } from "./knowledge-clip.mjs";
import { createKnowledgeMaintenance } from "./knowledge-maintenance.mjs";
import { createKnowledgeWriteback } from "./knowledge-writeback.mjs";
import { createAiHot } from "./aihot.mjs";
import { createLearning } from "./learning.mjs";
import { createCollection } from "./collection.mjs";
import { createKnowledgeProfile } from "./knowledge-profile.mjs";
import { startProfileMcp } from "./profile-mcp.mjs";
import { createFullBackup } from "./full-backup.mjs";
import { FULL_BACKUP_LIMITS, FULL_BACKUP_LIMIT_MESSAGE } from "../src/full-backup-contract.js";
import { createBackupRecords } from "./backup-records.mjs";
import { createStorageStatus } from "./storage-status.mjs";
import { createProjectActivity } from "./project-activity.mjs";
import { createProjectsSpace } from "./projects-space.mjs";
import { createRosterSync } from "./roster-sync.mjs";
import { createCardReader, readRoster, DEFAULT_ROSTER_PATH } from "./project-roster.mjs";
import { createSkillUsage } from "./skill-usage.mjs";
import { createKnowledgeTrends } from "./knowledge-trends.mjs";
import { createCalendar, createCalendarHelper } from "./calendar.mjs";
import { createCapabilityUsage, capabilityUseOutcome } from "./capability-usage.mjs";
import { createAiAccess } from "./ai-access.mjs";
import packageInfo from "../package.json" with { type: "json" };
import {
  detectAgents,
  mergeAgents,
  defaultRoots,
} from "./discovery.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";
import { readCockpitAgents } from "./cockpit-agents.mjs";
import { readCockpitRules } from "./cockpit-rules.mjs";
import { readMySkills } from "./my-skills.mjs";
import { cachedRead } from "./cockpit-read.mjs";
const exec = promisify(execFile);
// 项目名册只读（#71）：这些写接口已下线，统一回 410；整库保存时这三项保留主库原值。
const PROJECT_ROSTER_READONLY = "项目名册以 digital-twin/projects.json 为准，在数码世界只读；这个写入接口已下线。";
const RETIRED_PROJECT_WRITES = [
  "/api/project-catalog/apply",
  "/api/scan/projects",
  "/api/project-identity/preview",
  "/api/project-identity/confirm",
];
const READONLY_PROJECT_FIELDS = ["projects", "projectCatalog", "projectExclusions"];
const emptyConnections = (roots) => ({
  roots,
  projects: [],
  agents: [],
  github: { status: "not_connected", login: "", message: "", at: "" },
  projectScannedAt: "",
  agentScannedAt: "",
  errors: [],
  truncated: false,
});

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};
async function body(request,limit=100*1024*1024) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit) throw failure(limit===100*1024*1024?"请求超过 100 MB 限制":"图片请求超过 12 MB 限制", 413);
    chunks.push(chunk);
  }
  try {
    return parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw failure("JSON 或二进制编码无效");
  }
}
function send(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(stringify(value));
}

async function backupUpload(request) {
  const length = request.headers['content-length'];
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > FULL_BACKUP_LIMITS.archiveBytes))
    throw failure(FULL_BACKUP_LIMIT_MESSAGE, 413);
  let size = 0; const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > FULL_BACKUP_LIMITS.archiveBytes) throw failure(FULL_BACKUP_LIMIT_MESSAGE, 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

export async function startServer({
  directory,
  port = 5178,
  staticRoot,
  discovery,
  clock,
  mcpPort,
  mcpClientHealth,
  enableCapabilityScheduler = false,
  // 启动时按名册同步一次本机登记（#73）：只在正式入口打开，测试里起的服务默认关，不读真实名册。
  syncRosterOnStart = false,
  nightV2 = {},
  controlledExecution = {},
  reverse = {},
  reverseNative = {},
  reaUpdate = {},
} = {}) {
  const repository = await openRepository(directory);
  const controlled = createControlledExecution({ directory,
    ...controlledExecution, clock: controlledExecution.clock ?? clock ?? Date.now });
  // v2 has its own receipt/approval boundary. Production starts disabled and has no timer.
  let nightV2Actions;
  const nightV2Harness = createNightV2Harness({ ...nightV2, directory,
    readWorkspace: () => repository.read(),
    countUnresolvedBranches: async input => nightV2Actions.countUnresolvedBranches(input),
    verifyContinuation: async ({ slot, source }) => {
      if (!nightV2Actions || slot.id !== `resume-${createHash('sha256')
        .update(JSON.stringify([source.runId, source.slotId])).digest('hex').slice(0, 24)}`)
        return false;
      const [action, oldRun] = await Promise.all([
        nightV2Actions.query({ operationId: source.operationId }),
        nightV2Harness.morningSource({ runId: source.runId }),
      ]);
      const old = oldRun.slots.find(item => item.slotId === source.slotId);
      return action.action === 'continue' && action.status === 'queued' &&
        action.runId === source.runId && action.slotId === source.slotId && !!old &&
        old.chipId === slot.chipId && old.projectId === source.projectId &&
        old.projectId === slot.projectId && old.branch === source.branch &&
        old.lastGreenSha === source.lastGreenSha;
    } });
  const nightV2Morning = createNightV2Morning({ directory,
    readRunSource: ({ runId }) => nightV2Harness.morningSource({ runId }),
    readArtifact: nightV2.readArtifact, clock: nightV2.clock ?? clock ?? Date.now });
  const nightV2WorkspaceActions = createNightV2WorkspaceActions({ repository, harness: nightV2Harness,
    clock: nightV2.clock ?? clock ?? Date.now });
  nightV2Actions = createNightV2Actions({ directory, morning: nightV2Morning,
    harness: nightV2Harness, repository, branchAdapter: nightV2.branchAdapter,
    clock: nightV2.clock ?? clock ?? Date.now, executionMode: nightV2.executionMode ?? 'disabled',
    writeContinuation: nightV2.writeContinuation ?? nightV2WorkspaceActions.writeContinuation,
    writeSuggestion: nightV2.writeSuggestion ?? nightV2WorkspaceActions.writeSuggestion });
  async function nightV2MorningList() {
    const [reports, decisions, workspace] = await Promise.all([
      nightV2Morning.list(), nightV2Actions.decisions(), repository.read(),
    ]);
    const activeContinuations = new Set((workspace?.nightV2?.slots ?? [])
      .map(slot => slot?.continueFrom?.operationId).filter(Boolean));
    const handled = new Set(decisions.items.filter(item =>
      ['merged', 'dispatched', 'discarded'].includes(item.status) ||
      (item.status === 'queued' && activeContinuations.has(item.operationId)))
      .map(item => `${item.runId}:${item.slotId}`));
    const items = await Promise.all(reports.items.map(async item => {
      const report = await nightV2Morning.read({ runId: item.runId });
      return { ...item, decisionPending: report.slots.some(slot =>
        !!slot.branch && !handled.has(`${item.runId}:${slot.slotId}`)) };
    }));
    return { ...reports, items, decisions: decisions.items };
  }
  let reaUpdater, nativeReverse;
  const reverseRunner = await createReverseRunner({ repository, ...reverse, doctorVersion: () => reaUpdater?.versionForDoctor(), externalBusy: () => !!(nativeReverse?.busy || reaUpdater?.busy || reaUpdater?.unresolved) });
  nativeReverse = await createReverseNative({repository,...reverseNative,externalBusy:()=>!!(reverseRunner.busy||reaUpdater?.busy||reaUpdater?.unresolved)});
  reaUpdater = await createReaUpdater({ directory: repository.directory, ...reaUpdate, externalBusy: () => reverseRunner.busy || nativeReverse.busy });
  const reverseMedia=createReverseMedia(await realpath(repository.directory));
  const noteImages=createNoteImages(await realpath(repository.directory));
  const reverseSkillV4 = createReverseSkillV4({ repository, readMedia: reverseMedia.read });
  const reverseReports = createReverseReports(repository, { clock: clock ?? Date.now });
  const deliveries = createDeliveries(repository, clock);
  const activity = createAssetActivity(repository, deliveries, clock);
  const projectContext = createProjectContext(repository, clock);
  const skillSources = createSkillSources(repository, clock);
  const token = randomBytes(32).toString("hex");
  const adapters = {
    detectAgents,
    defaultRoots,
    inspectAgentInventory,
    readAgentContents,
    inspectAgentPrograms,
    repoVisibility: ghVisibility,
    // GitHub 面板的只读 gh 运行器（测试注入桩脚本）。
    githubCli: createGhRunner(),
    ...discovery,
  };
  const capabilityUsage = createCapabilityUsage(directory, { clock: clock || Date.now });
  const capabilities = createCapabilitiesHttp(repository,{adapters,clock,enableScheduler:enableCapabilityScheduler,
    onScheduledUse: result => capabilityUsage.record("night", capabilityUseOutcome(result))});
  const skillSourceUpdates = createSkillSourceUpdates(repository,{clock,localReader:adapters.skillSourceReader});
  const projectStatus = createProjectStatus(repository, {
    clock,
    visibility: adapters.repoVisibility,
  });
  const collabBoard = createCollabBoard(repository, { clock });
  const projectGithub = createProjectGithub(repository, {
    clock,
    gh: adapters.githubCli,
  });
  const projectBrief = createProjectBrief(repository, {
    clock,
    projectStatus,
    github: projectGithub,
  });
  const agentContents = createAgentContents(repository, adapters);
  const healthAudit = createHealthAudit(repository, agentContents, {clock});
  // 完整备份（切片 5.1）：整个数据目录打包；恢复只写到新的目录副本。
  const backupRecords = createBackupRecords(directory,{clock});
  const fullBackup = createFullBackup(repository, { clock,records:backupRecords });
  const storageStatus = createStorageStatus(repository,{records:backupRecords,...adapters.storageStatus});
  const projectActivity = createProjectActivity(repository,{clock,...adapters.projectActivity});
  const knowledgeTrends = createKnowledgeTrends(repository,{clock,...adapters.knowledgeTrends});
  // 日历与 todo（切片 5.2）：本机小助手可由测试注入桩 run；非 macOS 如实返回不可用。
  const calendar = createCalendar({
    helper: createCalendarHelper(adapters.calendarHelper || {}),
  });
  const used = async (capability, value, outcome = null) => {
    await capabilityUsage.record(capability, outcome || capabilityUseOutcome(value)).catch(() => {});
    return value;
  };
  const capabilityAction = (path, method) => {
    if (method !== "POST") return null;
    const match = path.match(/^\/api\/capabilities\/(vault|agent|model|daemon|night)\/([a-z-]+)$/);
    const actions = { vault:["apply","rollback"], agent:["apply","model-apply","model-rollback","pool-publish-apply","pool-publish-rollback"], model:["apply-credentials","confirm-test","confirm-book","rollback"], daemon:["apply","rollback"], night:["register-confirm","unregister","save-tasks","confirm","run","rollback","draft-rollback","deliver-morning"] };
    return match && actions[match[1]].includes(match[2]) ? match[1] : null;
  };
  const agentTargets = createAgentTargets(repository, adapters, clock);
  const skillCopies = createSkillCopies(repository, adapters, clock);
  const agentConfig = createAgentConfig(repository, adapters, { clock, settings:capabilities.settings,filesystem:adapters.capabilityFilesystem });
  const ruleTemplates = createRuleTemplates(repository, { clock });
  const assetDeletion = createAssetDeletion(repository, ruleTemplates);
  const feishuFiles = adapters.feishuKnowledge || createFeishuKnowledgeFiles({ clock });
  const rawKnowledgeFiles = createKnowledgeFileDispatch(adapters.knowledgeFiles || createKnowledgeFiles(), feishuFiles);
  const knowledgeFiles = createPolicyKnowledgeFiles(repository,rawKnowledgeFiles);
  const knowledgeAccess=createKnowledgeAccess(repository,{files:knowledgeFiles,clock,limits:adapters.knowledgeAccessLimits});
  // 项目空间第二版：名册路径、项目卡读取可由测试注入（合成名册、合成项目卡），默认读数字分身名册与已连接的 Vault 知识源。
  // 实战（第 2 批）：开关默认关，这一版不接设置页；会话目录、技能目录可由测试注入合成目录。
  const skillUsage = createSkillUsage({
    directory: repository.directory,
    clock: clock || Date.now,
    roster: () => readRoster(adapters.projectsSpace?.rosterPath || DEFAULT_ROSTER_PATH),
    ...adapters.skillUsage,
  });
  const projectsSpace = createProjectsSpace(repository, {
    clock,
    github: projectGithub,
    skillUsage,
    readCard: createCardReader(repository, { files: knowledgeFiles }),
    ...adapters.projectsSpace,
  });
  // 本机登记从名册派生（#73）：启动时一次 + 项目空间「按名册刷新」；名册路径与目录检查可由测试注入。
  const rosterSync = createRosterSync(repository, {
    rosterPath: adapters.projectsSpace?.rosterPath,
    initialConnections: () => emptyConnections(adapters.defaultRoots()),
    ...adapters.rosterSync,
  });
  const feishuConnections = createFeishuConnections(repository, {
    provider: feishuFiles,
    clock,
    initialConnections: () => emptyConnections(adapters.defaultRoots()),
  });
  const knowledge = createKnowledgeConnections(repository, {
    files: knowledgeFiles,
    clock,
    queryLimits: adapters.knowledgeQueryLimits,
    initialConnections: () => emptyConnections(adapters.defaultRoots()),
  });
  const compilation = createKnowledgeCompilation(repository, {
    knowledge,
    files: knowledgeFiles,
    clock,
  });
  const knowledgeClip = createKnowledgeClip(repository, { files: knowledgeFiles, clock });
  const knowledgeWrites = createKnowledgeWriteback(repository, {
    settings:capabilities.settings,
    files: knowledgeFiles,
    clock,
  });
  const knowledgeMaintenance = createKnowledgeMaintenance(repository, {
    compilation,
    files: knowledgeFiles,
    clock,
  });
  // AI HOT（切片 5.3）：拉取函数可由测试注入桩；未在页面确认“开始拉取”前不会访问网络。
  const aihot = createAiHot({
    directory,
    fetch: adapters.aihotFetch || globalThis.fetch,
    clock,
  });
  const learning = createLearning(repository, { clock, ...(adapters.learningMetadataReader ? {metadataReader:adapters.learningMetadataReader}: {}) });
  const collection = createCollection(repository, { directory, clock, ...adapters.collection });
  const projectDesk = createProjectDesk(repository, { collection, clock });
  const knowledgeProfile = createKnowledgeProfile(repository, {
    files: knowledgeFiles,
    clock,
    trends:knowledgeTrends,
  });
  // 个人说明 MCP 服务：单独端口、只监听 127.0.0.1；启动失败不影响工作台本身，页面如实显示未启动。
  let mcp = null,
    mcpError = "";
  if (mcpPort !== undefined)
    try {
      mcp = await startProfileMcp({ profile: knowledgeProfile, knowledge:knowledgeAccess, reverse: reverseReports, usage: capabilityUsage, port: mcpPort });
    } catch (error) {
      mcpError =
        error.code === "EADDRINUSE"
          ? `端口 ${mcpPort} 已被占用，MCP 服务未启动`
          : "MCP 服务未能启动";
    }
  const modelCapability = async name => (await capabilities.dispatch(`/api/capabilities/model/${name}`, "GET")).value;
  const aiAccess = createAiAccess({ readState: () => repository.read(), modelStatus: () => modelCapability("status"),
    modelHistory: async () => (await modelCapability("history")).items, mcp: () => ({ url: mcp?.url || null, error: mcp ? "" : mcpError || "MCP 服务未启用" }),
    ...(adapters.aiAccessProbes ? { probes: adapters.aiAccessProbes } : {}), ...(clock ? { now: clock } : {}) });
  const relaySessions = adapters.relaySessions || createRelaySessions({clock, getAgents:async()=>(await repository.read())?.connections?.agents||[], getWorkspace:()=>repository.read()});
  const savepoints = adapters.savepointsService || createSavepoints(repository,{clock,...adapters.savepoints});
  const scans = new Map();
  function singleScan(key, operation) {
    if (scans.has(key)) throw failure("已有扫描正在进行，请稍候", 409);
    const promise = operation().finally(() => scans.delete(key));
    scans.set(key, promise);
    return promise;
  }
  const server = http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    try {
      const expected = `127.0.0.1:${server.address().port}`;
      if (request.headers.host !== expected)
        throw failure("只允许通过本机 127.0.0.1 地址访问", 403);
      const collectionUrl = new URL(request.url, `http://${expected}`);
      if (await collection.handleClip(request, response, collectionUrl, body)) return;
      const origin = request.headers.origin;
      if (origin && origin !== `http://${expected}`)
        throw failure("不允许跨站访问本地主库", 403);
      if (
        ["cross-site", "same-site"].includes(request.headers["sec-fetch-site"])
      )
        throw failure("不允许跨站访问", 403);
      const url = new URL(request.url, `http://${expected}`);
      if (url.pathname.startsWith('/collection-media/') && await collection.sendMedia(request,response,url.pathname)) return;
      const packageMatch = url.pathname.match(
        /^\/packages\/([a-f0-9]{64})\.zip$/,
      );
      if (packageMatch && request.method === "GET") {
        const { bytes, filename } = await deliveries.download(packageMatch[1]);
        response.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": bytes.length,
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        });
        return response.end(bytes);
      }
      if (url.pathname.startsWith("/api/")) {
        if (url.pathname === "/api/session" && request.method === "GET") {
          if (request.headers["x-workbench-client"] !== "1")
            throw failure("请从工作台页面连接", 403);
          let dataRootIdentity = null;
          let dataRootIdentityError = null;
          try {
            dataRootIdentity = await readDataRootIdentity(repository.directory);
          } catch {
            // Older workspace features may continue; scoped pending writes fail closed.
            dataRootIdentityError = "本机数据目录身份不可核验，受控待决操作保持关闭";
          }
          return send(response, 200, {
            token,
            directory,
            dataRootIdentity,
            dataRootIdentityError,
            mode: "filesystem",
            version: packageInfo.version,
          });
        }
        const presented = request.headers["x-workbench-token"];
        if (
          typeof presented !== "string" ||
          presented.length !== token.length ||
          !timingSafeEqual(Buffer.from(presented), Buffer.from(token))
        )
          throw failure("会话失效，请刷新工作台", 403);
        if (
          ["POST", "PUT"].includes(request.method) &&
          request.headers["content-type"] !== "application/json" &&
          !(url.pathname === '/api/full-backup/upload' && request.method === 'POST' && request.headers['content-type'] === 'application/zip')
        )
          throw failure("需要 JSON 请求", 415);
        if (url.pathname.startsWith('/api/collection/')) {
          const path = url.pathname.slice('/api/collection'.length), method = request.method;
          if(method==='GET' && path==='/search') {
            const query=url.searchParams.get('q')||'';
            if(query.length>COLLECTION_QUERY_MAX)throw failure('搜索词最多300个字符，请缩短后重试',400);
            return send(response,200,searchCollection(await collection.read(),query));
          }
          const getAnalysis=path.match(/^\/notes\/((?:[a-f0-9]{24}|douyin-\d{15,25}))\/get-analysis\/retry$/);
          if(method==='POST' && getAnalysis)return send(response,200,await collection.retryGet(getAnalysis[1],await body(request)));
          if (method==='GET' && path==='/notes') return send(response,200,await collection.notes());
          if (method==='GET' && path==='/notes/version') return send(response,200,{revision:String((await collection.read()).revision)});
          if (method==='GET' && path==='/health') return send(response,200,await collection.health());
          if (method==='GET' && path==='/desk-workspace') return send(response,200,await collection.desk());
          if (method==='PUT' && path==='/desk-workspace') return send(response,200,await collection.saveDesk(await body(request)));
          if (method==='POST' && path==='/notes/import') {
            let input;try{input=await body(request);}catch(error){error.operationNotStarted=true;throw error;}
            return send(response,202,await collection.startImport(input));
          }
          if (method==='POST' && path==='/notes/manual') return send(response,200,await collection.manual(await body(request)));
          if (method==='PATCH' && path==='/notes/categories') return send(response,200,await collection.categories(await body(request)));
          if (method==='POST' && path==='/extension/pair') return send(response,200,await collection.pairing());
          if (method==='POST' && path==='/extension/revoke') return send(response,200,await collection.revokePairing());
          if (method==='POST' && path==='/legacy/clear') return send(response,200,await collection.clearLegacy((await body(request)).expectedRevision));
          if (method==='GET' && path==='/setup') return send(response,200,await collection.setup());
          if (method==='GET' && path==='/recycle') return send(response,200,await collection.recycle.list());
          if (method==='POST' && path==='/recycle/organize') { const input=await body(request); if (Object.keys(input).length) throw failure('整理不接受自定义路径或筛选',400); return send(response,200,await collection.recycle.organize()); }
          if (method==='POST' && path==='/recycle/open') return send(response,200,await collection.recycle.open(undefined,await body(request)));
          const recycled=path.match(/^\/recycle\/([a-f0-9-]{36})\/(restore|open)$/);
          if (method==='POST' && recycled) { const input=await body(request); if (Object.keys(input).length) throw failure('回收操作不接受自定义路径',400); return send(response,200,recycled[2]==='restore'?await collection.recycle.restore(recycled[1]):await collection.recycle.open(recycled[1],input)); }
          const operation=path.match(/^\/operations\/([a-f0-9-]{36})$/);
          if (method==='GET' && operation) return send(response,200,await collection.status(operation[1]));
          const coverRepair=path.match(/^\/notes\/((?:[a-f0-9]{24}|douyin-\d{15,25}))\/repair-cover$/);
          if (method==='POST' && coverRepair) return send(response,200,await collection.repairCover(coverRepair[1],await body(request)));
          const note=path.match(/^\/notes\/((?:[a-f0-9]{24}|douyin-\d{15,25}))(\/reanalyze)?$/);
          const archive=path.match(/^\/notes\/((?:[a-f0-9]{24}|douyin-\d{15,25}))\/archive$/);
          if (method==='POST' && archive) return send(response,200,await collection.archive(archive[1],await body(request,1024)));
          if (method==='DELETE' && note && !note[2]) return send(response,200,await collection.remove(note[1]));
          if (method==='POST' && note?.[2]) return send(response,200,await collection.reanalyze(note[1]));
          const autoGroup=path.match(/^\/notes\/((?:[a-f0-9]{24}|douyin-\d{15,25}))\/auto-group\/(undo|[a-f0-9-]{36})$/);
          if (method==='POST' && autoGroup?.[2]==='undo') return send(response,200,await collection.undoAutoGroup(autoGroup[1],await body(request)));
          if (method==='GET' && autoGroup && autoGroup[2]!=='undo') return send(response,200,await collection.autoGroupStatus(autoGroup[1],autoGroup[2]));
          throw failure('收藏接口不存在',404);
        }
        if(url.pathname.startsWith('/api/capabilities/')){
          const action = capabilityAction(url.pathname, request.method);
          let result;
          try { result=await capabilities.dispatch(url.pathname,request.method,request.method==='POST'?await body(request):undefined); }
          catch (error) { if (action && error.unknownResult) await capabilityUsage.record(action, "unknown").catch(() => {}); throw error; }
          if(!result)throw failure('能力接口未开放',404);
          if (action && !["not_started", "skipped"].includes(result.value?.status)
            && !(url.pathname === "/api/capabilities/night/run" && result.value?.newlyStarted !== true)
            && !(["/api/capabilities/agent/apply", "/api/capabilities/agent/model-apply", "/api/capabilities/agent/model-rollback", "/api/capabilities/agent/pool-publish-apply", "/api/capabilities/agent/pool-publish-rollback"].includes(url.pathname) && result.value?.newlyStarted !== true)) await used(action, result.value);
          return send(response,200,result.value);
        }
        if (url.pathname === "/api/night-v2/status" && request.method === "GET")
          return send(response, 200, await nightV2Harness.status());
        if (url.pathname === "/api/night-v2/stop" && request.method === "POST")
          return send(response, 200, await nightV2Harness.stop(await body(request)));
        if (url.pathname === "/api/night-v2/recheck" && request.method === "POST")
          return send(response, 200, await nightV2Harness.recheck(await body(request)));
        if (url.pathname === "/api/night-v2/actions/preview" && request.method === "POST")
          return send(response, 200, await nightV2Actions.preview(await body(request)));
        if (url.pathname === "/api/night-v2/actions/confirm" && request.method === "POST")
          return send(response, 200, await nightV2Actions.confirm(await body(request)));
        if (url.pathname === "/api/night-v2/actions/query" && request.method === "GET")
          return send(response, 200, await nightV2Actions.query({ operationId: url.searchParams.get('operationId') }));
        if (url.pathname === "/api/night-v2/actions/decisions" && request.method === "GET")
          return send(response, 200, await nightV2Actions.decisions({ runId: url.searchParams.get('runId') ?? undefined }));
        if (url.pathname === "/api/night-v2/actions/suggestion-preview" && request.method === "POST")
          return send(response, 200, await nightV2Actions.suggestionPreview(await body(request)));
        if (url.pathname === "/api/night-v2/actions/suggestion-confirm" && request.method === "POST")
          return send(response, 200, await nightV2Actions.suggestionConfirm(await body(request)));
        if (url.pathname === "/api/night-v2/actions/suggestion-query" && request.method === "GET")
          return send(response, 200, await nightV2Actions.suggestionQuery({ operationId: url.searchParams.get('operationId') }));
        if (url.pathname === "/api/night-v2/morning/reconcile" && request.method === "POST")
          return send(response, 200, await nightV2Morning.reconcile(await body(request)));
        if (url.pathname === "/api/night-v2/morning-reports" && request.method === "GET")
          return send(response, 200, await nightV2MorningList());
        if (url.pathname === "/api/night-v2/morning-report" && request.method === "GET")
          return send(response, 200, await nightV2Morning.read({ runId: url.searchParams.get("runId") }));
        if (url.pathname === "/api/night-v2/output" && request.method === "GET")
          return send(response, 200, await nightV2Morning.output({ runId: url.searchParams.get("runId"),
            slotId: url.searchParams.get("slotId") }));
        if (url.pathname === "/api/capability-usage" && request.method === "GET")
          return send(response, 200, await capabilityUsage.summary());
        if (url.pathname === "/api/ai-access" && request.method === "GET")
          return send(response, 200, await aiAccess.status());
        if(url.pathname==='/api/note-images'&&request.method==='POST')return send(response,200,await noteImages.store(await body(request,12*1024*1024)));
        const imageRead=url.pathname.match(/^\/api\/note-images\/([a-f0-9]{64}\.(?:png|jpg|webp))\/read$/);
        if(imageRead&&request.method==='POST'){const input=await body(request,1024);if(!input||Object.keys(input).length)throw failure('图片读取请求无效');return send(response,200,await noteImages.read(imageRead[1]));}
        const noteRoute = url.pathname.match(/^\/api\/notes\/([^/]+)$/);
        if (url.pathname === '/api/notes' && request.method === 'GET') {
          const state = await repository.read();
          return send(response, 200, {notes:state?.notes || [], revision:state?.revision || 0});
        }
        if (noteRoute && ['GET','PUT','DELETE'].includes(request.method)) {
          const id = noteId(noteRoute[1]);
          const input = request.method !== 'GET' ? await body(request) : null;
          const state = request.method !== 'GET' ? await repository.updateNotes(notes => (request.method==='DELETE'?deleteNote:editNote)(notes, id, input)) : await repository.read();
          return send(response, 200, {note:state?.notes.find(note => note.id === id) || null, revision:state?.revision || 0});
        }
        const noteArchive = url.pathname.match(/^\/api\/notes\/([^/]+)\/archive$/);
        if (noteArchive && request.method === 'POST') {
          const id = noteId(noteArchive[1]), input = await body(request, 1024);
          const state = await repository.updateNotes(notes => archiveNote(notes, id, input, new Date().toISOString()));
          return send(response, 200, {note:state.notes.find(note => note.id === id) || null, revision:state.revision});
        }
        if (url.pathname === "/api/workspace" && request.method === "GET")
          return send(response, 200, await repository.read());
        if (url.pathname === "/api/assets/delete" && request.method === "POST")
          return send(response, 200, await assetDeletion.remove(await body(request)));
        if(url.pathname==='/api/reverse/native/query'&&request.method==='GET')return send(response,200,await nativeReverse.query(Object.fromEntries(url.searchParams)));
        if(url.pathname.startsWith('/api/reverse/native/')&&request.method==='POST'){
          const action=url.pathname.slice('/api/reverse/native/'.length);
          if(!['catalog','start','reconnect','turn','interrupt','respond','disconnect','archive','acknowledge'].includes(action))throw failure('原生操作不存在',404);
          return send(response,200,await nativeReverse[action](await body(request,1024*1024)));
        }
        if(url.pathname==='/api/reverse/pack'&&request.method==='GET')return send(response,200,await reverseSkillV4.pack(Object.fromEntries(url.searchParams)));
        if(url.pathname==='/api/reverse/skill/preview'&&request.method==='POST')return send(response,200,await reverseSkillV4.preview(await body(request)));
        if(url.pathname==='/api/reverse/skill/confirm'&&request.method==='POST')return send(response,200,await reverseSkillV4.confirm(await body(request)));
        if(url.pathname==='/api/reverse/skill/query'&&request.method==='GET')return send(response,200,await reverseSkillV4.query(Object.fromEntries(url.searchParams)));
        if(url.pathname==='/api/reverse/hatch/preview'&&request.method==='POST')return send(response,200,await reverseSkillV4.hatchPreview(await body(request)));
        if(url.pathname==='/api/reverse/hatch/confirm'&&request.method==='POST')return send(response,200,await reverseSkillV4.hatchConfirm(await body(request)));
        if(url.pathname==='/api/reverse/hatch/query'&&request.method==='GET')return send(response,200,await reverseSkillV4.hatchQuery(Object.fromEntries(url.searchParams)));
        if(['/api/reverse/reports/preview','/api/reverse/reports/adopt','/api/reverse/reports/reject'].includes(url.pathname)&&request.method==='POST')return send(response,200,await reverseReports[url.pathname.slice('/api/reverse/reports/'.length)](await body(request)));
        if(url.pathname==='/api/reverse/update'&&request.method==='GET')return send(response,200,reaUpdater.read());
        if(url.pathname==='/api/reverse/update/check'&&request.method==='POST')return send(response,200,await reaUpdater.check());
        if(url.pathname==='/api/reverse/update/preview'&&request.method==='POST')return send(response,200,await reaUpdater.preview());
        if(url.pathname==='/api/reverse/update/confirm'&&request.method==='POST')return send(response,200,await reaUpdater.confirm(await body(request)));
        if(url.pathname==='/api/reverse/update/query'&&request.method==='POST')return send(response,200,await reaUpdater.query());
        if(url.pathname==='/api/reverse/status'&&request.method==='GET')return send(response,200,await reverseRunner.status());
        if(url.pathname==='/api/reverse/runs/query'&&request.method==='GET')return send(response,200,await reverseRunner.query(Object.fromEntries(url.searchParams)));
        if(url.pathname==='/api/reverse/runs/start'&&request.method==='POST'){
          const input=await body(request);
          if(input.executor==='codex')throw failure('Codex 已使用原生会话，请从原生分析区开始',400);
          const result=await reverseRunner.start(input);return send(response,result.run?202:200,result);
        }
        if(url.pathname==='/api/reverse/target/precheck'&&request.method==='POST')return send(response,200,await reverseRunner.precheck(await body(request)));
        if(url.pathname==='/api/reverse/pack/select'&&request.method==='POST')return send(response,200,await reverseRunner.selectVersion(await body(request)));
        if(url.pathname==='/api/reverse/runs/stop'&&request.method==='POST')return send(response,200,await reverseRunner.stop(await body(request)));
        if(url.pathname==='/api/reverse/target/check'&&request.method==='POST')return send(response,200,await reverseRunner.check(await body(request)));
        if(url.pathname==='/api/reverse/media'&&request.method==='POST')return send(response,200,await reverseMedia.store(await body(request)));
        if(url.pathname==='/api/reverse/media/read'&&request.method==='POST')return send(response,200,await reverseMedia.read(await body(request)));
        if(url.pathname==='/api/reverse/media/locate'&&request.method==='POST')return send(response,200,await reverseMedia.locate(await body(request)));
        if (url.pathname === "/api/aihot" && request.method === "GET")
          return send(response, 200, await aihot.status());
        if (url.pathname === "/api/aihot/refresh" && request.method === "POST") {
          await body(request);
          return send(response, 200, await aihot.refresh());
        }
        if (url.pathname === "/api/aihot/settings" && request.method === "POST")
          return send(response, 200, await aihot.saveSettings(await body(request)));
        if (url.pathname === "/api/learning/shelf" && request.method === "GET")
          return send(response, 200, await learning.shelf());
        if (url.pathname === "/api/learning/metadata" && request.method === "POST")
          return send(response, 200, await learning.metadata(await body(request)));
        const folderAction = url.pathname.match(/^\/api\/learning\/folders\/(add|remove)$/)?.[1];
        if (folderAction && request.method === "POST") {
          const input = await body(request);
          if (!input || typeof input !== "object" || Array.isArray(input))
            throw failure("请求格式无效");
          return send(
            response,
            200,
            folderAction === "add"
              ? await learning.addFolder({ path: input.path, expectedRevision: input.expectedRevision })
              : await learning.removeFolder({ id: input.id, expectedRevision: input.expectedRevision }),
          );
        }
        if (url.pathname === "/api/asset-activity") {
          if (request.method === "GET") return send(response, 200, await activity.query(url.searchParams.get("id")));
          if (request.method === "POST") return send(response, 200, await activity.append(await body(request)));
        }
        if (url.pathname === "/api/knowledge/mcp-clients" && request.method === "GET") {
          let health = null;
          if (mcp?.url && mcpClientHealth) {
            try { health = await mcpClientHealth(mcp.url); } catch { /* Probe failures remain unknown. */ }
          }
          return send(response, 200, sanitizeKnowledgeAgentStatus(health, clock || Date.now));
        }
        const zonesAction = url.pathname.match(
          /^\/api\/knowledge\/zones\/(rules|stats|summary)$/,
        )?.[1];
        if (zonesAction && request.method === "POST") {
          const input = await body(request);
          if (zonesAction === "summary")
            return send(response, 200, {
              ...(await knowledgeProfile.summary(input)),
              mcp: { url: mcp?.url || null, error: mcp ? "" : mcpError || "MCP 服务未启用" },
            });
          return send(
            response,
            200,
            await knowledgeProfile[zonesAction === "rules" ? "saveRules" : "stats"](input),
          );
        }
        const profileAction = url.pathname.match(
          /^\/api\/knowledge\/profile\/(sharing|proposals\/preview|proposals\/confirm|proposals\/reject)$/,
        )?.[1];
        if (profileAction && request.method === "POST")
          return send(
            response,
            200,
            await knowledgeProfile[
              {
                sharing: "setSharing",
                "proposals/preview": "preview",
                "proposals/confirm": "confirm",
                "proposals/reject": "reject",
              }[profileAction]
            ](await body(request)),
          );
        const compilationAction = url.pathname.match(
          /^\/api\/knowledge\/tasks\/(create|packet|receive|check|archive)$/,
        )?.[1];
        const clipAction = url.pathname.match(
          /^\/api\/knowledge\/clip\/(preview|confirm|check)$/,
        )?.[1];
        const maintenanceAction = url.pathname.match(
          /^\/api\/knowledge\/maintenance\/(impact|preview|create|recover)$/,
        )?.[1];
        if (maintenanceAction && request.method === "POST")
          return send(
            response,
            200,
            await knowledgeMaintenance[maintenanceAction](await body(request)),
          );
        const writeAction = url.pathname.match(
          /^\/api\/knowledge\/writes\/(preview|apply|history|check|rollback-preview|rollback)$/,
        )?.[1];
        if (writeAction && request.method === "POST")
          return send(
            response,
            200,
            await knowledgeWrites[writeAction](await body(request)),
          );
        if (compilationAction && request.method === "POST")
          return send(
            response,
            200,
            await compilation[compilationAction](await body(request)),
          );
        if (clipAction && request.method === "POST")
          return send(response, 200, await knowledgeClip[clipAction](await body(request)));
        if(request.method === "POST" && url.pathname === "/api/knowledge/policy")return send(response,200,await knowledgeAccess.setPolicy(await body(request)));
        if (request.method === "GET" && url.pathname === "/api/knowledge/feishu/spaces")
          return send(response, 200, await feishuFiles.listSpaces());
        const feishuAction = url.pathname.match(/^\/api\/knowledge\/feishu\/(connect|connect-space|verify)$/)?.[1];
        if (request.method === "POST" && feishuAction)
          return send(response, 200,
            await feishuConnections[feishuAction === "connect-space" ? "connectSpace" : feishuAction](await body(request)));
        if(request.method === "POST" && url.pathname === "/api/knowledge/search-all")return send(response,200,await knowledgeAccess.searchAll(await body(request),{audience:"user"}));
        if(request.method === "POST" && url.pathname === "/api/knowledge/read-note")return send(response,200,await knowledgeAccess.readNote(await body(request),{audience:"user"}));
        if(request.method === "POST" && url.pathname === "/api/knowledge/profile/read-preview")return send(response,200,await knowledgeProfile.readPreview(await body(request)));
        const knowledgeAction = url.pathname.match(
          /^\/api\/knowledge\/(connect|scan|read|search|reconfirm|remove)$/,
        )?.[1];
        if (knowledgeAction && request.method === "POST")
          return send(
            response,
            200,
            await knowledge[knowledgeAction](await body(request)),
          );
        if (
          request.method === "POST" &&
          [
            "/api/agent-targets/options",
            "/api/agent-targets/save",
            "/api/agent-targets/remove",
          ].includes(url.pathname)
        ) {
          const action = url.pathname.split("/").at(-1);
          return send(
            response,
            200,
            await agentTargets[action](await body(request)),
          );
        }
        const copyAction = url.pathname.match(
          /^\/api\/skill-copies\/(discover|preview|bind|check|remove)$/,
        )?.[1];
        if (copyAction && request.method === "POST")
          return send(
            response,
            200,
            await skillCopies[copyAction](await body(request)),
          );
        const savepointAction=url.pathname.match(/^\/api\/savepoints\/(inspect|detail|compare|handoff|preview|confirm|query|pending)$/)?.[1];
        if(savepointAction&&request.method==='POST'){
          let value;
          try { value = await savepoints[savepointAction](await body(request)); }
          catch (error) { if (savepointAction === "confirm" && error.unknownResult) await capabilityUsage.record("savepoints", "unknown").catch(() => {}); throw error; }
          if (savepointAction === "confirm" && value?.newlyStarted === true) await used("savepoints", value);
          return send(response,200,value);
        }
        if(url.pathname==="/api/agent-health/history" && request.method==="GET") return send(response,200,await healthAudit.history());
        if(url.pathname==="/api/agent-health/inspect" && request.method==="POST") return send(response,200,await healthAudit.inspect(await body(request)));
        if (url.pathname === "/api/project-status/activity" && request.method === "POST")
          return send(response,200,await projectActivity.inspect(await body(request)));
        const statusAction = url.pathname.match(
          /^\/api\/project-status\/(inspect|mark|settings)$/,
        )?.[1];
        if (statusAction && request.method === "POST")
          return send(
            response,
            200,
            await projectStatus[statusAction](await body(request)),
          );
        if (url.pathname === "/api/projects-space" && request.method === "GET")
          return send(response, 200, await projectsSpace.inspect(url.searchParams.get("refresh") === "1" ? { refresh: true } : url.searchParams.get("roster") === "1" ? { roster: true } : {}));
        if (url.pathname === "/api/projects-space/relations" && request.method === "GET")
          return send(response, 200, await projectsSpace.relations(url.searchParams.get("refresh") === "1" ? { refresh: true } : {}));
        if (url.pathname === "/api/projects-space/skill-usage" && request.method === "GET")
          return send(response, 200, await skillUsage.read());
        if (url.pathname === "/api/projects-space/skill-usage/refresh" && request.method === "POST")
          return send(response, 200, await skillUsage.refresh(await body(request)));
        if (url.pathname === "/api/projects-space/sync" && request.method === "POST") {
          const result = await rosterSync.sync(await body(request));
          if (result.state === "error") throw failure(`名册读不到，没有同步：${result.message}`, 409);
          return send(response, 200, result);
        }
        if (url.pathname === "/api/projects-space/pin" && request.method === "POST")
          return send(response, 200, await projectsSpace.pin(await body(request)));
        if (url.pathname === "/api/project-github/panel" && request.method === "POST")
          return send(response, 200, await projectGithub.panel(await body(request)));
        const briefAction = url.pathname.match(
          /^\/api\/project-brief\/(today|read)$/,
        )?.[1];
        if (briefAction && request.method === "POST")
          return send(
            response,
            200,
            await projectBrief[briefAction](await body(request)),
          );
        const controlledAction = url.pathname.match(
          /^\/api\/controlled-execution\/(list|preview|confirm|resolve|status|start|check|stop|gate-preview|gate|collect)$/,
        )?.[1];
        if (controlledAction && request.method === "POST") {
          const action = controlledAction === 'gate-preview' ? 'gatePreview' : controlledAction;
          return send(response, 200, await controlled[action](await body(request)));
        }
        if (url.pathname === "/api/project-desk" && request.method === "GET")
          return send(response, 200, await projectDesk.read());
        const deskAction = url.pathname.match(/^\/api\/project-desk\/(deliver|withdraw|equip|unequip|next)$/)?.[1];
        if (deskAction && request.method === "POST")
          return send(response, 200, await projectDesk[deskAction](await body(request, 4096)));
        const collabAction = url.pathname.match(
          /^\/api\/collab\/(board|record|protocol)$/,
        )?.[1];
        if (collabAction && request.method === "POST")
          return send(
            response,
            200,
            await collabBoard[collabAction](await body(request)),
          );
        const configAction = url.pathname.match(
          /^\/api\/agent-config\/(inspect|preview|apply|check|history|restore-preview)$/,
        )?.[1];
        if (configAction && request.method === "POST") {
          if(configAction==='apply'){try{await capabilities.settings.assertEnabled('agent');}catch(e){e.operationNotStarted=true;throw e;}}
          const action =
            configAction === "restore-preview"
              ? "restorePreview"
              : configAction;
          let value;
          try { value = await agentConfig[action](await body(request)); }
          catch (error) { if (configAction === "apply" && error.unknownResult) await capabilityUsage.record("agent", "unknown").catch(() => {}); throw error; }
          if (configAction === "apply" && value?.newlyStarted === true) await used("agent", value);
          return send(response,200,value);
        }
        const ruleAction = url.pathname.match(
          /^\/api\/rule-templates\/(preview|apply|check|installs|revert-preview)$/,
        )?.[1];
        if (ruleAction && request.method === "POST")
          return send(
            response,
            200,
            await ruleTemplates[
              ruleAction === "revert-preview" ? "revertPreview" : ruleAction
            ](await body(request)),
          );
        const relayAction=url.pathname.match(/^\/api\/relay-sessions\/(list|prepare|history|validate|clear|open)$/)?.[1];
        if(relayAction && request.method==='POST') {
          const data=await body(request);
          const keys={list:['pageId','earlier','query','cursor'],prepare:['pageId','id','format','depth','evidenceRefs','currentState'],history:['pageId','id'],validate:['pageId','id'],clear:['pageId'],open:['agentId']}[relayAction];
          if(!data||Array.isArray(data)||Object.keys(data).some(k=>!keys.includes(k)))throw failure('接力请求只接受白名单字段');
          return send(response,200,await relaySessions[relayAction](data));
        }
        if (
          url.pathname === "/api/agent-inventory" &&
          request.method === "POST"
        ) {
          const data = await body(request);
          if (
            !data ||
            Array.isArray(data) ||
            Object.keys(data).length !== 1 ||
            !["codex", "hermes"].includes(data.agentId)
          )
            throw failure("请选择 Codex 或 Hermes；不接受自定义扫描范围");
          return send(
            response,
            200,
            await adapters.inspectAgentInventory(data.agentId),
          );
        }
        if (
          url.pathname === "/api/agent-contents" &&
          request.method === "POST"
        )
          return send(
            response,
            200,
            await agentContents.inspect(await body(request)),
          );
        const updateAction=url.pathname.match(/^\/api\/skill-source-updates\/(check|adopt)$/)?.[1];
        if(updateAction&&request.method==="POST")return send(response,200,await skillSourceUpdates[updateAction](await body(request)));
        if (url.pathname === "/api/skill-sources" && request.method === "GET")
          return send(response, 200, skillSources.defaults());
        const skillAction = url.pathname.match(
          /^\/api\/skill-sources\/(discover|preview|import|derive)$/,
        )?.[1];
        if (skillAction && request.method === "POST")
          return send(
            response,
            200,
            await skillSources[skillAction](await body(request)),
          );
        if (
          url.pathname === "/api/project-context/preview" &&
          request.method === "POST"
        )
          return send(
            response,
            200,
            await projectContext.preview(await body(request)),
          );
        if (
          url.pathname === "/api/project-context/bind" &&
          request.method === "POST"
        )
          return send(
            response,
            200,
            await projectContext.bind(await body(request)),
          );
        if (
          url.pathname === "/api/project-context/unbind" &&
          request.method === "POST"
        )
          return send(
            response,
            200,
            await projectContext.unbind(await body(request)),
          );
        if (
          url.pathname === "/api/project-context/prepare" &&
          request.method === "POST"
        )
          return send(
            response,
            200,
            await projectContext.prepare(await body(request)),
          );
        if (url.pathname === "/api/deliveries" && request.method === "POST")
          return send(
            response,
            200,
            await deliveries.create(await body(request), `http://${expected}`),
          );
        if (url.pathname === "/api/deliveries" && request.method === "GET")
          return send(
            response,
            200,
            await deliveries.list(url.searchParams.get("assetId")),
          );
        if (
          url.pathname === "/api/deliveries/revoke" &&
          request.method === "POST"
        )
          return send(
            response,
            200,
            deliveries.revoke((await body(request)).id),
          );
        if (
          url.pathname === "/api/deliveries/copied" &&
          request.method === "POST"
        )
          return send(
            response,
            200,
            deliveries.copied((await body(request)).id),
          );
        if (url.pathname === "/api/workspace" && request.method === "PUT") {
          const input = await body(request);
          return send(
            response,
            200,
            await repository.write(input.state, {
              initialize: input.initialize === true,
              restrictAssetDeletion: true,
              keepConnectionFields: READONLY_PROJECT_FIELDS,
            }),
          );
        }
        if (url.pathname === "/api/storage/status" && request.method === "GET")
          return send(response,200,await storageStatus.status());
        if (url.pathname === "/api/storage/reveal" && request.method === "POST")
          return send(response,200,await storageStatus.reveal(await body(request)));
        if (url.pathname === "/api/backup" && request.method === "GET")
          return send(response, 200, {
            format: "guiji-backup",
            schema: 1,
            exportedAt: new Date().toISOString(),
            state: await repository.read(),
          });
        if (url.pathname === '/api/full-backup/upload' && request.method === 'POST')
          return send(response, 200, await fullBackup.preview({bytes:await backupUpload(request)}));
        if (url.pathname === '/api/full-backup/download' && request.method === 'POST') {
          await body(request);
          const result = await fullBackup.create();
          response.writeHead(200, {'content-type':'application/zip','content-length':result.bytes.length,'cache-control':'no-store','X-Workbench-Filename':encodeURIComponent(result.filename),'X-Workbench-Backup-Files':String(result.manifest.files.length)});
          return response.end(result.bytes);
        }
        if (url.pathname === '/api/full-backup/scope' && request.method === 'GET') return send(response,200,await fullBackup.scope());
        const restoreOperation = url.pathname.match(/^\/api\/full-backup\/operations\/([a-f0-9-]+)$/)?.[1];
        if (restoreOperation && request.method === 'GET') return send(response,200,await fullBackup.operation(restoreOperation));
        const fullBackupAction = url.pathname.match(
          /^\/api\/full-backup\/(create|preview|restore)$/,
        )?.[1];
        if (fullBackupAction && request.method === "POST") {
          const input = await body(request);
          return send(response, 200, await fullBackup[fullBackupAction](input));
        }
        if (url.pathname === "/api/calendar/status" && request.method === "GET")
          return send(response, 200, await calendar.status());
        const calendarAction = url.pathname.match(
          /^\/api\/calendar\/(access|week|todos|blocks\/create|blocks\/update|blocks\/check|blocks\/delete|todos\/create|todos\/update)$/,
        )?.[1];
        if (calendarAction && request.method === "POST") {
          const input = await body(request);
          if (!input || typeof input !== "object" || Array.isArray(input))
            throw failure("请求格式无效");
          let value;
          try { value = await calendar[
              {
                access: "requestAccess",
                week: "week",
                todos: "todos",
                "blocks/create": "createBlock",
                "blocks/update": "updateBlock",
                "blocks/check": "checkBlock",
                "blocks/delete": "deleteBlock",
                "todos/create": "createTodo",
                "todos/update": "updateTodo",
              }[calendarAction]
            ](input); }
          catch (error) { if (error.unknownResult) await capabilityUsage.record("calendar", "unknown").catch(() => {}); throw error; }
          if (calendarAction === "week" ? Array.isArray(value.events)
            : calendarAction === "todos" ? Array.isArray(value.reminders)
            : !["access", "blocks/check"].includes(calendarAction))
            await used("calendar", value, ["week", "todos"].includes(calendarAction) ? "verified" : null);
          return send(response,200,value);
        }
        if (url.pathname === "/api/import/preview" && request.method === "POST")
          return send(
            response,
            200,
            await repository.previewImport(await body(request)),
          );
        if (
          url.pathname === "/api/import/confirm" &&
          request.method === "POST"
        ) {
          const input = await body(request);
          return send(
            response,
            200,
            await repository.importBackup(input.backup, input.token),
          );
        }
        if (url.pathname === "/api/connections" && request.method === "GET")
          return send(
            response,
            200,
            (await repository.read())?.connections ||
              emptyConnections(adapters.defaultRoots()),
          );
        // 项目名册以 digital-twin/projects.json 为准，数码世界只读（#71）：整理目录、扫描登记、目录关联的写接口一律拒绝，不读请求、不碰主库。
        if (RETIRED_PROJECT_WRITES.includes(url.pathname))
          throw failure(PROJECT_ROSTER_READONLY, 410);
        if (url.pathname === "/api/scan/agents" && request.method === "POST") {
          await body(request);
          const result = await singleScan("agents", async () => {
            const detected = await adapters.detectAgents();
            return repository.updateConnections((previous) => ({
              ...(previous || emptyConnections(adapters.defaultRoots())),
              agents: mergeAgents(previous?.agents || [], detected.items),
              agentScannedAt: detected.at,
            }));
          });
          return send(response, 200, result);
        }
        if (url.pathname === "/api/reveal" && request.method === "POST") {
          const input = await body(request),
            connections = (await repository.read())?.connections;
          const paths =
            input.kind === "project"
              ? connections?.projects.find((p) => p.id === input.id)?.localPaths
              : input.kind === "agent"
                ? connections?.agents
                    .find((a) => a.id === input.id)
                    ?.programs.map((p) => p.path)
                : null;
          const path = paths?.[Number.isInteger(input.index) ? input.index : 0];
          if (!path) throw failure("位置未经过扫描验证", 404);
          try {
            await stat(path);
          } catch {
            throw failure("位置已不存在，请重新扫描", 404);
          }
          await exec("/usr/bin/open", ["-R", path], { timeout: 5000 });
          return send(response, 200, { revealed: true });
        }
        // 驾驶舱只读页（#74）：不收任何路径参数；refresh=1 才现读，否则先回内存快照。
        if (url.pathname === "/api/cockpit/agents" && request.method === "GET") {
          adapters.cockpitAgents ??= cachedRead(() => readCockpitAgents());
          return send(response, 200, await adapters.cockpitAgents({ refresh: url.searchParams.get("refresh") === "1" }));
        }
        if (url.pathname === "/api/cockpit/rules" && request.method === "GET") {
          adapters.cockpitRules ??= cachedRead(() => readCockpitRules());
          return send(response, 200, await adapters.cockpitRules({ refresh: url.searchParams.get("refresh") === "1" }));
        }
        // 资产仓库 Skill 页（#93 第二批）：只读 my-skills 登记与 agent-kit 调用记录。
        // 只有正式入口（server/index.mjs）传 discovery.mySkills.home；测试里直接起的服务默认不读本机，页面显示「读不到 my-skills」。
        if (url.pathname === "/api/my-skills" && request.method === "GET") {
          adapters.mySkillsRead ??= cachedRead(() => adapters.mySkills?.home
            ? readMySkills(adapters.mySkills)
            : Promise.resolve({ at: new Date().toISOString(), available: false, items: [], usageSince: null, sources: { registry: "未配置", usage: "未配置" }, error: "本服务未配置 my-skills 读取" }));
          return send(response, 200, await adapters.mySkillsRead({ refresh: url.searchParams.get("refresh") === "1" }));
        }
        throw failure("接口不存在", 404);
      }
      if (!["GET", "HEAD"].includes(request.method))
        throw failure("方法不支持", 405);
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === "/fonts/hanzipen-sc-bold.ttf") {
        const font = await hanziPenBold();
        if (!font) throw failure("本机没有翩翩体", 404);
        response.writeHead(200, { "content-type": "font/ttf", "cache-control": "max-age=2592000" });
        return response.end(request.method === "HEAD" ? undefined : font);
      }
      if (pathname !== "/" && !/^\/assets\/[a-zA-Z0-9._-]+$/.test(pathname))
        throw failure("文件不存在", 404);
      const file = join(
        staticRoot,
        pathname === "/" ? "index.html" : pathname.slice(1),
      );
      let content;
      try {
        content = await readFile(file);
      } catch {
        throw failure("界面文件不存在，请先运行 npm run build", 404);
      }
      response.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
      response.writeHead(200, {
        "content-type": MIME[extname(file)] || "application/octet-stream",
        // 首页不落盘：Safari 网页应用恢复窗口会直接用磁盘里的旧首页，发布后旧哈希资源已不在，打开即黑屏。
        "cache-control": pathname === "/" ? "no-store" : "no-cache",
      });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch (error) {
      if (!response.headersSent)
        send(response, error.status || 500, {
          error: error.status
            ? error.message
            : "本地服务处理失败，数据未被静默重置。",
          ...(error.operationNotStarted === true
            ? { operationNotStarted: true }
            : {}),
          ...(error.unknownResult === true ? { unknownResult: true } : {}),
          ...((error.code === "KNOWLEDGE_ROOT_IDENTITY_CHANGED" || /^FEISHU_[A-Z_]+$/.test(error.code || "")) ? { code: error.code } : {}),
          ...(error.operationId ? {operationId:error.operationId}:{}),
          ...(error.revisionConflict === true ? {revisionConflict:true}:{}),
          ...(error.noteConflict ? {noteConflict:true,currentNote:error.currentNote}:{}),
        });
      else response.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
  } catch (error) {
    await mcp?.close();
    deliveries.close();
    await reaUpdater.close();
    await reverseRunner.close();
    await nativeReverse.close();
    await repository.close();
    throw error;
  }
  if (syncRosterOnStart)
    await rosterSync.sync().then(
      (r) => r.state === "error" && console.error(`名册读不到，本机登记没有同步：${r.message}`),
      (e) => console.error(`名册同步失败：${e.message}`),
    );
  await collection.start();
  aihot.start();
  capabilities.start();
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    repository,
    nightV2Harness,
    nightV2Morning,
    nightV2Actions,
    mcpUrl: mcp?.url || null,
    async close() {
      await collection.close();
      relaySessions.dispose?.();
      aihot.close();
      fullBackup.close();
      await capabilities.close();
      const serverClosed = new Promise((resolve) => server.close(resolve));
      await mcp?.close();
      deliveries.close();
      await reaUpdater.close();
      await reverseRunner.close();
      await nativeReverse.close();
      await serverClosed;
    await repository.close();
    },
  };
}

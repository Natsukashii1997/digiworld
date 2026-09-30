import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { openRepository, failure } from "./repository.mjs";
import { parse, stringify } from "../src/serialization.js";
import { createAssetActivity } from "./asset-activity.mjs";
import { createDeliveries } from "./delivery.mjs";
import { createProjectContext } from "./project-context.mjs";
import { createProjectIdentity } from "./project-identity.mjs";
import { inspectProjectLocation } from "./project-scan.mjs";
import { createSkillSources } from "./skill-sources.mjs";
import { inspectAgentInventory } from "./agent-inventory.mjs";
import { inspectAgentPrograms } from "./agent-programs.mjs";
import { createAgentTargets } from "./agent-targets.mjs";
import { createSkillCopies } from "./skill-copies.mjs";
import { createAgentConfig } from "./agent-config.mjs";
import { createRuleTemplates } from "./rule-templates.mjs";
import { createKnowledgeFiles } from "./knowledge-files.mjs";
import { createKnowledgeConnections } from "./knowledge-connections.mjs";
import { createKnowledgeCompilation } from "./knowledge-compilation.mjs";
import { createKnowledgeMaintenance } from "./knowledge-maintenance.mjs";
import { createKnowledgeWriteback } from "./knowledge-writeback.mjs";
import { createAiHot } from "./aihot.mjs";
import { createLearning } from "./learning.mjs";
import packageInfo from "../package.json" with { type: "json" };
import {
  scanLocalProjects,
  scanGitHub,
  detectAgents,
  mergeProjects,
  mergeAgents,
  defaultRoots,
} from "./discovery.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";
const exec = promisify(execFile);
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
};
async function body(request) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 100 * 1024 * 1024) throw failure("请求超过 100 MB 限制", 413);
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

export async function startServer({
  directory,
  port = 5178,
  staticRoot,
  discovery,
  clock,
} = {}) {
  const repository = await openRepository(directory);
  const deliveries = createDeliveries(repository, clock);
  const activity = createAssetActivity(repository, deliveries, clock);
  const projectContext = createProjectContext(repository, clock);
  const skillSources = createSkillSources(repository, clock);
  const token = randomBytes(32).toString("hex");
  const adapters = {
    scanLocalProjects,
    scanGitHub,
    detectAgents,
    defaultRoots,
    inspectAgentInventory,
    inspectAgentPrograms,
    inspectProjectLocation,
    ...discovery,
  };
  const agentTargets = createAgentTargets(repository, adapters, clock);
  const skillCopies = createSkillCopies(repository, adapters, clock);
  const agentConfig = createAgentConfig(repository, adapters, { clock });
  const ruleTemplates = createRuleTemplates(repository, { clock });
  const projectIdentity = createProjectIdentity(repository, {
    clock,
    inspect: adapters.inspectProjectLocation,
  });
  const knowledgeFiles = adapters.knowledgeFiles || createKnowledgeFiles();
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
  const knowledgeWrites = createKnowledgeWriteback(repository, {
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
  const learning = createLearning(repository, { clock });
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
      const origin = request.headers.origin;
      if (origin && origin !== `http://${expected}`)
        throw failure("不允许跨站访问本地主库", 403);
      if (
        ["cross-site", "same-site"].includes(request.headers["sec-fetch-site"])
      )
        throw failure("不允许跨站访问", 403);
      const url = new URL(request.url, `http://${expected}`);
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
          return send(response, 200, {
            token,
            directory,
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
          request.headers["content-type"] !== "application/json"
        )
          throw failure("需要 JSON 请求", 415);
        if (url.pathname === "/api/workspace" && request.method === "GET")
          return send(response, 200, await repository.read());
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
        const compilationAction = url.pathname.match(
          /^\/api\/knowledge\/tasks\/(create|packet|receive|check|archive)$/,
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
        const projectIdentityAction = url.pathname.match(
          /^\/api\/project-identity\/(preview|confirm)$/,
        )?.[1];
        if (projectIdentityAction && request.method === "POST")
          return send(
            response,
            200,
            await projectIdentity[projectIdentityAction](await body(request)),
          );
        const configAction = url.pathname.match(
          /^\/api\/agent-config\/(inspect|preview|apply|check|history|restore-preview)$/,
        )?.[1];
        if (configAction && request.method === "POST") {
          const action =
            configAction === "restore-preview"
              ? "restorePreview"
              : configAction;
          return send(
            response,
            200,
            await agentConfig[action](await body(request)),
          );
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
            }),
          );
        }
        if (url.pathname === "/api/backup" && request.method === "GET")
          return send(response, 200, {
            format: "guiji-backup",
            schema: 1,
            exportedAt: new Date().toISOString(),
            state: await repository.read(),
          });
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
        if (
          url.pathname === "/api/scan/projects" &&
          request.method === "POST"
        ) {
          const input = await body(request);
          const result = await singleScan("projects", async () => {
            const existing =
              (await repository.read())?.connections ||
              emptyConnections(adapters.defaultRoots());
            const roots = input.roots ?? existing.roots;
            const [local, remote] = await Promise.all([
              adapters.scanLocalProjects(roots, {
                knownPaths: [
                  ...new Set(existing.projects.flatMap((p) => p.localPaths)),
                ],
              }),
              adapters.scanGitHub(),
            ]);
            return repository.updateConnections((previous) => {
              const c = previous || existing;
              if (JSON.stringify(c.roots) !== JSON.stringify(existing.roots))
                throw failure("扫描期间目录范围已变化，请重新扫描", 409);
              return {
                ...c,
                roots,
                projects: mergeProjects(
                  c.projects,
                  local.items,
                  remote.status === "connected" ? remote.items : [],
                  {
                    protectedIds: (c.contextBindings || []).map(
                      (b) => b.projectId,
                    ),
                    locations: local.locations || [],
                    at: local.at,
                  },
                ),
                projectScannedAt: local.at,
                errors: local.errors,
                truncated: local.truncated || remote.truncated,
                github: {
                  status: remote.status,
                  login: remote.login || c.github.login,
                  message: remote.message,
                  at: remote.at,
                },
              };
            });
          });
          return send(response, 200, result);
        }
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
        throw failure("接口不存在", 404);
      }
      if (!["GET", "HEAD"].includes(request.method))
        throw failure("方法不支持", 405);
      const pathname = decodeURIComponent(url.pathname);
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
        "cache-control": "no-cache",
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
    deliveries.close();
    await repository.close();
    throw error;
  }
  aihot.start();
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    repository,
    async close() {
      aihot.close();
      await new Promise((resolve) => server.close(resolve));
      deliveries.close();
      await repository.close();
    },
  };
}

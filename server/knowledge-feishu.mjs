import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { failure } from "./repository.mjs";

const exec = promisify(execFile);
const TOKEN = /^[A-Za-z0-9_-]{6,128}$/;
const SPACE = /^[0-9]{1,30}$/;
const ROOT = /^feishu:\/\/wiki\/([A-Za-z0-9_-]{6,128})$/;
const SPACE_ROOT = /^feishu:\/\/space\/([0-9]{1,30})$/;
const MAX_BYTES = 256 * 1024;
const MAX_DEPTH = 16;
const MAX_NODES = 500;
const MAX_PAGES = 30;
const MAX_SCAN_MS = 5000;
const MAX_SPACE_SCAN_MS = 15000;
const PROFILE = "codex";
const APP_ID = "cli_aacf58ab61b85beb";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const problem = (message, status, code) =>
  Object.assign(failure(message, status), { code });

export const isFeishuSpaceRoot = (root) => typeof root === "string" && SPACE_ROOT.test(root);
export const isFeishuRoot = (root) => typeof root === "string" && (ROOT.test(root) || SPACE_ROOT.test(root));
export const feishuRoot = (token) => {
  if (!TOKEN.test(token || "")) throw problem("飞书 Wiki 节点标识无效", 400, "FEISHU_INVALID_SCOPE");
  return `feishu://wiki/${token}`;
};
export const feishuSpaceRoot = (spaceId) => {
  if (typeof spaceId !== "string" || !SPACE.test(spaceId))
    throw problem("飞书知识空间标识无效", 400, "FEISHU_INVALID_SCOPE");
  return `feishu://space/${spaceId}`;
};
export const feishuSpaceId = (root) => {
  const match = typeof root === "string" && SPACE_ROOT.exec(root);
  if (!match) throw problem("飞书知识空间范围无效", 400, "FEISHU_INVALID_SCOPE");
  return match[1];
};
export const feishuToken = (root) => {
  const match = typeof root === "string" && ROOT.exec(root);
  if (!match) throw problem("飞书知识源范围无效", 400, "FEISHU_INVALID_SCOPE");
  return match[1];
};
export const feishuIdentity = (spaceId, token) => hash(`${spaceId}/${token}`);
export const pendingFeishuIdentity = (token) => hash(`pending/${token}`);
export const feishuSpaceIdentity = (spaceId) => hash(`space/${spaceId}`);
export const pendingFeishuSpaceIdentity = (spaceId) => hash(`pending-space/${spaceId}`);
export const feishuPrincipalIdentity = (appId, openId) => hash(`${appId}/${openId}`);
export function principalFromWhoami(value) {
  if (!value || typeof value !== "object" ||
      typeof value.profile !== "string" || typeof value.appId !== "string" ||
      typeof value.identity !== "string" || typeof value.available !== "boolean")
    throw problem("飞书身份响应不完整，读取结果未知", 503, "FEISHU_INCOMPLETE");
  if (value?.profile !== PROFILE || value.appId !== APP_ID || value.identity !== "user")
    throw problem("飞书应用或用户身份与工作台绑定不符，读取暂停", 409, "FEISHU_WRONG_IDENTITY");
  if (value.available !== true) {
    if (value.tokenStatus === "missing")
      throw problem("飞书本人用户授权尚未完成，读取暂停", 401, "FEISHU_AUTH_REQUIRED");
    throw problem("飞书本人用户身份暂无法核验，结果范围未知", 503, "FEISHU_UNAVAILABLE");
  }
  if (!/^ou_[A-Za-z0-9_-]+$/.test(value.onBehalfOf?.openId || ""))
    throw problem("飞书本人用户身份响应不完整，读取结果未知", 503, "FEISHU_INCOMPLETE");
  return feishuPrincipalIdentity(value.appId, value.onBehalfOf.openId);
}

export function wikiTokenFromInput(value) {
  if (typeof value !== "string" || value.length > 2000 || /[\x00-\x1f\x7f]/.test(value))
    throw problem("请填写飞书 Wiki 节点链接或 token", 400, "FEISHU_INVALID_SCOPE");
  const input = value.trim();
  if (TOKEN.test(input)) return input;
  let url;
  try { url = new URL(input); } catch { /* validated below */ }
  const token = url?.pathname.match(/^\/wiki\/([A-Za-z0-9_-]{6,128})\/?$/)?.[1];
  const officialHost = url && ["feishu.cn", "larksuite.com"].some(
    (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
  );
  if (!url || url.protocol !== "https:" || url.username || url.password || !officialHost || !token)
    throw problem("请使用飞书 Wiki 节点的 HTTPS 链接或节点 token", 400, "FEISHU_INVALID_SCOPE");
  // The URL host is never contacted: only the node token is passed to the pinned CLI profile.
  return token;
}

function cliError(raw) {
  const entry = raw?.error || raw || {};
  const type = String(entry.type || "").toLowerCase();
  const subtype = String(entry.subtype || "").toLowerCase();
  const code = Number(entry.code);
  if (code === 131006 || subtype.includes("permission"))
    return problem("当前飞书用户无权读取所选知识范围，请由资源所有者授权", 403, "FEISHU_PERMISSION_DENIED");
  if (type.includes("auth") || subtype.includes("scope") || subtype.includes("login") || code === 99991679)
    return problem("飞书用户授权或只读权限尚未完成，请由本人核对授权", 401, "FEISHU_AUTH_REQUIRED");
  if ([131005, 131012, 131013, 131014, 131016].includes(code) || subtype.includes("not_found"))
    return problem("飞书 Wiki 节点不存在、已删除或链接失效", 404, "FEISHU_SCOPE_MISSING");
  if (code === 99991400 || type.includes("rate_limit") || subtype.includes("rate_limit"))
    return problem("飞书读取已限流，请稍后重试", 429, "FEISHU_RATE_LIMIT");
  return problem("飞书只读接口暂不可用，结果范围未知", 503, "FEISHU_UNAVAILABLE");
}

// The workbench never receives a token. lark-cli holds the user's credentials
// in its own profile after the human completes authorization. This wrapper
// never logs command output or passes untrusted input to a shell.
export async function runFeishuCli(args) {
  try {
    const { stdout } = await exec("lark-cli", ["--profile", PROFILE, ...args, "--as", "user"], {
      timeout: 12000,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
        LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1",
      },
    });
    const value = JSON.parse(stdout);
    if (value?.ok === false) throw cliError(value);
    if (value?.ok === true && Object.hasOwn(value, "data")) {
      if (value.identity && value.identity !== "user")
        throw problem("飞书身份不是预期的本人用户身份，已停止读取", 503, "FEISHU_WRONG_IDENTITY");
      return value.data;
    }
    // The node-get shortcut also documents a bare node object. It remains
    // bounded by an explicit --as user call and a separate whoami check.
    if (args[0] === "wiki" && args[1] === "+node-get" &&
        typeof value?.node_token === "string" && typeof value?.space_id === "string")
      return value;
    throw problem("飞书只读响应格式不完整，结果范围未知", 503, "FEISHU_INCOMPLETE");
  } catch (error) {
    if (error?.status) throw error;
    let envelope;
    try { envelope = JSON.parse(error?.stderr || ""); } catch { /* No raw stderr is surfaced. */ }
    if (envelope) throw cliError(envelope);
    if (error?.code === "ENOENT")
      throw problem("本机未找到飞书 CLI，无法读取知识源", 503, "FEISHU_UNAVAILABLE");
    throw problem("飞书只读接口暂不可用，结果范围未知", 503, "FEISHU_UNAVAILABLE");
  }
}

// whoami prints only identity metadata. The raw user ID stays inside this
// process; persistent state keeps its one-way fingerprint, never credentials.
export async function runFeishuWhoami() {
  let value;
  try {
    const { stdout } = await exec("lark-cli", ["--profile", PROFILE, "whoami", "--as", "user"], {
      timeout: 12000,
      maxBuffer: 64 * 1024,
      env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER:"1", LARKSUITE_CLI_NO_SKILLS_NOTIFIER:"1" },
    });
    try { value = JSON.parse(stdout); }
    catch { throw problem("飞书身份响应不完整，读取结果未知", 503, "FEISHU_INCOMPLETE"); }
  } catch (error) {
    if (error?.code === "FEISHU_INCOMPLETE") throw error;
    throw problem("飞书身份核验接口暂不可用，结果范围未知", 503, "FEISHU_UNAVAILABLE");
  }
  return principalFromWhoami(value);
}

function nodeOf(value) {
  const node = value?.node || value;
  if (!node || !TOKEN.test(node.node_token || "") || !SPACE.test(String(node.space_id || "")) ||
      !["origin", "shortcut"].includes(node.node_type) ||
      typeof node.obj_type !== "string" || !node.obj_type || node.obj_type.length > 30 ||
      typeof node.has_child !== "boolean")
    throw problem("飞书节点信息不完整，不能扩大知识范围", 503, "FEISHU_INCOMPLETE");
  return { ...node, space_id: String(node.space_id) };
}
function modifiedAt(node) {
  if (typeof node?.updated_at === "string" && Number.isFinite(Date.parse(node.updated_at)))
    return new Date(node.updated_at).toISOString();
  const seconds = Number(node?.obj_edit_time);
  return Number.isSafeInteger(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : null;
}
function pathTokens(path) {
  if (typeof path !== "string" || path.length > 2000 || /[\\:\x00-\x1f\x7f]/.test(path) || !path.endsWith(".md"))
    throw problem("飞书原文位置指针无效", 400, "FEISHU_INVALID_SCOPE");
  const parts = path.slice(0, -3).split("/");
  if (!parts.length || parts.some((part) => !TOKEN.test(part)))
    throw problem("飞书原文位置指针无效", 400, "FEISHU_INVALID_SCOPE");
  return parts;
}
const fingerprint = (spaceId, path, node) =>
  hash(JSON.stringify([spaceId, path, node.node_token, node.obj_token, node.parent_node_token, node.obj_type]));
const label = (node) => String(node.title || node.node_token).replace(/[\x00-\x1f\x7f-\x9f]/g, " ").trim().slice(0, 100);

export function createFeishuKnowledgeFiles({ cli = runFeishuCli, principal = runFeishuWhoami, clock = Date.now } = {}) {
  async function getNode(token) {
    if (!TOKEN.test(token || "")) throw problem("飞书节点标识无效", 400, "FEISHU_INVALID_SCOPE");
    return nodeOf(await cli(["wiki", "+node-get", "--node-token", token, "--format", "json"]));
  }
  async function getSpace(spaceId) {
    if (!SPACE.test(spaceId || "")) throw problem("飞书知识空间标识无效", 400, "FEISHU_INVALID_SCOPE");
    const response = await cli(["wiki", "spaces", "get", "--space-id", spaceId, "--format", "json"]);
    const space = response?.space;
    if (!space || typeof space.space_id !== "string" ||
        typeof space.name !== "string" || !space.name.trim())
      throw problem("飞书知识空间信息不完整", 503, "FEISHU_INCOMPLETE");
    if (space.space_id !== spaceId)
      throw problem("飞书知识空间范围已变化，请重新核验", 409, "FEISHU_SCOPE_CHANGED");
    return space;
  }
  async function listSpaces() {
    const principalHash = await principal();
    const response = await cli(["wiki", "+space-list", "--page-all", "--page-limit", "10", "--format", "json"]);
    if (await principal() !== principalHash)
      throw problem("飞书登录用户已变化，请重新打开来源选择", 409, "FEISHU_WRONG_IDENTITY");
    if (!Array.isArray(response?.spaces) || typeof response.has_more !== "boolean")
      throw problem("飞书知识空间列表不完整", 503, "FEISHU_INCOMPLETE");
    const spaces = response.spaces.slice(0, 50).map((space) => {
      if (typeof space?.space_id !== "string" || !SPACE.test(space.space_id) ||
          typeof space.name !== "string")
        throw problem("飞书知识空间列表不完整", 503, "FEISHU_INCOMPLETE");
      return { spaceId: space.space_id, name: space.name.trim().slice(0, 100) };
    });
    return { spaces, partial: response.has_more || response.spaces.length > 50 };
  }
  async function checkedRoot(source) {
    const wholeSpace = isFeishuSpaceRoot(source.root);
    const token = wholeSpace ? null : feishuToken(source.root);
    if (!SPACE.test(String(source.feishuSpaceId || "")) || !/^[a-f0-9]{64}$/.test(source.feishuPrincipalHash || ""))
      throw problem("飞书范围尚未由本人授权核验", 409, "FEISHU_NEEDS_VERIFICATION");
    if (await principal() !== source.feishuPrincipalHash)
      throw problem("飞书登录用户已变化，请重新核验来源", 409, "FEISHU_WRONG_IDENTITY");
    const root = wholeSpace ? await getSpace(feishuSpaceId(source.root)) : await getNode(token);
    if (await principal() !== source.feishuPrincipalHash)
      throw problem("飞书登录用户已变化，请重新核验来源", 409, "FEISHU_WRONG_IDENTITY");
    if (wholeSpace ? root.space_id !== source.feishuSpaceId :
        root.node_token !== token || root.space_id !== source.feishuSpaceId || root.node_type === "shortcut")
      throw problem("飞书节点范围已变化，请重新核验", 409, "FEISHU_SCOPE_CHANGED");
    return root;
  }
  async function ancestry(source, token) {
    const wholeSpace = isFeishuSpaceRoot(source.root);
    const rootToken = wholeSpace ? null : feishuToken(source.root);
    await checkedRoot(source);
    const nodes = [];
    const seen = new Set();
    let next = token;
    while (next && nodes.length <= MAX_DEPTH) {
      if (seen.has(next)) break;
      seen.add(next);
      const node = await getNode(next);
      if (node.space_id !== source.feishuSpaceId || node.node_type === "shortcut") break;
      nodes.push(node);
      if ((wholeSpace && node.parent_node_token === "") || next === rootToken) {
        const chain = nodes.reverse();
        const path = `${(wholeSpace ? chain : chain.length === 1 ? chain : chain.slice(1))
          .map((n) => n.node_token).join("/")}.md`;
        return { node: chain.at(-1), path };
      }
      next = node.parent_node_token;
    }
    throw problem("飞书节点已离开已确认的知识范围", 403, "FEISHU_OUT_OF_SCOPE");
  }
  async function inspectRoot(root) {
    if (isFeishuSpaceRoot(root)) {
      const spaceId = feishuSpaceId(root), principalHash = await principal();
      const space = await getSpace(spaceId);
      if (await principal() !== principalHash)
        throw problem("飞书登录用户已变化，请重新核验来源", 409, "FEISHU_WRONG_IDENTITY");
      return { root, identity: feishuSpaceIdentity(spaceId), spaceId, principalHash, space };
    }
    const token = feishuToken(root), principalHash = await principal(), node = await getNode(token);
    if (await principal() !== principalHash)
      throw problem("飞书登录用户已变化，请重新核验来源", 409, "FEISHU_WRONG_IDENTITY");
    if (node.node_token !== token)
      throw problem("请使用 Wiki 节点链接或节点 token，不能使用文档 token", 400, "FEISHU_INVALID_SCOPE");
    if (node.node_type === "shortcut")
      throw problem("飞书快捷方式不能作为知识源", 400, "FEISHU_INVALID_SCOPE");
    return { root, identity: feishuIdentity(node.space_id, token), spaceId: node.space_id, principalHash, node };
  }
  async function scan(source, { sharedBudget } = {}) {
    const wholeSpace = isFeishuSpaceRoot(source.root);
    const root = await checkedRoot(source);
    const started = clock();
    const scanLimit = wholeSpace ? MAX_SPACE_SCAN_MS : MAX_SCAN_MS;
    const files = [], issues = [], queue = wholeSpace ? [] : [{ node: root, parents: [], parentLabels: [], depth: 0 }];
    const seen = new Set();
    let visited = 0, skipped = 0, pages = 0;
    const issue = (path, message) => issues.push({ path, message });
    async function enqueueChildren(parent, parents = [], parentLabels = [], depth = -1) {
      let pageToken = "";
      const pageTokens = new Set();
      const parentPath = parent?.node_token || source.root;
      while (true) {
        if (clock() - started >= scanLimit || pages >= MAX_PAGES) {
          issue(parentPath, "飞书分页达到本次预算，剩余范围未知");
          queue.length = 0;
          return;
        }
        const args = ["wiki", "+node-list", "--space-id", source.feishuSpaceId,
          "--page-size", "50", "--format", "json"];
        if (parent) args.push("--parent-node-token", parent.node_token);
        if (pageToken) args.push("--page-token", pageToken);
        const listing = await cli(args);
        pages++;
        if (!Array.isArray(listing?.nodes) || typeof listing.has_more !== "boolean")
          throw problem("飞书节点分页信息不完整，不能宣称扫描完成", 503, "FEISHU_INCOMPLETE");
        for (const raw of listing.nodes) {
          const child = nodeOf(raw);
          if (child.space_id !== source.feishuSpaceId || child.parent_node_token !== (parent?.node_token || ""))
            throw problem("飞书节点超出已确认的父级范围", 409, "FEISHU_SCOPE_CHANGED");
          queue.push({ node: child,
            parents: parent
              ? wholeSpace || parent.node_token !== root.node_token
                ? [...parents, parent.node_token] : []
              : [],
            parentLabels: parent ? [...parentLabels, label(parent)] : [],
            depth: depth + 1 });
        }
        if (!listing.has_more) return;
        const next = listing.page_token;
        if (typeof next !== "string" || !next || pageTokens.has(next)) {
          issue(parentPath, "飞书下一页游标缺失或重复，剩余范围未知");
          queue.length = 0;
          return;
        }
        pageTokens.add(next);
        pageToken = next;
      }
    }
    if (wholeSpace) await enqueueChildren(null);
    while (queue.length) {
      const { node, parents, parentLabels, depth } = queue.shift();
      if (seen.has(node.node_token)) { issue(node.node_token, "节点在本次树中重复，剩余范围未知"); continue; }
      seen.add(node.node_token);
      if (clock() - started >= scanLimit || visited >= MAX_NODES || pages >= MAX_PAGES) {
        issue(node.node_token, "飞书节点扫描达到本次预算，剩余范围未知");
        break;
      }
      if (sharedBudget && !sharedBudget.takeEntry()) {
        issue(node.node_token, "统一知识扫描达到本次预算，剩余范围未知");
        break;
      }
      visited++;
      const path = !wholeSpace && node.node_token === root.node_token
        ? `${root.node_token}.md`
        : `${[...parents, node.node_token].join("/")}.md`;
      if (node.node_type === "shortcut") {
        skipped++;
        issue(path, "快捷方式不在授权子树的正文范围内，已跳过");
        continue;
      }
      if (node.obj_type === "docx") {
        if (sharedBudget && !sharedBudget.takeFile()) {
          issue(path, "统一知识文件预算已用完，剩余范围未知");
          break;
        }
        files.push({ path, title: label(node), displayPath: [...parentLabels, label(node)].join(" / ").slice(0, 500),
          bytes: MAX_BYTES, modifiedAt: modifiedAt(node),
          fingerprint: fingerprint(source.feishuSpaceId, path, node) });
      } else if (node.obj_type && node.obj_type !== "folder") {
        skipped++;
        issue(path, `暂不支持 ${String(node.obj_type).slice(0, 30)} 内容；该节点未读取`);
      }
      if (!node.has_child && (wholeSpace || node.node_token !== root.node_token)) continue;
      if (depth >= MAX_DEPTH) { issue(path, "飞书节点层级达到上限，子树未读取"); continue; }
      await enqueueChildren(node, parents, parentLabels, depth);
    }
    await checkedRoot(source);
    return { status: issues.length ? "partial" : "complete", files, issues, skipped, visited };
  }
  async function read(source, selected) {
    if (!selected || typeof selected !== "object")
      throw problem("飞书原文位置指针无效", 400, "FEISHU_INVALID_SCOPE");
    const parts = pathTokens(selected.path), token = parts.at(-1);
    const before = await ancestry(source, token);
    if (before.path !== selected.path || before.node.obj_type !== "docx" || !TOKEN.test(before.node.obj_token || ""))
      throw problem("飞书原文已移出范围或不再是 Docx", 409, "FEISHU_SCOPE_CHANGED");
    if (selected.fingerprint && selected.fingerprint !== fingerprint(source.feishuSpaceId, selected.path, before.node))
      throw problem("飞书文档元数据已变化，请重新检索", 409, "FEISHU_SCOPE_CHANGED");
    const fetched = await cli(["docs", "+fetch", "--doc", before.node.obj_token,
      "--doc-format", "markdown", "--detail", "simple"]);
    const content = fetched?.document?.content;
    if (typeof content !== "string" || content.includes("\0") || fetched?.document?.tips)
      throw problem("飞书文档文本读取不完整，结果未知", 503, "FEISHU_INCOMPLETE");
    const bytes = Buffer.byteLength(content);
    if (bytes > MAX_BYTES)
      throw problem("飞书文档超过单篇 256 KiB 上限", 413, "FEISHU_TOO_LARGE");
    const after = await ancestry(source, token);
    if (await principal() !== source.feishuPrincipalHash)
      throw problem("飞书登录用户已变化，请重新核验来源", 409, "FEISHU_WRONG_IDENTITY");
    if (after.path !== before.path ||
        fingerprint(source.feishuSpaceId, selected.path, after.node) !==
        fingerprint(source.feishuSpaceId, selected.path, before.node))
      throw problem("飞书文档读取期间范围或版本已变化", 409, "FEISHU_SCOPE_CHANGED");
    return { path: selected.path, content, bytes, sha256: hash(content), modifiedAt: modifiedAt(after.node) };
  }
  async function current(source, path) {
    const token = pathTokens(path).at(-1);
    const { node, path: actual } = await ancestry(source, token);
    if (actual !== path || node.obj_type !== "docx")
      throw problem("飞书原文已移出范围或不再是 Docx", 409, "FEISHU_SCOPE_CHANGED");
    const selected = { path, bytes: MAX_BYTES, modifiedAt: modifiedAt(node),
      fingerprint: fingerprint(source.feishuSpaceId, path, node) };
    return { selected, document: await read(source, selected) };
  }
  return { inspectRoot, scan, read, current, listSpaces, resolveRoot: inspectRoot };
}

export function createKnowledgeFileDispatch(local, feishu) {
  const provider = (source) => source?.kind === "feishu" ? feishu : local;
  return {
    limits: local.limits,
    resolveFeishuRoot: (root) => feishu.resolveRoot(root),
    inspectRoot: (root) => isFeishuRoot(root) ? feishu.inspectRoot(root) : local.inspectRoot(root),
    scan: (source, input) => provider(source).scan(source, input),
    read: (source, input) => provider(source).read(source, input),
    current: (source, input) => provider(source).current(source, input),
  };
}

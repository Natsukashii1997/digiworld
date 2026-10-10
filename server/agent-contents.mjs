// 智能体群 · 内容清单与能力体检（产品定义 v1.2 §4.3、v1.1 §4.1/§4.2；G3）。
// 只读：列出各 Agent 默认 Home 下的 Skill、配置文件、插件与 MCP；Skill 读取完整包算指纹，
// 与资产仓库比对。单项开关只生成“将要做什么”的预览，本模块不写任何文件。
// 配置文件只给元数据；MCP 定义位于配置正文（可能含凭据），不读取正文，如实标为未读取。
import filesystem from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { digest, failure } from "./repository.mjs";
import { readLocalSkill, skillFingerprint } from "./skill-files.mjs";
import { current } from "../src/store.js";

export const CONTENT_AGENTS = [
  {
    id: "codex",
    name: "Codex",
    home: ".codex",
    configs: ["config.toml", "AGENTS.md", "hooks.json"],
    plugins: "plugins",
    nativePool: true,
    mcp: "Codex 的 MCP 定义在 config.toml 的 mcp_servers 表里，属于配置正文（可能含凭据），本清单不读取正文。",
  },
  {
    id: "claude-code",
    name: "Claude Code",
    home: ".claude",
    configs: ["settings.json", "settings.local.json", "CLAUDE.md"],
    plugins: "plugins",
    mcp: "Claude Code 的 MCP 定义在 ~/.claude.json 与项目 .mcp.json 的配置正文里（可能含凭据），本清单不读取正文。",
  },
  {
    id: "hermes",
    name: "Hermes",
    home: ".hermes",
    configs: ["config.yaml", "SOUL.md"],
    plugins: "plugins",
    mcp: "Hermes 的 MCP 定义在 config.yaml 的 mcp_servers 里，属于配置正文（可能含凭据），本清单不读取正文。",
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    home: ".openclaw",
    configs: ["openclaw.json"],
    plugins: "extensions",
    mcp: "OpenClaw 的 MCP 定义在 openclaw.json 的配置正文里（可能含凭据），本清单不读取正文。",
  },
];
const SKILL_LIMIT = 300,
  PLUGIN_LIMIT = 100;
const AUTHORIZATION = "需要用户单独授权后在本机执行；本页不执行写入。";
const within = (root, path) => {
  const part = relative(root, path);
  return part === "" || (!isAbsolute(part) && !part.startsWith(".."));
};
const denied = (error) => ["EACCES", "EPERM"].includes(error?.code);
const reasonOf = (error) =>
  denied(error) ? "没有读取权限" : "无法读取目录元数据";

async function listDirectory(fs, path, limit) {
  let info;
  try {
    info = await fs.lstat(path);
  } catch (error) {
    if (error.code === "ENOENT")
      return { status: "missing", reason: "目录不存在", entries: [] };
    return { status: "unreadable", reason: reasonOf(error), entries: [] };
  }
  if (info.isSymbolicLink())
    return { status: "blocked", reason: "目录是符号链接，未跟随", entries: [] };
  if (!info.isDirectory())
    return { status: "blocked", reason: "不是普通目录", entries: [] };
  try {
    await fs.access(path, constants.R_OK | constants.X_OK);
    const names = (await fs.readdir(path)).sort((a, b) => a.localeCompare(b));
    return {
      status: "ok",
      entries: names.slice(0, limit),
      truncated: names.length > limit,
    };
  } catch (error) {
    return { status: "unreadable", reason: reasonOf(error), entries: [] };
  }
}

function togglePlan(item, disabledRoot) {
  const to = join(disabledRoot, item.name),
    restore = `把它从 ${to} 移回 ${item.path} 即可恢复。`;
  if (item.native)
    return {
      action: "blocked",
      effect:
        "这是共享池本体，Codex 原生读取；在这里停用会影响所有读取或链接共享池的 Agent。请改为在各 Agent 的 skills 目录里取消对应链接。",
      authorization: AUTHORIZATION,
    };
  if (item.source === "broken")
    return {
      action: "none",
      effect:
        "失效链接指向的内容已不存在，没有可停用的内容；清理失效链接属于体检修复，需单独授权。",
      authorization: AUTHORIZATION,
    };
  if (item.source === "unreadable")
    return {
      action: "none",
      effect: "无法读取此条目，不生成停用计划。",
      authorization: AUTHORIZATION,
    };
  if (item.source === "pool" || item.source === "link")
    return {
      action: "move",
      from: item.path,
      to,
      effect: `只移动链接本身到停用区，链接指向的 ${item.target} 内容不变。`,
      restore,
      authorization: AUTHORIZATION,
    };
  return {
    action: "move",
    from: item.path,
    to,
    effect:
      "整个目录移到停用区，目录内容不变；Agent 下次启动时不再从 skills 目录发现它。",
    restore,
    authorization: AUTHORIZATION,
  };
}

async function classifySkill(fs, { path, name, root, pool, native }) {
  const item = { id: digest(path).slice(0, 24), name, path, root };
  if (native) item.native = true;
  let info;
  try {
    info = await fs.lstat(path);
  } catch (error) {
    return { ...item, source: "unreadable", reason: reasonOf(error) };
  }
  let resolved = path;
  if (info.isSymbolicLink()) {
    try {
      item.target = resolve(dirname(path), await fs.readlink(path));
      resolved = await fs.realpath(path);
    } catch (error) {
      if (["ENOENT", "ENOTDIR", "ELOOP"].includes(error.code))
        return { ...item, source: "broken", reason: "链接目标不存在" };
      return { ...item, source: "unreadable", reason: reasonOf(error) };
    }
    let poolReal = null;
    try {
      poolReal = await fs.realpath(pool);
    } catch {
      /* 共享池不存在时，任何链接都不是池链接。 */
    }
    item.source =
      poolReal && within(poolReal, resolved) && resolved !== poolReal
        ? "pool"
        : "link";
  } else if (info.isDirectory()) item.source = native ? "pool" : "copy";
  else return null;
  try {
    await fs.access(resolved, constants.R_OK | constants.X_OK);
    const entry = await fs.lstat(join(resolved, "SKILL.md"));
    if (!entry.isFile()) throw Object.assign(new Error(), { code: "ENOENT" });
  } catch (error) {
    if (denied(error))
      return { ...item, source: "unreadable", reason: "没有读取权限" };
    return { ...item, entry: false, reason: "目录里没有 SKILL.md 入口" };
  }
  // 外部链接：目标在已知 Skill 目录之外，不读取其内容。
  if (item.source === "link") return item;
  const roots = native ? [pool] : item.source === "pool" ? [root, pool] : [root];
  try {
    const local = await readLocalSkill(roots, path);
    item.fingerprint = local.fingerprint;
    item.location = local.location;
    item.store = { roots, name };
  } catch (error) {
    item.readError = error.message || "无法读取完整包";
  }
  return item;
}

async function readSkills(fs, def, homePath, pool) {
  const roots = [{ path: join(homePath, "skills"), native: false }];
  if (def.nativePool) roots.push({ path: pool, native: true });
  const items = [],
    errors = [];
  let status = "missing",
    truncated = false;
  for (const { path: root, native } of roots) {
    const listing = await listDirectory(fs, root, SKILL_LIMIT);
    if (listing.status === "ok") status = "ok";
    else if (!native || status !== "ok") {
      if (status !== "ok" && listing.status !== "missing")
        status = listing.status;
      errors.push({ path: root, status: listing.status, reason: listing.reason });
    }
    truncated ||= !!listing.truncated;
    for (const name of listing.entries) {
      const item = await classifySkill(fs, {
        path: join(root, name),
        name,
        root,
        pool,
        native,
      });
      if (!item) continue;
      item.toggle = togglePlan(item, join(homePath, "skills.disabled"));
      if (!item.store) item.store = null;
      items.push(item);
    }
  }
  const primary = errors.find((e) => e.path === roots[0].path);
  return {
    status,
    ...(status !== "ok" && primary ? { reason: primary.reason } : {}),
    root: roots[0].path,
    errors,
    items,
    truncated,
  };
}

export async function readAgentContents(
  agentId,
  { home = homedir(), filesystem: fs = filesystem } = {},
) {
  const def = CONTENT_AGENTS.find((a) => a.id === agentId);
  if (!def) throw failure("此 Agent 暂不支持内容清单");
  const homePath = join(home, def.home),
    pool = join(home, ".agents", "skills"),
    at = new Date().toISOString();
  const homeListing = await listDirectory(fs, homePath, 0);
  const mcp = { status: "not_read", reason: def.mcp, items: [] };
  if (homeListing.status !== "ok") {
    const reason =
      homeListing.status === "missing" ? "Home 目录不存在" : homeListing.reason;
    const empty = { status: homeListing.status, reason, items: [] };
    return {
      agentId,
      name: def.name,
      at,
      home: { path: homePath, status: homeListing.status, reason },
      groups: { skills: { ...empty }, configs: { ...empty }, plugins: { ...empty }, mcp },
      truncated: false,
    };
  }
  const skills = await readSkills(fs, def, homePath, pool);
  const configs = { status: "ok", items: [] };
  for (const name of def.configs) {
    const path = join(homePath, name);
    try {
      const info = await fs.lstat(path);
      configs.items.push(
        info.isSymbolicLink()
          ? { name, path, status: "blocked", reason: "符号链接，未跟随" }
          : {
              name,
              path,
              status: info.isFile() ? "present" : "blocked",
              ...(info.isFile()
                ? { bytes: info.size, modifiedAt: info.mtime.toISOString() }
                : { reason: "不是普通文件" }),
            },
      );
    } catch (error) {
      configs.items.push(
        error.code === "ENOENT"
          ? { name, path, status: "missing" }
          : { name, path, status: "unreadable", reason: reasonOf(error) },
      );
    }
  }
  const pluginRoot = join(homePath, def.plugins),
    pluginListing = await listDirectory(fs, pluginRoot, PLUGIN_LIMIT);
  const plugins = {
    status: pluginListing.status,
    ...(pluginListing.reason ? { reason: pluginListing.reason } : {}),
    root: pluginRoot,
    truncated: !!pluginListing.truncated,
    items: [],
  };
  for (const name of pluginListing.entries) {
    const path = join(pluginRoot, name);
    let kind = "unknown";
    try {
      const info = await fs.lstat(path);
      kind = info.isSymbolicLink()
        ? "link"
        : info.isDirectory()
          ? "directory"
          : "file";
    } catch {
      /* 保留条目，类型未知。 */
    }
    plugins.items.push({
      id: digest(path).slice(0, 24),
      name,
      path,
      kind,
      toggle: {
        action: "none",
        effect:
          "插件的启用状态由 Agent 自身配置管理，改动属于配置写入；本清单只展示，不生成移动计划。",
        authorization: AUTHORIZATION,
      },
    });
  }
  return {
    agentId,
    name: def.name,
    at,
    home: { path: homePath, status: "present" },
    groups: { skills, configs, plugins, mcp },
    truncated: skills.truncated || plugins.truncated,
  };
}

// 与资产仓库比对：同内容（当前版本）> 旧版本 > 有来源关系但内容不同 > 未收录。名称相同不算同内容。
export function annotateAgentContents(result, state, verifiedFingerprints=new Map()) {
  const assets = (state?.assets || []).filter(
    (a) => a.type === "Skill" && !a.archived,
  );
  const prints = new Map();
  const printOf = (version) => {
    if (!prints.has(version)) {
      let value = null;
      try {
        value = version.mediaManifest?.length ? verifiedFingerprints.get(version.id)||null : skillFingerprint(version.files || []);
      } catch {
        /* 无法计算的版本不参与比对。 */
      }
      prints.set(version, value);
    }
    return prints.get(version);
  };
  const copies = state?.connections?.skillCopies || [];
  function match(item) {
    if (!item.fingerprint) return { status: "unknown" };
    const title = (asset) => current(asset).title;
    for (const asset of assets)
      if (printOf(current(asset)) === item.fingerprint)
        return { status: "same", assetId: asset.id, assetTitle: title(asset) };
    for (const asset of assets) {
      const index = asset.versions.findIndex(
        (v) => printOf(v) === item.fingerprint,
      );
      if (index >= 0)
        return {
          status: "older",
          assetId: asset.id,
          assetTitle: title(asset),
          versionNumber: index + 1,
          currentNumber: asset.versions.length,
        };
    }
    const locations = new Set([item.location, item.path].filter(Boolean));
    const related =
      assets.find((a) => locations.has(a.origin?.location)) ||
      assets.find((a) =>
        copies.some((c) => c.assetId === a.id && locations.has(c.location)),
      );
    if (related)
      return { status: current(related).mediaManifest?.length && !printOf(current(related)) ? "unknown" : "drift", assetId: related.id, assetTitle: title(related) };
    return { status: "none" };
  }
  const skills = {
    ...result.groups.skills,
    items: (result.groups.skills.items || []).map((item) => ({
      ...item,
      match: match(item),
    })),
  };
  const groups = { ...result.groups, skills };
  const health = {
    brokenLinks: skills.items.filter((i) => i.source === "broken").length,
    drift: skills.items.filter((i) =>
      ["older", "drift"].includes(i.match.status),
    ).length,
    unreadable:
      skills.items.filter((i) => i.source === "unreadable" || i.readError)
        .length +
      (result.home.status === "present"
        ? ["skills", "configs", "plugins"].filter((key) =>
            ["unreadable", "blocked"].includes(groups[key].status),
          ).length
        : ["unreadable", "blocked"].includes(result.home.status)
          ? 1
          : 0),
  };
  return { ...result, groups, health };
}

export function createAgentContents(repository, adapters) {
  return {
    async inspect(input) {
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).length !== 1 ||
        !CONTENT_AGENTS.some((a) => a.id === input.agentId)
      )
        throw failure("请选择支持内容清单的 Agent；不接受自定义扫描范围");
      const raw = await adapters.readAgentContents(input.agentId);
      return annotateAgentContents(raw, await repository.read());
    },
  };
}

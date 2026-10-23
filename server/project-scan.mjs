import { createStableIdentityReader } from "./directory-identity.mjs";
import * as fs from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { digest, failure } from "./repository.mjs";

import { readGitUpdate } from "./project-update.mjs";
const exec = promisify(execFile);
export function githubKey(url) {
  if (typeof url !== "string") return "";
  const match = url.match(
    /^(?:git@github\.com:|https:\/\/(?:[^/@]+@)?github\.com\/|ssh:\/\/git@github\.com\/)([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?\/?$/,
  );
  return match ? match[1].toLowerCase() : "";
}

async function gitMetadata(path) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
  const options = {
    timeout: 2500,
    maxBuffer: 10000,
    env: {
      ...env,
      GIT_OPTIONAL_LOCKS: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
    },
  };
  let repoKey = "",
    branch = "",
    message;
  try {
    const { stdout } = await exec(
      "/usr/bin/git",
      ["-C", path, "config", "--local", "--get", "remote.origin.url"],
      options,
    );
    repoKey = githubKey(stdout.trim());
  } catch (error) {
    if (error.code !== 1) {
      repoKey = undefined;
      message = "Git 远端读取失败，保留上次关联";
    }
  }
  try {
    const { stdout } = await exec(
      "/usr/bin/git",
      ["-C", path, "symbolic-ref", "--quiet", "--short", "HEAD"],
      options,
    );
    branch = stdout.trim().slice(0, 150);
  } catch {}
  return {
    ...(repoKey === undefined ? {} : { repoKey }),
    branch,
    ...(message ? { message } : {}),
  };
}

const MARKERS = [
  ["package.json", "Node"],
  ["pyproject.toml", "Python"],
  ["Cargo.toml", "Rust"],
  ["go.mod", "Go"],
  ["CONTEXT.md", "文档"],
  ["CURRENT.md", "文档"],
];
const SKIP = new Set([
  "node_modules",
  "dist",
  "build",
  "target",
  "vendor",
  "outputs",
  "backups",
  "audit",
  "audits",
  "test-results",
  "tests",
  "fixtures",
  "tmp",
  "cache",
  "conversation-archives",
  "recovery-snapshots",
  "past-ui-screenshots",
]);
const excluded = (name) =>
  name.startsWith(".") || SKIP.has(name) || name.endsWith(".app");
const within = (root, path) => path === root || path.startsWith(`${root}/`);
function absolutePath(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.length > 2000 ||
    value.includes("\0")
  )
    throw failure("项目目录需要绝对路径");
  return resolve(value);
}
function validateRoots(roots) {
  if (!Array.isArray(roots) || roots.length > 12)
    throw failure("最多设置 12 个项目目录");
  return [
    ...new Set(
      roots.map((value) => {
        const path = absolutePath(value);
        if (
          [
            homedir(),
            "/",
            "/Users",
            "/Volumes",
            "/System",
            "/Library",
          ].includes(path)
        )
          throw failure("请选择具体项目目录，不扫描整块磁盘或整个用户目录");
        return path;
      }),
    ),
  ];
}
function scopedRoot(roots, path) {
  // The outermost approved root prevents overlapping roots from bypassing exclusions.
  const root = roots
    .filter((value) => within(value, path))
    .sort((a, b) => a.length - b.length)[0];
  if (!root || relative(root, path).split("/").filter(Boolean).some(excluded))
    return undefined;
  return root;
}
const statusRow = (path, status, message) => ({
  path,
  status,
  checkedAt: new Date().toISOString(),
  message,
});
const directoryIdentity = (info) =>
  digest(JSON.stringify([info.dev, info.ino, info.birthtimeMs]));

async function observe(root, path, filesystem, update, stable) {
  if (!root)
    return {
      entries: [],
      observation: statusRow(path, "out_of_scope", "不在有效扫描范围内"),
    };
  try {
    return await observeDirectory(root, path, filesystem, update, stable);
  } catch (error) {
    return {
      entries: [],
      observation: {
        path,
        status: ["ENOENT", "ENOTDIR"].includes(error.code)
          ? "missing"
          : "unknown",
        checkedAt: new Date().toISOString(),
        message:
          error.code === "ESTALE"
            ? "检查期间目录发生变化，请重新扫描"
            : ["ENOENT", "ENOTDIR"].includes(error.code)
              ? "目录不存在"
              : "目录无法核实",
      },
    };
  }
}

async function directoryChain(root, path, filesystem) {
  const chain = [];
  let current = root;
  for (const component of [
    "",
    ...relative(root, path).split("/").filter(Boolean),
  ]) {
    current = join(current, component);
    const info = await filesystem.lstat(current);
    if (info.isSymbolicLink()) throw new Error("目录无法核实");
    if (!info.isDirectory()) {
      // Obtain an actual ENOTDIR rather than inferring absence from a stat type.
      await filesystem.readdir(current, { withFileTypes: true });
      throw new Error("目录无法核实");
    }
    chain.push([
      current,
      directoryIdentity(info),
      ...(current === root ? [await filesystem.realpath(root)] : []),
    ]);
  }
  return chain;
}

async function observeDirectory(root, path, filesystem, update, stable) {
  const chain = await directoryChain(root, path, filesystem);
  const entries = await filesystem.readdir(path, { withFileTypes: true });
  const marker = MARKERS.find(([name]) =>
    entries.some((entry) => entry.name === name && entry.isFile()),
  );
  const gitEntry = entries.find((entry) => entry.name === ".git");
  const git = gitEntry && (gitEntry.isFile() || gitEntry.isDirectory());
  const blockedGit = gitEntry && !git;
  const metadata = blockedGit
    ? { branch: "", message: "Git 标记不是普通文件或真实目录，远端未核实" }
    : git
      ? await gitMetadata(path)
      : { repoKey: "", branch: "" };
  const signature = digest(JSON.stringify(chain));
  let recentUpdate;
  if (update) {
    if (git && !blockedGit) {
      const canonical = await filesystem.realpath(path);
      const within = relative(chain[0][2], canonical);
      if (isAbsolute(within) || within === ".." || within.startsWith("../") ||
          digest(JSON.stringify(await directoryChain(root, path, filesystem))) !== signature)
        throw Object.assign(new Error("目录发生变化"), { code: "ESTALE" });
      recentUpdate = await update(canonical);
    } else recentUpdate = {state:"unknown",source:"Git",checkedAt:new Date().toISOString(),reason:"目录不是可读取的Git仓库"};
  }
  const identity = await stable(path);
  const canonicalPath = await filesystem.realpath(path);
  try {
    if (
      digest(JSON.stringify(await directoryChain(root, path, filesystem))) !==
      signature
    )
      throw new Error("changed");
  } catch {
    throw Object.assign(new Error("目录发生变化"), { code: "ESTALE" });
  }
  return {
    entries,
    observation: {
      path,
      status:
        git || marker ? "present" : blockedGit ? "unknown" : "unrecognized",
      checkedAt: new Date().toISOString(),
      ...identity,
      canonicalPath,
      ...(recentUpdate ? {recentUpdate} : {}),
      scopeSignature: signature,
      ...(git || marker
        ? { ...metadata, kind: git ? "Git" : marker[1] }
        : blockedGit
          ? { message: metadata.message }
          : {}),
    },
  };
}

export async function inspectProjectLocation(
  roots,
  path,
  { filesystem = fs, volumeUuid } = {},
) {
  path = absolutePath(path);
  const root = scopedRoot(validateRoots(roots), path);
  return (await observe(root, path, filesystem, undefined, createStableIdentityReader({ filesystem, volumeUuid }))).observation;
}

export async function scanLocalProjects(
  roots,
  {
    knownPaths = [],
    excludePaths = [],
    maxDirectories = 5000,
    maxDepth = 6,
    filesystem = fs,
    runGit,
    volumeUuid,
    maxUpdateReads = 500,
  } = {},
) {
  if (!Number.isSafeInteger(maxUpdateReads) || maxUpdateReads < 0 || maxUpdateReads > 500) throw failure("时间读取预算无效");
  const stable = createStableIdentityReader({ filesystem, volumeUuid });
  let updateReads=0;
  const normalizedRoots = validateRoots(roots);
  if (
    !Number.isSafeInteger(maxDirectories) ||
    maxDirectories < 0 ||
    maxDirectories > 5000 ||
    !Number.isSafeInteger(maxDepth) ||
    maxDepth < 0 ||
    maxDepth > 32
  )
    throw failure("扫描预算或深度无效");
  if (!Array.isArray(knownPaths) || knownPaths.length > 10000)
    throw failure("已知目录列表无效");
  const normalizedKnownPaths = [...new Set(knownPaths.map(absolutePath))];
  if (!Array.isArray(excludePaths) || excludePaths.length > 1000) throw failure("排除目录列表无效");
  const exclusions = [...new Set(excludePaths.map(absolutePath))];
  const isExcluded = path => exclusions.some(parent => within(parent, path));
  const items = [],
    locations = [],
    errors = [];
  const probed = new Map(), expanded = new Map(), identities = new Set();
  const pathIdentities = new Map(), expandedIdentities = new Map(), canonicalPaths = new Map(), expandedCanonical = new Set();
  const depthBlocked = new Map(), directoryBlocked = new Set(), gitBlocked = new Set();
  let visited = 0, knownChecked = 0;
  async function probe(root, path) {
    if (probed.has(path)) return probed.get(path);
    if (!root || isExcluded(path)) {
      locations.push(statusRow(path, "out_of_scope", isExcluded(path) ? "已排除的派生目录" : "不在有效扫描范围内"));
      probed.set(path, []);
      return [];
    }
    if (visited >= maxDirectories) {
      directoryBlocked.add(path);
      if (!locations.some(l => l.path === path)) locations.push(statusRow(path, "unknown", "扫描预算已用尽，尚未核实"));
      return [];
    }
    visited++;
    const { observation, entries } = await observe(root, path, filesystem, async target => {
      if (updateReads >= maxUpdateReads) {gitBlocked.add(path);return {state:"unknown",source:"Git",checkedAt:new Date().toISOString(),reason:"时间读取预算已用尽，结果不完整"};}
      updateReads++;return readGitUpdate(target, {run:runGit});
    }, stable);
    probed.set(path, entries);
    if (observation.identity) pathIdentities.set(path, observation.identity);
    if (observation.canonicalPath) canonicalPaths.set(path, observation.canonicalPath);
    locations.push(observation);
    if (observation.message) errors.push(`${path}：${observation.message}`);
    if (observation.status === "present" && !identities.has(observation.identity)) {
      items.push({
        id: `local-${digest(path).slice(0, 24)}`,
        name: basename(path), localPaths: [path],
        ...(observation.repoKey === undefined ? {} : { repoKey: observation.repoKey }),
        kind: observation.kind, branch: observation.branch,
        localSeenAt: observation.checkedAt, recentUpdate: observation.recentUpdate,
      });
    }
    if (observation.identity) identities.add(observation.identity);
    return entries;
  }
  async function walk(root, path, depth) {
    if (!root || isExcluded(path)) return;
    if (expanded.has(path) && expanded.get(path) <= depth) return;
    const entries = await probe(root, path);
    if (!probed.has(path)) return;
    const identity = pathIdentities.get(path);
    if (identity && expandedIdentities.has(identity) && expandedIdentities.get(identity) <= depth) return;
    expanded.set(path, depth);
    if (identity) expandedIdentities.set(identity, depth);
    if (canonicalPaths.has(path)) expandedCanonical.add(canonicalPaths.get(path));
    const children = entries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && !excluded(entry.name) && !isExcluded(join(path, entry.name)));
    if (depth >= maxDepth) {
      for (const child of children) depthBlocked.set(join(path, child.name), join(canonicalPaths.get(path) || path, child.name));
      return;
    }
    for (const entry of children) {
      const child = join(path, entry.name);
      if (visited >= maxDirectories && !probed.has(child)) {
        directoryBlocked.add(child);
        continue;
      }
      await walk(root, child, depth + 1);
    }
  }
  // Known registrations share the same budget but receive it first. Reuse their
  // entries in the broad walk, so real nested projects remain discoverable.
  for (const path of normalizedKnownPaths) {
    const before = visited;
    await probe(scopedRoot(normalizedRoots, path), path);
    if (visited > before) knownChecked++;
  }
  for (const path of normalizedRoots) await walk(scopedRoot(normalizedRoots, path), path, 0);
  const reasons = [];
  const addReason = (code, limit, used, paths) => {
    if (paths.length) reasons.push({ code, limit, used, samples: paths.slice(0, 5) });
  };
  addReason('directory_budget', maxDirectories, visited, [...directoryBlocked].filter(p => !probed.has(p)));
  addReason('depth', maxDepth, maxDepth, [...depthBlocked].filter(([p, canonical]) => !expanded.has(p) && !expandedCanonical.has(canonical)).map(([p]) => p));
  addReason('git_time_budget', maxUpdateReads, updateReads, [...gitBlocked]);
  const diagnostics = { visited, knownRequested: normalizedKnownPaths.length, knownChecked, gitReads: updateReads, maxDirectories, maxDepth, maxUpdateReads, reasons };
  const truncated = reasons.length > 0;
  return {
    items,
    errors,
    locations,
    visited,
    truncated,
    diagnostics,
    at: new Date().toISOString(),
  };
}

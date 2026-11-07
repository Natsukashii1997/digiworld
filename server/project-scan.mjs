import { createStableIdentityReader } from "./directory-identity.mjs";
import * as fs from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { digest, failure } from "./repository.mjs";

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

async function observe(root, path, filesystem, stable) {
  if (!root)
    return {
      entries: [],
      observation: statusRow(path, "out_of_scope", "不在有效扫描范围内"),
    };
  try {
    return await observeDirectory(root, path, filesystem, stable);
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

async function observeDirectory(root, path, filesystem, stable) {
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
  return (await observe(root, path, filesystem, createStableIdentityReader({ filesystem, volumeUuid }))).observation;
}

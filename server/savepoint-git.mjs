import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  lstat,
  open,
  readFile,
  readdir,
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import { digest, failure } from "./repository.mjs";
import {
  sensitivePaths,
  readCurrentFile,
  parseCurrentStatus,
} from "./project-status.mjs";
import { filterRelayText } from "../src/relay-prompt.js";
const exec = promisify(execFile);
export const DEFAULT_IGNORE =
  "node_modules/\n.env\n.env.*\n!.env.example\n.DS_Store\ndist/\nbuild/\ncoverage/\n*.log\n";
export const safePath = (p) =>
  typeof p === "string" &&
  p.length <= 1000 &&
  !/[\\\x00-\x1f\x7f]/.test(p) &&
  !isAbsolute(p) &&
  p.split("/").every((x) => x && x !== "." && x !== ".." && x !== ".git");
const HASH = /^[a-f0-9]{40}$/;
const COMMON = [
  "--literal-pathspecs",
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "commit.gpgSign=false",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "gc.auto=0",
  "-c",
  "maintenance.auto=false",
  "-c",
  "diff.external=",
  "-c",
  "core.pager=cat",
  "-c",
  "core.quotepath=false",
  "-c",
  "log.showSignature=false",
];
// Only internal exact command shapes cross the process boundary. No shell, no user command API.
// 未推送提交数（存档点与项目空间共用）：没有上游或读取失败时返回 null，界面显示“—”，不当成 0。
export async function unpushedCount(run) {
  try {
    const n = Number((await run(["rev-list", "--count", "@{upstream}..HEAD"])).trim());
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

export function savepointGitArgs(args) {
  const n = (s) => /^\d{1,6}$/.test(s),
    pathTail = (i) => args.length > i && args.slice(i).every(safePath);
  const ok =
    Array.isArray(args) &&
    args.every((x) => typeof x === "string" && !/[\x00-\x1f\x7f]/.test(x)) &&
    (JSON.stringify(args) ===
      '["status","--porcelain=v1","-z","--untracked-files=all","--no-renames"]' ||
      JSON.stringify(args) === '["rev-parse","--show-toplevel"]' ||
      JSON.stringify(args) === '["rev-parse","--verify","HEAD"]' ||
      JSON.stringify(args) === '["symbolic-ref","--quiet","HEAD"]' ||
      JSON.stringify(args) === '["rev-list","--count","HEAD"]' ||
      JSON.stringify(args) === '["rev-list","--count","@{upstream}..HEAD"]' ||
      JSON.stringify(args) === '["rev-list","@{upstream}..HEAD"]' ||
      JSON.stringify(args) === '["ls-files","--stage","-z"]' ||
      JSON.stringify(args) ===
        '["ls-files","--others","--exclude-standard","-z"]' ||
      (args.length === 3 &&
        args[0] === "config" &&
        args[1] === "--get-regexp" &&
        args[2] ===
          "^(filter\\.|include|core\\.worktree|core\\.sshcommand|diff\\..*(command|textconv)|extensions\\.)") ||
      JSON.stringify(args) === '["var","GIT_AUTHOR_IDENT"]' ||
      (args.length === 3 &&
        args[0] === "for-each-ref" &&
        args[1] ===
          "--format=%(objectname)%09%(*objectname)%09%(refname:short)" &&
        args[2] === "refs/tags") ||
      (args[0] === "log" &&
        args.length === 5 &&
        n(args[1]?.replace("--skip=", "")) &&
        n(args[2]?.replace("--max-count=", "")) &&
        args[3] === "--format=%H%x00%P%x00%cI%x00%s%x00" &&
        args[4] === "HEAD") ||
      (args[0] === "show" &&
        args.length === 4 &&
        args[1] === "--format=%H%x00%P%x00%cI%x00%s%x00" &&
        args[2] === "--no-patch" &&
        HASH.test(args[3])) ||
      (args[0] === "show" &&
        args.length === 9 &&
        args[1] === "--format=" &&
        args[2] === "--numstat" &&
        args[3] === "--no-renames" &&
        args[4] === "--root" &&
        args[5] === "--no-ext-diff" &&
        args[6] === "--no-textconv" &&
        args[7] === "-z" &&
        HASH.test(args[8])) ||
      (args[0] === "diff" &&
        args[1] === "--no-ext-diff" &&
        args[2] === "--no-textconv" &&
        args[3] === "--no-renames" &&
        ((args.length === 7 &&
          args[4] === "--numstat" &&
          args[5] === "-z" &&
          HASH.test(args[6])) ||
          (args.length === 7 &&
            args[4] === "--unified=3" &&
            HASH.test(args[5]) &&
            args[6] === "--"))) ||
      (args[0] === "diff-tree" &&
        args.length === 8 &&
        args[1] === "--name-status" &&
        args[2] === "-z" &&
        args[3] === "--no-renames" &&
        args[4] === "--root" &&
        args[5] === "--no-commit-id" &&
        args[6] === "-r" &&
        HASH.test(args[7])) ||
      (args[0] === "ls-tree" &&
        args.length === 5 &&
        args[1] === "-z" &&
        args[2] === "-r" &&
        HASH.test(args[3]) &&
        args[4] === "--") ||
      (args[0] === "hash-object" &&
        args.length === 3 &&
        args[1].startsWith("--path=") &&
        safePath(args[1].slice(7)) &&
        args[2] === "--stdin") ||
      (args[0] === "add" &&
        args[1] === "-A" &&
        args[2] === "--" &&
        pathTail(3)) ||
      (args[0] === "commit" &&
        args[1] === "--only" &&
        args[2] === "--no-gpg-sign" &&
        args[3] === "-m" &&
        args[4].length <= 300 &&
        args[5] === "--" &&
        pathTail(6)) ||
      (args[0] === "init" &&
        JSON.stringify(args) ===
          '["init","--template=","--initial-branch=main"]'));
  if (!ok) throw failure("Git 命令不在存档点白名单内，未启动", 403);
  return args;
}
export function createSavepointGit({
  identity = [],
  timeout = 15000,
  globalConfig,
} = {}) {
  return async (root, args, { input, gitDir, workTree } = {}) => {
    savepointGitArgs(args);
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([k]) =>
          !k.startsWith("GIT_") && !["SSH_ASKPASS", "GIT_ASKPASS"].includes(k),
      ),
    );
    Object.assign(env, {
      GIT_TERMINAL_PROMPT: "0",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_PAGER: "cat",
      LC_ALL: "C",
    });
    if (globalConfig) env.GIT_CONFIG_GLOBAL = globalConfig;
    if (gitDir) {
      env.GIT_DIR = gitDir;
      env.GIT_WORK_TREE = workTree;
      env.GIT_CONFIG_GLOBAL = "/dev/null";
    }
    const child = exec("/usr/bin/git", [...COMMON, ...identity, ...args], {
      cwd: root,
      env,
      timeout,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (input !== undefined) child.child.stdin.end(input);
    try {
      return (await child).stdout;
    } catch (e) {
      throw Object.assign(
        failure("Git 读取或执行未完成，请查询结果并保留当前目录状态", 503),
        { gitCode: e.code },
      );
    }
  };
}
// A growing file can never make the preflight read beyond the declared bound.
function countLines(bytes) {
  let n = bytes.length && bytes[bytes.length - 1] !== 10 ? 1 : 0;
  for (const b of bytes) if (b === 10) n++;
  return n;
}
export async function readBoundedHandle(file, limit) {
  const chunks = [];
  let length = 0;
  while (length <= limit) {
    const buffer = Buffer.alloc(Math.min(65536, limit + 1 - length));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
    if (!bytesRead) return Buffer.concat(chunks, length);
    length += bytesRead;
    if (length > limit) throw failure("文件超过安全读取上限", 409);
    chunks.push(buffer.subarray(0, bytesRead));
  }
}
export async function candidateFile(root, path) {
  if (!safePath(path)) throw failure("文件路径无效");
  let target = root;
  const chain = [];
  for (const part of path.split("/").slice(0, -1)) {
    target = join(target, part);
    let s;
    try {
      s = await lstat(target);
    } catch (e) {
      if (e.code === "ENOENT")
        return {
          fingerprint: digest(JSON.stringify([chain, "missing", part])),
          deleted: true,
          bytes: 0,
        };
      throw e;
    }
    if (!s.isDirectory() || s.isSymbolicLink())
      throw failure("文件目录包含链接或已变化");
    chain.push([s.dev, s.ino, s.birthtimeMs]);
  }
  target = join(root, path);
  let s;
  try {
    s = await lstat(target);
  } catch (e) {
    if (e.code === "ENOENT")
      return {
        fingerprint: digest(JSON.stringify(chain)),
        deleted: true,
        bytes: 0,
      };
    throw e;
  }
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1)
    return {
      blocked: "链接或特殊文件",
      fingerprint: digest(JSON.stringify([chain, s.dev, s.ino, s.mode])),
      bytes: s.size,
    };
  if (s.size > 50 * 1024 * 1024)
    return {
      blocked: "超过50 MB",
      large: true,
      fingerprint: digest(
        JSON.stringify([chain, s.dev, s.ino, s.size, s.mtimeMs]),
      ),
      bytes: s.size,
    };
  const f = await open(
    target,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const before = await f.stat();
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.ino !== s.ino ||
      before.dev !== s.dev ||
      before.size !== s.size ||
      before.size > 50 * 1024 * 1024
    )
      throw failure("文件身份已变化", 409);
    const bytes = await readBoundedHandle(f, 50 * 1024 * 1024);
    const after = await f.stat(),
      live = await lstat(target);
    if (
      bytes.length > 50 * 1024 * 1024 ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      live.ino !== before.ino ||
      live.dev !== before.dev
    )
      throw failure("文件在预检期间变化", 409);
    let parent = root;
    for (const [i, part] of path.split("/").slice(0, -1).entries()) {
      parent = join(parent, part);
      const now = await lstat(parent);
      if (
        !now.isDirectory() ||
        now.isSymbolicLink() ||
        JSON.stringify([now.dev, now.ino, now.birthtimeMs]) !==
          JSON.stringify(chain[i])
      )
        throw failure("文件父目录在预检期间变化", 409);
    }
    const binary = bytes.includes(0);
    const text = binary ? "" : bytes.toString("utf8");
    const secret = !binary && filterRelayText(text).count > 0;
    return {
      mode: s.mode & 0o111 ? "100755" : "100644",
      fingerprint: digest(
        JSON.stringify([
          chain,
          s.dev,
          s.ino,
          s.birthtimeMs,
          s.mode,
          digest(bytes),
        ]),
      ),
      bytes: s.size,
      binary,
      blocked: secret ? "正文疑似凭据" : null,
      warning: sensitivePaths([path]).length ? "文件名疑似凭据" : null,
      added: binary
        ? null
        : text
          ? countLines(bytes)
          : 0,
      content: bytes,
    };
  } finally {
    await f.close();
  }
}
export function parseNumstat(text) {
  return text
    .split(text.includes("\0") ? "\0" : "\n")
    .filter(Boolean)
    .map((line) => {
      const [a, d, ...name] = line.split("\t");
      return {
        path: name.join("\t"),
        added: a === "-" ? null : Number(a),
        deleted: d === "-" ? null : Number(d),
      };
    });
}
export function parseCommits(text) {
  const tokens = text.split("\0"),
    rows = [];
  for (let i = 0; i + 3 < tokens.length; i += 4) {
    const hash = tokens[i].trim();
    if (!HASH.test(hash)) continue;
    rows.push({
      hash,
      parents: tokens[i + 1].split(" ").filter(Boolean),
      at: tokens[i + 2],
      message: filterRelayText(tokens[i + 3]).text,
      stateId: tokens[i + 3].match(/WB-\d{8}-\d+/)?.[0] || null,
      tags: [],
    });
  }
  return rows;
}
export async function repositorySafety(root, run) {
  let git;
  try {
    git = await lstat(join(root, ".git"));
  } catch (e) {
    if (e.code === "ENOENT") {
      try {
        await run(root, ["rev-parse", "--show-toplevel"]);
        return {
          state: "nogit",
          reason: "当前目录属于父级仓库，不能在此开启存档",
        };
      } catch {
        let cfg = "";
        try {
          cfg = await run(root, [
            "config",
            "--get-regexp",
            "^(filter\\.|include|core\\.worktree|core\\.sshcommand|diff\\..*(command|textconv)|extensions\\.)",
          ]);
        } catch (e) {
          if (e.gitCode !== 1) throw e;
        }
        return {
          state: "nogit",
          reason: cfg ? "Git过滤器、LFS或外部配置，仅只读" : null,
        };
      }
    }
    throw e;
  }
  if (!git.isDirectory() || git.isSymbolicLink())
    return { state: "repo", reason: "linked worktree或外部Git目录仅只读" };
  const stamp = [git.dev, git.ino, git.birthtimeMs];
  const queue = [join(root, ".git")];
  let visited = 0;
  while (queue.length) {
    const path = queue.pop();
    const st = await lstat(path);
    if (++visited > 20000)
      return { state: "repo", reason: "Git元数据检查达到上限，仅只读" };
    if (
      st.isSymbolicLink() ||
      (!st.isDirectory() && (!st.isFile() || st.nlink !== 1))
    )
      return { state: "repo", reason: "Git元数据含链接或特殊文件，仅只读" };
    if (st.isDirectory())
      for (const name of await readdir(path)) queue.push(join(path, name));
  }
  for (const name of [
    "config",
    "HEAD",
    "index",
    "objects",
    "objects/info/alternates",
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "rebase-apply",
    "rebase-merge",
    "BISECT_LOG",
  ]) {
    try {
      const s = await lstat(join(root, ".git", name));
      if (s.isSymbolicLink())
        return { state: "repo", reason: "Git内部路径含链接，仅只读" };
      if (
        [
          "MERGE_HEAD",
          "CHERRY_PICK_HEAD",
          "REVERT_HEAD",
          "rebase-apply",
          "rebase-merge",
          "BISECT_LOG",
          "objects/info/alternates",
        ].includes(name)
      )
        return { state: "repo", reason: "Git操作中或外部对象库，仅只读" };
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  let cfg = "";
  try {
    cfg = await run(root, [
      "config",
      "--get-regexp",
      "^(filter\\.|include|core\\.worktree|core\\.sshcommand|diff\\..*(command|textconv)|extensions\\.)",
    ]);
  } catch (e) {
    if (e.gitCode !== 1) throw e;
  }
  if (cfg)
    return {
      state: "repo",
      reason: "Git过滤器、LFS、外部配置或工作区重定向，仅只读",
    };
  if ((await run(root, ["rev-parse", "--show-toplevel"])).trim() !== root)
    return { state: "repo", reason: "Git根目录与登记项目不一致" };
  let symbolicRef;
  try {
    symbolicRef = (await run(root, ["symbolic-ref", "--quiet", "HEAD"])).trim();
  } catch {
    return { state: "repo", reason: "HEAD游离，仅只读" };
  }
  const staged = await run(root, ["ls-files", "--stage", "-z"]);
  if (staged.split("\0").some((x) => x.startsWith("160000 ")))
    return { state: "repo", reason: "子模块仅只读" };
  let head = null;
  try {
    head = (await run(root, ["rev-parse", "--verify", "HEAD"])).trim();
  } catch (e) {
    if (e.gitCode !== 128) throw e;
  }
  let indexBytes = "";
  try {
    const f = await open(
      join(root, ".git/index"),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const st = await f.stat();
      if (!st.isFile() || st.nlink !== 1 || st.size > 16 * 1024 * 1024)
        return { state: "repo", reason: "Git索引超限或特殊文件，仅只读" };
      indexBytes = (await readBoundedHandle(f, 16 * 1024 * 1024)).toString("base64");
      const after = await f.stat();
      if (after.size !== st.size || after.mtimeMs !== st.mtimeMs)
        return { state: "repo", reason: "Git索引在读取期间变化，仅只读" };
    } finally {
      await f.close();
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  return {
    state: "repo",
    head,
    symbolicRef,
    stamp: digest(JSON.stringify(stamp)),
    index: digest(indexBytes),
    staged,
  };
}
export async function inspectGit(root, run) {
  const safety = await repositorySafety(root, run);
  if (safety.reason) return { ...safety, files: [], stats: null };
  let raw;
  if (safety.state === "nogit") {
    const temp = await mkdtemp(join(tmpdir(), "guiji-savepoint-index-"));
    try {
      await run(temp, ["init", "--template=", "--initial-branch=main"]);
      try {
        await lstat(join(root, ".gitignore"));
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
        await mkdir(join(temp, ".git/info"), { recursive: true });
        await writeFile(join(temp, ".git/info/exclude"), DEFAULT_IGNORE);
      }
      raw =
        (
          await run(
            root,
            ["ls-files", "--others", "--exclude-standard", "-z"],
            { gitDir: join(temp, ".git"), workTree: root },
          )
        )
          .split("\0")
          .filter(Boolean)
          .map((p) => "?? " + p)
          .join("\0") + "\0";
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  } else
    raw = await run(root, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--no-renames",
    ]);
  const entries = raw.split("\0").filter(Boolean);
  if (entries.length > 1000)
    return {
      ...safety,
      reason: "文件超过1000项，读取不完整，仅只读",
      files: [],
      stats: null,
    };
  if (entries.some((x) => /^(UU|AA|DD|AU|UA|DU|UD)/.test(x)))
    return { ...safety, reason: "合并冲突中，仅只读", files: [], stats: null };
  const statsBy = new Map();
  if (safety.head)
    for (const f of parseNumstat(
      await run(root, [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-renames",
        "--numstat",
        "-z",
        safety.head,
      ]),
    ))
      statsBy.set(f.path, f);
  const files = [];
  for (const line of entries) {
    const path = line.slice(3);
    if (!safePath(path)) {
      safety.reason = "无法安全表示文件名，仅只读";
      continue;
    }
    const status = line.slice(0, 2),
      kind =
        status === "??"
          ? "A"
          : status.includes("D")
            ? "D"
            : status.includes("A")
              ? "A"
              : "M";
    let f;
    try {
      f = await candidateFile(root, path);
    } catch {
      f = { blocked: "文件预检未完成", fingerprint: "unknown" };
    }
    const stat = statsBy.get(path) || {
      added: kind === "A" ? f.added : 0,
      deleted: 0,
    };
    const { content, ...metadata } = f;
    files.push({
      path,
      status,
      kind,
      ...metadata,
      ...stat,
      selected: !f.blocked && !f.warning,
    });
  }
  if (safety.state === "nogit" && !files.some((f) => f.path === ".gitignore"))
    files.push({
      path: ".gitignore",
      kind: "A",
      status: "??",
      generated: true,
      fingerprint: "generated:" + digest(DEFAULT_IGNORE),
      bytes: Buffer.byteLength(DEFAULT_IGNORE),
      added: DEFAULT_IGNORE.split("\n").length - 1,
      deleted: 0,
      selected: true,
      mode: "100644",
    });
  const stats = {
    modified: files.filter((f) => f.kind === "M").length,
    added: files.filter((f) => f.kind === "A").length,
    deleted: files.filter((f) => f.kind === "D").length,
    insertions: files.reduce((n, f) => n + (f.added || 0), 0),
    deletions: files.reduce((n, f) => n + (f.deleted || 0), 0),
    binary: files.filter((f) => f.added === null || f.deleted === null).length,
  };
  const grouped = new Map();
  for (const f of files) {
    const dir = f.path.includes("/") ? f.path.split("/")[0] + "/" : "根目录";
    grouped.set(dir, (grouped.get(dir) || 0) + 1);
  }
  const directories = [...grouped]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  let current = {};
  try {
    const c = await readCurrentFile(root, "CURRENT.md");
    if (c.state === "read") {
      // A truncated final line is never a complete header field.
      const headText = c.truncated ? c.text.slice(0, c.text.lastIndexOf("\n") + 1) : c.text;
      current = parseCurrentStatus(headText);
      const task = headText
        .match(/^\|\s*当前任务\s*\|\s*([^|]+)\|/m)?.[1]
        ?.trim();
      if (task) current.task = filterRelayText(task).text.slice(0, 150);
    }
  } catch {}
  return {
    ...safety,
    files,
    stats,
    directories,
    current,
    fingerprint: digest(JSON.stringify([safety, files, current])),
  };
}

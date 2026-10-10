// 候选，复制到 server/ 后相对导入有效。只查询已登记项目的本地元数据。
import fs from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join } from "node:path";
import { resolveProjectRoot, gitRunner, noCommits, notRepository } from "./project-status.mjs";
import { failure } from "./repository.mjs";

const key = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const day = (date, offset = 0) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
const identity = (info) => [info.dev, info.ino, info.birthtimeMs].join(":");
function partsOf(path) {
  if (typeof path !== "string" || isAbsolute(path) || /[\\\x00-\x1f\x7f]/.test(path))
    throw failure("状态文件路径无效");
  const parts = path.split("/");
  if (parts.some((part) => !part || part.startsWith(".") || part === ".."))
    throw failure("状态文件路径无效");
  return parts;
}

// 不读取正文或调用 readFile：只取 CURRENT 最后一次修改时间，并复核目录与文件身份。
async function currentMetadata(root, path, filesystem) {
  try {
    const parts = partsOf(path), chain = [];
    const rootInfo = await filesystem.lstat(root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw failure("项目根目录身份无效");
    chain.push([root,identity(rootInfo),rootInfo.mtimeMs,rootInfo.size]);
    let target = root;
    for (let i = 0; i < parts.length; i++) {
      target = join(target, parts[i]);
      const info = await filesystem.lstat(target);
      if (info.isSymbolicLink() || (i < parts.length - 1 && !info.isDirectory()))
        throw failure("状态路径经过符号链接或非目录");
      chain.push([target, identity(info), info.mtimeMs, info.size]);
      if (i === parts.length - 1 && (!info.isFile() || info.nlink !== 1))
        throw failure("状态文件须为普通单链接文件");
    }
    const handle = await filesystem.open(target,constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const captured = await handle.stat(), expected = chain.at(-1);
      if (!captured.isFile() || captured.nlink !== 1 || identity(captured) !== expected[1] ||
          captured.mtimeMs !== expected[2] || captured.size !== expected[3])
        throw failure("状态文件元数据身份已变化");
    } finally { await handle.close(); }
    for (const [path, id, modified, bytes] of chain) {
      const info = await filesystem.lstat(path);
      if (info.isSymbolicLink() || identity(info) !== id || info.mtimeMs !== modified || info.size !== bytes)
        throw failure("查询期间状态目录或文件已变化");
    }
    return { state: "ok", at: new Date(chain.at(-1)[2]).toISOString() };
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code)) return { state: "absent" };
    return { state: "error", message: error.status ? error.message : "状态修改时间不可读" };
  }
}

export function createProjectActivity(repository, {
  clock = Date.now, filesystem = fs, resolveRoot = resolveProjectRoot, runGit = gitRunner,
} = {}) {
  return {
    async inspect(input = {}) {
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length)
        throw failure("活动查询不接受路径或其他字段");
      const state = await repository.read(), now = new Date(clock());
      const start = day(now, -29), finish = day(now, 1), items = [];
      for (const project of state?.connections?.projects || []) {
        const resolved = await resolveRoot(project, state.connections);
        const dated = Array.from({ length:30 }, (_, i) => ({ date:key(day(start,i)), git:0, current:0 }));
        const index = new Map(dated.map((row) => [row.date,row]));
        let git = { state:"error" }, current = { state:"error" };
        if (!resolved.error) {
          let capturedRoot = null;
          try { capturedRoot = identity(await filesystem.lstat(resolved.canonical)); } catch {}
          current = await currentMetadata(resolved.canonical,resolved.path,filesystem);
          if (current.state === "ok" && index.has(key(new Date(current.at))))
            index.get(key(new Date(current.at))).current = 1;
          try {
            const run = runGit(resolved.canonical);
            const rootIdentity = identity(await filesystem.lstat(resolved.canonical));
            const top = (await run(["rev-parse","--show-toplevel"])).trim();
            if (top !== resolved.canonical)
              throw failure("Git 仓库根目录与登记项目不符");
            // 避免 --since 遇非单调提交时刻时提前停止遍历；只输出时刻，不输出正文。
            const output = await run(["log","--no-show-signature","--no-patch","--format=%cI","--max-count=100001"]);
            const times = output.split(/\r?\n/).filter(Boolean);
            if (times.length > 100000 || times.some((at) => !Number.isFinite(Date.parse(at))))
              throw failure("Git 活动输出无效或超过查询上限");
            for (const at of times) {
              const instant = new Date(at), row = index.get(key(instant));
              if (row && instant >= start && instant < finish && instant <= now) row.git++;
            }
            if (identity(await filesystem.lstat(resolved.canonical)) !== rootIdentity)
              throw failure("Git 查询期间目录身份已变化");
            git = { state:"ok" };
          } catch (error) {
            git = notRepository(error) || noCommits(error)
              ? { state:"absent" } : { state:"error", message:error.status ? error.message : "Git 活动不可读" };
          }
          // 外部 I/O 后重验登记目录，身份漂移不得显示旧计数。
          const after = await resolveRoot(project,state.connections);
          let latestRoot = null;
          try { latestRoot = identity(await filesystem.lstat(resolved.canonical)); } catch {}
          if (after.error || after.canonical !== resolved.canonical || !capturedRoot || latestRoot !== capturedRoot) {
            current = { state:"error", message:"项目目录身份已变化" };
            git = { state:"error", message:"项目目录身份已变化" };
          }
        }
        const unknown = git.state === "error" || current.state === "error";
        items.push({ projectId:project.id, state:unknown ? "partial" : "ok", git,current,
          days:dated.map((row) => ({ ...row,
            git:git.state === "error" ? null : row.git,
            current:current.state === "error" ? null : row.current,
            total:unknown ? null : row.git + row.current,
          })),
          note:"当前 HEAD 可达提交；CURRENT 只计最后一次修改，不能还原过去修改次数。",
          ...(resolved.error ? { reason:resolved.error } : {}),
        });
      }
      return { at:now.toISOString(), start:start.toISOString(), items };
    },
  };
}

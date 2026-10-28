import { identityOptions } from "./directory-identity.mjs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  lstat,
  open,
  mkdir,
  unlink,
  writeFile,
  readdir,
  realpath,
} from "node:fs/promises";
import { constants } from "node:fs";
import { failure, digest } from "./repository.mjs";
import {
  projectDirectory,
  assertDirectoryConfirmed,
} from "./project-context.mjs";
import { readCurrentFile } from "./project-status.mjs";
import { createConfigJournal } from "./config-journal.mjs";
import { createGhRunner } from "./project-github.mjs";
import { filterRelayText } from "../src/relay-prompt.js";
import {
  createSavepointGit,
  inspectGit,
  repositorySafety,
  candidateFile,
  parseNumstat,
  parseCommits,
  DEFAULT_IGNORE,
  safePath,
  unpushedCount,
} from "./savepoint-git.mjs";
const HASH = /^[a-f0-9]{40}$/,
  UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const exact = (x, keys) =>
  x &&
  typeof x === "object" &&
  !Array.isArray(x) &&
  Object.keys(x).every((k) => keys.includes(k));
const validMessage = (x) =>
  typeof x === "string" &&
  x.trim() &&
  x.length <= 300 &&
  !/[\x00-\x1f\x7f]/.test(x) &&
  !filterRelayText(x).count;
const clockValue = (c) => new Date(c()).toISOString();
function validateRecord(x) {
  const keys = [
    "schema",
    "id",
    "projectId",
    "root",
    "at",
    "mode",
    "parent",
    "message",
    "files",
    "tree",
    "identity",
    "revision",
    "outsideIndex",
  ];
  if (
    !exact(x, keys) ||
    Object.keys(x).length !== keys.length ||
    x.schema !== 1 ||
    !UUID.test(x.id) ||
    typeof x.projectId !== "string" ||
    !x.projectId ||
    typeof x.root !== "string" ||
    !x.root.startsWith("/") ||
    !Number.isFinite(Date.parse(x.at)) ||
    !["commit", "init"].includes(x.mode) ||
    !(x.parent === null || HASH.test(x.parent)) ||
    !validMessage(x.message) ||
    !/^[a-f0-9]{64}$/.test(x.identity) ||
    !Number.isInteger(x.revision) ||
    !Array.isArray(x.outsideIndex) ||
    !x.outsideIndex.every((s) => typeof s === "string" && s.length <= 1300) ||
    !Array.isArray(x.files) ||
    !x.files.length ||
    x.files.length > 1000 ||
    !x.files.every(safePath) ||
    new Set(x.files).size !== x.files.length ||
    !Array.isArray(x.tree) ||
    x.tree.length !== x.files.length ||
    new Set(x.tree.map((t) => t?.path)).size !== x.files.length ||
    !x.tree.every(
      (t) =>
        exact(t, ["path", "hash", "mode"]) &&
        Object.keys(t).length === 3 &&
        x.files.includes(t.path) &&
        (t.hash === null
          ? t.mode === null
          : HASH.test(t.hash) && ["100644", "100755"].includes(t.mode)),
    )
  )
    throw failure("存档点记录无效", 503);
  return x;
}
export function createSavepoints(
  repository,
  {
    clock = () => Date.now(),
    run = createSavepointGit(),
    gh = createGhRunner(),
    afterCommit = async () => {},
  } = {},
) {
  const previews = new Map(),
    locks = new Set();
  const journalPromise = realpath(repository.directory).then((dir) =>
    createConfigJournal(dir, {
      folder: "savepoint-operations",
      validate: validateRecord,
      label: "存档点",
    }),
  );
  const resultsPromise = realpath(repository.directory).then((dir) =>
    createConfigJournal(dir, {
      folder: "savepoint-results",
      label: "存档点结果",
      validate: (x) => {
        if (
          !exact(x, ["schema", "id", "at", "hash"]) ||
          x.schema !== 1 ||
          !UUID.test(x.id) ||
          !HASH.test(x.hash) ||
          !Number.isFinite(Date.parse(x.at))
        )
          throw failure("存档结果无效", 503);
        return x;
      },
    }),
  );
  const results = Object.fromEntries(
    ["get", "prepare"].map((k) => [
      k,
      async (...args) => (await resultsPromise)[k](...args),
    ]),
  );
  const journal = Object.fromEntries(
    ["get", "list", "prepare", "complete"].map((k) => [
      k,
      async (...args) => (await journalPromise)[k](...args),
    ]),
  );
  async function context(input, write = false) {
    const state = await repository.read(),
      c = state?.connections,
      project = c?.projects?.find((p) => p.id === input.projectId);
    if (!project) throw failure("项目未登记，请先在项目空间扫描", 409);
    if (project.identityConflict)
      throw failure("项目身份待确认，暂不能读取或存档", 409);
    if (!project.localPaths.length) return { state, project, cloud: true };
    let root =
      input.root ||
      (project.localPaths.length === 1 ? project.localPaths[0] : null);
    if (root && !project.localPaths.includes(root)) {
      let registered;
      for (const p of project.localPaths) {
        try {
          if ((await realpath(p)) === root) {
            registered = p;
            break;
          }
        } catch {}
      }
      root = registered;
    }
    if (!root) throw failure("请选择该项目已登记的本机位置", 409);
    const dir = await projectDirectory(c.roots, root, identityOptions(project, root));
    assertDirectoryConfirmed(project, root, dir.identity);
    const loc = project.locations?.find((l) => l.path === root);
    if (loc && loc.status !== "present")
      throw failure("项目位置未证实可读，请重新扫描", 409);
    if (
      write &&
      (!loc?.identity ||
        loc.status !== "present" ||
        loc.identity !== dir.identity)
    )
      throw failure("请先在项目空间确认目录身份，再创建存档点", 409);
    return { state, project, root: dir.root, registeredRoot: root, dir };
  }
  async function blocked(projectId) {
    return (await journal.list()).some(
      (r) => r.projectId === projectId && !r.completedAt,
    );
  }
  async function tags(root) {
    const map = new Map();
    for (const line of (
      await run(root, [
        "for-each-ref",
        "--format=%(objectname)%09%(*objectname)%09%(refname:short)",
        "refs/tags",
      ])
    )
      .trim()
      .split("\n")) {
      const [object, peeled, tag] = line.split("\t"),
        hash = peeled || object;
      if (HASH.test(hash)) {
        if (!map.has(hash)) map.set(hash, []);
        map.get(hash).push(filterRelayText(tag).text);
      }
    }
    return map;
  }
  async function fileStats(root, hash) {
    const files = parseNumstat(
      await run(root, [
        "show",
        "--format=",
        "--numstat",
        "--no-renames",
        "--root",
        "--no-ext-diff",
        "--no-textconv",
        "-z",
        hash,
      ]),
    );
    const kinds = (
      await run(root, [
        "diff-tree",
        "--name-status",
        "-z",
        "--no-renames",
        "--root",
        "--no-commit-id",
        "-r",
        hash,
      ])
    ).split("\0");
    const map = new Map();
    for (let i = 0; i + 1 < kinds.length; i += 2)
      map.set(kinds[i + 1], kinds[i]);
    return files.map((f) => ({ ...f, kind: map.get(f.path) || "M" }));
  }
  async function commitList(root, offset) {
    try {
      return parseCommits(
        await run(root, [
          "log",
          `--skip=${offset}`,
          `--max-count=20`,
          "--format=%H%x00%P%x00%cI%x00%s%x00",
          "HEAD",
        ]),
      );
    } catch (e) {
      if (e.gitCode === 128) return [];
      throw e;
    }
  }
  async function handoffPath(root, stateId) {
    if (!stateId) return null;
    const [, day, seq] = stateId.split("-"),
      date = day.slice(0, 4) + "-" + day.slice(4, 6) + "-" + day.slice(6),
      dir = join(root, "docs/agents/handoffs");
    try {
      const s = await lstat(dir);
      if (s.isSymbolicLink() || !s.isDirectory()) return null;
      const names = await readdir(dir);
      if (names.length > 2000) return null;
      for (const name of names
        .filter(
          (n) =>
            n.startsWith(date) &&
            n.endsWith(".md") &&
            new RegExp(`(?:^|[^0-9])${seq}(?:[^0-9]|$)`).test(n),
        )
        .slice(0, 30)) {
        const path = "docs/agents/handoffs/" + name,
          c = await readCurrentFile(root, path);
        if (c.state === "read" && !c.truncated && c.text.includes(stateId))
          return path;
      }
    } catch {}
    return null;
  }
  async function cloud(ctx, offset = 0, hash) {
    const key = ctx.project.repoKey;
    if (
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(key) ||
      key.split("/").some((s) => s.startsWith("-") || [".", ".."].includes(s))
    )
      throw failure("云端项目仓库标识无效");
    const fetch = (endpoint) =>
      gh([
        "api",
        "--method",
        "GET",
        "--hostname",
        "github.com",
        `repos/${key}/${endpoint}`,
      ]);
    const validCommit = (r) =>
      r &&
      HASH.test(r.sha) &&
      typeof r.commit?.message === "string" &&
      Number.isFinite(Date.parse(r.commit?.committer?.date));
    if (hash) {
      const r = JSON.parse(await fetch("commits/" + hash));
      if (
        !validCommit(r) ||
        r.sha !== hash ||
        !Array.isArray(r.files) ||
        !r.files.every(
          (f) =>
            safePath(f.filename) &&
            [
              "added",
              "removed",
              "modified",
              "renamed",
              "copied",
              "changed",
              "unchanged",
            ].includes(f.status) &&
            Number.isInteger(f.additions) &&
            f.additions >= 0 &&
            Number.isInteger(f.deletions) &&
            f.deletions >= 0,
        )
      )
        throw failure("云端提交详情不完整，结果未知", 503);
      return {
        hash,
        files: r.files.map((f) => ({
          path: f.filename,
          kind: f.status === "added" ? "A" : f.status === "removed" ? "D" : "M",
          added: f.additions,
          deleted: f.deletions,
        })),
        partial: r.files.length >= 300,
      };
    }
    const raw = JSON.parse(
      await fetch(`commits?per_page=20&page=${offset / 20 + 1}`),
    );
    if (!Array.isArray(raw) || raw.length > 20 || !raw.every(validCommit))
      throw failure("云端提交返回不完整，结果未知", 503);
    const ts = JSON.parse(await fetch("tags?per_page=100"));
    if (
      !Array.isArray(ts) ||
      ts.length > 100 ||
      !ts.every((t) => typeof t.name === "string" && HASH.test(t.commit?.sha))
    )
      throw failure("云端标签返回不完整，结果未知", 503);
    return {
      state: "cloud",
      readOnly: true,
      reason: "仅云端项目，只读存档点",
      commits: raw.map((r) => ({
        hash: r.sha,
        message: filterRelayText(r.commit.message.split("\n")[0]).text,
        at: r.commit.committer.date,
        tags: ts
          .filter((t) => t.commit.sha === r.sha)
          .map((t) => filterRelayText(t.name).text),
        stateId: r.commit.message.match(/WB-\d{8}-\d+/)?.[0] || null,
      })),
      hasMore: raw.length === 20,
      offset,
      tagPartial: ts.length === 100,
      total: null,
      ahead: null,
    };
  }
  const api = {
    async inspect(input = {}) {
      if (!exact(input, ["projectId", "root", "offset"]))
        throw failure("读取请求含未开放字段");
      const offset = input.offset ?? 0;
      if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset % 20 ||
        offset > 10000
      )
        throw failure("分页无效");
      const ctx = await context(input);
      if (ctx.cloud) return cloud(ctx, offset);
      const g = await inspectGit(ctx.root, run);
      let commits = [],
        total = 0,
        ahead = null,
        local = new Set();
      if (g.head && !g.reason) {
        commits = await commitList(ctx.root, offset);
        total = Number(
          (await run(ctx.root, ["rev-list", "--count", "HEAD"])).trim(),
        );
        ahead = await unpushedCount((args) => run(ctx.root, args));
        if (ahead !== null) try {
          local = new Set(
            (await run(ctx.root, ["rev-list", "@{upstream}..HEAD"]))
              .trim()
              .split("\n"),
          );
        } catch {}
        const ts = await tags(ctx.root);
        for (const c of commits) {
          c.tags = ts.get(c.hash) || [];
          c.localOnly = local.has(c.hash);
          c.files = await fileStats(ctx.root, c.hash);
          c.fileCount = c.files.length;
          c.insertions = c.files.reduce((n, f) => n + (f.added || 0), 0);
          c.deletions = c.files.reduce((n, f) => n + (f.deleted || 0), 0);
          c.handoff = await handoffPath(ctx.root, c.stateId);
        }
      }
      const last = g.head && (await commitList(ctx.root, 0))[0];
      const ageDays = last
        ? Math.max(0, (new Date(clock()).getTime() - Date.parse(last.at)) / 86400000)
        : null;
      const days = ageDays == null ? null : Math.floor(ageDays);
      let reason = g.reason;
      const location = ctx.project.locations?.find(
        (l) => l.path === ctx.registeredRoot,
      );
      if (
        !reason &&
        (!location?.identity || location.identity !== ctx.dir.identity)
      )
        reason = "目录身份尚未确认，暂只读";
      if (!reason && (await blocked(ctx.project.id)))
        reason = "上次存档结果未确认，请先查询结果";
      if (!reason) {
        try {
          await run(ctx.root, ["var", "GIT_AUTHOR_IDENT"]);
        } catch {
          reason = "未配置Git作者身份，请交给Agent设置后重试";
        }
      }
      return {
        state: g.state === "nogit" ? "nogit" : g.head ? "main" : "empty",
        projectId: ctx.project.id,
        root: ctx.root,
        head: g.head || null,
        readOnly: !!reason,
        reason,
        files: g.files,
        stats: g.stats,
        directories: g.directories || [],
        current: g.current || {},
        commits,
        total,
        ahead,
        days,
        ageDays,
        last,
        offset,
        hasMore: offset + commits.length < total,
        defaultIgnore: DEFAULT_IGNORE,
        at: clockValue(clock),
      };
    },
    async detail(input) {
      if (
        !exact(input, ["projectId", "root", "hash"]) ||
        !HASH.test(input.hash)
      )
        throw failure("提交标识无效");
      const ctx = await context(input);
      if (ctx.cloud) return cloud(ctx, 0, input.hash);
      const g = await inspectGit(ctx.root, run);
      if (g.reason) throw failure(g.reason, 409);
      const c = parseCommits(
        await run(ctx.root, [
          "show",
          "--format=%H%x00%P%x00%cI%x00%s%x00",
          "--no-patch",
          input.hash,
        ]),
      )[0];
      if (!c) throw failure("提交不存在", 404);
      return { ...c, files: await fileStats(ctx.root, input.hash) };
    },
    async compare(input) {
      if (
        !exact(input, ["projectId", "root", "hash"]) ||
        !HASH.test(input.hash)
      )
        throw failure("提交标识无效");
      const ctx = await context(input);
      if (ctx.cloud)
        throw failure("云端项目没有本机工作区，不能与现在对比", 409);
      const g = await inspectGit(ctx.root, run);
      if (g.reason) throw failure(g.reason, 409);
      const text = await run(ctx.root, [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-renames",
        "--unified=3",
        input.hash,
        "--",
      ]);
      return {
        text: filterRelayText(text.slice(0, 128 * 1024)).text,
        truncated: Buffer.byteLength(text) > 128 * 1024,
        files: parseNumstat(
          await run(ctx.root, [
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--no-renames",
            "--numstat",
            "-z",
            input.hash,
          ]),
        ),
        untracked: g.files.filter((f) => f.status === "??").length,
      };
    },
    async handoff(input) {
      if (
        !exact(input, ["projectId", "root", "stateId"]) ||
        !/^WB-\d{8}-\d+$/.test(input.stateId)
      )
        throw failure("状态编号无效");
      const ctx = await context(input);
      if (ctx.cloud) throw failure("云端没有本机交接文件");
      const path = await handoffPath(ctx.root, input.stateId);
      if (!path) throw failure("未找到对应项目交接", 404);
      const c = await readCurrentFile(ctx.root, path);
      if (c.state !== "read" || c.truncated) throw failure("交接读取不完整");
      return { path, text: filterRelayText(c.text).text };
    },
    async preview(input) {
      if (
        !exact(input, ["projectId", "root", "mode"]) ||
        !["commit", "init"].includes(input.mode)
      )
        throw failure("预览请求无效");
      const ctx = await context(input, true);
      if (ctx.cloud) throw failure("云端项目只读");
      if (await blocked(ctx.project.id))
        throw failure("上次结果未知，先查询结果", 409);
      const g = await inspectGit(ctx.root, run);
      if (g.reason) throw failure(g.reason, 409);
      if ((input.mode === "init") !== (g.state === "nogit"))
        throw failure("项目存档状态已变化，请重新读取", 409);
      await run(ctx.root, ["var", "GIT_AUTHOR_IDENT"]);
      const id = randomUUID(),
        expires = new Date(
          new Date(clock()).getTime() + 10 * 60000,
        ).toISOString(),
        message = g.current.fields?.stateId
          ? [
              g.current.fields.stateId,
              g.current.task || g.current.fields.next || "项目进度",
            ]
              .join(" · ")
              .slice(0, 280)
          : clockValue(clock).slice(0, 10) +
            " · " +
            g.directories
              .map((d) => d.name)
              .slice(0, 3)
              .join("、");
      const plan = {
        id,
        expires,
        projectId: ctx.project.id,
        root: ctx.root,
        dir: ctx.dir.stamp,
        revision: ctx.state.revision,
        mode: input.mode,
        g,
      };
      previews.set(id, plan);
      return {
        id,
        expires,
        mode: input.mode,
        files: g.files,
        message,
        defaultIgnore: input.mode === "init" ? DEFAULT_IGNORE : null,
      };
    },
    async confirm(input) {
      if (
        !exact(input, ["id", "files", "message", "confirmed"]) ||
        !UUID.test(input.id) ||
        input.confirmed !== true ||
        !validMessage(input.message) ||
        !Array.isArray(input.files) ||
        !input.files.length ||
        input.files.length > 1000 ||
        new Set(input.files).size !== input.files.length ||
        !input.files.every(safePath)
      )
        throw failure("请确认有效说明与所选文件");
      const existing = await journal.get(input.id);
      if (existing) return api.query({ id: input.id });
      const p = previews.get(input.id);
      if (!p || Date.parse(p.expires) <= new Date(clock()).getTime())
        throw failure("预览已过期，请重新预览", 409);
      if (locks.has(p.projectId))
        throw failure("此项目已有存档操作在进行", 409);
      locks.add(p.projectId);
      const heldLocks = [];
      try {
        const lockDir = join(repository.directory, "savepoint-locks");
        try {
          await mkdir(lockDir, { mode: 0o700 });
        } catch (e) {
          if (e.code !== "EEXIST") throw e;
        }
        const s = await lstat(lockDir);
        if (!s.isDirectory() || s.isSymbolicLink() || s.mode & 0o077)
          throw failure("存档锁目录无效", 503);
        // Both the registered project and its canonical directory are exclusive.
        // Stable ordering also covers aliases registered as different projects.
        const lockNames = ["project-" + digest(p.projectId), "root-" + digest(p.root)].sort();
        for (const name of lockNames) {
          const path = join(lockDir, name + ".lock");
          try {
            const handle = await open(path, "wx", 0o600);
            const held = { path, handle };
            heldLocks.push(held);
            held.info = await handle.stat();
          } catch (e) {
            if (e.code === "EEXIST")
              throw failure("此项目存在另一个存档锁，请先核对运行状态", 409);
            throw e;
          }
        }
        const check = async () => {
          const ctx = await context(p, true);
          if (ctx.state.revision !== p.revision || ctx.dir.stamp !== p.dir)
            throw failure("项目登记或身份已变化，请重新预览", 409);
          return ctx;
        };
        await check();
        if (await blocked(p.projectId))
          throw failure("上次结果未知，先查询结果", 409);
        const g = await inspectGit(p.root, run);
        if (g.fingerprint !== p.g.fingerprint || g.reason)
          throw failure("工作区或Git状态已变化，请重新预览", 409);
        if (g.files.some((f) => f.generated && !input.files.includes(f.path)))
          throw failure("开启存档须包含新建的默认忽略规则");
        const selected = input.files.map((path) =>
          g.files.find((f) => f.path === path),
        );
        if (selected.some((f) => !f || f.blocked))
          throw failure("所选文件不在安全预览范围内", 409);
        // First commits cannot retain unrelated staged entries: make that unsupported case explicit.
        if (
          !g.head &&
          g.staged &&
          g.staged
            .split("\0")
            .filter(Boolean)
            .some((x) => !input.files.includes(x.split("\t").at(-1)))
        )
          throw failure("首提交含未选的暂存项，请先交给Agent整理", 409);
        const tree = [];
        for (const f of selected) {
          const live = f.generated
            ? {
                fingerprint: f.fingerprint,
                content: Buffer.from(DEFAULT_IGNORE),
                mode: "100644",
              }
            : await candidateFile(p.root, f.path);
          if (live.fingerprint !== f.fingerprint || live.blocked)
            throw failure("所选文件已变化，请重新预览", 409);
          tree.push({
            path: f.path,
            hash: live.deleted
              ? null
              : (
                  await run(
                    p.root,
                    ["hash-object", "--path=" + f.path, "--stdin"],
                    { input: live.content },
                  )
                ).trim(),
            mode: live.deleted ? null : live.mode,
          });
        }
        const record = {
          schema: 1,
          id: p.id,
          projectId: p.projectId,
          root: p.root,
          at: clockValue(clock),
          mode: p.mode,
          parent: g.head || null,
          message: input.message.trim(),
          files: input.files,
          tree,
          identity: p.dir,
          revision: p.revision,
          outsideIndex:
            g.staged
              ?.split("\0")
              .filter(Boolean)
              .filter((x) => !input.files.includes(x.split("\t").at(-1))) || [],
        };
        if (Buffer.byteLength(JSON.stringify(record)) > 240 * 1024)
          throw failure(
            "所选清单超出安全留痕上限，请缩小所选文件后重新预览",
            409,
          );
        await journal.prepare(record);
        await check();
        const guard = async (expected) => {
          await check();
          if (Date.parse(p.expires) <= new Date(clock()).getTime())
            throw failure("预览已过期", 409);
          const live = await inspectGit(p.root, run);
          if (
            live.reason ||
            live.head !== expected.head ||
            live.index !== expected.index ||
            live.stamp !== expected.stamp ||
            live.state !== expected.state ||
            live.symbolicRef !== expected.symbolicRef
          )
            throw failure("写前Git状态已变化，结果待查询", 409);
          for (const f of selected) {
            const current = await candidateFile(p.root, f.path);
            if (f.generated && expected.state === "nogit") {
              if (!current.deleted) throw failure("忽略文件已出现", 409);
            } else if (
              f.generated
                ? current.content?.toString() !== DEFAULT_IGNORE
                : current.fingerprint !== f.fingerprint
            )
              throw failure("写前文件已变化", 409);
          }
          const final = await repositorySafety(p.root, run);
          if (
            final.reason ||
            final.head !== expected.head ||
            final.index !== expected.index ||
            final.stamp !== expected.stamp ||
            final.state !== expected.state ||
            final.symbolicRef !== expected.symbolicRef
          )
            throw failure("最终写前Git状态已变化，结果待查询", 409);
          await check();
          if (Date.parse(p.expires) <= new Date(clock()).getTime())
            throw failure("预览已过期", 409);
        };
        let expected = g;
        if (p.mode === "init") {
          await guard(expected);
          await run(p.root, ["init", "--template=", "--initial-branch=main"]);
          await check();
          expected = await inspectGit(p.root, run);
          try {
            await lstat(join(p.root, ".gitignore"));
          } catch (e) {
            if (e.code !== "ENOENT") throw e;
            await check();
            if (Date.parse(p.expires) <= new Date(clock()).getTime())
              throw failure("预览已过期", 409);
            await writeFile(join(p.root, ".gitignore"), DEFAULT_IGNORE, {
              flag: "wx",
              mode: 0o644,
            });
          }
          expected = await inspectGit(p.root, run);
        }
        for (const f of selected) {
          const live = await candidateFile(p.root, f.path);
          if (
            (f.generated
              ? live.content?.toString() !== DEFAULT_IGNORE
              : live.fingerprint !== f.fingerprint) ||
            live.blocked
          )
            throw failure("写前文件变化，结果待查询", 409);
        }
        await check();
        await guard(expected);
        await run(p.root, ["add", "-A", "--", ...input.files]);
        await check();
        expected = await inspectGit(p.root, run);
        const stagedRows = expected.staged.split("\0").filter(Boolean),
          stagedMap = new Map(
            stagedRows.map((x) => {
              const [meta, path] = x.split("\t");
              return [
                path,
                { hash: meta.split(" ")[1], mode: meta.split(" ")[0] },
              ];
            }),
          );
        if (
          (expected.head || null) !== (g.head || null) ||
          JSON.stringify(
            stagedRows.filter(
              (x) => !input.files.includes(x.split("\t").at(-1)),
            ),
          ) !== JSON.stringify(record.outsideIndex) ||
          !record.tree.every(
            (t) =>
              (stagedMap.get(t.path)?.hash || null) === t.hash &&
              (!t.hash || stagedMap.get(t.path)?.mode === t.mode),
          )
        )
          throw failure("暂存回读与预览不一致，结果待查询", 409);
        for (const f of selected) {
          const live = await candidateFile(p.root, f.path);
          if (
            f.generated
              ? live.content?.toString() !== DEFAULT_IGNORE
              : live.fingerprint !== f.fingerprint
          )
            throw failure("提交前文件变化，结果待查询", 409);
        }
        await guard(expected);
        await run(p.root, [
          "commit",
          "--only",
          "--no-gpg-sign",
          "-m",
          record.message,
          "--",
          ...input.files,
        ]);
        await afterCommit();
        return { ...await api.query({ id: p.id }), newlyStarted: true };
      } catch (e) {
        if (await journal.get(input.id).catch(() => null))
          return {
            id: input.id,
            state: "unknown",
            newlyStarted: true,
            reason:
              "执行结果尚未确认；保留当前目录状态，先查询结果，不重复创建",
          };
        throw e;
      } finally {
        locks.delete(p.projectId);
        for (const held of heldLocks.reverse()) {
          await held.handle.close();
          if (held.info) try {
            const s = await lstat(held.path);
            if (s.ino === held.info.ino && s.dev === held.info.dev) await unlink(held.path);
          } catch {}
        }
      }
    },
    async query(input) {
      if (!exact(input, ["id"]) || !UUID.test(input.id))
        throw failure("操作编号无效");
      const r = await journal.get(input.id);
      if (!r) return { id: input.id, state: "not_started" };
      const ctx = await context(r, true);
      if (ctx.dir.stamp !== r.identity)
        return {
          id: r.id,
          state: "unknown",
          reason: "目录身份已变化，不能核对旧操作",
        };
      const g = await inspectGit(r.root, run);
      if (g.reason) return { id: r.id, state: "unknown", reason: g.reason };
      const saved = await results.get(r.id);
      let commits = saved
        ? parseCommits(
            await run(r.root, [
              "show",
              "--format=%H%x00%P%x00%cI%x00%s%x00",
              "--no-patch",
              saved.hash,
            ]),
          )
        : [];
      if (!saved && g.head)
        for (let offset = 0; offset < 1000; offset += 20) {
          const rows = await commitList(r.root, offset);
          commits.push(...rows);
          if (rows.length < 20) break;
        }
      const candidates = commits.filter(
        (c) =>
          c.message === r.message &&
          (r.parent
            ? c.parents.length === 1 && c.parents[0] === r.parent
            : c.parents.length === 0),
      );
      for (const c of candidates) {
        const rows = (await run(r.root, ["ls-tree", "-z", "-r", c.hash, "--"]))
            .split("\0")
            .filter(Boolean),
          map = new Map(
            rows.map((x) => {
              const [meta, path] = x.split("\t");
              return [
                path,
                { hash: meta.split(" ")[2], mode: meta.split(" ")[0] },
              ];
            }),
          );
        if (
          !r.tree.every(
            (t) =>
              (map.get(t.path)?.hash || null) === t.hash &&
              (!t.hash || map.get(t.path)?.mode === t.mode),
          )
        )
          continue;
        const changed = parseNumstat(
          await run(r.root, [
            "show",
            "--format=",
            "--numstat",
            "--no-renames",
            "--root",
            "--no-ext-diff",
            "--no-textconv",
            "-z",
            c.hash,
          ]),
        ).map((f) => f.path);
        if (
          changed.some((p) => !r.files.includes(p)) ||
          r.files.some((p) => !changed.includes(p))
        )
          continue;
        const end = await repositorySafety(r.root, run),
          endCtx = await context(r, true);
        if (
          end.reason ||
          endCtx.dir.stamp !== r.identity ||
          endCtx.state.revision !== ctx.state.revision
        )
          return {
            id: r.id,
            state: "unknown",
            reason: "核对期间项目身份或登记已变化，保留旧操作",
          };
        const outside = (end.staged || "")
          .split("\0")
          .filter(Boolean)
          .filter((x) => !r.files.includes(x.split("\t").at(-1)));
        if (
          !saved &&
          JSON.stringify(outside) !== JSON.stringify(r.outsideIndex)
        )
          return {
            id: r.id,
            state: "unknown",
            reason: "无关暂存已变化，需Agent核对",
          };
        if (!saved)
          await results.prepare({
            schema: 1,
            id: r.id,
            at: clockValue(clock),
            hash: c.hash,
          });
        const finalCtx = await context(r, true);
        if (
          finalCtx.dir.stamp !== r.identity ||
          finalCtx.state.revision !== ctx.state.revision
        )
          return {
            id: r.id,
            state: "unknown",
            reason: "结果保存期间项目身份或登记已变化，继续查询原操作",
          };
        await journal.complete(r.id, clockValue(clock));
        return {
          id: r.id,
          state: "verified",
          hash: c.hash,
          workspace: { head: g.head, stats: g.stats, files: g.files },
          at: clockValue(clock),
        };
      }
      return {
        id: r.id,
        state: "unknown",
        reason: "没有找到与原计划父提交、说明及文件树一致的存档点；不自动重试",
      };
    },
    async pending(input) {
      if (!exact(input, ["projectId"])) throw failure("查询请求无效");
      const state = await repository.read();
      const project = state?.connections?.projects?.find(
        (p) => p.id === input.projectId,
      );
      if (!project || project.identityConflict)
        throw failure("项目未登记或身份待确认", 409);
      return {
        items: (await journal.list())
          .filter((r) => r.projectId === input.projectId && !r.completedAt)
          .map((r) => ({ id: r.id, at: r.at, state: "unknown" })),
      };
    },
  };
  return api;
}

// 项目空间第二版（issue #8）：一次返回名册、置顶、每个项目的读数、现在 / 下一步、30 天提交。
// 读数全部只读；写入只有置顶（沿用 connections.projects[].active，最多 3 个，带 revision 检查并回读），
// 本机登记由名册同步（roster-sync.mjs，启动时与「按名册刷新」）派生。
// GitHub、Git、项目卡各自失败时按项目单独标记，不让整页失败；读不到不当成 0。
import fs from "node:fs/promises";
import { resolve } from "node:path";
import { failure } from "./repository.mjs";
import { DEFAULT_ROSTER_PATH, readRoster as readRosterFile, displayPath } from "./project-roster.mjs";
import {
  resolveProjectRoot, readCurrentFile, parseCurrentTop, gitRunner, notRepository, noCommits,
} from "./project-status.mjs";
import { commitTimes, localDateKey, localDay } from "./project-activity.mjs";
import { issueBreakdown, TRIAGE_LABELS } from "./project-github.mjs";
import { unpushedCount } from "./savepoint-git.mjs";

export const PIN_LIMIT = 3;
const DAY = 86400000, HOUR = 3600000;
const STALE_DAYS = 3;
const UNPUSHED_WARN = 10;

function exactKeys(input, allowed) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((k) => !allowed.includes(k)))
    throw failure("请求包含不支持的字段");
}
const shortDate = (iso) => (iso ? iso.slice(5, 10) : "");
const dayGap = (from, to) => Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY);

// 名册条目对上本机登记：先按名册 id（rosterId，#73 名册同步写入）；没有时按本机路径（含真实路径）兜底，
// 兜底只认还没挂到别的名册项目上的记录。
export function matchProject(entry, projects = [], realPath = null) {
  const byId = entry.id ? projects.find((p) => p.rosterId === entry.id) : null;
  if (byId) return byId;
  const wanted = new Set([entry.path, realPath].filter(Boolean).map((p) => resolve(p)));
  return projects.find((p) => !p.rosterId && (p.localPaths || []).some((lp) => wanted.has(resolve(lp)))) || null;
}

// 下一步按简报 §4.2 的顺序取第一条；来自 CURRENT 且比最近提交早超过 3 天时标“可能过期”。
// 都没写时（常浩 10-29 样稿 7F）：再取顶节“遗留”，仍没有就由读数推出——推送、合并 PR、分流 issue。
export function pickNext({ issues, top, tableNext, lastCommitAt, unpushed = null, prs = null }) {
  const byLabel = (label) =>
    (issues?.state === "ok" ? issues.items : [])
      .filter((i) => i.labels?.includes(label))
      .sort((a, b) => a.number - b.number)[0];
  for (const [src, label] of [["agent", TRIAGE_LABELS.agent], ["human", TRIAGE_LABELS.human]]) {
    const issue = byLabel(label);
    if (issue)
      return { src, text: `#${issue.number} ${issue.title}`, number: issue.number, url: issue.url, from: `issue #${issue.number} · ${label}`, stale: false };
  }
  const fromCurrent = top?.next
    ? { src: "top", text: top.next, date: top.date, from: "" }
    : tableNext?.text
      ? { src: "table", text: tableNext.text, date: tableNext.date, from: "CURRENT 头表" }
      : top?.leftover
        ? { src: "leftover", text: top.leftover, date: top.date, from: "CURRENT 顶节「遗留」" }
        : null;
  if (!fromCurrent) {
    const triage = (issues?.state === "ok" ? issues.items : []).filter((i) => i.labels?.includes(TRIAGE_LABELS.triage)).length;
    const why = "顶节没写「下一步：」· 由读数推出";
    if (unpushed > 0) return { src: "derived", text: `推送 ${unpushed} 个本地提交`, from: why, stale: false };
    if (prs > 0) return { src: "derived", text: `合并 ${prs} 个待合并 PR`, from: why, stale: false };
    if (triage) return { src: "derived", text: `分流 ${triage} 张待分流 issue`, from: why, stale: false };
    return { src: "none", text: "顶节没写下一步", from: "", stale: false };
  }
  const stale = !!(fromCurrent.date && lastCommitAt && dayGap(fromCurrent.date, lastCommitAt) > STALE_DAYS);
  const { date, ...rest } = fromCurrent;
  return { ...rest, ...(date ? { date } : {}), stale };
}

// 卡带上“要注意的一件事”：简报 §4.3 的优先级，只取一条。
export function attentionOf(item) {
  const gh = item.github, iss = gh.state === "ok" ? gh.issues : null;
  if (item.dir === "missing") return { kind: "missing", text: "本机找不到目录", warn: true };
  if (item.dir === "unregistered") return { kind: "unregistered", text: "数码世界没有它的本机登记记录", warn: true };
  if (iss?.human) return { kind: "human", text: `待人工验收 ${iss.human} 张`, warn: true };
  if (item.next?.stale) return { kind: "stale", text: "下一步可能过期", warn: true };
  if (item.unpushed > UNPUSHED_WARN) return { kind: "unpushed", text: `未推送 ${item.unpushed} 个`, warn: true };
  if (iss?.agent) return { kind: "agent", text: `待 Agent ${iss.agent} 张`, warn: false };
  if (gh.state === "ok" && gh.prs) return { kind: "pr", text: `PR 待合并 ${gh.prs} 个`, warn: false };
  if (gh.state === "none") return { kind: "nogh", text: "没有 GitHub 远端", warn: true };
  return item.lastCommitAt
    ? { kind: "last", text: `最近提交 ${shortDate(item.lastCommitAt)}`, warn: false }
    : { kind: "last", text: "还没有提交", warn: false };
}

export function createProjectsSpace(repository, {
  clock = Date.now,
  rosterPath = DEFAULT_ROSTER_PATH,
  readRoster = readRosterFile,
  readCard = async () => ({ state: "off" }),
  github = null,
  skillUsage = { read: async () => ({ state: "off" }) },
  resolveRoot = resolveProjectRoot,
  runGit = gitRunner,
  filesystem = fs,
} = {}) {
  async function directoryState(path) {
    try {
      const info = await filesystem.lstat(path);
      return info.isDirectory() ? { exists: true, real: await filesystem.realpath(path) } : { exists: false };
    } catch {
      return { exists: false };
    }
  }

  async function gitFacts(canonical, days) {
    const run = runGit(canonical);
    try {
      const top = (await run(["rev-parse", "--show-toplevel"])).trim();
      if (top !== canonical) return { state: "error", message: "Git 仓库根目录与登记项目不符" };
    } catch (e) {
      return notRepository(e) ? { state: "none" } : { state: "error", message: "Git 读不到" };
    }
    let times;
    try {
      times = await commitTimes(run);
    } catch (e) {
      if (noCommits(e)) return { state: "ok", counts: days.map(() => 0), lastCommitAt: "", subject: "", unpushed: null };
      return { state: "error", message: e.status ? e.message : "Git 提交读不到" };
    }
    const index = new Map(days.map((d, i) => [d, i])), counts = days.map(() => 0);
    let last = 0;
    for (const at of times) {
      const t = Date.parse(at);
      if (t > last && t <= clock()) last = t;
      const i = index.get(localDateKey(new Date(t)));
      if (i !== undefined && t <= clock()) counts[i]++;
    }
    let subject = "";
    try {
      subject = (await run(["log", "-1", "--no-show-signature", "--format=%s"])).trim().slice(0, 120);
    } catch {}
    return {
      state: "ok", counts, subject,
      lastCommitAt: last ? new Date(last).toISOString() : "",
      unpushed: await unpushedCount(run),
    };
  }

  async function githubFacts(repoKey, refresh) {
    if (!repoKey) return { state: "none", message: "没有 GitHub 远端" };
    if (!github) return { state: "error", message: "GitHub 读取未接入" };
    let panel;
    try {
      panel = await github.forProject({ repoKey }, { refresh });
    } catch {
      return { state: "error", repoKey, message: "GitHub 读取失败" };
    }
    if (panel.state !== "ok") return { state: "error", repoKey, message: panel.message || "GitHub 读取失败" };
    const issues = issueBreakdown(panel.issues);
    const prs = panel.openPrs?.state === "ok" ? panel.openPrs.items.length : null;
    return {
      state: issues && prs !== null ? "ok" : "error", repoKey, issues, prs, raw: panel.issues,
      ...(issues && prs !== null ? {} : { message: "GitHub 部分读取失败" }),
      fetchedAt: panel.fetchedAt,
    };
  }

  async function inspectEntry(entry, no, connections, days, refresh, usage) {
    const dir = await directoryState(entry.path);
    const match = matchProject(entry, connections?.projects, dir.real);
    const item = {
      id: entry.id,
      no,
      name: entry.name,
      path: displayPath(entry.path),
      card: entry.card,
      projectId: match?.id || null,
      pinned: match?.active === true,
      dir: !dir.exists ? "missing" : match ? "ok" : "unregistered",
    };
    const [doc, gh] = await Promise.all([
      readCard(entry.card).catch(() => ({ state: "error", message: "项目卡读不到" })),
      githubFacts(match?.repoKey || entry.github, refresh),
    ]);
    let git = { state: "unknown" }, current = null, file = null;
    if (item.dir === "ok") {
      const resolved = await resolveRoot(match, connections);
      if (resolved.error) {
        item.dir = "error";
        item.message = resolved.error;
      } else {
        file = await readCurrentFile(resolved.canonical, resolved.path);
        current = file.state === "read" ? parseCurrentTop(file.text) : null;
        git = await gitFacts(resolved.canonical, days);
      }
    }
    const lastCommitAt = git.state === "ok" ? git.lastCommitAt : "";
    const { raw, ...github } = gh;
    Object.assign(item, {
      doc,
      github,
      unpushed: git.state === "ok" ? git.unpushed : null,
      lastCommitAt,
      lit: !!lastCommitAt && clock() - Date.parse(lastCommitAt) <= 7 * DAY,
      now: current?.top
        ? { src: "CURRENT", title: current.top.title, date: current.top.date, by: current.top.by, facts: current.top.facts, earlier: current.top.earlier }
        : git.subject
          ? { src: "commit", title: git.subject, date: lastCommitAt.slice(0, 10), by: "",
              why: file?.state === "read" ? "CURRENT 没有可读的顶节" : file?.state === "absent" ? "没有 CURRENT" : "CURRENT 读不到" }
          : null,
      next: pickNext({ issues: raw, top: current?.top, tableNext: current?.tableNext, lastCommitAt,
        unpushed: git.state === "ok" ? git.unpushed : null, prs: github.state === "ok" ? github.prs : null }),
      commits: git.state === "ok" ? commitSummary(git.counts, days) : { state: git.state === "none" ? "none" : "error", ...(git.message ? { message: git.message } : {}) },
      skills: usage.state === "ok" ? usage.projects?.[entry.id] || { skills: [], calls: 0, sessions: 0, codex: [] } : null,
    });
    item.attention = attentionOf(item);
    return item;
  }

  // 实战统计：会话记录可能有几个 G，一律后台采（同一时间只采一次）；这次先用已有的统计，没有就标“统计中”。
  // 还没有统计、点了刷新、或统计超过 1 小时，就起一次后台采集；上次没统计成又没点刷新时如实报读取失败。
  let scanning = null, scanFailed = false;
  async function skillUsageFacts(refresh) {
    const cached = await skillUsage.read().catch(() => ({ state: "error" }));
    if (cached.state === "off" || cached.state === "error") return cached;
    if (cached.state === "empty" && scanFailed && !refresh && !scanning) return { state: "error" };
    if (!scanning && (refresh || cached.state === "empty" || clock() - Date.parse(cached.at) > HOUR))
      scanning = skillUsage.refresh({}).then(() => { scanFailed = false; }, () => { scanFailed = true; }).finally(() => { scanning = null; });
    return scanning ? { ...cached, scanning: true } : cached;
  }

  return {
    async inspect(input = {}) {
      exactKeys(input, ["refresh", "roster"]);
      if (input.refresh !== undefined && typeof input.refresh !== "boolean") throw failure("刷新参数必须是布尔值");
      if (input.roster !== undefined && input.roster !== true) throw failure("名册参数只能是 true");
      const now = new Date(clock());
      const days = Array.from({ length: 30 }, (_, i) => localDateKey(localDay(now, i - 29)));
      const roster = await readRoster(rosterPath);
      const state = await repository.read();
      const base = { at: now.toISOString(), revision: state?.revision ?? null, pinLimit: PIN_LIMIT, days };
      if (roster.state !== "ok")
        return { ...base, roster: { state: "error", path: roster.path, message: roster.message }, totals: null, items: [] };
      const order = (x) => (x.pinned ? 0 : 1);
      // 只要名册：页面先按名册画出卡带，读数随后到（置顶按主库里的登记路径先排，和完整读取一致）。
      if (input.roster) {
        const items = roster.projects.map((p, i) => ({ id: p.id, no: i + 1, name: p.name, path: displayPath(p.path),
          pinned: matchProject(p, state?.connections?.projects)?.active === true, pending: true }));
        items.sort((a, b) => order(a) - order(b));
        return { ...base, roster: { state: "ok", path: roster.path, skipped: roster.skipped }, pending: true, items };
      }
      const usage = await skillUsageFacts(input.refresh === true);
      const items = await Promise.all(
        roster.projects.map((p, i) => inspectEntry(p, i + 1, state?.connections, days, input.refresh === true, usage)),
      );
      items.sort((a, b) => order(a) - order(b));
      const known = items.filter((i) => i.github.state === "ok");
      return {
        ...base,
        roster: { state: "ok", path: roster.path, skipped: roster.skipped },
        totals: {
          projects: items.length,
          pinned: items.filter((i) => i.pinned).length,
          issues: known.reduce((n, i) => n + i.github.issues.open, 0),
          issuesPartial: known.length < items.filter((i) => i.github.state !== "none").length,
          skillCalls: usage.state === "ok" ? items.reduce((n, i) => n + (i.skills?.calls || 0), 0) : null,
        },
        skillUsage: { state: usage.state, ...(usage.at ? { at: usage.at } : {}), ...(usage.scanning ? { scanning: true } : {}) },
        items,
      };
    },

    async pin(input) {
      exactKeys(input, ["id", "pinned", "revision"]);
      if (typeof input.id !== "string" || typeof input.pinned !== "boolean") throw failure("请选择项目并指明是否置顶");
      if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw failure("缺少当前主库版本，请刷新");
      const roster = await readRoster(rosterPath);
      if (roster.state !== "ok") throw failure(roster.message, 409);
      const entry = roster.projects.find((p) => p.id === input.id);
      if (!entry) throw failure("名册里没有这个项目", 404);
      const dir = await directoryState(entry.path);
      const inRoster = (p) => roster.projects.some((r) => matchProject(r, [p]));
      await repository.updateConnections((c) => {
        const target = matchProject(entry, c?.projects, dir.real);
        if (!target) throw failure("这个项目在数码世界没有本机登记记录，不能置顶；先点「按名册刷新」", 409);
        const others = (c.projects || []).filter((p) => p.id !== target.id && p.active === true && inRoster(p));
        if (input.pinned && others.length >= PIN_LIMIT) throw failure(`最多置顶 ${PIN_LIMIT} 个，先取消一个`, 409);
        return {
          ...c,
          projects: c.projects.map((p) => {
            if (p.id !== target.id) return p;
            const { active, ...rest } = p;
            return input.pinned ? { ...rest, active: true } : rest;
          }),
        };
      }, { expectedRevision: input.revision });
      // 写后回读：以主库里实际的值为准。
      const after = await repository.read();
      const saved = matchProject(entry, after?.connections?.projects, dir.real);
      const pinned = saved?.active === true;
      if (!saved || pinned !== input.pinned) throw failure("置顶结果回读不一致，请刷新后再看", 500);
      return { id: entry.id, projectId: saved.id, pinned, revision: after.revision };
    },
  };
}

function commitSummary(counts, days) {
  let peak = { date: "", n: 0 };
  counts.forEach((n, i) => { if (n > peak.n) peak = { date: days[i], n }; });
  return {
    state: "ok",
    days: counts,
    total: counts.reduce((a, b) => a + b, 0),
    activeDays: counts.filter(Boolean).length,
    peak,
  };
}

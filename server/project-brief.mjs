// 项目空间第二批：每日项目简报（产品定义 v1.2 §4.1 第二批，D29）。
// 每个在推进项目一段话：昨天到今天发生了什么、今天的唯一下一步、卡点。
// 全部由本机数据按确定规则拼成，不调用任何模型：
// - CURRENT：状态卡的协作状态表（唯一下一步）与状态链标题（统计区间内新增的状态）；
// - 交接文档：只看文件名与修改时间，不读正文；
// - Git：统计区间内的提交数（只读 rev-list）；
// - GitHub：复用面板的缓存（PR、CI），查不到就写“未知”；
// - 停滞与安全体检：直接取 2.1/2.2 的结论。
// 唯一的写入是“标为已读”：主库 briefReads 只记日期、项目与段落指纹。
import { createHash } from "node:crypto";
import { failure } from "./repository.mjs";
import { redactSecrets } from "../src/collab.js";
import {
  gitRunner,
  notRepository,
  noCommits,
  resolveProjectRoot,
} from "./project-status.mjs";
import { readStateHeadings, readHandoffIndex } from "./collab-board.mjs";
import {
  BRIEF_READS_LIMIT,
  BRIEF_KEEP_DAYS,
  isBriefDate,
} from "./brief-schema.mjs";

const pad = (n) => String(n).padStart(2, "0");
const localDay = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 统计区间：本机时区昨天 0 点到现在。早上打开时能看到昨天一整天与今天到目前为止的变化。
export function briefWindow(now) {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  return {
    date: localDay(d),
    since: localDay(start),
    start: start.toISOString(),
    end: d.toISOString(),
  };
}

// 简报是给人读的一段话：Markdown 链接 [文字](地址) 只保留文字（用户 2026-10-03）。
// 项目的统计区间（用户 2026-10-03）：从该项目上次标为已读起（只看今天以前的已读，
// 今天标为已读不会改变今天的简报）；没有标过就用昨天 0 点起的默认区间。
export function projectWindow(base, reads, projectId) {
  const last = reads
    .filter((r) => r.projectId === projectId && r.date < base.date)
    .map((r) => r.at)
    .sort()
    .at(-1);
  if (!last) return base;
  const start = new Date(last);
  return { ...base, since: localDay(start), start: start.toISOString() };
}

const line = (value, limit = 300) => {
  const s = redactSecrets(
    String(value ?? "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[\x00-\x1f\x7f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  return s.length > limit ? s.slice(0, limit) + "…" : s;
};
const inWindow = (iso, window) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= Date.parse(window.start);
};
const firstItems = (items, render, n = 2) =>
  items.slice(0, n).map(render).join("、") + (items.length > n ? " 等" : "");
const CI_LABEL = {
  success: "成功",
  failure: "失败",
  running: "运行中",
  cancelled: "已取消",
  other: "其他结果",
};

function nextStep(current) {
  const path = line(current?.path) || "CURRENT.md";
  if (current?.state === "ok" || current?.state === "partial") {
    const next = current.fields?.next;
    return next ? line(next) : "未知（状态表缺少唯一下一步）";
  }
  if (current?.state === "absent") return `未知（项目里没有 ${path}）`;
  if (current?.state === "unparsed") return `未知（${path} 没有协作状态表）`;
  return `未知（状态无法读取：${line(current?.message) || "原因不明"}）`;
}

// 纯函数：同样的事实得到同样的段落与指纹。facts 的每一项都可能缺失或“未知”，缺什么写什么，不补造。
export function composeBrief(facts, window) {
  const happened = [];
  const notes = [];
  const { current, states, handoffs, commits, github, activity, safety } = facts;

  // CURRENT：统计区间内新增的状态标题优先；没有新标题但文件改过，就写“有修改”。
  const fresh =
    states?.state === "read"
      ? (states.headings || []).filter((h) => h.date >= window.since)
      : [];
  if (fresh.length) {
    const latest = fresh.reduce((best, h) =>
      h.date > best.date || (h.date === best.date && h.seq >= best.seq) ? h : best,
    );
    happened.push(
      `CURRENT 新增 ${fresh.length} 个状态，最新 ${line(latest.stateId)}（${line(latest.title, 80)}）`,
    );
  } else if (
    (current?.state === "ok" || current?.state === "partial" || current?.state === "unparsed") &&
    inWindow(current.modifiedAt, window)
  ) {
    const id = current.fields?.stateId;
    happened.push(id ? `CURRENT 有修改（状态编号 ${line(id)}）` : "CURRENT 有修改");
  }

  // 交接：修改时间在区间内，且文件名日期（有的话）不早于昨天——重新检出会刷新修改时间，旧交接不算新。
  if (handoffs?.state === "ok") {
    const files = (handoffs.files || []).filter(
      (f) => inWindow(f.modifiedAt, window) && (!f.date || f.date >= window.since),
    );
    if (files.length)
      happened.push(
        `新增交接 ${files.length} 份：${firstItems(files, (f) => line(f.name), 3)}`,
      );
  }

  if (commits?.state === "ok" && commits.count > 0)
    happened.push(`新提交 ${commits.count} 个`);
  else if (commits?.state === "unknown") notes.push("新提交数未知");

  const blockers = [];
  if (activity?.state === "stalled")
    blockers.push(`已 ${activity.idleDays} 天没有状态更新或提交`);
  const issues = safety?.issues || [];
  if (issues.length)
    blockers.push(
      `安全体检发现 ${issues.length} 项问题（${issues.map((i) => line(i.text)).join("；")}）`,
    );

  if (github?.state === "ok") {
    const unknown = [];
    const pr = (p) => `#${p.number} ${line(p.title, 60)}`;
    if (github.openPrs?.state === "ok") {
      const opened = github.openPrs.items.filter((p) => inWindow(p.createdAt, window));
      if (opened.length) happened.push(`新开 PR ${opened.length} 个（${firstItems(opened, pr)}）`);
    } else unknown.push("PR");
    if (github.mergedPrs?.state === "ok") {
      const merged = github.mergedPrs.items.filter((p) => inWindow(p.mergedAt, window));
      if (merged.length) happened.push(`合并 PR ${merged.length} 个（${firstItems(merged, pr)}）`);
    } else if (!unknown.includes("PR")) unknown.push("PR");
    if (github.issues?.state === "ok") {
      const opened = github.issues.items.filter((i) => inWindow(i.createdAt, window));
      if (opened.length) happened.push(`新开 Issue ${opened.length} 个（${firstItems(opened, pr)}）`);
    } else unknown.push("Issue");
    if (github.ci?.state === "ok") {
      const { latest, previous } = github.ci;
      if (latest && inWindow(latest.updatedAt || latest.createdAt, window)) {
        const now = CI_LABEL[latest.status] || "其他结果";
        const before = previous && CI_LABEL[previous.status];
        happened.push(
          before && previous.status !== latest.status && latest.status !== "running"
            ? `CI 由${before}变为${now}`
            : `CI 最近一次运行${now}`,
        );
      }
      if (latest?.status === "failure")
        blockers.push(`默认分支 CI 失败（${line(latest.workflow) || "workflow"}）`);
    } else unknown.push("CI");
    if (unknown.length) notes.push(`GitHub 部分未知：${unknown.join("、")}`);
  } else if (github?.state === "unknown")
    notes.push(`GitHub 情况未知（${line(github.message) || "查询失败"}）`);

  if (!happened.length) happened.push("没有记录到新的变化");
  happened.push(...notes);
  const next = nextStep(current);
  const text = `昨天到今天：${happened.join("；")}。今天的唯一下一步：${next}。卡点：${blockers.length ? blockers.join("；") : "未发现"}。`;
  return {
    happened,
    next,
    blockers,
    text,
    digest: createHash("sha256").update(text).digest("hex"),
  };
}

// ---------- 本机事实收集（全部只读） ----------

async function countCommitsSince(root, since) {
  try {
    const out = await gitRunner(root)(["rev-list", "--count", `--since=${since}`, "HEAD"]);
    const count = Number(out.trim());
    return Number.isSafeInteger(count) ? { state: "ok", count } : { state: "unknown" };
  } catch (e) {
    if (notRepository(e)) return { state: "none" };
    if (noCommits(e)) return { state: "ok", count: 0 };
    return { state: "unknown" };
  }
}

function exactKeys(input, allowed) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !allowed.includes(k))
  )
    throw failure("请求包含不支持的字段");
}
const DIGEST = /^[a-f0-9]{64}$/;
const PROJECT_ID = /^[a-zA-Z0-9_-]{1,100}$/;

export function createProjectBrief(
  repository,
  { projectStatus, github, clock = Date.now },
) {
  async function facts(item, project, connections, window, refresh) {
    const resolved = await resolveProjectRoot(project, connections);
    let states = { state: "error", headings: [] };
    let handoffs = { state: "error", files: [] };
    let commits = { state: "unknown" };
    if (!resolved.error) {
      const read = await readStateHeadings(resolved.canonical, resolved.path);
      states = { state: read.state, headings: read.headings || [] };
      handoffs = await readHandoffIndex(resolved.canonical);
      commits = await countCommitsSince(resolved.canonical, window.start);
    }
    return {
      name: item.name,
      current: item.current,
      states,
      handoffs,
      commits,
      github: project.repoKey ? await github.forProject(project, { refresh }) : null,
      activity: item.activity,
      safety: item.safety,
    };
  }
  return {
    async today(input = {}) {
      exactKeys(input, ["refresh"]);
      if (input.refresh !== undefined && typeof input.refresh !== "boolean")
        throw failure("刷新参数必须是布尔值");
      const status = await projectStatus.inspect({});
      const state = await repository.read();
      const connections = state?.connections;
      const window = briefWindow(clock());
      const reads = state?.briefReads || [];
      const items = [];
      for (const item of status.items) {
        const project = connections?.projects.find((p) => p.id === item.projectId);
        if (!project) continue;
        const own = projectWindow(window, reads, item.projectId);
        const brief = composeBrief(
          await facts(item, project, connections, own, input.refresh === true),
          own,
        );
        const mark = reads.find(
          (r) => r.date === window.date && r.projectId === item.projectId,
        );
        items.push({
          projectId: item.projectId,
          name: item.name,
          // 一键开工复用 2.4 的开工口令：只需要登记目录与 CURRENT 状态表。
          root: item.root,
          current: item.current,
          ...brief,
          read: !mark ? "unread" : mark.digest === brief.digest ? "read" : "changed",
          readAt: mark?.at || "",
          since: own.start,
        });
      }
      return { at: new Date(clock()).toISOString(), ...window, window, items };
    },
    // 浏览器“标为已读”：记下当天、项目与所见段落的指纹。同一内容重复标记不写主库。
    async read(input) {
      exactKeys(input, ["date", "items"]);
      if (!isBriefDate(input.date)) throw failure("简报日期无效");
      if (!Array.isArray(input.items) || !input.items.length || input.items.length > 50)
        throw failure("请选择要标为已读的简报");
      for (const it of input.items) {
        exactKeys(it, ["projectId", "digest"]);
        if (typeof it.projectId !== "string" || !PROJECT_ID.test(it.projectId))
          throw failure("项目无效");
        if (typeof it.digest !== "string" || !DIGEST.test(it.digest))
          throw failure("简报指纹无效");
      }
      const at = new Date(clock()).toISOString();
      const keep = localDay(new Date(clock() - BRIEF_KEEP_DAYS * 86400000));
      return repository.updateBriefReads((reads, stored) => {
        const ids = new Set((stored.connections?.projects || []).map((p) => p.id));
        if (input.items.some((it) => !ids.has(it.projectId)))
          throw failure("项目已不存在，请重新扫描", 404);
        let next = reads.filter((r) => r.date >= keep || r.date === input.date);
        for (const it of input.items) {
          const old = next.find((r) => r.date === input.date && r.projectId === it.projectId);
          if (old?.digest === it.digest) continue;
          const record = { schema: 1, date: input.date, projectId: it.projectId, digest: it.digest, at };
          next = old ? next.map((r) => (r === old ? record : r)) : [...next, record];
        }
        if (next.length > BRIEF_READS_LIMIT)
          next = [...next].sort((a, b) => a.at.localeCompare(b.at)).slice(-BRIEF_READS_LIMIT);
        return next;
      });
    },
  };
}

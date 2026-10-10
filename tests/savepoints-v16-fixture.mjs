import { fixture } from "./fixture.mjs";
import { seed } from "../src/store.js";
import { DEFAULT_IGNORE } from "../server/savepoint-git.mjs";
export const stamp189 = "2026-10-05T05:20:00.000Z";
export function data189(mode = "main") {
  const state = seed();
  state.notes = [];
  state.projects = [];
  const defs = [
    ["个人 AI 工作台", "Git", true],
    ["银饰作品集", "Git", true],
    ["旧博客", "Git", true],
    ["dotfiles", "Git", false],
    ["菜谱盒子", "Node", false],
    ["resume-site", "GitHub", false],
  ];
  const projects = defs.map(([name, kind, active], i) => ({
    id: "save-project-" + i,
    name,
    kind,
    active,
    localPaths:
      kind === "GitHub"
        ? []
        : [
            "/synthetic/Projects/" +
              ["workbench", "silver", "blog", "dotfiles", "recipes"][i],
          ],
    repoKey: kind === "GitHub" ? "synthetic/resume-site" : "",
    seenThisScan: true,
    recentUpdate: {
      state: "ok",
      source: kind === "GitHub" ? "GitHub" : "Git",
      at: i === 0 ? "2026-10-03T13:48:00.000Z" : stamp189,
      checkedAt: stamp189,
    },
  }));
  state.connections = {
    roots: ["/synthetic/Projects"],
    projects,
    agents: [],
    errors: [],
    truncated: false,
    projectScannedAt: stamp189,
    agentScannedAt: stamp189,
    github: {
      status: "connected",
      login: "synthetic",
      message: "",
      at: stamp189,
    },
  };
  const hash = (prefix, n = 0) =>
      (prefix + String(n).padStart(33, "0")).slice(0, 40),
    files = [
      { path: "src/Knowledge.jsx", kind: "M", added: 212, deleted: 480 },
      { path: "src/knowledge.css", kind: "M", added: 96, deleted: 210 },
      { path: "src/KnowledgeZones.jsx", kind: "A", added: 527, deleted: 0 },
      { path: "server/schema.mjs", kind: "M", added: 40, deleted: 8 },
      ...Array.from({ length: 42 }, (_, i) => ({
        path: `docs/changed-${i}.md`,
        kind: "A",
        added: 2,
        deleted: 0,
      })),
    ];
  const commits = [
    [
      "a41c9e2",
      "UI v14e 第 1 步：公共层 + 知识仓库",
      "WB-20261003-123",
      "2026-10-03T13:48:00.000Z",
      46,
      959,
      698,
      true,
    ],
    [
      "7be0d13",
      "认领 UI v14e 落地（逐页交用户确认）",
      "WB-20261003-122",
      "2026-10-03T12:10:00.000Z",
      2,
      18,
      6,
      true,
    ],
    [
      "c93f5a0",
      "归档 UI v14e 设计定稿（预览 + 说明）",
      "WB-20261003-121",
      "2026-10-03T11:02:00.000Z",
      31,
      2904,
      112,
      false,
      "v0.14",
    ],
    [
      "52d8e7b",
      "复核三项返修完成",
      "WB-20261003-117",
      "2026-10-03T03:40:00.000Z",
      18,
      406,
      233,
    ],
    [
      "e07a4c1",
      "1.4 来源维护收口",
      "WB-20260929-48",
      "2026-09-29T14:15:00.000Z",
      27,
      1130,
      498,
      false,
      "v0.13",
    ],
  ].map(
    ([
      h,
      message,
      stateId,
      at,
      fileCount,
      insertions,
      deletions,
      localOnly,
      tag,
    ]) => ({
      hash: hash(h),
      message,
      stateId,
      at,
      fileCount,
      insertions,
      deletions,
      localOnly,
      tags: tag ? [tag] : [],
      files: h === "a41c9e2" ? files : Array.from({length:fileCount},(_,i)=>({path:`docs/${h}-${i}.md`,kind:"M",added:i?0:insertions,deleted:i?0:deletions})),
      handoff:
        stateId === "WB-20261003-123"
          ? "docs/agents/handoffs/synthetic-123.md"
          : null,
    }),
  );
  const pendingFiles = [
    { path: "src/AgentsV16.jsx", kind: "M" },
    { path: "src/agents-v16.css", kind: "A" },
    { path: "src/relay-prompt.js", kind: "A" },
    { path: "src/WorkspacePages.jsx", kind: "M" },
    ...Array.from({ length: 124 }, (_, i) => ({
      path: `src/file-${i}.js`,
      kind: i < 20 ? "M" : "A",
    })),
    { path: "docs/design/ui-v16/briefs/08-savepoints.md", kind: "A" },
    ...Array.from({ length: 71 }, (_, i) => ({
      path: `docs/file-${i}.md`,
      kind: "A",
    })),
    ...Array.from({ length: 59 }, (_, i) => ({
      path: `tests/check-${i}.mjs`,
      kind: "M",
    })),
    { path: "CURRENT.md", kind: "M" },
    ...Array.from({ length: 22 }, (_, i) => ({
      path: `server/file-${i}.mjs`,
      kind: "M",
    })),
    {
      path: ".env.local",
      kind: "A",
      warning: "疑似凭据",
      blocked: "正文疑似凭据",
    },
    {
      path: "docs/raw-capture.mov",
      kind: "A",
      warning: "超过50 MB",
      blocked: "超过50 MB",
    },
  ].map((f, i) => ({
    ...f,
    added: i === 0 ? 12480 : 0,
    deleted: i === 0 ? 3210 : 0,
    selected: !f.blocked,
    fingerprint: "synthetic-" + i,
  }));
  const groups = new Map();
  for (const f of pendingFiles) {
    const d = f.path.includes("/") ? f.path.split("/")[0] + "/" : "根目录";
    groups.set(d, (groups.get(d) || 0) + 1);
  }
  const report = {
    state: mode === "commit" ? "main" : mode,
    projectId: projects[0].id,
    root: projects[0].localPaths[0],
    head: commits[0].hash,
    readOnly: mode === "cloud",
    reason: mode === "cloud" ? "仅云端项目，只读存档点" : null,
    files: pendingFiles,
    stats: {
      modified: pendingFiles.filter((f) => f.kind === "M").length,
      added: pendingFiles.filter((f) => f.kind === "A").length,
      deleted: 0,
      insertions: 12480,
      deletions: 3210,
      binary: 0,
    },
    directories: [...groups]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    current: { fields: { stateId: "WB-20261005-175" } },
    commits,
    total: 94,
    ahead: 2,
    days: 1,
    ageDays: (Date.parse(stamp189)-Date.parse(commits[0].at))/86400000,
    last: commits[0],
    offset: 0,
    hasMore: true,
    at: stamp189,
  };
  if (mode === "empty") {
    Object.assign(report, {
      head: null,
      commits: [],
      total: 0,
      ahead: null,
      days: null,
      ageDays: null,
      last: null,
      stats: {
        modified: 0,
        added: 37,
        deleted: 0,
        insertions: 2140,
        deletions: 0,
      },
      directories: [
        { name: "zsh/", count: 14 },
        { name: "git/", count: 9 },
        { name: "nvim/", count: 11 },
        { name: "bin/", count: 3 },
      ],
    });
    report.root = projects[3].localPaths[0];
    report.projectId = projects[3].id;
    report.files = report.directories.flatMap((d) =>
      Array.from({ length: d.count }, (_, i) => ({
        path: d.name + "file-" + i,
        kind: "A",
        added: i === 0 && d.name === "zsh/" ? 2140 : 0,
        deleted: 0,
        selected: true,
        fingerprint: "empty-" + d.name + i,
      })),
    );
    report.hasMore = false;
  }
  if (mode === "nogit") {
    report.projectId = projects[4].id;
    report.root = projects[4].localPaths[0];
    report.head = null;
    report.commits = [];
    report.total = 0;
    report.last = null;
    report.ahead = null;
    report.days = report.ageDays = null;
    report.defaultIgnore = DEFAULT_IGNORE;
    report.files = Array.from({length:15},(_,i)=>({path:i?`recipes/recipe-${i}.md`:"README.md",kind:"A",added:i?12:24,deleted:0,selected:true,fingerprint:"recipe-"+i}));
    report.stats = {modified:0,added:15,deleted:0,insertions:192,deletions:0,binary:0};
    report.directories = [{name:"recipes/",count:14},{name:"根目录",count:1}];
  }
  if (mode === "cloud") {
    report.projectId = projects[5].id;
    report.root = null;
    report.commits = [
      ["9f02b1d", "Add projects section", "2026-08-21T02:02:00Z", 4, 88, 12],
      [
        "41ce7a9",
        "Update resume 2026",
        "2026-07-18T14:40:00Z",
        2,
        36,
        30,
        "v2",
      ],
      ["0b77e5f", "Initial site", "2026-05-02T01:15:00Z", 23, 1204, 0],
    ].map(([h, message, at, fileCount, insertions, deletions, tag]) => ({
      hash: hash(h),
      message,
      at,
      fileCount,
      insertions,
      deletions,
      tags: tag ? [tag] : [],
      files: Array.from({length:fileCount},(_,i)=>({path:`src/${h}-${i}.jsx`,kind:"M",added:i?0:insertions,deleted:i?0:deletions})),
    }));
    report.total = null;
    report.hasMore = false;
    report.ahead = null;
    report.files = [];
  }
  const details = report.commits;
  if(mode==='cloud') {
    report.commits = details.map(({files,fileCount,insertions,deletions,...c})=>c);
    report.last = report.commits[0];
    report.head = null;
    report.stats = null;
    report.days = report.ageDays = null;
  }
  return {
    details,
    state,
    report,
    preview: {
      id: "11111111-1111-4111-8111-111111111111",
      expires: "2026-10-05T05:30:00.000Z",
      mode: mode === "nogit" ? "init" : "commit",
      files: mode === "nogit" ? [...report.files,{path:".gitignore",kind:"A",added:DEFAULT_IGNORE.split("\n").filter(Boolean).length,deleted:0,generated:true,selected:true,fingerprint:"generated-ignore"}] : report.files,
      defaultIgnore: DEFAULT_IGNORE,
      message:
        "WB-20261005-175 · UI v16 设计：智能体群验收、派单 173 / 175、随手记 / 项目空间 / 知识仓库 / 存档点简报与视觉稿",
    },
    calls: [],
    pending: [],
  };
}
export async function fixture189(mode = "main") {
  const data = data189(mode),
    app = await fixture();
  const { connections, ...state } = data.state;
  await app.repository.write(state, { initialize: true });
  await app.repository.updateConnections(() => connections);
  return { ...app, data };
}
export async function routes189(page, app, options = {}) {
  await page.route("**/api/savepoints/*", async (r) => {
    const action = new URL(r.request().url()).pathname.split("/").at(-1),
      body = r.request().postDataJSON();
    app.data.calls.push({ action, body });
    const d = app.data;
    if (options[action]) return options[action](r, body, d);
    if (action === "confirm") {
      const c = {
        hash: "f".repeat(40),
        message: body.message,
        at: stamp189,
        tags: [],
        fileCount: body.files.length,
        insertions: 12480,
        deletions: 3210,
        files: d.report.files.filter((f) => body.files.includes(f.path)),
      };
      d.report = {
        ...d.report,
        head: c.hash,
        last: c,
        days: 0,
        ageDays: 0,
        commits: [c, ...d.report.commits],
        total: d.report.total + 1,
        files: d.report.files.filter((f) => !body.files.includes(f.path)),
      };
    }
    const response =
      action === "inspect"
        ? { ...d.report, projectId: body.projectId, offset: body.offset || 0 }
        : action === "pending"
          ? { items: d.pending }
          : action === "preview"
            ? d.preview
            : action === "detail"
              ? (d.details || d.report.commits).find((c) => c.hash === body.hash) || {
                  files: [],
                }
              : action === "compare"
                ? d.comparison || {
                    text: "diff --git a/src/a.js b/src/a.js\n-old\n+new",
                    files: [],
                    untracked: 0,
                  }
                : action === "handoff"
                  ? {
                      path: "docs/agents/handoffs/synthetic-123.md",
                      text: "WB-20261003-123 · 合成交接",
                    }
                  : action === "confirm"
                    ? { state: "verified", hash: "f".repeat(40), id: body.id }
                    : action === "query"
                      ? { state: "verified", hash: "f".repeat(40), id: body.id }
                      : null;
    return r.fulfill(
      response
        ? { json: response }
        : { status: 404, json: { error: "合成未开放" } },
    );
  });
}

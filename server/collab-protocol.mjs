import { createHash } from "node:crypto";
import {
  readCurrentFile,
  resolveProjectRoot,
  gitRunner,
  notRepository,
  noCommits,
} from "./project-status.mjs";
import {
  parseProtocolHead,
  projectProtocolRuns,
  protocolPath,
  summarizeProtocolIssues,
} from "../src/collab-protocol.js";
import { filterRelayText } from "../src/relay-prompt.js";
const sha = (s) => createHash("sha256").update(s).digest("hex");
export async function readProtocolProjection({
  item,
  project,
  connections,
  canonical,
  path,
  currentFile,
  clock = Date.now,
  assets = [],
  runSettings = [],
}) {
  if (currentFile.state !== "read")
    return {
      state: currentFile.state,
      runs: [],
      issues: [currentFile.message || "未找到 CURRENT 协议"],
      fingerprint: "",
    };
  const current = parseProtocolHead(currentFile.text, { current: true, path }),
    documents = [],
    issues = [],
    readErrors = [];
  if (!current.fields.stateId && !current.fields.writer && !current.fields.next)
    return {
      state: "error",
      runs: [],
      issues: ["CURRENT 缺少可解析协作头表"],
      fingerprint: "",
    };
  for (const key of ["stateId", "writer", "next", "handoff"])
    if (!current.fields[key]) issues.push(`CURRENT 缺少 ${key}`);
  const indexed = (item.handoffs.files || []).map(
    (f) => `docs/agents/handoffs/${f.name}`,
  );
  const latest = [
    ...String(current.fields.handoff || "").matchAll(/\[[^\]]*\]\(([^)]+)\)/g),
  ]
    .map((m) => protocolPath(m[1]))
    .filter((p) => p.startsWith("docs/agents/handoffs/") && p.endsWith(".md"));
  const paths = [
    ...new Set([...latest.slice(0, 20), ...indexed.slice(0, 120)]),
  ];
  const hashes = { [path]: sha(currentFile.text) };
  const projectSettings = (Array.isArray(runSettings) ? runSettings : [])
    .filter((setting) => setting?.projectId === item.projectId);
  const lockedVersions = projectSettings.map((setting) => {
    const asset = (Array.isArray(assets) ? assets : []).find(
      (candidate) => candidate?.id === setting.templateAssetId,
    );
    const version = Array.isArray(asset?.versions) ? asset.versions.find(
      (candidate) => candidate.id === setting.templateVersionId,
    ) : null;
    return version
      ? { assetId: asset.id, versionId: version.id, title: version.title,
          workflowTemplate: version.workflowTemplate || null }
      : { assetId: setting.templateAssetId, versionId: setting.templateVersionId,
          missing: true };
  });
  hashes["@run-settings"] = sha(JSON.stringify([projectSettings, lockedVersions]));
  for (const p of paths) {
    const file = await readCurrentFile(canonical, p, 16 * 1024);
    if (file.state !== "read") {
      const message = `${p}：${file.message || file.state}`;
      issues.push(message);
      readErrors.push(message);
      continue;
    }
    hashes[p] = sha(file.text);
    const d = parseProtocolHead(file.text, { path: p });
    documents.push(d);
    if (d.missing.length) issues.push(`${p}：缺少 ${d.missing.join("、")}`);
    issues.push(...d.conflicts.map((v) => `${p}：${v}`));
    if (file.truncated) issues.push(`${p}：仅解析文首，文件超16KiB`);
  }
  const issuesByPath = {};
  const issueSnapshots = new Map();
  const issuePaths = [...new Set(projectSettings.map((setting) =>
    setting.issuesPath).filter(Boolean))];
  for (const issuePath of issuePaths) {
    if (!issuePath.startsWith("docs/") || !issuePath.endsWith(".md") ||
        protocolPath(issuePath) !== issuePath) {
      issuesByPath[issuePath] = { state: "unknown", path: issuePath,
        count: null, total: null, items: [], reason: "待议清单路径超出项目 docs 范围" };
      issues.push(`${issuePath}：待议清单路径无效`);
      continue;
    }
    const file = await readCurrentFile(canonical, issuePath, 256 * 1024);
    const marker = file.state === "read"
      ? `${sha(file.text)}:${file.truncated ? "partial" : "complete"}`
      : file.state;
    hashes[`@issues:${issuePath}`] = marker;
    issueSnapshots.set(issuePath, marker);
    if (file.state !== "read" || file.truncated) {
      const reason = file.truncated
        ? "待议清单超过256KiB，条数未知"
        : file.message || "待议清单未找到，条数未知";
      issuesByPath[issuePath] = { state: "unknown", path: issuePath,
        count: null, total: null, items: [], reason };
      issues.push(`${issuePath}：${reason}`);
      continue;
    }
    issuesByPath[issuePath] = summarizeProtocolIssues(file.text, issuePath);
    if (issuesByPath[issuePath].state !== "ok")
      issues.push(`${issuePath}：${issuesByPath[issuePath].reason}`);
  }
  let git = { state: "unknown", commits: [], message: "" };
  try {
    const run = gitRunner(canonical),
      top = (await run(["rev-parse", "--show-toplevel"])).trim();
    if (top !== canonical) throw Error("Git顶层不是登记目录");
    const rows = (
      await run([
        "-c",
        "log.showSignature=false",
        "log",
        "-40",
        "--format=%H%x09%cI%x09%s",
        "--no-decorate",
      ])
    )
      .trim()
      .split("\n")
      .filter(Boolean);
    git = {
      state: "ok",
      commits: rows.map((row) => {
        const [hash, at, ...title] = row.split("\t");
        return {
          hash,
          at,
          title: filterRelayText(title.join(" ")).text.slice(0, 300),
        };
      }),
      truncated: rows.length === 40,
    };
  } catch (e) {
    git = {
      state: notRepository(e) ? "absent" : noCommits(e) ? "empty" : "error",
      commits: [],
      message: "Git存档佐证未读到，未据此推断验收",
    };
  }
  for (const p of paths.filter((p) => hashes[p])) {
    const check = await readCurrentFile(canonical, p, 16 * 1024);
    if (check.state !== "read" || sha(check.text) !== hashes[p])
      return {
        state: "error",
        runs: [],
        issues: ["读取期间交接文件变化，请重新读取"],
        fingerprint: "",
      };
  }
  for (const [issuePath, marker] of issueSnapshots) {
    const check = await readCurrentFile(canonical, issuePath, 256 * 1024);
    const checkMarker = check.state === "read"
      ? `${sha(check.text)}:${check.truncated ? "partial" : "complete"}`
      : check.state;
    if (checkMarker !== marker)
      return { state: "error", runs: [], issues: ["读取期间待议清单变化，请重新读取"], fingerprint: "" };
  }
  const again = await readCurrentFile(canonical, path, 1024 * 1024),
    identity = await resolveProjectRoot(project, connections);
  if (
    again.state !== "read" ||
    sha(again.text) !== hashes[path] ||
    identity.error ||
    identity.canonical !== canonical
  )
    return {
      state: "error",
      runs: [],
      issues: ["读取期间 CURRENT 或项目身份变化，请重新读取"],
      fingerprint: "",
    };
  const partial =
    !!currentFile.truncated ||
    indexed.length > 120 ||
    item.handoffs.state === "error" ||
    issues.length > 0;
  if (indexed.length > 120)
    issues.push("交接超过120份，仅解析最新范围与CURRENT引用");
  if (item.handoffs.state === "error") issues.push(item.handoffs.message);
  return {
    state: partial ? "partial" : "ok",
    copyBlocked:
      readErrors.length > 0 ||
      item.handoffs.state === "error" ||
      ["stateId", "writer", "next", "handoff"].some((k) => !current.fields[k]),
    readErrors,
    runs: projectProtocolRuns({
      projectId: item.projectId,
      name: item.name,
      current,
      documents,
      git,
      now: clock(),
      partial,
      assets,
      runSettings: projectSettings,
      issuesByPath,
    }),
    issues,
    fingerprint: sha(JSON.stringify(hashes)),
    unassigned: documents
      .filter((d) => !d.fields.runId && !latest.includes(d.path))
      .map((d) => ({ path: d.path, title: d.heading || d.path })),
    git,
  };
}

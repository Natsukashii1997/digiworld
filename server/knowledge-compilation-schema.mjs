import { createHash } from "node:crypto";

const invalid = () => {
  throw Object.assign(new Error("知识整理数据格式或身份无效"), { status: 400 });
};
export function exact(value, fields) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== fields.length ||
    fields.some((key) => !Object.hasOwn(value, key))
  )
    invalid();
}
export function string(value, max, { multiline = false } = {}) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    (multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/).test(
      value,
    )
  )
    invalid();
}
export function identifier(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value))
    invalid();
}
export function sha(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) invalid();
}
function date(value) {
  string(value, 40);
  if (!Number.isFinite(Date.parse(value))) invalid();
}
function list(value, max, min = 0) {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    invalid();
}
function unique(values) {
  if (new Set(values).size !== values.length) invalid();
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
export const compilationHash = (value) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
export const manifestHash = (task) =>
  compilationHash({
    schema: task.schema,
    id: task.id,
    question: task.question,
    evidence: task.evidence,
    ...(task.basedOn ? { basedOn: task.basedOn } : {}),
  });
export function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0) invalid();
}
export function validateCandidate(candidate, task) {
  let bytes;
  try {
    bytes = Buffer.byteLength(JSON.stringify(candidate));
  } catch {
    invalid();
  }
  if (bytes > 64 * 1024) invalid();
  exact(candidate, [
    "schema",
    "taskId",
    "manifestHash",
    "title",
    "summary",
    "claims",
    "conflicts",
    "unknowns",
    "relations",
  ]);
  if (
    candidate.schema !== 1 ||
    candidate.taskId !== task.id ||
    candidate.manifestHash !== task.manifestHash
  )
    invalid();
  string(candidate.title, 200);
  string(candidate.summary, 4000, { multiline: true });
  list(candidate.claims, 30, 1);
  list(candidate.conflicts, 20);
  list(candidate.unknowns, 20);
  list(candidate.relations, 20);
  unique(candidate.claims.map((claim) => claim?.id));
  const allowed = new Set(task.evidence.map((item) => item.id));
  function refs(values, min = 1) {
    list(values, 5, min);
    unique(values);
    for (const value of values) if (!allowed.has(value)) invalid();
  }
  for (const claim of candidate.claims) {
    exact(claim, ["id", "text", "kind", "evidenceIds"]);
    identifier(claim.id);
    string(claim.text, 2000, { multiline: true });
    if (!["source_statement", "analysis", "hypothesis"].includes(claim.kind))
      invalid();
    refs(claim.evidenceIds);
  }
  for (const [name, min] of [
    ["conflicts", 2],
    ["relations", 1],
  ])
    for (const item of candidate[name]) {
      exact(item, ["text", "evidenceIds"]);
      string(item.text, 2000, { multiline: true });
      refs(item.evidenceIds, min);
    }
  for (const item of candidate.unknowns)
    string(item, 2000, { multiline: true });
  return candidate;
}
export function validateKnowledgeTasks(tasks) {
  list(tasks, 50);
  unique(tasks.map((task) => task?.id));
  unique(tasks.map((task) => task?.requestId));
  for (const task of tasks)
    if (!task || typeof task !== "object" || Array.isArray(task)) invalid();
  for (const task of tasks) {
    exact(task, [
      "schema",
      "id",
      "requestId",
      "question",
      "createdAt",
      "manifestHash",
      "evidence",
      "candidates",
      "archived",
      ...(Object.hasOwn(task, "basedOn") ? ["basedOn"] : []),
    ]);
    if (Object.hasOwn(task, "basedOn")) {
      exact(task.basedOn, ["taskId", "manifestHash"]);
      identifier(task.basedOn.taskId);
      sha(task.basedOn.manifestHash);
      const parent = tasks.find((value) => value.id === task.basedOn.taskId);
      if (
        !parent ||
        parent.id === task.id ||
        parent.manifestHash !== task.basedOn.manifestHash
      )
        invalid();
      const visited = new Set([task.id]);
      let cursor = parent;
      while (cursor) {
        if (visited.has(cursor.id)) invalid();
        visited.add(cursor.id);
        cursor = tasks.find((value) => value.id === cursor.basedOn?.taskId);
      }
    }
    if (task.schema !== 1 || typeof task.archived !== "boolean") invalid();
    identifier(task.id);
    identifier(task.requestId);
    string(task.question, 500, { multiline: true });
    date(task.createdAt);
    sha(task.manifestHash);
    list(task.evidence, 5, 1);
    unique(task.evidence.map((item) => item?.id));
    unique(
      task.evidence.map((item) => JSON.stringify([item?.sourceId, item?.path])),
    );
    for (const item of task.evidence) {
      exact(item, [
        "id",
        "sourceId",
        "sourceName",
        "root",
        "identity",
        "generation",
        "path",
        "bytes",
        "modifiedAt",
        "fingerprint",
        "sha256",
        "readAt",
      ]);
      for (const key of ["id", "sourceId", "generation"]) identifier(item[key]);
      string(item.sourceName, 100);
      string(item.root, 2000);
      string(item.path, 1000);
      if (
        !item.root.startsWith("/") ||
        /[\\:]/.test(item.root) ||
        item.root.split("/").some((part) => part === "." || part === "..") ||
        !/\.md$/i.test(item.path) ||
        /[\\:]/.test(item.path) ||
        item.path.split("/").some((part) => !part || part.startsWith("."))
      )
        invalid();
      for (const key of ["identity", "fingerprint", "sha256"]) sha(item[key]);
      if (
        !Number.isSafeInteger(item.bytes) ||
        item.bytes < 0 ||
        item.bytes > 256 * 1024
      )
        invalid();
      date(item.modifiedAt);
      date(item.readAt);
    }
    if (task.manifestHash !== manifestHash(task)) invalid();
    list(task.candidates, 10);
    unique(task.candidates.map((version) => version?.id));
    unique(task.candidates.map((version) => version?.sha256));
    for (const version of task.candidates) {
      exact(version, ["id", "receivedAt", "sha256", "candidate"]);
      identifier(version.id);
      date(version.receivedAt);
      sha(version.sha256);
      validateCandidate(version.candidate, task);
      if (version.sha256 !== compilationHash(version.candidate)) invalid();
    }
  }
  return tasks;
}

export function validateKnowledgeHistory(previous = [], next = []) {
  for (const old of previous) {
    const task = next.find((value) => value.id === old.id);
    if (!task) invalid();
    const {
      candidates: oldVersions,
      archived: oldArchived,
      ...oldIdentity
    } = old;
    const { candidates: versions, archived, ...identity } = task;
    if (
      compilationHash(identity) !== compilationHash(oldIdentity) ||
      (oldArchived && !archived) ||
      versions.length < oldVersions.length ||
      oldVersions.some(
        (value, index) =>
          compilationHash(value) !== compilationHash(versions[index]),
      )
    )
      invalid();
  }
}

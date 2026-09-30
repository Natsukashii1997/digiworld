import {
  validateSkillFiles,
  inspectSkill,
  fileBytes,
} from "./skill-package.js";

function relativeFiles(files) {
  validateSkillFiles(files);
  const { root } = inspectSkill(files);
  const entries = new Map(
    files
      .filter((file) => file.path.startsWith(root))
      .map((file) => [
        file.path.slice(root.length),
        {
          data: fileBytes(file),
          mode: file.mode ?? null,
          directory: file.directory === true,
        },
      ]),
  );
  for (const path of [...entries.keys()]) {
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index++) {
      const parent = parts.slice(0, index).join("/");
      if (!entries.has(parent))
        entries.set(parent, {
          data: new Uint8Array(),
          mode: null,
          directory: true,
        });
    }
  }
  return entries;
}
const metadata = (entry) =>
  entry
    ? { bytes: entry.data.length, mode: entry.mode, directory: entry.directory }
    : null;

export function compareSkillCopy(expectedFiles, actualFiles) {
  const expected = relativeFiles(expectedFiles);
  const actual = relativeFiles(actualFiles);
  const files = [];
  const permissionsKnown = [...expected.values(), ...actual.values()].every(
    (file) => file.mode !== null,
  );
  for (const path of [
    ...new Set([...expected.keys(), ...actual.keys()]),
  ].sort()) {
    const before = expected.get(path),
      after = actual.get(path);
    if (!before || !after) {
      files.push({
        path,
        status: before ? "removed" : "added",
        changes: (before || after).mode === null ? ["mode_unknown"] : [],
        expected: metadata(before),
        actual: metadata(after),
      });
      continue;
    }
    const changes = [];
    if (
      before.data.length !== after.data.length ||
      !before.data.every((value, index) => value === after.data[index])
    )
      changes.push("content");
    if (
      before.mode !== null &&
      after.mode !== null &&
      before.mode !== after.mode
    )
      changes.push("mode");
    if (before.directory !== after.directory) changes.push("type");
    if (before.mode === null || after.mode === null)
      changes.push("mode_unknown");
    if (changes.length)
      files.push({
        path,
        status: changes.some((change) => change !== "mode_unknown")
          ? "modified"
          : "unverified",
        changes,
        expected: metadata(before),
        actual: metadata(after),
      });
  }
  return {
    status: files.some((file) => file.status !== "unverified")
      ? "different"
      : permissionsKnown
        ? "identical"
        : "unverified",
    permissionsKnown,
    counts: { expected: expected.size, actual: actual.size },
    files,
  };
}

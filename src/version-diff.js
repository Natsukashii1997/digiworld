import { fileBytes } from "./skill-package.js";

export function compareVersions(before, after) {
  const fields = [];
  for (const [key, label] of [
    ["title", "名称"],
    ["description", "描述"],
    ["source", "来源"],
    ["tags", "标签"],
    ["references", "资产引用"],
  ]) {
    const left = ["tags", "references"].includes(key)
      ? JSON.stringify(before[key] || [])
      : before[key] || "";
    const right = ["tags", "references"].includes(key)
      ? JSON.stringify(after[key] || [])
      : after[key] || "";
    if (left !== right) fields.push({ key, label, before: left, after: right });
  }
  const contentChanged = (before.content || "") !== (after.content || "");
  const files = [];
  const leftFiles = new Map(
    (before.files || []).map((file) => [file.path, file]),
  );
  const rightFiles = new Map(
    (after.files || []).map((file) => [file.path, file]),
  );
  const paths = [
    ...new Set([...leftFiles.keys(), ...rightFiles.keys()]),
  ].sort();
  for (const path of paths) {
    const left = leftFiles.get(path) || null;
    const right = rightFiles.get(path) || null;
    const changes = [];
    if (left && right) {
      const leftBytes = fileBytes(left);
      const rightBytes = fileBytes(right);
      if (
        leftBytes.length !== rightBytes.length ||
        leftBytes.some((byte, i) => byte !== rightBytes[i])
      )
        changes.push("content");
      if (left.mode !== right.mode) changes.push("mode");
      if ((left.directory === true) !== (right.directory === true))
        changes.push("type");
    }
    if (!left || !right || changes.length)
      files.push({
        path,
        status: !left ? "added" : !right ? "removed" : "modified",
        before: left,
        after: right,
        changes,
      });
  }
  return {
    fields,
    files,
    contentChanged,
    identical: !fields.length && !files.length && !contentChanged,
  };
}

export function diffText(before, after) {
  const normalize = (text) => text.replace(/\r\n?/g, "\n");
  const formatOnly = before !== after && normalize(before) === normalize(after);
  const full = { mode: "full", rows: [], formatOnly };
  if (before.length > 100000 || after.length > 100000) return full;
  // Each token retains its terminator, including CRLF and the final newline.
  const lines = (text) => text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) || [];
  const left = lines(before);
  const right = lines(after);
  const width = right.length + 1;
  if (
    left.length > 1000 ||
    right.length > 1000 ||
    (left.length + 1) * width > 250000
  )
    return full;
  const common = new Uint16Array((left.length + 1) * width);
  for (let i = left.length - 1; i >= 0; i--)
    for (let j = right.length - 1; j >= 0; j--)
      common[i * width + j] =
        left[i] === right[j]
          ? common[(i + 1) * width + j + 1] + 1
          : Math.max(common[(i + 1) * width + j], common[i * width + j + 1]);
  const rows = [];
  let i = 0,
    j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      rows.push({ type: "same", text: left[i] });
      i++;
      j++;
    } else if (
      i < left.length &&
      (j === right.length ||
        common[(i + 1) * width + j] >= common[i * width + j + 1])
    ) {
      rows.push({ type: "removed", text: left[i++] });
    } else {
      rows.push({ type: "added", text: right[j++] });
    }
  }
  return { mode: "lines", rows, formatOnly };
}

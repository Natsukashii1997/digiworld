import { lstat } from "node:fs/promises";
import { validateReverseTarget } from "../src/reverse-recipe.js";
const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
// Metadata only. Never read an artifact, resolve a symlink, start REA or fetch a URL.
export async function checkReverseTarget(input, { stat = lstat } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((k) => k !== "path")) fail("只接受本机目标path");
  validateReverseTarget({ kind: "electron", path: input.path, feature: "路径检查", authorized: true });
  const path = input.path.replace(/\/+$/, "");
  const checked = [];
  async function inspect(value) {
    let current = "", result;
    const parts = value.split("/").filter(Boolean);
    if (parts.length > 128) fail("目标路径层级过深");
    for (const [i, part] of parts.entries()) {
      current += "/" + part;
      try { result = await stat(current); }
      catch (error) {
        if (error.code === "ENOENT") return null;
        fail("无法检查目标路径，请确认访问权限后重试");
      }
      if (result.isSymbolicLink()) fail("目标路径及其祖先不能是符号链接");
      if (i < parts.length - 1 && !result.isDirectory()) fail("目标路径祖先不是目录");
      checked.push([current, result]);
    }
    return result;
  }
  const info = await inspect(path);
  let kind = null, appAsarExists;
  if (info) {
    if (path.endsWith(".app") && info.isDirectory()) {
      kind = "app";
      const asar = await inspect(path + "/Contents/Resources/app.asar");
      appAsarExists = !!asar?.isFile();
    } else if (path.endsWith(".asar") && info.isFile()) kind = "asar";
    else if (info.isDirectory() && !path.endsWith(".asar")) kind = "dir";
    else fail("目标须为.app、.asar或已解包目录");
  }
  // Refuse observations if any inspected identity changed during this check.
  for (const [value, previous] of checked) {
    let next;
    try { next = await stat(value); } catch { fail("路径在检查期间变化，请重新检查"); }
    if (next.isSymbolicLink() || next.dev !== previous.dev || next.ino !== previous.ino || next.mode !== previous.mode)
      fail("路径在检查期间变化，请重新检查");
  }
  return { exists: !!info, kind, ...(kind === "app" ? { appAsarExists } : {}) };
}

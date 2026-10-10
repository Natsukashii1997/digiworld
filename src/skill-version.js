import {
  fileBytes,
  inspectSkill,
  validateSkillFiles,
} from "./skill-package.js";
import { safePath } from "./store.js";
import { validateMedia } from "./reverse-recipe.js";
const fail = (m) => {
  throw new Error(m);
};
export const MEDIA_MANIFEST_KIND = "guiji-local-media/v1";
export function planSkillVersion(version) {
  if (!version || !Array.isArray(version.files)) fail("Skill 版本文件无效");
  validateSkillFiles(version.files);
  const { root } = inspectSkill(version.files);
  const media =
    version.mediaManifest === undefined ? [] : version.mediaManifest;
  if (!Array.isArray(media) || media.length > 300) fail("Skill 媒体清单无效");
  let byteLength = version.files.reduce((n, f) => n + fileBytes(f).length, 0);
  const names = new Map(),
    kinds = new Map();
  function add(path, directory = false) {
    if (
      !safePath(path) ||
      path.length > 500 ||
      path.split("/").includes(".") ||
      /[\x00-\x1f\x7f:]/.test(path)
    )
      fail("Skill 媒体目标路径不安全");
    const parts = path.split("/");
    for (let n = 1; n <= parts.length; n++) {
      const prefix = parts.slice(0, n).join("/"),
        key = prefix.normalize("NFC").toLowerCase();
      if (names.has(key) && names.get(key) !== prefix)
        fail("Skill 媒体路径大小写或Unicode冲突");
      names.set(key, prefix);
      if (n < parts.length && kinds.get(key) === false)
        fail("Skill 媒体文件与目录冲突");
    }
    const key = path.normalize("NFC").toLowerCase();
    if (
      kinds.has(key) ||
      (!directory && [...kinds.keys()].some((k) => k.startsWith(key + "/")))
    )
      fail("Skill 媒体目标与文件冲突");
    kinds.set(key, directory);
  }
  for (const f of version.files) add(f.path, !!f.directory);
  for (const m of media) {
    if (
      !m ||
      typeof m !== "object" ||
      Array.isArray(m) ||
      Object.keys(m).sort().join(",") !== "file,path,sha256,size,type"
    )
      fail("Skill 媒体清单字段无效");
    if (
      !safePath(m.path) ||
      m.path.length > 500 ||
      m.path.split("/").includes(".") ||
      /[\x00-\x1f\x7f:]/.test(m.path)
    )
      fail("Skill媒体包内路径不安全");
    validateMedia({
      path: m.file,
      size: m.size,
      sha256: m.sha256,
      type: m.type,
    });
    add(root + m.path);
    byteLength += m.size;
  }
  if (
    version.files.length + media.length > 300 ||
    byteLength > 25 * 1024 * 1024
  )
    fail("完整 Skill 超过300项或25 MiB限制");
  if (media.length) {
    const markers = version.files.filter(
      (f) => f.path === root + "media-manifest.json" && f.text && !f.directory,
    );
    if (markers.length !== 1) fail("本机媒体版本缺少可核对的媒体清单文件");
    let declared;
    try {
      declared = JSON.parse(markers[0].data);
    } catch {
      fail("媒体清单文件不是完整JSON");
    }
    if (
      !declared ||
      declared.kind !== MEDIA_MANIFEST_KIND ||
      Object.keys(declared).sort().join(",") !== "entries,kind" ||
      !Array.isArray(declared.entries) ||
      declared.entries.length !== media.length ||
      declared.entries.some(
        (m, i) =>
          !m ||
          Object.keys(m).sort().join(",") !== "file,path,sha256,size,type" ||
          ["path", "file", "size", "sha256", "type"].some(
            (k) => m[k] !== media[i][k],
          ),
      )
    )
      fail("媒体清单文件与固定版本引用不一致");
  }
  return {
    root,
    media,
    byteLength,
    fileCount: version.files.length + media.length,
  };
}
export async function materializeSkillVersion(version, { readMedia } = {}) {
  const plan = planSkillVersion(version),
    files = structuredClone(version.files);
  if (plan.media.length && !readMedia)
    fail("本机媒体尚未读取；请使用本机交付复制完整 Skill，不能导出缺图包");
  for (const m of plan.media) {
    const metadata = {
        path: m.file,
        size: m.size,
        sha256: m.sha256,
        type: m.type,
      },
      result = await readMedia(metadata);
    if (
      !(result?.data instanceof Uint8Array) ||
      result.data.length !== m.size ||
      ["path", "size", "sha256", "type"].some((k) => result[k] !== metadata[k])
    )
      fail("Skill 媒体回读与清单不一致");
    const data = new Uint8Array(result.data),
      hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
        (v) => v.toString(16).padStart(2, "0"),
      ).join("");
    if (hash !== m.sha256) fail("Skill 媒体 SHA256 不一致，未交付整包");
    files.push({ path: plan.root + m.path, data, text: false, mode: 0o600 });
  }
  validateSkillFiles(files);
  return {
    files,
    info: inspectSkill(files),
    byteLength: plan.byteLength,
    mediaCount: plan.media.length,
  };
}

import { planSkillVersion, materializeSkillVersion } from "./skill-version.js";
import { isInstallSkill } from "./skill-install.js";
import { request } from "./api.js";
const browserMediaReader =
  typeof window === "undefined"
    ? undefined
    : (m) => request("/reverse/media/read", m);
import { zipSync, strToU8 } from "fflate";
import {
  buildSkillZip,
  fileBytes,
  validateSkillFiles,
} from "./skill-package.js";

export function resolveReferences(version, assets) {
  return (version.references || []).map(({ assetId, versionId }) => {
    const asset = assets.find((candidate) => candidate.id === assetId);
    const index =
      asset?.versions.findIndex((candidate) => candidate.id === versionId) ??
      -1;
    const selected = asset?.versions[index];
    const status = !asset
      ? "missing-asset"
      : !selected
        ? "missing-version"
        : !["Skill", "Prompt"].includes(asset.type) || isInstallSkill(selected)
          ? "invalid-type"
          : asset.archived
            ? "archived"
            : index === asset.versions.length - 1
              ? "current"
              : "updated";
    return {
      assetId,
      versionId,
      asset,
      version: selected,
      ...(selected ? { number: index + 1 } : {}),
      status,
      usable: status === "current" || status === "updated",
    };
  });
}

export function referencedDemoIds(assets) {
  const demoIds = new Set(
    assets.filter((asset) => asset.demo).map((asset) => asset.id),
  );
  const protectedIds = new Set();
  for (const asset of assets) {
    if (asset.demo || asset.type !== "Workflow") continue;
    for (const version of asset.versions)
      for (const reference of version.references || [])
        if (demoIds.has(reference.assetId)) protectedIds.add(reference.assetId);
  }
  return protectedIds;
}

function usableReferences(version, assets) {
  const pointers = version.references || [];
  if (!Array.isArray(pointers) || pointers.length > 50)
    throw new Error("工作流最多支持 50 个引用");
  const seen = new Set();
  for (const reference of pointers) {
    assertId(reference?.assetId);
    assertId(reference?.versionId);
    if (seen.has(reference.assetId)) throw new Error("工作流包含重复引用资产");
    seen.add(reference.assetId);
  }
  const resolved = resolveReferences(version, assets);
  const messages = {
    "missing-asset": "引用资产已缺失",
    "missing-version": "引用版本已缺失",
    archived: "引用资产已归档",
    "invalid-type": "仅支持引用自建 Skill 或 Prompt",
  };
  const invalid = resolved.find((reference) => !reference.usable);
  if (invalid)
    throw new Error(
      `${messages[invalid.status]}：${invalid.assetId} / ${invalid.versionId}。请先修正引用。`,
    );
  return resolved;
}

function assertId(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))
    throw new Error("资产或版本 ID 无效");
}

function referencePath(reference) {
  return reference.asset.type === "Skill"
    ? `refs/skills/${reference.assetId}/${reference.versionId}.zip`
    : `refs/prompts/${reference.assetId}/${reference.versionId}.md`;
}

export function workflowText(version, assets) {
  return renderWorkflowText(version, boundedReferences(version, assets));
}

function renderWorkflowText(version, references) {
  if (!references.length) return version.content;
  return `${version.content}\n\n---\n\n## 固定版本引用\n\n${references
    .map((reference, index) => {
      const {
        asset,
        version: selected,
        assetId,
        versionId,
        number,
      } = reference;
      const header = `### ${index + 1}. ${selected.title} · ${asset.type} · v${number}.0\n\n资产 ID：${assetId}\n版本 ID：${versionId}\n配套路径：${referencePath(reference)}`;
      return asset.type === "Prompt"
        ? `${header}\n\n${selected.content}`
        : `${header}\n\n需随流程附送此完整 Skill ZIP；纯剪贴板不包含 Skill 文件。`;
    })
    .join("\n\n")}`;
}

async function checksum(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function boundedReferences(version, assets) {
  const references = usableReferences(version, assets);
  let inputBytes = strToU8(version.content).length;
  const checkBudget = () => {
    if (inputBytes > 25 * 1024 * 1024)
      throw new Error("流程与引用的原始输入合计超过 25 MiB，请减少引用后重试");
  };
  checkBudget();
  for (const reference of references) {
    if (reference.asset.type === "Prompt") {
      inputBytes += strToU8(reference.version.content).length;
      checkBudget();
    } else {
      inputBytes += planSkillVersion(reference.version).byteLength;
      checkBudget();
    }
  }
  return references;
}

export async function buildWorkflowBundle(
  asset,
  version,
  assets,
  { readMedia = browserMediaReader } = {},
) {
  if (asset.type !== "Workflow") throw new Error("仅支持导出工作流引用包");
  if (asset.archived) throw new Error("工作流已归档，请先取消归档");
  assertId(asset.id);
  assertId(version.id);
  version = asset.versions.find((candidate) => candidate.id === version.id);
  if (!version) throw new Error("工作流版本已缺失，请刷新后重试");
  const references = boundedReferences(version, assets);
  const entries = Object.create(null);
  const records = [];
  const paths = new Set();
  for (const reference of references) {
    const file = referencePath(reference);
    if (paths.has(file.toLowerCase()))
      throw new Error("引用包路径存在大小写冲突，请移除冲突引用后重试");
    paths.add(file.toLowerCase());
    const bytes =
      reference.asset.type === "Skill"
        ? buildSkillZip(
            (await materializeSkillVersion(reference.version, { readMedia }))
              .files,
          )
        : strToU8(reference.version.content);
    entries[file] = bytes;
    records.push({
      type: reference.asset.type,
      assetId: reference.assetId,
      versionId: reference.versionId,
      number: reference.number,
      title: reference.version.title,
      file,
      sha256: await checksum(bytes),
    });
  }
  const bytes = strToU8(renderWorkflowText(version, references));
  entries["workflow.md"] = bytes;
  entries["manifest.json"] = strToU8(
    JSON.stringify(
      {
        schemaVersion: 1,
        workflow: {
          type: "Workflow",
          assetId: asset.id,
          versionId: version.id,
          number:
            asset.versions.findIndex(
              (candidate) => candidate.id === version.id,
            ) + 1,
          title: version.title,
          file: "workflow.md",
          sha256: await checksum(bytes),
        },
        references: records,
      },
      null,
      2,
    ),
  );
  return zipSync(entries, { level: 6, mtime: new Date(1980, 0, 1) });
}

// 工作流 B：下载部署包只产生文件夹结构，固定版本不漂移，不安装、不执行。
export async function buildWorkflowDeploymentBundle(
  asset,
  version,
  assets,
  { readMedia = browserMediaReader } = {},
) {
  if (asset.type !== "Workflow") throw new Error("仅支持导出工作流部署包");
  if (asset.archived) throw new Error("工作流已归档，请先取消归档");
  assertId(asset.id);
  assertId(version.id);
  version = asset.versions.find((candidate) => candidate.id === version.id);
  if (!version) throw new Error("工作流版本已缺失，请刷新后重试");
  const references = boundedReferences(version, assets);
  const root = `workflow-${asset.id}-${version.id}`,
    entries = Object.create(null),
    files = [],
    canonical = new Map(),
    kinds = new Map();
  async function add(
    path,
    bytes,
    { type = "generated", directory = false, mode } = {},
  ) {
    const parts = path.split("/");
    for (let n = 1; n <= parts.length; n++) {
      const prefix = parts.slice(0, n).join("/"),
        key = prefix.normalize("NFC").toLowerCase(),
        previous = canonical.get(key);
      if (previous && previous !== prefix)
        throw new Error("部署包路径存在大小写或 Unicode 冲突");
      canonical.set(key, prefix);
      if (n < parts.length && kinds.get(key) === false)
        throw new Error("部署包含文件与目录冲突");
    }
    const key = path.normalize("NFC").toLowerCase();
    if (kinds.has(key)) throw new Error("部署包含重复路径");
    if (
      !directory &&
      [...kinds.keys()].some((existing) => existing.startsWith(key + "/"))
    )
      throw new Error("部署包含文件与目录冲突");
    kinds.set(key, directory);
    const options = { level: 6, mtime: new Date(1980, 0, 1) };
    if (mode !== undefined) {
      options.os = 3;
      options.attrs = ((directory ? 0o40000 : 0o100000) | mode) << 16;
    }
    if (directory) options.attrs = (options.attrs || 0) | 16;
    entries[`${root}/${path}${directory ? "/" : ""}`] = [bytes, options];
    files.push({
      path,
      type,
      directory,
      size: bytes.length,
      sha256: directory ? null : await checksum(bytes),
      mode: mode ?? null,
    });
  }
  const records = [];
  for (const reference of references) {
    const {
      assetId,
      versionId,
      asset: dependency,
      version: selected,
      number,
    } = reference;
    const base =
      dependency.type === "Skill"
        ? `assets/skills/${assetId}/${versionId}`
        : `assets/prompts/${assetId}/${versionId}.md`;
    if (dependency.type === "Skill") {
      const complete = (await materializeSkillVersion(selected, { readMedia }))
        .files;
      for (const file of [...complete].sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
      ))
        await add(`${base}/${file.path}`, fileBytes(file), {
          type: "Skill",
          directory: file.directory === true,
          mode: file.mode,
        });
    } else await add(base, strToU8(selected.content), { type: "Prompt" });
    records.push({
      type: dependency.type,
      assetId,
      versionId,
      number,
      title: selected.title,
      path: base,
    });
  }
  const explanation = records.length
    ? `\n\n---\n\n## 固定版本依赖\n\n${records.map((r, i) => `### ${i + 1}. ${r.title} · ${r.type} · v${r.number}.0\n\n资产 ID：${r.assetId}\n版本 ID：${r.versionId}\n配套路径：${r.path}`).join("\n\n")}`
    : "";
  await add("workflow.md", strToU8(version.content + explanation), {
    type: "Workflow",
  });
  await add(
    "README.md",
    strToU8(
      `部署包：${version.title}\n\n1. 解压后保留整个 ${root} 文件夹。\n2. 将整个文件夹复制到目标 Agent 的工作区，打开 workflow.md 查看流程和固定版本依赖路径。\n3. 本包未安装、未执行任何 Agent；采用与执行结果需在目标环境确认。\n\nmanifest.json 记录每个内容文件的 SHA256、固定版本与原始文件权限。权限为 null 表示来源未记录，不能由本包推断。清单不包含自身哈希。\n`,
    ),
  );
  entries[`${root}/manifest.json`] = [
    strToU8(
      JSON.stringify(
        {
          schemaVersion: 1,
          kind: "workflow-deployment",
          root,
          workflow: {
            assetId: asset.id,
            versionId: version.id,
            number: asset.versions.findIndex((v) => v.id === version.id) + 1,
            title: version.title,
            path: "workflow.md",
          },
          references: records,
          files,
        },
        null,
        2,
      ),
    ),
    { level: 6, mtime: new Date(1980, 0, 1) },
  ];
  return zipSync(entries);
}

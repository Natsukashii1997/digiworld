import { zipSync, strToU8 } from "fflate";
import { buildSkillZip, fileBytes } from "./skill-package.js";

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
        : !["Skill", "Prompt"].includes(asset.type)
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
    "invalid-type": "仅支持引用 Skill 或 Prompt",
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
      for (const file of reference.version.files) {
        inputBytes += fileBytes(file).length;
        checkBudget();
      }
    }
  }
  return references;
}

export async function buildWorkflowBundle(asset, version, assets) {
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
        ? buildSkillZip(reference.version.files)
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

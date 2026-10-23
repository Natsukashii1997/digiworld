import { inspectSkill, validateSkillFiles } from "./skill-package.js";

export function hasSkillPackage(asset, version) {
  return asset.type === "Skill" || (asset.type === "Design" && version?.design?.kind === "skill");
}

export function validateDesignVersion(version) {
  const design = version.design;
  if (!design || typeof design !== "object" || Array.isArray(design) ||
      Object.keys(design).some(key => !["kind", "skillName"].includes(key)) || !["skill", "prompt"].includes(design.kind))
    throw new Error("请选择设计形态：Skill 包或 Prompt");
  // Optional legacy metadata remains readable; new designs need only their kind.
  if (design.skillName !== undefined && (typeof design.skillName !== "string" || design.skillName.length > 64 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(design.skillName)))
    throw new Error("请填写有效 Skill 名称（小写英文、数字及连字符，最多64字符）");
  if (typeof version.content !== "string" || (design.kind === "prompt" && !version.content.trim()))
    throw new Error("请填写生图提示词");
  if (!Array.isArray(version.files) || version.mediaManifest !== undefined)
    throw new Error("设计资产只接收完整上传包，不接受外部媒体引用");
  if (design.kind === "skill") {
    validateSkillFiles(version.files);
    const info = inspectSkill(version.files);
    if (design.skillName !== undefined && info.name && info.name !== design.skillName)
      throw new Error("Skill 名称必须与包内 SKILL.md 的 name 一致");
  } else if (version.files.length) throw new Error("Prompt 形态不能包含 Skill 包文件");
  return design;
}

export function designRequirementsText(version) {
  validateDesignVersion(version);
  return version.content.trim() || "请依据我本次提供的需求生成图片；缺少关键需求时先向我确认。";
}

export function designPromptText(version) {
  return `请使用 ChatGPT 默认的生图能力，按以下要求直接生成图片。\n\n${designRequirementsText(version)}\n\n请交付生成的图片。若当前对话无法生成图片，请如实说明。`;
}

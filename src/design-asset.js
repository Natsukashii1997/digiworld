import { inspectSkill, validateSkillFiles } from "./skill-package.js";
import { isInstallSkill, validateInstallUrl } from "./skill-install.js";

// 设计资产两种形式（#93 第三批，用户 2026-11-19）：
// - 设计 Prompt：正文是确认过的设计指令，复制时原样给出；
// - 设计 Skill：只登记 skill 名 + GitHub 地址（可带仓库子目录），复制时按固定模板生成调用指令。
// 旧版「设计 Skill」是上传 ZIP 包的（design 里没有 repo），数据照旧可读、可交付，新建不再提供。
export const DESIGN_IMAGE_ID = /^[a-f0-9]{64}\.(?:png|jpg|webp)$/;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isLinkedDesignSkill(version) {
  return version?.design?.kind === "skill" && version.design.repo !== undefined;
}

// 填安装地址的 Skill 不带包（用户 2026-10-27）；设计 Skill 只有旧版 ZIP 形态带包。
export function hasSkillPackage(asset, version) {
  return (asset.type === "Skill" && !isInstallSkill(version)) ||
    (asset.type === "Design" && version?.design?.kind === "skill" && !isLinkedDesignSkill(version));
}

export function designKindLabel(version) {
  if (version?.design?.kind === "prompt") return "设计 Prompt";
  return isLinkedDesignSkill(version) ? "设计 Skill" : "设计 Skill · ZIP 包（旧版）";
}

// 仓库子目录：相对路径，不能跳出仓库。
export function normalizeRepoPath(value) {
  const text = typeof value === "string" ? value.trim().replace(/^\/+|\/+$/g, "") : "";
  if (!text) return "";
  if (text.length > 200 || text.split("/").some(part => !part || part === "." || part === "..") || /[\\\s?#]/.test(text))
    throw new Error("仓库子目录需是仓库里的相对路径，例如 skills/taste-skill");
  return text;
}

export function normalizeDesignRepo(value) {
  let href;
  try { href = validateInstallUrl(value); } catch (error) { throw new Error(error.message.replace("安装地址", "GitHub 地址")); }
  const url = new URL(href);
  if (url.hostname !== "github.com" || url.search || url.hash || url.pathname.split("/").filter(Boolean).length < 2)
    throw new Error("GitHub 地址需是仓库链接，例如 https://github.com/作者/仓库");
  return href;
}

export function validateDesignVersion(version) {
  const design = version.design;
  if (!design || typeof design !== "object" || Array.isArray(design) ||
      Object.keys(design).some(key => !["kind", "skillName", "repo", "path", "image"].includes(key)) || !["skill", "prompt"].includes(design.kind))
    throw new Error("请选择设计形式：设计 Prompt 或设计 Skill");
  if (design.skillName !== undefined && (typeof design.skillName !== "string" || design.skillName.length > 64 || !SKILL_NAME.test(design.skillName)))
    throw new Error("请填写有效 Skill 名称（小写英文、数字及连字符，最多64字符）");
  if (design.image !== undefined && (typeof design.image !== "string" || !DESIGN_IMAGE_ID.test(design.image)))
    throw new Error("效果图引用无效");
  if (typeof version.content !== "string" || (design.kind === "prompt" && !version.content.trim()))
    throw new Error("请填写设计 Prompt 的提示词正文");
  if (!Array.isArray(version.files) || version.mediaManifest !== undefined)
    throw new Error("设计资产只接收完整上传包，不接受外部媒体引用");
  if (design.kind === "prompt") {
    if (design.repo !== undefined || design.path !== undefined) throw new Error("设计 Prompt 不填 GitHub 地址");
    if (version.files.length) throw new Error("设计 Prompt 不能包含 Skill 包文件");
  } else if (design.repo !== undefined) {
    if (!design.skillName) throw new Error("请填写设计 Skill 的名称");
    if (design.repo !== normalizeDesignRepo(design.repo)) throw new Error("GitHub 地址需为规范链接");
    if (design.path !== undefined && (!design.path || design.path !== normalizeRepoPath(design.path))) throw new Error("仓库子目录需为规范相对路径");
    if (version.files.length) throw new Error("设计 Skill 只登记名字和地址，不带 ZIP 包");
  } else {
    if (design.path !== undefined) throw new Error("仓库子目录只用于登记 GitHub 地址的设计 Skill");
    validateSkillFiles(version.files);
    const info = inspectSkill(version.files);
    if (design.skillName !== undefined && info.name && info.name !== design.skillName)
      throw new Error("Skill 名称必须与包内 SKILL.md 的 name 一致");
  }
  return design;
}

// 定稿第 7 版的固定调用指令；用户在「我的需求：」后面补本次要做的东西。
export function designCallText(version) {
  validateDesignVersion(version);
  if (!isLinkedDesignSkill(version)) throw new Error("只有登记了 GitHub 地址的设计 Skill 能生成调用指令");
  return designCallTemplate(version.design);
}

// Design 页顶部展示模板时也用它（名字和地址可以是占位文字）。
export function designCallTemplate({ skillName: name, repo, path }) {
  return `请用设计 skill「${name}」帮我生成，按这三步做：
1. 先检查你当前的环境里有没有装 ${name}。
2. 没装：从 ${repo} 安装${path ? `（在仓库的 ${path} 目录）` : ""}，装好后告诉我装在哪。如果你的环境不能装 skill，就直接读这个仓库里 ${name} 的 SKILL.md，照它的规则做。
3. 已经装了或装好以后：调用 ${name}，按我下面的需求生成。

我的需求：`;
}

// 复制给出的文字：设计 Prompt 原样；设计 Skill 是调用指令。旧版 ZIP 包走交付（server/delivery.mjs）。
export function designCopyText(version) {
  validateDesignVersion(version);
  return version.design.kind === "prompt" ? version.content : designCallText(version);
}

// 旧版 ZIP 包交付时附在口令里的生图要求。
export function designRequirementsText(version) {
  validateDesignVersion(version);
  return version.content.trim() || "请依据我本次提供的需求生成图片；缺少关键需求时先向我确认。";
}

// Skill 的两种来源（用户 2026-10-27）：填安装地址的，复制时给一段交给 AI 的安装话术；自建的上传 ZIP，走原来的 Skill 包交付。
// 话术照 GitHub 快速中心的写法：只给出处和规则，让接收方 AI 依据文档装，查不到就停下来问。

export function isInstallSkill(version) {
  return typeof version?.installUrl === "string";
}

// 自建 Skill：当前版本带 ZIP 包（没有安装地址）的 Skill。
export function isSelfSkill(asset) {
  return asset.type === "Skill" && !isInstallSkill(asset.versions.at(-1));
}

export function validateInstallUrl(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error("请填写安装地址");
  if (text.length > 2048) throw new Error("安装地址太长");
  let url;
  try { url = new URL(text); } catch { throw new Error("安装地址不是有效链接"); }
  if (url.protocol !== "https:") throw new Error("安装地址需以 https:// 开头");
  if (url.username || url.password) throw new Error("安装地址不能包含账号或密码");
  return url.href;
}

const RULES = [
  "规则：",
  "1. 只依据安装地址里的文档和相关工具的官方文档做。文档里查不到的步骤，先去读官方文档；还是查不到就停下来告诉我，不要自己编命令。",
  "2. 需要账号、API Key、Token 或付费时，停下来告诉我缺什么、去哪里开通，等我处理；不要自己注册、付费，也不要编造或替我填写密钥。",
  "3. 要改动全局环境（全局安装、改环境变量或 shell 配置）之前，先告诉我要做什么。",
  "4. 最后告诉我：装在了哪里、怎么调用、最常用的一两个用法。",
];

export function skillInstallText(version) {
  const url = validateInstallUrl(version.installUrl);
  const purpose = version.description.replace(/\s+/g, " ").trim();
  return [
    `请在你所在的这台电脑上，把 Skill「${version.title.trim()}」装进你自己（你是 Claude Code 就装进 Claude Code，是 Codex 就装进 Codex），装好后确认你能调用它，最后告诉我怎么用。`,
    "",
    `- 安装地址：${url}`,
    ...(purpose ? [`- 用途：${purpose}`] : []),
    "",
    "做法：",
    "- 先打开安装地址，读那里的 README 或 SKILL.md，按文档写的步骤装。地址指向仓库里某个目录的，只装这一个目录（SKILL.md 和同目录的其他文件，保持原有子目录），不装整个仓库。",
    "- 放进你会加载 Skill 的目录；不确定位置时，先查你所用版本的官方文档。",
    "- 同名的 Skill 已经存在时，先问我要不要覆盖。",
    "- 装好后确认它出现在你可用的 Skill 里，再按 SKILL.md 的说明实际调用一次；要重开会话才能生效的，告诉我去重开，重开后再一起确认。",
    "",
    ...RULES,
  ].join("\n");
}

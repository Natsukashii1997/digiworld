// 已下线的写接口（#71、#111）。数码世界是信息驾驶舱：这里列出的路径在路由最前面统一回 410，
// 不读请求体，不碰主库、外部文件和适配器。只封口，原实现暂时保留，删除另开票。
// 约定：只读动作（inspect / check / history / status / list / query）和「停止」类动作不在表里。
const ROSTER = "项目名册以 digital-twin/projects.json 为准，在数码世界只读；这个写入接口已下线。";
const AGENT = "数码世界不再写入真实 Agent 的配置、模型、Skill、共享池和挂载，请到对应 Agent 自己的配置里改；这个写入接口已下线。";
const SKILL = "自建 Skill 以 my-skills 仓库为准，第三方 Skill 归 GitHub 中心，在数码世界只读；这个写入接口已下线。";
const PROJECT_WRITE = "规则和工作流要生效，请回到原项目和权威系统处理，数码世界不再往项目里写；这个写入接口已下线。";
const EXECUTOR = "数码世界不再自己调用模型或执行任务；这个接口已下线。";
const VAULT = "数码世界不再写入 Vault，知识整理请在 Vault 里做；这个写入接口已下线。";
const CALENDAR = "日历在数码世界只读；这个写入接口已下线。";
const RETIRED_FEATURE = "这项功能已随信息驾驶舱改造下线（2026-11-20）；这个写入接口已停用。";

// 每行：[路径正则, 说明, 方法（缺省只拦 POST；"*" 拦全部方法）]
const RETIRED = [
  // 项目名册（#71）
  [/^\/api\/(project-catalog\/apply|scan\/projects|project-identity\/(preview|confirm))$/, ROSTER, "*"],
  // Agent 写能力全部下线（v2.0 D-A）
  [/^\/api\/agent-config\/(preview|apply|restore-preview)$/, AGENT],
  [/^\/api\/capabilities\/agent\/[a-z-]+$/, AGENT],
  [/^\/api\/agent-targets\/(save|remove)$/, AGENT],
  // Skill 写路径与第三方来源（v2.0 第 3 节）
  [/^\/api\/skill-copies\/(preview|bind|remove)$/, SKILL],
  [/^\/api\/deliveries(\/revoke)?$/, SKILL],
  [/^\/api\/skill-sources\/(preview|import|derive)$/, SKILL],
  [/^\/api\/skill-source-updates\/adopt$/, SKILL],
  // 规则模板「装入项目」、工作流「部署到项目」（v2.0 第 3 节）
  [/^\/api\/rule-templates\/(preview|apply|revert-preview)$/, PROJECT_WRITE],
  [/^\/api\/capabilities\/workflow\/[a-z-]+$/, PROJECT_WRITE],
  // 应用内执行器：AI 逆推、读书摘要与模型能力、夜巡 v1 / v2、受控执行（2026-11-20）
  [/^\/api\/reverse\/runs\/start$/, EXECUTOR],
  [/^\/api\/learning\/(metadata|folders\/(add|remove))$/, EXECUTOR],
  [/^\/api\/capabilities\/model\/[a-z-]+$/, EXECUTOR],
  [/^\/api\/capabilities\/night\/(?!stop$)[a-z-]+$/, EXECUTOR],
  [/^\/api\/night-v2\/(recheck|actions\/(preview|confirm|suggestion-preview|suggestion-confirm)|morning\/reconcile)$/, EXECUTOR],
  [/^\/api\/controlled-execution\/(preview|confirm|resolve|start|gate-preview|gate|collect)$/, EXECUTOR],
  // 知识写回、整理、维护、剪藏与 Vault 写入能力（2026-11-20）
  [/^\/api\/knowledge\/writes\/(preview|apply|rollback-preview|rollback)$/, VAULT],
  [/^\/api\/knowledge\/tasks\/(create|packet|receive|archive)$/, VAULT],
  [/^\/api\/knowledge\/maintenance\/(preview|create|recover)$/, VAULT],
  [/^\/api\/knowledge\/clip\/(preview|confirm)$/, VAULT],
  [/^\/api\/capabilities\/vault\/[a-z-]+$/, VAULT],
  // 日历建、改、删（2026-11-20）
  [/^\/api\/calendar\/(blocks\/(create|update|delete)|todos\/(create|update))$/, CALENDAR],
  // 接力会话包、投递到项目与项目桌面装备、存档点（2026-11-20）。
  // 保留：relay-sessions/open（项目页「打开 Agent」在用）、project-desk/withdraw；
  // 协作看板、协议（collab/board、collab/protocol）是只读接口，口令复制记录（collab/record）现役在用，都不在表里。
  [/^\/api\/relay-sessions\/(prepare|clear)$/, RETIRED_FEATURE],
  [/^\/api\/project-desk\/(deliver|equip|unequip)$/, RETIRED_FEATURE],
  [/^\/api\/savepoints\/(preview|confirm)$/, RETIRED_FEATURE],
];

// 命中返回下线说明，否则返回 null。
export function retiredWrite(pathname, method) {
  for (const [pattern, why, methods = "POST"] of RETIRED)
    if ((methods === "*" || methods === method) && pattern.test(pathname)) return why;
  return null;
}

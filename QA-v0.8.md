# v0.8 Agent 目录与资产来源 · 2026-09-26

状态：本地实现、回归、独立两轴审查和 T2 通过，主服务已采用，待真人使用验收。A02 的只读管理子切片，不等于完整实例治理或全产品上线；持续目标仍 active。

## 精确候选版本

- 版本 `0.8.0`；未提交本地候选，未推送或公网发布。
- start_head / 当前 HEAD：`817b2949ffbaeccae97b610691f2b78c35acb0c0`。应用原先整体未跟踪，本轮范围以开工快照和冻结快照比较，不将旧未提交内容算作新增。
- 开工快照 `/tmp/guiji-v08-baseline-GW66jm`；共同初审快照 `/tmp/guiji-v08-review-TamxYY`；共同最终快照 `/tmp/guiji-v08-final-H6a0VJ`。仅 src/server/tests/dist/包信息及切片契约，不含真实 data 或私密配置。
- src/server 联合 SHA-256：`7e94b45e08630d597749586abb809a7d0d9fb742b922f53a8a704b517277c646`。相对路径排序，逐项散列路径、NUL、原字节。
- JS `index-DkQlTiba.js`：`9ce17b56fd98cf8c80e0b54ea5c59db3595e58dd6e2180932c2a5808327c5525`。
- CSS `index-BdEOvjme.css`：`3d7e36b9a7268c252c254fc4e0176074594a5c1fceba32cba4dd1192b0fa1f9e`。
- 主服务 `http://127.0.0.1:5178/#agents`，PID `10795`（验收时），接口实际返回 `0.8.0 / filesystem`，HTTP JS/CSS 与磁盘构建逐字节一致。用户 IAB 已刷新，打开 Hermes 详情，默认 Home 与 `supervisor-t01` Profile 可见；没有点击真实 Skill 扫描或收录。主运行截图 `test-results/agent-live-v08.png` 已保存并重读，仅补充采用证据，不冒充独立 T2 已看过此第八张图。

## 用户结果与权限边界

Agent 中心 → Codex/Hermes → 程序入口与目录 → 查看 Skill → 限定来源扫描 → 完整预览 → 确认收录 → 资产详情。取消收录返回 Agent，并重新检查目录；成功导航只保留一个弹窗。其他品牌保持已实现的入口发现，不冒充具备深度适配。

默认 Home、当前服务进程环境 Home、Hermes Profile、独立 Codex 用户共享来源分开显示。路径哈希保持身份，合并重复来源；状态区分发现目录、缺失与受阻。版本、运行、连接、启用均未核验，不以目录存在推断。没有把 CLI/App 与某个 Home 自动绑定。外部 shared_dirs、项目 trust、插件、配置 Profile 和所有自定义路径仍未覆盖。

目录接口仅执行有界元数据读取，不读取 config、auth、env、active_profile、聊天或 Skill 正文；明确扫描 Skill 后沿用 S03 的完整包规则。环境只取对应 Home 变量，宽泛路径拒绝；Profile 上限 100、枚举项 1000，链接和祖先链接不跟随，tombstone 不作为有效 Profile。刷新失败保留旧结果、明示未更新并禁用旧操作。检查结果不写主库，也不形成实例状态的第二个正本。

没有安装/启用/执行包，没有改真实 Agent、Vault、飞书、远端仓库或旧监工。UI 中“收录”只保存工作台快照，不覆盖来源。目录链身份检查降低并发替换风险，不宣称 OS 级原子快照。

适配依据：当前 [Codex 本地 Skill 位置](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)、[CODEX_HOME](https://learn.chatgpt.com/docs/config-file/environment-variables#core-locations)；本机 Hermes 安装源码 profiles.py / hermes_constants.py / skills_tool.py 只读核验。Hermes 官方 Profile 文档与本机 0.21.1 实现有差异，因此产品仅称目录候选，不宣布活动实例。

## 测试与反例

| 项目 | 当前结果 | 范围 |
|---|---|---|
| 单元/API | 89/89 通过 | 原 77 + 新目录 11 + 新 HTTP 1 |
| 浏览器 | 56 组通过 | 原 49 + 新 Agent 流程 7 |
| 迁移、容量 | 各 2 通过 | 原备份/迁移与 101/300 文件差异流程 |
| axe | 27 状态零违规 | 原 23 + 新详情/失败/来源预览/部分读取 4 |
| 响应式 | 320/375/393/430 px | 目录详情与来源弹窗均无溢出，320 失败操作可用 |
| 键盘与竞态 | 通过 | 焦点环、Esc 返回、迟到请求不复活旧弹窗或覆盖新 Agent |

HTTP RED→GREEN：接口尚不存在时返回 404；实现后仅支持 codex/hermes 身份，不接受浏览器自定义 home。无会话/跨域 403、非法形状 400，检查前后主库完全相同。

目录 RED→GREEN：实际临时文件树验证默认/环境来源、Profile 与根推导、元数据不读秘密、权限/链接/限额、稳定 ID。修复显式环境 Profile 在枚举失败时绕过 tombstone 核验；重复项重置累积来源；opendir 时 Home 被换成链接导致外部名称暴露。均保留最小反例并转绿。全量测试曾在子代理执行 Hermes Profile RED 阶段运行，82 项中 1 项未实现失败；实现冻结后完整 89 项全部通过，不以中间结果交付。

浏览器 RED→GREEN：初版没有目录 UI；随后失败态 axe 发现浅色背景上的 muted 文本对比度 4.19。去掉错误正文不适用的 muted 样式，继承现有提示组件的 `#715222`，严格零违规断言通过。来源扫描须明确点击，进入弹窗不自动读取；真实合成包原字节、二进制和来源路径保留，配置哨兵未改。新版测试脚本 SHA-256 `a7c3b630ff177f188121898a01b59333e6329b38c9c96160b303c28b2f5c888d`。

独立 Spec 捕获的部分读取反例：初次有 Profile，随后 opendir EACCES 导致 HTTP 200 + errors，旧 UI 覆盖并清掉旧 Profile。补回归先失败（旧 Home 实际 0/预期 1），再采用整份快照保留策略；测试覆盖顶层 errors、truncated、首次即部分结果、完整恢复。另用实际 inspector 和临时 Hermes Profile 目录变为链接复现真实 partial，再恢复普通目录，UI 保留旧身份并在完整重试后恢复动作，主库未改。最终 7 组新浏览器全部通过；所有受影响的全站、接力、来源和可访问性回归在最终构建重跑，未受影响的交付/历史/工作流/迁移/容量同轮结果保留。

测试主库、目录和端口均隔离。主库采用前后及真实 UI 检查后均为 revision `3`，快照 `3-ce398cc9-0c8d-49ee-b48a-6d4681e70fec.json`，实际 SHA-256 `d5ba8dbbbb830e3c49fed482ccfb7800100c8dc5cfe07818444337bab82926b5`，未改变。真实目录接口回读 Codex/Hermes 各 2 项、0 错误、未截断；仅目录元数据。临时运行服务与合成数据已清理，审查快照保留作证据。

## 两轴独立审查

Standards：初审 0、最终增量复核 0。独立核对冻结源码并运行 11 项目录测试，修复后复查未扩大读取权限、保留请求序号/防重入/失败门禁；增量阶段未冒称重复执行浏览器。

Spec：初审 1 项 P2（部分读取覆盖旧目录），最终独立加载 DkQlTiba，重跑实际 inspector + opendir EACCES 反例，确认旧 Profile 保留、过期可见、全部入口禁用、完整重试恢复、首次 partial 禁用且主库未改。原 P2 已闭合，无新增偏离。同一冻结快照分别审查，不能互相替代。

## 实际流程审查

产品范围：Agent 来源目录到 Skill 确认收录；当前 IAB 合成隔离环境，1280×720。没有 Product Design 已保存用户上下文，使用现有已批准 A 方向及代码组件。三步截图均当轮捕获、保存并重新打开检查。

1. **目录详情：可用。** 入口、Home、Profile 与来源分层，路径可换行/复制；运行状态保持未验证。

![目录与来源](test-results/agent-audit-01.png)

2. **完整包预览：可用。** 单一根默认填入，显式扫描和预览后方可确认；指纹、来源、全文/清单和名称可核对。取消返回原 Agent。

![完整包确认](test-results/agent-audit-02.png)

3. **收录结果：可用。** 成功后转到资产库详情，来源可回查、计数增加，没有两个弹窗叠加。不把收录当作安装。

![收录结果](test-results/agent-audit-03.png)

流程改进：长程序路径改为可展开的入口明细；目录身份与来源操作同组；错误提示沿用可读颜色；刷新失败不会让旧数据继续表现为已确认状态。功能和键盘证据来自独立脚本，不由截图推断。VoiceOver、触屏真机、真实用户复用和配置采用待验。

## T2 运行态视觉记录

Gate：T2；Artifact maturity：runtime；Artifact version：v0.8.0。Reviewed runtime build/hash：本文件精确 JS/CSS。Authority：A v0.2 manifest `bd692d5fdcff8fdf911ceea53b5f1c3e36ce4958c3f3ac7a160c01a3f9d26e22`，批准记录有效，T1 SATISFIED_BY_EXISTING_AUTHORITY，生图 0。

Runtime evidence：全部截图已在最终构建重拍：`agent-inventory-desktop.png`（1440×1000）、`agent-inventory-320.png`、`agent-inventory-failure-320.png`、`agent-inventory-partial-320.png`（320×900），以及上面三张 IAB 图。Baseline QA：56 组浏览器、四档窄屏/键盘/竞态、27 状态 axe；完整后端回归由主流程负责。初审 T2 因局部失败可见修改失效，独立审查者已重新查看七图、核验最终哈希，最终 VISUAL_PASS。

Design Read：程序入口、目录身份与可收录来源形成清楚的纵向层级，窄屏仍能辨认路径、状态和下一步操作。Preserve：暖白/橙色、共享组件、长路径换行、失败结果保留与明确禁用、跨流程视觉连续。未提出方向、语义、功能或 token 体系变更。

| Severity | Evidence | Visual issue | Bounded revision | Decision | Resolution status | Resolution evidence/reason | Protected concerns checked | QA made stale | QA rerun |
|---|---|---|---|---|---|---|---|---|---|
| 无 | 七张最终构建截图，重点 partial-320 | 无实质视觉问题 | 无 | N/A | 无未闭合项 | 不完整结果说明、暖色警示、禁用动作清楚；未挤压遮挡 | 结构、功能、语义、token、组件边界保留 | 初审 T2 已过期 | 受影响功能/响应式/axe 已重跑，最终 T2 通过 |

静态图不支持动效判断；375/393/430 仅是响应式测试证据，不冒充亲眼看过。安全、功能、权限、数据与全产品验收不属于视觉结论。Recommendation：VISUAL_PASS。Freshness：CURRENT，替代初审，仅覆盖最终 JS/CSS 与七图。Next owner：主流程；可见修改后重新验收。

## 剩余工作

A02 仍需程序版本证据、明确目标绑定、可管理配置摘要及目标副本关系；写入/采用/恢复另行实现和授权。S07 真实 Prompt、Skill、工作流复用等待代表性资产与具体同机接收范围。整个知识连接、夜间执行、模型路由、Mac 交付等完整目标继续推进，不由本轮测试代替。

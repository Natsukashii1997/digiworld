# v0.2 自动发现与本地主库验收 · 2026-09-25

本地功能切片完成，当前运行进程已采用；完整工作台及真人使用验收仍未完成。

## 对象与版本

- start_head：`817b2949ffbaeccae97b610691f2b78c35acb0c0`。应用原本整体未提交，本轮未提交或触碰无关改动。
- 修复后固定审查快照：`/tmp/guiji-v02-reviewed-MWaNhj`；与当前 src/server 逐文件比较一致。
- src/server 按目录及文件名字典序计算的联合 SHA-256：`a8957c10d22930dc3790c5c1fa4350e496be7020b455a773eec2f40d5a4d8cc6`。
- JS：`index-HGQ3Zuyo.js`，SHA-256 `16f3d45c7bbbdd2c15190b0d2b7017d59c1a234124f956c9dbebd0108b60dd3c`。
- CSS：`index-CVvzfBPt.css`，SHA-256 `461afea39a91cd0ed3ba856dce3127f0e4938888d2e2f8645987ec5eb1fe33a2`。
- 已停止原 Vite preview，启动 Node 本地服务，原地址 `http://127.0.0.1:5178/` 保持不变。

## 实测

| 范围 | 结果 | 证据 |
|---|---|---|
| 领域/持久化/HTTP/发现 | 17/17 通过 | `npm test`；`tests/*.test.mjs` |
| 快照损坏 | 隔离临时主库篡改快照后，读取与重新初始化均明确拒绝 | 本轮临时目录故障注入；没有回退种子或覆盖原状态 |
| 全站行为回归 | 21 组通过，0 JS 异常 | `test-results/browser-report.json` |
| 旧库迁移与恢复 | 2 组真实浏览器链通过 | `tests/migration.mjs`：旧 IndexedDB 不改、新浏览器共享主库、备份选择→预览→确认→回读 |
| 自动可访问性 | 9 路由 + 3 弹窗，0 axe 违规 | `test-results/accessibility-report.json` |
| 窄屏 | 9 路由 390px 无横向溢出；项目/Agent/知识库另测 320/375/393/430px 通过 | 浏览器断言及 `test-results/v02-*-mobile.png` |
| 实际用户窗口 | 新版知识页已刷新，项目首次扫描与 Agent 首次检测自动完成，程序位置抽屉可见 | Codex IAB 操作及 AX 回读；主库 revision 3 |

实机结果：两个已确认根目录发现 20 个本地入口，重复克隆合并后 19 个本地项目；GitHub 3 个仓库，其中 1 个关联本地，总共 21 项。达到默认扫描深度上限，页面明确显示不完整，不代表全量项目。Agent 在 11 种受支持入口中发现 8 种程序、1 种仅配置痕迹、2 种未检测，0 检测受阻。没有运行这些 Agent 验证登录/可用性。

测试全部使用隔离端口、临时主库和扫描 fixture；真实窗口只迁移既有数据、扫描授权目录与查看结果，没有写入测试资产。

## Standards 复核

独立审查原报 3 项：崩溃后遗留锁、remote 变化后错误关联、Agent 读取失败被误当不存在。均已修复并经同一审查者针对性复核通过，未发现新增阻断。

- 锁改为 Node 24 内置 SQLite 排他事务，仅用于 OS 锁；SIGKILL 后可重启，活跃写入进程仍排他。
- remote 变更/移除解除旧关联，旧远端独立保留；Git 元数据读取失败保留历史并显示错误。
- Agent 非“路径不存在”错误标记 unknown，保留已知程序位置。

## Spec 复核

独立审查原报 3 项：补 remote 后重复、remote 变更误关联、异常退出不能重启。均已通过新增回归与独立复核。未发现范围越界。Skill 分发、Agent 修复、知识接入和自动执行按本轮基线后置。

两轴各 3 项原发现、各 0 项未解决；各自最严重问题已解决。复核者分别独立重跑 17 项测试通过。

## T2 运行态视觉记录

Gate: T2 Runtime Visual Review

Artifact: 本机工作台 v0.2；Artifact maturity: runtime。

Authority package: `../../outputs/个人AI工作台-A风格视觉规范-v0.2/authority-manifest.json`，SHA-256 `bd692d5fdcff8fdf911ceea53b5f1c3e36ce4958c3f3ac7a160c01a3f9d26e22`，常浩既有明确批准。结构按本轮用户要求移除宣传区域、手工登记改自动发现；其余 App Shell、组件及视觉语言继承。T1：SATISFIED_BY_EXISTING_AUTHORITY。无新视觉方向、无生图，预算 0。

Reviewed runtime build: 本文 JS/CSS 精确哈希。

Runtime evidence: `03-projects.png`、`04-agents.png`、`06-knowledge.png` 为 1440×1000；`v02-projects-mobile.png`、`v02-agents-mobile.png`、`v02-knowledge-mobile.png` 为 390×844。均为本版运行截图，非设计效果图。

Baseline QA: 上表；真实手机、VoiceOver 和真人最终验收未执行，不转译为通过。

Authority protected: 字体栈、温和浅色背景、橙色主操作、卡片/列表、统一按钮和抽屉；数据、功能和权限不由视觉审查改动。

Design Read: 标题、扫描状态、筛选和结果构成清晰工作路径，操作占据主要视觉层级，说明压缩为必要状态。

Preserve: 主操作与次操作区别清晰，项目列表密度合适，Agent 卡片一致，窄屏保持可读顺序。

Findings: 无需要调整的实质视觉发现，未进行额外视觉修改。

Deferred / N/A / Blocked: 新插画与营销视觉 N/A；真机触控和 VoiceOver BLOCKED（本轮无实测）；真人验收 pending。

Recommendation: VISUAL_PASS（仅视觉，不等于整体产品完成）。Next owner: 主工作流 / 常浩使用验收。Freshness: CURRENT for 本文运行 build。

## 尚未完成

自动发现基于受支持标记/安装位置，不保证识别任意程序或所有项目。默认深度限制可通过配置更具体目录补扫。尚未提供后台持续扫描、扫描忽略规则编辑或项目人工隐藏；源码快照/子包也可能作为项目入口被发现，后续应以真实使用反馈校准。

知识库、模型调用、夜间调度仍未连接；上下文接力是人工填写；Skill 仍为完整包导入导出，不是临时链接分发。没有修改 Vault、Agent 配置、远端仓库或监工试点。主库快照暂不自动回收，需备份与关注空间。

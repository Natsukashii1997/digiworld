# 云端交接 · 任务 G1 · 集成分支（E2 + F1 + F2 + F3 + F4）

- 分支：`cloud/2026-09-30-integration`（短名 integration）；基点 `main @ bf21a6d`。只推分支，不开 PR、不推 main。
- 执行：Claude Code 云端会话（Linux、root、Node 24，`PLAYWRIGHT_MODULE=playwright`，chromium-1234）；云端副本，非权威。
- 未改：CURRENT.md、COLLABORATION.md、AGENTS.md、CLAUDE.md、package.json、package-lock.json、server/config-file.mjs、docs/design/。未接收费模型或外部服务，未读凭据。
- 本任务只做合并与合并造成问题的修复，不改任何功能设计。唯一一处非冲突改动是任务明确要求的页面编号连续化（见第四节）。

## 一、结论

| 项 | 结果 |
|---|---|
| 五个分支合并 | 全部按 E2 → F1 → F2 → F3 → F4 用 `git merge --no-ff` 合入。E2、F1 无冲突；F2 冲突 3 个文件，F3 冲突 6 个，F4 冲突 7 个，逐处解决，两边功能全部保留 |
| 各分支新增测试（合并后） | 每合完一个分支都重新构建并跑该分支新增测试：全部通过（见第三节） |
| `timeout 1200 npm test` | tests 536 / pass 511 / fail 19 / cancelled 1 / skipped 5；跑满外层 1200 秒（duration 1199.9s，rule-templates.test 照旧挂起）。失败名单去掉耗时后与 `cloud-scrolls-in-assets-logs/12-npm-test.txt` 逐条 diff 完全相同：**新增 0、减少 0** |
| 全部浏览器脚本（39 个） | 35 通过、4 失败：agent-config、rule-templates、rule-templates-fix（配置写入平台保护）、search（palette-cold 586ms > 500ms）。4 个都在已知集内：**新增 0**。interaction 本轮通过，属时序波动，不算减少 |
| `node tests/visual.mjs integration` | `problems: []`，exit 0 |

tests 数核对：main 基线 435 + E2 19 + F1 22 + F2 24（aihot 13、learning 10、digital-world-ui 1）+ F3 18 + F4 18 = 536，与实测一致；pass 511 = 536 − 19 − 1 − 5。

## 二、每个分支的合并结果与冲突清单

合并提交（`git log --first-parent`）：

| 顺序 | 分支 @ 头 | 合并提交 | 冲突 |
|---|---|---|---|
| 1 | phase2-projects（E2）@ 3e52b5f | 1ccec67 | 无（E2 基点 99f87d4 早于 main 的 E1，但改动面不重叠，自动合并） |
| 2 | phase2-collab（F1）@ 59cee0d | 79f3897 | 无（F1 基于 E2） |
| 3 | aihot-learning（F2）@ 1c9ae81 | a711d89 | 3 个文件 |
| 4 | knowledge-profile（F3）@ f06c794 | cbe9fd3 | 6 个文件 |
| 5 | silver-agents（F4）@ ec2ab71 | a7bb206 | 7 个文件 |
| — | 页面编号连续化 | cc85783 | — |

### 2.1 F2 冲突（3 个文件）

| 文件 | 冲突内容 | 解决 | 理由 |
|---|---|---|---|
| server/schema.mjs（validateState 顶层键白名单） | F1 加 `collabLog`，F2 加 `learning` | 两个键都保留；`validateLearning` 调用（自动合入）与 `validateCollabLog`（F1 已在别处调用）各自校验 | 两个新集合都是严格 schema，互不相干 |
| server/schema.mjs（validateHistory 参数） | F1 加 `allowCollab`，F2 加 `allowLearningFolders` 及“书架文件夹只能专用操作修改”检查 | 两个参数与各自检查全部保留 | 两种历史约束独立；repository 中 `updateCollab` 传 `allowCollab`、`updateLearning` 传 `allowLearningFolders`、导入传 `allowCollab`（F2 导入不需 allowLearningFolders，因 merge 不改 folders），均原样保留 |
| src/App.jsx（路由） | F1 挂 `collab` 并把 PlannedPage 列表改为 calendar/aihot/learning/silver；F2 挂 aihot、learning 并把列表改为 collab/calendar/silver | 挂 Collab、AiHot、Learning 三条路由；PlannedPage 只剩 calendar、silver | 两边各自把自己的页面从规划页移出，取交集 |
| tests/digital-world-ui.test.mjs（“切片 1.2”规划页列表） | F1：去掉 collab 并断言 collab 为 partial；F2：去掉 aihot、learning | 保留 F1 的 collab 断言；规划页列表为 health、calendar、silver | 两个分支各自按需求更新的断言取并集，没有放宽任何一条 |

### 2.2 F3 冲突（6 个文件）

| 文件 | 冲突内容 | 解决 | 理由 |
|---|---|---|---|
| server/http.mjs（import） | F2 引 aihot/learning，F3 引 knowledge-profile/profile-mcp | 全部保留 | 独立模块 |
| server/http.mjs（服务装配） | F2 创建 aihot、learning；F3 创建 knowledgeProfile 并启动 MCP | 全部保留，先 F2 后 F3 | 相互无依赖；`close()` 中 `aihot.close()` 与 `mcp?.close()` 都保留（自动合入） |
| server/merge.mjs（空库恢复分支） | F2：learning.folders 清空并计数；F3：knowledgeZones.profileSharing 置 false | 两段都保留 | 两者都是“本机授权不随备份恢复” |
| server/repository.mjs（新方法） | F2 `updateLearning`，F3 `updateProfile` | 两个方法都保留（补回两者之间被冲突切开的 `return commit(state); }); },`） | 独立写入口 |
| server/repository.mjs（importBackup 的 validateHistory） | F1 `allowCollab`，F3 `allowProfile` | 都保留 | 导入需要同时允许留痕追加与个人说明规则/建议合并 |
| server/schema.mjs（顶层键 + 校验调用） | HEAD：collabLog、learning；F3：knowledgeZones、profileProposals | 四个键与各自校验全部保留 | 新集合全部保留、各自校验 |
| server/schema.mjs（validateHistory） | HEAD：allowCollab、allowLearningFolders 及书架检查；F3：allowProfile、三区/建议检查、`validateProfileHistory` | 全部保留 | 同上 |
| src/Home.jsx | E2：`pendingItems(state, ruleInstalls, projectStatus)`；F3：`useZoneSummary()` 与 `facts(state, zoneSummary.latest)` | 两者合并：取 F3 的三区摘要，同时向 pendingItems 传 projectStatus | 待处理需同时包含体检/停滞项（E2）与个人说明建议（F3，经 state.profileProposals 读入） |
| src/PlannedPage.jsx（Inbox 签名） | E2 加 `projectStatus`；F3 加 `adoptState, notify` | 签名取并集，调用 `pendingItems(state, ruleInstalls, projectStatus)` | App 的 `common` 已同时提供这四个属性 |

### 2.3 F4 冲突（7 个文件）

| 文件 | 冲突内容 | 解决 | 理由 |
|---|---|---|---|
| server/http.mjs（import） | HEAD 四个模块；F4 silver、silver-cutout | 全部保留 | 独立模块 |
| server/http.mjs（adapters 与装配） | HEAD：`repoVisibility` 适配器、projectStatus、collabBoard；F4：`silverCutout` 适配器、silver 图片存储 | adapters 同时含 `repoVisibility` 与 `silverCutout`（仍在 `...discovery` 之前，测试注入可覆盖）；三个服务都创建 | 装配顺序无依赖 |
| server/http.mjs（路由） | HEAD：三区/个人说明路由；F4：`/api/silver/*` | 全部保留 | 路径不重叠 |
| server/merge.mjs（摘要字段） | F2 `learningLinksAdded/BooksAdded`；F4 `silverAdded`、`agentRolesAdded` | 全部保留 | 导入预览各自显示 |
| server/merge.mjs（空库计数） | F1 `collabAdded`；F4 silver/agentRoles 计数 | 全部保留 | 同上 |
| server/merge.mjs（已有库合并调用） | F2 `mergeLearning`；F4 `mergeSilver` 与角色卡补缺 | 全部保留 | 各集合只做加法、互不影响 |
| server/merge.mjs（函数定义） | `mergeLearning` 与 `mergeSilver` 相邻被切开 | 两个函数完整保留，补回 mergeLearning 的结尾括号 | `node --check` 通过；learning 与 silver 单元测试全部通过 |
| server/schema.mjs（import） | F3 knowledge-profile-schema；F4 silver-schema | 全部保留 | — |
| server/schema.mjs（顶层键 + 校验） | HEAD 四个键；F4 `silver`、`agentRoles` | 六个新键与六个校验全部保留 | 新集合全部保留、各自校验 |
| src/App.jsx | import 与路由：HEAD Collab/AiHot/Learning；F4 Silver | 四个页面都挂路由；PlannedPage 只剩 calendar | 各自移出规划页后取交集 |
| src/Home.jsx（能力地图 facts） | F2 改 aihot/learning 摘要；F4 改 silver 摘要 | aihot、learning 用 F2，silver 用 F4 的 `silverSummary` | 各自负责各自的行 |
| tests/digital-world-ui.test.mjs | HEAD 规划页列表 health/calendar/silver + collab 断言；F4 去掉 silver | 列表为 health、calendar；collab 断言保留 | 三个分支的需求断言取并集 |
| tests/nav-zones-browser.mjs | F2：`LIFE_PLANNED` 只留银饰，新增 `LIFE_BUILT`（aihot、learning 不再规划中、标部分可用）；F4：`LIFE_PLANNED` 去掉银饰，axe 标签改 learning | `LIFE_PLANNED = []`（循环保留，无条目），保留 F2 的 `LIFE_BUILT` 全部断言，随后 `axe(page, "learning")` | 三页都已不是规划页；F2 对 aihot/learning 的新断言与 F4 的 axe 位置都保留；银饰计划的可用性由 silver-agents-browser 覆盖、390 宽 #silver 无横溢断言仍在本脚本内 |

**需本机复核的测试调整**：上表中两个测试文件的冲突解决都属于“多个分支各自按需求更新同一断言”的并集，不是为通过而放宽；请本机确认（尤其 nav-zones 的 `LIFE_PLANNED` 现为空）。

### 2.4 自动合并但已人工核对的共享面

- `src/pending.js`：E2 的第三参数 `projectStatus` 与 F3 的 `state.profileProposals` 汇总同时存在。
- `src/App.jsx` 的 `common`：含 `notify, adoptState, ruleInstalls, projectStatus, refreshProjectStatus`，满足 Home / Inbox / Collab / 新页面所需。
- `server/repository.mjs`：`updateCollab`（F1）、`updateLearning`（F2）、`updateProfile`（F3）三个专用写入口并存。
- `src/pages.js`：F1 协同 partial，F2 AI HOT / 学习成长 partial，F4 银饰计划 ready，三处都在。
- 首页世界总览区块：A 时间安排、B 待处理、C 能力地图、D 最近迭代、E 今日热点（F2），各一次，无重复（见截图 1；nav-zones 也断言“能力地图”只出现一次）。

## 三、合并后新增测试逐个结果

日志：`cloud-integration-logs/01`–`05`。每步先 `npm run build`。

| 合并后 | 命令 | 结果 |
|---|---|---|
| E2 | `node --test tests/project-status.test.mjs` | 19/19 |
| E2 | `node tests/project-status-browser.mjs` | 全部 PASS，exit 0 |
| F1 | `node --test tests/collab-board.test.mjs tests/digital-world-ui.test.mjs` | 32/32 |
| F1 | `node tests/collab-board-browser.mjs` | 全部 PASS，exit 0 |
| F2 | `node --test` aihot、learning、digital-world-ui、collab-board、project-status | 75/75 |
| F2 | aihot-learning、nav-zones、collab-board、project-status 浏览器 | 4 个 exit 0 |
| F3 | `node --test` knowledge-zones、knowledge-profile、aihot、learning、digital-world-ui、collab-board、project-status、server | 97/97 |
| F3 | knowledge-zones、aihot-learning、collab-board、project-status、history-capacity 浏览器 | 5 个 exit 0 |
| F4 | `node --test` silver-agents + 上述全部 + server | 115/115 |
| F4 | silver-agents、nav-zones、agent-inventory、agent-targets、knowledge-zones、aihot-learning、collab-board、project-status 浏览器 | 8 个 exit 0（agent-inventory/agent-targets 是 F4 交接里曾撞名的脚本，特意复跑） |
| 编号后 | `node --test tests/digital-world-ui.test.mjs` | 11/11 |

## 四、最终页面编号表

`src/pages.js` 中 `code` 按侧栏（数组）顺序连续。原 main 在 E1 删除焚决独立页后留下 02 空号，本次按任务要求一并连续化；没有测试断言具体编号。

| 分区 | 页面 id | 名称 | 编号（前 → 后） | 成熟度 |
|---|---|---|---|---|
| 今日 | home | 世界总览 | 00 → 00 | — |
| 今日 | inbox | 待处理（侧栏隐藏） | IN → IN | 草稿 |
| 资产 | assets | 资产仓库 | 01 → 01 | 可用 |
| 资产 | references | 逆向工程 | 03 → 02 | 草稿 |
| 目标 | agents | 智能体群 | 04 → 03 | 部分可用 |
| 目标 | projects | 项目空间 | 05 → 04 | 可用 |
| 目标 | health | 能力体检（mergedInto agents） | 04 → 03 | 规划中 |
| 运行 | collab | 协同 | 06 → 05 | 部分可用（F1） |
| 运行 | night | 夜巡 | 07 → 06 | 规划中 |
| 知识 | knowledge | 知识仓库 | 08 → 07 | 部分可用 |
| 生活 | calendar | 日历 | 09 → 08 | 规划中 |
| 生活 | notes | 随手记 | 10 → 09 | 草稿 |
| 生活 | aihot | AI HOT | 11 → 10 | 部分可用（F2） |
| 生活 | learning | 学习成长 | 12 → 11 | 部分可用（F2） |
| 生活 | silver | 银饰计划 | 13 → 12 | 可用（F4） |
| 系统 | settings | 模型设置 | 14 → 13 | 部分可用 |
| 系统 | history | 版本归档 | 15 → 14 | 可用 |

## 五、全量回归对照（相对 CLOUD-SESSIONS §3.6 已知失败集）

| 命令 | 日志 | 首次结果 | 增减 |
|---|---|---|---|
| `timeout 1200 npm test` | 06 | 536 / pass 511 / fail 19 / cancelled 1 / skipped 5；1199.9 秒到点 | 失败 20 行（19 + rule-templates 文件级）与已知清单 diff 为空：**增 0、减 0** |
| 全部浏览器脚本（4 个基础 + 35 个 `*-browser.mjs`，每个外加 `timeout 600` 只防挂起） | 07 | 39 个：35 通过、4 失败（agent-config 回读不一致、rule-templates TimeoutError、rule-templates-fix matches_after、search palette-cold 586ms） | 全在已知集：**增 0**；interaction 本轮通过（波动，不计减少） |
| `node tests/visual.mjs integration` | 08 | `problems: []` | — |

说明：06 日志末尾本应追加的 `EXIT=` 行没有写入（外层 timeout 到点），退出码未直接记录；结果以 duration 与摘要行为准。

## 六、改动文件前后 SHA256（相对 main @ bf21a6d，仅代码与测试）

| 文件 | main bf21a6d | 集成分支 |
|---|---|---|
| server/aihot.mjs | —（新增） | 07d36c9331ae1a1d7c183de6947a4be934ef7678a1d4737b6eef4ee4ac235f57 |
| server/collab-board.mjs | —（新增） | 912f04663d59e599cf4a6066411213584ad87c76a2e5d5137250ab010eeef40b |
| server/collab-schema.mjs | —（新增） | e825890f8a65efc7185105d69e78869b01089d585870297d402ecc0aeabfb664 |
| server/discovery.mjs | 27740a5ef39062cb68d1cd8c4277379ac5ecc989d9264a391f2e30d944569a91 | a74d3d092746afa49e9e56b11cc14dd45ebe9876c72c6ce657794d33c42c4944 |
| server/http.mjs | 04f8df4aa4d36f382ec76d7359dae69c505220715a3a13f65fd6535f29c6ab52 | 6e33caeb6d01d8f88da0567d979ca0bbf442effbb2fcd17571db3b8520cc55cc |
| server/index.mjs | cca3893289299dbe6ceac4d7de7c721503fbb443ff998e82c6d7d39f94ec6d6a | 431aaff8ab7add1862416f67bd0f9c8c5e6ac8e7123dae800e42b1af3cb9fef1 |
| server/knowledge-files.mjs | 50d90278e5bcefd361a8e8bf17319de9507b38fb4f9e3abe110ac06863700c8f | 423e0b561cd50ff93d1778d385b84e0422af3fc175caa3009b4cfd29c6f85472 |
| server/knowledge-profile-schema.mjs | —（新增） | 54816f5bc5bcc6aba7e8ce331e8bc31b29befb4c58aa740e94c142b49a080664 |
| server/knowledge-profile.mjs | —（新增） | ca06b6daaee1c851c14243912377ec72dbedd74dc10eee9f3f9dbbe6fc5329b3 |
| server/learning.mjs | —（新增） | 4fa59aeef567e11d6238cabbbcb4ffbc8ba6e21c8bf2bc7c288fb3788f1f10da |
| server/merge.mjs | eac7e38c2921ec2083e2f15e5a88924228fee4ced01bdc85fa7851b1aaa3210e | b6dda44a0135ba6f1a13b2015827a667d98a40d2e61f95addb221875180269d4 |
| server/profile-mcp.mjs | —（新增） | 37337ab1c4737c58c86bccdfdb204efd28000a5b2ccebf0a5e6bbdf6eaeb2001 |
| server/project-status.mjs | —（新增） | 2e86b3d23e2714285d1c136dfbbb02916a3f40f05b39d60495090c8555931c5e |
| server/repository.mjs | dc8051acce21f91c76b791784039fed89bbb0f0798a71529260619109c324039 | 47a02f318cde0d244e4a012f4aea3e49731b8ea96e7a0a9aeb075c1e9065c3ef |
| server/schema.mjs | 5a426e68d5cc28a6c7bc45a145cb622de9949816f5912f1101394bbe108d08c7 | 86ee6f5695180f79bf7ec56d127fe6edeebb2f9de4709368ae71d1636f09a6c9 |
| server/silver-cutout.jxa.js | —（新增） | 7424904c4a15013d5460b4c788cc9056ad9384cc8a3fb4788b9af49c72b33661 |
| server/silver-cutout.mjs | —（新增） | dcf1a472db224926e2cd1b5cf7b3724ae1f4ba662254a139083be02fb0457f9d |
| server/silver-schema.mjs | —（新增） | b1250547a776b9f0104b8be6269ec16e3647c4b31bca1c5bd0beacee2f990f96 |
| server/silver.mjs | —（新增） | a118ef64c400cfb3f7b49c9c355f5a2ef37e5b7aecfe680d0d2c8620b2e827e3 |
| src/AgentRoles.jsx | —（新增） | b71e85d9bf2697d4f8706045c28f0483bb7aa2b945dbab98b03d8b5afda9c334 |
| src/App.jsx | 965e86ca0fea9a15c30677a7d88f88971a3fbbf207143c8c28c8c55b78111921 | e2d2b37ea77c0ae8728eb1cd70592bd1ebc9aa27161470424ae0c5bef1ad4e3d |
| src/AssetHistory.jsx | d4985d7ca8abf561a43582885323e361322d853d63e30cf1fcd9caa8065d15e3 | c6a15535ea9fac7528dd5c065f3e0e9c7dc95639a118c7a513f47dac8907a155 |
| src/Collab.jsx | —（新增） | ba3314d5e6010b47e45fa7dac01ae7dd73b122ec14756838cbc7958e55c6082d |
| src/DiscoveryPages.jsx | 85c5052f865333c4b04369e230963a1cbc6f17e2c3d5d02447ec3ac115cb4bf5 | e1bb6b5b04c7f3cce5ff9bec992d0cdab1f399f816a259820aa276a9d63cab02 |
| src/Home.jsx | a2b4ed81b51ba02c0bbc7ef7673ca186fbb926fe86b8d737e7e17d94a686728a | f64d06a0e1966cf1508b3b4a6a8f1e1462f4f9f8c9b390ea510742b5b784fadf |
| src/Knowledge.jsx | 1b0aa59effc5fbd8eb31034217e814e01ccfb86e2fe3fa81975935e6da5675e8 | 37f4d9126baf68568bc67f406e1891e7d4bbd9880b47f2797fac495807699a32 |
| src/KnowledgeZones.jsx | —（新增） | 6db35a7d09e9a61d047fbafd677d09bdb90a576cedcff17a64ec4aa4d2bb4ad2 |
| src/LifePages.jsx | —（新增） | 498316c40aed8b05216283bc9d2457e2ebdee4ef67a1c42366a016d195e86e03 |
| src/PlannedPage.jsx | 0f092c0dd3365dfbd7401692d82125945d279010dae341a2ef923de800084841 | dbaf8812e4322877599b255e37ed2866ef5bf8ae9b4ec3b3a234feda54f8f557 |
| src/ProfileProposals.jsx | —（新增） | 4d856d525c4e6252c51388ece9b87872e264a527817a05d01fe47f22f9d480f7 |
| src/ProjectStatus.jsx | —（新增） | 67b9a43633f13ed1f91b844a24efc7470627a00e60a84830b2ca0981b1728534 |
| src/Silver.jsx | —（新增） | 18e956d3b0bd2f7c4b199a8282969f4d483b8b8c6a30298f7f3f225af5429002 |
| src/StoragePanel.jsx | ee18f2c673ed577ae5d817de983939a99d22f3494cd1d5288f7745774236a272 | 1e4d775e631f2797ebd2a0dc09bdbd770f17fa731c0db0cbfe04a8edbda5a895 |
| src/WorkspacePages.jsx | 0892ec4cd86cfe52513346ba9a6135dad1c9b5b5711d65de85da65b09fb51f6a | aa1b7619ad52181d6580980aaf926004bd16db2d852972e470d47832f67e6d8b |
| src/agent-roles.js | —（新增） | e2fcefcd5303e9a0fee81f6d5046a0b2cd3aef39f13c81b8d511d9aba404f8de |
| src/collab.css | —（新增） | d91a86e4832f52cadaa7acb4d0f053d445203e77f018b55185fdbea70b9efe89 |
| src/collab.js | —（新增） | 079ac9f3b52e70f6d9fd674d32831a0bf8a96bb40c694dfc11276c496e00c2da |
| src/knowledge-zones.css | —（新增） | e5fd60b06e8667948b4454071e58cf655ef2cb40d33094573b896662419e7151 |
| src/knowledge-zones.js | —（新增） | f72f7b6490e77c451efcc028ef802936a8e366e9ceaa0d0ddd7940b97eb07332 |
| src/learning.js | —（新增） | 96c4c5cb7efa969383fb91dc366bf5eb0e536b975efdf0b85f1ed1a600423997 |
| src/pages.js | 96eb863dc1a2a124d05a445aa25914384fb3740aa62f7ddc3d418fd2b34622ce | 3d21f16791829c3ec61a45b375074c27c4187d1f95f3bb0a509c92ae91e03c4c |
| src/pending.js | 50ac358850626c78a9ff96252618a6b90f7031e54c0920d80d5aca92449f0888 | cf3422b19e072d5851c438e180fc74fc97282196c49850731cd4cc2dc2833cbd |
| src/project-status.css | —（新增） | f4934cba8aa0703846150620a4fba022a518b5eda780ed88d65a0f70865fefdf |
| src/silver-agents.css | —（新增） | c17213cc1b5b81479c0936eba00067ea4bd68e97ee0a0b9e39130014505f6fd8 |
| src/silver.js | —（新增） | 6081ea0fb9d18ef18a6a6895d1373fcebe1386b0baaa178d9c9a0efcb245cc75 |
| src/styles.css | 96430f0dd97fe3d2e7a9ce58c1758b93f97e66c810c26ffd9d8e50d0cd8b86d8 | 0907686f5c36cb40dd61b29c1e4518a6493a69e8fd9f1dc1e1a581092c8d9def |
| tests/aihot-learning-browser.mjs | —（新增） | 683ab80a410d3054c642e28455d77d123b964f20499ba1fadd6a451331a8f4ff |
| tests/aihot.test.mjs | —（新增） | 7845bf0f7550f09b44465bdc84bf9a9a966a3747f5ddd15e6a60be0a223d2dd8 |
| tests/collab-board-browser.mjs | —（新增） | 9bca243da4bc3e6bb21f26906b46282fe12d55e506393756f79eb9ef5e6d0582 |
| tests/collab-board-fixture.mjs | —（新增） | 2b77ae5939134b71404cb7aa77a991a86a6c43b7315df984b6fab15197dbf145 |
| tests/collab-board.test.mjs | —（新增） | 7199a5dc5792cf3ac336f791e763d531c895d089f4ea4d16d7c5a275881bf893 |
| tests/digital-world-ui.test.mjs | e064c9782a72faaeff4523e98030b06dc0b1d4606e678d11c2a2baa8ff9c141e | 397c9c78a73992826b9b3750804d07c5e232800582cbf3ed5946f1328df6cc63 |
| tests/knowledge-profile.test.mjs | —（新增） | 310fdaa46f850cdc4a24a451edeabee4bc493aa57a55fddbef127f5891e2376c |
| tests/knowledge-zones-browser.mjs | —（新增） | 6be386a6330b3fb9f2f305ccc7660fcb13dfafe04108fad20a9c4daec15fdc28 |
| tests/knowledge-zones.test.mjs | —（新增） | b7695a4d54ae93650bd322c500388047f9988f3fd668d14ed1e5aa5c65ce3614 |
| tests/learning.test.mjs | —（新增） | 51c064e4243095ad7d051debb9ee2d320fd2abe9a18af43e9ebd9861bb6b4249 |
| tests/nav-zones-browser.mjs | 77aa2e026ecd9318abf655f94f4000c095462b413c8c12b4c324038abc86ade2 | 934029822128f15b3cea85cac0952514ef6b696b4d012f70cb4d15fdf553ca34 |
| tests/project-status-browser.mjs | —（新增） | ec0b92e67703f288bd74c85a2b60e5fd426d8e4f2737f7195ecc09b07cf391bf |
| tests/project-status-fixture.mjs | —（新增） | 7762cc8ff6a8b147bedee5c7302fbdba8e44319346e33f49befbf7b100c7313b |
| tests/project-status.test.mjs | —（新增） | 7c0f27c1f098b36836a18069b41e5bfdf4845a864c840ea3dd92744e6b52581b |
| tests/silver-agents-browser.mjs | —（新增） | 473f8d19f7954f233b46c04511be306197ed23937578eb00a28b6c392329ea2f |
| tests/silver-agents.test.mjs | —（新增） | 794c981b565f683c6863e03805e7c03f368ac4e736d2664158f989e4ce56b745 |

## 七、需要真人确认的视觉点

截图 `cloud-integration-shots/`（取自 visual.mjs integration，合成数据）：

1. `1-home-1440.png`：世界总览 A–E 五个区块各一次；能力地图生活区 AI HOT / 学习成长“部分可用”、银饰计划“可用”；E 今日热点在最下方整行。
2. `2-home-390.png`：窄屏世界总览。
3. `3-agents-1440.png`：智能体群页（F4 角色卡与推荐区位于能力体检之前）。
4. `4-silver-390.png`：银饰计划窄屏。

另请注意（不是本次合并造成，未改）：能力地图“协同”一行的摘要仍是“尚未开发”，而徽标是“部分可用”——F1 没有改 `Home.jsx` 的 `facts.collab`。属于功能设计，留给本机决定。

## 八、仍需本机验证的清单（汇总各分支交接）

**E2 phase2-projects**
1. 本项目状态卡与真实 CURRENT 表头逐项一致（路线 2.1 验收）；“最新交接取表中第一个链接”的规则是否合适。
2. `.env.*` 命中 `.env.example`、`data/` 任意层级匹配、未提交改动常驻待处理——三个规则取舍。
3. gh 真实查询路径（云端无 gh，只测了模拟适配器）。

**F1 phase2-collab**
4. 本项目看板与 CURRENT 状态链一致（路线 2.3 验收）；7 节标题推断为“未知”，是否约定标题写法。
5. 路线 2.4 最小验证：用一键派发完成一次真实 Claude→Codex 交接并读回一致（需用户本人操作）。
6. 留痕接口不要求 revision、一键开工也计入留痕两项取舍。

**F2 aihot-learning**
7. AI HOT 真实接口字段（最大风险，云端无法访问 aihot.news）；首次需点“开始拉取”的判断。
8. macOS 受保护目录作书架时的“文件与文件夹”权限。

**F3 knowledge-profile**
9. 采纳个人说明建议后写入 Vault **未实现**（需本机补受限覆盖写入器，路线 3.3 验收未达成）。
10. Codex / Claude Code / Hermes 实际接入 MCP（127.0.0.1:5179）；MCP 默认随工作台启动多占一个端口。
11. macOS 真实 Vault 的三区统计；APFS 大小写不敏感与规则大小写。

**F4 silver-agents**
12. Vision 抠图（`server/silver-cutout.jxa.js`，macOS 14+ 实测）。
13. 白色描边剪影样式、角色卡草拟默认值、银饰页“可用”是否先降为“部分可用”。
14. 两个既有测试的需求性调整（本次集成又在其上做了并集，见 2.3）。

**集成本身**
15. 所有分支都在 Linux / root 云端验证；涉及配置写入（agent-config、rule-templates）的回归必须在本机 macOS 重跑 `npm test` 与全部浏览器脚本。
16. 共享面指纹：本机合入前核对第六节“main”列，若本机在派出后改过 server/http.mjs、schema.mjs、merge.mjs、repository.mjs、src/App.jsx、Home.jsx、pages.js、PlannedPage.jsx，需先对齐。
17. 用 5178 实际服务打开一遍全部新页面（启动时注意 MCP 5179 端口）。

## 九、未完成项与风险

- 合并提交（1ccec67 … a7bb206）的提交说明没有附会话署名行，后续提交有；不影响内容。
- 主库新增顶层集合 6 个（collabLog、learning、knowledgeZones、profileProposals、silver、agentRoles），另有 E2 在 connections 内的 `active` / `projectStallDays` 字段；validateHistory 同时有 allowCollab / allowLearningFolders / allowProfile 三个开关，导入路径只开 allowCollab 与 allowProfile（与各分支原设计一致）。
- F3 的 MCP 提交建议会使主库 revision +1，其他页面通用保存可能遇到 409（F3 已记录）；与 F1 留痕接口同样“不要求 revision”的写入并存，本机试用时留意多标签并发提示是否变多。

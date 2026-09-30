# 云端交接 · 任务 H1 · 第二轮集成（G2 + G3 合入集成分支）

- 分支：`cloud/2026-09-30-integration-2`（短名 integration-2）；基点 `cloud/2026-09-30-integration @ 7be59dc`（已含第一阶段、E2、F1–F4）。只推分支，不开 PR、不推 main。
- 执行：Claude Code 云端会话（Linux、root、Node v24.21.0，`PLAYWRIGHT_MODULE=playwright`，chromium-1234）；云端副本，非权威。
- 未改：CURRENT.md、COLLABORATION.md、AGENTS.md、CLAUDE.md、package.json、package-lock.json、server/config-file.mjs、docs/design/。未接收费模型或外部服务，未读凭据。
- 本任务只做合并、合并造成的冲突解决，以及一处让新增测试稳定通过的产品修复（第三节），没有改功能设计。

## 一、结论

| 项 | 结果 |
|---|---|
| 两个分支合并 | 按 G2 → G3 用 `git merge --no-ff` 合入。G2 冲突 3 个文件，G3 冲突 6 个文件，逐处解决，两边功能全部保留 |
| 各分支新增测试（合并后） | G2：单元 13/13（连同相关套件 83/83），reverse-engineering-browser 通过。G3：单元 9/9；agents-inventory-browser 合并后首跑在第 6 步失败，定位为 G3 自带的竞态（G3 分支单独构建也会失败），修复后 9/9 次通过（第三节） |
| `timeout 1200 npm test` | tests 558 / pass 533 / fail 19 / cancelled 1 / skipped 5；跑满 1200 秒（EXIT=124，rule-templates.test 照旧挂起）。失败名单去掉耗时后与 `cloud-integration-logs/06-npm-test.txt` 逐行 diff 为空：**增 0、减 0** |
| 全部浏览器脚本（41 个，各 1 次） | 35 通过、6 失败。5 个在已知集内（agent-config、rule-templates、rule-templates-fix、interaction 2.98935≠3、search palette-cold 974ms）；**首跑新增 1：skill-copies-browser**（第 5 组 `page.waitForResponse` 5 秒超时）。在同一构建上单独重跑 3/3 通过，G1 基点构建单独跑 3/3 通过，未复现（第五节） |
| `node tests/visual.mjs integration-2` | `problems: []`，exit 0 |

tests 数核对：G1 集成 536 + G2 13 + G3 9 = 558，与实测一致；pass 533 = 558 − 19 − 1 − 5。

## 二、冲突清单与解决理由

合并提交（`git log --first-parent`）：

| 顺序 | 分支 @ 头 | 合并提交 | 冲突 |
|---|---|---|---|
| 1 | reverse-engineering（G2）@ fa3bae2 | cd23e44 | 3 个文件 |
| 2 | agents-inventory（G3）@ baa75f4 | 3a2bbc9 | 6 个文件 |
| — | 内容清单展开重读竞态修复 | ef93654 | — |

### 2.1 G2 冲突（3 个文件）

| 文件 | 冲突内容 | 解决 | 理由 |
|---|---|---|---|
| server/merge.mjs（已有库合并） | HEAD：`mergeLearning`、`mergeSilver`、角色卡补缺；G2：逆向记录只做加法 | 全部保留，先 HEAD 后 G2；补回角色卡循环的结尾括号 | 各集合只做加法、互不影响。`summary.added.reverseRecords`、空库计数、通用循环跳过 reverseRecords 三处已自动合入 |
| server/schema.mjs（函数定义） | HEAD：`validateLearning`；G2：`validateReverseRecords` 与 `export { REVERSE_LIMITS }` | 两个函数完整保留，补回 validateLearning 的结尾括号 | `node --check` 通过；焚决条目 `source` 字段校验已自动合入 |
| server/schema.mjs（顶层键 + 校验调用） | HEAD：collabLog、learning、knowledgeZones、profileProposals、silver、agentRoles；G2：reverseRecords | 七个新集合键与各自校验全部保留 | 新集合全部保留、各自校验 |
| src/styles.css（文件末尾追加） | HEAD：AI HOT/学习成长等后续各段；G2：`.reverse-*`、`.candidate-*` | 两段都完整保留（HEAD 段在前、G2 段在后），相对集成基点只有新增行、无删除 | 选择器不重叠 |

自动合并并已核对：`src/pages.js` 逆向工程页 lead/stage 改为新流程（编号仍为 02）；`src/StoragePanel.jsx` 导入预览加“新增逆向记录”；`src/scrolls.js` `addEntry` 可选 `source`；`src/WorkspacePages.jsx` 嵌入 `ReverseWorkbench`，原“保存参考”保留。

### 2.2 G3 冲突（6 个文件）

| 文件 | 冲突内容 | 解决 | 理由 |
|---|---|---|---|
| server/http.mjs（服务装配） | HEAD：projectStatus、collabBoard、silver 图片；G3：agentContents | 全部创建 | 相互无依赖；`/api/agent-contents` 路由与 import 已自动合入 |
| src/pending.js（`pendingItems` 签名） | E2 与 G3 **都把第三参数**占为自己的来源：E2 `projectStatus = {items, error}`，G3 `agentHealth = {[agentId]: …}` | 签名改为 `pendingItems(state, ruleInstalls, projectStatus, agentHealth)`：第三参数保留 E2 的 projectStatus，G3 的 agentHealth 改为第四参数；函数体两段汇总均保留 | 两个来源形状不同，不能共用一个位置；E2 已在集成分支里被首页、顶栏、待处理页和 project-status 测试使用，保持不动改动面最小 |
| src/App.jsx | state 声明、`common`、顶栏 pendingItems 调用 | 同时有 `projectStatus`/`refreshProjectStatus` 与 `agentContents`；顶栏调用传四个参数 | 待处理各来源都保留 |
| src/Home.jsx | 签名与 pendingItems 调用；F3 的 `useZoneSummary` | 签名同时接收 projectStatus 与 agentContents；保留 F3 三区摘要；pendingItems 传四个参数 | 首页只改了参数，没有新增区块 |
| src/PlannedPage.jsx（Inbox） | E2/F3：`projectStatus, adoptState, notify`；G3：`agentContents` | 签名取并集，调用传四个参数 | 同上 |
| src/DiscoveryPages.jsx（Agents） | 签名：HEAD 需要 `save`（F4 角色卡）；G3 需要 `agentContents/setAgentContents`。正文：F4 `<AgentRoles>` 与 G3 `<AgentContents>` 在同一位置 | 签名取并集；顺序为：检测卡片 → **内容清单（清）** → **角色卡与派活推荐（角）** → 能力体检（体，规划中） | 两个分区各渲染一次、id 与分区序号不同（`#agent-contents`/`#agent-roles`/`#agent-health`）。内容清单紧跟检测卡片，符合 G3 交接写的位置；角色卡仍在能力体检之前，符合 F4 |

**需本机复核的测试调整（1 处）**：`tests/agent-contents.test.mjs` 第 203–204 行两处 `pendingItems(state, undefined, {…})` 改为 `pendingItems(state, undefined, undefined, {…})`，只随签名移动参数位置，断言一条未改。选这个方案，而不是在第三参数上按形状猜来源，是为了不在产品代码里写专为兼容测试的分支。

自动合并并已核对：`server/skill-files.mjs`（抽出 `skillFingerprint`，算法不变）、`src/SkillSources.jsx`（可选 `initialSearch`）、`src/AgentContents.jsx`、`src/agent-contents.css`。

### 2.3 任务要求的共享面核对

- **智能体群**：内容清单与角色卡各出现一次（截图 1、2）。
- **schema 新集合**：顶层键共 7 个新集合，全部保留并各自校验：collabLog、learning、knowledgeZones、profileProposals、silver、agentRoles、reverseRecords。
- **页面编号**：G2、G3 都没有新增页面，`src/pages.js` 编号仍是 00、IN、01–14 连续；能力体检与智能体群同为 03，因为它是 mergedInto，和 G1 一致。
- **首页区块**：A 时间安排、B 待处理、C 能力地图、D 最近迭代、E 今日热点各一次（截图 4）。G3 对 Home.jsx 只改了参数。
- **待处理来源**：以下各来源都保留。
  - 规则装入：错误与可升级
  - 需改进反馈
  - 个人说明建议（F3）
  - 知识整理任务
  - 随手记
  - 项目体检、停滞与读取失败（E2）
  - 未设管理目标
  - 智能体体检（G3）

  project-status-browser、knowledge-zones-browser、agents-inventory-browser 三个脚本分别断言了各自的待处理线索，本轮全部通过。

## 三、合并后的产品修复：内容清单展开时的旧结果竞态（提交 ef93654）

- **现象**：合并后 `agents-inventory-browser` 第 6 步“收录后重新展开应显示‘当前版本同内容’”失败，页面显示的仍是收录前的“资产仓库未收录同内容”。
- **定性**：这不是合并造成的。同一脚本在 G3 分支单独构建上跑 3 次，1 次通过、2 次在同一步失败。在合并工作树上，只换回 G3 原样的 `src/AgentContents.jsx`，第一轮 5 次中 2 次失败，另有 1 次单独运行失败。修复前合计 13 次失败 7 次。G3 交接的提交说明写着“回归进行中”，交接里的 SHA 表与验证结果仍是占位符，说明 G3 没有完成自己的最终回归。
- **根因**：G3 的设计是“每次展开都重新读取，避免把收录之前的旧结果当成当前事实”。但展开后在重读返回前，组件仍直接渲染 App 里缓存的上一次结果。测试在等到第一个条目出现后立即断言，能读到旧结果，用户也会短暂看到过期状态。
- **修复**：只改 `src/AgentContents.jsx`。展开时标记 `stale`，重读返回前不渲染上一次的分组，而是显示“正在只读读取…”。重读结束（无论成功或失败）后清除标记；失败时仍按原设计显示上次结果，并提示“下方为上次结果”。手动“重新读取”的行为不变。
- **验证**：修复后 9/9 次通过（3 + 5 + 全量回归中 1），测试文件未改。证据见 `logs/03-agents-inventory-stale-fix.txt`、`logs/04-agents-inventory-stale-rate.txt`。
- **说明**：本任务要求“先写会失败的测试”。这里的失败测试就是 G3 已有的第 6 步，没有另写新测试。由于它是间歇失败，首跑证据取的是多次运行的失败率，不是单次必现。

## 四、每步合并后的新增测试

日志在 `cloud-integration-2-logs/`，每步都先 `npm run build`。

| 合并后 | 命令 | 结果 |
|---|---|---|
| G2 | `node --test` reverse-engineering、scrolls-schema、silver-agents、learning、knowledge-profile、collab-board、server | 83/83（01） |
| G2 | reverse-engineering、silver-agents、knowledge-zones、aihot-learning 浏览器 | 4 个 exit 0（01） |
| G3 | `node --test` agent-contents、skill-files、pending、project-status、reverse-engineering、silver-agents、knowledge-profile、collab-board、learning、aihot、digital-world-ui、server | 147 项：146 通过、1 失败。失败的是 skill-files“来源缺失或权限失败…”，即已知集里 root 权限造成的那一条（02） |
| G3 | agents-inventory 浏览器 | 首跑失败（第 6 步，见第三节）（02） |
| G3 | silver-agents、project-status、knowledge-zones、reverse-engineering、nav-zones、agent-inventory、agent-targets 浏览器 | 7 个 exit 0（02） |
| 修复后 | agents-inventory 浏览器 | 9/9 通过（03、04） |

## 五、全量回归对照（相对 CLOUD-SESSIONS §3.6 已知失败集）

| 命令 | 日志 | 首次结果 | 增减 |
|---|---|---|---|
| `timeout 1200 npm test` | 05 | 558 / pass 533 / fail 19 / cancelled 1 / skipped 5；1199.8 秒到点，EXIT=124 | 失败 21 行（19 条、`failing tests:` 标题行、rule-templates 文件级）与 G1 清单 diff 为空：**增 0、减 0** |
| 全部浏览器脚本各 1 次（4 个基础 + 37 个 `*-browser.mjs`，每个外套 `timeout 600` 只防挂起，未触发） | 06 | 41 个：35 通过、6 失败 | 已知 5 个：agent-config、rule-templates、rule-templates-fix（配置写入平台保护）、interaction（位移 2.98935）、search（palette-cold 974ms）。**新增 1：skill-copies-browser**。减 0 |
| skill-copies-browser 单独重跑 | 07 | integration-2 构建 3/3 通过；G1 基点 7be59dc 构建 3/3 通过 | 未复现 |
| `node tests/visual.mjs integration-2` | 08 | `problems: []` | — |

**关于 skill-copies-browser**：失败点在 `tests/skill-copies-browser.mjs:502`，第 5 组“迟到预览不覆盖新选择”。脚本放行被拦截的预览响应后，等待 `/api/workspace` 回读，5 秒超时。这个断言检查的是等待时序，不是业务结果。G2、G3 都没有改 Skill 副本相关的代码或接口；G3 的内容清单在智能体群页上，但不展开不会发请求。目前的判断是：连续跑了 30 多个浏览器脚本后机器负载高，属于时序类失败。但这只是推断，**没有定位到根因**，所以如实计为首跑新增 1，请本机复核。按规则没有改测试、没有加长等待。

## 六、改动文件前后 SHA256（相对集成基点 7be59dc，仅代码与测试）

“等于”一栏表示该文件与哪个分支头逐字节相同。

| 文件 | 集成基点 7be59dc | integration-2 | 等于 |
|---|---|---|---|
| server/agent-contents.mjs | —（新增） | 1f387a056b1cbe3310ca4693bf04f7427fd793606c918ed2fc8c3dde5f36260f | G3 |
| server/http.mjs | 6e33caeb6d01d8f88da0567d979ca0bbf442effbb2fcd17571db3b8520cc55cc | 7c450dc1a259de7d26fbc92c066df230951d418452b1d719f4ad09347f69eaec | 合并 |
| server/merge.mjs | b6dda44a0135ba6f1a13b2015827a667d98a40d2e61f95addb221875180269d4 | b0cc099caae57a5cc543251c0302184fc876eacbb96dbdaa3c20059388a8560d | 合并 |
| server/schema.mjs | 86ee6f5695180f79bf7ec56d127fe6edeebb2f9de4709368ae71d1636f09a6c9 | 9e7c6e5a30ed47dabfcdbbc737490bc783f628326d8a39f9a30181730239fb50 | 合并 |
| server/skill-files.mjs | d081db6d5a21fef00314986264a98da597473587761ad5a159f9ca575db110f7 | 60cdf0288ce8817bef786f11a4f2de4c227e171d8ba096b2e15e021c6ade4770 | G3 |
| src/AgentContents.jsx | —（新增；G3 原样 501d32cf45ca4ebb0ae8129abeeadbd2dc15b88578d306ffd4117f4f459de955） | 04c53f94c52977959e0b53c3b1d115976a437784869aac0fc384e8a4470e7854 | 第三节修复 |
| src/App.jsx | e2d2b37ea77c0ae8728eb1cd70592bd1ebc9aa27161470424ae0c5bef1ad4e3d | 7f3ce91d313858318a5c73073b7f7a628d599c50a57aae3a189eea4fc1b1d114 | 合并 |
| src/DiscoveryPages.jsx | e1bb6b5b04c7f3cce5ff9bec992d0cdab1f399f816a259820aa276a9d63cab02 | 27b38a0216a6121bcf137b1800c7d060a83651a4be0b2628d9e5a23da4cdb659 | 合并 |
| src/Home.jsx | f64d06a0e1966cf1508b3b4a6a8f1e1462f4f9f8c9b390ea510742b5b784fadf | dd1b386c628d21d61c2f63e2583a3577587c337e24e47da7e362dbb10f816e49 | 合并 |
| src/PlannedPage.jsx | dbaf8812e4322877599b255e37ed2866ef5bf8ae9b4ec3b3a234feda54f8f557 | cfb9d51e74361509152f5b8c526aa2b300fa448666c78e4c2ed4c5fb2eaa6c59 | 合并 |
| src/ReverseEngineering.jsx | —（新增） | 962347a301f015eaf52d454aec217faf610f1c2b6d78d82bb1f7b316b634738b | G2 |
| src/SkillSources.jsx | cefe0c7df3aa9a04cb81235c2bd49588eb493e637b43b050b4d6f50be8dc574d | 15d349b6c986bce011ac27de76606d22db9b5c57521a7b5ff699db020b0e2a0b | G3 |
| src/StoragePanel.jsx | 1e4d775e631f2797ebd2a0dc09bdbd770f17fa731c0db0cbfe04a8edbda5a895 | ceadebc6ba8b60a7d17dae1c7d89e690f8d947c09513b9677a77442031b54ecd | 合并 |
| src/WorkspacePages.jsx | aa1b7619ad52181d6580980aaf926004bd16db2d852972e470d47832f67e6d8b | ce480eac2c96276d11cc8a62e0012ddaecf79b013ac350d5ffa45afd3579f2ce | 合并 |
| src/agent-contents.css | —（新增） | 8ef011013712b49ba81f096be4bf6bb7f47b3575a64f81c5947f60c2e28b69e8 | G3 |
| src/pages.js | 3d21f16791829c3ec61a45b375074c27c4187d1f95f3bb0a509c92ae91e03c4c | e9d731a2326238d343aa022f325b79c022b076c45f5cdabc06b15871bf2da1b5 | 合并 |
| src/pending.js | cf3422b19e072d5851c438e180fc74fc97282196c49850731cd4cc2dc2833cbd | 5fceae008d62f2d17f1f9792d114ff884bc42102040e63fa1f92cd9de69c9258 | 合并 |
| src/reverse.js | —（新增） | ffa6a2bd157e9f16ef816f38805c78ea25f73887d4795a15c1280e3316b6de45 | G2 |
| src/scrolls.js | 2648a1dcbb8ac59f4992e57321e27f39a829a7ed29dfa76f23d39394fa358ad5 | a1de09f51d13355c3a9926a2f2c86f65a3a22a627da933c8b695f0421a2113ea | G2 |
| src/styles.css | 0907686f5c36cb40dd61b29c1e4518a6493a69e8fd9f1dc1e1a581092c8d9def | 496a498317404ee9479892f0379dc9985fab75fc3e1114715f84b0fe6002ce64 | 合并 |
| tests/agent-contents-fixture.mjs | —（新增） | fda012b59ada28ab34784bbe10390031cbfb866db7ddb8f209967ce0f1a65d3c | G3 |
| tests/agent-contents.test.mjs | —（新增） | a2e5343f42ea615729b35c84f868373ee2ad9c955ee37156e72adb4e5e7f31b5 | G3 + 2.2 的参数位置调整 |
| tests/agents-inventory-browser.mjs | —（新增） | 1462512e8a6da101bdeba5f92083ed576b1dc4357f66c208c1bf53e466dfd253 | G3 |
| tests/reverse-engineering-browser.mjs | —（新增） | a9903d5cb98589c14ae21b48bb2717ecc05454509c32759e3620fdf424f0f433 | G2 |
| tests/reverse-engineering.test.mjs | —（新增） | 0811b0b6d50b5806e721df10551ace0ad8348e023f303612e28769f089c2fb8c | G2 |

相对 main @ bf21a6d 的共享面指纹，见 G1 交接第六节“main”列；G2、G3 交接第四节给出了各自的改动前指纹。G3 交接的这一节是占位符，没有写出来。

## 七、需要真人确认的视觉点

截图在 `cloud-integration-2-shots/`，取自 `visual.mjs integration-2`，合成空库：

1. `1-agents-1440.png`：智能体群，顺序为检测卡片 → 内容清单（每个已检测 Agent 一张卡，未展开时显示“尚未体检”）→ 角色卡 5 张与派活推荐 → 能力体检（规划中）。请确认这三个分区的主次与顺序，以及页面是否过长。
2. `2-agents-390.png`：同一页面的窄屏效果。
3. `3-references-1440.png`：逆向工程页，依次为步骤条与投素材表单、逆向记录、参考链接。页头右上仍是“保存参考”橙色主按钮（G2 待定点）。
4. `4-home-1440.png`：世界总览，A–E 各一次。

另有两处内容重叠，不是本次合并造成的，未改，留给本机决定：

- “能力体检（规划中）”分区仍写着“将来会只读检查 Skill 链接是否失效…”，但 G3 的内容清单已经做到了失效链接、版本不一致、无法读取三项只读体检。规划文案与成熟度可能需要同步。
- 能力地图“逆向工程”一行摘要仍是“0 条参考”，统计的是旧的 `references`，不含逆向记录。G2 交接已写明首页不显示逆向记录。

## 八、仍需本机验证的清单（在 G1 汇总的第 1–17 项基础上更新）

G1 交接第八节第 1–17 项（E2、F1–F4 与集成本身）全部仍然有效，这里不重复。新增项如下。

**G2 reverse-engineering**
18. 用真实 Agent 走一遍“复制任务包 → Agent 回复 JSON → 解析 → 入库”，确认 Agent 能按固定 JSON 格式返回。若 Agent 常返回 Markdown，再决定是否加解析。
19. 页头“保存参考”旧入口的去留；标注徽标配色；长 Prompt 候选不折叠。
20. 焚决条目的 `source` 目前只写入数据，界面不显示；全局搜索不搜逆向记录；备份合并对同 ID 记录保留当前库（两台设备各自入库同一记录时，备份那份会丢失）。

**G3 agents-inventory**
21. G3 自己的全量回归没有完成（交接中的 SHA 表与结果是占位符）。本次集成的全量回归覆盖了 G3 的代码，但 G3 在 main 基点上的独立回归结果不存在。
22. 在本机真实 `~/.claude`、`~/.codex`、`~/.hermes`、`~/.openclaw` 上展开清单：233 条失效链接的真实规模、逐包读取耗时、各 Agent 配置文件名与插件目录是否按常见布局命中。
23. 停用区 `<Home>/skills.disabled/<名>` 是否会被各 Agent 扫描到，确认后才能用于真实执行。开关目前只给预览，不执行。
24. 只读取默认 Home：Hermes Profile、`CODEX_HOME`/`HERMES_HOME` 不在清单里。豆包工作没有检测项。

**本次集成**
25. `pendingItems` 签名改为四个参数，G3 测试调用随之调整（2.2）。请本机确认这个取舍。
26. 内容清单竞态修复（第三节）：请在本机用真实服务确认，展开时先显示“正在只读读取…”再出结果，不会闪烁或卡住。
27. skill-copies-browser 首跑超时未复现（第五节）。请在本机 macOS 跑全部浏览器脚本时留意它。
28. 涉及配置写入的回归（agent-config、rule-templates）仍必须在本机 macOS 重跑 `npm test` 与全部浏览器脚本。合入前核对第六节“集成基点”一栏。

## 九、未完成项与风险

- G3 交接文档原样合入，其中第四节 `SHA_TABLE`、第五节 `RESULTS` 两个占位符未填。本任务不改其他分支的交接；集成层面的指纹与结果以本文件为准。
- skill-copies-browser 首跑失败没有定位到根因，已按首次结果如实计入“新增 1”。
- 主库顶层新集合增至 7 个。`reverseRecords` 在导入路径上沿用 G2 的设计：只做加法，同 ID 保留当前库。
- G3 的智能体线索只存在于浏览器会话内存中，刷新后消失。首页、顶栏的待处理条数会随用户是否展开过清单而变化，这是 G3 的设计，本次未改。

# 云端交接 · 任务 G3：智能体群 4.1 + 4.2（内容清单、单项开关预览、存入资产仓库、能力体检并入）

- 执行：Claude Code 云端会话（云端副本，非权威）。未改 CURRENT.md / COLLABORATION.md / AGENTS.md / CLAUDE.md，不写交接编号。
- 基点：`main @ bf21a6d`（第一阶段 1.1–1.4 与焚决并入资产仓库均已在内）。分支 `cloud/2026-09-30-agents-inventory`（短名 agents-inventory）；未开 PR、未推 main。
- 环境：Linux / root，Node v24.21.0（/opt/nvm），`PLAYWRIGHT_MODULE=playwright`，chromium-1234。
- 依据：产品定义 v1.2 §4.3（借鉴炉子①：内容清单、单项开关、一键存入资产仓库；能力体检并入）、v1.1 §4.1（Skill 发布与挂载，共享池 + 链接）、v1.1 §4.2（只读体检与修复分离）；契约 AGENT-INVENTORY.md、SKILL-SOURCES.md、SKILL-COPIES.md、AGENT-TARGETS.md、AGENT-CONFIG.md。
- 未改：`server/config-file.mjs`（平台写入保护）、`server/schema.mjs`、`package.json`、`package-lock.json`、`docs/design/`、既有测试文件。
- 不做：角色卡（F4，silver-agents 分支）；真实开关切换、清理失效链接、按发布记录重建挂载（均属真实 Agent 配置写入 🔐）。

## 一、改动与理由

| # | 改动 | 理由 / 说明 |
|---|---|---|
| 1 | 新增 `server/agent-contents.mjs`：`readAgentContents(agentId, {home, filesystem})` 只读列出 Agent 默认 Home 下四组内容；`annotateAgentContents(result, state)` 与资产仓库比对并算体检汇总；`createAgentContents` 做请求校验。 | 任务第 1、2、4 条。一个模块拥有“读 + 比对 + 汇总”，页面只管展示。 |
| 2 | 范围：`codex`（`~/.codex`，另列共享池 `~/.agents/skills`，标“Codex 原生读取”）、`claude-code`（`~/.claude`）、`hermes`（`~/.hermes`）、`openclaw`（`~/.openclaw`，插件目录 `extensions`）。其他品牌请求返回 400“此 Agent 暂不支持内容清单”。**豆包工作**：现有 `server/discovery.mjs` 没有它的检测项，本任务不猜路径，卡片区脚注写明“暂只做安装检测”。 | 产品定义 v1.2 §4.3 的主力 3 + 附属 2。只读默认 Home，不枚举 Hermes Profile、不读 `CODEX_HOME`（与现有目录发现的多 Home 口径不同，见第七节）。 |
| 3 | 分组与“读不到如实显示”：<br>• **Skill**：逐项分类 `pool` 共享池链接 / `copy` 独立副本 / `broken` 失效链接 / `link` 外部链接（指向共享池以外）/ `unreadable` 无法读取；另有“目录里没有 SKILL.md”标注。<br>• **配置文件**：固定文件名的存在、字节数、修改时间（只 `lstat`，**不打开正文**）；符号链接不跟随。<br>• **插件**：插件目录第一层条目名与类型（最多 100）。<br>• **MCP**：MCP 定义都在配置正文里（可能含凭据），状态固定为 `not_read`“未读取”并写明位置，不猜测。<br>• Home 缺失 → 各组“未发现 · Home 目录不存在”；目录无权限 → “无法读取 · 没有读取权限”；目录是符号链接 → “无法读取 · 目录是符号链接，未跟随”。 | 任务第 1 条；AGENTS.md“不读凭据”；AGENT-INVENTORY“配置正文不读取”。 |
| 4 | Skill 比对：共享池链接与独立副本读取完整包（沿用 `readLocalSkill`，同样的敏感文件、链接、限额检查），外部链接与失效链接不读内容。`server/skill-files.mjs` 把原来内联的指纹计算抽成 `skillFingerprint(files)`，`readLocalSkill` 改为调用它（算法逐字节不变），资产仓库各版本用同一函数算指纹。比对顺序：当前版本同内容 `same` > 某个旧版本同内容 `older`（显示“第 N 版，落后于第 M 版”）> 有来源证据（`origin.location` 或目标副本关系 `skillCopies.location` 指向此路径）但内容不同 `drift` > `none` 未收录。归档资产不参与；**名称相同不算同内容**。 | 任务第 2 条“按现有指纹比对”；SKILL-COPIES“不会把名称相同当内容一致”。 |
| 5 | “存入资产仓库”：清单只给出限定扫描范围 `store = {roots, name}`（独立副本 → 所在 skills 目录；共享池链接 → skills 目录 + 共享池，因为现有扫描只在明确根之间解析链接）。按钮打开现有 `SkillSourceImport`，预填范围；首次扫描后按该 Skill 名称筛选（`SkillSources.jsx` 新增可选 `initialSearch`，其余流程一行未改）。用户仍需“扫描目录 → 预览 → 确认收录”，成功后打开资产详情（回读）。当前版本已同内容的项不显示此按钮；失效、外部、无法读取的项没有入口。 | 任务第 2 条“走现有收录流程，不绕过”。 |
| 6 | 单项开关：每个 Skill 与插件条目都有“开关预览”，打开对话框只显示计划，不执行：<br>• 链接 → “停用将移动 `<skills>/<名>` 到 `<Home>/skills.disabled/<名>`；只移动链接本身，链接指向的内容不变”，附恢复方法；<br>• 独立副本 → 整个目录移到停用区，内容不变；<br>• 失效链接 → “没有可停用的内容；清理属于体检修复，需单独授权”；<br>• Codex 看到的共享池本体 → 不在单个 Agent 开关里处理（会影响所有 Agent）；<br>• 插件 → 启用状态由 Agent 自身配置管理，属于配置写入，不生成移动计划。<br>每个预览底部标注“需要用户单独授权后在本机执行；本页不执行写入。” | 任务第 3 条。`skills.disabled` 是本任务拟定的停用区位置，**待用户确认**（第六节）。 |
| 7 | 体检汇总 `health = {brokenLinks, drift, unreadable}`：失效链接数；`older` + `drift` 计入“与仓库版本不一致”；无法读取 = 不可读 Skill 条目 + 完整包读取失败的条目（如含敏感文件、包内链接）+ 状态为无法读取的 Skill/配置/插件分组（Home 本身不可读时记 1）。MCP“未读取”是策略，不计入。 | 任务第 4 条。 |
| 8 | 新增 `src/AgentContents.jsx` + `src/agent-contents.css`：智能体群页在检测卡片之后、原“能力体检（规划中）”分区之前，新增“内容清单”分区 `#agent-contents`。每个已检测且支持的 Agent 一张卡：标题行 + 体检摘要（未读时“尚未体检 · 展开清单时只读读取”；读后三枚徽标 + 检查时间），“展开清单 / 收起清单”（`aria-expanded`），展开后“重新读取”。**每次展开都重新读取**，避免收录后仍显示旧结果。重读期间显示“正在重新读取 · 下方为上次结果”。 | 任务第 1、4 条。原“能力体检”分区（含修复、gateway 等规划）保留不动，`#health` 旧链接与 nav-zones 测试不受影响。 |
| 9 | 角色卡留位：卡片标题行 `.agent-contents-top` 是可换行的 flex 行，角色卡可放在体检摘要旁；文件头注释写明挂载点。本任务没有渲染任何空占位块。 | 任务要求“布局给角色卡留位置”。 |
| 10 | 待处理：`src/pending.js` 的 `pendingItems` 增加第三个参数 `agentHealth`（`{[agentId]: {name, health}}`），每个有问题的 Agent 一条“智能体”线索，例如“Claude Code：1 条失效链接、1 项无法读取”，点击跳 `agents`。只汇总和跳转，不执行。`App.jsx` 用新的 `agentContents` 状态（最近一次读取结果，不写主库）传给顶栏、首页（`Home.jsx`）与待处理页（`PlannedPage.jsx`）。未展开读取过的 Agent 不产生线索，也不宣称“无问题”。 | 任务第 4 条“沿用 pending.js 的方式”。 |
| 11 | 新增 HTTP `POST /api/agent-contents {agentId}`：只接受 4 个 agentId、只接受这一个字段（带 `home` 等其他字段 → 400），沿用既有本机会话 / Host / Origin 门禁；服务端 `discovery.readAgentContents` 为测试注入缝，生产不接受浏览器传入路径。 | 与 `/api/agent-inventory` 同一安全口径。 |

## 二、测试

- 新增 `tests/agent-contents-fixture.mjs`：临时目录里的合成用户目录（`synthetic-user/.agents/.claude/.codex/.hermes`，无 `.openclaw`）。含：共享池链接、失效链接（指向已删除的池条目）、独立副本、外部链接、与仓库当前版本同内容、与仓库旧版本同内容、有来源关系但内容不同、不可读 Skill 目录、不可读插件目录、配置哨兵文件。root 运行时 `chmod` 挡不住读取，所以“不可读”通过注入文件系统（`access/opendir/readdir` 对指定路径抛 `EACCES`）模拟。仓库资产用 `readLocalSkill` 读出同一文件构造，指纹口径与真实收录一致。提供 `snapshot()`，逐字节记录整个合成目录树（含链接目标文本、inode、mtime）。
- 新增 `tests/agent-contents.test.mjs`（9 项）：范围与拒绝；四组分组与配置不读正文（清单 JSON 不含哨兵文字）；链接分类；无法读取与缺失 Home；指纹口径一致与 same/older/drift/none/unknown、归档不参与；体检汇总三个 Agent 的精确计数；开关计划、存入范围，且读取前后 `snapshot()` 完全相同；待处理汇总；HTTP 白名单与返回。
- 新增 `tests/agents-inventory-browser.mjs`（7 组）：四张卡、未展开不读取；展开 Claude Code 分组与比对、不显示配置正文；Hermes 无法读取、Codex 落后版本、顶栏待处理 +3、待处理页三条线索并可跳回；开关预览内容与授权标注、预览后目录逐字节不变；内容清单与开关对话框控件均 ≥44px、axe（展开态、对话框）；“存入资产仓库”→ 预填范围 → 扫描 → 自动筛选 → 预览 → 确认 → 资产详情，主库有 `origin.location` 为该路径的资产，重新展开后该项变为“当前版本同内容”，Agent 目录不变；390 宽展开无横溢、44px、axe。
- 既有测试一个未改。

## 三、失败测试首跑（实现前）

- `node --test tests/agent-contents.test.mjs`（`cloud-agents-inventory-logs/01-unit-first-fail.txt`）：exit 1，`ERR_MODULE_NOT_FOUND: server/agent-contents.mjs`。先写测试与合成 fixture，后实现。
- `node tests/agents-inventory-browser.mjs`（`02-browser-first-fail-main-ui.txt`）：前端先按基点源码构建（`git stash` 仅暂存 `src/` 改动后 `npm run build`，随即恢复），exit 1：等待 `#agent-contents` 的“内容清单”标题 10 秒超时。
  说明：浏览器脚本是在前端组件写完之后才写的；为了取得“无此功能即失败”的证据，用基点前端构建跑了首跑。
- 实现后浏览器脚本第一次单独运行失败 1 处：收录后回到智能体群，再次展开仍显示收录前的缓存结果（“未收录”）。这是产品缺陷，不是测试问题；改为“每次展开都重新读取”（第一节第 8 条）后 7 组全部通过。

## 四、改动文件及 SHA256

| 文件 | 改动前（bf21a6d） | 改动后 |
|---|---|---|
| server/skill-files.mjs | d081db6d5a21fef00314986264a98da597473587761ad5a159f9ca575db110f7 | 60cdf0288ce8817bef786f11a4f2de4c227e171d8ba096b2e15e021c6ade4770 |
| server/http.mjs | 04f8df4aa4d36f382ec76d7359dae69c505220715a3a13f65fd6535f29c6ab52 | 9040f08fd2bdda49504d8325332a85e8a7af642c73a8edcf844bbf16a5829913 |
| src/pending.js | 50ac358850626c78a9ff96252618a6b90f7031e54c0920d80d5aca92449f0888 | eb1a5e203b67fa5e19876294e6193a4a7e333433ba25e268d8d556708f132a22 |
| src/App.jsx | 965e86ca0fea9a15c30677a7d88f88971a3fbbf207143c8c28c8c55b78111921 | e7b0aa5324ff00b310f66ee16bf0118f4c2d32876ee7cb36d97bb8814436b9a1 |
| src/PlannedPage.jsx | 0f092c0dd3365dfbd7401692d82125945d279010dae341a2ef923de800084841 | b291bf7544fa9c675d59e4deeda0162e0fda58c8d3ce3790f72ab6e5c6f5eef6 |
| src/DiscoveryPages.jsx | 85c5052f865333c4b04369e230963a1cbc6f17e2c3d5d02447ec3ac115cb4bf5 | 63bff038e49f17d7b374e667a174ba4c2456b8f26a340ec13f96c1e4cd853ce3 |
| src/SkillSources.jsx | cefe0c7df3aa9a04cb81235c2bd49588eb493e637b43b050b4d6f50be8dc574d | 15d349b6c986bce011ac27de76606d22db9b5c57521a7b5ff699db020b0e2a0b |
| src/Home.jsx | a2b4ed81b51ba02c0bbc7ef7673ca186fbb926fe86b8d737e7e17d94a686728a | 6fc26171f8b23ef28b2bb9b98d53f7ae145a459592ef973cadbceb048ea9695c |
| server/agent-contents.mjs | （新增） | 1f387a056b1cbe3310ca4693bf04f7427fd793606c918ed2fc8c3dde5f36260f |
| src/AgentContents.jsx | （新增） | c8f2f7a9b1b89004e05f0dbcd1f3e51212105d2078624f0380c3815bbde917d9 |
| src/agent-contents.css | （新增） | 8ef011013712b49ba81f096be4bf6bb7f47b3575a64f81c5947f60c2e28b69e8 |
| tests/agent-contents-fixture.mjs | （新增） | fda012b59ada28ab34784bbe10390031cbfb866db7ddb8f209967ce0f1a65d3c |
| tests/agent-contents.test.mjs | （新增） | 5cff4656c94be7be811932a68e468a625563fcdb54875e277b03ec43bf51efbb |
| tests/agents-inventory-browser.mjs | （新增） | 3d37eacd88dec51fa94af42bd4add29cd5c8eb8ca8a1dfaa616f5c97bac7ae4d |

## 五、验证命令与首次结果

| 命令 | 首次结果 | 对照云端已知失败集（CLOUD-SESSIONS §3.6） |
|---|---|---|
| `node --test tests/agent-contents.test.mjs`（实现后） | 9/9 pass | 新测试 |
| `node tests/agents-inventory-browser.mjs`（实现后首次单独运行） | 7 组 PASS（此前一次失败为收录后缓存未刷新的产品缺陷，已修，见第三节） | 新测试 |
| `timeout 1200 npm test`（`logs/03-npm-test.txt`） | tests 444 / pass 419 / fail 19 / cancelled 1 / skipped 5；`rule-templates.test.mjs` 照旧挂到外层超时（约 1200 秒） | 19 个失败与 `cloud-scrolls-in-assets-logs/12-npm-test.txt` 的失败清单逐条 diff **完全相同**：**增 0、减 0**。tests 435→444、pass 410→419，差额是新增的 9 项单元测试 |
| 35 个浏览器脚本各 1 次（`logs/04-browser-all.txt`：4 个基础脚本 + 31 个 `*-browser.mjs`） | 30/35 通过。失败：agent-config、rule-templates、rule-templates-fix（配置写入平台保护）、search（`palette-cold 718ms > 500ms`）、**agents-inventory**（新脚本） | 前 4 项在已知集内，原因与已知描述一致；已知集里的 interaction 本次通过（时序类，−1 不代表修复）。agents-inventory 失败原因：展开时先显示上次结果、重读尚未完成，脚本在重读完成前取了文字（竞态）。修复：界面在重读期间显示“正在重新读取 · 下方为上次结果”，脚本每次展开后等卡片 `aria-busy=false` 再断言；断言本身未改、未加长超时。修复后连续 3 次通过（`logs/05-…`）。最终相对已知集：**增 0、减 0**（interaction 为偶发时序通过） |
| 修复后相关复验（`logs/06-…`、`logs/07-…`） | 单元 agent-contents、pending、skill-sources、skill-origins、digital-world-ui 共 31/31；浏览器 nav-zones、agent-inventory、skill-source、accessibility、browser 全部通过 | — |
| `node tests/visual.mjs agents-inventory`（`logs/08-visual.txt`） | `problems: []` | — |

## 六、需要真人确认的视觉与产品点

1. “内容清单”分区放在检测卡片之后、原“能力体检（规划中）”分区之前；卡片为单列全宽。角色卡合入后与体检摘要同一行是否拥挤。
2. 体检摘要三枚徽标在无问题时是灰色“失效链接 0 / 与仓库不一致 0 / 无法读取 0”，有问题时变红或橙。是否只显示非零项。
3. 停用区位置 `<Home>/skills.disabled/<名>` 是本任务拟定的，Codex / Claude Code / Hermes 是否都不会扫描这个目录，需要在本机核实后再用于真实执行。
4. 各 Agent 配置文件名与插件目录（Codex：`config.toml`、`AGENTS.md`、`hooks.json`、`plugins/`；Claude Code：`settings.json`、`settings.local.json`、`CLAUDE.md`、`plugins/`；Hermes：`config.yaml`、`SOUL.md`、`plugins/`；OpenClaw：`openclaw.json`、`extensions/`）是按常见布局列的候选，需在本机核实；不存在时只显示“未发现”。
5. 截图（`cloud-agents-inventory-shots/`，4 张）：`contents-summary-1440.png`（体检摘要）、`contents-claude-expanded-1440.png`（展开清单）、`toggle-preview-1440.png`（开关预览）、`contents-hermes-390.png`（390 宽、无法读取分组）。

## 七、未完成项与风险

- **真实本机数据未验证**：本任务只用合成目录。v1.1 §4.1 所说 `~/.claude/skills`、`~/.hermes/skills` 各 233 个失效链接，需要在本机展开清单实测；逐个读取完整包的耗时（副本多时）也未在真实规模下测过。
- 只读默认 Home：Hermes Profile、`CODEX_HOME` / `HERMES_HOME` 指向的其他 Home 不在清单里（现有“目录与资产”抽屉仍能看到它们）。是否按管理目标（agentTargets）选择 Home，待定。
- MCP 分组固定为“未读取”。若要列出 MCP 名称，需要一个只投影表名、不回显值的解析器，属于配置读取范围扩大，需单独决定。
- 体检只覆盖本任务可证明的三类：失效链接、与仓库版本不一致的副本、无法读取。v1.1 §4.2 的“挂载与发布记录是否一致”（发布记录尚未实现）、“Hermes gateway 是否在线”未做；原“能力体检（规划中）”分区保留。
- “与仓库不一致”只认证据（旧版本指纹、`origin.location`、目标副本关系），不按名称猜；所以同名但从未建立关系的副本显示为“未收录同内容”，不计入不一致。
- 待处理里的智能体线索来自当前浏览器会话里最近一次读取；刷新页面后消失，直到再次展开。没有做后台定时体检。
- 豆包工作没有检测项，本任务未加。
- 云端结果不能代替本机回归；合入前请在本机重跑 `npm test` 与全部浏览器脚本，并核对第四节改动前指纹。
- 浏览器截图里 Hermes 的 `hermes-drift` 显示“未收录”：浏览器测试只能用普通写入初始化主库，不能伪造来源关系，所以“有来源关系但内容不同”只在单元测试里覆盖。

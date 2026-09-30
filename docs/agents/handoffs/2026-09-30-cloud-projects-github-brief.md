# 云端交接 · 任务 H3 · 项目空间第二批：GitHub 面板 + 每日项目简报（提前开发）

- 分支：`cloud/2026-09-30-projects-github-brief`（短名 projects-github-brief）。
- 基点：`cloud/2026-09-30-integration @ 7be59dc`（已集成第一阶段全部与 E2、F1–F4）。
- 性质：项目空间第二批**提前开发**，只推分支，不开 PR、不推 main；合入时机由本机决定。
- 本分支**没有改动** CURRENT.md、COLLABORATION.md、AGENTS.md、CLAUDE.md、package.json、package-lock.json、server/config-file.mjs、`docs/design/`。没有调用真实 GitHub，没有接收费模型或外部服务，没有读凭据。
- 依据：产品定义 v1.2 §4.1“第二批”；问题共识基线 v2.2 D29；E2（在推进标记、状态卡、停滞雷达、安全体检）与 F1（协同看板、留痕、一键开工）。

## 一、结论

| 项 | 结果 |
|---|---|
| 新单元测试 `tests/project-brief.test.mjs` | 首跑：模块不存在；空桩下 17/17 失败；实现后 17/17 通过 |
| 新浏览器测试 `tests/projects-brief-browser.mjs` | 首跑：前端恢复为基点版本后，第 1 步等待“今日项目简报”超时失败；实现后 11 步全部通过 |
| `timeout 1200 npm test` | tests 553 / pass 528 / fail 19 / cancelled 1 / skipped 5（外层 timeout 在已知挂起处到点，exit=124）。失败名单去掉耗时后与集成分支日志逐条 diff 为空：**新增 0、减少 0**；553 = 536 + 本任务新增 17 |
| 全部浏览器脚本（40 个，含新增 projects-brief） | 36 通过、4 失败：agent-config、rule-templates、rule-templates-fix（配置写入平台保护）、search（palette-cold 828ms > 500ms）。4 个都在已知集内，**新增 0**；interaction 本次通过，属时序波动，不算减少 |
| `node tests/visual.mjs projects-github-brief` | `problems: []`，exit 0 |

## 二、改动与理由

### 1. GitHub 面板（`server/project-github.mjs`，`src/ProjectGithub.jsx`）

1. **查什么**：只查“在推进”且有 GitHub 远程（扫描得到 `repoKey`）的项目。每个仓库按顺序做 5 次只读调用：
   - `gh api --method GET --hostname github.com repos/<owner>/<name>`：取默认分支；
   - `gh pr list --state open --limit 20`：打开的 PR（编号、标题、链接、草稿、作者、创建与更新时间）；
   - `gh pr list --state merged --limit 10`：最近合并的 PR（含合并时间）；
   - `gh issue list --state open --limit 20`：打开的 Issue；
   - `gh run list --branch <默认分支> --limit 10`：默认分支最近的 workflow run。CI 状态取最近一次；“上一次”只取**同一 workflow**、已结束的一次，用来判断“由成功变为失败”这类变化。
2. **只读怎么保证**：
   - gh 参数必须命中白名单 `readOnlyGhArgs` 的四种形状（api 只能 GET 且只能是 `repos/<owner>/<name>`；其余只能是 `pr list`、`issue list`、`run list`，状态值、分支名、limit、字段列表都逐项校验）。不在白名单的调用**不启动进程**，直接拒绝。
   - 单元测试逐条列出被拒的写操作（`pr create/merge`、`issue close`、`api --method POST`、`run rerun`、`auth login/token`、带 `-f` 的 api、以 `-` 开头的仓库名或分支名等）；HTTP 与浏览器测试把桩脚本记录的每一次真实调用都回放给白名单核对。
   - 只在固定路径找 gh（`/opt/homebrew/bin/gh`、`/usr/local/bin/gh`、`/usr/bin/gh`，与 E2 的可见性查询一致），不经 PATH；环境只关交互与分页（`GH_PROMPT_DISABLED`、`GH_PAGER=cat` 等），工作台不读取也不传入任何令牌。
3. **失败回退**：找不到 gh、未登录（退出码 4 或提示 `gh auth login`/401）、无权限或仓库不存在（403/404/无法解析仓库）、超时、输出无法解析、其他失败，一律返回 `state: "unknown"` 与一句中文原因，不抛错。页面写“未知 · 原因”，**不弹错误、不提示去登录**。第一步（仓库信息）就失败时不再发后面 4 个查询；后面某一类失败时只把那一类标未知（例如只有 CI 未知）。
4. **只取白名单字段**：标题去控制字符并截到 200 字，链接只接受 `https://github.com/…`，时间规范成 ISO；PR 正文等其他字段一律丢弃（测试放了 `BODY-MARKER` 断言不出现）。
5. **缓存**：结果只存在服务进程内存，按仓库缓存 10 分钟，并带查询时间（页面显示“更新于 …（缓存）”）。“刷新 GitHub”强制重查；同时发出的两次查询共用一次 gh 调用。**成功之后再失败**时如实显示未知，并注明“上次成功查询：时间”，**不沿用旧列表冒充当前**。缓存不进主库、不进备份，服务重启后重新查询。
6. **界面**：项目空间“在推进”区的每张状态卡在安全体检下方新增 GitHub 块；工具栏新增“刷新 GitHub”。没有 GitHub 远程的项目写“没有 GitHub 远程，不查询 GitHub。”；没有在推进项目时不发请求。

### 2. 每日项目简报（`server/project-brief.mjs`，`src/ProjectBrief.jsx`）

1. **位置**：世界总览新增“C 今日项目简报”卡（产品定义 v1.2 §2 的顺序：安排、待处理、项目简报、今日热点）。原来的能力地图、最近迭代、今日热点顺延为 D、E、F（只改了序号字母）。
2. **统计区间**：本机时区**昨天 0 点至今**。早上打开能看到昨天一整天和今天到目前的变化；卡片上写明区间。
3. **每个在推进项目一段话**，全部由确定规则拼成，**不调用任何模型**（`composeBrief` 是纯函数，同样的事实得到同样的段落）：
   - **昨天到今天**（按下面顺序，有才写）：
     - CURRENT：区间内新增的状态标题（按标题里 state_id 的日期）“CURRENT 新增 N 个状态，最新 X（标题）”；没有新标题但文件修改时间在区间内，写“CURRENT 有修改（状态编号 X）”；
     - 新交接：`docs/agents/handoffs/*.md` 中修改时间在区间内、且文件名日期（有的话）不早于昨天的份数与前三个文件名。只看文件名与修改时间，不读正文。加文件名日期条件是因为重新检出会刷新修改时间，旧交接不能算新；
     - 新提交数：`git rev-list --count --since=<区间起点> HEAD`（只读，沿用 E2 的 Git 隔离参数）；
     - PR：区间内新开、区间内合并的个数与前两个编号标题；区间内新开的 Issue；
     - CI：最近一次运行在区间内时，写“CI 由成功变为失败”或“CI 最近一次运行成功”；
     - 未知项放在最后：“新提交数未知”“GitHub 情况未知（原因）”“GitHub 部分未知：PR、CI”；
     - 什么都没有时写“没有记录到新的变化”。
   - **今天的唯一下一步**：CURRENT 协作状态表的“唯一下一步”。缺失时写“未知（项目里没有 CURRENT.md / 没有协作状态表 / 状态表缺少唯一下一步 / 状态无法读取：原因）”，不补造。
   - **卡点**：停滞（“已 N 天没有状态更新或提交”，直接用 E2 停滞雷达的结论）、安全体检问题（E2 的问题清单）、默认分支 CI 当前失败（即使失败发生在区间外也算，因为它现在仍卡着）。都没有写“未发现”。
   - 所有字段经过 F1 的疑似凭据整段替换（`redactSecrets`）与控制字符清理。
4. **一键开工**：每段下方直接复用 F1 的 `StartWork`（开工口令、选择 Agent、预览、确认复制、计入协同留痕），按钮文字为“一键开工”。
5. **与面板共用缓存**：简报读 GitHub 时走同一份缓存，不重复调用 gh（HTTP 测试断言了调用次数不增加）；“刷新简报”会连同 GitHub 一起强制重查。

### 3. 标为已读（`server/brief-schema.mjs`，主库 `briefReads`）

1. **存什么**：顶层集合 `briefReads`，每条 `{schema:1, date, projectId, digest, at}`，多一个字段即拒绝；`date` 必须是真实日期，`digest` 是段落全文的 SHA-256（不存正文），同一天同一项目只能有一条，上限 1000 条。旧库没有这个字段时按空处理。
2. **“有更新”**：已读记录的是“看到的那段话的指纹”。当天项目又有变化（例如新提交）时段落变了、指纹不同，徽标从“已读”变为“有更新”，可以再次标为已读（替换当天那条记录）。
3. **写入口**：只有 `POST /api/project-brief/read {date, items:[{projectId, digest}]}`（1–50 条），经 `repository.updateBriefReads` 写入；同一内容重复标记不写主库、不增版本；项目不存在返回 404；多字段、非法日期或指纹返回 400。与 F1 的留痕接口一样**不要求 revision**：已读只改 `briefReads`，其余数据由 `validateHistory` 保证不变。
4. **普通保存不能改**：`validateHistory` 新增 `allowBriefs`，`PUT /workspace` 改动 `briefReads` 一律拒绝。
5. **备份**：已读状态与连接一样是本机状态（项目 ID 来自本机扫描），从空库恢复时不导入，合并到已有库时保留本机的，不被备份覆盖。
6. **清理**：写入时顺带去掉 31 天前的记录。
7. 界面：每段一个“标为已读”（已读后变为禁用的“已读”），卡片顶部“全部标为已读”“刷新简报”。

### 4. 其他改动

- `server/project-status.mjs` 只把 `gitRunner`、`notRepository`、`noCommits` 改为导出，行为不变（E2 的 19 条单元测试与浏览器测试照旧通过）。
- `src/ProjectStatus.jsx`：`StartWork` 改为导出并允许自定义按钮文字（默认仍是“生成开工口令”）；状态卡接入 GitHub 块；工具栏加“刷新 GitHub”。
- `server/http.mjs`：新增 `githubCli` 适配器（默认真实只读运行器，测试注入桩）与三个接口：`POST /api/project-github/panel {refresh?}`、`POST /api/project-brief/today {refresh?}`、`POST /api/project-brief/read`。前两个只接受空对象或布尔 `refresh`，不接受任何路径。

## 三、改动文件前后 SHA256

| 文件 | 基点 7be59dc | 本分支 |
|---|---|---|
| server/http.mjs | 6e33caeb6d01d8f88da0567d979ca0bbf442effbb2fcd17571db3b8520cc55cc | 8cceecf7c6446150463d8fe57f6d3562d62cb72308e8f2e3cbbc71ff942e5907 |
| server/merge.mjs | b6dda44a0135ba6f1a13b2015827a667d98a40d2e61f95addb221875180269d4 | 86fca5c1299aa644e3de275d8e182ffd8e1a543602aae364da5e57bc2412197f |
| server/project-status.mjs | 2e86b3d23e2714285d1c136dfbbb02916a3f40f05b39d60495090c8555931c5e | 5e81ee1902a9916ee6da92294cbd076ba32dc91694a6bffa8a65fb5940400c44 |
| server/repository.mjs | 47a02f318cde0d244e4a012f4aea3e49731b8ea96e7a0a9aeb075c1e9065c3ef | b46e469d10acdb6a927a8333d380f1115a4abf97fa0d583c8c64968b371cc84f |
| server/schema.mjs | 86ee6f5695180f79bf7ec56d127fe6edeebb2f9de4709368ae71d1636f09a6c9 | c0314892f7a5045abc35fdb1495ebcaf636a59f0312766de77bbba56a831e13e |
| src/Home.jsx | f64d06a0e1966cf1508b3b4a6a8f1e1462f4f9f8c9b390ea510742b5b784fadf | 217a62f56579d68a8d3f27876ca9585db10717e1609f02de2717e73aad6ae106 |
| src/LifePages.jsx | 498316c40aed8b05216283bc9d2457e2ebdee4ef67a1c42366a016d195e86e03 | 6420876b9039b48f7d93d6418d3db9544fb4af98f36fd921160a8ca9ec16367d |
| src/ProjectStatus.jsx | 67b9a43633f13ed1f91b844a24efc7470627a00e60a84830b2ca0981b1728534 | 8d0a59e3993266c3fa5d8fd44c2b787dda826cbcb959b4f83d5eda8932052cf9 |
| server/brief-schema.mjs（新增） | —（新增） | 9aca3363349fd82b43e84466be0cd6f0cd7adbe15f3cd5db1cc371de8abe08aa |
| server/project-brief.mjs（新增） | —（新增） | 564d454d20070d1bba00450c7fe7ac62a9158bf10a5bf5d8dd57ad00bc0b6921 |
| server/project-github.mjs（新增） | —（新增） | 4a0ad88701490e0c4d96ec3824015a57e9b4899c003ef3d97ec6e51aa9dcf27b |
| src/ProjectBrief.jsx（新增） | —（新增） | 0d36cc5d13a75720362a8313cade24f2dfcfcf3effc6fde85b82d47b618a5833 |
| src/ProjectGithub.jsx（新增） | —（新增） | b0c65fb687ffe26224936e4c848008e6d37206cfe831b4c93e7fcd5170019524 |
| src/project-brief.css（新增） | —（新增） | cdfd967553a80e5df738d668b09b1e7d0938d66ddbc910a07a270ea0610ed0e7 |
| src/project-github.css（新增） | —（新增） | 66c927d2a595ceb5e42d7d42d9fb9ccf1d795d6a2fa12c2f2e26f422ef497798 |
| tests/project-brief-fixture.mjs（新增） | —（新增） | edae041a32f42afc1ad2dee7dd1df82c9d97a88c5ca7a39a76378ea86f2e83ab |
| tests/project-brief.test.mjs（新增） | —（新增） | 9288d277a6d12b8222e0ada77bce0a7dc1efdba3aa11bebcc489862e3a68e4ac |
| tests/projects-brief-browser.mjs（新增） | —（新增） | a4eb24d5740c07a71ef23aa52fd2db5e6e455d1b6fbecf52f953e9c401355321 |

说明：基点列与集成交接（2026-09-30-cloud-integration.md 第六节）记录的“集成分支”指纹一致，可据此确认基点无漂移。

## 四、失败测试首跑摘要

- `01-new-test-before.txt`：
  - 第 1 次：`ERR_MODULE_NOT_FOUND`（`server/project-github.mjs` 不存在）。
  - 第 2 次：放入只抛“未实现”的空桩后，测试文件因顶层调用 `briefWindow` 在加载阶段整体中止。把统计区间改为惰性计算（测试此前从未通过，断言未改）。
  - 第 3 次：空桩下逐条运行，**17/17 失败**。schema 两条的失败原因分别是“包含不支持的字段”（基点 schema 拒绝 `briefReads`）与“缺少预期异常”（基点没有已读保护）。
  - 实现后首次运行 16/17：唯一失败是**测试自身的正则过宽**（`/create|merge|…/` 命中了参数里的 `merged`、`createdAt`）。在它第一次通过之前改为逐条检查子命令位置（api 必须 GET，其余必须 list，不含写方法与令牌），本意不变。原文摘录在日志 01 末尾。
- `03-browser-test-before.txt`：服务端已实现、前端恢复为基点版本后构建，第 1 步等待“今日项目简报”标题超时失败。
- 覆盖面：
  - gh：只读白名单（5 种允许、13 种拒绝）；PR / Issue / 仓库 / run 解析（白名单字段、控制字符、超长标题、非 GitHub 链接、非法时间、非数组与损坏 JSON）；CI 汇总（成功、失败类、运行中、取消、其他、无记录、只比同一 workflow）；失败分类 9 种且都不提示登录；
  - 运行器：找不到 gh、白名单外不启动进程、桩脚本真实执行、未登录；面板：全量成功、仅 CI 失败、403、未登录（只发 1 次调用）、输出损坏、适配器抛异常；
  - 缓存：只查在推进且有远程的项目、有效期内复用、刷新、过期、成功后失败给出上次成功时间、并发去重；
  - 简报规则：统计区间（含跨年）、多来源同时变化、完全无数据、停滞 + 体检 + GitHub 未知 + 提交数未知、只改正文 / CI 未变化 / 区间外失败 / 部分未知、区间边界、状态读取失败、缺唯一下一步、疑似凭据、多份交接截断；
  - 已读：schema（10 种非法）、普通保存不能改、备份不导入不覆盖、HTTP 写入 / 去重 / 有更新 / 7 种非法输入 / 404；
  - 只读：HTTP 与浏览器全过程项目文件（含 `.git`）逐字节不变，面板与简报不增加主库版本。

## 五、验证命令与首次结果

全部在 Node 24 下运行，日志在 `docs/agents/handoffs/cloud-projects-github-brief-logs/`。

| 命令 | 日志 | 首次结果 | 相对已知失败集 |
|---|---|---|---|
| `node --test tests/project-brief.test.mjs`（实现前） | 01 | 模块不存在；空桩 17/17 失败 | —（预期的首跑失败） |
| `node --test tests/project-brief.test.mjs`（实现后） | 01 末尾、02 | 首次 16/17（测试自身正则过宽，见第四节），更正后 17/17 | — |
| `node tests/projects-brief-browser.mjs`（前端为基点） | 03 | 第 1 步超时失败 | —（预期的首跑失败） |
| `node tests/projects-brief-browser.mjs`（实现后） | 04 | 11 步全部 PASS，exit 0 | — |
| `npm run build` | — | 通过 | — |
| 定向回归：project-status、collab-board、digital-world-ui、server、repository、pending、silver-agents、knowledge-profile、learning、project-brief 单元测试；project-status、collab-board、nav-zones、aihot-learning 浏览器 | — | 120/120；4 个浏览器脚本 exit 0 | — |
| `timeout 1200 npm test` | 05 | 553 / pass 528 / fail 19 / cancelled 1 / skipped 5 | **新增 0、减少 0** |
| 全部浏览器脚本（每个外加 `timeout 600`，只防挂起） | 06 | 40 个：36 通过、4 失败 | 4 个均在已知集，**新增 0** |
| `node tests/visual.mjs projects-github-brief` | 07 | `problems: []` | — |

## 六、需要真人确认的视觉点

截图在 `cloud-projects-github-brief-shots/`，共 4 张：

1. `1-home-brief-1440.png`：世界总览“今日项目简报”卡（三段简报、未读徽标、标为已读、一键开工）。
2. `2-github-card.png`：项目空间状态卡里的 GitHub 块（打开的 PR、最近合并、Issue、默认分支 CI、更新时间）。
3. `3-github-unknown.png`：gh 未登录时的 GitHub 块（未知 + 上次成功查询时间）。
4. `4-home-brief-390.png`：390 宽的简报卡。

请确认：

- 简报卡放在“待处理”下面、能力地图上面，并把后面三节的序号顺延为 D/E/F，是否合适。
- 一段话里用青色加粗标出“昨天到今天 / 今天的唯一下一步 / 卡点”三个小标题，是否好读；段落较长时（例如协同项目）是否需要改成三行。
- GitHub 块里每条 PR / Issue 链接按 44px 行高排列，卡片会变长；是否改为只显示数量、点开再看。

## 七、未完成项、风险与待确认

1. **真实 gh 没有验证**：云端没有 gh，全部用桩脚本与函数桩。真实 gh 的 JSON 字段名（`isDraft`、`mergedAt`、`databaseId`、`workflowName`）按 gh 官方文档写；退出码 4 表示未登录、`HTTP 404` 等 stderr 文字也按官方行为写。需要在本机（已登录 gh）用本项目实测一次面板，并用未登录状态确认显示“未知”。
2. **统计区间“昨天 0 点至今”是本任务的取舍**：晚上打开时区间接近 48 小时。也可以改为“最近 24 小时”或“上次标为已读以来”，请用户决定。
3. **CI 失败即使发生在区间外也算卡点**：它现在仍然失败。若只想看区间内的变化，请告知。
4. **提交数按提交者时间统计**：rebase 或 cherry-pick 会把旧改动算成新提交。
5. **缓存只在内存**：服务重启后第一次打开首页会重新查询 gh（每个在推进仓库 5 次调用）。首页加载时简报与“在推进”区各自发起一次状态体检，属重复读取，数据量小，暂未合并。
6. **“标为已读”不要求 revision**（与 F1 留痕接口相同理由），请复核方确认。
7. **Issue 新开也写进简报**：任务只要求 PR/CI，Issue 同为 GitHub 面板内容，一并写入；不需要可以去掉。
8. **待处理没有接入 CI 失败**：任务没有要求，CI 失败只在简报卡点与面板中出现。
9. 云端 Linux / root 环境与本机不同（见 CLOUD-SESSIONS §3.6）；本机合入前需要在 macOS 上重跑相称回归，并用 5178 实际服务确认页面。

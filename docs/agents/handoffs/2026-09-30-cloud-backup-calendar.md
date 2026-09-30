# 云端交接 · H2 · 5.1 完整备份 + 5.2 日历与 todo（backup-calendar）

- 分支：`cloud/2026-09-30-backup-calendar`（云端副本，非权威；未开 PR、未推 main）
- 基点：`cloud/2026-09-30-integration` @ `7be59dc`（先 fetch 再新建分支）
- 依据：产品定义 v1.2 §4.8、v1.1 §4.5 与 §4.8；路线 v3 5.1、5.2；基线 v2.2 D13、D38、Q31；原 `src/StoragePanel.jsx` 与 `/api/backup`、`/api/import/*`（普通导出 / 合并保持原样）
- 未改：CURRENT.md、COLLABORATION.md、AGENTS.md、CLAUDE.md、`server/config-file.mjs`、package.json / package-lock.json；没有接入收费模型或外部服务，也没有读取凭据

## 一、结论先行

| 项 | 状态 |
|---|---|
| 5.1 完整备份（打包 / 校验 / 篡改检测 / 预览 / 恢复到隔离目录） | 已实现；单元测试 + 浏览器测试通过（云端 Linux） |
| 5.2 服务端（平台检测、助手输出解析、权限、写后回读、冲突以回读为准） | 已实现；单元测试用桩通过 |
| 5.2 本机小助手 `server/calendar-helper.swift`（EventKit） | **已编写，但未编译、未运行**：云端没有 swift，也没有 EventKit。**需本机验证** |
| 5.2 界面（日历页周视图 + 今天、拖出规划块、会议只读、夜巡窗口草稿、todo、首页时间安排、不可用 / 未授权状态） | 已实现；浏览器测试用桩助手全部通过 |
| 回归 | npm test 与全部浏览器脚本相对已知失败集：**新增 0、减少 0**；visual `problems: []` |

## 二、改动与理由

### 5.1 完整备份
- **`server/full-backup.mjs`（新增）**
  - `packDirectory`：遍历整个数据目录，覆盖主库指针 `CURRENT.json`、全部 `snapshots/`、`config-operations/`、`rule-*` 日志、`knowledge-writes/`、`aihot/`、`silver/` 等。
    - 用 fflate `zipSync` 打成单个 zip：`manifest.json`（format `workbench-full-backup`、schema 1、createdAt、totalBytes、每个文件的 path/size/sha256、skipped），文件放在 `data/<路径>` 下。
    - 排除的运行时文件：写锁 `.writer-lock.sqlite*`、各模块写入中的临时文件、`.DS_Store`。
    - 符号链接和非普通文件不跟随，记入 `skipped`。
    - 打包前核对主库指针与快照一致。
  - `inspectBackup`：解压并逐项核对，任一不符都返回 400，不写任何文件。核对项：
    - 清单格式和版本；
    - 路径安全（拒绝 `..`、绝对路径、反斜杠）；
    - 文件集合与清单完全一致（缺文件、多文件都拒绝）；
    - 每个文件的大小与 SHA256；
    - 主库指针与快照一致；
    - 解压总量不超过 1 GB，防止压缩炸弹。
  - `previewRestore`：与当前目录比对，列出新增（当前目录没有）、冲突（内容不同）、缺失（备份里没有）和相同数量。
  - `restoreTo`：目标必须不存在，且与当前目录互不包含。
    - 先写到同级暂存目录 `.<目标>.partial-*`（0700 / 0600，逐个 fsync）。
    - 写完逐个回读，重算 SHA256。
    - 用 `openRepository` 按正常流程打开并读取主库。
    - 全部通过后才改名为目标目录；任一步失败就删除暂存目录。
    - 从不写当前目录。
  - `createFullBackup`：
    - `create` 在主库写队列内打包，文件名为 `数码世界-完整备份-YYYYMMDD-HHMMSS.zip`。
    - `preview` 把上传的 zip 暂存在内存（只保留最近一份，10 分钟有效），目标固定为 `<数据目录>-恢复-<时间>`，由服务端生成，客户端不能指定路径。
    - `restore` 凭一次性预览凭据执行。
- **`server/http.mjs`**：
  - 新增 `POST /api/full-backup/{create,preview,restore}`。
  - 错误响应透传 `unknownResult`。
  - 关闭服务时清空预览。
- **`src/StoragePanel.jsx`、`src/styles.css`（少量新增样式）**：设置页“本地数据”新增“完整备份（整个数据目录）”一行。
  - 导出完整备份。
  - 从完整备份恢复：先显示恢复前预览（新增、冲突、缺失、相同数量；各类路径可展开；新目录位置；当前目录不会被修改）。
  - 确认后显示校验文件数、主库修订号，以及手动切换说明（停止工作台后用 `WORKBENCH_DATA_DIR` 指向新目录）。
  - 原说明“knowledge-writes 不在此备份中”改为指向完整备份。

### 5.2 日历与 todo
- **`server/calendar-helper.swift`（新增，需本机验证）**
  - Swift 命令行，通过 EventKit 实现以下命令：`status`、`request-access`、`events`、`create-event`、`update-event`、`reminders`、`create-reminder`、`update-reminder`。
  - 每次只输出一行 JSON。
  - 只在“工作台”日历 / 提醒事项列表里新建和修改，不存在时自动新建；其他日历只读；不删除任何条目。
  - 保存后用一个新的 `EKEventStore` 按标识回读。
  - 修改前比对 `expectedModified`（上次回读的最后修改时间），不一致就返回 `conflict` 和当前内容，不写入。
  - 设提醒时同时写 `dueDateComponents` 和 `EKAlarm`，以便手机响铃。
  - 使用 macOS 14+ 的 `requestFullAccessTo…` 接口。
- **`server/calendar.mjs`（新增）**
  - `detectPlatform`：非 darwin 返回“只在 macOS 上可用”，并且不调用助手。
  - `parseHelperOutput`：取输出的最后一行 JSON，按约定形状严格校验权限状态、事件、提醒事项、错误类型，其他一律 502。
  - `reconcile`：逐字段核对写入值与回读值，时间按时刻比较。
  - `createCalendarHelper`：用 `/usr/bin/swift <脚本> <命令> '<JSON>'` 调用子进程，超时 30 秒；测试注入桩 `run`。
  - `createCalendar`：
    - 读取：不可用或未授权时如实返回原因，不做替代存储。
    - 写入前先查权限。查不到时报“不可用”，并标 `operationNotStarted`；未授权时返回 409。
    - 写入发出后助手失败，报“写入结果未知，请刷新核对”，并标 `unknownResult`，不假设成功或失败。
    - 冲突时返回回读内容，并提示“以回读为准”。
    - 输入校验：一句话 1–200 字；规划块时间有效、结束晚于开始、不超过 24 小时；修改必须带回读版本号。
- **`server/http.mjs`**：
  - `GET /api/calendar/status`
  - `POST /api/calendar/{access,week,todos,blocks/create,blocks/update,todos/create,todos/update}`
  - `startServer` 的 `discovery.calendarHelper` 可以注入 `{platform, run}`。
- **`src/Calendar.jsx`、`src/calendar.js`、`src/calendar.css`（新增）**
  - 日历页：周视图（周一起）+ 今天视图，可前后翻周 / 翻天。
  - 24 小时时间轴，首次显示滚到 8 点。
  - 按住拖动拖出规划块，按 15 分钟取整。拖动只打开对话框，填一句话后点“写入‘工作台’日历”才写入。另有“新建规划块”按钮作为键盘和触屏入口。
  - 点击规划块可以修改，保存前核对是否已被改过。
  - 其他日历的会议只读，显示为不可点击的 `role=note`。
  - 夜巡窗口按 `state.night` 以斜纹显示，标“草稿”。
  - 项目里程碑：项目空间目前没有里程碑数据，图例如实写“暂未提供（可选，尚未接入）”。
  - 首次使用先说明需要日历和提醒事项权限，以及写入范围；点“授权日历与提醒事项”后才申请。已拒绝时指引去系统设置。
  - todo 面板读写“工作台”提醒事项：
    - 勾选完成，写入中先显示点击后的状态，回读后按回读替换；
    - 设置 / 修改 / 清除提醒时间；
    - 新建 todo；
    - 冲突以回读为准，用页面顶部提示和 toast 告知。
- **`src/Home.jsx`**：
  - “时间安排”区块用 `HomeSchedule` 显示今天的规划块和未完成 todo；不可用、未授权或读取中都如实说明。
  - 保留夜间窗口标尺。
  - 结构地图里日历的说明改为“本机日历与提醒事项 · 需授权”。
- **`src/pages.js`**：日历 `maturity: planned → partial`，去掉规划说明，并改写页面导语。
- **`src/App.jsx`**：`#calendar` 改为渲染 `CalendarPage`，不再渲染规划页。
- **`src/api.js`**：请求错误对象带上 `unknownResult`。

### 测试文件
- 新增 `tests/calendar-fixture.mjs`（内存桩助手，只替换子进程输出，可模拟在系统应用里修改和回读漂移）、`tests/calendar.test.mjs`（10 例）、`tests/full-backup.test.mjs`（5 例）、`tests/calendar-todo-browser.mjs`（9 段）、`tests/full-backup-browser.mjs`（4 段）。
- **`tests/digital-world-ui.test.mjs`：两处断言按新需求更新（不是凑通过）。**
  - 原断言“日历 maturity 为 planned、渲染规划页”和“首页出现‘日历尚未接入’”描述的是本任务要取代的状态，做法与 F2 更新 AI HOT 断言相同。
  - 现在断言：日历为 `partial`、没有 plan；首页不再出现“日历尚未接入”，而是先显示“正在读取日历…”。
  - health 的规划页断言保留不动。

## 三、先写失败测试的首跑摘要

- `01-unit-first-fail.txt`：`node --test tests/full-backup.test.mjs tests/calendar.test.mjs`，两个文件都报 `ERR_MODULE_NOT_FOUND`（`server/calendar.mjs`、`server/full-backup.mjs` 尚不存在）。
- 实现服务端后，唯一剩下的失败是“本机小助手脚本存在”（`calendar-helper.swift` 尚未编写）；编写后 14/14 通过。
- 实现前对自己的新测试做过一处补充：“助手失败”用例原先把状态检查失败和写入失败混在一起，拆成两段——写入前状态检查失败，断言“不可用 + operationNotStarted”；写入发出后失败，断言“结果未知 + unknownResult”。
- `02-browser-first-fail.txt`：`calendar-todo-browser.mjs` 在第 1 段超时，找不到 `.cal-unavailable` 里的“只在 macOS 上可用”（日历页仍是规划页）。
- 浏览器测试在实现过程中有三处调整：
  - 拖动前把时间轴滚到固定位置，保证 10:00–11:00 在视口内；
  - 第 2 段补断言授权成功的 toast（它挡住了后续 toast 断言）；
  - 第 5 段结束后点“知道了”，使第 6 段检查的是新出现的冲突提示。
- 第 6 段第一次失败暴露了真实缺陷：勾选框是受控组件，写入期间会弹回未勾选。已在界面加“写入中先显示点击后的状态”，没有改测试。
- `full-backup-browser.mjs` 是**在界面实现之后**补写的（任务只要求日历浏览器测试），没有“先失败”记录。其中删掉了一条下载文件名断言：无头 Chromium 对共用的 `download()` 助手报告的建议名是 “download”，既有测试也都不断言文件名；文件名由 HTTP 单元测试核对。

## 四、验证命令与首次结果（日志在 `cloud-backup-calendar-logs/`）

| 命令 | 日志 | 首次结果 | 相对已知失败集 |
|---|---|---|---|
| `npm run build` | 03、05 | 成功（只有既有的 chunk 体积警告） | — |
| `timeout 1200 npm test` | 04 | tests 551 / pass 526 / fail 19 / cancelled 1 / skipped 5；跑满 1200 秒（exit 124，rule-templates.test 照旧挂起）。比基点多 15 例，即新增用例，全部通过 | 失败名单（去掉耗时）与 `cloud-integration-logs/06-npm-test.txt` 逐条 diff 为空：**增 0、减 0** |
| 新增和改动的单元测试在最终源码上重跑：`node --test tests/calendar.test.mjs tests/full-backup.test.mjs tests/digital-world-ui.test.mjs` | 07 | 26/26 通过 | npm test 运行期间改了 `src/Calendar.jsx`、`server/calendar.mjs` 各一处小问题，所以补跑 |
| 全部浏览器脚本（4 个基础 + 37 个 `*-browser.mjs`，各加 `timeout 600` 防挂起） | 06 | 41 个：37 通过、4 失败——agent-config（回读不一致）、rule-templates（TimeoutError）、rule-templates-fix（matches_before）、search（palette-cold 579ms > 500ms）。新增的 calendar-todo、full-backup 都通过 | 4 个全在已知集：**增 0**；interaction 本轮通过（时序波动，不计为减少） |
| `node tests/visual.mjs backup-calendar` | 08 | `problems: []` | — |

## 五、改动文件前后 SHA256（基点 `7be59dc` → 本分支）

| 文件 | 基点 | 本分支 |
|---|---|---|
| server/http.mjs | 6e33caeb6d01d8f88da0567d979ca0bbf442effbb2fcd17571db3b8520cc55cc | dd90464e2bde93f05bdbc57c088b05c97fbb537488ab616c91e576c150d3bcd3 |
| src/App.jsx | e2d2b37ea77c0ae8728eb1cd70592bd1ebc9aa27161470424ae0c5bef1ad4e3d | 6a1d7901e49a5d6bcf16ecc95760cd07695620b4b814de8c9bd7fa160794aec6 |
| src/Home.jsx | f64d06a0e1966cf1508b3b4a6a8f1e1462f4f9f8c9b390ea510742b5b784fadf | 31fa4f841d83d7f37a999aa6d94d8afbb17a8f5a9651763561a3dcf5b7976841 |
| src/StoragePanel.jsx | 1e4d775e631f2797ebd2a0dc09bdbd770f17fa731c0db0cbfe04a8edbda5a895 | 24236fc6250b51602ae384ebc7f7e4ebff946e7587983af425ad85b5f0581107 |
| src/api.js | 3778113f2c22bbf7b7ea9b90765ad501a5796912b0eb260b9490efa1d66625f5 | 942d6733f1b5a41778a7e071e3a4b30974d90713455a74821a74f796401d81ee |
| src/pages.js | 3d21f16791829c3ec61a45b375074c27c4187d1f95f3bb0a509c92ae91e03c4c | 42ba5b6b9dd148335bb0e17ab24345aa11ba1079fd86004d60431efab377272a |
| src/styles.css | 0907686f5c36cb40dd61b29c1e4518a6493a69e8fd9f1dc1e1a581092c8d9def | fdee9bad4e6667cc00e0a3c9f1c2d73b916b015e3e00f8e8910ab0293c688b88 |
| tests/digital-world-ui.test.mjs | 397c9c78a73992826b9b3750804d07c5e232800582cbf3ed5946f1328df6cc63 | 0845028c91a66f33b61fdef2e44ccb0503976f4d13d6238257413f9642ad0e30 |
| server/full-backup.mjs | —（新增） | 9802296c8d6a9a495b9dc2c41469278ba6a86fb402e714fcf2e614717c0e10cc |
| server/calendar.mjs | —（新增） | eeaef95f73821f7f15505be861431688d551938dc75b200448f305a54b7dc447 |
| server/calendar-helper.swift | —（新增） | e8eaeedaf511a07fbd259cdaee63c7f593b0ebda9e7c75163795120dc7efd537 |
| src/Calendar.jsx | —（新增） | 1eb93b6b4a0ca7bfea66399df6d3c82f17e60d1b79d1b5fca8ad0be6fda7b291 |
| src/calendar.css | —（新增） | 50c433305d1db1d29356426d74a46d02b49c34c94cd7b94a34ca1b0be558858a |
| src/calendar.js | —（新增） | ff0bee00e9302b6d51c849d30e18f925fc42a003eea7d16cc09f86845436f6e4 |
| tests/calendar-fixture.mjs | —（新增） | 5f9554c2a9a98a923148f08e6194caad03152495a4fa7d60b3e120948ef2eb98 |
| tests/calendar.test.mjs | —（新增） | e482b49b4473c221461e8ed36c9d519fadea0b685322e404f795b683290a1f3e |
| tests/calendar-todo-browser.mjs | —（新增） | 236fc8726a2a864e991174eac442ee14fc5ccc1b9371422a831a8bb206af6698 |
| tests/full-backup.test.mjs | —（新增） | dd833bdfca40638254734e6b0d5bd3c581d589d8fa73b975aca69aff16c270b5 |
| tests/full-backup-browser.mjs | —（新增） | b437e7fb060d0230da52f9eb164dd0f421c308a5e511b1fbf4c92b45aa2ff88e |

## 六、需要真人确认的视觉点（截图在 `cloud-backup-calendar-shots/`）

1. `calendar-week-todo-1440.png`：
   - 规划块（橙色实框）与会议（虚线灰框）是否容易区分；
   - 30 分钟以内的块被撑到 44px 高，会压到下一时段，是否可以接受；
   - todo 每条下面单独一行“设提醒”，行距偏松。
2. `calendar-390.png`：390 宽下 7 列周视图每列约 45px，会议 / 规划块只显示标题。是否改成窄屏默认“今天”视图，需要你判断。
3. `full-backup-preview-1440.png`：恢复预览对话框里“新增 / 冲突 / 缺失 / 相同”和新目录路径的写法是否好懂。
4. `home-unavailable-1440.png`：视觉脚本的服务没有注入助手，在 Linux 上显示“日历不可用：…只在 macOS 上可用”，这是如实状态。本机授权后首页会显示今天的规划块和 todo 列表，这个样子云端截不到。

## 七、未完成项与风险

- **EventKit 全部需本机验证**：`calendar-helper.swift` 在云端既不能编译也不能运行，语法与 API 用法都没有经过编译器检查。本机最小验证建议按路线 v3 5.2 走：
  - 先 `swift server/calendar-helper.swift status`；
  - 在页面点授权；
  - 拖出规划块 → 在“日历”应用里修改 → 工作台刷新；
  - 勾选 todo 或设提醒 → 手机收到提醒；
  - 修改冲突提示。
- **助手的运行方式有已知不确定性**：
  - 用 `/usr/bin/swift` 解释执行，每次调用要启动编译器，预计数秒，需要安装 Xcode 命令行工具；
  - 权限弹窗可能记在终端或父进程名下，而不是“工作台”；
  - 需要 macOS 14+。
  - 如果实测太慢或权限归属不对，改线方案是预编译成带 Info.plist 的小程序。这会改变安装方式，需要你决定。
- **修改冲突依赖 `lastModifiedDate`**：如果某些账户（如 Exchange）这个值为空，`expectedModified` 会是 null，冲突检测会退化为“两边都为空即视为未变”。需要本机观察。
- **规划块不支持关联项目 / 资产 / 夜间任务**（v1.1 §4.5 提到过），也没有项目里程碑数据源；本次只如实标注，没有实现。
- **完整备份的体积**：
  - `snapshots/` 保留每一次修订的快照，完整备份会随使用增长；
  - 恢复时上传走 JSON（base64），受 100 MB 请求上限约束，页面对超过 75 MB 的备份文件直接提示；
  - 导出不受这个限制，打包上限 1 GB。
- **打包期间的并发写入**：打包在主库写队列内进行，主库不会变；但配置日志、银饰图片等模块的写入不经过这个队列，理论上可能打进半个状态。这类文件都是先写临时文件再改名（临时文件已排除），风险低。
- **切换到恢复出的目录由你手动完成**，工作台不做自动切换。

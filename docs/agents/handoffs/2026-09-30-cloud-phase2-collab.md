# 云端交接 · 任务 F1 · 路线 v3 切片 2.3 + 2.4（提前开发）

- 分支：`cloud/2026-09-30-phase2-collab`（短名 phase2-collab）。
- 基点：`cloud/2026-09-30-phase2-projects @ 3e52b5f`（E2，基于 `main @ 99f87d4`，含 2.1 状态卡与 2.2 安全体检）。
- 性质：第二阶段**提前开发**，只推分支，不开 PR、不推 main；合入时机由本机决定。
- 本分支**没有改动** CURRENT.md、COLLABORATION.md、AGENTS.md、CLAUDE.md、package.json、package-lock.json、server/config-file.mjs、`docs/design/`。
- 依据：产品定义 v1.2 §4.2（协同三层）、§4.1（一键开工）、§4.3（角色卡的“当前在忙什么”）；路线 v3 2.3、2.4；COLLABORATION.md（模板 #1 的真实流程）；规则模板“项目协同协议”。

## 一、结论

| 项 | 结果 |
|---|---|
| 新单元测试 `tests/collab-board.test.mjs` | 首跑：模块不存在；放入空桩后 21/22 失败（唯一“通过”的一条是 schema 严格拒绝，只因基点 schema 拒绝任何 `collabLog` 字段）；实现后 22/22 通过 |
| 新浏览器测试 `tests/collab-board-browser.mjs` | 首跑：前端恢复为基点版本后，第 1 步等待“还没有在推进项目”超时失败；实现后 10 步全部通过 |
| `timeout 1200 npm test` | tests 475：pass 450、fail 19、cancelled 1、skipped 5（外层 timeout 在已知挂起处到点，exit=124）。失败名单与 E2 日志逐条 diff 为空：**新增 0、减少 0**；新增的 22 条全部通过 |
| 全部浏览器脚本（36 个，含新增 collab-board） | 31 通过、5 失败：agent-config、rule-templates、rule-templates-fix（配置写入保护）、interaction（位移 2.927 期望 3）、search（palette-cold 1039ms > 500ms）。5 个都在已知集内，**新增 0**；E2 那次通过的 interaction 本次失败，属于 §3.6 记录的时序波动；新增的 collab-board 10 步全部通过 |
| `node tests/visual.mjs phase2-collab` | `problems: []` |

## 二、改动与理由

### 2.3 协同看板 + 模板 #1

1. **协同页从规划页改为可用页**（`src/Collab.jsx`、`src/collab.css`，`src/App.jsx` 挂路由，`src/pages.js` 成熟度改为“部分可用”，`src/PlannedPage.jsx` 删掉协同的“现在可以怎么做”）。
   - 只列“在推进”项目；没有时显示“还没有在推进项目”和“去项目空间标记”，**不发看板请求**（与 2.1 的“没在推进就不读项目文件”一致，浏览器测试断言了请求数为 0）。
   - 每个项目一张看板：模板 #1 阶段条（认领 / 实现 / 复核 / 返修 / 验收，当前阶段 `aria-current="step"`）、“当前阶段”徽标、阶段依据、笔在谁手上、状态编号、唯一下一步、派发控件、操作留痕。
2. **阶段推断**（`server/collab-board.mjs` 的 `inferStage`）——确定性规则，不猜：
   - 依次看三个来源，第一个含关键词的决定阶段：**当前写入者**（值为“无”时跳过）→ **最新状态标题** → **最新交接的链接文字**。页面写明依据，例如“依据最新状态标题中的‘返修’”。
   - 关键词及优先级：验收 > 复核（复核/审查/评审/review）> 返修（返修/修复/rework/fix）> 实现（实现/开发/切片/implement）> 认领（认领/claim）。优先级的理由：本项目真实标题“Codex 2.3 返修复核认领”是复核，“Claude 2.3 返修认领”是返修。
   - 特例：“复核项修复”“复核意见”里的“复核”是返修的对象，先去掉再匹配，否则“1.3 复核项修复”会被判成复核。
   - 三处都没有关键词，或 CURRENT 缺失 / 无法解析 → **未知**，阶段条不高亮任何一步，并写明原因（如“项目里没有 CURRENT.md”）。
   - “最新状态标题”= 标题中 state_id 与表头 state_id 相同的那一节；没有则取编号（日期、序号）最大的一节，不按文件顺序。
3. **笔在谁手上**（`penHolder`）：取当前写入者里**最先出现**的 Codex / Claude / Hermes / 用户；“无 / 无人 / — / none”等为空闲；没有这一项为未知；其他写法原样显示。
4. **读取边界**：
   - 目录校验与 2.1 共用：把 `project-status.mjs` 里原有的校验抽成 `resolveProjectRoot`（行为不变，E2 的 19 条单元测试与浏览器测试照旧通过）。
   - 为了看到完整状态链，CURRENT 读取上限放宽为 **1 MiB**（`readCurrentFile` 加可选 `limit` 参数，默认仍是 64 KiB，2.1 状态卡不受影响）。原因：本项目 CURRENT 约 81 KB，最新一节（WB-20260930-104）在文件末尾，64 KiB 读不到。
   - 看板接口 `POST /api/collab/board` 只接受空对象；返回的是解析结果与标题，不返回 CURRENT 全文。
   - “先读”入口文件（AGENTS.md / CLAUDE.md / CURRENT / COLLABORATION.md）只用 `lstat` 判断是否为普通文件，不读内容；符号链接不算。

### 操作留痕 v1

1. **时间线三类来源**，按日期倒序，同一天内依次为工作台记录（按时间）、状态链（按编号）、交接文档（按修改时间）：
   - CURRENT 中**标题**带 state_id 的节（`parseStateHeadings`，只认 `#` 标题行，表格和正文里的编号不算；标题超 300 字截断；最多 500 节）；
   - `docs/agents/handoffs/*.md` 的**文件名与修改时间**（`readHandoffIndex`）：只 `readdir` + `lstat`，**不打开文件**；隐藏文件、非 .md、目录、符号链接都不列；交接目录路径上任何一级是符号链接就不读；最多 1000 份。测试在合成交接正文里放了 `BODY-MARKER`，断言接口结果与页面都不出现；
   - 工作台自己的复制记录（见下）。
2. **留痕存储**（主库顶层 `collabLog`，`server/collab-schema.mjs`）：
   - 严格 schema：`schema:1, id, kind(dispatch|start), projectId, projectName, agent(codex|claude-code|hermes), stateId?, stage?, promptSha256, at`，多一个字段即拒绝；上限 20000 条。
   - **不存口令正文**，只存 SHA-256，便于日后核对“复制的是哪一版口令”。
   - 旧库缺失按空；普通保存（`PUT /workspace`）不能增、删、改留痕；专用追加只能在末尾加、旧记录逐条不变（`validateHistory` 新增 `allowCollab`）。
   - 备份合并按 ID 并集，同 ID 内容不同整次拒绝（与使用记录同一语义）；从空库恢复保留留痕；导入预览多一行“新增协同留痕”（`src/StoragePanel.jsx`）。
   - `POST /api/collab/record`：时间与 schema、项目名由服务端生成；同 ID 重放不重复；项目必须已登记（否则 404）。**不要求 revision**：复制已在浏览器完成，此时因页面 revision 过期而拒记只会丢失事实；追加只改 `collabLog`，其余数据由 `validateHistory` 保证不变。

### 2.4 一键派发 / 一键开工

1. **口令生成**（`src/collab.js`，纯函数，单元测试直接覆盖）：
   - 派发口令七项：项目路径、先读哪些文件（实际存在的入口文件 + 最新交接路径）、输入状态（state_id、当前写入者、流程阶段及依据、模板建议的下一阶段）、唯一下一步、验收标准（通用四条 + 按下一阶段的一条）、禁止事项、要回交的证据。
   - “建议下一阶段”只是模板建议，口令里写明“由用户确认，工作台不替你决定”（N6）。
   - CURRENT 读不到时如实写“输入状态：未知 / 唯一下一步：未知”，不编造。
   - 开工口令：项目路径、先读 AGENTS.md 与 CURRENT.md、输入状态（有则写）、唯一下一步、开工规则。
2. **不含敏感信息**：
   - 口令只由白名单字段拼成（项目名、登记路径、入口文件名、状态表四项、阶段）；测试把主库资产、会话、令牌塞进输入对象，断言都不出现。
   - 字段里出现疑似凭据（`sk-`、`ghp_`、`github_pat_`、`-----BEGIN`、`password=`、`token:`、`密码：` 等）时**整段替换**为“（含疑似凭据，已省略；请到项目原文查看）”，不尝试只抹一部分。
   - 项目路径只来自服务端校验过的登记目录，并再校验为绝对路径、无控制字符、无 `.` / `..` 段。
   - 浏览器测试另外断言口令不含本机会话令牌。
3. **交互**：选 Agent（Codex / Claude Code / Hermes）→“生成派发口令”/“生成开工口令”→ 弹窗预览（只读，复制的就是看到的）→“确认并复制”。
   - 复制成功才写留痕；剪贴板拒绝时提示“口令没有进入剪贴板，也没有计入留痕”，不写。
   - 复制成功但留痕写入失败时，保留同一 ID，弹窗出现“补记留痕”，不需要再复制（服务端按 ID 去重）。
   - **不自动执行、不打开 Agent、不代替用户发送。**
   - 一键开工放在项目空间“在推进”状态卡底部（`src/ProjectStatus.jsx` 的 `StartWork`）；没有本地目录或目录校验失败时按钮禁用。

### 已有测试的一处按需求修改

- `tests/digital-world-ui.test.mjs`：原断言“协同页是规划页（planned）”。本任务要求把协同页改为可用，这条断言按需求改为“协同页成熟度为 partial”，其余四个规划页（health、calendar、aihot、learning、silver）的原断言不变。改前运行失败的原文：`AssertionError: collab … actual: 'partial', expected: 'planned'`。

### 新测试自身的一处更正（在它第一次通过之前）

- 浏览器测试原写 `assert.doesNotMatch(preview, /BODY-MARKER|token|x-workbench/i)`，会命中口令“禁止事项”里的规则文字“Token”。本意是“口令不含本机会话令牌”，改为取 `/api/session` 的真实令牌值断言不在口令里，另两项保留。记录在日志 02 末尾。

## 三、改动文件前后 SHA256

| 文件 | 基点 3e52b5f | 本分支 |
|---|---|---|
| server/http.mjs | 43d49c3665d0516078a856b1d1ffb63a1ac13eb9abe82761dfaccd597ca459f1 | dcb434a550e7860a36239ed2706551ca15bb856deebfb9e3a9929982dc0bab82 |
| server/merge.mjs | eac7e38c2921ec2083e2f15e5a88924228fee4ced01bdc85fa7851b1aaa3210e | b6b00bce8ce8022818e0595919520319131dfba1e0e34c194226d87859f3773b |
| server/project-status.mjs | 172252bfa3f095e1cc52d55c5ab8ab1b768e474ce3b1e32c631113e8b4992502 | 2e86b3d23e2714285d1c136dfbbb02916a3f40f05b39d60495090c8555931c5e |
| server/repository.mjs | dc8051acce21f91c76b791784039fed89bbb0f0798a71529260619109c324039 | b641604a42fb1fbcf8fd2792ec1c41a8bdfbfaa3083f42ff55d1c7da6d13856d |
| server/schema.mjs | 3a108c3cc2ec63e5bfc0d628554c965add74be04f0816b8b084d42b49957705b | ed8619e253e07b04faa18e2626b10dc19411aa2204f2db9eebc971050424bdc7 |
| src/App.jsx | 5ff543d0ba143b77fd3aaa56fe4106fb17b4e5cc2238ea8f1105f05ffc80ce94 | be887b75537a64cad0776a50f633c451c56d83cd8c50e98b8b3ddc200a5869e2 |
| src/PlannedPage.jsx | dd0580408c49e6ec5ce7d165c82a6623f22e643c7e5ec1361767b7bd43d89df2 | f983f0f5c51775c695980fb9deea28af1eb3004d3616ae6289996433911ec405 |
| src/ProjectStatus.jsx | 39e03e17e844577810be7938e3e6479e9e438b1b14f40a8f450958a41d13712e | 67b9a43633f13ed1f91b844a24efc7470627a00e60a84830b2ca0981b1728534 |
| src/StoragePanel.jsx | ee18f2c673ed577ae5d817de983939a99d22f3494cd1d5288f7745774236a272 | 1e4d775e631f2797ebd2a0dc09bdbd770f17fa731c0db0cbfe04a8edbda5a895 |
| src/pages.js | 17d38b02de4ab318b8373855d44ff7a28c78832e52d2fc573703054a81611bda | 817f1932cc668abf9492128160eeb4b3d180759cee5a1dcd33660fec5cf6a3ef |
| tests/digital-world-ui.test.mjs | 3009a9ecbce03be8f3a97b5819a06d4d856ad5240f258e988efe1a2bd763bd6b | 776abd22a5519a59b68f82a105c74a94b0f0356c95671ffa7b63c2e315c85271 |
| server/collab-board.mjs（新增） | — | 912f04663d59e599cf4a6066411213584ad87c76a2e5d5137250ab010eeef40b |
| server/collab-schema.mjs（新增） | — | e825890f8a65efc7185105d69e78869b01089d585870297d402ecc0aeabfb664 |
| src/collab.js（新增） | — | 079ac9f3b52e70f6d9fd674d32831a0bf8a96bb40c694dfc11276c496e00c2da |
| src/Collab.jsx（新增） | — | ba3314d5e6010b47e45fa7dac01ae7dd73b122ec14756838cbc7958e55c6082d |
| src/collab.css（新增） | — | d91a86e4832f52cadaa7acb4d0f053d445203e77f018b55185fdbea70b9efe89 |
| tests/collab-board.test.mjs（新增） | — | 7199a5dc5792cf3ac336f791e763d531c895d089f4ea4d16d7c5a275881bf893 |
| tests/collab-board-fixture.mjs（新增） | — | 2b77ae5939134b71404cb7aa77a991a86a6c43b7315df984b6fab15197dbf145 |
| tests/collab-board-browser.mjs（新增） | — | 9bca243da4bc3e6bb21f26906b46282fe12d55e506393756f79eb9ef5e6d0582 |

说明：基点列与 E2 交接里记录的“本分支”指纹一致（http、schema、project-status、App、ProjectStatus、pending 等），可据此确认基点无漂移。

## 四、失败测试首跑摘要

- `01-new-test-before.txt`：
  - 第 1 次：`ERR_MODULE_NOT_FOUND`（`server/collab-board.mjs` 不存在）。
  - 第 2 次：放入只抛“未实现”的空桩后，22 条中 21 条失败；“字段严格”一条在基点上就能通过，因为基点 schema 拒绝任何 `collabLog`，不代表实现。
- `02-browser-test-before.txt`：服务端已实现、前端恢复为基点版本后构建，第 1 步等待“还没有在推进项目”超时。
- 覆盖面：阶段推断（写入者优先、写入者为“无”、标题、交接、复核项修复、英文关键词、四种未知）；笔在谁手上（四类 Agent、六种空闲写法、其他人、缺失）；状态链解析与最新一节选择；超过 64 KiB 的 CURRENT 仍能读到末尾新节；超过 1 MiB 截断；符号链接；交接目录只列 .md、不读正文、不跟随符号链接；派发与开工口令字段完整、未知不编造、白名单与凭据替换、路径校验；时间线排序；留痕 schema、只增不改、备份合并；HTTP 看板只读（主库 revision 与项目文件逐字节不变）、拒绝路径参数；留痕接口去重、冲突、字段严格、404、普通保存不能删。

## 五、验证命令与首次结果

全部在 Node 24 下运行，日志在 `docs/agents/handoffs/cloud-phase2-collab-logs/`。

| 命令 | 日志 | 首次结果 | 相对已知失败集 |
|---|---|---|---|
| `node --test tests/collab-board.test.mjs`（实现前） | 01 | 模块不存在；空桩 21/22 失败 | —（预期的首跑失败） |
| `node tests/collab-board-browser.mjs`（前端为基点） | 02 | 第 1 步超时失败 | —（预期的首跑失败） |
| `node --test tests/collab-board.test.mjs`（实现后） | — | 22/22 通过 | — |
| `node --test tests/digital-world-ui.test.mjs`（改断言前） | — | 1 条失败（见第二节） | 按需求修改后 9/9 |
| `npm run build` | — | 通过 | — |
| 只读解析本副本自己的 CURRENT.md 与交接目录 | 04 | 见第七节第 1 条 | — |
| `timeout 1200 npm test` | 03 | 475 / pass 450 / fail 19 / cancelled 1 / skipped 5 | 失败名单与 E2 日志逐条 diff 为空：**新增 0、减少 0** |
| 全部浏览器脚本（每个外加 `timeout 600`，只防挂起） | 05 | 36 个：31 通过、5 失败 | 5 个失败均在已知集（3 个配置写入保护 + 2 个时序类），**新增 0**；collab-board 通过 |
| `node tests/visual.mjs phase2-collab` | 06 | `problems: []` | — |

## 六、需要真人确认的视觉点

截图在 `cloud-phase2-collab-shots/`，共 4 张：

1. `1-board-1440.png`：看板（阶段条、依据、持笔者、派发控件、留痕时间线）。
2. `2-dispatch-dialog.png`：派发口令预览弹窗。
3. `3-board-390.png`：390 宽的协同页整页（另用临时脚本截取；测试脚本里的元素截图在窄屏会把固定顶栏拼进画面，不是版式问题）。
4. `4-start-work.png`：项目空间状态卡底部的一键开工（临时脚本截取，脚本已删除，未入库）。

请确认：

- 当前阶段用橙色实底块标出、已经过的阶段只加深文字，这个强度是否合适；返修会回到复核，“已经过”只是位置含义，不代表完成。
- 时间线默认只显示 8 条、其余“展开全部”，是否合适。
- 口令弹窗里用等宽字体整段预览是否好读。

## 七、未完成项、风险与待确认

1. **本项目的看板与 CURRENT 状态链一致（路线 2.3 验收）只在云端副本上只读验证过**（日志 04）：
   - 43 个带 state_id 的节标题与 `grep` 计数一致，最新一节为 WB-20260930-104，与表头一致；50 份交接 .md 与 `ls` 一致。
   - 推断结果：阶段“认领”（依据当前写入者“Claude（认领104…）”），笔在 Claude 手上。
   - 43 节中 7 节推断为“未知”（如“UI v12”“Claude 更正”“2.3 规则模板 + 托管区块写入”），“实现”一次也没出现，因为本项目的实现类标题不写“实现”二字。时间线照样列出这些节，只是阶段标签为未知。是否要让协同协议模板约定标题写法（如“认领 N / 实现 / 复核 / 返修 / 验收”），请用户决定。
   - 真实应用目录上的验收要在本机做。
2. **路线 2.4 的最小验证没有做**：“在本项目用一键派发完成一次真实的 Claude→Codex 交接，读回状态一致，你不需要补充解释”需要用户本人在本机操作，云端无法代替。口令是否需要手动补充，是承重假设 1 的判断依据。
3. **“打开目标 Agent”没有做**：任务明确“不自动执行、不代替用户发送”，本分支只复制。产品定义 §4.1/§4.2 写的“复制并打开这个 Agent”留给后续按用户意见决定。
4. **§4.3 角色卡的“当前在忙什么”没有做**：看板上已有“笔在谁手上”，智能体群页的角色卡属于路线 4.3。
5. **留痕接口不要求 revision**（理由见第二节），与其他写入接口不同，请复核方确认这个取舍。
6. **一键开工也计入留痕**（kind `start`）：任务只要求派发计入；开工同属“把口令交给某个 Agent”的事实，一并记录。如不需要可以去掉。
7. **CURRENT 读取上限放宽到 1 MiB 只用于看板**；状态卡仍按 64 KiB。超过 1 MiB 时页面注明“只读取了开头的标题”。
8. 云端 Linux / root 环境与本机不同（见 CLOUD-SESSIONS §3.6）；本机合入前需要在 macOS 上重跑相称回归，并用 5178 实际服务确认页面。

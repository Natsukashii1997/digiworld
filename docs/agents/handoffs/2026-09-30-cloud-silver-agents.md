# 云端交接 · F4：路线 v3 5.5 银饰计划 + 4.3 智能体角色卡（提前开发）

- 执行：Claude Code 云端会话（云端副本，非权威）。未改 CURRENT.md / COLLABORATION.md / AGENTS.md / CLAUDE.md，不写交接编号。
- 基点：`main @ bc8e343`；分支 `cloud/2026-09-30-silver-agents`（短名 silver-agents），已推送；未开 PR、未推 main。合入时机由本机决定。
- 环境：Linux / root，Node v24.21.0（/opt/nvm），`PLAYWRIGHT_MODULE=playwright`，chromium-1234。
- 依据：产品定义 v1.2 §4.8（银饰）、§4.3（角色卡）；路线 v3 5.5、4.3；基线 v2.2 D36、D28、D26。
- 未改：`server/config-file.mjs`、`package.json`、`package-lock.json`、`docs/design/`、`src/styles.css`。没有接入任何收费模型或外部服务，没有读取凭据。

## 一、改动与理由

| # | 改动 | 理由 / 说明 |
|---|---|---|
| 1 | `server/silver-schema.mjs`（新）：`validateSilver`、`validateAgentRoles`。`silver = {wall, categories, items}`，三个数组，多余字段一律拒绝。欣赏图 `id,image,author,source,sourceUrl?,note,createdAt,updatedAt?,deletedAt?`；品类 `id,name,target(1–999 整数),createdAt,…`；已填格 `id,categoryId,image,silhouette?,silhouetteSource?("auto"/"manual"),name,boughtAt?(YYYY-MM-DD),price?(0–1e8，最多两位小数),note?,…`。已填格的 `categoryId` 必须指向存在的品类；剪影必须是 `.png`。上限：欣赏图 2000、品类 50、已填格 5000。`agentRoles` 只接受 codex / claude-code / hermes / openclaw / doubao 五个 Agent，字段 `agentId,strengths,cost(low/medium/high/unknown),projects,note,updatedAt`。 | D36、D28。两个都是可选顶层集合：旧库缺失按空处理，不写迁移。放在单独文件，`schema.mjs` 只多 6 行，减少与其他分支的合并面。 |
| 2 | 图片文件引用做路径校验：只接受 `^[a-f0-9]{64}\.(jpg\|png\|webp)$`（内容 sha256 + 扩展名）。`/`、`..`、大写、绝对路径、其他扩展名都进不来。 | 任务要求的“路径校验”。主库只存文件名，不存路径。 |
| 3 | `server/merge.mjs`：`mergeSilver` 与角色卡合并。只做加法：缺失的欣赏图、品类、已填格追加，已有记录保留当前库的编辑；同一已填格在两边属于不同品类时返回 409，整次不导入。角色卡：当前库已有的卡保留当前编辑，只补上备份独有的卡。摘要新增 `silverAdded:{wall,categories,items}`、`agentRolesAdded`。 | 与 notes/scrolls 的合并语义一致（只加不改、冲突整体拒绝）。 |
| 4 | `server/silver.mjs`（新）：图片存数据目录 `silver/`（0700），文件名按内容寻址，同一张图去重；先写临时文件再改名。**类型按文件头识别**（不信任扩展名或 MIME），单张上限 8 MB（413）；剪影只收 PNG。读取拒绝符号链接；文件名与实际内容类型不符时拒绝。 | “图片存数据目录，只在本机”。 |
| 5 | `server/silver-cutout.mjs`（新）+ `server/silver-cutout.jxa.js`（新）：可替换的“抠图器”接口 `createCutout({platform, run, timeoutMs})`，提供 `available()` 和 `cutout(input, output)`。非 macOS 直接返回“不可用”，不调用任何命令；macOS 上用 `/usr/bin/osascript -l JavaScript` 运行 JXA 脚本，调用 `VNGenerateForegroundInstanceMaskRequest` 生成透明背景 PNG。出错、超时（60 秒）、没有识别到主体（`NO_SUBJECT`）、没有产出、产出不是 PNG，都返回“不可用”并附原因。`startServer` 的 `discovery.silverCutout` 可以注入别的实现。 | 选 JXA 而不是 Swift 命令行：不需要编译，也不依赖 Xcode 工具链。**Vision 部分云端无法运行，需本机验证**（见 §五）。 |
| 6 | `server/http.mjs`：`POST /api/silver/images`（上传）、`GET /api/silver/images/<文件名>`（读取）、`POST /api/silver/cutout`、`GET /api/silver/status`。全部走既有的会话令牌、同源与 JSON 门禁。 | 图片不放到静态路径：`<img>` 带不了令牌，前端读到字节后转成 blob URL 再显示。 |
| 7 | `src/silver.js`（新）、`src/Silver.jsx`（新）：银饰计划页。① 欣赏墙：上传图片 + 作者、来源、来源链接（可选）、备注；网格展示；删除进回收区。② 收藏格：添加品类与目标数量，目标可 +1/−1，可删除品类（进回收区）；空格点击“填入”，填写实物图、名称、购入时间、价格（可选）、备注。**保存前先试自动抠图，记录和剪影一次写入主库**。抠图不可用时提示原因，格子显示原图并标“无剪影”；详情里可以“手动上传剪影 PNG”，macOS 可用时还可以“重新自动抠图”。③ 已填格默认显示**白色描边剪影**：前端 canvas 按 PNG 的透明通道，在主体外侧画 3px 白边，主体内部留空。④ 回收区（折叠）：恢复欣赏图、品类、已填格。 | D36。已填格随所属品类一起进出回收区，不单独列出。目标调低到少于已填数时，已填格照常显示，不丢记录。 |
| 8 | `src/pages.js`：银饰计划 `maturity` 由 planned 改为 ready，移除 `plan`，改写 lead；`src/App.jsx` 路由到 `Silver`；`src/Home.jsx` 能力地图显示“N 张欣赏图 · 已填 X/Y 格”。 | 任务要求“改为可用”。 |
| 9 | `src/agent-roles.js`（新）、`src/AgentRoles.jsx`（新），接入 `src/DiscoveryPages.jsx` 的智能体群页（放在“能力体检”之前）：5 张角色卡（主力 Codex、Claude Code、Hermes；附属 OpenClaw、豆包工作），显示擅长（标签）、成本、常驻项目、备注，可编辑，存主库。未编辑的卡使用**草拟默认值**，并标“草拟默认，未经你确认”。 | D28、D26。“当前在忙什么”需要项目状态卡，这里没有做。 |
| 10 | 常驻项目推断：只看主库已登记项目 `projects[].next`（交接/下一步字段）里是否点名该 Agent（别名不区分大小写），排除“已完成”的项目；推断不出就显示“—”。推断结果标“（推断）”；用户编辑并保存后，以用户填写的为准。 | 主库里没有存交接文档正文，这是在不读项目文件的前提下能做到的“可推断的”部分。 |
| 11 | 派活推荐：输入任务描述，按角色卡的擅长关键词做子串匹配（英文不区分大小写），按命中数排序，同分时成本低的在前，再按卡片顺序；最多推荐 2 个，写明“命中擅长：…；成本…”；没有命中时如实说明。**纯前端计算，不发任何请求，不指派、不执行**。 | D28“只推荐，用户拍板”。“使用反馈修正权重”这次没有做。 |
| 12 | 角色卡编辑按钮的可访问名是“编辑角色卡”，Agent 名通过 `aria-describedby` 指向卡片标题读出。 | 第一版叫“编辑 Codex 角色卡”，与既有浏览器测试在整页用 `/Codex/`、`/Hermes/` 找发现卡片撞名（agent-inventory、agent-targets、agent-config 三个脚本都因此失败）。按“不改既有测试”的原则改的是界面，见 §四。 |
| 13 | 既有测试的两处必要调整：`tests/digital-world-ui.test.mjs` 的“规划中页面”列表去掉 `silver`；`tests/nav-zones-browser.mjs` 的 `LIFE_PLANNED` 去掉银饰计划，axe 标签随之改为 `learning`。 | 这两处断言“银饰计划是规划中页面、没有可点击按钮”，与本任务“改为可用”直接矛盾。属于需求变更带来的断言更新，不是放宽；nav-zones 其余断言（导航结构、390 宽 #silver 无横溢、抽屉跳转到银饰计划）保持不变。**请本机复核这一点**。 |

## 二、改动文件及 SHA256

| 文件 | 改动前（bc8e343） | 改动后 |
|---|---|---|
| server/http.mjs | 04f8df4aa4d36f382ec76d7359dae69c505220715a3a13f65fd6535f29c6ab52 | 2fc3f7cbfa282b2aaafd3af2d9ab9a0da7b22c0eb895c3cf81bd66de2e3fba73 |
| server/merge.mjs | eac7e38c2921ec2083e2f15e5a88924228fee4ced01bdc85fa7851b1aaa3210e | c04314c782ee758f0d0f6bb56297d8676cddf03a00e5ab0ee3ea85fa1afd4bd5 |
| server/schema.mjs | 5a426e68d5cc28a6c7bc45a145cb622de9949816f5912f1101394bbe108d08c7 | ad10e4d76465d2bce8b5be9fa78dc60ef146bd74c3f70777985120fec70223c1 |
| server/silver-cutout.jxa.js（新增） | — | 7424904c4a15013d5460b4c788cc9056ad9384cc8a3fb4788b9af49c72b33661 |
| server/silver-cutout.mjs（新增） | — | dcf1a472db224926e2cd1b5cf7b3724ae1f4ba662254a139083be02fb0457f9d |
| server/silver-schema.mjs（新增） | — | b1250547a776b9f0104b8be6269ec16e3647c4b31bca1c5bd0beacee2f990f96 |
| server/silver.mjs（新增） | — | a118ef64c400cfb3f7b49c9c355f5a2ef37e5b7aecfe680d0d2c8620b2e827e3 |
| src/AgentRoles.jsx（新增） | — | b71e85d9bf2697d4f8706045c28f0483bb7aa2b945dbab98b03d8b5afda9c334 |
| src/App.jsx | 965e86ca0fea9a15c30677a7d88f88971a3fbbf207143c8c28c8c55b78111921 | a0f16b7d487f11860b4a9efc9a2f40ffcfefa991192dcac3f146c4e5018af485 |
| src/DiscoveryPages.jsx | 85c5052f865333c4b04369e230963a1cbc6f17e2c3d5d02447ec3ac115cb4bf5 | d53d52a5ecdc9d5843d2a54794a16cccdd0b034fe75d9bf99e3621e0bbe0951e |
| src/Home.jsx | a2b4ed81b51ba02c0bbc7ef7673ca186fbb926fe86b8d737e7e17d94a686728a | 05adb10e4b92019014dc264bc29d1fc9d99d2affd78ca7d3cab79a46fc894fdb |
| src/Silver.jsx（新增） | — | 18e956d3b0bd2f7c4b199a8282969f4d483b8b8c6a30298f7f3f225af5429002 |
| src/agent-roles.js（新增） | — | e2fcefcd5303e9a0fee81f6d5046a0b2cd3aef39f13c81b8d511d9aba404f8de |
| src/pages.js | 96eb863dc1a2a124d05a445aa25914384fb3740aa62f7ddc3d418fd2b34622ce | 5d68514d167a66c243994387a87b6511fa46d6036df7cb45a2e83cd162907090 |
| src/silver-agents.css（新增） | — | c17213cc1b5b81479c0936eba00067ea4bd68e97ee0a0b9e39130014505f6fd8 |
| src/silver.js（新增） | — | 6081ea0fb9d18ef18a6a6895d1373fcebe1386b0baaa178d9c9a0efcb245cc75 |
| tests/digital-world-ui.test.mjs | e064c9782a72faaeff4523e98030b06dc0b1d4606e678d11c2a2baa8ff9c141e | 9214abd75de83ebd95d556b88de58f6536d8b845de7207b5da7b9f219ce493a9 |
| tests/nav-zones-browser.mjs | 77aa2e026ecd9318abf655f94f4000c095462b413c8c12b4c324038abc86ade2 | a3b0899bd39241d779f758fd823327ab047f0b5e2e7dbaaf7ec15c683ece2527 |
| tests/silver-agents-browser.mjs（新增） | — | 473f8d19f7954f233b46c04511be306197ed23937578eb00a28b6c392329ea2f |
| tests/silver-agents.test.mjs（新增） | — | 794c981b565f683c6863e03805e7c03f368ac4e736d2664158f989e4ce56b745 |

## 三、失败测试首跑（改代码前）

- `node --test tests/silver-agents.test.mjs`（`cloud-silver-agents-logs/01-unit-test-before.txt`）：exit 1，`ERR_MODULE_NOT_FOUND: server/silver-schema.mjs`，整个文件记为 1 个失败（tests 1 / fail 1）。
- `node tests/silver-agents-browser.mjs`（`02-silver-agents-browser-before.txt`）：exit 1，打开 `#silver` 后等待 `.page-heading` 10 秒超时。当时没有继续定位这个具体原因；实现后同一脚本全部通过。

在实现过程中，对本次**新写、尚未通过**的测试做过两处调整，都没有放宽断言：
1. HTTP 用例原先没有初始化主库，导致 `/api/backup` 的 `state` 为 null。改为启动后先写入 `seed()`，断言不变（备份里没有 silver，也没有图片文件名）。
2. 角色卡编辑按钮改名（见 §一 #12）后，新测试改为在 Hermes 卡片内找“编辑角色卡”，同时新增两条断言：`aria-describedby` 指向 Hermes 标题；整页没有名字里带 Agent 名的“编辑角色卡”按钮。

实现中暴露的一处真实缺陷，已经修复：添加品类后清空表单的动作发生在保存返回之后，保存期间已经输入的下一个品类会被清掉。现在只清掉刚提交的那一条。

## 四、验证命令与首次结果

| 命令 | 首次结果 | 对照云端已知失败集（CLOUD-SESSIONS §3.6） |
|---|---|---|
| `npm run build`（`05-build.txt`） | 通过（仍有原有的 chunk 大于 500 kB 提示） | — |
| `node --test tests/silver-agents.test.mjs`（`03-unit-test-after.txt`） | 18/18 pass | 新增 |
| `node tests/silver-agents-browser.mjs` | 15 项 PASS，exit 0 | 新增 |
| `timeout 1200 npm test`（`04-npm-test.txt`，在提交 `058cb34` 上） | tests 453 / pass 428 / **fail 19** / cancelled 1 / skipped 5；`rule-templates.test.mjs` 照旧挂到外层超时，exit=124 | 失败清单去掉耗时后，与 `cloud-scrolls-in-assets-logs/12-npm-test.txt` 逐条 diff **完全相同**：**增 0、减 0**。tests 435→453、pass 410→428，+18 为新增用例 |
| 浏览器脚本第一轮（`06a-browser-scripts-first-run-stopped.txt`） | 跑到第 10 个脚本时手动停止：agent-inventory、agent-targets 失败（**不在已知集**），agent-config 的失败原因也变成了同一个撞名（`getByRole('button',{name:/Codex/})` 命中 2 个元素） | 根因是 §一 #12 的按钮命名。改界面后重建，这 3 个脚本和新脚本单独复跑：agent-inventory、agent-targets、silver-agents 通过 |
| 浏览器脚本全量，最终代码（`07-browser-scripts.txt`，在 `6aeb579` 上；4 个基础脚本 + 31 个 `*-browser.mjs`，每个外加 `timeout 600` 只防挂起） | **30/35** 通过；失败 5 个：agent-config（配置回读不一致，即平台写入保护）、rule-templates、rule-templates-fix、interaction（`matrix(…)` 期望位移 3）、search（`palette-cold 837ms > 500ms`） | 5 个全部在已知集内，原因与已知描述一致：**新增 0、减少 0** |
| `node --test tests/digital-world-ui.test.mjs tests/silver-agents.test.mjs`（`08-unit-after-fix.txt`，在 `6aeb579` 上） | 28/28 pass | 补跑：`npm test` 是在按钮改名之前跑的 |
| `node tests/visual.mjs silver-agents`（`09-visual.txt`） | `problems: []` | — |

新测试覆盖：
- 单元测试（18 条）：旧库缺少 silver/agentRoles 按空处理；合法记录通过；26 类非法欣赏图、品类、已填格被拒（多余字段、`../`、`.gif`、大写、绝对路径、`javascript:` 链接、超长、控制字符、重复 ID、目标 0/1000/2.5、单行字段含换行、品类不存在、剪影不是 PNG、剪影来源非法、价格为负/三位小数/字符串、购入时间非法、名称为空、品类超量）；角色卡的 Agent 白名单与字段校验；合并只做加法、保留当前编辑、跨品类冲突返回 409、旧备份没有银饰也能合并；写入后回读一致；图片文件头识别、内容寻址去重、类型/8 MB/剪影格式/路径穿越/符号链接拒绝；抠图器在非 macOS 上不调用命令、在 macOS 上成功/出错/超时/没有产出/产出不是 PNG/没有识别到主体（全部用桩）；Vision 脚本存在，并调用了主体抠图请求；抠图成功后另存为新的 PNG；HTTP 门禁，图片不进备份；收藏格格子计算；角色卡默认值与编辑覆盖；推荐匹配（排序、同分按成本、大小写、无命中、最多 2 个）；常驻项目推断。
- 浏览器测试（15 项，图片都是用 canvas 现场合成的小图）：欣赏墙上传 jpg 并入库、伪装成图片的文件和超过 8 MB 的文件被拒、删除与恢复；品类添加、目标增减；填格时实物图、名称、购入时间、价格入库；本平台自动抠图不可用时如实提示并显示“无剪影”；手动上传剪影时非 PNG 被拒、透明 PNG 画出白色描边（按像素核对白色和透明像素）；刷新后数据一致；品类和已填格进出回收区；角色卡主力 3 个、附属 2 个，常驻项目推断，草拟标注；编辑 Hermes 后入库，刷新后保持；推荐 1–2 个并写理由，无命中时如实说明，全程 0 个 `/api/` 请求；44px；1440 与 390 两个宽度的 axe；390 宽下 #silver、收藏详情、#agents 都没有横向溢出。

截图（`cloud-silver-agents-shots/`，共 3 张）：`silver-1440.png`（全页）、`silver-390.png`（全页）、`agent-roles-1440.png`（角色卡与推荐区）。说明：1440 全页截图里顶栏出现在页面中部，这是 fullPage 截图遇到 sticky 顶栏的现象，不是布局错误。

## 五、需要本机 / 真人确认

1. **Vision 抠图（必须在本机 macOS 14+ 实测）**：`server/silver-cutout.jxa.js` 在云端无法运行，JXA 对 `CVPixelBuffer` 的桥接、`NSBitmapImageRep initWithCIImage` 生成的 PNG 是否保留透明通道，都没有验证过。建议实测：在银饰计划里填一格上传实物图 → 看是否提示“已自动生成剪影”，格子是否显示白色描边。如果失败，界面会回退到“无剪影 + 手动上传”，不会影响数据。也可以直接运行 `osascript -l JavaScript server/silver-cutout.jxa.js 输入.jpg 输出.png` 看输出。
2. 白色描边剪影的样式：外侧 3px 白边、主体内部留空、黑色格底。这个是否就是你说的“白色描边剪影”，还是想要“白边 + 实物彩色抠图”（贴纸式）？改起来很小（`Outline` 组件里保留主体像素即可）。
3. 空格的样式（虚线框、加号、复用既有角框）与已填格的对比。
4. 角色卡的**草拟默认值**（擅长关键词、成本）是云端推测的，未经你确认，请逐张改成你的实际判断。其中 Hermes、OpenClaw 的成本填的是“未知”。
5. 智能体群页上，角色卡区放在“能力体检”之前、发现卡片之后，是否合适。
6. 页头的成熟度已经是“可用”，但 Vision 部分还没验证。是否在本机实测之前先标成“部分可用”，请你决定。
7. §一 #13 对两个既有测试的调整。

## 六、未完成项与风险

- **图片不进备份**：备份只包含主库，`silver/` 目录下的图片不会跟着走。在另一台电脑导入备份后，格子会显示“图片缺失”。如果需要可迁移，要另外设计图片打包（体积可能很大）。
- **孤儿图片不会被清理**：上传后保存失败、替换剪影、删除记录，都不会删除 `silver/` 里的文件（删除是进回收区，可以恢复）。目前没有“清空回收区 / 清理未引用图片”的功能。
- 回收区只能恢复，不能永久删除（与焚决一致）。
- 角色卡还没有做“当前在忙什么”（需要项目状态卡）和“实际反馈修正推荐权重”（D28）；推荐只是关键词子串匹配，短关键词可能误中（例如“UI”会命中“GUI”）。
- 常驻项目推断只读主库 `projects[].next`，不读项目目录里的 CURRENT 或交接文档；已完成的项目不算常驻。
- 智能体群页多了一组“编辑角色卡”按钮。已有测试是按 Agent 名在整页找按钮的，今后如果按钮名里带 Agent 名，还会撞上；这次已在 §一 #12 规避。
- 全局搜索还没有接入欣赏墙和收藏格。
- 豆包工作还不在 `server/discovery.mjs` 的检测清单里，这次只为它建了角色卡，没有检测。
- 云端结果不能代替本机回归。合入前请在本机重跑 `npm test` 和全部浏览器脚本，并核对上表的改动前指纹。`server/http.mjs`、`server/schema.mjs`、`server/merge.mjs`、`src/App.jsx`、`src/pages.js`、`src/DiscoveryPages.jsx` 都是共享面，如果本机在派出后改过这些文件，需要先对齐再合入。

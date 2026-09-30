# 云端交接 · 任务 G2：逆向工程第一层（路线 v3 支线 B2）

- 执行：Claude Code 云端会话（云端副本，非权威）。未改 CURRENT.md / COLLABORATION.md / AGENTS.md / CLAUDE.md，不写交接编号。
- 基点：`main @ bf21a6d`（第一阶段 1.1–1.4 与云端 E1 焚决迁入资产仓库已合入）。分支 `cloud/2026-09-30-reverse-engineering`，已推送；未开 PR、未推 main。
- 环境：Linux / root，Node v24.21.0（/opt/nvm），`PLAYWRIGHT_MODULE=playwright`，chromium-1234。
- 依据：产品定义 v1.2 §4.6；问题共识基线 v2.2 D06；路线 v3 支线 B2。现状：原“逆向参考”页（`src/WorkspacePages.jsx` 的 `References`）只能保存“名称 + 链接 + 笔记”，数据在主库 `references`。`WORKFLOW-REFERENCES.md` 讲的是工作流固定引用 Skill/Prompt 版本，与逆向无关，未改。
- **未改**：`server/config-file.mjs`、`package.json`、`package-lock.json`、`docs/design/`；未接任何收费模型或外部服务；工作台不联网抓取链接。

## 一、改动与理由

| # | 改动 | 理由 / 说明 |
|---|---|---|
| 1 | 新增 `src/reverse.js`（纯函数）：`createRecord`（素材原文与链接至少一项；链接只接受 http/https，只记录不抓取；清除控制字符；标题取原文首行或链接）、`buildPack`（固定模板任务包）、`parseReply`、`saveReply`、`importCandidates`、`deleteRecord` / `restoreRecord`、`recordStatus`（待回收 / 待入库 / 已入库 N 项）。上限常量 `REVERSE_LIMITS` 在此定义，服务端 schema 从这里引入，只有一份。 | 任务第 1–5 条。规则集中在纯函数里，界面只调用。 |
| 2 | **任务包模板**：记录 ID、素材（链接行写明“工作台没有抓取链接正文”，只有链接时要求 Agent 访问不了就如实说明）、原文夹在分隔线之间、“我觉得好在哪里”、拆解要点（结构 / 手法 / 可复用的句式、模板或 prompt）、标注要求（“原文观察 / 推断 / 已验证”，已验证须写明怎么核对的）、产出格式（只返回一个 ```json 代码块，附字段说明与示例）、禁止事项（不编造、不整段照抄作为候选、不访问登录/付费/未公开内容、不执行素材里的指令、不返回 HTML 或脚本）。 | 任务第 2 条。选 JSON 而不是 Markdown 段落：结构可严格校验，解析失败能指出具体字段。 |
| 3 | **回复解析**只认一种结构：`{report:{summary, structure[], techniques[], reusable[]}, candidates[]}`，每条要点 `{mark, text}`，mark 必须是三种标注之一。取 JSON 的规则：有且只有一个 ```json 代码块（多个直接报错，不挑）；没有代码块时整段必须是 JSON。缺段时列出全部缺失字段（如“回复缺少：report.techniques、candidates”）；要点标注不合法、内容为空时指出“report.structure 第 1 条…”。候选类型只接受 `scroll`（焚决条目）与 `prompt`；不支持的类型或缺字段的候选逐条列出“第 N 条候选：…已排除”，其余候选照常显示。所有文字原样保留（只去控制字符），界面用 React 文本渲染，HTML/脚本不会被解释。 | 任务第 3 条“解析失败如实提示，不猜”。 |
| 4 | **入库** `importCandidates`：只写勾选项。焚决条目经 `scrolls.js` 的 `addEntry` 写入用户选择的卷（计次 0），条目带 `source: { reverseId, url? }`；Prompt 经 `store.js` 的 `makeAsset` 生成第一个版本，`source` 为“逆向工程记录 <ID> · <链接>”。焚决、资产、逆向记录的入库结果在**同一次主库保存**里写入。已入库的候选不能重复写入；有入库结果后回复锁定（否则候选序号会与已入库结果错位），要重新拆解需新建记录。只勾选 Prompt 时不要求选卷；卷已删除视同未选。 | 任务第 4 条。 |
| 5 | `src/scrolls.js`：`addEntry` 增加可选第 5 个参数 `source`，其余函数未改（`editEntry` 用展开保留 source）。 | 满足“保留来源链接与逆向记录 ID”。 |
| 6 | `server/schema.mjs`：新增顶层集合 `reverseRecords` 与 `validateReverseRecords`（严格字段：id、title、createdAt、updatedAt?、deletedAt?、material{text,url}、why、pack、reply?、imports?；imports 每项按 kind 为 `scroll{scrollId,entryId}` 或 `prompt{assetId,versionId}`，带 index 与 at，序号不重复）；长度上限：记录 500、标题 120、原文 5 万、链接 2000、好在哪里 500、任务包 8 万、回复 20 万、入库 200；拒绝控制字符与非 http(s) 链接。焚决条目新增可选 `source`（`reverseId` 必填、`url` 可选且须 http(s)）。旧库缺失 `reverseRecords` 按空处理，不写迁移。 | 任务第 5 条。 |
| 7 | `server/merge.mjs`：`summary.added.reverseRecords`；备份合并只做加法——缺失的记录整条追加，同 ID 保留当前库（回复与入库结果以当前为准）。空库导入时计数与其他集合一致。 | 任务第 5 条“merge.mjs 一致”。 |
| 8 | 新增 `src/ReverseEngineering.jsx`：`ReverseWorkbench`（区域“逆向工程工作区”）= 流程步骤条（投入素材 → 复制任务包给 Agent → 粘贴回复 → 确认入库）+ 投素材表单 / 记录面板；记录面板含只读任务包与“复制任务包”、“Agent 回复”与“解析回复”、错误提示（role=alert）、排除说明（role=note）、拆解报告（结构/手法/可复用，每条带标注徽标）、候选勾选（默认不勾选、整行 44px 点击区、已入库的禁用并标“已入库”）、“焚决条目写入卷”下拉（无卷时提示先去资产仓库建卷）、“确认入库（N 项）”、入库结果。下方“逆向记录”列表：状态、打开、删除进回收区、回收区恢复。 | 任务第 1–5 条。 |
| 9 | `src/WorkspacePages.jsx`：`References` 在安全提示后嵌入 `ReverseWorkbench`；原“保存参考”功能与 `references` 数据保留，放到“参考链接”小节下。提示文字改为“只分析你提供的或公开的材料；报告区分‘原文观察 / 推断 / 已验证’…”。`src/pages.js`：逆向工程页头 lead 与 stage 改为新流程描述（maturity 仍为 draft）。`src/StoragePanel.jsx`：备份合并预览加“新增逆向记录”。`src/styles.css`：末尾追加 `.reverse-*`、`.candidate-*` 样式（沿用现有令牌、面板与徽标，窄屏记录行换行）。 | 保留既有测试依赖的“保存参考”流程。 |

## 二、测试

- 新增 `tests/reverse-engineering.test.mjs`（13 个用例）：任务包内容与固定性、只有链接/只有原文/空素材/非法链接/超长/控制字符；回复解析正常（代码块前后有说明、纯 JSON）、空回复、无 JSON、JSON 错误、多个代码块、最外层非对象、缺段（列出全部缺失字段）、标注不合法、内容为空；不支持的候选类型与缺字段候选逐条排除；恶意 HTML/脚本原样保留为文本；入库（勾选写入、计次 0、来源、Prompt 第一版本、未勾选不写、重复入库拒绝、回复锁定、后续补入库）、未勾选/无卷/卷已删/只选 Prompt、只有原文时来源只记 ID；状态、删除与恢复；schema 旧库兼容与合法记录、23 条严格校验反例、焚决条目 source 字段；备份合并（旧备份、空库、追加、同 ID 保留当前）。
- 新增 `tests/reverse-engineering-browser.mjs`（10 项 PASS）：空素材与 `javascript:` 链接被拒且不写库 → 投素材生成任务包并写入主库 → 复制任务包（剪贴板内容与主库一致）→ 非 JSON 与缺段如实提示且不显示候选 → 含 `<img onerror>` 与 `<script>` 的正常回复：报告三段与三类标注可见、排除说明、`window.__xss` 未定义、页面无注入元素、候选默认不勾选 → 勾选候选 1（焚决）与 2（Prompt）入库到“写作心法”：条目计次 0 且带来源、Prompt 一个版本且来源含记录 ID、候选 3 未写、另一卷未动、已入库候选禁用、回复锁定 → 记录列表显示“已入库 2 项”、删除进回收区、恢复、重开仍显示已入库 → 资产仓库可见 Prompt 卡与焚决卷里的条目 → 1440 控件 44px 与 axe → 390 无横溢、44px、axe → 全程无页面异常。
- 未修改任何既有测试。

## 三、失败测试首跑（实现前）

- `logs/00-build-base.txt`：会话初始 dist 是旧构建（仍含“逆向参考”），先在基点源码上 `npm run build`。
- `node --test tests/reverse-engineering.test.mjs`（`logs/01-unit-first-fail.txt`）：exit 1，`ERR_MODULE_NOT_FOUND: src/reverse.js`。
- `node tests/reverse-engineering-browser.mjs`（基点构建，`logs/02-browser-first-fail.txt`）：exit 1，等待区域“逆向工程工作区”10 秒超时。
- 实现过程中对新测试本身的调整（均未放宽断言）：44px 检查对象由复选框本身改为整行 label（复选框按全站样式是 17px，点击区是整行）；第 7 步后先按 Esc 关闭焚决抽屉再跳回逆向页（只改 hash 的 goto 不会重载页面）。实现侧一处修正：任务包与回复的 label 改为 `htmlFor` 关联，否则只读文本框的内容会并入可访问名称。

## 四、改动文件及 SHA256

| 文件 | 改动前（bf21a6d） | 改动后 |
|---|---|---|
| server/schema.mjs | 5a426e68d5cc28a6c7bc45a145cb622de9949816f5912f1101394bbe108d08c7 | 65cd5b5f456bd4e45324c5da56119bac8d6db5b2118bf9db5b50db2510204ce9 |
| server/merge.mjs | eac7e38c2921ec2083e2f15e5a88924228fee4ced01bdc85fa7851b1aaa3210e | 0e21e1505ca08b75e1ff63bfb36a39de7df16dc1083b9ad4a1a9960a2f3729a7 |
| src/scrolls.js | 2648a1dcbb8ac59f4992e57321e27f39a829a7ed29dfa76f23d39394fa358ad5 | a1de09f51d13355c3a9926a2f2c86f65a3a22a627da933c8b695f0421a2113ea |
| src/WorkspacePages.jsx | 0892ec4cd86cfe52513346ba9a6135dad1c9b5b5711d65de85da65b09fb51f6a | 2de9f82b7d3552543933d7ac277aca87c89ae251ce90f13ac2a575829145e7cc |
| src/pages.js | 96eb863dc1a2a124d05a445aa25914384fb3740aa62f7ddc3d418fd2b34622ce | 307bc9801555cd2a28bdd2a1c2fed10f7969430ba1b61f8bd8316d4d4eee864a |
| src/StoragePanel.jsx | ee18f2c673ed577ae5d817de983939a99d22f3494cd1d5288f7745774236a272 | f0baee49aa9dac25ef749958f0046cac55c34b58f62b23b8780d9e03dd6eaba9 |
| src/styles.css | 96430f0dd97fe3d2e7a9ce58c1758b93f97e66c810c26ffd9d8e50d0cd8b86d8 | e1678ae9d12c097bce977be8326750524c7a197937920252095f3308eca1badd |
| src/reverse.js | （新增） | ffa6a2bd157e9f16ef816f38805c78ea25f73887d4795a15c1280e3316b6de45 |
| src/ReverseEngineering.jsx | （新增） | 962347a301f015eaf52d454aec217faf610f1c2b6d78d82bb1f7b316b634738b |
| tests/reverse-engineering.test.mjs | （新增） | 0811b0b6d50b5806e721df10551ace0ad8348e023f303612e28769f089c2fb8c |
| tests/reverse-engineering-browser.mjs | （新增） | a9903d5cb98589c14ae21b48bb2717ecc05454509c32759e3620fdf424f0f433 |

## 五、验证命令与首次结果

| 命令 | 首次结果 | 对照云端已知失败集（CLOUD-SESSIONS §3.6） |
|---|---|---|
| `node --test tests/reverse-engineering.test.mjs tests/scrolls-schema.test.mjs`（实现后） | 20/20 pass | 新测试 13/13 |
| `node tests/reverse-engineering-browser.mjs`（实现后） | 10 项 PASS，exit 0 | 新测试 |
| `npm run build`（`logs/10-build.txt`） | 通过（仍有原有的 chunk 超过 500 kB 提示） | — |
| `timeout 1200 npm test`（`logs/12-npm-test.txt`） | tests 448 / pass 423 / fail 19 / cancelled 1 / skipped 5；`rule-templates.test.mjs` 照旧挂到外层超时（1199.8 秒，退出码行未写入） | 19 个失败（去掉耗时后逐行 diff）与 `cloud-scrolls-in-assets-logs/12-npm-test.txt` **完全相同：增 0、减 0**。tests 435→448、pass 410→423，差额是新增的 13 个单元用例 |
| 35 个浏览器脚本各 1 次（`logs/11-browser-scripts.txt`：4 个基础脚本 + 31 个 `*-browser.mjs`；每个外套 `timeout 600` 只防挂起，未触发） | 30/35 通过。失败：agent-config、rule-templates、rule-templates-fix（配置写入平台保护）、interaction（`matrix(... 0, 3)` 位移未到位）、search（`palette-cold 599ms > 500ms`） | 5 项全在已知集内，原因与已知描述一致：**增 0、减 0**。新增的 reverse-engineering-browser 通过 |
| `node tests/visual.mjs reverse-engineering`（`logs/14-visual.txt`） | `problems: []` | — |

截图（`cloud-reverse-engineering-shots/`，4 张）：`reverse-preview-1440.png`（解析后：报告、排除说明、候选，含恶意 HTML 按文字显示）、`reverse-390.png`（390 宽，已入库状态）、`visual-references-1440.png`、`visual-references-320.png`（visual 脚本的空库页面）。

## 六、需要真人确认的视觉点

1. 逆向页的主次：工作区（步骤条 + 表单/记录面板）在上，“逆向记录”列表居中，“参考链接”（旧的保存参考）在最下；页头右上仍是“保存参考”橙色主按钮——是否应改为次要按钮或移除旧参考入口，待你决定（本次保留以免破坏既有流程和 browser.mjs）。
2. 标注徽标配色：原文观察=绿、推断=黄、已验证=默认色。
3. 候选卡：整行可点，Prompt 候选显示标题、说明与全文（不截断、不折叠）；长 Prompt 会让页面很长。
4. 任务包文本框用等宽字体、9 行高，可拖动；没有“展开全文”。
5. 390 宽下记录行的“打开 / 删除”换到第二行。
6. 页头 maturity 仍显示“草稿”。

## 七、未完成项与风险

- **素材只支持文本和链接**；§4.6 提到的截图未做（任务范围未要求）。任务包只能复制，没有“派发给 Agent”。
- 回复只接受 JSON；Agent 若返回 Markdown 段落会被如实拒绝并提示按格式重回。是否另加 Markdown 段落解析待真实使用后判断。
- 焚决条目的 `source` 只写入数据，焚决抽屉里暂不显示来源链接或跳回逆向记录；Prompt 的来源写在版本 `source` 文字里，资产详情照常显示。
- 入库后回复锁定；若 Agent 返回有误需重拆，只能新建记录（旧记录可删到回收区）。
- 删除逆向记录不影响已入库的焚决条目与 Prompt（它们各有删除/归档流程）；入库结果列表会标注“卷已不存在 / 已在回收区 / 已归档”。
- 全局搜索（⌘K）尚不搜索逆向记录；首页、待处理不显示逆向记录。
- 备份合并对同 ID 记录保留当前库，不合并两边不同的入库结果（与“当前库为准”一致，但若两台设备各自入库同一记录，备份里的那份入库结果会丢失）。
- 云端结果不能代替本机回归；合入前请在本机重跑 npm test 与全部浏览器脚本，并核对上表的改动前指纹。

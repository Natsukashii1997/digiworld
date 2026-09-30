# 云端交接 · 路线 v3 切片 1.1（计次、置顶、搜索、规则图标）

- 执行：Claude Code 云端定时任务（云端副本，非权威）。未改 CURRENT.md / COLLABORATION.md / AGENTS.md / CLAUDE.md，不写交接编号。
- 基点：`main @ 6d93fd6`；分支 `cloud/2026-09-30-slice-1.1`，已推送；未开 PR、未推 main。
- 环境：Linux / root，Node v24.21.0（/opt/nvm），`PLAYWRIGHT_MODULE=playwright`，chromium-1234。
- 依据：基线 v2.2 D23–D25；产品定义 v1.2 §2.2、§4.5；路线 v3 切片 1.1；ASSET-USAGE.md 计次契约。

## 一、改动与理由

| # | 改动 | 理由 / 说明 |
|---|---|---|
| 1 | 删除工具栏“只看收藏”按钮与卡片星标；`server/schema.mjs` 资产字段白名单加入可选 `pinned`，存在时必须是布尔（否则“资产状态”校验失败）。旧库缺失即未置顶，不写迁移。`favorite` 字段保留仅作兼容，界面不再读写。 | D24。没有复用 `favorite`：演示资产默认 `favorite=true`，复用会被自动置顶（新测试专门断言 favorite=true 的演示资产未置顶）。 |
| 1b | `server/merge.mjs` **未改**。 | 核对：备份合并对资产只比较 type/demo/createdAt/origin/版本前缀；`pinned` 不参与冲突判断；备份版本更多时 `{...existing, versions}`，沿用当前库的置顶状态（与 favorite 相同语义）。已加单元测试证实。 |
| 2 | 卡片原星标位置换为置顶按钮（lucide `Pin`；aria-label “置顶 <标题>”/“取消置顶 <标题>”；`aria-pressed`；44×44）。排序比较器：置顶优先 → 置顶项之间按使用次数降序、再按最近使用 → 当前排序方式。数量行“全部资产 · N”，有置顶时加“· 置顶 M”（M 为当前列表中的置顶数）。 | D24、§4.5。对所有类型标签和四种排序都生效。 |
| 3 | `Cover` 新增 `uses` 属性：封面左下角大号等宽数字（只显示数字，封面仍 aria-hidden）；卡片正文加读屏文字“使用 N 次”（新增 `.sr-only`）；去掉“从未使用 / 使用 N 次 · 日期”一行及其 `.card-usage` 样式。计次沿用 `usageByAsset`（复制成功才计一次）。 | 任务说明要求左下角；产品定义 §4.5 写的是“右上角”，右上角已被版本号占用，按本任务说明执行，**请真人确认位置**。 |
| 4 | 排序菜单：最近更新、最常用（新增 `most`：次数降序→最近使用→最近更新）、最近使用、名称排序。 | D24。 |
| 5 | 顶栏搜索只保留搜索图标与 ⌘K 提示（`kbd` aria-hidden，按钮 aria-label 仍为“搜索”，title“搜索工作台（⌘K）”），去掉“搜索”文字与固定宽度，最小 44×44；仍紧挨待处理按钮。641–960px 规则去掉搜索框宽度；≤640px 只留图标（隐藏 kbd，44px）。浮层本身未改；页内筛选框保留。 | D25、§2.2。 |
| 6 | 新建资产对话框类型选择改为 4 列一行；≤640px 为 2×2。 | 任务 6。 |
| 7 | 规则图标对调：`src/pixel.jsx` 新 `Rule` sprite 为 lucide ScrollText 的像素版（左上卷轴头、三行条款、右下纸尾；currentColor 描边、`var(--px-glyph-fill)` 填充、右侧阴影列，保留条款依次点亮的 cycle 动效）；旧卷轴改名 `rule_scroll` 保留。`TypeIcon` 的 Rule 改为 `<Pixel sprite="rule_scroll" fit={size}>`，与线条小图标同尺寸；`.type-icon-pixel` 固定第一帧，不随卡片悬停播放。 | 用户 2026-09-30 决定。视觉效果**需真人验收**（见截图）。 |

## 二、改动文件及 SHA256

| 文件 | 改动前（6d93fd6） | 改动后 |
|---|---|---|
| src/Assets.jsx | 70827d14c797e025045be57a870c1d93e38cea3f67f456e6d2d81c76a1bb40ad | 1535d67d1e490b51385f5450f1fd847168bc6d1b8e914e2c7aef622c82849a1a |
| src/components.jsx | b10b9394134e15320a9fb2dce0bf6f8b063adb44d01a2636037695fd9b7ffb11 | 04c800810c062e2370fd4f64a7a148821a498c4ff114d749ac12a4202ed83635 |
| src/pixel.jsx | 0a1ba8ab59c33caebd2ae167d0088b930064384f2aa269062654e709b3ed1342 | a143930b6adac27521cbcd88fc0820f58fe1edfd8fbbbdbf349fd3e948d0c738 |
| src/App.jsx | d303e42f0c5a70aaa5737e377add873969caae75591df587e90f091096ed16ac | 69471169febc25323362c1fd574ae817a14b3e306e8493022c1fc982b321fa98 |
| src/styles.css | c610ce93f20fc698f0febab83a11b00ee21f7897b56c911bdd6e3501fa14e4d4 | 220058ff4c3f95045e38f0ab8b967d5d140e6fd0802ad3541b7ff0b79bddfb43 |
| server/schema.mjs | 29e3283f44cd47f85221a632f295bdc434aa346fc4db812e2d69c35b0c6531ee | 55c4c0f30ec562ac701ea143cfdae96778347e224a54b48a54c9508bfaa89c99 |
| server/merge.mjs（未改，仅核对） | 7b481bc2cb5abaf4071cfdc0b5e9834f3808557177aa5880f37b9688c6950b3b | 同左 |
| tests/browser.mjs | ff02ff81da12e2994e39e992f0dbc44ab3ded498d0d406119cc2f416ca8a7900 | 18726ccef603101964af51ecbd2365d8951071aee998cd1a91ff632aefbfabc6 |
| tests/usage-browser.mjs | 7b2ef445a865c96ee054cddf374be200a77048b1857914b5d2044de9e788bfb7 | 779720ecbcafba0e3c9f810fab645dd00761f16b3c6013f912ed1fb306e255c7 |
| tests/repository.test.mjs | 23d99a573666060ca00f33fe952fdea98438d4c88c97f93932bebc10c9d1436b | 66d6e50797322a8ddce45e67d5094984ace22e27605baa3868949bd4cfe07169 |
| tests/assets-pin-browser.mjs（新增） | — | ffd57eebc19ce12609fa3b579e368f811914f7cd31f2862de767bd9261589434 |

package.json / package-lock.json 未改。

### 测试改动说明（未降低覆盖）

- `tests/browser.mjs`：“只看收藏”两步改为置顶断言——置顶“把经验，留在知识里”后仍 6 张卡、该卡排第一、数量行含“置顶 1”；取消后恢复且“置顶”消失。保留“按状态收窄/调整列表”的覆盖意图，结束时状态复原，不影响后续步骤。
- `tests/usage-browser.mjs` 第 51 行：原断言“从未使用”出现 6 次，这一行按任务要求已去掉；改为等价断言：读屏文字“使用 0 次”出现 6 次，且 6 个 `.cover-uses` 都是“0”。**任务说明未点名此文件**，但它依赖被删除的文案，不改会新增失败，特此说明。
- `tests/repository.test.mjs` 新增：旧库无 pinned；`true/false` 合法；`"true"`、`1`、`null`、`{}` 被拒；备份中 pinned 不同且多一版时合并不冲突、沿用当前库置顶状态、只追加新版本。

## 三、失败测试首跑（改代码前）

- `node tests/assets-pin-browser.mjs`（日志 `cloud-slice-1.1-logs/01-new-test-before.txt`）：exit 1，第一条断言即失败——`AssertionError: 1 !== 0`（tests/assets-pin-browser.mjs:82，“只看收藏”按钮仍存在）。
- 新的 pinned 单元测试在旧 `server/schema.mjs` 上运行（`02-schema-test-before.txt`）：fail 1，`数据校验失败：包含不支持的字段`。

## 四、验证命令与首次结果

| 命令 | 首次结果 | 对照云端已知失败集 |
|---|---|---|
| `npm run build` | 通过 | — |
| `node tests/assets-pin-browser.mjs`（改后） | 10/10 PASS，exit 0 | 新增用例 |
| `node --test tests/repository.test.mjs` | 7/7 pass | — |
| `timeout 1200 npm test`（`03-npm-test.txt`） | tests 427 / pass 402 / **fail 19** / cancelled 1 / skipped 5；`rule-templates.test.mjs` 照旧挂到外层超时 | fail 数与已知集相同（19）；失败项均属已知类别（agent-config 恢复/回读、plutil、ChatGPT.app、wiki-local、skill-files root 权限、rule-templates）。pass +1 为新增 pinned 单元测试。**增 0、减 0**。注：日志末尾缺少我追加的 `exit=` 行（外层超时结束时未写入），结论以 node 汇总为准 |
| 30 个浏览器脚本各 1 次（`04-browser-scripts.txt`；4 个基础脚本 + 26 个 `*-browser.mjs`，含新增 1 个；每个脚本外加 `timeout 600` 仅防挂起） | 26/30 通过；失败：agent-config、rule-templates、rule-templates-fix、search（`palette-cold 728ms > 500ms`，与已知原因相同） | 均在已知 5 项内，**新增失败 0**；interaction 本次通过（已知时序项，未视为修复）。browser.mjs、usage-browser.mjs、accessibility.mjs 通过 |
| `node tests/visual.mjs slice-1.1`（`05-visual.txt`） | `problems: []` | — |

截图（`cloud-slice-1.1-shots/`）：`1440-assets.png`（含置顶的工作流卡与规则卡）、`1440-topbar.png`、`1440-create-dialog.png`、`390-assets.png`。

## 五、“规则装入也算一次”的结论：本切片不做

现状：规则装入记录在本机 `data/rule-operations/` 的操作日志（config-journal），不在主库、不进备份，也不在 `assetActivity`。`POST /api/rule-templates/installs` 只返回每个“项目×文件”最近一次已完成写入，**拿不到历史装入次数**。

技术上可以只读汇总：扩展 installs 响应，统计 `kind=apply` 且有 `completedAt` 的记录数，按 assetId 汇总，不新增存储。但本轮没做，原因：
1. 需要改 `server/rule-templates.mjs`，而它的单元测试在云端必挂、两个浏览器脚本在已知失败集里，云端**无法验证**这项改动；
2. 口径没定：升级算不算一次？撤回后是否扣回？同一项目反复装入算几次？
3. 这份日志不进备份。恢复备份后，复制次数会还原，装入次数却不会，“最常用”排序和进化阶段的证据口径会分叉；ASSET-USAGE 契约目前只把“复制成功”定义为使用。

建议：由本机会话先定口径（建议只计 create/append/upgrade 的已完成写入，撤回不扣减），在 installs 响应里加只读汇总 `applied: {assetId: n}`。前端只把它加进卡片数字和“最常用”排序，**不**进 stage 证据；在本机跑 rule-templates 回归后再合入。

## 六、未完成项与风险

- 视觉与文案需真人验收：封面计次数字的位置（任务要求左下；§4.5 原文为右上）、新像素卷轴、13px 小角标的清晰度、顶栏只剩图标后的辨识度。
- 置顶按钮沿用原星标的显示方式：未置顶时仅在悬停或键盘聚焦时出现。触屏上看不到，但仍可点击。是否在触屏常显，待定。
- 列表视图里置顶按钮悬停时的 transform 会覆盖垂直居中（原星标也有这个问题），未处理。
- 云端结果不能代替本机回归；合入前请在本机重跑 npm test 与全部浏览器脚本，并核对上表的前像指纹。

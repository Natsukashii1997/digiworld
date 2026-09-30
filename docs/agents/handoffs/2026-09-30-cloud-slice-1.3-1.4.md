# 云端交接 · 路线 v3 切片 1.3 焚决 + 1.4 随手记

- 执行：Claude Code 云端会话（云端副本，非权威）。未改 CURRENT.md / COLLABORATION.md / AGENTS.md / CLAUDE.md，不写交接编号。
- 基点：`main @ ce1f1f4`（已含切片 1.1）；分支 `cloud/2026-09-30-slice-1.3-1.4`，已推送；未开 PR、未推 main。
- 环境：Linux / root，Node v24.21.0（/opt/nvm），`PLAYWRIGHT_MODULE=playwright`，chromium-1234。
- 依据：基线 v2.2 D22、D33、D15（推翻）；产品定义 v1.2 §2.2、§4.5、§5；路线 v3 切片 1.3、1.4。
- 与并行的切片 1.2（导航两区重排）的合并面：`src/pages.js` 只新增一个页面对象、`LAYERS` 资产层加 `"scrolls"`、改随手记 lead 一句；`src/App.jsx` 只加一行 import、两行路由。**没有**改侧栏分组、`GROUPS`、页面编号或“随手速记”→“随手记”的改名。

## 一、改动与理由

| # | 改动 | 理由 / 说明 |
|---|---|---|
| 1 | `server/schema.mjs`：新增顶层集合 `scrolls` 与 `validateScrolls`。卷字段 `id,name,pinned,createdAt,updatedAt?,deletedAt?,entries`；条目字段 `id,text,tags,uses,createdAt,updatedAt?,deletedAt?,lastUsedAt?`。上限：卷 ≤200、每卷条目 ≤2000、总条目 ≤20000、卷名 1–60 字且无控制字符/换行、正文 1–20000 字且无控制字符（允许换行、制表符）、标签 ≤12 个、每个 1–24 字、不含空白与逗号、不重复；`uses` 为 0–1e9 的安全整数；卷 ID、全库条目 ID 唯一；多余字段一律拒绝。旧库缺失 `scrolls` 按空处理，不写迁移。 | D22、§4.5、§5。卷与条目是可变记录、不做版本；删除写 `deletedAt` 进回收区；数组顺序即条目顺序。 |
| 2 | `server/schema.mjs`：随手记增加可选 `format`（只允许 `"md1"`）与 `refined:{scrollId,entryId,at}`。`md1` 正文 ≤20000 字、禁止控制字符。无 `format` 的旧随手记校验不变。 | D33、D15。存储为受限 Markdown 纯文字，**不存任何 HTML 字段**。`refined` 只校验 ID 形状，不强制指向存在的卷，避免“只导入随手记备份”被拒。 |
| 3 | `server/merge.mjs`：`mergeScrolls`。缺失的卷整卷追加；已有卷保留当前库的名称、顺序与编辑，只在末尾追加备份独有条目；两边都有的条目 `uses` 取较大值；同一条目 ID 落在不同卷里 → 409，整次不导入。摘要新增 `added.scrolls`、`scrollEntriesAdded`。 | 备份导出（`GET /api/backup`）本就是整份主库，自动包含 `scrolls`，未改。合并只做加法，与现有 notes/assets 语义一致；计次只增不减。 |
| 4 | `src/scrolls.js`（新）、`src/Scrolls.jsx`（新）：焚决页。左栏建卷（输入框 + “新建卷”）、卷列表（液晶封面 + 火焰像素图 + 卷名 + “N 条 · 复制 M 次”、置顶按钮）、回收区（折叠，恢复卷/条目）；右栏卷头（重命名、删除）、条目编辑区（正文 + 标签）、标签筛选（“全部”+ `#标签`，aria-pressed）、有序条目（序号、正文、醒目标签、复制次数、复制/上移/下移/编辑/删除）。 | D22。卷排序：置顶在前，同组按创建先后。复制沿用资产的 `copy()`：剪贴板写入成功后才 `uses+1` 并记 `lastUsedAt`，失败不计。移动只和相邻的未删除条目交换，回收中的条目原位不动，恢复后回到原处。 |
| 5 | `src/pixel.jsx`：新增 `Scroll`（16×16 三帧火焰，调色规则与其他封面相同：currentColor 描边、`--px-glyph-fill` 外焰、黄内焰、白焰心）和 `mark_flame`（页头纹样）；`src/styles.css` 新增 `.type-Scroll`（`--tc:#ff6a3d` 橙红）等焚决与随手记样式；`src/components.jsx` MARKS 加 `scrolls`；`src/Home.jsx` 图标用 lucide `Flame`，能力地图显示“N 卷”。 | “橙红色、火符号、像素风与资产类封面一致”。**视觉需真人验收**。 |
| 6 | `src/pages.js` 注册 `scrolls`（资产组、编号 `13`、成熟度“可用”）；`src/App.jsx` 路由。 | 编号 13 是临时的，避免和 1.2 的重排冲突；合并时由 1.2 统一编号。 |
| 7 | `src/rich-note.js`（新）+ `src/WorkspacePages.jsx` 的 `Notes` 改造：格式工具栏（role=toolbar）“无序列表 / 有序列表 / 任务列表 / 红 / 蓝 / 绿 / 黄 / 灰”，按选区改写 textarea 文本；语法 `- `、`1. `、`- [ ] / - [x] `、`[文字]{red}`。卡片渲染：解析为块，**全部以 React 文本节点输出**（不使用 dangerouslySetInnerHTML），因此 `<script>`、`<img onerror>` 原样显示为文字。任务勾选直接写回该行的 `[ ]/[x]`，界面先乐观更新，保存失败回退。 | D33。受限 Markdown 比结构化块编辑器简单，又能直接用 textarea 选区，且与“炼入”取选中文字天然兼容。旧随手记（无 `format`）仍按纯文本显示，不会把以“- ”开头的旧行误解析成列表；**编辑旧随手记并保存后会转为 md1**。 |
| 8 | 随手记“炼入焚决”：每条未炼的随手记只有这一个去向按钮。按下时读取**完全落在该条正文内**的选区；无选区则取整条（去掉字色标记、保留列表符号）。弹窗选择目标卷后，**一次保存**同时写入“新条目追加到卷末”和“随手记 `refined`”，卡片显示“已炼 · 卷名”，按钮消失；卷被删时显示“卷已移入回收区”。无卷时弹窗给“去焚决建卷”。 | D33、§4.5。单次整库写入保证两边状态不会一半成功。 |
| 9 | 去掉随手记的“导出 Markdown”；页面与保存提示不再出现“尚未写入 Obsidian”，改为“只保存在本应用”。保留逐条“复制”和“编辑”。 | D15 推翻 + D33“只保留一个去向”。导出 Markdown 本是为 Obsidian 准备的出口，按“唯一去向”删除；复制不改变随手记归属，未视为去向——**请真人确认**。 |
| 10 | `src/StoragePanel.jsx`：合并预览显示“新增焚决卷”“追加焚决条目”。 | 让用户在确认合并前看到焚决的变化。 |

未改：`server/config-file.mjs`、`package.json`、`package-lock.json`、`src/pending.js`、`src/search.js`、所有既有测试。

## 二、改动文件及 SHA256

| 文件 | 改动前（ce1f1f4） | 改动后 |
|---|---|---|
| server/schema.mjs | 55c4c0f30ec562ac701ea143cfdae96778347e224a54b48a54c9508bfaa89c99 | 5a426e68d5cc28a6c7bc45a145cb622de9949816f5912f1101394bbe108d08c7 |
| server/merge.mjs | 7b481bc2cb5abaf4071cfdc0b5e9834f3808557177aa5880f37b9688c6950b3b | eac7e38c2921ec2083e2f15e5a88924228fee4ced01bdc85fa7851b1aaa3210e |
| src/App.jsx | 69471169febc25323362c1fd574ae817a14b3e306e8493022c1fc982b321fa98 | caa2fe17a63ea5da9eca6c9a693f582b23a39b1162e98152e2deb427820dd5d2 |
| src/pages.js | 9f4a11e9d4087fd582114f78a34c42b7ab6c1bd53ad590a843e5a9d538847f20 | c5a666f6efdf44a83324f3203a1a698448ddfca5470850497b93cafa6f1fa460 |
| src/WorkspacePages.jsx | 834967668e6c85aa67176bde33c78c029bf3ae29eeac7b522dcddbac57a66edd | 984d6dd09a4f95ae629822bfe57b1c2bbaffff06c7d4f93c6e9740fff1e5a7d4 |
| src/StoragePanel.jsx | 8ea36b7dec164131ae1fa6a5227fdeabce6e901a9872223a604dbaccc2ab9cca | ee18f2c673ed577ae5d817de983939a99d22f3494cd1d5288f7745774236a272 |
| src/Home.jsx | 0556a6fe2b2c8806961f10f0368353dc231867ebd4387d22ab8ec3bfcf5b2217 | 7a0afb3e037d11d37479e7bb8e607e7572c3bdba9a69f482ee61240eacb5fbaf |
| src/components.jsx | 04c800810c062e2370fd4f64a7a148821a498c4ff114d749ac12a4202ed83635 | 1808d8908676683a995c72c8060baa21fa34dc2cc744b86a217a245f0feee9c6 |
| src/pixel.jsx | a143930b6adac27521cbcd88fc0820f58fe1edfd8fbbbdbf349fd3e948d0c738 | 225c6d8c9460cefc4c814729a5f2f42ce4dfef7d875186bf2bce85e666257fc2 |
| src/styles.css | 220058ff4c3f95045e38f0ab8b967d5d140e6fd0802ad3541b7ff0b79bddfb43 | b5bd41fbaceef617af179528fdd1d1a42e5a67f476cda5a3e8d18fd6c3ee992f |
| src/Scrolls.jsx（新增） | — | 60bd89cb92745486b0eda3f8492d1cd816fd2775c0eca9dd58c930735874aa70 |
| src/scrolls.js（新增） | — | 65086a6e106a4795b5abef3f6c4c564ab02cf4de01bc0359d1346777e7be3bc3 |
| src/rich-note.js（新增） | — | 786118ca63b4727d92f4813bab8dd06638891cf6985bc273c5efa28166dd4bce |
| tests/scrolls-schema.test.mjs（新增） | — | 45715cd9ae24ee8e336261a850eeaf40d1d5ac68e1d64179fc3992411601b70b |
| tests/scrolls-browser.mjs（新增） | — | 8240bf2b3fd7db1712fba44f16f662ba4ad023d5b14903ea044e0895bb3088b6 |
| tests/notes-rich-browser.mjs（新增） | — | 078dd2a5f2bdcf1ddbf90be284a81a1138f9ab364b5df3fa9608067a49637118 |

## 三、失败测试首跑（改代码前，`npm run build` 之后）

- `node --test tests/scrolls-schema.test.mjs`（`cloud-slice-1.3-1.4-logs/01-schema-test-before.txt`）：tests 7 / pass 1 / fail 6。唯一通过的是“旧库缺少 scrolls 按空处理”（旧代码本来就不认识 scrolls）；其余 6 条均为 `数据校验失败：包含不支持的字段`。
- `node tests/scrolls-browser.mjs`（`02-…-before.txt`）：exit 1，`#scrolls` 路由不存在，`.page-heading` 等待 10 秒超时。
- `node tests/notes-rich-browser.mjs`（`03-…-before.txt`）：exit 1，初始化带 `scrolls` 的合成主库即被拒——`数据校验失败：包含不支持的字段`。

新测试在实现过程中的两处调整（都只针对本次新写、尚未通过的测试，没有改任何既有测试）：
1. `scrolls-browser.mjs` 剪贴板失败提示原写 `getByRole("alert")`，但工作台的 toast 一律是 `role="status"`（既有契约），改为 `status`。
2. `getByLabel("卷名称")` 会同时匹配“新卷名称”，改为 `{ exact: true }`。

## 四、验证命令与首次结果

| 命令 | 首次结果 | 对照云端已知失败集（CLOUD-SESSIONS §3.6） |
|---|---|---|
| `npm run build` | 通过（仍有原有的 chunk 大于 500 kB 提示） | — |
| `node --test tests/scrolls-schema.test.mjs`（改后） | 7/7 pass | 新增 |
| `node tests/scrolls-browser.mjs`（改后） | 14 项 PASS，exit 0 | 新增 |
| `node tests/notes-rich-browser.mjs`（改后，第一次） | 前 3 项 PASS，第 4 项失败：受控复选框在保存往返前不翻转，Playwright `check()` 报“点击未改变状态”。这是真实的交互迟滞，改为乐观更新 + 失败回退后 10 项全过，exit 0 | 新增 |
| `timeout 1200 npm test`（`04-npm-test.txt`） | tests 434 / pass 409 / **fail 19** / cancelled 1 / skipped 5；`rule-templates.test.mjs` 照旧挂到外层超时（exit=124） | 19 个失败与切片 1.1 日志中的失败清单逐条 diff **完全相同**：**增 0、减 0**。pass 402→409，+7 为新增的 scrolls-schema 用例 |
| 32 个浏览器脚本各 1 次（`05-browser-scripts.txt`；4 个基础脚本 + 28 个 `*-browser.mjs`，含新增 2 个；每个外加 `timeout 600` 只防挂起） | 27/32 通过；失败：agent-config、rule-templates、rule-templates-fix、interaction（`matrix(…, 2.98939)` 期望 3）、search（`palette-cold 711ms > 500ms`） | 5 项全部在已知集内，原因与已知描述一致：**新增失败 0、减少 0**。browser.mjs（含随手记创建/编辑/双页冲突）、accessibility.mjs、migration.mjs（旧随手记与备份合并）均通过 |
| `node tests/visual.mjs slice-1.3-1.4`（`06-visual.txt`） | `problems: []` | — |

新测试覆盖：
- 焚决：建卷、空名不能提交、条目增/改（原地、不增版本）/上移/下移（边界禁用）、刷新后顺序一致、标签按空格与中英文逗号拆分、标签筛选与“全部”、复制两次计 2 次且剪贴板内容正确、剪贴板失败不计次、删除条目进回收区并恢复到原位且计次不变、卷置顶排第一并刷新保持、卷改名/删除/恢复、键盘新增条目、焦点可见、44px、axe（1440、390）、390 宽无横向溢出。
- 随手记：工具栏 8 个按钮 44px、按选区生成三种列表与五种字色、键盘触发；五种格式保存后刷新一致；旧随手记仍为纯文本；XSS 字符串原样显示、无 img/script 元素、未执行；任务勾选与取消勾选持久；选中文字炼入指定卷、无选区整条炼入（去字色、留列表符号）、两边状态刷新后一致；焚决页可见炼入条目；全程无 `/api/knowledge*` 请求；页面不再出现“写入 Obsidian”；axe、390 宽。
- 单元：旧库/旧备份无 scrolls 可读可导入；合法字段通过；28 类非法字段/长度/重复被拒；随手记 format/refined 校验；合并追加卷与条目、计次取大、当前编辑保留、跨卷条目 ID 冲突整体拒绝；含焚决与富文本随手记的备份导出→导入空库→导回自身往返一致。

截图（`cloud-slice-1.3-1.4-shots/`）：`scrolls-1440.png`、`scrolls-390.png`、`notes-rich-1440.png`、`notes-rich-390.png`。

## 五、需要真人确认的视觉与交互点

1. 焚决的橙红色值（`#ff6a3d`）、火焰像素图、卷封面尺寸（76×64）与资产封面放在一起是否协调。
2. 卷封面左下角大号数字是“本卷复制总次数”（与资产封面同义），卷名下是“N 条 · 复制 M 次”。
3. 条目操作按钮单独一行、右对齐；无标签条目这一行显得空，是否改为和正文同行。
4. 标签样式（橙红实心胶囊）是否“足够醒目但不刺眼”。
5. 随手记的字色按钮是带下划线的彩色“A”；语法提示放在输入框下方一行。
6. 去掉“导出 Markdown”、保留逐条“复制”是否符合“只保留一个去向”的本意。
7. 随手记页仍叫“随手速记”、成熟度仍是“草稿”：改名属于 1.2 的导航调整，这里没有动。

## 六、未完成项与风险

- **待处理里的随手记事项已过时**：`src/pending.js` 仍写“N 条随手记仍只在本机 / 尚未写入 Obsidian，可以整理后手动归位”，与 D15 冲突。标题文字被既有测试 `pending.test.mjs`、`digital-world-ui.test.mjs` 断言，本任务不改测试也不改这条，建议本机决定新口径（例如“N 条随手记未炼”，或干脆不进待处理）后连同测试一起改。
- 全局搜索仍按原文搜索随手记，结果摘要里会带 `[文字]{red}`、`- [ ]` 这类标记；焚决条目还没接入全局搜索。
- 回收区只能恢复，没有永久删除，长期会累积；是否需要“清空回收区”待定。
- 编辑旧随手记（无 format）保存后会转为 md1，如果旧文本里有以“- ”“1. ”开头的行，会开始按列表显示。
- 炼入只允许一次（按钮随后消失）；随手记被炼后再编辑，不会同步到焚决条目（条目是独立副本，这是有意的）。
- 同一时刻连续快速勾选两个任务时，第二次可能遇到“正在保存”而回退，需要再点一次。
- 页面编号 `13` 是临时值，与 1.2 合并时需统一；`LAYERS` 与 `pages.js` 的新增行可能与 1.2 的改动相邻，属于文本冲突，不是语义冲突。
- 云端结果不能代替本机回归；合入前请在本机重跑 npm test 与全部浏览器脚本，并核对上表的改动前指纹。

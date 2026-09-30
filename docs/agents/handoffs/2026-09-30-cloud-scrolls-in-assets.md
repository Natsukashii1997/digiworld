# 云端交接 · 任务 E1 切片 1.3b：焚决迁入资产仓库

- 执行：Claude Code 云端会话（云端副本，非权威）。未改 CURRENT.md / COLLABORATION.md / AGENTS.md / CLAUDE.md，不写交接编号。
- 基点：`main @ 99f87d4`（已含切片 1.1–1.4 与使用次数滚动）；分支 `cloud/2026-09-30-scrolls-in-assets`，已推送；未开 PR、未推 main。
- 环境：Linux / root，Node v24.21.0（/opt/nvm），`PLAYWRIGHT_MODULE=playwright`，chromium-1234。
- 依据：用户 2026-09-30 纠正（“焚决在资产仓库里，是新建的一种，不要单独拿出来”）；产品定义 v1.2 §2.1、§3.1、§4.5；问题共识基线 v2.2 D22。
- 数据模型不变：`scrolls` 仍是主库顶层集合；**未改** `server/schema.mjs`、`server/merge.mjs`、`server/config-file.mjs`、`package.json`、`package-lock.json`。

## 一、改动与理由

| # | 改动 | 理由 / 说明 |
|---|---|---|
| 1 | `src/Assets.jsx`：类型标签加第五个“焚决”（顺序：全部、Skills、Prompts、工作流、规则、焚决）。焚决计数 = 未删除的卷数；“全部”计数 = 未归档资产 + 未删除卷。“全部”与“焚决”标签下列出焚决卡。类型标签容器补 `role="group"`（原来只有 aria-label，读屏不会念出组名）。 | 任务第 1 条。 |
| 2 | `src/Assets.jsx` 新增 `ScrollCard`：与资产卡同一外形（`.asset-card` / `.card-open.type-Scroll`），封面用现有 `Cover`（`type="Scroll"`，火焰像素图 + 橙红），编号 `FJ.xx`，左下角次数 = 卷内未删除条目复制次数之和（沿用 Cover 的 `uses` / Odometer），不显示版本；正文是卷名、“N 条”、按出现次数取前 1–2 个标签。置顶按钮与资产卡相同（文案“置顶 / 取消置顶 卷名”），写 `scroll.pinned`。 | 任务第 2 条。封面次数与资产卡同义。 |
| 3 | 资产与卷统一排序：两者先映射为同一组键（pinned、次数、最近使用时间、更新时间、名称）后排序。置顶优先、置顶项之间按次数再按最近使用；四种排序同资产卡——“最近更新”用卷的 `updatedAt‖createdAt`，“最常用”用次数和，“最近使用”用条目最晚的 `lastUsedAt`，“名称”用卷名。页内搜索（`scrollHit`）按卷名、未删除条目的正文与标签匹配，每个关键词都要命中；标签下拉选中时，只保留含该标签条目的卷。 | 任务第 2 条。注意：`addEntry` 等条目操作不改卷的 `updatedAt`（原有 scrolls.js 语义，未改），所以“最近更新”只反映卷改名、置顶、恢复。 |
| 4 | `src/Scrolls.jsx` 改写为两个组件：`ScrollDetail`（抽屉，`Dialog drawer`，标题“焚决详情”：大封面、类型徽标、“N 条 · 复制 M 次”、卷名、重命名、删除卷，以及条目的新增、编辑、上移、下移、删除、复制计次和标签筛选）、`ScrollRecycle`（回收区）。条目与卷的业务逻辑原样搬用 `src/scrolls.js` 的纯函数（`addEntry/editEntry/moveEntry/countUse/deleteEntry/…`），没有重写规则。独立页面组件 `Scrolls`、旧的左栏卷列表与 `ScrollCover` 已删除。 | 任务第 3、5 条。删除卷后抽屉自动关闭，并提示“已移入回收区，可恢复”。 |
| 5 | `src/scrolls.js` 新增纯函数 `scrollSerials`（按创建先后编号，含已删卷，恢复后编号不变，与资产 `serialsOf` 同义）、`scrollStats`（条数、次数和、最近复制时间、按频次排序的标签）、`scrollHit`（搜索）。原有函数未改。 | 供卡片、抽屉、排序和搜索共用。 |
| 6 | `src/Assets.jsx` 的 `AssetEditor`：类型选择加第五个“焚决”（并补 `aria-pressed`）。选中焚决后只显示“卷名”（上限 60，与 schema 一致）；空白卷名时“新建卷”按钮禁用。提交走 `onCreateScroll`，不生成资产版本。`src/App.jsx` 的 `createScrollNamed` 保存成功后，在同一批更新里关闭对话框并打开该卷抽屉，焦点先由对话框归还、再由抽屉接管。在“焚决”标签下点“新建资产”时默认选中焚决。 | 任务第 4 条。 |
| 7 | `src/styles.css`：`.type-picker` 由固定 4 列改为 `repeat(auto-fit, minmax(92px, 1fr))`，1440 宽时五个一行，窄屏自动换行（≤640px 仍是原有的 2 列规则）。删除独立页面专用的布局样式（`.scrolls-layout`、`.scroll-list/-item/-open/-cover/-meta/-name/-pin`、`.scroll-create`、`.scroll-main`），新增 `.scroll-recycle`；条目、标签、回收行样式保留。 | 任务第 4 条。 |
| 8 | 回收区（已删的卷，以及未删卷里已删的条目）在“焚决”类型标签下方，默认折叠，可逐项恢复。 | 任务第 5 条。 |
| 9 | `src/pages.js`：删除 `scrolls` 页面注册与 `partOf` 标记；新增 `RETIRED` 表，`resolveRoute("scrolls")` 返回 `{ route: "assets", anchor: null, filter: "Scroll" }`。`src/App.jsx`：删除 `#scrolls` 路由；`initialTarget`、hashchange、`navigate` 遇到 `filter` 时改写地址为 `#assets` 并选中“焚决”标签。资产仓库页头 lead 加上“焚决”。 | 任务第 6 条。用的是与 `mergedInto` 等价的独立别名表：页面已删除，不再需要注册项。 |
| 10 | 随手记“炼入焚决”无卷时，“去焚决建卷”仍调用 `navigate("scrolls")`，经第 9 条改为落到资产仓库“焚决”标签；提示文字改为“先到资产仓库的‘焚决’标签建一卷”。首页资产行保留“含焚决 N 卷”（未改）。`Home.jsx` ICONS 与 `components.jsx` MARKS 删除已无用的 `scrolls` 项。 | 任务第 6 条。 |
| 11 | `src/components.jsx`：`typeLabel.Scroll="焚决"`、`typeCode.Scroll="FJ"`、`TypeIcon` 对 Scroll 使用 lucide `Flame`；`Cover` 的 `version={null}` 不显示版本角标。 | 焚决卡与抽屉共用 Cover。 |

## 二、测试调整

- `tests/scrolls-browser.mjs`：重写为全部经由资产仓库操作，原有覆盖点都保留：建卷（空名不能提交）、条目新增/原地编辑/上下移（边界禁用）、刷新后顺序一致、标签拆分与筛选、复制计次（2 次、剪贴板内容正确）、剪贴板失败不计次、删除条目进回收区并原位恢复（计次不变）、卷置顶排第一并在刷新后保持、卷改名/删除/恢复、键盘新增、焦点可见、44px、axe（1440、390）、390 宽无横溢。
  新增断言：`#scrolls` 落到 `#assets` 且“焚决”标签被选中、导航无焚决；类型标签顺序与“焚决”计数（0 → 2 → 删卷后 1）；“全部”计数 = 资产 + 卷，且同时列出资产卡与焚决卡；FJ 编号、“N 条”、封面次数 = 条目之和、卡片标签取最常用两个；新建对话框五个类型在 1440 同一行、在 390 换行且无横溢；选焚决只需卷名，创建后直接打开抽屉；回收区位于类型标签下方；置顶优先于“最常用”排序，“全部”里也排最前；页内搜索按卷名、正文、标签都能筛到焚决卡；首页“含焚决 2 卷”。
- `tests/digital-world-ui.test.mjs`：原有断言一条未删（结构地图的 `!p.partOf` 过滤保留，现已无页面带 partOf，不影响结果）。新增一条：PAGES 中不再有 scrolls；`resolveRoute("scrolls")` 的返回值；在服务端渲染下，“全部”共 7 张卡（6 份资产 + 1 卷），已删卷不显示，“焚决”标签下 1 张卡、使用次数为条目之和、有回收区。
- `tests/notes-rich-browser.mjs`：“焚决页显示炼入的条目”改为 `#assets` → 焚决标签 → 打开卷 → 抽屉中可见该条目。
- `tests/nav-zones-browser.mjs`：没有涉及 scrolls 页面，未改。
- **`tests/assets-pin-browser.mjs`（既有测试，需本机知悉）**：全量回归首跑时这里失败，断言是“新建资产对话框有 4 个类型”（`5 !== 4`）。按本任务第 4 条，这是旧需求的断言，所以改为 5 个，并保留“同一行”检查（循环 5 个）。没有放宽或删除断言。改后 10/10 通过（`logs/13-assets-pin-after-fix.txt`）。
- 实现过程中对新测试本身的调整：类型标签定位器原写 `text="焚决"`，在按钮内匹配不到；改为按钮可访问名 `^焚决\s*\d+$`。截图前加了一步关闭提示条，避免遮挡卡片。

## 三、失败测试首跑（改代码前，基点构建产物）

- `node tests/scrolls-browser.mjs`（`logs/01-scrolls-browser-first-fail.txt`）：exit 1。打开 `#scrolls` 后仍是独立的“焚决”页，等待 h1“资产仓库”10 秒超时。
- `node --test tests/digital-world-ui.test.mjs`（`logs/02-…`）：tests 10 / pass 9 / fail 1，新用例失败于 `PAGES.some(id==="scrolls")` 为 true。
- `node tests/notes-rich-browser.mjs`（`logs/03-…`）：exit 1，资产仓库类型组里找不到“焚决”按钮。

## 四、改动文件及 SHA256

| 文件 | 改动前（99f87d4） | 改动后 |
|---|---|---|
| src/Scrolls.jsx | 60bd89cb92745486b0eda3f8492d1cd816fd2775c0eca9dd58c930735874aa70 | fd508f6c9658dfde4a03b8908bc46960852e9ac42141397e98625b150b1868c8 |
| src/scrolls.js | 65086a6e106a4795b5abef3f6c4c564ab02cf4de01bc0359d1346777e7be3bc3 | 2648a1dcbb8ac59f4992e57321e27f39a829a7ed29dfa76f23d39394fa358ad5 |
| src/Assets.jsx | 81ca656f57df3c19cbf81a28c0bc92cd446aa074047c6e44048c67fba0c06139 | 016d17404872589995feccb6e27884c7dae73f4c5a1382dcf567b505dd2b2a91 |
| src/App.jsx | 7dfabf9881e84945bcd857360fb2e012bfd7d2180169d504697314b39d4868f2 | 965e86ca0fea9a15c30677a7d88f88971a3fbbf207143c8c28c8c55b78111921 |
| src/pages.js | 17d38b02de4ab318b8373855d44ff7a28c78832e52d2fc573703054a81611bda | 96eb863dc1a2a124d05a445aa25914384fb3740aa62f7ddc3d418fd2b34622ce |
| src/components.jsx | e0aa87ced2377ee0091577787f9fafe9ebe8a25915577e05c7742d7e3c23a69b | 83437b3c587ea25c6d6cfb6be67936680a739502b38e45bc874951d870ebed22 |
| src/Home.jsx | 689eecb65ff1060f430ca3819d08287905bee238d76ce76be5f1dcd1ec8a734f | a2b4ed81b51ba02c0bbc7ef7673ca186fbb926fe86b8d737e7e17d94a686728a |
| src/WorkspacePages.jsx | 984d6dd09a4f95ae629822bfe57b1c2bbaffff06c7d4f93c6e9740fff1e5a7d4 | 0892ec4cd86cfe52513346ba9a6135dad1c9b5b5711d65de85da65b09fb51f6a |
| src/styles.css | 7b50e71cf8f774058958c6807f7c0c40e354f190f5ead2e078ee21371201cf3c | 96430f0dd97fe3d2e7a9ce58c1758b93f97e66c810c26ffd9d8e50d0cd8b86d8 |
| tests/scrolls-browser.mjs | 649ec46e1f08b84c38e7d4339bdddc9f53d6d5e1a48bb8bbc362dfdaa8d918f6 | d85f5ba4b0ccb34d9e755ae90a7b718fba7445a6c5a7d605861c4cfdc086f2b3 |
| tests/digital-world-ui.test.mjs | 3009a9ecbce03be8f3a97b5819a06d4d856ad5240f258e988efe1a2bd763bd6b | e064c9782a72faaeff4523e98030b06dc0b1d4606e678d11c2a2baa8ff9c141e |
| tests/notes-rich-browser.mjs | 078dd2a5f2bdcf1ddbf90be284a81a1138f9ab364b5df3fa9608067a49637118 | b5fb20c7adf1c8abf02df22cb85df46145080b635991a7c6c3c4550855775777 |
| tests/assets-pin-browser.mjs | ffd57eebc19ce12609fa3b579e368f811914f7cd31f2862de767bd9261589434 | 0bd6420e0e42e6b705a3f703df3a184e50d962d58a09c9aa654b0152d92545a3 |

## 五、验证命令与首次结果

| 命令 | 首次结果 | 对照云端已知失败集（CLOUD-SESSIONS §3.6） |
|---|---|---|
| `npm run build`（`logs/10-build.txt`） | 通过（仍有原有的 chunk 超过 500 kB 提示） | — |
| `node tests/scrolls-browser.mjs`（实现后） | 19 项 PASS，exit 0 | 新测试 |
| `node --test tests/digital-world-ui.test.mjs tests/scrolls-schema.test.mjs`（实现后） | 17/17 pass | — |
| 34 个浏览器脚本各 1 次（`logs/11-browser-scripts.txt`：4 个基础脚本 + 30 个 `*-browser.mjs`） | 28/34 通过。失败：agent-config、rule-templates、rule-templates-fix（配置写入平台保护）、interaction（`2.98936` 期望 3）、search（`palette-cold 625ms > 500ms`）、**assets-pin**（`5 !== 4`，见第二节） | 前 5 项在已知集内，原因与已知描述一致。assets-pin 是本任务改需求引起的**新增失败**，已按新需求更新断言，改后 10/10 通过。最终相对已知集：**增 0、减 0** |
| `timeout 1200 npm test`（`logs/12-npm-test.txt`） | tests 435 / pass 410 / fail 19 / cancelled 1 / skipped 5；`rule-templates.test.mjs` 照旧挂到外层超时（1192 秒）。日志末尾的 `exit=` 行没有写入，退出码未采集到 | 19 个失败与 `cloud-slice-1.3-1.4-logs/04-npm-test.txt` 的失败清单逐条 diff **完全相同**：**增 0、减 0**。tests 434→435、pass 409→410，差额是新增的 digital-world-ui 用例 |
| `node tests/assets-pin-browser.mjs`（改断言后，`logs/13-…`） | 10/10 pass，exit 0 | — |
| `node tests/visual.mjs scrolls-in-assets`（`logs/14-visual.txt`） | `problems: []` | — |

截图（`cloud-scrolls-in-assets-shots/`，4 张）：`scrolls-all-1440.png`（“全部”，含焚决卡与资产卡）、`scrolls-tab-1440.png`（焚决标签，回收区展开）、`scrolls-drawer-1440.png`（卷抽屉）、`scrolls-create-1440.png`（新建资产，五种类型）。

## 六、需要真人确认的视觉点

1. 焚决卡与资产卡混排时是否协调：焚决卡没有版本角标、没有成长期条，正文是“N 条”而不是一句话说明。
2. 侧栏“资产仓库”后面的数字仍只算资产（示例为 6），而“全部”标签算上了卷（8）。是否统一由你决定；本次没有改，以免影响既有导航测试。
3. 焚决卡右上“卷”字的位置（资产卡在这里显示“示例 / 我的”等来源）。
4. 抽屉里“删除卷”用红色的 danger 文字按钮（与资产的“归档资产”一致）；条目区沿用切片 1.3 的样式。
5. “焚决”标签下，回收区（折叠按钮“回收区 N”）在工具栏与列表计数之间的位置。
6. 新建对话框选焚决后的说明文字，以及按钮名“新建卷”。

## 七、未完成项与风险

- 全局搜索（⌘K）仍不搜索焚决卷或条目；本任务只要求页内搜索。“跳转”列表里也不再有“焚决”页面项。
- 条目增删改不更新卷的 `updatedAt`（原有语义，未改），因此在“最近更新”排序下，往卷里加条目不会让卷排到前面。是否改为“条目变化也算更新”待定；若要改，需要动 `scrolls.js` 的写入语义。
- 列表计数文字仍写作“全部资产 · N”，在“焚决”标签下也是如此（与其他类型标签的既有行为一致）。
- 从首页“新建资产”建卷时，抽屉在首页上打开，关闭后仍停留在首页，不会跳转到资产仓库。
- `Scrolls.jsx` 从 `Assets.jsx` 引入 `copy`，`Assets.jsx` 又引入 `ScrollRecycle`，两者形成循环引用。两边都只在渲染时使用对方的导出，构建与服务端渲染测试均正常；以后如在模块顶层使用对方的导出，需要拆开。
- 云端结果不能代替本机回归；合入前请在本机重跑 npm test 与全部浏览器脚本，并核对上表的改动前指纹。

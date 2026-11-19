# Claude · #93 资产仓库改版第一批（2026-11-19）

- 输入状态 / 输出状态：读到 `WB-20261108-699`。本批在独立 worktree 分支 `claude/93-asset-library-v2`（基于 `341cc6e`）走 PR，按 #89 等先例只在 CURRENT 加一节，不改「当前写入者」和状态编号。
- 执行者 / 范围：Claude（会话 local_e3148c06，由 local_d5913f60 交接）。常浩 11-19 在上一会话逐项确认版面 A、卡片定稿第 7 版（预览 https://claude.ai/artifact/LK8oztR5Qw6bBW8skx7ANT ，源文件 `docs/design/asset-library-v2/`，只在主目录）；本会话列出分批计划后回复「按计划开工」。

## 提交

| 提交 | 内容 |
|---|---|
| `fe30dc4` | `src/asset-categories.js`（默认六类、关键词自动归组、待归类、NEW/HOT/UPD/IDLE）；`server/schema.mjs` 校验 `assetCategories` 与资产 `category`（只给 Prompt / Skill）；单元测试 15 条 |
| `8369dc4` | 资产仓库只留三页 + 定稿新卡片：`src/Assets.jsx`、`src/assets-v2.css`、`src/App.jsx`、`src/pages.js`、`src/components.jsx`（导出 `HoloEgg`）、`src/assets-quick-copy.css` 删死规则；新浏览器测试 `tests/assets-v2-browser.mjs`；三份单元测试改写 |
| `1572d8a` | 10 个浏览器测试适配新版；删除焚决三个界面测试 |

## 行为变化（都已在 PR 描述逐项列出）

1. 页签只剩 Prompt / Design / Skill，默认 Prompt；「全部」、工作流、规则、焚决、MCP 页签去掉。这些类型的数据与后端不动；工作流 / 规则 / MCP 的详情和焚决卷仍可从全局搜索打开。
2. 焚决在界面上不能新建卷，回收区也看不到了（卷详情里删除的条目仍进回收区数据，只是没有入口恢复）。`#scrolls` 旧链接落到 Prompt 页。
3. 新建资产只给三种类型；编辑已有的工作流 / 规则 / MCP 不受影响。
4. 置顶 / 删除从悬停才出现改为常驻；复制从图标按钮改为常驻带字按钮（Prompt「复制全文」等）。
5. 卡片去掉编号、进化阶段、标签行、「自建」字样与印章；自建 Skill 保留全息蛋，使用次数保留滚动。
6. Prompt / Skill 多了分类：芯片筛选、卡片右下角改分类（不产生新版本）、编辑器分类下拉。
7. 导航「资产仓库」计数只算三类（原来含工作流与焚决卷）；页面导语改为三类。

## 验证

- `npm run build` 通过。`npm test`：1644 条，1639 过 / 4 失败 / 1 跳过。4 条中 2 条是基线已知失败（生产 factory 接线、中文路径 Swift 编译）；另 2 条（`triage-long-diff` LCS 性能、`controlled-execution` 停止请求）当时 load average 44，单独重跑 15/15 通过。基线 1629 条 1626 过 2 败。
- 浏览器测试（不在 `npm test` 里）：涉及资产页的 48 个 + 新增 1 个，在本分支和基线 `341cc6e`（临时 worktree）各跑一次，结果 `evidence/93-asset-library/compare-final.txt`：基线通过的 13 个本分支全过，新测试通过；其余 35 个在基线上本来就失败（多为 390 宽断言、旧界面文案等历史过期），本批不处理。
- 本机 Playwright 1.62.1 要 chromium 1234，缓存只有 1248：用 `evidence/93-asset-library/pw-exec.mjs` 预加载指定 1248（不改测试文件，沿用 #53 先例）。
- 实测截图：合成数据起临时服务（`evidence/93-asset-library/preview-server.mjs`，临时目录，不碰 5178），1440 宽 2 倍图在 `evidence/93-asset-library/shots/`，与定稿第 7 版对照两轮。只在 Chromium 验过，未在 Safari / 悬浮窗 WKWebView 验。只做了电脑版；未截 390（按全局规则产品界面只做电脑版，常浩 11-19 同意只截 1440）。

## 运行与数据

正式 5178 未发布、未重启；真实数据未读未改。

## 未完成与下一步

1. 常浩审 PR，回复「合并」后合并；发布到 5178 另行安排。
2. 第二批：Skill 页接 my-skills（只读 `links.tsv` + `SKILL.md`），全息蛋按分类色染色，复制调用名。
3. 第三批：Design 页两种形式（设计 Prompt / 设计 Skill 调用指令模板，效果图封面）。
4. 第四批：猛鬼兽批量导入 `create_prompts`。
5. 另开清理票：焚决回收区与卷新建已无界面入口、`ScrollRecycle` 组件已无人引用；工作流 / 规则 / MCP 在别处的引用。分类管理 UI（增删改分类，删分类前先改归属）也未做。

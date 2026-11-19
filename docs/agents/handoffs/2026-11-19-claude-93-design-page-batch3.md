# Claude · #93 资产仓库改版第三批：Design 页两种形式（2026-11-19）

- 输入状态 / 输出状态：读到 `WB-20261108-699`。本批在独立 worktree 分支 `claude/93-design-page`（基于 main `689d16f`）走 PR，按 #94、#95 先例只在 CURRENT 加一节，不改「当前写入者」和状态编号。
- 执行者 / 范围：Claude（会话 local_8883061c）。Design 页样子照定稿第 7 版（`docs/design/asset-library-v2/资产仓库改版-三版.html`「Design 页重做」，只在主目录）。本会话列出 3 个待定点后，收到「按推荐开工」（经 Agent HUD 转来）：① 设计 Skill 不再上传 ZIP，只填名字 + 地址，旧 ZIP 数据可读；② 设计 Prompt 原样复制；③ 每个设计 1 张效果图、可替换、不强制。

## 提交

见 PR 描述（3 个提交：效果图存储接口 / 数据与界面 / 浏览器测试、证据与文档）。原计划 4 个提交，数据层和界面拆开会让中间那个提交构建不过（界面还引用被删的 `designPromptText`），所以合成一个。

## 行为变化（PR 描述逐项列出）

常浩要求的：

1. 设计 Skill 改为只登记 skill 名 + GitHub 地址 + 可选仓库子目录；复制时按定稿模板生成调用指令（先查有没有装 → 没装从 GitHub 装，装不了就读 SKILL.md → 装好按需求调用），按钮叫「复制调用指令」。新建不再能上传 ZIP；旧版 ZIP 设计 Skill 数据照旧可读、复制仍走原来的交付，标「设计 Skill · ZIP 包（旧版）」，编辑时要补地址才能存（存后变成新形态）。
2. 设计 Prompt 复制原样给出正文，按钮从「复制生图提示词」改为「复制全文」，不再包「请使用 ChatGPT 默认的生图能力…」那层；导出 Markdown 同样是原文。
3. 新增效果图：每个设计一张（`design.image`，内容寻址 ID），存在数据目录 `design-images/`（复用随手记图片存储写法），PNG / JPG / WebP、8 MB 以内；可替换、可去掉、不强制。卡片封面就是这张图，没有图显示「还没有效果图」。
4. Design 页顶部加说明、默认展开的固定调用指令模板（以第一条设计 Skill 为例）、「全部 / 设计 Skill / 设计 Prompt」形式筛选。
5. 设计卡片按定稿：上面效果图、右下形式标签（设计 Skill 橙 / 设计 Prompt 粉），下面标题（设计 Skill 用等宽字）、风格说明、GitHub 地址；底部只写来源（「从 GitHub 安装」/「我确认过的」），不再显示日期，也不再显示使用次数数字（次数照记，读屏文字保留，HOT 标识照旧）。
6. 新建 / 编辑对话框：选「设计」后先选形式（新建默认设计 Prompt），「一句话说明」改叫「风格说明」，正文框叫「设计 Prompt 正文」（只在设计 Prompt 时出现）。
7. 详情、历史、版本对比里的「内容形式」改为「设计 Prompt / 设计 Skill / 设计 Skill · ZIP 包（旧版）」；详情多一行安装来源；版本对比能看到 Skill 名称、GitHub 地址、子目录、效果图的变化。

顺手改的：

1. 删除 `designPromptText`（不再有人用）；`server/note-images.mjs` 加 `folder` / `label` 两个参数，随手记行为不变。
2. 删除 `tests/design-browser.mjs`：它测「上传 ZIP 建设计 Skill」和「ChatGPT 生图提示词」两条已去掉的流程，基线上本来就失败；新流程由 `tests/assets-design-browser.mjs` 覆盖，旧 ZIP 交付由 `tests/design-assets.test.mjs` 覆盖。

## 验证

- `npm run build` 通过。`npm test`：1661 条，1656 过 / 4 败 / 1 跳过。4 条中 2 条是基线已知失败（生产 factory 接线、中文路径 Swift 编译）；另 2 条（`triage-long-diff` LCS 性能、`reverse-ai-runner` 超时）单独重跑 10/10 通过（`evidence/93-design-page/rerun-flaky.log`）。基线 `689d16f`：1655 条 1650 过 4 败（`baseline-test.log`）。新增单元测试 `tests/design-page.test.mjs` 6 条。
- 浏览器测试 51 个（去掉已删的 `design-browser`），与第二批最终结果对照 `evidence/93-design-page/compare-final.txt`：第二批通过的 16 个全过，新测试 `assets-design-browser` 通过，没有新增失败。并发跑时 5 个失败：3 个是测试跑到一半才改完的旧断言，2 个（`partner`、`transfer-reduce`）是动画类偶发；5 个单独重跑全过（`browser-rerun/`）。

- 截图：合成数据起临时服务（`evidence/93-design-page/preview-server.mjs`，5195 端口，已关），效果图是代码画的色块，GitHub 地址是 `example-org`；1440 宽 2 倍图在 `evidence/93-design-page/shots/`，与定稿第 4 轮 Design 截图对照两轮，改了「模板默认展开」「底部不带日期」「先选形式再填字段」三处。只做了电脑版，只在 Chromium 验过。

## 运行与数据

正式 5178 未发布、未重启；真实数据只读统计过一次（Design 资产 1 条，设计 Prompt，没有 ZIP 形态），未改。

## 未完成与下一步

1. 常浩审 PR，回复「合并」后合并；发布到 5178 另行安排。
2. 改版包（`src/evolution.js`）对设计资产仍写「默认使用 ChatGPT 的生图能力 / 仅优化生图要求正文」，对设计 Skill 不太贴切，本批只改了形式名称，没动这段说明。
3. 第四批：猛鬼兽批量导入 `create_prompts`。

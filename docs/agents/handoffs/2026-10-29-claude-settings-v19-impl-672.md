# Claude 672：设置页 UI v19「3-1 一行一控件」落代码完成（接 651）

时间：开工 2026-10-29 23:15 CST · 输入状态 WB-20261024-651 · 输出状态 WB-20261029-672
执行者：Claude（会话 local_8d9a380a，由逆向孵蛋会话派出）· 用户 10-29「按推荐开工」：开 worktree 复制 651 改动；REA 放数据行下方的工具行；分两个 PR（本 PR 只含设置页，REA 挪进设置 #31 另开）
方案：[06-settings-impl-plan.md](../../design/ui-v19/briefs/06-settings-impl-plan.md) · 简报 [06-settings.md](../../design/ui-v19/briefs/06-settings.md) · 上一棒 [651 交接](2026-10-24-claude-settings-v19-impl-651-wip.md)

## 怎么做的

- 651 的改动原样从主目录复制到 worktree `.claude/worktrees/settings-v19`（分支 `claude/settings-v19-651`，基于 main `eb97313`）继续做；**主目录里 651 的未提交副本没动**，PR 合并后经用户同意再把主目录这几份文件还原。
- 第 2 批 样式：`src/settings-v16.css` 末尾写 v19 3-1 新样式（自检屏、标记色、开关、数据行、液晶计数、结论；390 每行两层、数据行折行、恢复按钮占整行），全部用全站令牌；「?」用全站统一的 28px 圈 + 44px 命中区。
- 第 3 批 动效（`src/SettingsV16.jsx`，按帧，无 CSS transition）：开页逐行跑出（点点点三帧，每帧 70ms）；计数 00 → 实数按四帧揭开；行标记变化时 原标记 → ▒ → ░ → 新标记；开关拨片三帧；下载按钮「打包中 ▮▯▯▯」四格循环。减少动态效果时全部直接到位。计数改用 `LcdText` 点阵；页头加「读取于 MM-DD HH:mm · REV」。
- 补一条行为保留：「资产交付目标」抽屉有未保存的目标编辑时不能关（旧版是不能切分类），提示「请先完成或取消目标编辑，再关闭。」。

## 偏离方案 / 简报

1. 「旧版浏览器数据」不在开页检测（检测要打开 IndexedDB，会新建空库），入口留在「数据与备份」抽屉里（651 已记）。
2. 390 抽屉沿用全站全屏抽屉，没做「从底部升起」：要改全站共用的 Dialog，超出「只改设置页」。
3. 授权抽屉打开后读历史期间会忽略 Esc 和「管理凭据… / 查看服务状态…」（现版 `CapabilitySettings` 的忙标记），读完即可；没改。
4. 方案第 3 节「恢复记录或目录身份无法核验时，完整备份行写这句并标 !」**没接**：这条错误只在「数据与备份」抽屉的恢复流程里产生，抽屉里本身会显示；要回传到自检行得跨组件加信号，留作后续。
5. 简报「已开启计数含 AI HOT」：3-1 稿只有「要处理 / 要看一眼 / 正常」三个液晶、没有「已开启」计数，● 按稿算进「正常」；AI HOT 行按 ● 标出。

## 审查（/code-review，两轴子代理）

- 规格轴采纳并已改：申请记录读取失败时能力行与知识开放标 [?]（原来被当成没异常显示 ✓）；使用 / 申请记录还在读时标「读取中」不算正常；能力同级顺序改为 Vault / Agent / 模型 / 常驻；下载恢复包成功后这一行写「刚刚下载过恢复包 · 请确认已存到磁盘」。补单测 1 条（8/8）。另 5 个仍点旧分类的回归改了入口（`browser.mjs`、`ui-dispatch151-data`、`knowledge-compilation`、`ui-continuous362-motion`、`ui-v14-batch3`），这 5 条改前改后都卡在进设置页之前的同一处。
- 规范轴采纳并已改：删掉 651 删旧样式时留下的无头 `from{}/to{}` 和 `}@media` 粘行。未采纳：rgba 颜色与非 4 倍数间距（照稿取值；rgba 在已合并的 v19 样式里普遍使用，令牌测试只拦 hex）；若干重复 / 命名类判断题。

## 测试

- 单测：`node --test tests/settings-selftest.test.mjs tests/settings-v16.test.mjs` 8/8；`npm test` 1614 条 1611 过，失败 3 条：wiki-local、生产 factory 接线（已知基线），以及「本地 HTTP 供应当前构建」（新 worktree 没有 `dist/`；`npm run build` 后单跑该文件 12/12）。
- 浏览器回归（构建到临时目录，`WORKBENCH_TEST_STATIC_ROOT` 指过去，没写 `dist/`；合成夹具，不碰 `data/` 与 5178）。新增 `tests/settings-entry.mjs`：旧分类名 → 新抽屉入口、模型 / 常驻二级面板入口。
  - 改后通过：`settings-v16-browser`（重写：10 行、5 开关、6 宽 geometry/axe/44px、键盘开关 → 抽屉 → Esc 回焦、四项开关只开对应预览且不确认不改状态、管理凭据 / 查看服务状态 / 网络 / 交付 / 数据抽屉入口、下载恢复包 = 同一 POST 后重读 `/storage/status` 且行翻 ✓、「知道了」按编号记住新编号再亮、逐行动效与重新自检、项目扫描两处入口同源与阈值持久化 / 重基线 / 双击）、`settings-targets`、`settings-knowledge`、`full-backup`、`restore-preview-layout`、`skill-copies`、`migration`、`ui-dispatch151-settings`、`ui-dispatch151-daemon`、`ui-dispatch155-daemon`；`batch-b` 设置相关 7 段全过，之后在「首次初始化等待基线后可编辑」下一步卡住不退出，改前构建上卡在同一步。
  - 改前（main `eb97313` 构建）就失败、卡点不在设置页，改后卡在同一处：`seven-sections`（projects 390 溢出）、`web-draft`（第 52 行随手记）、`inbox-v16`（等 `.topbar-inbox`）、`audit-navigation`（等 `.agent-scroll-cue`）、`ui-user-258`（第 100 行等 `.night-v16 .nv-help`；设置段已过）、`ui-dispatch151-model`（书架一步；设置入口已改通）、`aihot-learning`。
  - `project-settings-rebase-browser` 不进设置页，用的是项目空间已撤掉的「项目空间设置」按钮，改前同样卡住；本轮没改。
- 对比图（改前 / 改后 / 稿）：`docs/design/ui-v19/shots/设置-v19-落代码对比-1440.png`、`设置-v19-落代码对比-390.png`。

## 未完成与下一步

- 等用户看对比图、review，PR 由用户说「合并」才合并；不发布 5178。
- 合并后：主目录里 651 的未提交副本（`src/SettingsV16.jsx`、`src/settings-v16.css`、`src/StoragePanel.jsx`、`CURRENT.md`、`docs/design/ui-v19/README.md`、`build/make.py` 与未跟踪稿件）经用户同意后还原 / 删除，以 main 为准。
- 唯一下一步：逆向孵蛋 3C 第 5 批 #31（`ReaUpdate` 挪进设置数据行下方的「工具」行，撤逆向页页尾入口，改两个 rea-update 浏览器测试），基于本 PR 合并后的 main。

权限：只读合成夹具；未读真实 `data/`、Vault、Agent 会话；未碰正式 5178。本轮新坑：无（LESSONS 未新增）。

# Claude 651：设置页 UI v19「3-1 一行一控件」落代码（进行中，上下文到 50% 交接）

时间：开工 2026-10-24 12:50 CST，暂停 13:30 CST · 状态 WB-20261024-651 · 认领保留给接手会话
方案：[docs/design/ui-v19/briefs/06-settings-impl-plan.md](../../design/ui-v19/briefs/06-settings-impl-plan.md)（用户 10-24 确认第 7 节：Claude 直接做、知识开放抽屉三个入口）· 简报 [06-settings.md](../../design/ui-v19/briefs/06-settings.md) · 稿 [设置-3-1-一行一控件.html](../../design/ui-v19/设置-3-1-一行一控件.html)（同文件含 390）

## 已完成（未提交）

- 第 1 批（规则与结构）做完：
  - 新增 `src/settings-selftest.js`：`selfTestRows / selfTestTally / readAcks / writeAck / MARK_GLYPH`，规则照方案第 3 节；新增 `tests/settings-selftest.test.mjs`（4 条）。`node --test tests/settings-selftest.test.mjs tests/settings-v16.test.mjs` 7 / 7 通过。
  - `src/StoragePanel.jsx`：只抽出 `downloadFullBackup / fullBackupNotice / exportMergeJson / MERGE_JSON_NOTICE`，面板自己改调这几个，顺序（下载 → 重读 → 提示）不变。
  - `src/SettingsV16.jsx` 重写主体（原文件备份在会话临时目录，可用 `git diff src/SettingsV16.jsx` 对照）：一行页头（设置 SELF-TEST · REV · ? · 重新自检）+ 自检清单 `SelfTestLine` + 数据行 + 计数；行操作全部进现版抽屉（能力开关 → `CapabilitySettings` 并选中该项，模型 / 常驻服务抽屉底部「管理凭据… / 查看服务状态…」；知识开放「管理」→ 新抽屉三个入口进现版 `SourcePolicy` / `ProfilePanel`；网络 → `AiHotSettings`；日历 → 现版权限；扫描 → `ProjectSettings`；添加目标 → 新抽屉放现版 `AgentTargets`；导入 / 恢复 → 新抽屉放现版 `StoragePanel compact`）。下载恢复包、导出 JSON、在访达中显示直接调用同一请求。`useSelfTestBoot` 目前是静态占位（第 3 批换成按帧）。`npx vite build` 通过。
- 第 2 批只做了一半：`src/settings-v16.css` 已删掉旧布局专用规则（st-nav / st-tr / st-th / st-act / st-last / st-layout / st-content / settings-scroll* / st-h / st-step / st-paths / st-chip / st-value / st-danger，469 → 196 行），抽屉仍在用的 st-row / st-group / st-storage / st-panel / st-dot 等保留。**新结构的样式还没写**，页面现在能用但没有自检清单的样式。

## 剩余计划

1. 第 2 批：在 `src/settings-v16.css` 末尾写新样式（类名：`.st-post .st-bar / .st-en / .st-grow / .st-readat`、`.st-panel-post / .st-post-head / .st-post-id`、`.st-lines / .st-line.{bad,warn,unknown,net,ok,idle,loading}.{wait,typing,done} / .st-mk / .st-name / .st-dots / .st-res / .st-ctl`、`.st-switch / .st-track / .st-knob`（on 态）、`.st-extra / .st-lbl / .st-danger`（恢复按钮红边）、`.st-post-foot.{has-bad,has-warn,clear} / .st-tally / .st-lcd / .st-verdict`、`.st-acked / .st-more`）；照稿 `docs/design/ui-v19/v19-settings.css` 的「三的简化」与「3-1 · 390」两段换成全站令牌（`src/tokens.css`），390 在 `@media (max-width:760px)` 里做两层行；控件 ≥44px。
2. 第 3 批：`useSelfTestBoot` 换成按帧（开页逐行三帧点点点、计数 00 翻页）；行标记变化时 ✗/! → ▒ → ░ → 新标记；开关拨片三帧；下载按钮四格进度；减少动态效果直接到位，不写 CSS transition（参照稿 `docs/design/ui-v19/v19-settings.js` 的 boot / flip / slide）。
3. 第 4 批：改回归 `tests/settings-v16-browser.mjs`（改前通过；现在断言五分类 radio、`[data-capability]` 6 个、「调整提醒」按钮，要改成自检行与「调整」抽屉，行为断言不放松）、`tests/batch-b-browser.mjs`（改前通过，引用「数据与备份 / 项目设置」分区）、`tests/project-settings-rebase-browser.mjs`（改前通过）；新增方案第 5 节断言；`npm test`、`npm run build`；1440 / 390 截图与稿对照（改前 / 改后 / 稿）；写交接、更新 CURRENT、释放认领。
4. 给用户看对比图后再提交（提交只带本轮文件）。

## 基线与证据

- 改前代码构建到会话临时目录后跑的基线（日志 `docs/agents/handoffs/evidence-2026-10-24-claude-settings-v19-651/基线-*.log`，不进仓库）：`settings-v16-browser`、`batch-b-browser`、`project-settings-rebase-browser` 通过；`ui-v14-batch3-browser`（等 `.calendar-v14`）、`ui-user-258-browser`（等 `.night-v16 .nv-help`）、`ui-refine351-browser`（等 `.hx-mod-c`）、`ui-continuous362-motion-browser`（等 `.topbar-inbox`）**改前就失败**，卡在已撤下的其他页面，不是本轮造成的。
- 浏览器回归用 `WORKBENCH_TEST_STATIC_ROOT=<构建目录>` 指定构建产物；`dist/` 是 10:13 的旧构建，跑前先构建。

## 注意

- 偏离简报一处：「旧版浏览器数据」不在开页时检测（检测要打开 IndexedDB，会新建空库），入口留在「数据与备份」抽屉里；交接要写明。
- 不改服务端、不发布、不碰 `data/` 与正式 5178；正式读数只发 GET。
- 时间：开工 12:50 · 测试：单测 7/7、构建通过，浏览器回归未跑新代码 · 本轮新坑：无

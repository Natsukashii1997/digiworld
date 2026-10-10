# Claude｜认领 164 中断恢复说明（2026-10-05，切换会话前写）

```text
状态：WB-20261004-164，写入者 Claude（认领未释放，工作未收尾）
范围：按用户确认的 UI v15 视觉稿落地“随手记”“日历”两页；其他板块不改
代码：已全部写完并构建（dist 已是最终版本）；只差最终回归确认、前后对比图、交接与释放
```

## 已完成的改动（均未提交）

| 文件 | 内容 |
|---|---|
| `src/Calendar.jsx` | 页头只留眉题（`PageHeading titleHidden`，h1 用 `.sr-only`）；大日期 + `WEEK n · 范围`；周/今天、上下翻、刷新（带文字）、青蓝主按钮；图例一行；桌面周视图表头改为“选择日历日期”单选组；新增“全天”行（`cal-allday-chip`，tabIndex -1，名称“全天行 …”）；删除轴下整周清单，改为右栏 `cal-side`：选中这一天的 `DayEvents` + todo；只读会议点击后选中那天并聚焦右栏条目（`focusRequest`）；色块“标题 + 时间”两段测量，时间是标题的兄弟元素；今天列 `today` 类；todo“添加到提醒事项”改为次要按钮 |
| `src/calendar-v14.css` | v15 样式层（屏幕材质周轴、青蓝今天圆、全天行、右栏、todo 收紧、窄屏） |
| `src/WorkspacePages.jsx` | 随手记：`Bounds` 边界标签；速记屏工具 + 语法提示 + 按钮一行；“随手记筛选”单选（全部/未炼/已炼/有任务）；便签动作改图标：编辑、复制、“更多操作”菜单（写入 Obsidian、炼入焚决），按下“更多”时记下选区；Obsidian 对话框提升到卡片层（`VaultWriteDialog`），关闭回焦到“更多”；已炼状态在页脚（保留 `note-refined` 类与“已炼 · 卷名”） |
| `src/notes-v14.css` | 随手记 v15 样式（青蓝主按钮、便签发光色条、菜单）；颜色只用既有令牌与既有字色值 |
| `src/components.jsx` | 新增 `Bounds`；`PageHeading` 新增可选 `titleHidden`（默认不变） |
| `src/ui-v14.css` | `.page-bounds` 共享样式 |
| `src/pages.js` | 随手记导语改短（授权说明移到边界标签） |

## 测试断言调整（需求变化，等价或更严）

1. `tests/digital-world-ui.test.mjs`：随手记导语断言改为新短导语；“写入 Obsidian 需授权并预览”改在 notes-rich 浏览器测试里断言边界标签。
2. `tests/notes-rich-browser.mjs`：炼入焚决、写入 Obsidian 在“更多”菜单里——先点“更多”（44px 检查）再点；新增 Esc 收起并回焦“更多”；已炼后打开菜单确认没有炼入项；逐张展开“更多”确认各有独立 Vault 入口且零请求；该步前整页重载（上一步资产仓库的卷详情抽屉还开着）。
3. `tests/ui-dispatch151-vault-browser.mjs`：`openEntry` = 先点“更多”再点入口；关闭回焦断言改为回到“更多”。（曾误把 openEntry 内部也替换成自调用导致卡死，已修，单独重跑通过。）

前后 SHA256：见 `evidence-2026-10-04-claude-164/tests-before.sha256`（测试前像）；源码前像取 Codex 157 最终清单与 `evidence-2026-10-04-claude-160/after.sha256`。

## 验证进度

- 第一、二轮全量的失败与日志保留在 `evidence-2026-10-04-claude-164/rerun-first/`、`rerun-second/`（均已在后续修复：日历 sr-only 标题被几何检查判裁切、notes-rich 被遗留抽屉遮挡、vault 测试自调用卡死、批次3 断言标题元素只含标题）。
- **最终轮已完成且全绿**（切换会话前跑完）：`evidence-2026-10-04-claude-164/rerun/results.tsv` 末尾有 `DONE`；npm test **788/788**，浏览器脚本逐个 **69/69**，`node tests/visual.mjs claude-164` **problems=[]**。代码之后未再改动；新会话只需核对 dist 与源码未变，无需重跑。

## 还没做

1. ~~确认最终轮全绿~~ 已完成（见上）。
2. 前后对比图：用 `evidence-2026-10-04-claude-164/shoot.mjs`（同一合成数据）分别对改前构建与当前构建截图。改前构建在 Codex 回档 `/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/rollback-WB-20261004-157/dist.tar.gz`（不含 160 侧栏改动，需在交接中注明）；用环境变量 `GUIJI_TEST_DIST=<解包后的 dist 目录>` 指给隔离运行器，标签参数传 `before`。
3. 写交接 `2026-10-05-claude-165.md`，更新 CURRENT 为 165、写入者“无”，唯一下一步：用户在 5178 刷新查看随手记与日历并验收。
4. 5178 不需重启（只改前端，dist 已构建）；不提交、不推送。

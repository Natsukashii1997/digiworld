# Claude｜项目空间第二版实现（电路卡带 7E，2026-10-29）

```text
输入状态 / 输出状态：main c488ee3（CURRENT 仍被 651 认领，本轮不写 CURRENT）/ 分支 claude/8-projects-space-v2
执行者 / 本轮范围：Claude；方案第 1–3 批（数据源、实战采集、页面），不含设置页（用户 10-29 定）
依据：docs/design/ui-v19/briefs/04-projects-space-v2.md、04-projects-space-v2-impl-plan.md、项目空间-7E-卡带电路.html
issue：#8（第 1 批）、#9（第 2 批）、#10（第 3 批），父任务 #7
```

## 一、改了什么

**第 1 批 · 数据源（#8）**
- `server/project-roster.mjs`（新）：只读数字分身名册（默认 `~/Documents/ChatGPT/个人/work/digital-twin/projects.json`，可注入）；项目卡三段摘要（是什么 / 目标 / 不做）经 `vault` 能力门禁与知识源访问策略读取，`vault` 没开时不读。
- `server/project-status.mjs`：新增 `parseCurrentTop`（顶节标题、日期、作者、下一步；头表下一步与更新时间）。旧函数不变。
- `server/project-github.mjs`：issue 查询加 `labels` 字段并输出标签名；新增 `issueBreakdown`。`gh` 只读白名单不变，不用 `--label`。旧面板多了 `labels` 一个字段，其余形状不变。
- `server/savepoint-git.mjs`：抽出 `unpushedCount`（存档点与项目空间共用，没有上游返回 null）。
- `server/project-activity.mjs`：抽出 `commitTimes`（只数 Git 提交），旧活动口径不变。
- `server/projects-space.mjs`（新）：`GET /api/projects-space` 聚合；`POST /api/projects-space/pin` 置顶最多 3 个（只数名册里的项目），带 revision 检查、写后回读。
- `src/project-hues.js`（新）：代表色、代号、副标题表；没登记的项目代号取名字（或 id）前两个字母，颜色按 id 稳定取。

**第 2 批 · 实战采集（#9）**
- `server/skill-usage.mjs`（新）：Claude Code 的 `Skill` 调用与斜杠命令（排除内置命令，插件前缀合并）、Codex 用户消息里的 `$已装技能`（读技能文件不算）；按会话目录归名册项目（仓库内 worktree 按路径，外置 worktree 按仓库名）；缓存 `skill-usage.json` 只存技能名、来源、次数、最近日期、会话数。
- 接口 `GET /api/projects-space/skill-usage`、`POST /api/projects-space/skill-usage/refresh`。
- **开关这一版恒为关**：`capability-settings` 的授权记录按固定 5 项严格校验，直接加 `skillUsage` 会让已有授权记录校验失败，所以没加；等设置页那一批连同授权记录迁移一起接。

**第 3 批 · 页面（#10）**
- `src/ProjectsSpace.jsx` + `src/projects-space.css`（新）：电路卡带架 + 档案屏（档案头 / 读数条 / 现在·下一步 / 30 天提交图 / 实战）+ 页脚「复制接手口令」。样式从 7E 稿 g7.css 原样移植，只保留 7E 用到的规则；按钮与图标键放大到 44px；标题层级改为 h2/h3（axe heading-order）。
- `src/App.jsx`：项目空间挂新页；旧页只在地址带 `?projects-v16` 时挂上（供旧回归用），旧文件不删。
- `src/ProjectsV16.jsx`：只给 `ProjectLaunch` 加 `export`，口令复制的核对与留痕原样复用。
- `src/HomeOverviewContent.jsx`：世界总览项目块文案「在推进」→「已置顶」，空态改「还没有置顶的项目，到项目空间置顶（最多 3 个）」。
- 「详情」抽屉：用现有的 `CurrentBlock`、`SafetyBlock`、`ProjectLocations`、`ProjectContext`、`ProjectRules` 重新拼，没有拆旧页 1336 行里的抽屉。
- 实战段未开启时只显示一行「读取会话里的技能使用：未开启」和「去设置」；页头技能数与卡带技能数显示 `—`。

## 二、没做 / 与方案的偏差

- **收录进资产仓库（adopt-skill 预览 / 确认）没做**：实战开关这一版恒为关，收录入口不可达；等设置页接开关时一起做。
- 设置页（名册路径、实战开关）按用户决定不动。
- 置顶上限只数名册里的项目；名册外的旧「在推进」项目不受影响，也无法在新页取消。

## 三、测试

- `npm test`（worktree 在 `.claude/worktrees/projects-space-v2`）：`ℹ tests 1580` / `ℹ pass 1576` / `ℹ fail 4`。
  - 「保存的候选能被既有 wiki-local 解析…」：依赖仓库外 `../wiki-local`，基线同样失败。
  - 「生产factory具体接线…」：worktree 在隐藏目录 `.claude/` 下导致；基线 c488ee3 放在同样位置也失败，放在普通目录通过。
  - 「unknown process after restart…」「关闭覆盖启动doctor等待…」：全量并发时偶发，单独各重跑两次都通过。
- 新增：`tests/projects-space.test.mjs` 13 条、`tests/skill-usage.test.mjs` 6 条全过；`tests/design-tokens.test.mjs` 4 条全过（新样式只用令牌）。
- 浏览器（`npm run build` 后逐个跑）：
  - `tests/projects-space-browser.mjs`（新）7 项 PASS：选卡带 / 方向键、置顶上限与回读、实战未开启、名册读不到、1440 与 390 无横向溢出、控件 ≥ 44px、axe 0、减少动态效果无流光不逐字。
  - 旧页回归改用 `?projects-v16` 打开，断言不变：`projects-v16-browser`、`ui-v14-projects-browser`、`project-pending-refresh-browser`、`projects-freshness-browser` 全 PASS。
  - `project-status-browser`、`projects-brief-browser`：等 `.page-heading` 超时；基线 c488ee3 上同样超时（原有问题，未修）。
- 截图（合成数据，本地不进仓库）：`work/projects-space-v2/改前-旧页-1440.png`、`改前-旧页-390.png`、`改后-新页-1440.png`、`改后-新页-390.png`。
- 服务是否采用：未发布，正式 5178 不变。真实数据：未读、未写。用户验收：未做。

## 四、注意

- 测试只用合成名册、合成 CURRENT、合成会话与注入的 gh 桩；`tests/fixture.mjs` 默认把名册指向临时目录里不存在的文件，所有浏览器测试都不会读真实名册。
- 在 `.claude/worktrees/` 下跑全量测试时，「生产factory具体接线…」一条会失败；基线 c488ee3 放在同样位置也失败（隐藏目录导致），与本次改动无关。

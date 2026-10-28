# 落代码方案 · 项目空间（第二版 · 电路卡带 7E）

状态：**用户 2026-10-29 已确认**（原话「都按推荐」）：Claude 写派单并验收、Codex 实现、你终验；先开第 1 批；简报 §9 四条按推荐。第 3 批等 651 交回后再开。
依据：页面简报 [04-projects-space-v2.md](04-projects-space-v2.md)；视觉稿 [项目空间-7E-卡带电路.html](../项目空间-7E-卡带电路.html)；[定位与重构方案](../../../product/2026-10-28-项目空间定位与重构方案.md) §3、§6、§8。
现状：取自 10-29 对代码的只读梳理，下文行号以那时为准。

## 1. 范围

**做**：
- 项目空间这一页换成「电路卡带 + 档案屏」。
- 后端补齐页面要的数：名册、项目卡摘要、CURRENT 现在 / 下一步、issue 标签拆分、未推送数、全名册 30 天提交。
- 新增「实战」采集，默认关闭，由常浩在设置里开启。
- 收录进资产仓库：先预览，再确认，写后回读。
- 设置里加名册路径和实战开关。
- 世界总览改读置顶。

**不做**：
- 不删旧功能的代码：接力口令、收件、装备、手填下一步、项目抽屉，只从这页撤下（方案 K3）。
- 不改数字分身的名册文件。
- 不改全站令牌，不新增依赖。
- 不发布、不推送。每批提交前给你看对比图和测试结果。

## 2. 设计元素 → 现版代码 → 怎么改

| 稿里的元素 | 现版代码 | 改法 |
|---|---|---|
| 项目清单 | 扫描结果 `state.connections.projects`（`server/project-scan.mjs`、`discovery.mjs`）；这页进来没扫过会自动扫（`ProjectsV16.jsx:694/707`） | 新模块 `server/project-roster.mjs`：只读名册 `projects.json`，按 `path` 和 `connections.projects` 对上（对上的沿用其 id、`active`、GitHub 绑定）。这页不再触发扫描；扫描只在「设置 · 目录与扫描」（`ProjectSettings` 已挂在设置页） |
| 置顶 | 「在推进」= `connections.projects[].active`，由 `/project-status/mark` 写（带 revision 校验） | **沿用同一字段**，界面文案改为「置顶」，最多 3 个（服务端也校验）。世界总览 `HomeOverviewContent.jsx:153` 读的就是它，只改文案（方案 K8） |
| 代表色与代号 | 无 | 数码世界这边一张表 `src/project-hues.js`（按名册 id）；没登记的项目按 id 稳定取色，代号取名字前两个字母（简报 §9 待确认 1） |
| 档案头（一句话 / 目标 / 不做） | 无 | `project-roster.mjs` 读名册 `card` 指向的 Vault 项目卡，只取三段摘要。走现有 `knowledge-access.mjs` 和 `vault` 能力门禁；`vault` 没开时只显示名字和路径（方案 K6） |
| 现在 / 下一步 | `server/project-status.mjs`：头表四字段（`parseCurrentStatus:60`）+ 第一个 `##` 段（`parseCurrentOutline:99`） | 加「顶节」解析：顶节标题、日期、作者。用名册里 7 个仓库的 CURRENT 格式做合成样例。下一步按简报 §4.2 的顺序取，过期规则同简报 |
| issue 拆分 · PR | `server/project-github.mjs:248` 的 issue 字段不含 `labels`；`readOnlyGhArgs:57` 是只读白名单 | issue 查询加 `labels` 字段（不用 `--label` 过滤，白名单不放宽），在本地按 `ready-for-agent / ready-for-human / needs-triage` 计数。沿用 10 分钟缓存 |
| 未推送提交 | 只有 `server/savepoints.mjs:390` 的 `rev-list @{upstream}..HEAD`（白名单在 `savepoint-git.mjs:66`） | 抽成共用函数，项目状态里用；没有上游时返回 `null`（显示 `—`） |
| 30 天提交 | `server/project-activity.mjs:56`：只算在推进的项目，还把 CURRENT 修改算 1 次 | 新增「只数 Git 提交」的口径，覆盖整个名册（方案：活动只留 Git）。旧口径留给旧组件 |
| 实战 | 无。`server/relay-sessions.mjs:216` 会读会话目录，但只在点击时读、只放内存 | 新模块 `server/skill-usage.mjs`（见第 4 节第 2 批） |
| 实战开关 | `server/capability-settings.mjs:7` 的固定列表 `night/model/agent/vault/daemon`，带预览 → 确认、日志和 `assertEnabled` | 加一项 `skillUsage`，复用预览 → 确认。设置页加一行（`.st-switch`）。预览时显示近 30 天会统计到的会话数和技能数 |
| 收录 | 新建资产走整个工作台保存（`Assets.jsx:907` → `PUT /api/workspace`），没有服务端预览 | 新接口 `/api/projects-space/adopt-skill/{preview,confirm}`：预览返回将新建的 Skill 卡；确认时按 revision 写入并回读，冲突就不写、提示重新预览 |
| 页面 | `src/ProjectsV16.jsx`（1336 行）+ `projects-v16.css`（399 行） | 新文件 `src/ProjectsSpace.jsx` + `src/projects-space.css`，在 `App.jsx` 里替换 `ProjectsV16` 的挂载。旧文件保留，不删 |
| 页脚「复制接手口令」 | `ProjectLaunch`（`ProjectsV16.jsx:312`）的口令与留痕逻辑 | 抽出复制函数复用，**核对、留痕不变**，只换入口 |
| 详情 | 项目抽屉（`ProjectsV16.jsx:1134`） | 抽成独立组件后原样复用 |

**聚合接口**：新增 `GET /api/projects-space`。一次返回名册、置顶、每个项目的读数、现在 / 下一步、30 天提交和实战摘要。GitHub 和实战各自的读取失败按项目单独标记，不让整页失败。`POST /api/projects-space/pin` 包装现有 `mark`。

## 3. 必须保留的规矩

1. **写入**都要有 revision 冲突检查、先预览后确认、写后回读、结果不明时先查再重试（`AGENTS.md:16`）。这页的写入只有置顶和收录两处。
2. **真源不复制**：CURRENT、Vault 项目卡、名册都只读，不另存第二份（`AGENTS.md:15`）。实战只存统计结果（技能名、次数、最近日期、项目），不存会话内容和会话路径。
3. **开发时不读真实会话和真实 Vault**（`AGENTS.md:17`）。测试只用合成名册、合成 CURRENT、合成会话记录和注入的适配器；临时数据目录本身不算隔离。
4. **实战开关关着时**，后端不碰会话目录。有测试证明这一点。
5. **GitHub 只读**：白名单不放宽。读取失败如实显示“读取失败”，不当成 0。

## 4. 分批（每批开工前等你确认）

| 批 | 内容 | 验收 |
|---|---|---|
| 1 · 数据源 | `project-roster.mjs`（名册 + 项目卡摘要 + 置顶对齐）；CURRENT 顶节解析；issue 标签拆分；未推送数；全名册 30 天提交；`GET /api/projects-space`、`POST /pin`（最多 3）；`project-hues.js` | 单元与接口测试覆盖：7 种 CURRENT 写法、名册读不到、目录不存在、没有远端、GitHub 失败、`vault` 未开、置顶超限。旧接口照常 |
| 2 · 实战采集 | `skill-usage.mjs`：Claude Code 统计 `Skill` 工具调用和斜杠命令（去掉内置命令，插件前缀合并）；Codex 统计用户消息里写的 `$技能名`（只认本机已装技能，读技能文件不计）。按会话目录归到名册项目（worktree 按仓库名）。结果缓存到 `data/skill-usage.json`，只存统计值。开关 `skillUsage`（预览 → 确认）。接口 `GET /api/projects-space/skill-usage`、`POST /api/projects-space/skill-usage/refresh` | 合成会话测试：插件前缀合并、worktree 归属、内置命令排除、Codex 读技能文件不计、开关关着时不读目录（用打桩的文件系统断言）、缓存里没有正文字段 |
| 3 · 页面 | `ProjectsSpace.jsx` 写卡带架、档案屏、提交图、实战、页脚；收录的预览和确认；设置页加名册路径和实战开关；世界总览文案改为「置顶」；动效按帧（卡带压下、走线流光一次、扫描线、液晶滚动、逐字、像素格），减少动态效果时直接到位 | 1440 / 390 截图与稿逐项对照；无横向溢出；控件不小于 44px；axe 0；旧项目页回归按新页面改写后全过 |
| 4 · 发布 | 按既有流程发布到 5178 并回读；实战开关由你在场时开启 | 需你授权 |

## 5. 测试

- **要改写的现有回归**：`tests/projects-v16-browser.mjs`（及 `projects-v16-fixture.mjs`）、`ui-v14-projects-browser.mjs`、`project-status-browser.mjs`、`project-pending-refresh-browser.mjs`、`projects-freshness-browser.mjs`、`projects-brief-browser.mjs`。改写前逐个列出哪些断言属于已撤下的功能（接力、收件、装备）。这些断言挪到旧组件自己的测试里，不直接删。
- **不动**：`project-catalog*`、`project-identity`、`project-settings-rebase` 测的是设置或抽屉里的功能，应该照常通过。
- **新增**：
  - 单元测试：`project-roster`、`skill-usage`、CURRENT 顶节解析、issue 拆分。
  - 接口测试：`projects-space`、`pin`、`adopt-skill`。
  - 浏览器测试：选卡带、置顶上限、收录预览和确认、实战未开启、390 无溢出。
- **跑法**：
  - `npm test`（`node --test tests/*.test.mjs`）。
  - 浏览器脚本在 `npm run build` 后逐个跑：`tests/fixture.mjs` 会建临时目录并注入适配器，`WORKBENCH_DATA_DIR` 指向临时目录。
  - 不碰正式 5178 和 `data/`。

## 6. 风险与先后

1. **设置页撞车**：主工作区有设置页 v19（651）未提交的改动，涉及 `src/SettingsV16.jsx`、`settings-v16.css`、`StoragePanel.jsx`，CURRENT 也被它认领。第 3 批要改设置页，**必须等 651 合并、交回认领后再开**。第 1、2 批不碰设置页，可以先做。
2. **开发流程**：按 `AGENTS.md:23` 走。开工前先开 GitHub issue，每批一张；在 worktree 里起分支 `<作者>/<issue 号>-<名字>`；提 PR、代码审查；你说「合并」才合并。
3. **CURRENT 头表**：数码世界自己的头表停在 651 的认领，和已发布到 671 的实际不一致。等 651 交回时一起校正，这批不动。

## 7. 用户决定（2026-10-29，都按推荐）

1. **谁来实现**：
   - **推荐**：按 `COLLABORATION.md` §6，Claude 写派单并验收，Codex 实现，你终验。
   - 另一个选项：你直接授权 Claude 前后端都做。
2. **从哪批开始**：
   - **推荐**：先开第 1 批（数据源）。它不碰设置页，和 651 不冲突。
   - 第 2 批等你先确认简报 §9 第 2 条（实战开关的文案与范围）。
3. **简报 §9 的四条待确认**：代表色放哪、实战开关文案、Codex 点名显示不显示、置顶上限。都按推荐来，还是要改哪条。

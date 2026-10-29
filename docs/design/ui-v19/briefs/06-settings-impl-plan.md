# 落代码方案 · 设置（UI v19 · 3-1 一行一控件）

状态：**待用户确认**（第 7 节 2 件事）。依据：已确认的简报 [06-settings.md](06-settings.md)（第 10 节 3 个待确认用户 2026-10-24 都按推荐），视觉稿 [设置-3-1-一行一控件.html](../设置-3-1-一行一控件.html)（同文件含 390）。

## 1. 范围

- **只改设置这一页**：`src/SettingsV16.jsx`、`src/settings-v16.css`、`src/settings-v16.js`；新增纯函数模块 `src/settings-selftest.js`（自检行怎么算）；`src/StoragePanel.jsx` 只把「下载恢复包」「导出可合并数据 JSON」两段请求抽成导出函数，界面与行为不变。
- **原样复用、不改内容**：现版抽屉里的全部面板——`CapabilitySettings`（预览 → 确认授权）、`ModelCapabilityUI`、`DaemonCapabilityUI`、`AiHotSettings`、`ProjectSettings`、`SourcePolicy`、`ProfilePanel`、日历 `Permission`、`AgentTargets`、`StoragePanel`（导入、恢复、旧版浏览器数据）。
- **不改**：服务端、接口、表结构与真实数据；其他页面；全站令牌；依赖不新增。
- **不发布、不推送**；提交前给你看对比图。

## 2. 设计元素 → 现版代码 → 怎么改

| 稿里的元素 | 现版代码 | 改法 |
|---|---|---|
| 一行页头（设置 SELF-TEST · 读取时间与 REV · ? · 重新自检） | `PageHeading`（06 · SETTINGS · 部分可用 · 设置 · ? · 导语）+ 横滑提示 | 这页不再用全站 `PageHeading`；「?」帮助（现版 `setHelp` 弹层）放到「重新自检」旁；重新自检 = 现版 `refresh()` + `reloadAiHot()` + 重读 `/storage/status`，然后重放自检动画 |
| 自检清单（10 行，问题排最上） | 左栏五个分区 `PageChoices` + 各分区表格 / 表单 | 删掉分区与表格；新组件 `SelfTestList` 按 `selfTestRows(...)` 的结果渲染；分区状态 `SETTINGS_CATEGORIES` 不再用（其他页只用到 `savepointThresholds`，保留） |
| 行的标记与结果句 | `permissionRows`、`calendarPermissionLabel`、`latestUse`、`savepointThresholds`、存储事实 | 新模块 `src/settings-selftest.js`：输入现有事实源，输出每行 `{id, mark, label, result, action}`；规则见第 3 节。读取中写「读取中…」，读取失败写「读取失败 · 未知」并标 `[?]`（算「要看一眼」），不冒充关闭或从未使用（沿用 `settings-v16.js` 头注释的规则） |
| 完整备份 · 下载恢复包 | `StoragePanel` → `FullBackup` 里的 `/full-backup/download` | 把这段请求 + `download()` + 提示抽成 `downloadFullBackup({notify})` 导出；行上按钮直接调用，`FullBackup` 也改调它；成功后重读 `/storage/status`，这一行按真实结果翻 ✓ |
| 能力开关（Vault 写入 / Agent 配置 / 模型 / API / 常驻服务） | 授权表「预览开启 / 撤销」→ `CapabilitySettings`（`initialCapability`） | 开关只表示状态，点它打开现版 `CapabilitySettings` 抽屉并选中这一项；确认后 `refresh()`，状态变了才拨过去。模型与常驻服务在抽屉底部加「管理凭据…」「查看服务状态…」，进现版 `ModelCapabilityUI` / `DaemonCapabilityUI`（待确认 3） |
| 知识开放 · 管理 | 授权表「管理」→ 跳到历史授权分区；历史授权里每个来源「管理」、个人说明 MCP「接入与授权」 | 行上是「知道了」+「管理」；「管理」打开新抽屉「知识开放」：三行（Obsidian知识库 / 常浩的知识库 / 个人说明 MCP），每行状态 + 进现版 `SourcePolicy` / `ProfilePanel`，保存、409 锁定、「重新读取知识范围」全部照旧（待确认 1） |
| 网络访问 · 开关 | 历史授权「配置网络访问」→ `AiHotSettings` | 开关打开现版 `AiHotSettings` 抽屉；保存后 `reloadAiHot()` |
| 日历与提醒 · 系统设置 | 历史授权「管理权限」→ 日历 `Permission` | 按钮打开现版日历权限抽屉 |
| 项目扫描 · 调整 | 项目设置三个按钮都打开 `ProjectSettings` | 一个「调整」打开同一个抽屉 |
| 资产交付 · 添加目标 | 资产交付目标分区（Codex / Hermes 切换 + `AgentTargets`） | 按钮打开新抽屉「资产交付目标」，内容就是现版这一段（含「先完成或取消目标编辑」的拦截） |
| 数据行（导出 JSON · 导入备份 · 在访达中显示 ··· 从完整备份恢复…） | `StoragePanel` 各段 | 「导出可合并数据 JSON」抽成 `exportMergeJson()` 直接调用；「导入备份」「在访达中显示」「从完整备份恢复…」打开「数据与备份」抽屉（现版 `StoragePanel compact` 原样）；旧版浏览器数据只在检测到时出现在这一行（待确认 3） |
| 计数与结论 | 无 | 三个液晶（要处理 / 要看一眼 / 正常）+ 一句结论，由 `selfTestRows` 汇总 |

## 3. 自检规则（`src/settings-selftest.js`，纯函数，单测覆盖）

| 行 | ✗ 要处理 | ! 要看一眼 | ● 外部访问开着 | ✓ 正常 | · 未配置 |
|---|---|---|---|---|---|
| 完整备份 | `lastBackup.state` 为 `none` 或失败 | 生成中 / 结果未知 | — | 有成功记录（写时间） | — |
| Vault / Agent / 模型 / 常驻 | — | 最近一次使用失败或未知，或最近一次申请未生效（`/capabilities/settings/history`），且没被「知道了」 | 已开启 | 关闭且无异常记录 | — |
| 知识开放 | — | 同上（`knowledge` 使用记录） | 任一来源开放或个人说明开放 | 都关闭 | 没有来源 |
| 网络访问 | — | 读取失败 | AI HOT 允许访问 | 关闭 | — |
| 日历与提醒 | — | 读取失败 | 已授权 | 未授权 | — |
| 项目扫描 | — | — | — | 有扫描目录 | 没有目录 |
| 资产交付 | — | — | — | 有目标 | 0 个目标 |

- 排序：✗ → ! → ● → ✓ → ·，同级按上表顺序。
- 已开启计数把 AI HOT 算进去（现版首屏「N 项已开启」漏了它）。
- 「知道了」（待确认 2）：记在本机 `localStorage`，按那条记录的编号（使用记录 `id` / 申请 `operationId`）记住；新记录编号不同就再亮黄；读写失败时当作没记住。不写主库。
- 现版 `settings.reauthorizationRequired`（数据目录身份变化，旧授权全部关闭）照旧只在授权抽屉里提示，不单独成行。
- 「恢复记录或目录身份无法核验」不常驻：只有 `StoragePanel` 查询真的报这个错时，完整备份行才写这句并标 `!`。

## 4. 分批

| 批 | 内容 | 验收 |
|---|---|---|
| 1 规则与结构 | `settings-selftest.js` + 单测；`SelfTestList`、新页头、数据行；抽出 `downloadFullBackup` / `exportMergeJson`；新抽屉「知识开放」「资产交付目标」「数据与备份」；删分区与表格 | 单测覆盖第 3 节每一格；现有设置回归改选择器后行为断言不变 |
| 2 样式 1440 + 390 | 重写 `settings-v16.css`：自检清单、标记色、数据行、计数；390 每行两层、数据行折行、抽屉从底部升起 | 1440 / 390 截图与稿逐项对照；无横向溢出；控件不小于 44px |
| 3 动效 | 开页逐行跑出（三帧点点点）、计数从 00 翻页、状态变化时标记按帧翻、开关拨片三帧、下载时按钮四格进度 | 减少动态效果时全部直接到位；按帧，不写 CSS transition |
| 4 回归与交接 | 改测试、加新测试、跑全量、截图对比、写交接与 CURRENT | 见第 5 节 |

## 5. 测试

- **要改选择器 / 文案的现有回归**：`tests/settings-v16.test.mjs`、`tests/settings-v16-browser.mjs`、`tests/batch-b-browser.mjs`、`tests/ui-v14-batch3-browser.mjs`、`tests/ui-v14-checks.mjs`、`tests/ui-user-258-browser.mjs`、`tests/ui-refine351-browser.mjs`、`tests/ui-continuous362-motion-browser.mjs`、`tests/visual.mjs`、`tests/project-settings-rebase-browser.mjs`，以及 grep 到 `.st-nav / .st-tr / .st-results / 授权与安全 / 数据与备份 / 历史授权` 的其他脚本。只改选择器和入口，不放松行为断言。
- **新增断言**：第 3 节每条规则（含读取中 / 读取失败不冒充）；已开启计数含 AI HOT；「知道了」按记录编号记住、新记录再亮；开关打开的是对应能力的预览抽屉、未确认不改状态；下载恢复包调用的是同一个请求并在成功后重读；知识开放抽屉三个入口都进现版面板；390 无溢出、44px。
- **跑法**：`npm test` 全量；浏览器回归用隔离数据目录（复制 CURRENT 快照到临时目录），不碰正式 5178 与 `data/`；`npm run build`。

## 6. 不在这次做

- 不改各抽屉里面的内容与流程（只换入口）；不做「知识开放」三个来源的新开关语义（开关只表示状态，进现版面板改）。
- 不新增接口；「恢复记录」不主动发 POST 查询，沿用 `StoragePanel` 现有时机。

## 7. 需要你确认的 2 件事

1. **由谁实现？** 推荐 **Claude 直接做**（和项目空间 648 一样：四批连续做完，每批跑测试，最后给你看 1440 / 390 对比图再提交）。备选：Claude 写派单交 Codex，Claude 验收。
2. **知识开放抽屉里是「三个入口」还是「三枚开关」？** 简报第 10 节写的是「三个来源各一枚开关、各自预览确认」；但现版每个来源的「开放给 Agent」和排除目录是同一张 `SourcePolicy` 表单、勾「我已核对」后一次保存（`/knowledge/policy`）。推荐 **三个入口**：每行显示状态（开放 / 关闭）+「管理」进现版面板，开放与排除目录一起核对，不多出写入入口。备选：每行一枚开关，拨动时带上现有排除目录调用同一接口，抽屉里先确认（不用改服务端，但多一个写入入口，要另加回归）。

# v0.6 工作流固定引用验收 · 2026-09-26

S05 本地切片已实现、回归通过、运行采用；真人使用待验。完整工作台目标仍 active，范围见 [GOAL-COVERAGE.md](GOAL-COVERAGE.md)，不以本切片代替整个产品上线。

## 范围与精确版本

契约：[WORKFLOW-REFERENCES.md](WORKFLOW-REFERENCES.md)。工作流自由创建/维护仍独立可用；可选地固定引用 Skill 或 Prompt 的确定版本，核对引用内容、复制完整说明、导出本机资料包。不是自动执行、目标部署配置或 Agent 安装。

- 应用 `0.6.0`；入口 `http://127.0.0.1:5178/#assets`。
- start_head `817b2949ffbaeccae97b610691f2b78c35acb0c0`。应用此前整体未提交；本轮未提交或推送。
- 开工基线 `/private/tmp/guiji-v06-baseline-cinHI9`；两轴最终产品审查快照 `/var/folders/19/41dqp8kj55x991m3vjqpxthc0000gn/T/guiji-v06-final-xF8Ukc`。临时快照不充当长期备份。
- src/server 联合 SHA-256 `b88a096a27fc2d1920530c898c80e9d5d6347b30ceb078ddad1886244ecf2f1a`。递归两目录，按相对路径排序，依次散列路径、NUL、文件字节。
- JS `index-J_Z112Ap.js`，SHA-256 `c1de46c2032b1c950d99d799f6295d0112ded59ed735e50769a19e3f31fc63aa`。
- CSS `index-BDY27kto.css`，SHA-256 `bee867c6b22db92372f1db304e9ad3160e70c047a7dacec4b23b1dc736f0fab7`。
- 运行进程 PID `91707`（验收时）；`/api/session` 实读 `0.6.0 / filesystem`，HTTP JS/CSS 与磁盘构建逐字节一致。真实 IAB 刷新后打开已有示例工作流，核对新交付操作与零引用状态，无保存动作。

## 用户路径与边界

资产库 → 新建/编辑工作流 → 引用资产 → 选择 Skill/Prompt 和版本 → 添加 → 保存。上游更新只显示「有新版 · 保持固定」，不会悄悄替换。引用版本修改、移除与历史恢复均生成新的流程快照；旧版本缺省引用恢复后清空当前引用，不继承新引用，不改写旧历史。

详情可展开核对原文和 Skill 文件清单。复制前重新读取主库的同一快照；全文包含流程、固定版本身份、Prompt 原文、Skill 附件路径及需附送 ZIP 的提示。资料包包含 `workflow.md`、Prompt 原字节、完整 Skill ZIP 与 SHA-256 版本清单。无引用流程仍可复制全文/导出 Markdown。

缺失、归档、版本缺失阻断交付但不抹掉记录，允许保留待修正草稿。最多 50 个不同 Skill/Prompt 引用，不支持嵌套流程；复制/资料包合计最多 25 MiB 原始 UTF-8 文本与 Skill 文件字节，ZIP 和清单开销不计入该原始输入限额。超限明确拒绝，不截断。包路径基于校验后的 ID，拒绝大小写不敏感磁盘上的路径冲突。

清理示例只移除未被个人工作流任何历史版本引用的示例；已归档流程的历史引用同样受保护。复制和下载不证明 Agent 接收、安装、采用或任务有效；不上传云端、修改 Agent、读取聊天或执行资料包。

## 验证结果

| 检查 | 结果 | 证据范围 |
|---|---|---|
| 单元/API | 53/53 | `npm test`；原 39 + 固定引用领域 9 + 实际主库/状态 5 |
| 浏览器 | 41 组通过 | 原全站 21、交付 5、上下文 5、历史 4、新工作流 6 |
| 迁移/备份 | 2 条链通过 | 旧 IndexedDB 保留、预览合并与回读 |
| 容量 | 2 档通过 | 历史差异 101/300 文件，折叠释放差异 DOM |
| 可访问性 | 20 状态 axe 无违规 | 全站 12、交付 2、上下文 2、历史 1、工作流 3 |
| 窄屏 | 320/375/393/430 px | 工作流详情/编辑无横向溢出，320 px 复制失败回退可操作 |
| 构建与运行 | 通过 | 最终 build、版本回读、HTTP 构建一致、真实 IAB 只读路径 |

新浏览器闭环覆盖：空白创建固定引用 → 保存重开；上游升级仍复制原 Prompt，ZIP 清单/原字节/Skill 二进制/哈希逐项校验；剪贴板拒绝提供完整回退，归档后新鲜读取阻断复制和下载；显式升级引用 → 历史比较 → 恢复 v1；503 保留正文及引用草稿，取消不写入；清理示例保护任意历史引用。

主要反例先失败再修复：旧流程恢复缺省引用错误、历史引用保护、复制限额与路径碰撞，以及两个预填 textarea 可访问名称、搜索后旧选项残留。引用相关测试按可验证行为逐步推进，其中首轮两项相关状态测试一起加入，不宣称每次都为严格单测试循环。

最终旧 `browser.mjs` 首跑因清理示例成功文案更新而停止在第 16 组；将断言从旧文案改为新的「已移除未被引用的示例」，原资产数量及状态断言保留，全站 21 组重新通过。冻结产品后仅完善测试与文档，产品构建未变。最终 `tests/workflow-browser.mjs` SHA-256 `8f72ddb49fb365b47db4a35ba31ba4b7da83d8d740209044c671d8ef21f2ca50`。

全部写验证使用隔离端口、合成数据和临时主库。真实主库前后 revision `3`，快照 `3-ce398cc9-0c8d-49ee-b48a-6d4681e70fec.json`，实文件 SHA-256 `d5ba8dbbbb830e3c49fed482ccfb7800100c8dc5cfe07818444337bab82926b5`，未修改真实资产。未改 Vault、飞书、Agent、远端 GitHub 或旧监工试点。

## 两轴独立审查

Spec 与 Standards 分别复现同一 P2：先选甲后搜索乙，可见选择已空，但添加仍使用隐藏的甲。新增浏览器断言观察 RED，修复为只从可见有效候选解析选择，搜索排除时同时清空资产/版本，添加再次核对版本；清除搜索不会复活旧选择。原反例和完整浏览器回归通过。

两轴在同一最终产品快照复核，各自独立隔离复现「甲 → 搜乙 → 清空并禁用 → 清搜索仍空 → 显式选乙只添加乙」。Spec 未闭合 0；Standards 硬违规 0、新增阻塞 0。Standards 还亲自执行旧交付/上下文/历史/容量/迁移/可访问性回归；全站文案断言修正后的重跑由根代理完成。

## T2 与三步运行流程审查

Gate：T2 Runtime Visual Review；Artifact maturity：runtime；Artifact：`src/WorkflowReferences.jsx` 与本版本运行界面；Artifact version/hash：上述 v0.6.0 src/server hash。Reviewed runtime build：上述精确 JS/CSS。Authority package：A v0.2 manifest SHA-256 `bd692d5fdcff8fdf911ceea53b5f1c3e36ce4958c3f3ac7a160c01a3f9d26e22` 及批准记录。T1：SATISFIED_BY_EXISTING_AUTHORITY；结构/样式/资产均继承，生图预算与使用 0。

Baseline QA：上述最终测试全通过；独立视觉审查者核验构建哈希并亲自查看七张当前截图，不声称其重复执行功能测试。运行流程审查使用 IAB 的隔离合成数据，真实走过下列三步。

### 1. 编辑并核对固定版本

![固定引用编辑](test-results/workflow-audit-01.png)

Prompt 已有 v2，但流程选择仍是 v1；版本、状态和移除操作共同呈现。取消编辑回到原详情，不创建新版本。

### 2. 展开查看实际引用原文

![查看固定引用原文](test-results/workflow-audit-02.png)

详情显示固定 v1，并展开该版本原文；上游新版状态与旧版内容不混淆。长身份字段与正文正常换行/滚动。

### 3. 复制流程说明

![复制流程说明反馈](test-results/workflow-audit-03.png)

真实点击后显示「已复制流程说明 · 未发送或执行」；下载作为次操作，含 Skill 的配套包提示在主操作下方。浏览器自动验证另行核对实际剪贴板、完整 ZIP 和失败回退。

Runtime evidence：上述三图 1280×720；`workflow-detail-desktop.png`、`workflow-editor-desktop.png` 1440×1000；`workflow-editor-320.png`、`workflow-failure-320.png` 320×900。桌面、窄屏编辑与失败态截图在现有 Toast 消失后获取，三步复制截图保留实际成功反馈。

Design Read：先固定版本，再查看引用与交付；详情和编辑使用一致的任务层级，无新增宣传区域或自动化夸大。Preserve：共享 Button/Badge/表单、暖白表面与橙色主操作、既有抽屉与封面；状态列表以分隔线组织，保持正常密度。

| Severity | Evidence | Visual issue | Bounded revision | Decision | Resolution status | Protected concerns | QA made stale / rerun |
|---|---|---|---|---|---|---|---|
| 无 | 最终七张截图 | 无 material 视觉问题 | 无 | N/A | 无未解决项 | 结构、语义、功能、技术、资产均保留 | 无 / 无需新增 |

本轮 UI 核验先修复搜索选择与预填文本可访问名称，再复查桌面、四档窄屏、完整失败回退，最终进行独立 T2；不以重复截图或换色充当优化。

Recommendation：VISUAL_PASS；Freshness：CURRENT，仅绑定本切片的上述精确构建。Next owner：主流程／真人使用验收。动效、VoiceOver、真机触控和真人全流程未独立实测，不由截图或 axe 结果推断通过。

## 下一步

S03 来源关系与已有本机 Skill 收录：先明确只读发现、完整包收录、来源与个人改版的关系，不安装或覆盖现有 Agent 副本。真实资产复用、Agent 接手和完整工作台其他能力仍单独验收。

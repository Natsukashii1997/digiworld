# v0.3 本机 Skill 交付验收 · 2026-09-25

本地功能切片已实现、测试通过、当前运行进程已采用。真人使用验收及实际 Agent 安装未完成；不能据此宣称完整工作台完成。

## 范围与版本

用户明确选择「先做本机交付，明确标注仅限本机」。本轮契约见 [SKILL-DELIVERY.md](SKILL-DELIVERY.md)。没有上传资产、创建云服务、安装 Skill 或改动 Agent 配置。

- 版本：`0.3.0`。入口：`http://127.0.0.1:5178/#assets`。
- start_head：`817b2949ffbaeccae97b610691f2b78c35acb0c0`；应用原本整体未提交，本轮不提交、不处理其他改动。
- 开工快照：`/tmp/guiji-v03-baseline-Gc2h5A`；最终独立审查快照：`/tmp/guiji-v03-final-check-23Zxuw`。临时快照不是长期备份。
- src/server 联合 SHA-256（文件路径排序，路径与内容间 NUL）：`94ecf83e8c550d64cae9d931ead19387b4a53183608b3f7fce9200bc4759aa02`。
- JS：`index-BKKpAhIT.js`；SHA-256 `4a0f5e689a73fc7cf038ddd68a7ec793665d9cf999328111269082557254dce2`。
- CSS：`index-DtT_PHsb.css`；SHA-256 `b52bf53d52e7b64487396f9991a08f5a6288546173e78a93d05c17671b3088ff`。
- 实际本机服务 PID `80620`（验收时快照）；`/api/session` 回读版本 `0.3.0`，实际 HTTP 返回 JS 的哈希与上列相同。用户 IAB 已刷新并打开 Skill 详情。

## 已实现

- Skill 详情复制自然语言安装口令，附随机短时 ZIP 链接、固定版本、SHA-256 与接收方安全检查要求。不预选 Agent，不自动安装。
- 链接仅供同一台 Mac 使用，10 分钟有效；服务需保持运行。支持刷新查看、主动撤销，重启后全部失效。最多 20 个有效链接、总计 100 MB；超限不撤销已有链接。
- 复制回执、下载请求次数和安装状态分开。剪贴板失败可手动选择文本；生成失败不复用旧链接；并发撤销后明确显示失效。
- 完整 ZIP 保留文件字节、相对目录、空目录及可识别普通 Unix 权限；旧资产缺少权限元数据时明确提示。保留独立 ZIP 导出。
- 拒绝越界、路径冲突、符号链接、特殊权限、加密、超限、损坏或不支持的包；先核对 ZIP 目录，再限量解压逐个条目、核验长度与 CRC。不执行包内内容。

## 测试与运行验证

| 范围 | 结果 | 证据 |
|---|---|---|
| 单元与服务 API | 25/25 通过 | `npm test`：原持久化/发现/HTTP 回归，以及 `tests/package.test.mjs`、`tests/delivery.test.mjs` |
| 新交付浏览器路径 | 5 组通过 | `node tests/delivery-browser.mjs`：真实剪贴板→下载与哈希→刷新管理→撤销；并发撤销；剪贴板拒绝；窄屏；API 失败 |
| 既有全站回归 | 21 组通过、0 JS 异常 | `test-results/browser-report.json`；`node tests/browser.mjs` |
| 迁移与备份恢复 | 2 链通过 | `node tests/migration.mjs`：旧 IndexedDB 只读迁移及新浏览器共享主库；备份预览合并与回读 |
| 自动可访问性 | 14 状态无 axe 违规 | 原 12 路由/弹窗状态见 `test-results/accessibility-report.json`；新交付成功/剪贴板失败 2 状态由交付浏览器脚本检查 |
| 窄屏 | 320/375/393/430 px 无横向溢出，主要操作触控高度 44 px | `test-results/delivery-*.png` 与浏览器断言 |
| 构建与真实窗口 | 构建通过，当前用户窗口采用最终构建 | `npm run build`、实际 HTTP 哈希回读、IAB AX 与截图 |

关键安全回归包括：跨站/错误 Host/无管理会话拒绝；链接令牌不同于管理会话；599999 ms 可下载、600000 ms 失效；版本编辑不改变既有链接包；撤销、归档和服务重启不可再下载；主库与备份不含链接秘密；容量上限保留已有链接。

全部自动测试使用隔离端口、临时主库和合成包。真实用户窗口只刷新和查看，没有创建真实下载链接或修改真实资产。验收前后 `data/CURRENT.json` 均为 revision `3`，文件 `3-ce398cc9-0c8d-49ee-b48a-6d4681e70fec.json`，SHA-256 `d5ba8dbbbb830e3c49fed482ccfb7800100c8dc5cfe07818444337bab82926b5`。既有项目、Agent 发现与资产数据未被测试覆盖。

## Standards 独立复核

原发现 2 项，最终 0 项未解决。

- P1：ZIP 注释内的另一目录结束标记可能让整包解压器选择不同于预检的范围。改为只解码已核对的单条压缩区间，增加明确失败的回归后通过。
- P2：刚生成链接被另一页面撤销时，旧闭包未复核新链接 ID，仍可能只显示复制成功。生成流程显式传递新 ID 回查，刷新按钮不传递事件对象，复制提示不保证链接仍有效。并发撤销浏览器回归先失败后通过。

最终 Standards 审查者对 `/tmp/guiji-v03-final-check-23Zxuw` 的增量复核确认问题已闭合、无新增阻塞项。最终浏览器测试由主代理实际执行；不把审查者的代码阅读写成其亲自运行测试。

## Spec 独立复核

原发现 1 项 P2，最终 0 项未解决：解压输出可能按伪造声明长度被静默截短。改为逐块限量解压，要求实际长度与声明长度严格一致并校验 CRC；同时验证正常跨块二进制保真。原反例已拒绝，25 项测试通过。

最终 Spec 审查者复核同一最终快照，确认并发撤销显示、复制语义及回归符合契约，未发现新的规格偏离或阻塞。两轴分别记录，不以代码审查替代真人验收。

## T2 运行态视觉记录

Gate：T2 Runtime Visual Review。Artifact maturity：runtime。

Authority：`../../outputs/个人AI工作台-A风格视觉规范-v0.2/authority-manifest.json`，SHA-256 `bd692d5fdcff8fdf911ceea53b5f1c3e36ce4958c3f3ac7a160c01a3f9d26e22`。继承已批准视觉方向，T1 为 SATISFIED_BY_EXISTING_AUTHORITY；生图预算与使用均为 0。

Reviewed runtime build：本文所列最终 JS/CSS 哈希。截图来自该构建：`test-results/delivery-desktop.png`（1440×1000，复制成功/链接列表展开）、`delivery-320.png`（320×900，剪贴板失败/文本回退）、375/393/430 px 变体及 `delivery-component.png`。另在真实 IAB 查看既有资产详情、仅限本机提示与空链接列表。没有用静态效果图替代运行截图。

Baseline QA：见上表。Authority protected：现有抽屉、Button、Badge、字体栈、暖色背景与橙色主操作；没有引入营销区域或改变业务权限。

Design Read：主操作是复制安装口令，独立导出作为次操作；有效期与本机限制可直接看到；链接管理按需展开，失败时保留可操作回退。

Preserve：清晰主次层级、克制信息密度、正常文档流布局与一致按钮状态。Findings：最初刷新文字对比度 4.43 的问题已通过复用共享次级 Button 修复；最终 0 项未解决视觉发现。

Deferred / N/A / Blocked：新插画 N/A；真实手机触控、VoiceOver BLOCKED（本轮未实测）；真人使用验收 pending。

Recommendation：VISUAL_PASS，仅限当前视觉切片。Next owner：常浩使用验收／主工作流。Freshness：CURRENT for 本文最终构建；后续代码变更须按影响重新验证。

## 使用验收与限制

在「资产库 → Skill → 详情」点击「复制本机安装口令」，交给这台 Mac 上具备本地网络权限的 Agent；工作台需保持运行。接收 Agent 仍应执行自己的 Skill 准入审查，并确认安装位置、依赖及冲突。服务离线、权限不足或链接失效时停止，重新生成或使用独立 ZIP 导出，不自动绕过限制。

下一步：常浩使用一个自己的完整 Skill ZIP 验收导入、复制与同机下载。实际安装、激活与效果另行确认，不能由复制或下载推断。已有项目/Agent 列表的人类范围校准也仍待验。

不支持云端 Agent 通过此链接下载；没有长期交付审计账本、真实安装状态、Agent 自动修复、知识库写入、模型自动路由或夜间执行。本轮不改变监工试点的历史未知状态。

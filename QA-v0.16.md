# v0.16 候选受控保存 · 本地验证记录

日期：2026-09-27。结论：本地验证通过、待真人使用。当前主服务已采用0.16.0，完整工作台目标仍active。

## 完成范围

K02候选落地接缝：固定候选版本→核对历史→选择已连接Obsidian及领域/文件名→精确目标与全文预览→明确确认→新建到00待整理→持久化与文件回读→重开历史→预览/确认撤回。恢复全文保留，原资料、正式知识、索引、Current及有效性基线不改。普通JSON备份与独立写入日志的区别已在界面及README说明。

新文件 type=knowledge-candidate、status=待整理、retrieval=停用；分析/来源陈述/假设、证据版本、冲突和未知完整保留。只有本人本机使用。本轮不触发真实Vault读写、Agent配置、飞书、付费模型或远端操作。

## 版本与运行绑定

- start_head与完成时HEAD均 `817b2949ffbaeccae97b610691f2b78c35acb0c0`；应用仍为未提交工作，不伪造completion commit。
- 前版基线 `/tmp/guiji-v016-baseline-XJsyQW`。最终冻结 `/tmp/guiji-v016-final-7RpnaX`，包括源码、测试、构建；本轮最终证据复制到 `test-results/v016-final/`。
- src/server共62文件，按路径排序，逐行 `相对路径 + NUL + 文件SHA`，以换行连接再SHA：`61eeb5f30cd643e5e4ddb6a3b5d01b675de1d79a3be0e6dfd2f45424d126607f`。主目录与冻结逐字节匹配。
- HTML SHA `bc06156fdcac48a7c056dd4042434595c4732017c001253dd6b324d6c2a49608`。
- JS `index-BWc4VoHd.js` SHA `48183c8229a23640a45c403e161910f3c5efbf4b5c7bd0556597f747c4a637d5`。
- CSS `index-BROyrkn9.css` SHA `143f2dbd1cf3c52da48d82b5bd9d13680e0ebed5cec2ef4a6e0e17e7f64f7495`。
- 主服务 `http://127.0.0.1:5178/`，PID6589；`node server/index.mjs`，cwd本应用，session17334。HTTP session报告0.16.0，根页面与JS/CSS均通过HTTP逐字节核对。不是公网部署或独立Mac打包。

## 检查结果

| 检查 | 最终结果 | 证据 |
|---|---|---|
| 完整单元/API | 342/342 | `test-results/v016-final/unit-tests.log` |
| 新候选写入/撤回 | 5流程、10axe | `test-results/v016-final/v016-writeback/report.json` |
| 知识连接 | 21流程、13axe | `test-results/v016-final/knowledge/knowledge-report.json` |
| 正文查询 | 21流程、11axe | `test-results/v016-final/knowledge-query/knowledge-query-report.json` |
| 整理任务 | 8流程、10axe | `test-results/v016-final/knowledge-compilation/report.json` |
| 整理长内容与失败恢复 | 5流程、6axe | `test-results/v016-final/knowledge-compilation-resilience/report.json` |
| 整理提交后500/503 | 6用例 | `test-results/v016-final/knowledge-compilation-recovery/report.json` |
| 资产/项目/Agent等主路径 | 21组 | `test-results/v016-final/browser-report.json` |
| 迁移与备份恢复 | 2组 | `test-results/v016-final/migration.log` |

合计87组浏览器流程/用例，另迁移2组，50次axe无违规；各脚本无页面JS异常。仅统计本轮实际运行的套件，不把前版全部历史检查累加。构建、变更文件格式检查通过。隔离冻结测试的Wiki helper显式指向既有 `work/wiki-local/wiki.py`；使用真实解析与read_current门禁，但读写对象全为临时合成文件。

新增风险反例覆盖：未确认/过期/归档/撤权/原文变化、同名拒绝覆盖、目录链替换/链接、部分写入留存且不冒成功、同字节文件替换禁止撤回、撤回预览后编辑、重开历史及旧令牌重放、响应已提交但503时停止重试并用记录恢复。写入不修改主JSON版本，候选不能通过wiki-local当前知识读取门禁。

## 审查和返工

- Spec独立发现2个P2：留痕后确认已过期仍删除；父目录被替换后的缺文件被误报撤回成功。初冻结 `/tmp/guiji-v016-reviewed-H1IMBK` 的独立probe均RED，修复后两个GREEN；永久保留 `tests/knowledge-writeback-boundaries.test.mjs`。独立probe副本 `test-results/v016-final/rollback-boundary-probe.mjs` 可传冻结路径运行。
- Standards最终0阻断/0硬性违规；Spec最终0未闭合。两名审查员独立重跑12个新增及相关测试；Standards另独立跑5流程/10axe。最后仅44px CSS差异，两轴均只读核对并将结论绑定7RpnaX，不声称再次全量独立执行。
- P3生命周期状态控制重复建议延期：各流程恢复规则不同，本轮不为抽象合并跨域代码；不影响当前正确性。
- UI两轮修正：720px短窗固定标题遮挡预览→加入已有组件scroll margin；320px长内容回归发现select43px→知识详情select统一min-height44px。两项原反例均RED→GREEN。
- 最终视觉T2 `VISUAL_PASS`，精确版本与9张已查看图绑定见 `T2-v0.16.md`；不等于真人或产品全范围验收。

## 实际窗口与数据保全

IAB对最终合成服务64225实测选择候选→记录核对→选库→完整预览→确认保存→核对已保存→预览撤回→确认→核对已撤回。截图 `test-results/v016-cua/02-final-preview.png`、`03-final-saved.png`、`04-final-rolledback.png`，含真实临时路径且明确合成资料。不是在真实Vault执行。

切换主服务前确认原用户页面无未保存表单；原Agent页面刷新后仍正常显示，未替用户扫描/登记来源。切换前后及刷新后revision5、项目21、手工项目0、知识源/任务0；CURRENT SHA `9cf1a6a3541c30ae148545b42278e441a9a6b1ce33082f7d70d378b923b8a310`，原快照SHA `1f9f698413fb3e2fdacbb65e5cebfae7e53237a4c9aab28dd43087666d4d6ac4` 不变。合成测试页与专用服务已关闭，合成临时资料由fixture清理；截图与测试证据保留。

## 仍未完成

正式采纳/编译页事务、原生Agent运行回执、语义查询、纠正影响查询、主动维护、真实Vault与真人使用均未验收。本轮不关闭全部K02，更不关闭完整产品目标。中断准备记录、部分文件或损坏记录仍须人工核对，禁止自动重放，不具备通用自动修复；文件系统观察不是防恶意本地进程的原子CAS。公网Skill分发未纳入本机首版。

下一步：沿K02实现来源纠正/变化的影响核查与重整理入口，仍先使用合成来源；不默认采纳正式知识、改有效性基线或访问真实Vault。其他完整缺口见 `GOAL-COVERAGE.md`。

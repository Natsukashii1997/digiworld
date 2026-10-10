# 项目本地跟踪

## 2026-10-09 收藏复刻

用户授权完整对标看看收藏并继承数码世界风格。规格 [collection-replica/SPEC.md](collection-replica/SPEC.md)；[01画布](collection-replica/01.md) -> [02Chrome](collection-replica/02.md) -> [03原生与整合](collection-replica/03.md)。状态实施中，当前权威为根CURRENT，未经验证不关闭。

沿用既有文件跟踪，不创建远程 Issue 或 PR。

撤回 [05 Obsidian单份素材库](collection-replica/05-obsidian.md)：用户最新决定仅本地存储；330反迁当前3条/15附件、恢复接入前代码和界面、移专属区至废纸篓，交接331。非活动功能，不自动重新启用；独立知识库模块不属于本次撤回。

追加 [04回收整理](collection-replica/04-recycle.md)：垃圾桶「本地删除」单按钮，成功后不留结果行/历史缺失红字，仅本次真实失败保留提示，不自动永久删除。1196单元、定向故障/六宽及两轴/T2通过，5178已采用；真实重复按钮无结果行且原库SHA未变。见[交接326](handoffs/2026-10-09-codex-collection-feedback-326.md)，完整复刻仍实施中。

## 2026-09-28 协作入口校准

最新状态只维护在应用根 [CURRENT.md](../../CURRENT.md)。Codex 与 Claude 共享同一目录，按 [COLLABORATION.md](../../COLLABORATION.md) 开工认领、核对变化、完工交接。完整接手地图见 [Claude 项目交接](../../PROJECT-HANDOFF-CLAUDE-2026-09-28.md)。本轮只整理交接/协作，不实施重构；Claude 的已读回执尚待确认。下列版本条目是历史验证记录，不再各自指定“唯一下一步”。

## 历史切片记录

- 当前：`UI-ROLLBACK.md`（2026-09-28），用户明确撤销数码宝贝视觉，已恢复改版前的归集米白/暖橙、抽象封面、默认网格及详情抽屉。11文件与原快照逐字一致，后端和主库不变；364项测试和构建通过，本机HTTP供应已核验，PID13993。证据 `QA-UI-ROLLBACK.md`。未提交、未发布；浏览器整页视觉/交互仍未复核，待用户查看恢复版。数码主题仅保留历史和可恢复备份。

- 暂停：`KNOWLEDGE-MAINTENANCE.md`（v0.17），来源变化影响定位、最新资料预览、关联新整理任务及保留历史。用户先暂停业务开发再进行UI重设计；本轮未改动后端源码。此前候选与未完成验收原样保留，不把UI构建通过当作该功能发布。旧 `/tmp/guiji-v017-baseline-00AAfh` 不再依赖；本轮源基线见 `test-results/digievolution-v1/baseline/`。

- 最新本地验证：`KNOWLEDGE-WRITEBACK.md`（v0.16），固定候选精确预览/确认、待整理新建/回读、历史核对与受控撤回，完整恢复记录单独保留。本地验证通过、待用户验收。342项单元/API、87组浏览器流程/用例、迁移2、50axe；两轴原2P2已闭合、0阻断，P3维护建议延期，T2 VISUAL_PASS。最终 `/tmp/guiji-v016-final-7RpnaX`，62源联合SHA `61eeb5f30cd643e5e4ddb6a3b5d01b675de1d79a3be0e6dfd2f45424d126607f`；本机已0.16.0/PID6589，revision5/21项目和原hash不变。start_head `817b2949ffbaeccae97b610691f2b78c35acb0c0`，未提交，无completion commit；证据 `QA-v0.16.md`。不宣称真实Vault写入、正式采纳或全K02完成。

- 前序本地验证：`KNOWLEDGE-COMPILATION.md`（v0.15），整理任务、本人Codex任务包、候选回传/历史与来源复核。本地验证通过、待用户验收；历史证据 `QA-v0.15.md`。

- 前序本地验证：`KNOWLEDGE-QUERY.md`（v0.14），K01正文关键词查询、片段/来源和有界继续查询；312项单元/API、110组浏览器检查/流程、迁移2、62次axe通过；两轴P1/P3已闭合，T2 VISUAL_PASS。当时主服务采用0.14.0，原数据revision5/21项目/0知识连接及哈希不变。合成来源验证，待真人使用，不代表真实Vault接通。证据 `QA-v0.14.md`。

- 前序本地验证：K01 `KNOWLEDGE-CONNECTIONS.md`（v0.13）限域连接、文件名/路径查询与只读原文。284项单元/API、89组浏览器、迁移2、51次axe及两轴/T2通过；当时主运行已采用0.13.0、原主库revision5与哈希不变。合成来源验证，不代表真实Vault接通或真人验收。证据 `QA-v0.13.md`。

- 当前状态权威：应用根 `CURRENT.md`；父蓝图目录旧入口只作指引与历史存档。
- 实施切片：应用根目录的命名契约文件；最新为 `KNOWLEDGE-WRITEBACK.md`（v0.16），前序知识与资产/Agent/项目契约保留。完整持续范围见 `GOAL-COVERAGE.md`。下一步K02来源纠正/变化的影响核查与重整理入口，合成资料先行，不自动采纳正式知识、改基线或读写真实Vault。S07真实资产复用、Agent实际采用及项目/知识真人接续待验，不阻挡隔离开发。
- 状态沿用「实施中 / 本地验证通过、待用户验收 / 阻塞 / 已验收」。测试通过不等于用户验收。
- 开始时记录范围与 start_head；结束时记录本地变更、测试、Standards/Spec、T2、运行版本及未完成项。未经授权不提交、推送或创建远程任务。
- 领域定义：`../../outputs/个人AI工作台-B04-首版资产中心实施方案-v0.2/CONTEXT.md`（相对于应用根目录）；当前用户确认和切片契约优先于历史候选。

## 2026-10-07 完整蓝图终审优化

当前事实源仍为 CURRENT.md；总范围见 [优化规格](audit-optimization/SPEC.md)。用户已授权按报告结构实施，技术切片/依赖由Codex维护。

- [T01 状态与操作表达](audit-optimization/01.md)：依赖 无。
- [T02 资产目标交付与采用证据](audit-optimization/02.md)：依赖 无。
- [T03 持久快照与已知故障修复](audit-optimization/03.md)：依赖 02仅对挂载修复。
- [T04 MCP配置资产与目标模型](audit-optimization/04.md)：依赖 02。
- [T05 工作流B目标部署](audit-optimization/05.md)：依赖 02、04（涉及对应能力时）。
- [T06 受控执行与工作流C](audit-optimization/06.md)：依赖 目标执行适配事实核实。
- [T07 夜巡v2生产准备](audit-optimization/07.md)：依赖 06。
- [T08 知识剪藏与后台候选](audit-optimization/08.md)：依赖 来源/候选规则已定义；自动执行依赖06。
- [T09 项目差异解释与用量](audit-optimization/09.md)：依赖 06仅对执行来源汇总。
- [T10 整合与真实验收准备](audit-optimization/10.md)：依赖 所有已激活切片。

## 2026-10-07 终审优化本轮交接263

T01/T10 本地验证通过、待用户验收；T02–T09 本轮有限切片通过，完整票仍实施中，逐票记录剩余原生/生产能力。1164单测、106独立入口、额外修复1项及18对图通过；不宣称E03通过。详见 [交接263](handoffs/2026-10-07-codex-audit-optimization-263.md)。

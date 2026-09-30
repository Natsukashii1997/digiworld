# v0.17 来源维护 · ROADMAP 1.4 验收证据

日期：2026-09-29；执行Codex。输入WB-20260929-45，认领46，键盘缺口扩围47。**本地工程验证完成后交Claude独立复核，真实使用验收仍在第一阶段末。** 本文件用于逐条验收，不代表完整K02、正式知识采纳或真实Vault已接通。

## 范围与依据

契约：[KNOWLEDGE-MAINTENANCE.md](KNOWLEDGE-MAINTENANCE.md)，路线图1.4：“契约中每个失败和恢复路径都有证据”。有效输入是[157文件基线](docs/agents/handoffs/2026-09-29-claude-1.3-ds3-code-baseline.sha256)；历史/tmp目录不是基线。所有测试只用合成文件及隔离适配器，读取来源不超出fixture。真实主库只取指针哈希。

本轮4个代码/测试文件：styles.css仅4行恢复知识确认框键盘焦点；knowledge-maintenance-browser修D-KM并补失败/键盘证据；knowledge-maintenance-recovery-browser真正重载；knowledge-maintenance.test增加6个边界用例（17→23）。后端、schema、依赖及其他产品逻辑不变。

## 契约到证据矩阵

下列API用例均由本轮npm test执行；UI由两个维护浏览器脚本执行。简称：

- **M**：[maintenance API测试](tests/knowledge-maintenance.test.mjs)
- **B**：[维护浏览器测试](tests/knowledge-maintenance-browser.mjs)
- **R**：[恢复浏览器测试](tests/knowledge-maintenance-recovery-browser.mjs)
- **S**：[知识存储与备份测试](tests/knowledge-compilation-store.test.mjs)
- **F**：[安全文件读取测试](tests/knowledge-files.test.mjs)

| 契约路径 | 可定位用例 / 本轮证据 | 结论 |
|---|---|---|
| 一份来源影响多任务，检查不写主库/原文 | M“一份资料变化定位多个任务…” | 通过 |
| 多依据只变一份；筛出有关主张、冲突、关系，保留多个候选版本 | M“部分依据变化只列相关主张冲突关系…”：3份依据、2候选版本 | 通过，本轮新增 |
| 5任务分批与明确offset，归档仍追溯，跨批revision不一致整页拒绝 | M“影响核查分批…”；B `paged checks…`、`revision change clears…` | 通过 |
| 最长5秒在任务边界停，未覆盖部分不冒充完整 | M“确认读取途中到期…影响检查耗时…”；每任务最多5依据由schema限制，单批5任务即最多25依据 | 通过；25的总界限来自组合约束，并非额外25文件耗时基准 |
| 读取途中撤权，三个读取入口整次拒绝且没有部分原文/报告，不阻塞撤权 | M `impact/preview/create读取途中撤权…` | 通过 |
| 缺文件、授权失效、受阻不显示一致 | M“断开来源只报告撤权…”、“来源替换、链接和超大文件…”；B缺失404→可见错误→恢复原路径后重试 | 通过 |
| 保存历史按固定版本关联，不声称当前文件存在 | M“已保存候选只报告历史位置…”及新增部分依据用例：删除合成目标后仍只给历史位置 | 通过 |
| 多版本历史saved/withdrawn/pending分清；日志损坏不能冒充0记录 | M部分依据用例：三条记录分别保留三种回执；B `unavailable history…` | 通过；pending由合成日志丢失applied回执模拟 |
| 预览只限已选Markdown、旧新SHA和全文、不写库；取消和未确认均无写入 | M“预览当前原文后确认…”；B键盘取消、预览取消 | 通过 |
| 文件缺失不静默追踪新位置，拒绝链接/超大文件/根换代 | M“断开来源…”、“来源替换…”；F只读/路径/UTF-8/目录链/硬链接/字节稳定性边界 | 通过 |
| 同字节普通文件/子目录换代：旧计划拒绝，重预览捕获新身份，旧历史不改 | M“同字节file替换…”及“同字节directory替换…” | 通过，本轮新增；根换代仍需重新授权 |
| 预览5分钟有效、最多30份，过期释放容量 | M expired参数用例；新增“维护预览最多30份…”30成功/31拒绝/过期后恢复 | 通过 |
| 确认时revision/来源字节/授权/身份再核查，开始前或读取中过期均不写 | M expired/changed/disconnected/revision四例、读取中到期、新身份两例 | 通过 |
| 50任务上限拒绝，失败不增加revision/历史，恢复查询不假称进行中 | M“50任务容量拒绝…” | 通过，本轮新增 |
| 新任务固定身份、basedOn关联，不继承旧候选/批准；重复确认不重复创建 | M“预览当前原文…”；B创建后检查3个任务与旧候选数 | 通过 |
| 服务重启、正常页面重载保留父子导航 | M重启后basedOn；B `reload preserves lineage` | 通过 |
| 提交成功响应丢失：待核对、禁止重放，查询找到固定新任务 | B `postcommit503 recovery…`：create次数始终1 | 通过 |
| 结果未知后恢复查询也失败，继续pending而非未创建；再次查询可恢复 | B合成maintenance/recover503 | 通过，本轮新增 |
| 原创建仍进行中，不能判为未创建；关闭重开也先查；未开始确认被取消 | M“恢复查询不把仍执行的创建…”；R inflight-refresh/close-reopen | 通过 |
| 原创建提交后真正page.reload丢失组件记忆，持久父子关系仍能找回 | R reload-after-commit，明确执行page.reload | 通过，本轮补实；原测试名字有reload但只重开详情 |
| recover使仍在I/O的preview代际失效，迟到原文/计划不发布；新预览可继续 | M“恢复查询作废仍在读取的预览…” | 通过，本轮新增 |
| 关联备份恢复但授权不恢复；非法父关系、身份/候选分叉拒绝；旧备份不删历史 | M“关联任务备份恢复…”；S全部5例 | 通过 |
| 缺knowledgeTasks旧快照兼容，schema1历史保持，通用保存不能篡改 | S“缺knowledgeTasks…”、“通用保存不能…” | 通过 |
| 四维护HTTP入口本机会话门禁 | M“四个维护入口均要求本机会话凭证…” | 通过，含recover |
| 检查失败/跨批冲突清整份旧报告；成功workspace刷新后作废旧检查 | B revision-change及D-KM impact-first/refresh-first显式网络门 | 通过 |
| 普通workspace刷新503不推进、不冒充刷新成功；成功重试清旧观察 | B `failed workspace refresh retains dated report…` | 通过，本轮新增；与recover503分别验收 |
| 创建中取消/Escape/重复按钮禁用；取消后仍可操作 | B `busy Escape guard…`及键盘取消/再次创建 | 通过 |
| 320/375/393/430/1280长原文和影响报告，无内部横溢/小按钮；字面正文不执行脚本/外链图片 | B五宽geometry、20次axe、literal content断言与截图 | 通过 |
| Tab/Space/Enter完成预览→确认→取消/创建，焦点可见 | B tabTo及keyboard流程；先红后绿的2px青色焦点 | 通过，本轮实际修复 |

## 两项红灯与修复证明

1. **D-KM**：[dkm-red.json](docs/agents/handoffs/evidence-2026-09-29-codex-1.4-maintenance/dkm-red.json)及[红灯日志](docs/agents/handoffs/evidence-2026-09-29-codex-1.4-maintenance/dkm-red.log)：旧通知存在、第二次刷新仍挂住时，原断言误把先到impact的1条报告判为失败。正式测试改用动作前注册的本次HTTP响应与按钮结束，双顺序门控；[连续10轮](docs/agents/handoffs/evidence-2026-09-29-codex-1.4-maintenance/dkm-stability.json)全通过。10轮版本为11个UI流程；随后只加普通刷新503测试，最终全量的12流程也通过，产品构建未变。
2. **键盘焦点**：[keyboard-red.log](docs/agents/handoffs/evidence-2026-09-29-codex-1.4-maintenance/keyboard-red.log)在真实Tab到确认框时读到outline:none。styles.css只加`.knowledge-confirm input:focus-visible`的既有--cyan/2px outline。修复后[焦点截图](docs/agents/handoffs/evidence-2026-09-29-codex-1.4-maintenance/ui-final/02-keyboard-confirm.png)及Tab/Space/Enter断言通过。

新增容量/来源身份/记录语义用例用于补齐既有实现的验收，不伪称这些产品行为本轮才实现；未为已有正确行为制造假红灯。

## 最终运行与审查

- npm test：**397/397**（原391，新增6），0失败/跳过；[日志](docs/agents/handoffs/evidence-2026-09-29-codex-1.4-maintenance/npm-test.log)。维护专项23/23。
- 全部24独立脚本 **24/24通过**：[regressions.json](docs/agents/handoffs/evidence-2026-09-29-codex-1.4-maintenance/regressions.json)；完整汇总见[交接](docs/agents/handoffs/2026-09-29-codex-1.4-maintenance.md)。
- 最终维护浏览器**12条流程/20次axe**；恢复浏览器3条流程；[主报告](docs/agents/handoffs/evidence-2026-09-29-codex-1.4-maintenance/final-knowledge-maintenance-browser/report.json)、[恢复报告](docs/agents/handoffs/evidence-2026-09-29-codex-1.4-maintenance/final-knowledge-maintenance-recovery-browser/report.json)。
- `node tests/visual.mjs codex-1.4-maintenance`：1440/1024/390/320 problems=[]；[日志](docs/agents/handoffs/evidence-2026-09-29-codex-1.4-maintenance/visual.log)。
- `npm run build`：成功，13个产物与T2隔离构建相同；[构建日志](docs/agents/handoffs/evidence-2026-09-29-codex-1.4-maintenance/build.log)。5178 PID11559未重启，HTML/JS/CSS逐字节等于dist；[运行核验](docs/agents/handoffs/evidence-2026-09-29-codex-1.4-maintenance/runtime-verification.json)。
- Standards/Spec分别0项发现；[固定差异审查](docs/agents/handoffs/evidence-2026-09-29-codex-1.4-maintenance/axis-reviews.md)。T2 **VISUAL_PASS**，审查者实际看13张固定构建截图；[完整记录](docs/agents/handoffs/evidence-2026-09-29-codex-1.4-maintenance/t2-review.md)。内部子代理不是另一个客户端Claude的独立复核。
- [新157文件指纹](docs/agents/handoffs/2026-09-29-codex-1.4-maintenance-code-baseline.sha256) SHA256 `cc5fd78b5d63eead56cbb5dd2de07fcb6883f608aa199c3af14a89c87d32cca3`；[精确改动](docs/agents/handoffs/evidence-2026-09-29-codex-1.4-maintenance/change-manifest.json)。未提交本地版本，不称发布。
- 真实`data/CURRENT.json`前后哈希`a74e3e05aabe05d1a0cee1a1365f4ce8afd8bd86c0006ce55efccd793a109db9`。全部运行使用本轮专用临时根并清理，未扫描/清理其他历史临时目录。

## 使用路径与未完成项

后续获准连接来源的验收路径：知识 → 整理 → 检查来源变化 → 打开任务 → 预览重新整理 → 核对当前原文 → 确认创建新任务。看到原任务关联且旧候选仍在，才表示新任务创建成功；若显示“结果待核对”，只用刷新确认，不重复创建。取消预览不会新建任务。无需新增安装。

Claude尚未独立复核1.4；真实Vault连接、真实资料/真人操作、原生Agent采用和完整K02均未验收。第一阶段整体验收待Claude复核后开展，1.1阶段/动画与备注取舍、1.3前缀词摘录低建议沿用原状态，不借1.4扩大功能。唯一下一步：Claude独立复核1.4。

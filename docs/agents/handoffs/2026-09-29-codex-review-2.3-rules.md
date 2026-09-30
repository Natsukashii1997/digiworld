# Codex → Claude｜2.3 规则模板与项目协同协议独立复核

输入 **WB-20260929-70** → 认领 **71** → 输出 **WB-20260929-72**。执行 Codex，2026-09-29。写入权已释放；已写共享状态，待另一方实际读回，不代签已接手。

**代码不通过，模板暂不通过；本轮未执行收录。** Standards 3项重要；Spec 6项重要（有交叠，其中1项包含两个缺陷），共7个唯一代码问题；模板1项重要阻断及1项建议，无致命发现。没有修业务代码或改写模板，没有装入真实项目，没有开始2.1。

## 任务与固定基线

唯一目录 `/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench`。应用仍在上级Git仓库中未跟踪，未以Git HEAD替代代码基线，未提交/推送。

- 165文件清单：[Claude 2.3指纹](2026-09-29-claude-2.3-rules-code-baseline.sha256)，SHA256 `f5e81f7ef14f7b4f40960a0225904ac7afb8cddf7dfda52438eed167c0f66d88`，开工、继续、结束全部匹配。
- 与[前版160文件](2026-09-29-claude-ui-d-ui1-code-baseline.sha256)比较：17修改、5新增、0删除；17个改前快照均与前版匹配；无未说明代码漂移。
- 根代理独立生成[固定差异](evidence-2026-09-29-codex-review-2.3-rules/fixed-change.diff)，SHA256 `e18b444ee3281c56016350c781346d8619a120f70528450d838a6ee6c3234dc8`。两轴共享该快照，子代理只读，根代理单写。
- 草稿[项目协同协议修订稿](../../product/规则模板-项目协同协议-v1-草稿.md) SHA256 `de42230906a697981870f18ebaa27ccb7e635530c59b84269429397dcd971850`，未改动。
- 入口、CURRENT最新表及66–70记录、COLLABORATION、相关ROADMAP/PRD、RULE-TEMPLATES、两份Claude交接均已读取。1.E沿用用户与Claude已完成验收，不重新打开1.4、搜索和UI修复。

[基线详细核验](evidence-2026-09-29-codex-review-2.3-rules/baseline-verification.json)｜[结束核验](evidence-2026-09-29-codex-review-2.3-rules/end-verification.json)

## Standards

**不通过：3项重要，0致命。** [独立报告及标准出处](evidence-2026-09-29-codex-review-2.3-rules/standards-review.md)。以下均由根代理隔离浏览器复现：

- **D-R3：读取失败变成“没有装入”。** `src/App.jsx:90–95`吞掉installs错误并设空数组，`src/RuleInstall.jsx:340–344`显示假空，违反PRD诚实状态。
- **D-R1：覆盖手改授权跨目标残留。** `src/RuleInstall.jsx:28,60–74,149–153,187–190`不重置overwrite；AGENTS的勾选流入CLAUDE普通预览，违反受控写入权限。
- **D-R2：未知结果锁随关闭丢失。** `src/RuleInstall.jsx:32,46,100–107`只用组件状态，响应丢失后关闭重开就能重新预览，check调用仍为0，违反未知先查询。

没有额外smell建议；必要的类型枚举与防护重复未误报。该轴最严重层级为重要。

## Spec

**不通过：6项重要，0致命。** [独立报告及契约出处](evidence-2026-09-29-codex-review-2.3-rules/spec-review.md)。不按旧草案误报“装入记录未进主库”；仅存私有`data/rule-operations/`是已修订契约。

| Spec项 | 位置 | 已核实问题与影响 |
|---|---|---|
| S1 · D-R2 / D-R5 | RuleInstall:32/100–120；server/rule-templates.mjs:741–746 | 未知ID关闭后丢失；check不经串行屏障，rename仍暂停时已返回matches_before，释放后同一写入成功。核对不能据此结清在途操作 |
| S2 · D-R1 | RuleInstall:28/60–74/149–153/187–190 | 对A勾选覆盖后切B，B普通预览携带overwriteDrift=true，跳过B的手改默认拒绝。通用最终写入确认仍存在，不声称自动无确认落盘 |
| S3 · D-R4 | rule-templates.mjs:749–759；src/pending.js:12–20 | v1已装，v2在rename前失败；文件仍v1、结果matches_before，列表却改成v2，抹去应有升级提示。界面仍有未确认标记，不声称它宣告成功 |
| S4 · D-R6 | rule-templates.mjs:217–220；config-journal.mjs:162/205/263–272 | 两版约140KiB的合法模板升级生成288023字节记录，超过复用读取器256KiB上限；目标未改，记录留存后列表拒读，后续prepare先list也会受阻。需对称读写上限及已有坏记录恢复路径 |
| S5 · D-R3 | App.jsx:90–96；RuleInstall:340–344 | installs接口503被显示成0装入，升级提醒也丢失 |
| S6 · D-R7 | src/DiscoveryPages.jsx:277–324 | RULE-TEMPLATES:57要求项目详情显示已装模板与版本，实际缺少。合成安装成功并回读版本后仍无展示，属于明确需求缺口 |

该轴最严重层级为重要。Standards与Spec按各自标准分别成立，不能用一轴抵消另一轴。

## 模板内容

**暂不通过。** [完整审核与桌面演练](evidence-2026-09-29-codex-review-2.3-rules/template-review.md)。审核对象仅两条分隔线之间的正文，未改写。

- **T-R1｜重要阻断：持续写入防覆盖规则遗漏。** 草稿第41行只在扩围或批量命令前检查认领，省掉COLLABORATION:23每个新增写入批次复核、:24每次编辑目标漂移检查、:16撞车/未知变化/身份冲突停写对齐。Agent在旧范围内第二批普通编辑时可能依赖过期认领继续写。“只有一个写入者”“保留他人改动”是目标，不能代替失效检查。最小返修是恢复这三项，不需要新增自动锁或更重流程。
- **T-S1｜建议：** 第56行把“没有自动通知”写为所有项目事实；宜按实际已核实、已授权通道分支。单独不阻断。

唯一状态、本人已读、权限边界、未知先查、交接留证与不代签等内容通过桌面演练。桌面演练不是装入真实项目运行验证。

## 独立验证

[逐项说明、首次异常及限制](evidence-2026-09-29-codex-review-2.3-rules/verification-summary.md)｜[全部命令和首次退出码](evidence-2026-09-29-codex-review-2.3-rules/regressions.json)

| 检查 | 结果 |
|---|---|
| npm test | 首次421/421，0失败/跳过 |
| browser/accessibility/migration/history-capacity + 全部*-browser | 首次25/25 |
| visual独立标签 | problems=[]，120张合成截图；抽查相关截图，非120张逐张人工验收 |
| 服务端补充探针 | 8组：5组边界成立、3组复现缺陷；缺陷复现的脚本退出0不代表业务通过 |
| 浏览器补充探针 | 4组最终均复现；保留首次中断、定位器超时及定向重测记录 |
| 临时构建 | 13/13与dist逐字节一致，项目dist未改 |
| 127.0.0.1:5178 | PID47747，cwd正确；HTML/JS/CSS3/3字节一致；空preview请求证明2.3路由已加载且在读主库前拒绝 |
| 代码及模板 | 165文件0漂移，草稿哈希不变 |

证据：[边界探针](evidence-2026-09-29-codex-review-2.3-rules/boundary-probes.json)、[未知/读取失败](evidence-2026-09-29-codex-review-2.3-rules/browser-probes-attempt2.json)、[跨目标覆盖](evidence-2026-09-29-codex-review-2.3-rules/browser-probes-overwrite-only.json)、[项目详情回读](evidence-2026-09-29-codex-review-2.3-rules/browser-probes-project-only.json)、[缺陷截图](evidence-2026-09-29-codex-review-2.3-rules/browser-probe-screenshots/)、[运行与构建](evidence-2026-09-29-codex-review-2.3-rules/runtime-verification.json)、[实际2.3路由](evidence-2026-09-29-codex-review-2.3-rules/live-route-check.json)。

保留的首次异常：全dist HTTP核验遇旧theme PNG404后中止，后续同一构建记录每项状态；实际入口3文件匹配，另10个未被当前src/index引用的旧PNG仍404，不能说13个都已HTTP验证通过。新D-R1探针最初定位器超时，保留原脚本/JSON/日志，修正探针后只重跑该项。5张自编探针截图因URL编码曾短暂落在编码同级路径，已逐字节迁回登记目录并仅清理自建原文件与空目录，见[screenshot-path-repair](evidence-2026-09-29-codex-review-2.3-rules/screenshot-path-repair.json)。这些工具问题未修改业务代码或测试断言。历史Skill副本偶发超时本轮通过，但未定位修复。

## 主库变化与收录结果

审核阶段始终只计算真实`data/CURRENT.json`的哈希，不读其内容。

| 时点 | SHA256 | 归因 |
|---|---|---|
| 输入交接预期 | eba3bfd689fc3dfdb1964c943f20a7cf0240a45bf74a908d639a9b732179ef53 | 上轮快照 |
| 本轮开工及回归/构建核验时 | 9e47379bacc94e10075aea417379ee16b361d714a993889bc0d737d3f9b392c6 | 用户确认已知操作，授权作为审核基线 |
| 收尾 | 4a2e75e5b0c598a74a6c5ed8b69c4995ac72a41a58f774d9e2e3ec015dacdd20 | 用户明确确认复核期间本人新建规则等工作台操作，确认无误 |

**不能报告“审核期间主库哈希不变”；应报告“用户并行真实使用使主库变化，本轮助手未写真实主库”。** 未读取或核验用户新建规则的内容，不推断其与待审核模板相同。

**本轮助手收录：未执行。** 两项审核均通过的门禁不满足；没有使用正常保存路径写入“项目协同协议”，没有给用户自行创建的规则代签审核通过。未来通过后仍需按授权规则选择类型、名称并原样保存指定正文；先查是否已有同名内容，不盲目重复创建。

## 实际写入与权限

只更新CURRENT，并新增本交接、独立证据/报告/隔离探针及其产物、指定visual标签目录。业务代码、原测试、依赖、dist、模板草稿未改。测试使用合成主库、合成适配器和合成项目；未读真实Vault、凭据文件、私人会话，未改Agent配置，未接收费模型或外部写入。未重启5178，未安装到真实项目，未提交推送。

证据层级：代码独立检查**未通过**；合成环境常规回归**通过但补充边界失败**；实际5178静态资源和2.3路由**已核验**；本轮真实收录**未执行**；真人2.3验收**未进行**。既有1.E完成不被本轮重开。

## 未完成项与唯一下一步

未完成：7个代码问题、T-R1模板阻断；T-S1通知建议；历史Skill副本偶发超时保持原状态。另同毫秒记录顺序、多root列表键仅作为待验证候选，未计入7项。没有修改方案或已完成修复的暗示。

**唯一下一步：Claude读回WB-20260929-72及本交接，核对固定指纹，按协作协议认领并处理2.3与模板返修，再交Codex复核；两项均通过后才考虑收录。** 2.1继续暂缓，装入真实项目继续需要用户单独授权。没有向Claude客户端发送消息或声称其已接手。

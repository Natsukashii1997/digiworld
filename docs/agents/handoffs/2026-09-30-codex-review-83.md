# Codex → Claude｜认领83独立复核与模板收录

输入 **WB-20260930-84** → Codex认领 **85** → 输出 **WB-20260930-86**。唯一目录 `/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench`。

**A通过：D-R3两处残留闭合，原首败的测试竞态机制已独立确认。B通过本轮代码/本机运行和T2视觉复核，保留非阻断建议。模板内容未变，沿用76内容通过结论；本轮已真实收录“规则 / 项目协同协议”，正常保存后回读4035字节与批准稿一致。未装入任何真实项目。**

## 基线、差异和权限

- 当前[172文件清单](2026-09-30-claude-83-code-baseline.sha256) SHA256 `9aa2e02351db2f1256b6b289a0a34ea1a42fc0d887f30f9730599645ff8fb9f4`。开工和结束匹配；相对77版 **13修改、0新增、0删除**，13前像均与旧清单一致。
- A阶段清单 SHA256 `e005b6284fd299ad3079997892ebf6f4cc8a8a8cc46f7f892fbf060991ac394e`，逐项符合A改动、B未改的中间状态；A5文件、B8文件互不重叠。
- [固定A差异](evidence-2026-09-30-codex-review-83/fixed-A.diff) SHA256 `4c4f27ed88bd50ddf42ce44c41951e2d934a4f4e2b52c5a7454ab89f61a7053a`；[固定B差异](evidence-2026-09-30-codex-review-83/fixed-B.diff) SHA256 `846a6fc0320a76ccb9a42081d2716db666c9ac0f9b10ed00e344a832087689fe`。PRD差异、设计与dist指纹见[baseline.json](evidence-2026-09-30-codex-review-83/baseline.json)。上级Git HEAD仍不作为未跟踪应用基线；未提交或推送。
- 本轮未改业务源码、正式测试、依赖、PRD、设计参考、模板、dist。写入仅CURRENT、本交接、[证据目录](evidence-2026-09-30-codex-review-83/)、独立visual输出与合成测试自有临时夹具；两审通过后通过正常API新增一份真实规则资产。未读真实Vault、凭据、私人会话，未改Agent配置或项目规则，未启动2.1或UI v13.2。

## Standards

**A/B均无致命或重要发现。** A的原证据建议（Claude诊断12次原始日志未归档）由本轮独立顺序对照补足机制证明，不伪造原日志。B保留2项建议：复制期间焦点改变使飞入起点漂移；animate同步异常留下装饰节点。两项根代理均已复现，使用记录仍正常保存，故维持非阻断等级。

## Spec

**A/B均无致命或重要发现。** A1项建议：重读期间旧升级行可加待更新标记，当前已有整体加载说明，因此不阻断已登记的两处空态修复。B1项建议：飞入应绑定原触发按钮，见上述同一问题。未发现越界实现。两轴分别保留、不合并计数，完整位置/标准/证据见[review-axes.md](evidence-2026-09-30-codex-review-83/review-axes.md)。

## A：原残留与首败因果

1. **写后重读**：合成规则首次列表为空，经正常预览确认装入，挂起后续installs；服务端真实有1条记录。规则和项目详情均显示读取中，无“没有装入”；放行后显示记录。覆盖上轮原始零→一场景，不只复用Claude的已有2条→撤回场景。
2. **待处理初次加载**：合成规则已装v1并更新v2，挂起installs。首页/待处理显示读取说明、无确定空结论；放行后出现1项可升级。[脚本](evidence-2026-09-30-codex-review-83/a-residual-probes.mjs)、[结果](evidence-2026-09-30-codex-review-83/a-residual-probes.json)及同目录截图。
3. **旧测试顺序对照**：没有手动fulfill响应。旧序列先unroute，记录到 t=365ms解除完成、367ms浏览器收到200、369ms清锁，再reload自然无锁；服务端仍仅1条装入。新序列先reload再unroute，刷新前没收到响应，操作ID/核对按钮/预览锁均保留，核对确定结果后解锁。[脚本](evidence-2026-09-30-codex-review-83/a-race-order.mjs)、[逐事件JSON](evidence-2026-09-30-codex-review-83/a-race-order.json)。本证据支持“旧等待区间内完成响应正常清锁，测试却仍期待锁”的因果；不能用它代签Claude12次中的具体每次事实。

正式修正脚本本轮首次通过，保留原服务端已处理、响应在途、刷新必须先核对的验收语义；没有降低断言。D-R2原锁机制、D-R1/D-R4～D-R7既有服务端保护继续通过当前正式回归。本轮服务端未改，未重复前轮全部扩展探针。

## B：参考、运行与视觉

当前依据为[13.1b预览](../../design/ui-v13/13.1b-size-and-egg.html)与其partner-lcd.js。两份归档与用户此前给出的Claude临时原件逐字节相同；运行源引擎也与归档JS相同。[来源核验](evidence-2026-09-30-codex-review-83/authority-provenance.json)。未引用13.2/13.3来扩大本轮范围，生成预算0。

独立对照将参考容器在浏览器DOM内调为运行实际尺寸，同viewport、春季静止帧和减少动态效果：

| 场景 | 容器 / 画布 | 对照 |
|---|---|---|
| 1440×900侧栏 | 187×60 / 186×60；点距3px | canvas逐字节一致；余量小于一个点 |
| 1440×1000侧栏 | 187×86 / 184×84；点距4px | canvas逐字节一致；余量小于一个点 |
| 首页暴龙机 | 原设备容器、同静止帧 | canvas逐字节一致 |
| 手机320/375/393/430 | 实际整页 | 无横向溢出；继承收起侧栏、隐藏首页设备行为 |

正式partner-browser通过尺寸切换、动态画面、复制飞入与正常清理、键盘戳一下、≥44px、axe、运行中减少动态效果热切换和离屏抑制。独立异常注入：animate抛错时使用记录 **0→1且持久化成功**，业务隔离通过；1.2秒后仍1个装饰节点、未发接住事件，留为建议。延迟剪贴板后改变焦点，飞入起点确为新焦点元素，留为建议。[运行探针及结果](evidence-2026-09-30-codex-review-83/b-runtime.json)。

**T2：VISUAL_PASS（仅本轮伙伴屏范围）**。独立视觉子代理查看三组局部配对及1440×900、1440×1000、393整页，确认铺满、放大、对称椭圆与既有风格一致；无必须返工的视觉项。authority包 `b17bf28006f5d155f64af7dd3152ba5e019f73f2517e87d3ec1bc373e2f84f62`，运行dist包 `5af5048324c7b94b2f222b14777e1f7443f2f223bf82750d1e1753b64b320651`，算法/文件映射/QA见[t2-input.json](evidence-2026-09-30-codex-review-83/t2-input.json)，完整门禁记录见[t2-review.md](evidence-2026-09-30-codex-review-83/t2-review.md)。静态对照不代替逐季动态观赏、真人体验或读屏验收；未做长时CPU实测。

## 独立验证与保留的失败

| 检查 | 本轮结果 |
|---|---|
| `npm test` | 首次 **427/427** |
| browser/accessibility/migration/history-capacity + 全部23个*-browser | 首次 **27/27**，[逐项日志索引](evidence-2026-09-30-codex-review-83/regressions.json) |
| `node tests/visual.mjs codex-review-83` | 首次完成，problems=[]，120张合成截图；[目录](../../../test-results/visual/codex-review-83) |
| A独立探针 | 两处原残留通过；新旧测试时序对照符合上述因果 |
| B独立探针 | 尺寸/静止参考对照/窄屏通过；异常隔离通过；复现2项非阻断装饰建议 |
| 临时目录构建 | 13/13与dist一致，dist与开工指纹一致，未覆盖项目dist |
| 5178 | 现场仍PID46572、唯一项目cwd、只监听127.0.0.1；当前HTML/JS/CSS 3/3与dist字节一致。本轮未重启；服务端代码未改。 |

不能遗漏的失败：自写B探针首次错误地寻找精确“今日”标题，30秒超时；修正定位器后第二次因假定合成seed一定有assetActivity数组而抛TypeError；保留 `b-runtime.attempt1.*`、`attempt2.*`，补正确空兼容后只重跑未完成的边界段（`--boundary-only`）成功。前两次已取得的视觉对照不冒充整个脚本通过，最终JSON按已完成阶段汇总。两项是探针错误，未改产品或正式测试；没有删首败日志。

Claude83的Skill副本首轮/重跑失败记录和此前usage-browser偶发问题仍保留。当前通过不是原因定位，也不能证明与83无关；本轮没有反复重跑已通过的全套脚本。[构建、进程和审核期哈希](evidence-2026-09-30-codex-review-83/closeout-verification.json)。HTTP范围只核当前HTML/JS/CSS，不称未引用的旧theme图片全部可达。

## 模板真实收录

审核期间仅核真实 `data/CURRENT.json` 哈希，始终 `36f1a7889ea0b4acc7b8a1141ee6a0fb8bf61a2df2fc0cde998351a63a78362e`，未读内容。A和模板门禁通过后，转入用户已授权收录阶段；阶段边界见[intake-gate.json](evidence-2026-09-30-codex-review-83/intake-gate.json)。模板稿文件仍为 `d5274199dde4c0f3a5a18bb7071a7f8ec02c690b7faa862bf36f5b8522f51b0f`，未改正文。

- 收录前通过正常工作台API查重：所有版本中标题为“项目协同协议”的候选 **0**，未覆盖用户自建资产。
- 调用与编辑器相同的 `makeAsset` → `writeState` → `PUT /api/workspace`，保留revision冲突保护；不是直接改data文件。保存前留操作计划，若结果不明先按资产ID回读，不自动重放。
- 类型 **Rule（规则）**，名称 **项目协同协议**，版本 **v1.0**。正文严格取两分隔线之间的完整行，含首尾空行 **4035字节**，SHA256 `149f69e570f22209a9b0310c4b3185bcbccdc8797f5c8fa201fef38ee7d57da9`。
- 资产ID `c8a6576f-49d8-4575-984e-8d3bfe6ad92b`；版本ID `5d988b40-74dd-4955-9604-257d6394662a`。正常保存 **1次**，revision **57→58**。
- 重新GET主库，仅在进程内验证目标资产/版本/全文字节一致、其他资产及其顺序和其余业务字段逐项未变。完整主库和会话令牌未打印或另存证据。
- 收录后指针SHA256 `2457568d1728d885b7556c67af5fd8b77ae45c04283237c92d1b49446826bbf4`。这是本轮明确授权的收录变化，与审核期不变分别记录。[查重](evidence-2026-09-30-codex-review-83/intake-inspect.json)、[操作计划](evidence-2026-09-30-codex-review-83/intake-plan.json)、[保存回读结果](evidence-2026-09-30-codex-review-83/intake-result.json)、[执行脚本](evidence-2026-09-30-codex-review-83/template-intake.mjs)。

使用入口：刷新工作台 → 资产仓库 → 类型“规则” → “项目协同协议”。目前只是收录；装入任何真实项目仍需用户另行授权。本轮没有调用真实规则安装API。

## 结论层级、未完成项和下一步

- 代码检查：A/B本轮通过，三项唯一非阻断建议保留（A旧升级行标注；B原点击源；B异常节点清理）。纯复核未代修。
- 本机运行：正式回归及已列隔离边界通过；B关键视觉T2通过，未做全季节动态观赏、长时性能、真机/真人读屏测试。
- 真实收录：已保存并回读；真实项目装入、模板实际协作效果及本轮B真人使用验收均未代签。已完成的1.E不重开。
- 交接已写入共享目录，写入者释放为无；没有发送跨客户端消息或代签Claude已读。

**唯一下一步：Claude实际读回86与本交接，按已确认路线认领UI v13.2；把本轮非阻断建议及历史Skill副本偶发问题保留为明确后续项。** 本轮不实施v13.2，也不启动2.1，不自动装入真实项目。

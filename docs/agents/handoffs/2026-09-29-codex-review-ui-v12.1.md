# Codex → Claude / 用户｜宽屏修复、UI v12、v12.1 独立复核

输入 **WB-20260929-58** → 认领 **59** → 输出 **WB-20260929-60**。2026-09-29，执行者 Codex；只读产品复核，写入者已释放。

**结论：有条件通过。** 宽屏修复、三层导航、诚实规划页、待处理汇总和伙伴调整符合要求；没有发现数据安全或事务语义回归。另有 **D-UI1（重要 / P2）**：641px 宽时顶栏文字被挤成四行并裁切，建议修好后再标记本批完整通过、进入 1.E。Skill 副本历史偶发超时本轮未复现，仍未关闭，不称已修复或已证明与 UI 无关。

## 1. 固定复核范围

需求源：三轮 Claude 交接、产品定义 v1.1、ROADMAP v2、PRD §4 和 §10.5。先读 CURRENT58，确认无人写入；认领59后回读。用同一固定差异分别做 Standards 和 Spec 只读复核，再由根代理结合运行证据判断。

- 从 Codex 1.4 的 157 文件基线依次核对宽屏 → v12 → v12.1：每轮实际改动/新增均与交接一致，所有修改前像匹配上一轮指纹。
- 累计为 **8 个已有文件修改、3 个新增、0 个删除**。已有：`src/App.jsx`、`Home.jsx`、`pages.js`、`pixel.jsx`、`styles.css`，`tests/accessibility.mjs`、`digital-world-ui.test.mjs`、`visual.mjs`。新增：`src/PlannedPage.jsx`、`src/pending.js`、`tests/pending.test.mjs`。
- 当前 **160 文件全部匹配**，src/server/tests 无指纹外文件。server/schema/依赖无变化。
- 指纹清单 SHA256：`03d6d6f9450f656d044a543ca70e16f0477fe81fca8624446fa9b9a9837be34d`；[原清单](2026-09-29-claude-ui-v12.1-code-baseline.sha256)、[本轮固定副本](evidence-2026-09-29-codex-review-ui-v12.1/input-baseline.sha256)。
- 独立合成差异 SHA256：`6b431da6efac6293ebf8b1a25782c1942db2c385580a1571f4272fb0e8fb978c`；[差异](evidence-2026-09-29-codex-review-ui-v12.1/combined-review.diff)、[范围](evidence-2026-09-29-codex-review-ui-v12.1/scope.json)、[逐轮核验](evidence-2026-09-29-codex-review-ui-v12.1/baseline-verification.json)。

## 2. Standards

**0 项硬违规，1 项低维护债。** 新页面只读已有状态，动作仅跳转或打开既有入口；未改变 schema、revision 冲突、不可变历史、写后回读、结果未知先查询、备份合并。沿用设计令牌和像素组件，减少动态效果规则有效。12 类代码异味作为启发检查，没有凑出额外重构要求。

**M-UI1（低）：待处理重复扫描全部活动。** `src/pending.js:9–11` 每份资产调用 `usageOf(asset, 全部活动)`；`App.jsx:174` 每次渲染计算，Home:121 / PlannedPage:114 又算一次。经 schema 校验的纯内存合成容量样本显示，400 / 5000 份资产配 20000 条反馈时，单次开销分别达数十至百毫秒 / 数百毫秒；已有 `usageByAsset` 的同输入分组仅数毫秒。建议将分组汇总复用，并按资产/活动引用缓存。不是当前普通数据量的功能阻断，不强行纳入窄屏小修。

[可复运行脚本](evidence-2026-09-29-codex-review-ui-v12.1/pending-capacity-probe.mjs)和[本轮测量](evidence-2026-09-29-codex-review-ui-v12.1/pending-capacity-probe.json)。这是函数级合成测量，不是实际用户库性能结论。

## 3. Spec

**1 项已复现重要展示缺陷，其余要求对应。** 规划页没有假数据或假动作；四类线索从本机状态派生，保存新版本后旧版需改进反馈退出汇总。伙伴门槛为0/1/3/10，示例与归档不计入；四阶段截图已查看。原有搜索、资产和知识流程通过回归。

### D-UI1：641px 顶栏标题被裁切（P2）

- 位置：`src/styles.css:982` 搜索框长宽规则，与 `5742–5759` 紧凑布局断点；范围是新增顶栏适配，不涉及业务数据。
- 规格依据：PRD §10.2“窄屏可用”；UI v12.1 用户决定“搜索框更长、更明显，视觉上要协调”。
- 复现：隔离 fixture 打开世界总览，视口设为 **641×800**。顶栏仍显示根级面包屑、本机状态和长搜索框，“世界总览”被挤成4行，文字纵向范围 **−12.09～66.30px**，超出顶栏 **0～56px**，顶部实际被裁切。
- 640px 与768px正常；650～740px有两行挤压。原视觉脚本检查2560/1920/1440/1024/390/320，整页横向溢出和 axe 都不会发现这处竖向裁切，因此正式回归全绿与此缺陷并不矛盾。
- [裁切截图](evidence-2026-09-29-codex-review-ui-v12.1/shots/topbar-641.png)、[测量](evidence-2026-09-29-codex-review-ui-v12.1/detail-ui-probe.json)、[明确失败的契约结果](evidence-2026-09-29-codex-review-ui-v12.1/topbar-contract-check.json)。运行 `node docs/agents/handoffs/evidence-2026-09-29-codex-review-ui-v12.1/detail-ui-probe.mjs` 可重新取证，仅使用合成 fixture。
- 建议修法：在空间不足之前启用紧凑顶栏，或允许搜索缩窄并保护标题宽度；补640/641/768等断点邻近测试，断言标题文字完整位于顶栏中。不要只加页面横溢检查。

移动菜单补充：390×844 初始伙伴/保存状态在视口下方，侧栏滚动124px后保存状态位于799～830px，能够到达；1440×600下导航内部滚动、伙伴与保存状态固定可见。没有功能遮断，不另列缺陷；交接中“始终可见”应限定桌面，移动端为滚动可达。

## 4. Skill 副本偶发超时判断

**状态：待验证，未定位根因，未改测试或产品。**

1. 当前 `tests/skill-copies-browser.mjs:502–507` 的 waiter 注册在 release 之前，可以排除普通“监听装晚了”。`SkillCopies.jsx:216–221` 的顺序是 preview → workspace → 检查序号；切换选择只使序号失效，不主动 abort。若 preview fetch/解析失败，过期序号的 catch 会静默处理，所以无 pageerror 不能证明请求链完整。
2. SkillCopies.jsx、api.js、Assets.jsx、components.jsx、skill-copies-browser.mjs、copy-fixture.mjs 六文件与1.4基线逐字节一致。源码未改不能单独证明 UI 时序变化无影响。
3. Claude 提供的失败 trace 没有浏览器网络内容（trace.network为空、无resources），只证明 Node 侧 fetch 200 / fulfill完成，不能证明浏览器已收到并解析预览，也不能从“没等到 workspace 响应”推导“页面没发请求”。其中仍出现黑球兽，属于中间构建，不是最终160文件对应界面的完整运行证据。
4. 本轮正式全量脚本通过。另用当前 dist、真实隔离副本 fixture，交替跑 **40 个局部场景**：一次性 route 20例、持续 handler 20例；每组均含改版本/改目标各10例。都完成workspace回读，迟到预览数量始终0，页面错误0。采集了CDP请求路径、状态、完成/失败事件，不含headers、token或正文。[探针](evidence-2026-09-29-codex-review-ui-v12.1/skill-gate-probe.mjs)、[结果](evidence-2026-09-29-codex-review-ui-v12.1/skill-gate-probe.json)。这不是40次完整脚本，也不是旧版/新版A/B对照。
5. 一次性 route 的拦截撤销与后续请求重叠仍只是机制候选，两种模式本轮都通过，不能选定根因。后续若改同步点，应保留“迟到请求确实结束且旧结果未覆盖”的正面证据，不能只等预览消失（切换选择时本来就会清空）。

## 5. 独立验证与运行采用

全部使用隔离主库、合成来源；以下是本轮独立执行，不复用作者结果。

| 检查 | 结果与证据 |
|---|---|
| `npm test` | **403/403**，0失败/跳过 |
| browser、accessibility、migration、history-capacity及全部`*-browser.mjs` | **24/24**，逐项命令/退出码见[regressions.json](evidence-2026-09-29-codex-review-ui-v12.1/regressions.json) |
| `node tests/visual.mjs codex-review-ui-v12.1` | 14页×6宽 + 6种交互状态×6宽，`problems: []`；[日志](evidence-2026-09-29-codex-review-ui-v12.1/visual.log)，截图`test-results/visual/codex-review-ui-v12.1/` |
| 额外布局与操作 | 320～2560含断点邻近、600px矮窗口；搜索/待处理入口可点击，规划页5个链接跳转正确；D-UI1另行失败；[布局结果](evidence-2026-09-29-codex-review-ui-v12.1/layout-probe.json) |
| 待处理与伙伴 | 通过真实隔离HTTP专用反馈接口形成三类线索，详情/随手记/Agent跳转通过；四阶段伙伴、减少动态效果检查通过；[待处理结果](evidence-2026-09-29-codex-review-ui-v12.1/pending-browser-probe.json) |
| 源码临时重建 | `npm run build -- --outDir <临时目录>/dist --emptyOutDir`通过，全部13个文件与现有dist一致；没有覆盖项目dist |
| 5178实际内容 | PID11559，只监听127.0.0.1；HTML/JS/CSS与dist逐字节一致，未重启；[运行核验](evidence-2026-09-29-codex-review-ui-v12.1/runtime-verification.json) |
| 主库与指纹 | 复核前后160文件相同；`data/CURRENT.json`仅哈希校验，始终 `a74e3e05aabe05d1a0cee1a1365f4ce8afd8bd86c0006ce55efccd793a109db9` |
| 临时测试目录 | 全回归使用专属TMPDIR，结束guiji-ui残留0，自己的临时根已清理；没有扫描/清理其他历史残留 |

截图实际查看：2560总览、1920 Agent/日历、1440体检/有内容收件箱、390协同与导航、320总览，以及伙伴四阶段、641问题图。没有声称人工逐张审阅全部120张。

探针准备中有可复核的夹具错误，保留 `*-setup-error.log` 等原日志：seed缺connections、同hash导航未关闭旧抽屉、用不完整Agent mock导致后续界面不成立，以及通用workspace PUT拒绝改活动。最后改为真实隔离HTTP初始化、通过专用asset-activity接口保存反馈，探针通过。上述早期失败不列产品缺陷，也没有削弱正式断言。

## 6. 边界、交接与下一步

本轮只更新 CURRENT、新增本交接及 evidence 目录、写入测试结果。未修改产品源、正式测试源、依赖或dist；未提交/推送；未读取真实Vault/凭据/私人会话或改真实Agent配置；未接外部系统。主服务只取静态文件，没有读取其真实业务API。

Claude 宽屏阶段自报误复制data并删除，是既有过程事故，本轮未重复复制。原指针哈希不变只证明该指针未改，不能用于证明历史副本已删除；本复核没有读取旧scratchpad或对删除做独立取证。

**唯一下一步：建议 Claude 小修 D-UI1 → Codex复核修复 → 用户做1.E。** 没有自动给另一个客户端发送消息。待处理性能债与Skill超时保留明确状态，不由本次全绿自动关闭。

修复后1.E无需安装新依赖，在本机5178使用界面：选Skill、Prompt、自建流程各1份，依次收录→搜索/标签找到→成功复制→交给选定Agent→真实使用→反馈，再检查最近使用排序、阶段和保存新版体验。任何真实Skill安装/Agent配置、Vault读写都需单独确定精确对象和授权；来源维护未授权时只演示合成路径。当前没有代签真人验收，也未进入第二阶段。

两轴小结：Standards 0硬违规、1低维护债；Spec 1项P2展示缺陷。历史Skill超时仍待定位。

# Codex → 用户 / Claude｜1.3 搜索增强独立复核

输入 **WB-20260929-35** → 复核认领 **WB-20260929-36** → 输出 **WB-20260929-37**，写入者已释放。日期 2026-09-29。

**结论：有条件通过。** 搜索主功能、只读性和数据边界通过；发现2项已复现的交互规格缺口，建议小修后再标记1.3完整收口。没有发现数据安全、schema、revision 或不可变历史方面的回归。本轮没有修业务代码或正式测试，也未实施1.4。

输入：[Claude 1.3 交接](2026-09-29-claude-1.3-search.md)；规格：[ASSET-SEARCH.md](../../../ASSET-SEARCH.md)、ROADMAP 1.3、PRD §4/§8.6。用户调整后的节奏保留：1.1 → 1.3 → 1.4 → 第一阶段整体验收，通过后才进入第二阶段。

## 范围与固定快照

- [157文件代码指纹](2026-09-29-claude-1.3-search-code-baseline.sha256) 全部匹配，清单 SHA256 `623112a7c10b1925c66db309916f1d62b319d8ad30c0bcfb697bdb3ef225fa6f`。
- 与1.1修复基线相比，4修改（App.jsx、Assets.jsx、styles.css、tests/browser.mjs）、3新增（search.js、search.test.mjs、search-browser.mjs）、0删除，完全符合交接。4个重建前像也与旧指纹逐项匹配，无基线外代码文件。
- 根代理独立生成 [review.diff](evidence-2026-09-29-codex-review-1.3-search/review.diff)，SHA256 `655ef96b346c559973447ed5807fc1ca6799ef0573339679f0eec519e94aeaab`；[input.json](evidence-2026-09-29-codex-review-1.3-search/input.json) 记录身份与7文件快照哈希，snapshot/供复核。两轴使用同一快照，结束时源码指纹未变。
- tests/browser.mjs 的1→2断言调整合理：新增第二份命中来自示例工作流正文“项目复盘”，不是削弱正确行为检查。

## Standards

**0项硬性规范违规，1项有证据的维护债。** 冻结合成主库探针确认检索不修改输入；正文/文本文件/二进制/目录区分符合schema，缓存按不可变版本对象工作；前端文本用React插值，沿用设计令牌、组件和44px规则；server、schema、依赖均未改。详见[两轴记录](evidence-2026-09-29-codex-review-1.3-search/axis-reviews.md)。

**M-S1（建议，低）新增浏览器测试未释放 fixture。** `tests/search-browser.mjs:50–59、188、202、234–237` 创建两次fixture，只关页面/浏览器，最后process.exit(0)，没有app.close()。而`tests/fixture.mjs`把服务关闭和临时目录删除放在close中。重复回归会留下两份合成主库，其中一份含约22MB样本。建议统一finally关闭两个fixture及context；不属于产品数据损坏或业务阻塞。

## Spec

**主流程通过，2项已复现的部分实现（重要，P2）。** 资产正文/标签/文本文件、多关键词、随手记/参考/项目、归档计数与范围提示、组合标签筛选、只读和性能要求已验证；没有额外领域写入或范围扩张。

### D-S1：多词跨字段命中时，正文摘录受词序影响

- 契约要求：“正文或文件命中时显示关键词前后约40个字的摘录”。
- 位置：`src/search.js:41–46`。locate只看words[0]，遇到标题等短字段即返回，未继续查其他词在正文中的命中。
- 合成资产：标题“周报整理”，正文“这是合成正文，只有正文包含求助事项。”。搜索“周报 求助”能命中资产，但只有“标题”标记、没有正文摘录；交换成“求助 周报”才有正文摘录。搜索集合正确，命中解释不完整。
- 建议：从所有关键词与命中字段中选择摘录，存在正文/文件命中时展示对应片段，并补关键词换序回归。

### D-S2：空资产类型叠加搜索/标签时仍引导新建

- 契约要求：“筛选条件导致没有结果时，提供‘清除筛选’按钮，不再提示‘新建资产’”。
- 位置：`src/Assets.jsx:322、337`。清除筛选分支额外要求ofType.length>0；该类型为空时，即使已有关键词/标签，仍落入新建分支。
- 合成主库只有1份Prompt，切Skills，输入“求助”并选择标签“验证”：0卡片、0个清除按钮，空态显示“还没有符合条件的资产”和新建入口（连页头共2个新建按钮）。
- 建议：区分未施加搜索/标签时的空分类与施加条件后的无结果；后者提供清除或返回全部类型的明确退出入口。单纯清除关键词后仍为空分类时，也需解释原因，避免承诺清除必有结果。

两项由根代理分别在真实隔离浏览器中复现：[探针脚本](evidence-2026-09-29-codex-review-1.3-search/snippet-probe.mjs)、[JSON证据](evidence-2026-09-29-codex-review-1.3-search/snippet-probe.json)、[标题词在前](evidence-2026-09-29-codex-review-1.3-search/snippet-title-first.png)、[正文词在前](evidence-2026-09-29-codex-review-1.3-search/snippet-body-first.png)、[空分类](evidence-2026-09-29-codex-review-1.3-search/empty-category.png)。探针结束时revision不变，fixture已关闭清理。这两项不影响数据安全，但不应报告为契约全项完成。

## 独立重跑验证

| 验证 | 本次结果 |
|---|---|
| npm test | **390/390**，0失败/跳过，[日志](evidence-2026-09-29-codex-review-1.3-search/npm-test.log) |
| browser、accessibility、migration、history-capacity + 全部20个 *-browser | **24/24 通过**，[逐项退出码](evidence-2026-09-29-codex-review-1.3-search/regressions.json)；本次D-KM也通过，不表示其不稳定已修复 |
| 搜索功能/窄屏/axe/性能 | [search-browser.log](evidence-2026-09-29-codex-review-1.3-search/search-browser.log)；1440/390/320无溢出、44px、WCAG A/AA通过；400份约1520万字符：首次208ms、再次53ms、资产库85ms，均≤500ms，仅为本机本次结果 |
| node tests/visual.mjs codex-review-1.3-search | 四宽度problems=[]，[日志](evidence-2026-09-29-codex-review-1.3-search/visual.log)；截图在test-results/visual/codex-review-1.3-search，另检查了本次320搜索面板及缺口截图 |
| npm run build -- --outDir 临时目录 --emptyOutDir | 成功；全部13个输出文件哈希与现有dist一致，未改项目dist；[build.log](evidence-2026-09-29-codex-review-1.3-search/build.log) |
| 5178与真实主库保护 | PID11559未重启，仅127.0.0.1；实际HTML/JS/CSS与dist字节一致；真实指针哈希不变，[runtime-verification.json](evidence-2026-09-29-codex-review-1.3-search/runtime-verification.json) |

## D-KM：已定位的测试同步问题，交给1.4

Claude改前3/10、改后2/10失败日志确实同一断言，且两个知识维护组件与测试在1.1、1.3、当前文件三方SHA一致。这证明问题改前也存在；小样本比例不能证明发生率或性能完全不受影响。

本轮已查清一个确定的失败机制：

1. `tests/knowledge-maintenance-browser.mjs:313` 首次刷新留下通知；`:331` 第二次刷新等待相同通知，会立即命中旧通知（App通知持续4200ms）。
2. `src/KnowledgeCompilation.jsx:78–85` 在本次workspace响应成功后才增加refreshEpoch；第二次刷新仍进行中时释放impact，页面可以短暂出现检查报告。
3. 原测试`:336`因此可能在真正刷新完成前断言无报告，产生偶发失败。

确定性合成探针3轮、根代理独立复跑1轮，共**4/4一致**：挂住第二次刷新时旧通知可见且按钮为“刷新中…”；释放impact后报告数1；释放刷新响应并等待结束后报告数0；先等刷新真正结束再释放旧impact，报告数始终0。没有复现“刷新完成后仍采用旧检查响应”的产品缺陷。

证据：[目录](evidence-2026-09-29-codex-review-1.3-search/km-probe/)、[可重跑探针](evidence-2026-09-29-codex-review-1.3-search/km-probe/probe-replay.mjs)、[根代理结果](evidence-2026-09-29-codex-review-1.3-search/km-probe/replay-report.json)。下一轮修测试应在释放前注册响应等待器，等待**本次workspace响应和刷新按钮恢复**，再放行旧impact；不要依赖同文案通知或硬延时。刷新进行中是否立即作废报告，可在1.4明确为体验策略，不与刷新完成后的保护混淆。本轮未修改这些文件，不能标为已修复。

## 权限、未完成项与下一步

本轮仅更新CURRENT、新增本复核文件和证据（含合成探针、代码审查快照、日志）；测试生成test-results。没有改业务代码、正式测试、依赖、dist、真实数据或Agent配置，没有重启服务，没有提交/推送，没有另建产品副本。构建临时输出仅用于校验，已清理。未读真实Vault、凭据、私人会话或主库正文；未访问真实业务API或外部系统。

真实data/CURRENT.json前后SHA256：`a74e3e05aabe05d1a0cee1a1365f4ce8afd8bd86c0006ce55efccd793a109db9`。

唯一下一步：**收口1.3复核项（建议Claude小修D-S1/D-S2并清理M-S1，Codex复核修复差异），随后进入1.4 v0.17来源维护收口，首先修正D-KM测试同步。** 尚未分配或启动另一客户端任务；用户决定的第一阶段整体验收安排不变。

两轴总结：Standards 0硬违规、1低维护债；Spec 2项部分实现，影响命中说明与无结果退出；不存在用全量测试通过抵消规格缺口的结论。

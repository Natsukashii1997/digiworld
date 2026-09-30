# Codex → 用户 / Claude｜1.3 修复差异独立复核

输入 **WB-20260929-39** → 认领 **WB-20260929-40** → 输出 **WB-20260929-41**，写入者已释放。执行者Codex，2026-09-29。

**结论：原D-S1、D-S2、M-S1全部闭合；本轮整体仍为有条件通过。** 补测发现1项重要展示缺口D-S3：长文件名仍挤压/撑宽搜索结果。建议完成该项布局收尾再进入1.4。本轮只读复核，没有修业务代码或正式测试，没有实施1.4。

输入：[Claude修复交接](2026-09-29-claude-1.3-fix.md)；前轮：[Codex复核](2026-09-29-codex-review-1.3-search.md)；规格：[ASSET-SEARCH.md](../../../ASSET-SEARCH.md)的复核修复与验收段。第一阶段顺序保持1.1→1.3→1.4→整体验收，通过后才进入第二阶段。

## 基线与范围

- 新[157文件指纹](2026-09-29-claude-1.3-fix-code-baseline.sha256)全部匹配，清单SHA256 `2a303d8550fc969b08789c21155bbe0d9c023884c8294d5a057ecd1f3f49bc18`。
- 与1.3-search指纹相比：只有src/search.js、src/Assets.jsx、src/styles.css、tests/search.test.mjs、tests/search-browser.mjs这5文件修改，无新增/删除，无清单外代码；5个前像与输入基线全部匹配，符合交接声明。依赖、server、schema未变。
- 独立生成的[review.diff](evidence-2026-09-29-codex-review-1.3-fix/review.diff) SHA256 `6adabaa3691811b6f5cac2d3393b6b3d5b8085144cf9f450b0ce5c43f790ec8f`，身份和各文件哈希见[input.json](evidence-2026-09-29-codex-review-1.3-fix/input.json)。两轴审查使用同一固定快照，结束再次验证代码未变化。

## Standards：通过

没有发现硬性规范违规、数据写入或新增实质维护债。沿用React转义、不可变版本缓存、现有设计令牌与组件；没有扩大到真实数据或外部系统。

M-S1已修复：session()把创建的fixture/context立即登记，finally逆序关闭，app.close()负责删临时库。本轮专门给正式search-browser设置一个全新的独立临时根，运行前0个、运行后0个guiji-ui目录，退出0；[fixture-cleanup.json](evidence-2026-09-29-codex-review-1.3-fix/fixture-cleanup.json)。未扫描、读取或清理用户已有的19个历史临时目录，也不代签此前5个目录清理的内容归属。

## Spec：有条件通过

### 原三项修复成立

- D-S1：独立单元/浏览器验证“周报 求助”与“求助 周报”均显示“标题、正文”及相同摘录；另测标题与文件正文双序、文件路径/正文多词组合。原来因词序漏掉正文摘录的问题已闭合。
- D-S2：关键词/标签/收藏等条件下的空分类显示无匹配及清除入口；当前分类本身为空时有原因说明和“查看全部类型”。根代理验证查看全部类型保留输入和标签、清除后仍留在空分类并恢复新建引导；按钮44px、桌面两按钮并排。
- 普通中文标题/正文在1440/640/390/320四宽度实际截图可读；≤640元信息确实移至下一行，320正文可用宽218px。上一轮仅检查整页无溢出不足以证明文字可读；本轮补了文本区宽度、内部容器和截图核验。

### D-S3（重要，P2）：长文件名仍挤压标题，窄屏内部横向溢出

位置：`src/styles.css:2876–2896、5272–5278`，尤其small没有允许收缩、宽度上限或长路径断行。桌面仍把长元信息与标题并排；移动端虽然换行，但长文件名的最小宽度仍撑大整行。

合成合法Skill：标题“格式检查技能”，文本文件`scripts/generate_monthly_summary_for_workbench.py`包含`filemarker`。⌘K搜索“格式检查 filemarker”。该路径仅48字符左右，属于普通脚本命名，不是500字符极限探针。

| 屏宽 | 实测影响 |
|---|---|
| 1440 | 搜索行590px，标题/摘录只剩45.5px，每行仅两三个字，难读 |
| 390 | 搜索结果内部横溢37px，右侧文字裁切，需横向滚动 |
| 320 | 搜索结果内部横溢107px，标题/摘录区随行被撑宽，右侧内容裁切 |

正式测试只检查document层的横溢，而且窄屏用的是没有长路径的“周报”结果，所以仍全绿。不能把它解释为此边界已通过。

建议修复范围：约束元信息的宽度、允许收缩和长路径断行；桌面也需给标题/摘录保留合理宽度。可沿用现有视觉方向，不需要新组件或依赖。回归应包含真实长度的文件路径，检查.search-results内部横溢、标题区宽度、320/390/1440截图及44px/焦点/axe。

证据：[可重跑合成探针](evidence-2026-09-29-codex-review-1.3-fix/fix-probe.mjs)、[完整观测JSON](evidence-2026-09-29-codex-review-1.3-fix/fix-probe.json)、[第一次越界断言失败](evidence-2026-09-29-codex-review-1.3-fix/fix-probe-first.log)、[1440截图](evidence-2026-09-29-codex-review-1.3-fix/palette-file-1440.png)、[390截图](evidence-2026-09-29-codex-review-1.3-fix/palette-file-390.png)、[320截图](evidence-2026-09-29-codex-review-1.3-fix/palette-file-320.png)。后续观测式探针继续跑完所有分支以留图，JSON明确`originalFixesPassed:true`、`passed:false`；退出0不代表越界通过。fixture结束后关闭清理，revision未变。

### 低优先级建议（不阻断）

同一位置的前缀关键词会令摘录末端略受词序影响：正文`running `加100个x，查询`run running`与反序，摘录分别44/48字符。两者都显示正文，原漏摘录缺陷已解决。若未来要求逐字相同，可对同位置命中选较长词；本轮不扩大为阻断项。

## 独立验证

| 项目 | 结果 |
|---|---|
| npm test | **391/391通过**，0失败/跳过；[日志](evidence-2026-09-29-codex-review-1.3-fix/npm-test.log) |
| 全部browser/axe/migration/history-capacity及20个*-browser | **24/24通过**；[退出码](evidence-2026-09-29-codex-review-1.3-fix/regressions.json)及同目录逐项日志 |
| search-browser | 原修复/组合筛选/1440、390、320/44px/WCAG A-AA通过；400份约1520万字符实测首次111ms、再次26ms、资产库53ms，均≤500ms；[日志](evidence-2026-09-29-codex-review-1.3-fix/search-browser.log) |
| node tests/visual.mjs codex-review-1.3-fix | 1440/1024/390/320四宽度problems=[]；[日志](evidence-2026-09-29-codex-review-1.3-fix/visual.log) |
| 扩展修复/布局探针 | 原D-S1/D-S2通过；D-S3内部容器与可读性检查未通过，见上方实测与截图 |
| npm run build -- --outDir 临时目录 --emptyOutDir | 成功，全部13个文件与现有dist哈希一致，未改项目dist；[build.log](evidence-2026-09-29-codex-review-1.3-fix/build.log) |
| 5178 | PID11559未重启，HTML/JS/CSS与dist逐字节一致；[runtime-verification.json](evidence-2026-09-29-codex-review-1.3-fix/runtime-verification.json) |

性能只记录本机时点结果。前后浏览器耗时不同及Node微基准，足以表明本次未超过验收阈值，不足以单独证明差异全部由机器负载造成。

D-KM本次也通过，但该测试同步问题没有改动，前轮定位仍有效，留给1.4；不因一次通过标为已修复。

## 权限与状态

仅更新CURRENT，新增本复核交接、证据及测试自己的test-results输出。没有修改业务代码、正式测试、依赖、dist或服务，没有提交/推送，没有另建产品副本，没有启动1.4。构建只生成临时产物用于比较后清理。

只使用隔离fixture与合成资料，未读真实Vault、凭据、私人会话或真实主库正文，未改真实Agent配置，未访问真实业务API或外部系统。真实`data/CURRENT.json`前后SHA256保持：`a74e3e05aabe05d1a0cee1a1365f4ce8afd8bd86c0006ce55efccd793a109db9`。

唯一下一步：**收口D-S3长文件名搜索布局（建议Claude小修、Codex复核），之后进入1.4 v0.17收口，首先修D-KM测试同步。** 1.4执行分工待用户确认，尚未启动另一客户端任务；第一阶段整体验收安排不变。

两轴总结：Standards无未关闭发现；Spec剩1项重要展示缺口、1项低建议。正式回归通过不抵消扩展检查的已复现问题。

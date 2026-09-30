# Codex → 用户 / Claude｜1.3 D-S3 修复独立复核

输入 **WB-20260929-43** → 认领 **WB-20260929-44** → 输出 **WB-20260929-45**，写入者已释放。执行者Codex，2026-09-29。

**结论：D-S3复核通过，1.3开发与独立复核收口。** 前轮D-S1、D-S2、M-S1已闭合，本轮长文件名的挤压/内部横溢也已消除。第一阶段真实使用验收尚未进行，1.4尚未启动。

输入：[Claude D-S3交接](2026-09-29-claude-1.3-ds3.md)；复核规格：[ASSET-SEARCH.md](../../../ASSET-SEARCH.md)及[前轮D-S3复现](2026-09-29-codex-review-1.3-fix.md)。保留第一阶段顺序1.1→1.3→1.4→整体验收，通过前不进第二阶段。

## 固定基线与实际范围

- [新157文件指纹](2026-09-29-claude-1.3-ds3-code-baseline.sha256)全部匹配，SHA256 `bc0ac1bba3ea3ce17ce0ffad19f334a6d38557a49c72de9c7a60c2894959cdd0`。
- 相比1.3-fix基线，只有`src/App.jsx`、`src/styles.css`、`tests/search-browser.mjs`三文件改变，无新增/删除和清单外代码，3个代码前像均与旧基线相符。另有Claude声明的契约、状态、交接证据和dist更新。
- 根代理独立生成[review.diff](evidence-2026-09-29-codex-review-1.3-ds3/review.diff)，SHA256 `1dd4a9cc6f3faf050042a163afec817b30e05a1c7028f76b2da645ba9822b771`。双方审查代理使用同一snapshot；[input.json](evidence-2026-09-29-codex-review-1.3-ds3/input.json)固定文件哈希、HEAD及输入指针。应用未跟踪，Git HEAD不作为代码基线。
- 本轮复核没有修改业务代码、正式测试、依赖或dist；157文件指纹在结束时再次全部匹配。

## Standards

**通过，0项发现。** 沿用SearchHit、现有令牌与视觉方向；没有新增组件或依赖，没有触及存储和事务语义。测试夹具与计数调整一致，清理路径保持。[两轴报告](evidence-2026-09-29-codex-review-1.3-ds3/axis-reviews.md)。

## Spec

**通过，0项本轮规格缺口。** 资产、参考、项目的命中位置移入标题列，标题、摘录、路径可断行；类型/版本、随手记日期、搜索和点击跳转保持。随手记原有呈现未变，不概括为所有分组新增命中行。

独立复用原合成Skill和路径`scripts/generate_monthly_summary_for_workbench.py`，查询“格式检查 filemarker”；没有原地重跑旧证据目录的脚本。新[ds3-probe.mjs](evidence-2026-09-29-codex-review-1.3-ds3/ds3-probe.mjs)增加所有宽度标题列≥60%、完整命中位置、真实Tab焦点、44px和长路径场景axe检查，断言失败会以非零退出。

| 屏宽 | 标题列 / 行宽 | 结果内部横溢 | 截图 |
|---|---|---|---|
| 1440 | 451.5 / 590px（原45.5px） | 0 | [桌面](evidence-2026-09-29-codex-review-1.3-ds3/palette-file-1440.png) |
| 640 | 538 / 586px | 0 | [640](evidence-2026-09-29-codex-review-1.3-ds3/palette-file-640.png) |
| 390 | 288 / 336px | 0 | [390](evidence-2026-09-29-codex-review-1.3-ds3/palette-file-390.png) |
| 320 | 218 / 266px | 0 | [320](evidence-2026-09-29-codex-review-1.3-ds3/palette-file-320.png) |

四张长路径截图逐张查看：标题/摘录可读，文件名完整换行，类型仍可见；无文字裁切。四宽度长路径axe均无WCAG A/AA违规，Tab到结果后为2px solid焦点，按钮≥44px。原D-S1双序与D-S2退出路径在新探针中仍通过，隔离revision不变，`issues: []`、`passed: true`；[观测JSON](evidence-2026-09-29-codex-review-1.3-ds3/fix-probe.json)。专用临时根的探针fixture清理后为0；[清理结果](evidence-2026-09-29-codex-review-1.3-ds3/fixture-cleanup.json)。

## 独立验证

| 检查 | 本轮结果 |
|---|---|
| npm test | **391/391通过**，0失败/跳过；[日志](evidence-2026-09-29-codex-review-1.3-ds3/npm-test.log) |
| browser、accessibility、migration、history-capacity及20个*-browser | **24/24通过**；[退出码](evidence-2026-09-29-codex-review-1.3-ds3/regressions.json)，同目录逐项日志 |
| search-browser | 新长路径断言与原搜索/筛选/跳转通过；400份约1520万字符，首次123ms、再次27ms、资产库45ms，均≤500ms；[日志](evidence-2026-09-29-codex-review-1.3-ds3/search-browser.log) |
| node tests/visual.mjs codex-review-1.3-ds3 | 1440/1024/390/320，problems=[]；[日志](evidence-2026-09-29-codex-review-1.3-ds3/visual.log) |
| 独立长路径/原修复探针 | 通过；四宽度内部横溢0，标题列≥60%，axe/Tab/44px通过 |
| npm run build -- --outDir 临时目录 --emptyOutDir | 成功，全部13个产物与现有dist一致，项目dist未改；[构建日志](evidence-2026-09-29-codex-review-1.3-ds3/build.log) |
| 127.0.0.1:5178 | PID11559，未重启；HTML/JS/CSS与dist逐字节一致；[运行核验](evidence-2026-09-29-codex-review-1.3-ds3/runtime-verification.json) |

探针调试如实保留：首次扩展axe时仍用browser.newPage，axe要求显式newContext而报错；调整后又发现用脚本focus不能证明键盘focus-visible，改为输入框Tab到结果。两次均为验证方法问题，前次日志/JSON以`setup-first-*`、`focus-first-*`保存在本轮证据目录，最终使用真实键盘通过。产品代码没有因此改动，旧复核证据没有覆盖。

全部测试均在本轮专用临时根和合成fixture中运行；结束清理本轮临时根，没有扫描或清理其他历史临时目录，也不代签Claude关于既有19个目录的陈述。

## 未完成项与交接

- **D-KM未修**：本次脚本通过，但同步点误用旧通知的已定位问题仍保留为1.4首项。不能因本轮绿灯称其已解决。
- 前缀关键词同起点时摘录尾端长度差异仍是低建议，不影响1.3收口。此前使用阶段/动画等真人体验事项保留至第一阶段整体验收。
- 仅新增本复核交接、证据与test-results输出，更新CURRENT。没有真实Vault、凭据、私人会话或真实主库正文读取，没有真实Agent配置改动，没有外部系统或收费模型，没有提交/推送，没有另建产品副本。
- 真实`data/CURRENT.json`仅比对哈希，前后均为`a74e3e05aabe05d1a0cee1a1365f4ce8afd8bd86c0006ce55efccd793a109db9`。

**唯一下一步：进入1.4 v0.17来源维护收口，先修D-KM测试同步；建议Codex实现、Claude复核，分工待用户确认。本轮未启动1.4或向另一个客户端发消息。** 第一阶段整体验收安排不变，通过前不进入第二阶段。

两轴总结：Standards 0项；Spec 0项。本轮D-S3通过，1.3开发与复核收口，真实使用验收待第一阶段末。

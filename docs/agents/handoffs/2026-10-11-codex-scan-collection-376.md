# 全站扫描线返修与收藏 B 底部铭牌 · 工程交回376

输入：WB-20261011-373 → 认领374（扫描返修）→ 接续375（用户追加收藏）→ 输出376。Codex 完成实现、最终验证、5178 采用及实际路径复核；写入者释放。**Claude 质量验收及常浩最终使用／视觉验收待完成。**

用户截图推翻的小修371及独立复核373的“通过”结论已撤回。本次并未以旧结论代替复核。常浩本轮“把这个一起做了”直接授权接续[收藏 B 派单](2026-10-11-claude-collection-plate-dispatch.md)，在375登记后实施，无需等待原派单重新编号。

## 结果与入口

- 全站可见区域的扫描线统一协调：相同目标、包含关系及屏幕上相交的独立挂载面板均纳入；先判断优先级，再取消旧扫描。
- 收藏采用已选 B：156px 同宽底部细线、单行分组名与数字；分组内隐藏分类小标签，搜索和未分组卡片保留。空组为156×212虚线投放框；悬停／展开／拖入时变青色。
- 铭牌位于倾斜纸堆或完整展开网格的底沿下方；下排分组随实际占用高度后移。纸卡形态、倾斜、分类规则、重命名、键盘、排序、内外拖入均保留。
- 最终构建已由现有5178静态服务采用，实际用户浏览器已刷新到最终 JS／CSS，并停留收藏页；临时尺寸覆盖已复原。

非技术复核入口：[前后对比、B标准、真实截图与验证报告](evidence-2026-10-11-codex-scan-collection-376/report.html)。直接在工作台切到存档点／收藏查看即可，无需安装或操作终端。

## 双线原因与旧验收缺口

旧实现先取消同目标的扫描，之后才检查“读取是否应让位于切页”。首次进入时，主区读取会取消同一主区的切页扫描；内层读取随后又启动，形成两道线。合成复现中切页362ms、主区读取362ms、内层读取503ms，513ms采样出现两个扫描层，与用户截图的现象一致。

另一个边界是搜索等独立挂载面板：DOM互不包含，但实际显示区域与主区重叠。红复现中route106ms、panel162ms，189ms两层相交。本次以可见矩形相交补齐协调。不同、不相交的区域仍可独立反馈；切页结束后的慢读、手动刷新保留读取扫描；成功反馈和减少动态效果规则保留。

373只覆盖已加载页的850ms快速切换，未覆盖首次进入、同目标取消链及独立挂载的相交面板。该验证不足以支持“所有页面已修好”。本次补齐冷启动、慢读、读取失败、减少动态效果、快速切页、手动刷新和早开面板；逐帧检查实际区域相交及退出清理。

## 收藏结构核清及返修

Claude派单中的“展开仅让其他组变暗”不能覆盖多卡分组：代码实际会展开为网格。现有真实收藏每组只有一张卡，因此看起来只发生变暗。本次保留原网格展开，并把铭牌放到整组末行下方，避免多卡展开后撞上铭牌或下排。

独立审查发现三项重要回归与一项建议，均在最终快照中解决，红结果保留：

| 发现 | 处理／最终复核 |
|---|---|
| 新空框吞掉外部拖入，原导入失效 | 只有内部卡片／分组拖动由铭牌处理，外部拖入继续原导入链；框和铭牌均验证，维持原 `loose` 归属。 |
| 铭牌移到底部使工具栏筹码跳到组末尾 | 默认滚动到首张可见卡／空框；重命名单独定位铭牌。 |
| 搜索排除原首卡后仍按原卡定位 | 按筛选后的可见卡选择定位点；390×900时首卡y=199.69，低于工具栏底沿129。 |
| 重命名入口悬停缺少可见反馈 | 补青色文字反馈，规范轴确认解决。 |

## 最终验证

| 层次 | 结果 | 证据 |
|---|---|---|
| 单元 | **1192/1192，fail 0**，串行全量；新增11项扫描协调测试；关键红→绿确认 | [最终日志](evidence-2026-10-11-codex-scan-collection-376/logs/unit-final-checked.log)、logs中的红日志 |
| 浏览器回归 | **17套通过**：原有12专项（含动效）、原收藏3专项、新增全站扫描及收藏铭牌2专项 | [原14套非动效结果](evidence-2026-10-11-codex-scan-collection-376/browser-final/results.json)、[动效](evidence-2026-10-11-codex-scan-collection-376/logs/motion-final.log)、新增两专项日志 |
| 扫描矩阵 | **172场景，overlap 0，errors／blocked为空**；14页×每页12场景＋4边界。390／768／1024／1280／1440／1920；减少动态效果为0扫描 | [原始矩阵](evidence-2026-10-11-codex-scan-collection-376/scan-matrix/report.json)；84张六宽页面图 |
| 收藏专项 | **16条最终记录通过**：六宽折叠／展开geometry与Axe共12条，另含筛选定位、筹码滚动、键盘／保存／排序／内部拖放、外部拖入 | [原始记录](evidence-2026-10-11-codex-scan-collection-376/collection/after/report.json) |
| 对照图 | 1440／390 × 单卡、多卡叠放、展开、长名、空组、拖放悬停，共**12对24张同输入前后图**；附选定B第二排原稿 | [交互对比](evidence-2026-10-11-codex-scan-collection-376/report.html) |
| 两轴独立代码审查 | Standards **0发现**；Spec **0发现**。分别保存，未合并评分 | [两轴原报告及已解决项](evidence-2026-10-11-codex-scan-collection-376/reviews.md) |
| T2视觉 | `design-taste-frontend` 对固定构建及12张收藏截图逐图复核：**VISUAL_PASS，0发现**；结构／样式／资产继承已选B及v14权威，新生图预算／调用0 | [T2记录](evidence-2026-10-11-codex-scan-collection-376/visual/t2-visual-record.md)、[最终QA补充](evidence-2026-10-11-codex-scan-collection-376/visual/final-qa.json) |
| 5178采用 | **17个磁盘文件与验证候选一致，首页根路径及6个assets共7个公开HTTP资源逐字节一致**；PID65924未重启。其余theme文件仅声明磁盘一致 | [采用与保护回读](evidence-2026-10-11-codex-scan-collection-376/runtime-final.json) |
| 实际使用路径 | 用户浏览器侧栏14页，点击起6–13ms首次样本，连续3200ms读取扫描层及位置：**每页最多1道线、相交样本0、结束残留0**；实际收藏1440／390截图已核看 | [实际14页采样](evidence-2026-10-11-codex-scan-collection-376/actual-page-scans.json)、[桌面](evidence-2026-10-11-codex-scan-collection-376/actual/after/1440.png)、[窄屏](evidence-2026-10-11-codex-scan-collection-376/actual/after/390.png) |
| Claude／常浩验收 | **待完成**，工程、视觉和实际路径结果不代签两层验收 | 唯一下一步见下文 |

测试使用合成数据，真实工作台仅导航／读取／展示，未创建存档点、移动或重命名真实收藏。实际页保留3条收藏和5个分组。先期夹具／观测失败、外部拖入红复现和首次全量未完成日志保留在工作目录；未将其计为最终通过。真实尺寸切换后的过渡帧截图已用稳定布局截图替换；最终390文档宽度为390，无横向溢出。

## 范围、固定版本与保护

最终源码／测试仅8个文件：

1. `src/scan-motion.js`
2. `src/collection/app/components/DeskView.tsx`
3. `src/collection.css`
4. `tests/collection-browser.mjs`
5. `tests/collection-redesign-browser.mjs`
6. `tests/scan-coordination374.test.mjs`（新增）
7. `tests/scan-coordination374-browser.mjs`（新增）
8. `tests/collection-plate375-browser.mjs`（新增）

精确 before／after、763行差异及8项SHA见[冻结审查清单](evidence-2026-10-11-codex-scan-collection-376/review-snapshot/manifest.json)和[差异](evidence-2026-10-11-codex-scan-collection-376/review-snapshot/change.diff)。before保存改动前脏树文件，不以HEAD冒充基线。

最终17文件构建清单SHA：`b5b47de39362e65dc096fe03addcbff8f9af82ea7cd1b285bc0b71f6f62d0206`。

视觉权威清单SHA：`e31d3699a86df398897a54b1d40b8ec572d8fd04bd520462fc1fcfe554aeda00`。T2与功能验证的源码／构建相同，之后未再修改产品源码。

初始及最终HEAD均为 `27160d2331746a0be85ef0f616a6b36ec49fe745`。`data/CURRENT.json`、`package.json`、`package-lock.json`、`src/HistoryArchive.jsx`初末哈希一致，实际UI读取后再次回读仍一致。未安装、重启、提交、推送、恢复／清理他人脏树，也未写真实Agent、Vault或外部应用。

工作目录（含先期失败与脚本）：`/Users/nat/Documents/Codex/2026-10-11/readreveal-31ms-199ms-170ms-claude-30/work/`。

## 唯一下一步

**Claude验收扫描返修与收藏B底部铭牌，再由常浩终验实际观感。** 本轮工程工作完成，CURRENT更新376并写后回读，写入者释放为“无”。未向另一个客户端发送消息。

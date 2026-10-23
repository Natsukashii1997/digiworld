# 派单 462 · 逆向 v4 最终交接 471

输入：用户指定 462；实读入口时 CURRENT 已为 WB-20261014-466，写入者无。Codex 认领 467，连续交接段 1→468、段 2→469、段 3→470，最终 WB-20261014-471，回读后释放写入者。

本轮交付是已验证的候选实现；唯一下一步：**Claude 验收逆向 v4**。未发送消息、未假称 Claude 已读取或接手。GET464/按钮466及441待验独立保留。

## 三段完成结果

| 段 | 可观察结果 | 交接 |
|---|---|---|
| 1 | 固定注册版本 REA 子进程取证、真实过程日志、有界摘要/线索、停止/超时/目标变化/重启中断；原始 JSON 直接写本机磁盘 | [468](2026-10-14-codex-reverse-v4-segment1-468.md) |
| 2 | 标本→终端或原件→统一复刻任务包；同字符串预览复制；可选固定版本 Skill，无复刻评分门槛；旧数据只读保留 | [469](2026-10-14-codex-reverse-v4-segment2-469.md) |
| 3 | GitHub/npm 同版本检查→预演→CLI/MCP 适配→用户确认→同版本写入→双客户端及 Skill doctor 回读；未知结果只查询、不重放 | [470](2026-10-14-codex-reverse-v4-segment3-470.md) |

段 3 期间补足两项段 2 终审问题：SKILL.md 正文直接包含有界证据摘要；旧 FN 带图取证完成后刷新任务包，旧 forge 无运行记录仍可查看原固定资产。最终统一复验覆盖这些修正。

## 冻结与证据

- 基线 HEAD：e6e5d8b74474ea408ebb171ab70415e32d57ada4；实际修改基线是 state466 全部 dirty 前像 work/reverse467/before，未恢复或丢弃既有工作。
- 31 个源码/测试/契约文件，17 个候选构建文件，逐项清单：[final-manifest.json](../../../work/reverse467/final-manifest.json)。清单 SHA256：4ae1ba29ba53d30662e2bb155c4bd9f6f9d7d55076b0c09243661133d6ed4918。
- 最终构建：work/reverse467/stage3-dist；实际 dirty 基线增量：work/reverse467/candidate.diff。
- 完整单元串行：1273/1273（final-full-unit-verified.log）；领域/更新：20/20（final-targeted.log）；设计令牌：4/4（final-style-verified.log）；隔离 build 通过（final-build.log，保留既有大 chunk 提醒）。段 1 全量 1253、段 2 全量 1261 的中间检查仍单独保存。
- 最终三宽 1440/390/320 软件与作品全流程、复制、Skill、旧历史：final-flow-browser-verified.log；更新 18 个宽度×状态流程：final-update-browser-verified.log。命令详见 470。
- code-review Spec/Standards 双轴各 0 未关闭发现；最终同构建 T2 VISUAL_PASS，仅视觉。P1 更新模态遮挡和 P2 窄屏页头已关闭；审查绑定与边界见 [final-review.md](../../../work/reverse467/final-review.md)、[design-qa.md](../../../work/reverse467/design-qa.md)。
- 对照：权威 software/artwork/update 的 1440/390，与实际最终 final-ui/、stage3-ui/。所有运行图使用合成数据与假 REA/假网络，不是正式取证证据。
- 主代理 IAB 实际点击至更新预演并回读计划/备份/版本/适配提示；测试独立覆盖假确认和查询。预览端口 57494 与临时标签已关闭。
- 843 基线文件：0 缺失、0 范围外变化；正式 dist 与 data/CURRENT.json、data/collection/state.json 保全，见 protection-final.json。5178 仍原 PID 50894。所有源/候选构建在交接前无漂移。

可打开的汇总与截图副本：本轮 Codex 任务目录 outputs/reverse-v4/report.html。该目录仅是交付副本，项目事实源仍为 CURRENT.md 与本交接。

## 非技术使用说明

本轮无需安装额外组件。候选通过验收并获正式采用授权后，在工作台“逆向工程”使用：

1. 软件：投入参照物，选 Electron 或网站、填写目标/功能/可选英文线索，网站按提示打开独立调试 Chrome 并填本机 CDP 端点；勾选授权并检查目标后开始取证。终端完成且任务包出现即可复制给当前项目中的 Agent。
2. 作品：填写类型、链接/原文/截图和看重点，直接复制任务包；无需运行 REA。
3. 可选“存成 Skill”：核对预览后确认；显示固定资产版本即保存成功。Skill 标记未经复刻验证，保存不等于安装或复刻验收。
4. 更新：检查更新→一键更新→核对目标版本/计划/备份/适配→确认。仅“两客户端及 Skill 版本已对齐”算成功，再重启 Claude Code/Codex。若未知/失败，先查询结果，不反复更新。

常见自查：目标变化先重新检查；网站找不到端点按页面的独立 Chrome 指引；终端失败以记录中的类别、code/message 排查。普通导出及完整备份都只保留有界摘要/日志，**不含原始 REA analysis.json**；原件位于本机 data/reverse-evidence，迁机需要另行处理，不随任务包发送。

## 保留的边界与后续

- 本轮未运行真实 REA/doctor/setup、未实际联网更新/安装、未写真实 Agent 配置、未读取 Vault/凭据/私人会话；测试使用合成资料及隔离适配器。
- 未正式采用候选 dist、未重启 5178、未提交或推送。旧 449/451 的采用授权已使用，不延伸到本轮。
- 工程和 T2 结论不代签 Claude 质量验收、用户验收或真实业务效果。真实新版工具兼容性只在用户点击检查/预演后验证；当前仅验证实现及合成分支。
- REA 提供的既有 .rea.backup 可能早于本次，部分 Skill 计划不提供备份；界面如实呈现，不自动恢复配置。
- 原生/APK/.NET、内嵌模型、自动定时更新、Node/Ghidra 升级均不在本轮。
- 全部首败、纠正和复验保留在 work/reverse467；470 列明段 3 首败，468/469 保留各段首败，不以最终绿灯抹去过程。

**唯一下一步：Claude 读取 CURRENT 与本交接，验收逆向 v4；正式采用/重启及首次小型 Electron 真实取证另取常浩授权。**

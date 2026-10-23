# Claude 复验 511 · 派单 507（Codex 509）：网站免费预检 + AI 同次线索词

| 项 | 内容 |
|---|---|
| 输入状态 / 输出状态 | 实读 WB-20261015-509（写入者无）→ Claude 认领 510 → WB-20261015-511（写入者释放） |
| 范围 | 仅派单 507；按常浩复验指令执行；禁真实模型、真实标本/业务数据写入、dist 替换、部署、重启、配置/凭据修改、提交推送 |
| 结论 | **工程复验通过；真实免费预检通过。可由常浩授权采用与重启。** 返修 R1 为测试脚本健壮性，不阻断采用；S1、S2 为建议 |

## 一、工程复验

1. **冻结清单**：`work/reverse508/manifest.json` SHA256 = `3b34bfc856ac543de730d4c69ed0476bac39c112b5a08a45bab38cd49a53a0ba`（与指令一致）；changed 19 + candidate 19 + authority 6 = 44 项逐项 0 漂移；`changes.diff` SHA256 `b957d998…d29832` 与交接一致。
2. **预检分支与边界**（审阅 `server/reverse-precheck.mjs`、runner `precheck()` 及测试）：唯一精确匹配 → ready；不匹配 → mismatch + 同源候选；重复 → multiple；无同源 / 端点异常 → unavailable。15 秒预算（`AbortSignal.any` 合并父信号）；匹配计数在 `slice(0,10)` 截断前完成；候选排除带 userinfo、空白、凭据模式的 URL 与 target_id，标题经 `safeLine`；临时 `web-check-*` 目录 finally 删除。runner `precheck()` 不创建运行、不写主库，并在前后各核 revision。
3. **改用这个页面**：`saveSpecimenTarget` 先核 revision + 原 target，运行中拒改，写后独立回读核 revision 与 target，不一致报“未启动逆推”；前端 `requestId` 在未知响应时保留并先 `runs/query`，与交接描述一致。
4. **线索词**：提示词要求同次先报告“线索词：…”再调 REA、不另调模型；`clues` 可选，≤8 项、`^[A-Za-z0-9._:/-]{1,60}$`、凭据过滤、去重（严格模式重复即拒），旧结果缺省兼容；结果区区分“标本已有 / AI 补充”，加入标本走同一 CAS 写入回读。
5. **测试**：预检/目标动作/AI 相关 4 文件串行 23/23；全量 `node --test --test-concurrency=4 tests/*.test.mjs` 在无其他负载时 **1314/1314**。三宽浏览器日志与 T2 报告已查阅（未重跑浏览器）。

## 二、真实免费预检（隔离）

- 方式：正式服务同一 node、`PATH=/usr/bin:/bin`；`openRepository` 建**隔离数据目录**（scratchpad 下中文路径），写入一条合成网站标本，目标 `https://app.luzi.top/community`；`createReverseRunner` 使用真实 REA 执行器与真实 doctor 版本读取，`executeAi` 换成“调用即计数并抛错”的禁用桩；只调用 `runner.precheck()`，不走 `start`。
- 结果（[real-precheck.out](evidence-2026-10-15-claude-reverse-precheck-recheck-511/real-precheck.out)）：`status: mismatch`，REA 6.4.0；候选 1 个：`https://app.luzi.top/agents`（标题“炉子”，已脱敏去查询串）；耗时 **5,177 ms**；**AI 调用 0**；隔离 revision 1→1、状态哈希前后一致；reaRuns 0；证据目录仅 doctor 的 diagnostics，`web-check-*` 已清理。
- 未导航、未切页、未开新标签、未读页面正文；真实标本与业务数据未触碰。

## 三、返修与建议（交 Codex）

- **R1（测试健壮性，不阻断采用）**：`tests/reverse-ai-process.test.mjs`“真实OS写入隔离…孙进程”只给 1 秒（100×10ms）等待 `child.pid`；本次在 4 路并发 + 另有真实预检负载时超时失败，且失败路径没有在 finally 中 abort / 结束假进程，遗留 `tests/fake-ai.mjs` 进程（PID 94923，Claude 已清理）导致整个测试文件挂起、全量中断。单独串行 11/11 通过，无负载全量 1314/1314 通过。要求：等待预算放宽（例如 5 秒），finally 中 abort 控制器并按 pid 清理残留，保证失败时也不挂起。
- **S1（文案）**：不匹配提示段落把所有候选（含超长路径）再列一遍，与下方候选列表重复；建议段落只说“调试 Chrome 里没有打开目标 /community；同站已打开 N 个页面：”。
- **S2（视觉）**：`work/reverse508/ui/clues-1440.png` 中“Chrome 调试命令已复制”提示浮层盖住了线索词列表；请确认 toast 位置与持续时间，避免遮挡正文（截图态还是产品行为待确认）。

## 四、尚未验证

- 真实 AI 下的线索词生成质量与“先报告线索词”的实际行为（需常浩额度授权）。
- Claude Code 真实执行（常浩暂缓）。

## 五、边界

Claude 未改业务代码；仅清理本次测试遗留的假进程与其临时目录；未调用真实模型；未替换 dist、未重启 5178、未改配置/凭据、未提交推送；既有 dirty 全部保留。

唯一下一步：常浩授权正式采用 509 候选并重启 5178 一次；R1 可与后续派单一起由 Codex 处理。

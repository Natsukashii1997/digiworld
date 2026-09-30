# Claude → 用户 / Codex｜1.1 复核修复 · 独立复核

输入状态 **WB-20260929-32**（Codex 修复交接，写入者“无”）→ 输出 **WB-20260929-33**。执行者 Claude。日期 2026-09-29。角色：只读复核；未改业务代码、测试、dist、依赖或 PRD/契约。前轮复核：[2026-09-29-claude-review-1.1.md](2026-09-29-claude-review-1.1.md)。

**结论：通过。** D1、M1 已修复并经独立验证，M3 文字准确。没有阻塞项，1.1 可进入 ROADMAP 1.2 用户真实使用验收。

## 1. 改动范围

- 以[前轮 154 文件指纹](2026-09-29-codex-1.1-usage-code-baseline.sha256)比对：只有 5 个文件变化（`server/asset-activity-schema.mjs`、`server/asset-activity.mjs`、`src/AssetUsage.jsx`、`tests/asset-activity.test.mjs`、`tests/usage-browser.mjs`），没有新增或删除文件，与 [Codex 修复交接](2026-09-29-codex-1.1-fix.md)一致。文档另改了 PRD.md 和 ASSET-USAGE.md。
- [新 154 文件指纹](2026-09-29-codex-1.1-fix-code-baseline.sha256) 154/154 匹配，清单自身 SHA256 `77e154bf…8422cf`。Codex 留存的 5 个代码前像与前轮指纹一致。
- 独立差异：[fix-diff-from-before.diff](evidence-2026-09-29-claude-review-1.1-fix/fix-diff-from-before.diff)（624 行，含 PRD 与契约）。

## 2. 独立重跑验证

全部使用 fixture 随机端口、临时目录、合成资料。日志：[evidence-2026-09-29-claude-review-1.1-fix/](evidence-2026-09-29-claude-review-1.1-fix/)。

| 检查 | 结果 |
|---|---|
| `npm test` | **381/381 通过**，0 失败/跳过 |
| browser / accessibility / migration / history-capacity + 19 个 `*-browser.mjs` | **23/23 退出码 0**；usage-browser 20 个 PASS 检查点（含 12 个 M1 恢复场景） |
| `node tests/visual.mjs claude-review-1.1-fix` | 四个宽度 `problems: []` |
| dist 与源码 | 当前源码构建到临时目录，与 `dist/` 完全一致 |
| 5178 | PID 11559，`node server/index.mjs`，本项目目录，只监听 127.0.0.1；07:34:04 启动，晚于服务端文件最后修改（07:29:58）；HTML/JS/CSS 均 200 且与 dist 逐字节一致 |
| `data/CURRENT.json` | 复核前后都是 `a74e3e05…a109db9`，未变 |

## 3. 逐项复核

### D1 备注误拒 —— 已修复

- 前轮报告的 7 个写法（`效果 4/5 分`、`A/B 两版都试过`、`中文/English`、`and/or`、`json/yaml`、`v1/v2`、`token: 省了很多`）现在都能保存。根路径、`~/`、盘符、UNC、URL、`sk-`/`ghp_`、`token: ghp_…`、`密码：…` 仍会被拒（[probe-fix.log](evidence-2026-09-29-claude-review-1.1-fix/probe-fix.log)）。
- **读取兼容（M2 风险）**：差分模糊测试随机生成 40 万条短串（字符集含斜杠、`~`、冒号、括号、反斜杠、中英文、`token`/`密码` 等），**没有一条是旧规则放行而新规则拒绝**。所以本次只是放宽，已存反馈不会因此读不出来。

### M1 确定性失败后的补记 —— 已修复

- 服务端查询改走 `repository.withSnapshot` 串行屏障。独立探针做了 20 轮“写入请求发出后不等完成就查询”，**查询误报“不存在”0 次**；查询不增加 revision（[probe-m1.log](evidence-2026-09-29-claude-review-1.1-fix/probe-m1.log)）。
- 已提交的记录在资产归档后仍能按 ID 查到；对已归档资产新建记录返回 409。
- 前端把查询结果分为 found / absent / unavailable / unknown 四种：已存在的记录优先采用；确认资产已归档、版本不存在或链接失效时，停止补记并说明原因；revision 冲突且资源仍可用时，仍可用同一 ID 补记；任何一步查询失败或返回不完整，都按“未知”处理，不清除待查状态。Skill 查完链接后会再查一次记录，防止漏掉这期间别的客户端提交的记录。400 也要先查明记录不存在才释放。这些逻辑与契约一致，浏览器回归覆盖了这些分支。

### M3 PRD —— 准确

PRD §10.5 的阶段表与 `src/asset-usage.js` 实现一致（成长期 / 成熟期 / 完全体、需改进回到成熟期、新版回到成长期、没有多目标证据不授予究极体）。演出说明也符合实际：保存新版只显示 NEW VERSION，不再触发 DIGIVOLUTION。

## 4. 剩余发现

### 待验证建议（均不阻塞 1.2）

- **S4（低）三段以上的中文斜杠列举仍会被拒**：`快/准/稳`、`速度/质量/成本都不错`、`输入/输出/格式都稳定`、`标题/摘要/结论清楚` 会被拒，因为规则 `(?<![A-Za-z0-9._~-])\/[^\s/\\]+\/` 要拦截“中文后面紧跟多段路径”。旧规则同样拒绝，所以不是回归；契约已写明这项取舍。如果 1.2 中用户常这样写，可以把段落限定为 ASCII 路径字符（如 `\/[A-Za-z0-9._~-]+\/`），这仍然只是放宽。
- **S1** 新版本回到成长期、保存不触发进化演出，等 1.2 由用户确认体验。**S2**（usedAt 没有下限）、**S3**（未记录目标 Agent）保留，不扩展。

### 有证据的维护债

- **M2** 备注启发式规则仍在读取主库时执行。契约已增加“schema 1 读取规则只能放宽”的兼容门，本次修复也遵守了这一点，但架构本身没有改。

## 5. 权限与边界

未读真实 Vault、凭据、私人会话或 `data/` 内容（只比对指针哈希）；未改真实 Agent 配置；未重启或停止 5178；未写 dist；未提交、推送。本轮只新增本文件和 `evidence-2026-09-29-claude-review-1.1-fix/`（日志与两个探针脚本），并更新 CURRENT。

## 6. 唯一下一步

**用户进行 ROADMAP 1.2 真实使用验收。** 按 ROADMAP 用 3 个真实资产（Skill、Prompt、自建流程各 1 个）走完“收录 → 复制 → 交给 Agent → 使用 → 反馈”，并记录卡点。验收时同时判断 S1（阶段与动画体验）和 S4（斜杠列举备注）。涉及真实 Vault、真实 Agent 配置的步骤需先单独授权。

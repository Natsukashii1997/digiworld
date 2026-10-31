# 落代码方案 · 逆向工程 v5（标准工作流 + 留存清单，视觉 v6-C）

状态：**用户已确认**（2026-10-31）：四批全由 Claude 做（偏离 COLLABORATION §6 的「大量开发归 Codex」，按用户决定）；旧的 3 件记录不迁移，旧结论收进「历次」。依据：[简报](05-reverse-v5-工作流与清单.md)、视觉稿 [逆向-v6-C-工作流总控.html](../逆向-v6-C-工作流总控.html)。
每批：开工前按 COLLABORATION 认领 CURRENT → worktree 分支 → PR → 用户说「合并」才合并。发布 5178 另行授权。

## 现状摸底（10-31，只读）

- 页面入口：`src/pages.js:60`（`references`）→ `WorkspacePages.jsx:194` → `src/ReverseHatch.jsx`（456 行：孵化器 `Device`、蛋 `Egg`、八格 `Slot`、放回 `ReplyDialog`、孵化 `HatchDialog`、旧结论 `Legacy`、原件 `Original`、历次 `History`）。
- 新建记录、放回回执、删除都走通用 `PUT /api/workspace`，靠 revision 冲突保护（`repository.mjs:396-411`）。页面层 `writeRecord` / `writeHatch` 会拒绝过期的预览。
- `src/reverse-hatch.js` 的纯函数可以直接复用：`SLOTS`、`parseHatchReply`、`applyHatchReply`、`appendHatchRound`、`slotState`、`hatchScore`、`cellsOf`、`generateHatchSkill`。`ANSWER_FORMAT` 目前没有导出。
- 孵化存 Skill 已经有「预览（5 分钟 token）→ 确认（幂等）→ 回读」三件套：`/api/reverse/hatch/*`、`server/reverse-skill-v4.mjs:54-99`。
- MCP：`server/profile-mcp.mjs` 是本机 HTTP（默认 5179），手写 JSON-RPC，Agent 登记为 `workbench-profile`。`propose_profile_change` 提交后写进 `state.profileProposals`，再走 `preview → confirm / reject`（`knowledge-profile.mjs:197-345`）。**新工具加在这个服务上，已经登记过的 Agent 不用重新配置。**
- 现在**没有**能让外部 Agent 对上号的任务编号：追问包只写「第 n 轮：标题」。需要把 `recordId` + 轮次写进话术，`reverse_report` 交回时带上。
- 浏览器测试 `tests/reverse-hatch-browser.mjs`（365 行）不在 `npm test` 里，要先 `npm run build` 再单独跑。

## 数据改动（第 1、2 批落）

| 位置 | 改动 |
|---|---|
| `state.reverseReports`（新集合） | `{id, recordId, round, kind: "report"/"replica"/"skill", text, proposer, createdAt, status: "pending"/"adopted"/"rejected", decidedAt?}`。只有 AI 提交、用户采纳或拒绝两种写法，有条数上限。校验和历史守卫照 `profileProposals`（`schema.mjs:416`、`:1203`）。 |
| `record.hatch.report`（新） | 最近一次采纳的回执：`{round, verdict, caps:[{name, known, miss, ev[]}], evidence:[{id, where}], nextAsk[]}`。八格仍写进 `hatch.slots`。 |
| `record.hatch.replica`（新） | `{round, at, where, rows:[{name, result: "ok"/"diff"/"no", note}]}` |
| `record.heldAt`（新） | 搁置时间；清掉就恢复。 |
| 阶段 | 不存，按数据推出：没有轮次 = 计划中；最后一轮 `sent` = 取证中；有待过目回执 = 回执待过目；派出复刻 = 复刻中；有 `hatchSkills` = 已收成；有 `heldAt` = 搁置。 |

历史守卫照旧：轮次只追加，Skill 回执不可改写，记录只软删。

## 分批

### 第 1 批 · 回执通道（服务端，不动界面）
- `state.reverseReports` 的 schema、历史守卫、`repository` 的 updater（参照 `updateProfile`）。
- 服务 `server/reverse-report.mjs`，四个动作：
  - `propose`：校验 recordId 和轮次存在，同一份正文重复提交不重复写入。
  - `preview`：解析回执，返回会写进档案的内容和 token。
  - `adopt`：带 `expectedRevision` 写入。拆解回执走 `applyHatchReply`，再写进 `hatch.report`，并把轮次改成 back。
  - `reject`
- 路由：`/api/reverse/reports/preview|adopt|reject`。读取走现有 `/api/workspace`。
- MCP：在 `profile-mcp.mjs` 加 `reverse_report(taskId, round, kind, text, proposer)`，`handleMcp` 多接一个逆向服务，并记入使用统计。
- 测试：服务单测（重复提交、过期 token、revision 冲突、拒绝后不可采纳）、MCP 调用、HTTP 路由。
- **验收**：`npm test` 只剩已知基线失败；用 curl 模拟 MCP 提交 → 预览 → 采纳 → 回读，过程写进 PR。

### 第 2 批 · 话术与回执格式（纯函数）
- `src/reverse-flow.js`：
  - `buildStartPack(record)`：六步开场话术，带任务编号 = `recordId` 加轮次。
  - 各阶段短话术：`buildAskPack`（复用 `buildHatchPack` 的「只问勾上的缺口」）、`buildReplicaPack`、`buildSkillPack`。
  - `parseReport`：在八格之外，再解析一句话结论、能力清单、证据、下一轮建议问。
  - `parseReplica`：解析复刻对照。
  - `stageOf(record, reports)`：推出阶段。
- 导出 `ANSWER_FORMAT`，并扩成新的回执格式。
- `hatch.report`、`hatch.replica`、`heldAt` 的 schema。
- 测试：话术快照（含任务编号和 ⏸ 停顿点）、解析各种写法（缺小节、乱序、附加段落）、阶段推导覆盖六种状态。
- **验收**：`npm test` 只剩已知基线失败。把生成的开场话术贴进 Claude Code 试一次，看它会不会在 ⏸ 处停下（只验话术，不做真实拆解）。

### 第 3 批 · 页面换成 v6-C
- `ReverseHatch.jsx` 换成新的 `ReverseFlow.jsx`：
  - 顶部标准工作流板块：六步轨道 + 每步件数 + 「未派出」「已收成」两头。
  - 左边按步骤排的清单。
  - 右边档案：待过目横条、五格读数、现在 / 下一步、能力清单、八格、证据、历次、产出。
- 新建：复用 `ReverseInput`，提交后直接弹出开场话术，可以复制给 Codex / Claude Code。
- 待过目：预览并采纳 / 退回对话框（调第 1 批的路由）。手动粘贴复用 `ReplyDialog` 的「预览 → 确认」。
- 旧记录兼容：旧结论和旧轮次收进「历次」，不迁移数据。
- 删掉：`Egg`、`Device`、`Cells`、`Slot` 三栏舞台，以及 `reverse-hatch.css` 里对应的动效。
- 浏览器测试重写：新建 → 复制、待过目采纳、手动粘贴、搁置与恢复、1440 / 390 / 320 无溢出、控件 ≥ 44px、axe。
- **验收**：`npm test` 加 `npm run build` 加新浏览器测试；附 1440 / 390 截图，和视觉稿对比。

### 第 4 批 · 复刻、Skill 与真实走查
- 复刻对照采纳后写进 `hatch.replica`，档案的「复刻」读数和清单跟着更新。
- Skill 草稿采纳后走现有孵化三件套存进资产仓库；产出区显示 Skill、给谁用、使用口令。
- **真实走查（需要你在场）**：挑一件真实参照物，完整走一遍「开场 → 回执 → 复刻 → Skill」，记录哪里卡住。
- **验收**：走查记录写进 PR；发布 5178 另行授权。

## 已定的事（用户 2026-10-31）

1. **谁来写代码**：四批全由 Claude 做（推荐的是第 3 批派 Codex，用户选了全部 Claude）。
2. **旧的 3 件记录**：不迁移，新页面照常显示，旧结论收进「历次」。

## 范围外发现

- 「个人说明修改建议」（`propose_profile_change`）的采纳界面在提交 `5361d68`（10-23 阶段 1）里被删了，现在 AI 提的建议在工作台里没地方看、没地方采纳，只剩计数。和本任务无关，建议另开一张 issue。

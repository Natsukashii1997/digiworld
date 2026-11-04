# 交接：逆向 v5 第 4 批「复刻、Skill 与真实走查」（Claude，2026-11-04）

输入状态：WB-20261104-685（main `2a357fc`）。本文件只是交接说明，不改状态编号。接手的会话先按 `AGENTS.md` 读 `CURRENT.md`、`COLLABORATION.md`、`/Users/nat/Documents/ChatGPT/个人/work/agent-kit/工程流程.md`，记下读到的状态编号再认领。

## ① 目标与验收标准

做逆向工程 v5（总 issue #46）第 4 批。方案见 `docs/design/ui-v19/briefs/05-reverse-v5-impl-plan.md` 第 4 批，简报见 `docs/design/ui-v19/briefs/05-reverse-v5-工作流与清单.md`。

- 回执通道多收 `kind=replica`（复刻对照）和 `kind=skill`（Skill 草稿），MCP 自动交回和手动粘贴两条路都要通。
- 复刻对照采纳后写进 `record.hatch.replica`（`{round, at, where, rows:[{name, result: ok/diff/no, note}]}`），对应轮次由 sent 改成 back。档案的「复刻」读数、复刻对照一节、清单阶段跟着更新。
- Skill 草稿采纳后存进资产仓库。产出区显示 Skill 名和版本、给哪个 Agent 用、一句可以复制的使用口令。
- 验收：`npm test` 只剩已知失败；`npm run build` 通过；`tests/reverse-flow-browser.mjs` 补上复刻和存 Skill 两条路径并通过；走查记录写进 PR；PR 等常浩说「合并」才合并。

## ② 已完成与已确认的结论

- 第 1 批回执通道 #48（`0247307`）、第 2 批话术与回执格式 #50（`22d8ca2`）、第 3 批页面换成 v6-C #54（`5e768ad`）都已合并，#43 也已合并（`39bba4b`）。这些都还没发布到 5178。
- 第 3 批的新页面在 `src/ReverseFlow.jsx`、`src/reverse-flow.css`。回执写回规则是纯函数 `adoptReport`（`src/reverse-flow.js`），服务端 `server/reverse-report.mjs` 和页面的手动粘贴共用它。
- 第 2 批已经有 `parseReplica`、`buildReplicaPack`、`buildSkillPack`、`stageOf`（`src/reverse-flow.js`）。schema 已经支持 `hatch.replica`、`heldAt` 和轮次的 `kind`。
- 常浩 11-04 按推荐定了两件事：
  1. **Skill 草稿怎么存**：Agent 交回的 SKILL.md 草稿当作资产正文，八格原样 `source.json` 和追问包作附件。沿用孵化三件套（`server/reverse-skill-v4.mjs` 的 `hatchPreview` / `hatchConfirm` / `hatchQuery`）：预览 → 确认 → 回读，版本递增。
  2. **真实走查在哪里跑**：分两段。代码写完后，先在隔离实例里用「手动粘贴」走一遍，不碰正式数据。「Agent 自动交回」这条路等常浩另行授权发布到 5178 后，再在正式环境里走，因为 Agent 里登记的 MCP（`workbench-profile`，5179）指向正式环境。
- 四批全由 Claude 做（常浩 10-31 定，偏离 COLLABORATION §6）。

## ③ 剩余计划

1. 开第 4 批的 issue，在 `CURRENT.md` 里认领（新状态编号 686，写入者 Claude，写明分支和改动范围）。在 worktree 里从 `origin/main` 起分支 `claude/<号>-reverse-replica-skill`。
2. 服务端：
   - `server/reverse-report.mjs` 的 `ACCEPTED_KINDS` 加上 replica 和 skill，preview / adopt 按 kind 分开处理。replica 用 `parseReplica` 解析，写进 `hatch.replica`。
   - skill 要写资产仓库，但 `repository.updateReverseReports` 只允许改 `reverseReports` 和 `reverseRecords`。所以要让存 Skill 的服务（`reverse-skill-v4.mjs`）接收回执 id，在同一次写入里存资产、给 `record.hatchSkills` 追加指针、把回执标成已采纳（历史守卫用 `allowReverseReports`）。
   - 更新 `server/profile-mcp.mjs` 里 `reverse_report` 的说明。
3. 页面 `src/ReverseFlow.jsx`：
   - `ReviewDialog` 按 kind 显示复刻对照表，或者 SKILL.md 全文（名字可改）。
   - `PasteDialog` 按最后一轮的 kind 选择解析方法。
   - `Output` 区补上「给谁用」和使用口令。
4. 测试：
   - 服务单测覆盖提交、预览、采纳、回读、重复提交、预览过期、退回和 revision 冲突。
   - 浏览器测试补上复刻和存 Skill 两条路径。
   - 跑 `npm test` 和 `npm run build`。
5. 开 PR（按 `.github/pull_request_template.md`，第一行 `Closes #<号>`），更新 CURRENT，再和常浩约在隔离实例里做手动粘贴走查。

## ④ 相关文件与文档

`src/ReverseFlow.jsx`、`src/reverse-flow.css`、`src/reverse-flow.js`、`src/reverse-hatch.js`（`generateHatchSkill`、`hatchSlotsText`）、`server/reverse-report.mjs`、`server/reverse-report-schema.mjs`、`server/reverse-skill-v4.mjs`、`server/repository.mjs`（`updateReverseReports`）、`server/profile-mcp.mjs`、`server/http.mjs`（`/api/reverse/reports/*`、`/api/reverse/hatch/*`）、`tests/reverse-report.test.mjs`、`tests/reverse-flow.test.mjs`、`tests/reverse-flow-browser.mjs`、`tests/reverse-hatch-fixture.mjs`。第 3 批的交接见 PR #54 的描述。

## ⑤ 已否掉的方案与注意事项

- 不在主目录切分支，不对主目录做 stash、reset、clean。主目录里其他会话留下的未跟踪文件不要动。
- 带 `--force-with-lease` 的推送会被权限拦下。合并前，如果 main 只改了 PR 没碰的文件，可以不变基直接 squash 合并，合并后再核对文件树。
- 浏览器测试：本机 Playwright 1.62.1 需要 chromium build 1234，但缓存里只有 1228 和 1248。跑 `tests/reverse-flow-browser.mjs` 前要先 `npm run build`，并设环境变量 `PLAYWRIGHT_CHROMIUM=~/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`。`tests/browser.mjs` 目前跑不起来。
- `npm test` 的已知失败：`knowledge-writeback` 依赖已经不存在的 `.claude/worktrees/wiki-local`；`capability-services` 依赖检出路径；`controlled-execution` 和 `reverse-precheck` 在负载下偶发，单独跑能通过。
- 样式里的圆角、字号、颜色只能用 `src/tokens.css` 的令牌，`tests/design-tokens.test.mjs` 会检查。控件至少 44px。
- 测试只用合成的隔离库，不读 `data/`、真实 Vault 或凭据。发布到 5178 必须另行授权。
- zsh 里 `echo ====` 会报错，分隔线请用 `echo '----'`。

## ⑥ 开工方式

先给常浩一份分批计划，等他确认后再改代码。

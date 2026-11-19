# Claude · #93 资产仓库改版第二批：Skill 页接 my-skills（2026-11-19）

- 输入状态 / 输出状态：读到 `WB-20261108-699`。本批在独立 worktree 分支 `claude/93-skill-page`（基于 main `9acb852`，即第一批 #94 合并后）走 PR，按 #89、#94 先例只在 CURRENT 加一节，不改「当前写入者」和状态编号。
- 执行者 / 范围：Claude。代码与验证由会话 local_e3148c06 完成；提交、PR 与本文档由其交接会话 local_8883061c 完成。常浩 11-19 回复「按推荐开工」确认三个决定：Skill 卡没有详情、新建对话框去掉 Skill、IDLE 满 30 天记录后自动生效；本会话列出分批提交计划后回复「按计划提交」。

## 提交

| 提交 | 内容 |
|---|---|
| `0f29401` | 只读读取：新增 `server/my-skills.mjs`（`links.tsv`、`SKILL.md` 头部、git log 日期、agent-kit `skill-usage.jsonl`）；`server/http.mjs` 加 `GET /api/my-skills`（`refresh=1` 现读，没传 `discovery.mySkills.home` 不读本机）；`server/index.mjs` 正式入口传 `homedir()`；`runGit` 从 `cockpit-rules.mjs` 挪到 `cockpit-read.mjs` 共用；`tests/fixture.mjs` 默认指向假 home |
| `8e048b3` | `server/schema.mjs` 顶层可选 `skillMeta`；`src/asset-categories.js` 加 `validateSkillMeta`、`skillCategoryOf`、`skillBadgesOf`、`shortDay`；新增 `tests/my-skills.test.mjs` 11 条（读取器测试也在这份文件里，所以随本提交） |
| `4d80568` | 界面：`src/Assets.jsx`（`SkillCard`、`useCockpit("/my-skills")`、刷新按钮、新建只给 Prompt / 设计、帮助文案）、`src/App.jsx`（导航计数）、`src/pixel.jsx` + `src/components.jsx`（全息蛋 `tint`）、`src/assets-v2.css`、`src/SkillDelivery.jsx`（复制按钮双击保护）；AI 接入登记 `AGENTS.md` + `server/ai-access.mjs`；单元测试 `digital-world-ui`、`skill-install` 适配 |
| 第 4 个提交 | 8 个浏览器测试适配 + 新增 `tests/assets-skill-browser.mjs`；证据 `evidence/93-skill-page/`；`CURRENT.md` 一节；本文档 |

## 行为变化（PR 描述逐项列出）

常浩要求的：

1. Skill 页改为只读展示 my-skills 登记的 skill（本机 17 个）。原来数码世界里的 Skill 资产不再出现在 Skill 页；数据保留，可从全局搜索打开详情。
2. Skill 卡没有删除、没有详情，只有置顶和「复制调用名」：复制 `/名`，悬停提示写明 Codex 里用 `$名`；不计入数码世界自己的使用记录。
3. 使用次数来自 agent-kit 调用记录（只记 Claude 端）；没有记录文件、或只给了 Codex 且 0 次的显示「–」，不显示成 0。NEW 看首次登记、UPD 看 7 天内有提交（都取 git 日期），HOT 看近 30 天调用 ≥ 5 次，IDLE 要等调用记录满 30 天才开始判断。
4. 第一批存在 Skill 资产上的分类不再显示；Skill 分类改按 skill 名存进 `skillMeta`（自动归组 + 手选）。
5. 新建对话框只给 Prompt / 设计（编辑已有 Skill 资产时仍显示原来三类）；Skill 页的「新建」换成「刷新」（现读 my-skills）。
6. 页签和导航「资产仓库」计数按 Prompt + Design + my-skills 条数。
7. 全息蛋按分类色染色。
8. 直接起的服务（含全部测试）默认不读本机 my-skills，只有正式入口读。

顺手改的：

1. 卡片日期：第一批直接截 UTC 字符串，凌晨 0–8 点更新的会显示成前一天；改为按上海时区（G-02）。
2. Skill 交付详情里的复制按钮：连点两下会生成两次交付，加了双击保护。
3. `runGit` 两份实现合并为 `cockpit-read.mjs` 一份。

## 验证

- `npm test`：1655 条，1653 过 / 1 败 / 1 跳过。那 1 条是基线已知失败（生产 factory 接线），基线 `9acb852` 同样 1 败（1644 条）。日志 `evidence/93-skill-page/test.log`、`baseline-test.log`（`*.log` 不入库，只在本机）。
- 浏览器测试（不在 `npm test` 里）50 个，与第一批最终结果对照，`evidence/93-skill-page/compare-final.txt`：第一批通过的 14 个本批全过；新测试 `assets-skill-browser` 通过；`transfer-reduce` 由失败转为通过；其余 34 个在第一批时本来就失败（历史过期断言），本批不处理。
- 本机 Playwright 要 chromium 1234，缓存只有 1248：沿用 `evidence/93-asset-library/pw-exec.mjs` 预加载。
- 截图：合成 my-skills 起临时服务（`evidence/93-skill-page/preview-server.mjs` + `capture.mjs`，5194 端口，已关），1440 宽，`evidence/93-skill-page/shots/` 7 张。仓库公开，不用真实 my-skills 截图入库。只做了电脑版，只在 Chromium 验过。
- 真实 my-skills 由 local_e3148c06 在本机只读看过：17 个 skill 都显示了（无截图）。

## 运行与数据

正式 5178 未发布、未重启；没有写 my-skills；不用 `catalog/skills.json`（11-07 旧快照，只有 15 个）。

## 已定：vault-backup 保持现状

`vault-backup` 卡片显示「没读到 SKILL.md 的说明」：只读读取器的安全规则 `DENIED`（`server/cockpit-read.mjs`，#74 定）排除路径里带「backup」的文件。常浩 11-19 在会话 local_8883061c 里选「保持现状」：不放宽 `DENIED`，不改 skill 名，卡片照旧显示这句提示。

## 未完成与下一步

1. 常浩审 PR，回复「合并」后合并；发布到 5178 另行安排。
2. 第三批：Design 页两种形式；第四批：猛鬼兽批量导入 `create_prompts`；清理票（焚决回收区等）照第一批交接。

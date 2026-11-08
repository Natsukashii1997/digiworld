Closes #78（Part of #67）

## 做了什么

新增只读接口 `GET /api/projects-space/relations`，给项目空间的「项目关系」页（#79）提供关系图和支撑流桑基的数据。

- `server/project-relations.mjs`（新）：
  - `readAgentsFile`：只读项目根目录的 `AGENTS.md`；拒绝软链接、越出项目目录、超过 256 KB 的文件。
  - `buildRelations`：三个来源按顺序去重（同一 `from + to + kind` 只留第一条）——名册 `relations`（权威）→ AGENTS.md 对底座的引用 → 技能调用统计里的自建 skill。底座匹配词只用 id、GitHub 仓库短名、目录名，**不用 aliases**（有「LESSONS」「知识库」这类通用词）。
  - 支撑流：只算产品；底座＝与它有任何非「明确独立」关系的底座，没有就记 `none`；宽度＝近 30 天提交 ÷ 底座个数；状态取 `attentionOf().kind`。
- `server/project-roster.mjs`：`parseRoster` 补读 `type`、`relations`、名册 `version`，**只在名册写了时才带上**，其他调用方看到的字段不变（原有 deepEqual 测试不改照过）。
- `server/projects-space.mjs`：新增 `relations()`，复用 `inspect()` 的读数（不再起一遍 git 扫描），只多读名册和各项目 AGENTS.md。
- `server/http.mjs`：注册 GET 路由，鉴权与 `/api/projects-space` 相同；POST 不接受。
- AI 接入：`server/ai-access.mjs` 的「数据对象」与 AGENTS.md「AI 接入」一节同步加一行「项目关系页」（不调用 AI）。
- `COLLABORATION.md` §6：按常浩 11-08「数码世界的项目开工规则改一下，都是正常你来做」，开发默认由 Claude 做，Codex 只在点名时参与。
- `docs/design/projects-space-v3/项目关系-定稿.html`：定稿预览进仓库，供 #79 对照；去掉了一条误判的关系（见下）。

## 测试

- `node --test tests/project-relations.test.mjs`：7 项全过（合成名册 + 临时目录，不读真实名册、项目和 Vault）。覆盖：type / relations / version 解析、匹配词与词边界（含 aliases 不参与）、名册优先去重与非法项跳过、自建 skill 边、支撑流平分 / none / 独立不算接入 / 读不到提交、AGENTS 软链接 / 超大 / 缺失、接口要令牌、POST 被拒、名册坏掉时整体报错。
- `npm test` 全量（不和构建并行）：1629 项，1624 过、4 败、1 跳过，**没有新增失败**。
  - 「生产factory具体接线…」：已知基线失败，worktree 放在隐藏目录 `.claude/` 下就会失败。基线 `be6bc0f` 放在同样位置也失败；本分支放到普通目录则通过。
  - controlled-execution 重启用例、reverse-ai-process 的 Swift 编译（issue #6）、triage 5000 行 LCS：都是满载超时。把这 4 个文件拿出来单独跑，基线 45/45；本分支在普通目录下连同新测试共 52/52。
  - 明细与对照表见 `evidence/78-relations-api/全量测试结论.md`。
- `npm run build`：通过（只有原有的大包体积提示）。

## 真实数据核对（只读）

用真实名册 v1.6 和各项目 AGENTS.md 跑了一遍 `buildRelations`：15 个 AGENTS.md 可读，CarvoMOTO 没有 AGENTS.md；自动推出 19 条「引用底座」边，明细见 `evidence/78-relations-api/真实名册只读核对.md`。核对中发现定稿预览里「多 Agent 协同 → 回答收藏器」是我之前拼表时的误判（`grep -c … || echo 0` 在计数为 0 时多出一列导致错位），已从定稿删除。

## 没做 / 影响

- 页面在 #79 做；名册手写关系在 Natsukashii1997/digital-twin#98（等常浩逐条确认）。
- 没有发布到 5178，没有改 `data/`，没有新增依赖。
- 测试运行留下的 `outputs/`、`tests/fixture-daemon*-*/` 是已知遗留（#59），未提交。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

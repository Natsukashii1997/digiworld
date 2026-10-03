# 云端交接 · 任务 H4 · 进化回路 v1（提前开发）

- 分支：`cloud/2026-09-30-evolution-loop`（短名 evolution-loop）；基点 `cloud/2026-09-30-integration @ 7be59dc6942281718059f9fdd7daa8322027e8e3`。只推分支，不开 PR、不推 main。
- 执行：Claude Code 云端会话（Linux、root、Node 24.21.0，`PLAYWRIGHT_MODULE=playwright`，chromium-1234）；云端副本，非权威。
- 依据：产品定义 v1.1 §4.6（进化回路与收件箱）、v1.2 §4.7（执行层：工作台只做薄控制面）；ASSET-USAGE.md；现有 AssetHistory / version-diff。
- 未改：CURRENT.md、COLLABORATION.md、AGENTS.md、CLAUDE.md、package.json、package-lock.json、server/config-file.mjs、docs/design/。未接任何模型或外部服务（浏览器测试断言页面零外部请求），未读凭据。

## 一、结论

| 项 | 结果 |
|---|---|
| 新单元测试 `tests/evolution-loop.test.mjs` | 实现前：模块不存在，文件级失败（首跑日志 `unit-first-fail.txt`）；实现后 11/11 |
| 新浏览器测试 `tests/evolution-loop-browser.mjs` | 实现前：等不到“改版进化”区块，超时失败（`browser-first-fail.txt`）；实现后 12 项 PASS，exit 0 |
| `timeout 1200 npm test` | tests 547 / pass 522 / fail 19 / cancelled 1 / skipped 5；跑满 1199.8 秒。失败名单与集成分支 `06-npm-test.txt` 逐条 diff 完全相同：**增 0、减 0**。547 = 基点 536 + 新增 11 |
| 全部浏览器脚本（40 个 = 基点 39 + 新增 1） | 36 通过、4 失败：agent-config、rule-templates、rule-templates-fix（配置写入平台保护）、search（palette-cold 618ms > 500ms）。全在 §3.6 已知集内：**增 0、减 0** |
| `node tests/visual.mjs evolution-loop` | `problems: []`，exit 0 |

## 二、每项改动与理由

### 1. 生成改版任务包（资产详情）
- 新增 `src/evolution.js` 的 `buildRevisionPacket`：当前版本全文、按时间排列的本资产历次反馈（版本号、日期、好用/需改进、备注）、改版要求、产出格式（两对全角标记 `【新版本正文·开始/结束】`、`【改动说明·开始/结束】`）、禁止事项（不给片段、正文不放标记外、不编造数据、不放路径链接凭据、不调用工具改文件）。同样的输入得到同样的文字，不含时间戳。
- 新增 `src/AssetEvolution.jsx`（资产详情“使用记录与反馈”下方的“改版进化”区块）：当前版本有任一条“需改进”反馈才出现“生成改版任务包”，并可一键复制。复制任务包**不计为资产使用**（不写 assetActivity）。
- 标记用全角方括号：`=====` 这类标记会被 Markdown 渲染成标题线，复制回来就对不上了。
- **Skill 不提供**：Skill 的有效内容在文件包（SKILL.md 等）里，只改 `content` 会让候选和实际交付物不一致。本版只支持 Prompt、工作流、规则（见第七节）。

### 2. 候选回收
- `parseRevisionReply`：按“整行等于标记”定位。缺段就报出缺哪一段；标记重复、顺序不对、正文或说明为空、有控制字符都明确报错，不猜测。回车统一成换行；标记以外的闲聊、代码围栏都不计入。所有内容只当文本：界面由 React 按文本渲染，测试断言 `<script>`、`<img onerror>` 原样显示且没有执行。
- 主库新集合 `revisionCandidates`（`server/revision-candidate-schema.mjs`），字段白名单：`schema:1, id, assetId, baseVersionId, content, changeNote, createdAt, status(pending|adopted|returned)`，可选 `decidedAt, adoptedVersionId, returnReason`。上限：共 500 条，待处理 50 条，正文 1,000,000 字，说明 5,000 字，退回原因 500 字。旧库缺失按空，不写迁移。
- 历史约束（`validateCandidateHistory`，普通保存也执行）：候选不能删除；身份字段（含正文）不可改写；只能从待处理单向变为已采用或已退回；决定后不可更改；普通保存新增的候选必须是待处理。
- `merge.mjs`：按 ID 并集。同 ID 身份不同，整次拒绝（409）。当前库待处理而备份已决定时，采用备份的决定（对应新版本随资产版本一并并入）；当前库已决定时保留当前；两边决定不同也整次拒绝。旧备份不会清空当前候选。导入预览新增“新增改版候选”计数（`StoragePanel.jsx`）。导入走 `allowCandidateImport`，允许带来已决定的新候选。
- 待处理（`pending.js`）：每个未归档资产的待处理候选列一条“「名称」有改版候选待比较”，点击直接打开资产详情。

### 3. 比较与决定
- 比较复用 `AssetHistory.jsx` 导出的 `TextDifference`（逐行差异），外加“并排查看全文”折叠区（两栏，窄屏自动叠成一列）。
- 采用（`adoptCandidate`）：在历史末尾追加一个新版本，正文取自候选，其余字段沿用当前版本，并带 `candidateId`；不继承 `restoredFrom`。前面的版本一字不改，由既有“历史版本不可覆盖”校验守护。候选同时标为 adopted，并写入 `adoptedVersionId`。schema 双向核对：版本的 candidateId 必须指向同资产、已采用、adoptedVersionId 等于本版本的候选；已采用候选的新版本必须紧跟在 baseVersionId 之后，且正文一致。
- 当前版本在候选生成后已经变化时，拒绝采用（防止覆盖别的改动），只能退回。
- `store.js` 的 `revise` 不再继承 `candidateId`：采用后再编辑或恢复，新版本不会冒认候选来源。
- 历史标签在带 candidateId 的版本上显示“来自改版候选 xxxxxxxx”。
- 退回（`returnCandidate`）：可以写原因（不写则不留空字段），不产生新版本。

### 4. 证据
- `revisionEvidence`：对每次采用，比较“被替换的版本”和“采用生成的版本”各自的复制次数，以及需改进比例（需改进条数 / 反馈条数）。只读已有的 assetActivity；没有反馈时比例为 null，界面显示“无反馈”。只在该资产详情里显示，不做全局仪表盘。

### 5. 样式
- `styles.css` 末尾追加 `.asset-evolution` 等规则，沿用 `.asset-usage` 的表面和既有令牌（`--line`、`--mono`），不引入新的视觉方向。
- 候选比较里的 `.diff-lines` 改为随抽屉整体滚动、长行换行（只作用于 `.evolution-candidate` 内部）。起因是 390 宽时 axe 报 `scrollable-region-focusable`；历史标签里原有的差异区不受影响。

## 三、改动文件前后 SHA256

| 文件 | 基点 7be59dc | 本分支 |
|---|---|---|
| server/merge.mjs | b6dda44a0135ba6f1a13b2015827a667d98a40d2e61f95addb221875180269d4 | 809fc55eaf1387f01e22e67d76904f86d0e7532187c7f0acc3274bfaf3a677d1 |
| server/repository.mjs | 47a02f318cde0d244e4a012f4aea3e49731b8ea96e7a0a9aeb075c1e9065c3ef | 0e5ac835a6420d8701d3308c8cfded4e189aa9be3b60d8c543482559122a9c42 |
| server/schema.mjs | 86ee6f5695180f79bf7ec56d127fe6edeebb2f9de4709368ae71d1636f09a6c9 | d53081f1309dc004ca97934354c5c9ec4c2fe6cf1df1646630a35c8cb3a71cd8 |
| server/revision-candidate-schema.mjs | —（新增） | a173e4ab4e8b87961ed97f1a1bd2102ee699cdb86c9961770a63bfdb56d259b8 |
| src/AssetEvolution.jsx | —（新增） | 9301020e54ae361f16c6e4c31ae4ce308a3b38c82d78aa88b2b692d670fdcc0d |
| src/AssetHistory.jsx | c6a15535ea9fac7528dd5c065f3e0e9c7dc95639a118c7a513f47dac8907a155 | 03fe75314700343a2814f29fe1874fd8cc9f90405ed49c7009d2a08952ddb9b9 |
| src/Assets.jsx | 016d17404872589995feccb6e27884c7dae73f4c5a1382dcf567b505dd2b2a91 | dea8550f87572e082e3eaca1952e99c947a027b65c6cdb011a874fc07ecd78cd |
| src/StoragePanel.jsx | 1e4d775e631f2797ebd2a0dc09bdbd770f17fa731c0db0cbfe04a8edbda5a895 | 8b48ab9c8c77fb41d668a1fcb6ed8964c779ca4bb8854a26034d48cdee58f767 |
| src/evolution.js | —（新增） | ba05f7d75672e731102cd7bc9ee6bc988078207fa1e420b47a9ea243c6833d1b |
| src/pending.js | cf3422b19e072d5851c438e180fc74fc97282196c49850731cd4cc2dc2833cbd | 15c580a80069c6c682237e4487bf7830989a36701033ffb9770853eaa0dd4ef6 |
| src/store.js | f9cbdb252c64f078446f3fd5f1b5f16646aca2cfe9853b38fd0ac53ab307cfa2 | 86614a77ab53d2f33bdaaf97fb9708fa58ce37435cf15c43860775b5d8d50d18 |
| src/styles.css | 0907686f5c36cb40dd61b29c1e4518a6493a69e8fd9f1dc1e1a581092c8d9def | 2fca59ec81ecc7e50af5a3aaee6adfc9bd66dc632e2b418dfcbe1989bde33562 |
| tests/evolution-loop.test.mjs | —（新增） | 95bd0e00e8f1ddb0f1de62405d6ea9f547b7c76831840ab04222ce6b75118188 |
| tests/evolution-loop-browser.mjs | —（新增） | cb7e0a2f07d9e6729f4b1ecb36b26b962d46a77f0d03b6338ea4ceba7eba079b |

## 四、失败测试首跑摘要

- `unit-first-fail.txt`：`node --test tests/evolution-loop.test.mjs` → tests 1 / fail 1（`src/evolution.js` 不存在，文件级失败）。
- `browser-first-fail.txt`：`npm run build` 后 `node tests/evolution-loop-browser.mjs` → 保存“需改进”反馈后等不到“改版进化”区域，TimeoutError，exit 1。
- 实现过程中对新测试做过的调整，如实列出（都没有放宽行为断言）：
  1. 单元测试里 3 处 `addCandidate(state(), prompt(state()).id, …)` 两次调用 `state()`，而 seed 的 ID 是随机的，导致“找不到该资产”。改为先 `const s0 = state()` 再用。属于测试自身写法错误。
  2. 浏览器测试的历史标签定位：`"历史2"` 精确名不匹配，改为正则 `/^历史\s*2$/`，并显式选择 v2.0 查看来源候选。
  3. 证据文字断言：界面按“复制 0 次 → 0 次”的格式，在箭头两侧留空格。断言从 `（1/1）→` 改成 `（1/1） → `，只改空格，数值不变。
  4. 追加了一次 axe 检查（任务包展开时），属于加严。

## 五、验证命令与首次结果

| 命令 | 日志（`cloud-evolution-loop-logs/`） | 首次结果 | 相对已知失败集 |
|---|---|---|---|
| `node --test tests/evolution-loop.test.mjs`（实现前） | unit-first-fail.txt | fail（模块不存在） | — |
| `npm run build && node tests/evolution-loop-browser.mjs`（实现前） | browser-first-fail.txt | fail（TimeoutError） | — |
| `timeout 1200 npm test` | npm-test.txt | 547 / 522 / fail 19 / cancelled 1 / skipped 5 | 增 0、减 0（diff 为空） |
| `npm run build` + 全部浏览器脚本（每个外加 `timeout 600` 只防挂起） | browser-scripts.txt | 40 个：36 过、4 败（agent-config、rule-templates、rule-templates-fix、search palette-cold 618ms） | 增 0、减 0 |
| `node tests/visual.mjs evolution-loop` | visual.txt | `problems: []`，exit 0 | — |

说明：
- `npm test` 被外层 `timeout` 在 1200 秒时终止，日志末尾没有写入 `exit=` 行（与集成分支 06 日志的情况相同），所以退出码没有直接记录，结果以摘要行为准。
- `npm test` 启动之后，我又改了 `src/StoragePanel.jsx` 的一行（导入预览计数）。浏览器脚本和视觉脚本是在这次改动之后重新构建再跑的，已经覆盖它；npm test 里依赖 dist 的 digital-world-ui 用的是改动前的构建。

## 六、需要真人确认的视觉点

截图在 `cloud-evolution-loop-shots/`，共 3 张：
1. `1-compare-1440.png`：宽屏抽屉里“改版进化”接在“使用记录与反馈”之后，显示候选头部。请确认区块的位置和层级是否合适。
2. `2-evidence-1440.png`：采用之后的“改版证据”和“已处理的候选”列表。请确认证据的一行式写法（`复制 a 次 → b 次`、`需改进 x%（m/n） → 无反馈`）是否容易读。
3. `3-compare-390.png`：390 宽下长行和无空格长串的差异自动换行、没有横向溢出。请确认差异区不单独滚动、整个抽屉变长的效果是否可以接受。
- 另外：“生成改版任务包”“解析并存为候选”用主按钮，“复制任务包”“退回”用次按钮，这个主次搭配请确认。

## 七、未完成项与风险

- **Skill 不支持改版任务包**：需要另外设计“候选 = 完整文件包”，或者只改 SKILL.md 的方案。目前 Skill 即使收到“需改进”反馈，也不显示入口，界面上没有说明原因。
- **任务包不进夜间队列、不指定 Agent**：v1.1 §4.6 原设想是“进入夜间队列，由指定 Agent 生成”。本版按 v1.2 §4.7 和任务要求，只做复制口令加人工粘贴。
- **比较只在资产详情里做**：待处理只负责汇总和跳转，符合 v1.1 §4.6“收件箱只做汇总和跳转”。
- **证据口径**：“采用前”只统计被替换的那一个版本的记录，不累计更早的版本；“恢复旧版的次数”（v1.1 §4.6 提到的第三项证据）本版没有统计。
- **本机验证**：本分支改了主库 schema 和合并逻辑（新集合、版本 candidateId），合入前需要在本机（macOS）重跑 npm test 和浏览器回归，包括用真实旧主库的只读副本确认旧库照常读取。IndexedDB 回退模式在前端没有 schema 校验，与现状一致。
- 解析依赖 Agent 严格遵守标记。如果 Agent 把整个回复包进代码块，标记仍然能识别；但如果 Agent 在正文里原样复述了标记，会报“重复”，需要用户删掉多余的部分再粘贴。

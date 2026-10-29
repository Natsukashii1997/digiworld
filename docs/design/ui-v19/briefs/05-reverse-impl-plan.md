# 落代码方案 · 逆向工程（孵蛋 · 3C）

状态：**已确认**（10-29，§7 三问，见文末「用户决定」）。只是方案，没有改 `src/`、`server/`、`tests/`。父任务 #27。
依据：
- 页面简报 [05-reverse.md](05-reverse.md)（10-29 已确认，§9 四条都按推荐）
- 视觉稿 [逆向工程-3C-孵蛋精修.html](../逆向工程-3C-孵蛋精修.html)
- [定位与重构方案](../../../product/2026-10-29-逆向工程定位与重构方案.md) §3、§6、§7

现状：取自 10-29 对代码的只读梳理，基线 HEAD `ac31e8a`，下文行号以那时为准。

## 1. 范围

**做**：
- 逆向工程页换成「标本条 + 孵化器 + 八格」。
- 记录新增「八格」和「每轮」两块数据，带校验。
- 追问包和八格回答格式；放回结论时，先预览拆格结果，再确认写入。
- 孵化：服务端先预览再确认，写入固定版本 Skill，带来源，写后回读；资产详情显示「来自逆向 · 标本名」，可跳回。
- 冻结工作台内执行（REA 运行、AI 执行器、内嵌 Codex 会话、网站预检）：只撤页面入口。
- REA 版本维护挪到设置（排在 651 之后，见 §6）。

**不做**：
- 不删冻结功能的代码和接口：`server/reverse-runner.mjs`、`reverse-native.mjs`、`reverse-ai-process.mjs`、`reverse-precheck.mjs` 及其 `/api/reverse/*` 都保留，后台测试照常跑。
- 不改写旧记录里的任何字段：`reaRuns`、`packVersions`、`packSkills`、`savedSkill`、`forge`、配方与复刻历史全部只读保留。
- 不自动把旧结论分进八格，也不由开发者手工替用户分格（见 §6 第 1 条）。
- 不改全站令牌，不新增依赖，不发布，不推送。每批提交前给你看对比图和测试结果。

## 2. 设计元素 → 现版代码 → 怎么改

| 稿里的元素 | 现版代码 | 改法 |
|---|---|---|
| 页面挂载 | `WorkspacePages.jsx:194` `References → ReverseV16`；`ReverseV16.jsx`（161 行，单个组件塞了终端、原生会话、结论、任务包、历史） | 新文件 `src/ReverseHatch.jsx` + `src/reverse-hatch.css`，`References` 改挂它。`ReverseV16.jsx` 保留不删，冻结功能的组件都不再从页面引用 |
| 页头 | `PageHeading page="references"` + `ReaUpdate` 徽章 + 「投入参照物」 | 换成 v19 页头：`逆向工程 REVERSE ENGINEERING` · `标本` · `已孵化`（紫）。`ReaUpdate` 在第 5 批挪进设置之前，**暂放在页尾「工具」折叠里**，不能让 REA 更新在两批之间失去入口 |
| 标本条 | 左栏 `rail-list` + 「全部 / 软件 / 作品」筛选 | 横滑一行，复用 `FilterTabs`（`components.jsx:144`）的滚动与焦点逻辑；每格写昵称（标题）+ 想弄懂；末尾「＋ 投入参照物」 |
| 投入参照物 | `ReverseInput.jsx`（TXT / IMG / WEB / FN 四类 + 软件目标 + 授权勾选） | 原样复用，只把文案「想弄懂的功能」作为主字段，「你看重的点」改名「好在哪里（选填）」；新记录的 `hatch` 由第 1 批的 `initialHatch()` 生成 |
| 八格 | 无 | 新纯函数模块 `src/reverse-hatch.js`（§3），数据存在记录的 `hatch` 字段 |
| 孵化器 · 蛋、接口灯、每轮 | 无 | 像素蛋、裂纹按格子、接口灯直接从 3C 稿的脚本移植（`build/reverse-3C-孵蛋.html` 里的 `egg()` / `crackFor()`）；「每轮」读 `hatch.rounds`，旧记录用 `reaRuns` / `packVersions` 只读推出「第 N 轮 · 日期 · 谁 · 结果」 |
| 追问包 | `buildReplicaPack`（`reverse-v4.js:17`），软件类依赖工作台本机取证摘要 | 新函数 `buildHatchPack()`：参照物、想弄懂、上一轮已知（填上的格子）、这一轮要问的（勾上的格子的「缺」）、八格回答格式、授权与材料边界。凭据过滤沿用 `filterRelayText`。旧的 `buildReplicaPack` 不动，搜索和旧 Skill 还在用 |
| 复制 | `navigator.clipboard` + `notify('TRANSFER OK')` | 复制成功后写一条轮次 `{n, at, by, asked, status:'sent'}`（带 revision，写后回读）。回执写失败就明确提示，不为了补记再复制一次 |
| 放回结论 | 无（旧版是原生会话或 AI 执行器直接写 `packVersions`） | 粘贴 → `parseHatchReply()` 拆格 → **预览**：哪几格会变、哪几格因「你改过」不覆盖、哪些段落分不进格 → 确认写入并回读。轮次改成 `status:'back'` |
| 手改格子 | 无 | 点格子正文可以编辑，存为 `edited:true`；下一轮放回结论时默认不覆盖它，预览里可以单独勾选覆盖 |
| 旧结论 · 未分格 | 结论列表在 `ReverseV16.jsx:142`，读 `packVersions[].result` | 只读面板「旧结论 · 未分格」：列出结论和未知。按钮「让 Agent 按八格整理」生成 `buildOrganizePack()`（只整理，不重新取证） |
| 孵化 | `server/reverse-skill-v4.mjs`：预览发 token，确认核对 revision、任务包摘要和文件摘要，写资产并写 `packSkills` / `savedSkill` 回执 | 同一个模块加 `hatchPreview` / `hatchConfirm` / `hatchQuery`：Skill 内容由 `generateHatchSkill()` 从八格生成（用途、结构……，空格进「局限」，标「未经复刻验证」），附 `task-pack.md`（最近一轮追问包）和 `source.json`。回执写进新字段 `hatchSkills[]`，带 `slotsHash`，同一状态重复确认就复用 |
| 资产来源 | 资产首个版本的 `hatchedFrom` 只认 `note` / `collection`（`schema.mjs:530`）；去向推导 `capture-routes.js:48` 只看 `savedSkill` | `hatchedFrom.kind` 增加 `reverse`；`capture-routes.js` 同时认 `hatchSkills`；资产详情（`Assets.jsx:931` 附近的来源文案）显示「从逆向工程孵化 · 标本名」，点击跳回（沿用 `App.jsx:302` 的 `reverse` 跳转） |
| 搜索 | `search.js:135` 搜标题和 `buildReplicaPack` 的文本 | 再加上八格正文 |
| 冻结入口 | 页面里的 `ReverseNative`、`ReverseExecutor`、`ReversePrecheck`、终端、证据弹窗 | 新页面不引用这些组件。旧记录的运行摘要、证据 ID、任务包版本放进「历史取证（只读）」折叠，沿用 `History`（`ReverseV16.jsx:31`）的做法 |
| REA 版本维护 | `ReaUpdate.jsx`（39 行）+ `/api/reverse/update/*` | 第 5 批：设置页「对外接口 / 工具」组加一行，原组件原样搬过去，接口不变 |

## 3. 数据：`hatch` 字段

在 `reverseRecords[]` 上新增一个可选字段（旧记录没有时按空处理，初始化不迁移、不改写）：

```js
hatch: {
  version: 1,
  slots: {            // 固定八个 id，顺序即页面顺序
    use|shape|data|flow|ui|edge|write|check: { known: string, miss: string, edited?: true, at: ISO }
  },
  rounds: [           // 只追加；最多 50 轮
    { n: 1, at: ISO, by: "codex"|"claude", asked: [slotId], status: "sent"|"back", backAt?: ISO, packHash: hex64 }
  ]
},
hatchSkills: [ { assetId, versionId, at, slotsHash } ]   // 孵化回执，只追加、不可改写
```

- 格子状态由数据推出，不另存：只有 `known` → 填上；`known` 和 `miss` 都有 → 半格；只有 `miss` 或都空 → 空。
- 长度：每格 `known` / `miss` 各 2000 字，过滤控制字符。
- 校验：`server/schema.mjs:321` 的记录字段白名单加 `hatch`、`hatchSkills`。具体形状校验写在 `server/reverse-schema.mjs`，规则如下：
  - `hatchSkills` 只能经孵化确认写入，照 `packSkills` 的做法（`reverse-schema.mjs:218`）。
  - `rounds` 只能追加，既有轮次不可改写；唯一的例外是 `sent → back` 加 `backAt`。
- **八格回答格式**：任务包末尾要求 Agent 按八个二级标题 `## 用途` … `## 验收` 作答，每节两行：`已知：…`、`缺：…`。`parseHatchReply()` 只认这个格式；认不出的段落原样放进预览里的「分不进格」，不猜测、不丢弃。

## 4. 分批（每批开工前等你确认）

| 批 | 内容 | 验收 |
|---|---|---|
| 1 · 数据与协议 | `src/reverse-hatch.js`：`SLOTS`、`slotState`、`hatchScore`、`initialHatch`、`buildHatchPack`、`buildOrganizePack`、`parseHatchReply`、`applyHatchReply`（产出预览差异）、`legacyRounds`（从旧字段只读推出每轮）。`schema.mjs` / `reverse-schema.mjs` 加 `hatch`、`hatchSkills` 的形状与历史校验。不碰页面 | 单元测试覆盖：八格回答（全对、缺节、多出的节、乱序、空节、超长、含凭据）；`edited` 不被覆盖；轮次只追加；旧记录无 `hatch` 也能读；三条真实形状的合成记录（软件 / 网站被挡 / 本机文件）推出的每轮和样稿一致。`npm test` 全量通过 |
| 2 · 页面 | `ReverseHatch.jsx`：标本条、来源条、八格（含手改）、孵化器（蛋、接口灯、读数、每轮）、追问包复制并写轮次、放回结论的预览与确认、旧结论未分格面板、历史取证折叠、页尾工具（暂放 `ReaUpdate`）。`References` 改挂新页；搜索加八格正文 | 1440 / 390 截图与 3C 稿逐项对照；无横向溢出；控件 ≥ 44px；outline 焦点；减少动态效果时直接到位。三条旧记录都能打开，旧任务包、证据、已存 Skill 可读 |
| 3 · 孵化 | `reverse-skill-v4.mjs` 加 `hatchPreview` / `hatchConfirm` / `hatchQuery` 与接口 `/api/reverse/hatch/*`；`generateHatchSkill()`；`hatchedFrom.kind = reverse`；`capture-routes.js` 认 `hatchSkills`；资产详情来源与跳回 | 接口测试：预览 → 确认 → 回读；revision 冲突拒绝；八格变化后旧预览失效；同一状态重复确认复用；写入结果不明时先查询再决定。浏览器：孵化后资产仓库里能看到这份 Skill，点来源能跳回标本 |
| 4 · 动效与回归 | 放回结论的扫描线和格子逐个亮起、裂纹、孵化（裂满 → 抬壳 → 飞进伙伴屏）、复制的数据飞入；改写或退役旧的浏览器回归（§5） | 动效逐帧截图；全量回归通过；对比图给你确认 |
| 5 · REA 挪到设置 | `ReaUpdate` 搬进设置「对外接口 / 工具」，页尾的临时入口撤掉。**等 651 合并、交回认领后才开** | `rea-update-browser`、`rea-update-recovery-browser` 改指设置页后通过；逆向页不再出现 REA 读数 |
| 6 · 发布 | 按既有流程发布到 5178 并回读 | 需你授权 |

## 5. 测试

**要改写或退役的浏览器回归**：它们测的都是旧页面上的入口。第 2 批开工时逐个列出断言：属于冻结功能的随入口一起退役，交接里写清楚；属于保留功能的（投入、任务包、存 Skill、删除恢复）改指新页面。

- 测旧页面结构的：`reverse-v16-browser.mjs`（及 `reverse-v16-fixture.mjs`、`reverse-v16-helpers.mjs`）、`reverse-v4-browser.mjs`、`reverse-engineering-browser.mjs`、`reverse-fold-browser.mjs`、`reverse-repair-browser.mjs`、`ui-dispatch151-reverse-browser.mjs`。
- 只测冻结入口的：`reverse-native-browser.mjs`、`reverse-native-dialog-browser.mjs`、`reverse-ai-browser.mjs`、`reverse-precheck-browser.mjs`。

**不动，应照常通过**：
- 后台测试：`reverse-runner`、`reverse-native*`、`reverse-ai*`、`reverse-precheck`、`reverse-rea`、`reverse-media`、`reverse-launch`、`reverse-target-actions`、`reverse-recipe`、`reverse-skill`、`reverse-delivery`、`reverse-engineering.test`、`reverse-v4.test`、`rea-update*.test`。
- `rea-update-browser.mjs`、`rea-update-recovery-browser.mjs` 到第 5 批再改。

**新增**：
- 单元测试：`reverse-hatch.test.mjs`（第 1 批）。
- 接口测试：`reverse-hatch-skill.test.mjs`（第 3 批）。
- 浏览器测试：`reverse-hatch-browser.mjs`，覆盖切标本、勾格子、复制写轮次、放回结论预览与确认、手改格子不被覆盖、旧结论未分格、孵化、390 无溢出。

**跑法**：
- `npm test`。
- 浏览器脚本在 `npm run build` 后逐个跑，`WORKBENCH_DATA_DIR` 指向临时目录、注入适配器。
- 不碰正式 5178 和 `data/`。测试只用合成记录：可以照三条真实记录的**形状**造数据，但不读 `data/`。

## 6. 风险与先后

1. **上线后「炉子」不会像样稿那样有 2½ 格**。样稿里的格子是 Claude 照 10/16 结论手工分的。按 §1「不替用户分格」，上线后它只有「用途」一格，结论显示在「旧结论 · 未分格」里。要变成样稿那样，你点一次「让 Agent 按八格整理」，把回来的结论放回即可。
2. **设置页撞车**：主工作区有设置页 v19（651）未提交的改动，涉及 `SettingsV16.jsx`、`settings-v16.css`、`StoragePanel.jsx`，CURRENT 也被它认领。第 5 批必须等 651 交回。第 1–4 批不碰这三个文件。注意 `StoragePanel.jsx` 引用了 `reverseRecords`（备份计数），这几批都不改它。
3. **REA 入口的空档**：第 2 批撤掉页头的 `ReaUpdate`，第 5 批才进设置。中间暂放在页尾「工具」折叠里，不能让它消失。
4. **开发流程**：按 `AGENTS.md:23` 走：每批开一张 GitHub issue；在 worktree 里起分支 `<作者>/<issue 号>-<名字>`；提 PR、代码审查；你说「合并」才合并。
5. **CURRENT 头表**：等 651 交回时一起校正，这几批不动。

## 7. 待用户决定

1. **谁来实现**：
   - **推荐**：按 `COLLABORATION.md` §6，Claude 写派单并验收，Codex 实现，你终验。
   - 另一个选项：和项目空间第二版一样，全部由 Claude 做（前后端、测试）。
2. **从哪批开始**：
   - **推荐**：先开第 1 批（数据与协议）。它不碰页面和设置，和 651 不冲突。
   - 第 2、3 批可以在第 1 批合并后接着开。
3. **GitHub issue**：
   - **推荐**：开一张父任务「逆向工程 · 孵蛋 3C」，下挂 6 批子任务；派单里引用 issue 号。
   - 开 issue 会写到 GitHub，要你同意才开。

**10-29 用户决定（§7 三问）**：
1. **全部由 Claude 做**：前后端、测试、审查都由 Claude 在 worktree 里完成，用户终验（没选推荐的「Codex 实现、Claude 验收」）。
2. **只开第 1 批**（按推荐）。第 2、3 批等第 1 批合并后再开，开工前仍等用户确认。
3. **开 issue 并提交依据文件**（按推荐）：父任务 #27；子任务第 1 批 #33、第 2 批 #28、第 3 批 #29、第 4 批 #30、第 5 批 #31、第 6 批 #32。依据文件只提交逆向相关的，不带 651 的改动，不推送。

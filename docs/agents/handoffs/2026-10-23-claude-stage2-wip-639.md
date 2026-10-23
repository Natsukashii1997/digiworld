# Claude 639：阶段 2 主线串联进行中（A、B、C 完成，D 做了一半）· 阶段 1 发布被权限拦下

| 项 | 内容 |
|---|---|
| 输入 / 输出状态 | WB-20261023-637（写入者无）→ 认领 638 → 639。写入者仍为 Claude，阶段 2 由新会话接续 |
| 执行者 / 本轮范围 | Claude。用户 10/23 21:0x 改定：“全部你来做，不要让 codex做，抓紧推进”。①复核并发布阶段 1；②阶段 2 按[分批计划](../../product/2026-10-23-阶段2主线串联-分批计划.md) A→F |
| 用户已确认 | 去向从目标侧引用推导（条目上不写 route）；口令里装备 Prompt/Rule 附正文、其余只写名称与固定版本；收件快照每条 ≤3000 字、只带未交代的 |
| 基线 / 提交 | `8925f93` → `4474e7f`（A）→ `8c955b7`（B）→ `e71f759`（C）→ `5f05bcb`（D 一）。未推送 |
| 运行服务 / 真实数据 | 5178 仍是 `wb-20261023-626`，未重启、未发布；全部验证用隔离夹具与合成数据；没有写真实数据 |

## 1. 阶段 1 复核与发布

- 复核：`8925f93` 全量 **1526/1526**（`work/adopt638/full-suite.log`）。删除的 32 个文件已无残留引用（命中的只有同名的服务端模块）。前端能正常构建。
- 发布：**未执行**。照 626 的流程写发布脚本 `work/adopt638/adopt.py`，被 Claude Code 自动模式判为“生产部署”拦下，脚本没有写成。快照固定从 `8925f93` 用 `git archive` 导出，阶段 2 的改动不会混进去。
- 要发布，需要用户在对话里明确放行，或在权限设置里允许这一步。步骤沿用 adopt626：
  1. 构建候选包：git archive + 链接 deps-20261016-539 的 node_modules + vite build。
  2. 校验没有进行中的操作，备份 data 和 plist。
  3. 写入 `releases/wb-20261023-638`（只读）。
  4. 一次 bootout + 一次 bootstrap。
  5. 回读：pid 变化；data 指针、revision、条数不变；dist 逐字节一致。
  6. 回滚：plist 指回 `wb-20261023-626`。

## 2. 阶段 2 已完成

### A 批 `4474e7f`：去向模型与接口
- `server/project-desk-schema.mjs`（新）：主库顶层新增 `projectDesk:[{projectId, inbox:[{kind:note|collection,id,at}], loadout:[{assetId,versionId,at}], next?:{text,at}}]`。只能经专用接口修改，整库保存改不了。
- `server/project-desk.mjs`（新）与 `http.mjs` 路由：
  - `GET /api/project-desk`。
  - `POST /api/project-desk/{deliver|withdraw|equip|unequip|next}`。
  - 每个操作都是“让状态成为 X”：重复请求不写库。投递只接受在推进的项目，条目必须存在。`next` 带修改前的文字，别处改过就拒绝覆盖。
- 归档：
  - 随手记：`archivedAt`，接口 `POST /api/notes/:id/archive`。
  - 收藏：收藏库里的 `archived` 表，接口 `POST /api/collection/notes/:id/archive`；`/collection/notes` 返回时带上这张表。
- 资产首版 `hatchedFrom:{kind,id}`：`revise`、恢复、采用候选都不继承；MCP 资产不接受。卷条目来源可以是 `collectionId`（和 `reverseId` 二选一）。
- 留痕：`/collab/record` 可选带 `inbox`、`loadout` 引用（只限 start），据此推出“已交代”。
- 备份恢复：恢复到空工作台时带回项目桌；并入已有工作台时保留当前的项目桌。
- `src/capture-routes.js`（新）：`captureRouteIndex` 从目标侧引用推导去向，没有去向即待孵化；另有 `relayOf`、`pendingInbox`。
- 测试：`tests/stage2-routes.test.mjs`，11 条。

### B 批 `8c955b7`：公共写入能力
- `src/write-attempt.js` 的 `settleAttempt(mode)`，mode 为 first / retry / recover：
  - 回读查到才算完成。
  - 发送失败或中断时先查询；查不到只报告，不自动重放。
  - 只有明确重试，才用同一尝试重发一次。
  - 同一编号是别的内容，算冲突。
- 首页“记一笔”已迁过去，文案和行为不变。测试 `tests/write-attempt.test.mjs`，5 条。
- `web-draft-browser` 的两个恢复场景在当前机器上时序不稳：改动前的构建同样会挂（首页场景改前 3 次全挂、改后 3 次过 1 次），单独跑能过。脚本和日志在证据目录。

### C 批 `e71f759`：孵化面板
- `src/HatchPanel.jsx`、`hatch.css`：四个去向是投递到存档槽项目、孵成资产、收入焚决、归档。都是先查询再写，再回读核对。
- 随手记：卡片显示去向徽记，加了“孵化”蛋按钮；筛选增加 待孵化 / 已投递 / 已交代 / 已孵成 / 已归档。
- 收藏：展开卡加“孵化”按钮和去向徽记（由 `src/collection-hatch.js` 提供）。孵化面板叠在详情卡之上；孵成资产前先关掉详情卡。
- 资产编辑器支持预填，标题为“孵成资产”。
- 侧栏随手记、收藏显示绿色待孵化数。
- 炼入对话框拆到 `src/RefineDialog.jsx`。

### D 批（一）`5f05bcb`
- `src/relay-desk.js`：`relayDesk`、`relayDeskSection` 生成口令里的收件、装备两段。`projectRelayPrompt(item, agent, desk)` 增加可选的第三个参数。测试 `tests/relay-desk.test.mjs`，3 条。
- `src/ProjectDesk.jsx`：`SlotDesk`、`LoadoutDialog`、`deskRows`、`deskWrite`。**已写，未接入页面，未实看。**

## 3. 验证

- 全量：A+B **1542/1542**（`AB-full.log`）；C **1542/1542**（`C-full-2.log`）。D（一）只跑了 `relay-desk` + `projects-update183`，13/13；**提交后没有跑全量**。
- C 批实看（`shoot-c.mjs` → `c-shots/report.json`）：
  - 1440/768/390/320 均无横向溢出。
  - axe 三处 0 违规。
  - 减少动态效果下，孵化面板没有在播放的动画。
  - 八个去向（随手记、收藏各四个）都回读通过。
  - 伙伴屏改动前后四种宽度结构、样式、尺寸、位置一致（`partner-before` / `partner-after`）。
- 证据目录（git 忽略）：`docs/agents/handoffs/evidence-2026-10-23-claude-stage2/`。截图在 `c-shots/`。

## 4. 剩余计划

1. **D 批接线**：
   - `ProjectsV16.jsx`：
     - 读一次 `/collection/notes`，拿到 `collectionNotes`。
     - `SaveCard` 里放 `<SlotDesk rows={deskRows(state,id,collectionNotes)} …>`，加上 `LoadoutDialog` 的状态。
     - 继续按钮名保持“继续”（浏览器测试按这个名字点），数量写在旁边小字。
     - `ProjectLaunch`：`prepared = projectRelayPrompt(item, agent, relayDesk(state, id, {collectionNotes}))`。收藏没读完时禁止复制。复制前重读 `/workspace`，收件或装备变了就要求重新预览；预览后它们变了，把 `seen` 置为 false。
   - `Collab.jsx` 的 `usePromptCopy.copy` 接受 `inbox`、`loadout`，非空时放进留痕。
   - `projects-v16.css` 补 `.pj-desk*`、`.pj-gear`、`.pj-loadout*` 样式，只用令牌。
   - 跑全量和实看（1440/390 截图，另查 768/320，axe），给用户看截图后提交。
2. **E 批**：
   - `server/collab-board.mjs` 的 `boardItem`：`parseCurrentStatus` 结果是 `unparsed` 时，从 CURRENT 正文取最新二级标题和它的首段，作为新状态（例如 `outline`），带上 `summary`。
   - `readableCurrent` 接受这个状态，可以继续，但不推断写入者、阶段、停滞。
   - `startPrompt` 写入“最近进展”和手填的下一步（`projectDesk.next`）。存档槽里给手填下一步留输入位。
   - 用牛马之家格式的合成样例测试：正文里有表格干扰、标题超长。
3. **F 批**：真实走一遍，需要用户另行授权（发布、写一条真实数据、用户在场）。
4. 阶段 1 发布：等用户放行，见第 1 节。

## 5. 注意与范围外

- 不在条目上写 route；不复制正文（快照只在口令里）；已交代 ≠ 已完成；伙伴屏一像素不改。
- `HatchPanel` 与 `ProjectDesk` 都用 `settleAttempt("retry")`，即先查询再发送；接口本身幂等。
- 范围外，未修：`web-draft-browser` 时序不稳（改动前就有）；634 列出的过期浏览器脚本。

## 唯一下一步

新会话读本交接与 CURRENT 639，先请用户放行阶段 1 发布（或明确暂缓），再按第 4 节做 D 批接线 → E → F。开工前先给用户分批计划，等确认。

# Claude｜派单：逆向工程孵蛋 3C · 第 1 批 数据与协议（2026-10-29）

> **已定稿**：用户 10-29 确认落代码方案 §7 三问：全部由 Claude 做；只开第 1 批；开父任务 #27 与 6 张子任务，依据文件提交到 main（不推送）。见方案文末「10-29 用户决定」。

```text
issue：#33（父任务 #27）
执行者 / 本轮范围：Claude 写本派单、方案里的用户决定、GitHub issue，并提交依据文件到 main；不推送
接手者：Claude（实现、测试、审查、交接）；用户终验
依据：用户 2026-10-29 选定 3C 孵蛋（原话「定 3C 孵蛋」），简报 §9 四条都按推荐（原话「都按推荐」），方案 §7 选「全部由 Claude 来做」「只开第 1 批」「开 issue，并提交依据文件」
基线：HEAD ac31e8a；主工作区有设置页 v19（651）未提交改动，CURRENT 被 651 认领
```

## 一、用户决定（与方案冲突时以此为准）

1. 页面视觉定为 3C 孵蛋。
2. 八格用一套通用的：用途、结构、数据、流程、界面、边界、写入与回滚、验收。
3. 导航留在侧栏 06。
4. 冻结工作台内执行（487 / 572 / 462 / 507）：只撤入口，代码和数据保留。
5. REA 版本维护挪到设置，等 651 交回后单独一批。
6. 全部由 Claude 做（实现、测试、审查），用户终验；先只开第 1 批。

## 二、唯一依据

| 文件 | 作用 | SHA256 前 12 |
|---|---|---|
| `docs/design/ui-v19/briefs/05-reverse-impl-plan.md` | **落代码方案**：§2 改法，§3 `hatch` 数据结构与八格回答格式，§4 第 1 批，§5 测试 | b8e0bee5b642 |
| `docs/design/ui-v19/briefs/05-reverse.md` | 页面简报：§4 数据口径（八格怎么来、追问包、孵化、旧记录） | b0826956a2b4 |
| `docs/design/ui-v19/逆向工程-3C-孵蛋精修.html` | 视觉稿（生成物） | 7424a3d9358f |
| `docs/design/ui-v19/build/reverse-3C-孵蛋.html` | 视觉稿模板：八格数据形状、`egg()` / `crackFor()` 可移植 | ebcf6d2e2f97 |
| `docs/design/ui-v19/v19-reverse-r2.js` | 样稿共用数据：三条记录的真实形状、`pack()` 的问法 | 2b4659bd88c2 |
| `docs/design/ui-v19/shots/逆向工程-3C-孵蛋精修-1440.png` / `-390.png` | 截图 | 594aaf83a960 / 983976b9e517 |
| `docs/product/2026-10-29-逆向工程定位与重构方案.md` | 定位方案：§3 M1–M9、§6 冲突、§7 拍板 | 34ec75ad2dab |

## 三、范围（方案 §4 第 1 批）

- **做**：
  - 新增 `src/reverse-hatch.js`，包含这些函数：`SLOTS`、`slotState`、`hatchScore`、`initialHatch`、`buildHatchPack`、`buildOrganizePack`、`parseHatchReply`、`applyHatchReply`、`legacyRounds`。
  - `server/schema.mjs` 记录字段白名单加 `hatch`、`hatchSkills`。
  - `server/reverse-schema.mjs` 加形状校验和历史校验：
    - 轮次只追加，唯一例外是 `sent → back` 时加 `backAt`；
    - `hatchSkills` 只能经孵化确认写入。
  - 新增 `tests/reverse-hatch.test.mjs`。
- **不做**：
  - 页面（第 2 批）、孵化接口（第 3 批）。
  - 不改 `src/ReverseV16.jsx` 的行为。
  - 不改 `SettingsV16.jsx`、`settings-v16.css`、`StoragePanel.jsx`（651 在改）。
  - 不改 `CURRENT.md`。
  - 不改写旧记录的任何字段。
  - 不新增依赖。
  - 不发布、不推送。

## 四、开工条件与做法

1. **依据文件提交到 `main`**：用户 10-29 已同意；只提交逆向相关的方案、简报、派单、样稿与截图，不带 651 的改动，不推送（提交号见 issue #33 评论）。实现分支从 `origin/main` 拉，不含这次本地提交；依据以主目录 `main` 上的文件为准。
2. 分支 `claude/33-reverse-hatch-data`，从 `origin/main` 拉，在独立 worktree 里做。
3. 走 `AGENTS.md:23` 的流程：实现 → 代码审查 → PR → 用户说「合并」才合并。
4. 交接写在 `docs/agents/handoffs/`。

## 五、验收（Claude 自验，用户终验）

- `npm test` 全量通过。
- `reverse-hatch.test.mjs` 覆盖方案 §4 第 1 批「验收」列的情况：
  - 八格回答：全对、缺节、多节、乱序、空节、超长、含凭据；
  - 手改过的格子（`edited`）不被覆盖；
  - 轮次只追加；
  - 旧记录没有 `hatch` 也能读；
  - 三条合成记录推出的每轮和样稿一致。
- 测试只用合成记录，可以照真实记录的形状造数据。用 grep 或打桩证明测试过程中没有读 `data/`、`~/.claude`、`~/.codex`。
- 旧接口 `/api/reverse/*` 的返回形状不变；后台既有逆向测试全部照常通过。
- 交接写在 PR 描述里（按 PR 模板），分开报告：文件改动、测试、服务是否采用、真实使用、用户验收。

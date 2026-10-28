# Claude｜派单：项目空间第二版 · 第 1 批 数据源（2026-10-29）

```text
issue：#8（父任务 #7）
执行者 / 本轮范围：Claude 只写本派单、简报与方案里的用户决定、GitHub issue；不改 src/、server/、tests/，不发布、不推送
接手者：Codex（实现、回归、交接）；Claude 验收；用户终验
依据：用户 2026-10-29 确认简报 04-projects-space-v2.md 与落代码方案 04-projects-space-v2-impl-plan.md（原话「都按推荐」）
基线：HEAD 4996f1a；主工作区有设置页 v19（651）未提交改动且 CURRENT 被 651 认领
```

## 一、用户决定（2026-10-29，与方案冲突时以此为准）

1. 简报 §9 四条都按推荐：
   - 代表色与两字母代号放数码世界这边的小表，不改数字分身名册。
   - 实战开关默认关闭，开前先预览（第 2 批做）。
   - Codex 点名单独一行，标“仅参考”（第 2、3 批做）。
   - 置顶最多 3 个。
2. Claude 写派单并验收，Codex 实现，用户终验。先开第 1 批。

## 二、唯一依据

| 文件 | 作用 | SHA256 前 12 |
|---|---|---|
| `docs/design/ui-v19/briefs/04-projects-space-v2-impl-plan.md` | **落代码方案**：§2 元素 → 现版代码 → 改法，§3 必须保留的规矩，§4 第 1 批，§5 测试 | 6f84635d3c6b |
| `docs/design/ui-v19/briefs/04-projects-space-v2.md` | 页面简报：§4 数据口径（下一步取数顺序、过期、卡带那一件事的优先级） | c256ef29ffc1 |
| `docs/design/ui-v19/项目空间-7E-卡带电路.html` | 视觉稿；页面里的 `g5-data` 是 10-28 只读实况，可对照字段形状 | b065ac98b604 |
| `docs/design/ui-v19/shots/项目空间-7E-卡带电路-1440.png` / `-390.png` | 截图 | cddb52d262d3 / 6eac8bc5a77c |
| `docs/product/2026-10-28-项目空间定位与重构方案.md` | 定位方案：§3 必须做、§6 冲突、§7 拍板 | f940a7f9adaa |

## 三、范围（方案 §4 第 1 批）

- **做**（细节见 issue #8 与方案 §2）：
  - `server/project-roster.mjs`
  - CURRENT 顶节解析与下一步取数
  - issue 标签拆分
  - 未推送数共用函数
  - 全名册 30 天 Git 提交
  - `GET /api/projects-space`、`POST /api/projects-space/pin`
  - `src/project-hues.js`
  - 以上全部的测试
- **不做**：
  - 页面（第 3 批）。
  - 实战采集与开关（第 2 批）。
  - 不改 `src/ProjectsV16.jsx` 的行为。
  - 不改 `src/SettingsV16.jsx`、`settings-v16.css`、`StoragePanel.jsx`（651 在改）。
  - 不改 `CURRENT.md`（651 认领中）。
  - 不新增依赖，不放宽 `gh` 只读白名单。
  - 不发布、不推送。

## 四、开工条件与做法

1. **依据文件已在 `main` 上**：用户 10-29 同意（原话「提交到 main」），简报、方案、7E 稿与两张截图、定位方案、本派单和定位交接一起提交（只提交这 8 个文件，没带 651 的改动，未推送）。从 `main` 开 worktree 即可看到。
2. 分支 `codex/8-projects-space-data`，在独立 worktree 里做，不在主工作区改（主工作区有 651 的未提交改动）。
3. 走 `AGENTS.md:23` 的流程：实现 → 代码审查 → PR → 用户说「合并」才合并。
4. 交接写在 `docs/agents/handoffs/`。CURRENT 等 651 交回认领后再补。

## 五、验收（Claude）

- `npm test` 全量通过。新增的单元与接口测试覆盖 issue #8「验收」一节列的情况。
- 测试只用合成名册、合成 CURRENT 和注入的适配器。用 grep 或打桩证明：测试过程中没有读 `~/Documents/Obsidian Vault`、`~/.claude`、`~/.codex` 和 `data/`。
- `GET /api/projects-space` 对着视觉稿里的 `g5-data` 逐项对字段：名册、置顶、读数、现在 / 下一步、30 天提交。实战字段第 1 批先返回 `null`。
- 旧接口 `/api/project-status/*`、`/api/project-github/panel` 的返回形状不变。
- 交接按 Codex 交接格式写，分开报告：文件改动、测试、服务是否采用、真实使用、用户验收。

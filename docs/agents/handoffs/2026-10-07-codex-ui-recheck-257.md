# Codex 交接 257｜数码世界 UI 复审纠偏

输入状态：`WB-20261007-256`；输出状态：`WB-20261007-257`。执行者：Codex。此交接纠正 [255 终审](2026-10-07-codex-ui-final-255.md)把默认空态与减少动效截图推及全站内容态的过度结论。

## 本轮实际改动

| 对象 | 修改位置 | 原因与结果 |
|---|---|---|
| 设置 | `src/settings-v16.css`；`tests/visual.mjs` | 1024px 能力表第一列挤压，改中屏单列和分类导航；加入首列宽、行高断言。 |
| 知识仓库 | `src/knowledge-v16.css`、`src/KnowledgeV16.jsx`；`tests/ui-final-254-browser.mjs` | 390/320px 四代理恢复获批一排，状态短文案保留完整可访问名称；几何与键盘/axe 复核。 |
| 首页与夜巡 | `src/home-v16.css`、`src/night-v16.css`、`src/NightV16.jsx`、`src/NightV2Results.jsx`；`tests/home-v16-browser.mjs` | 信息小字局部增对比；首页失效的过渡令牌修正；三处程序化滚动尊重减少动效设置。 |
| 协同 | `src/CollabV16.jsx`、`src/collab-v16.css`；`tests/collab-v16-browser.mjs` | 手机端固定泳道头、给角色独立区域，并让前一站与当前站同屏；空态操作降为符合批准稿的轻量文字链接，保留原有两个有效动作。 |
| 证据完整性 | `tests/aihot-v16-browser.mjs`、`tests/silver-v16-browser.mjs`、`tests/knowledge-v16-browser.mjs`、`tests/savepoints-v16-browser.mjs`、`tests/calendar-v16-fixture.mjs`、`tests/calendar-v16-browser.mjs` | 补 AI HOT/银饰/知识内容态图，存档点确认框打开态图；日历 fixture 改读 v2 19:00–20:00 夜巡窗口并断言。测试夹具不接触真实主库。 |

对照图在 [comparison](evidence-2026-10-07-codex-ui-recheck-256/comparison/)；完整视觉记录在 [视觉 T2](evidence-2026-10-07-codex-ui-recheck-256/视觉T2.md)。本轮没有修改学习成长页：常浩本轮明确要求沿用已确认的 v14，只修可复现缺陷；现有检查未复现该页新缺陷。

## 验证与首败

- 最终隔离回归：`npm test` **1044/1044**；**95/95** 浏览器入口；视觉脚本 138 张图、`problems=[]`。`regression-final-2/manifest.json` 全通过，源码/构建/运行器前后指纹一致，文件保护拒绝 0；`data/CURRENT.json` 指针在整轮前后均为 `01c78dd6745fb96a3c49278f9f87545c91a360bcd66570ea99a840b879507064`。完整证据在 [regression-final-2](evidence-2026-10-07-codex-ui-recheck-256/regression-final-2/) 与 [控制台记录](evidence-2026-10-07-codex-ui-recheck-256/regression-final-2-console.log)。
- 最终构建：HTML SHA256 `27fdcd64a85c0f5a2742f4acd6d40afd7e722164c856ae35b9a7c10d9434ec3d`；JS `7e1029c5dc2bed770440f1b955ab056254f6eac4e78f9d06ce43902508ed28f8`；CSS `aa5106c947a0b175cabdeab624079354e28a0bf338a225f968c96135c9bfaa6a`。5178 现返回 `/` 与这两项构建资源的字节和本地 `dist/` 相同；不据此声称真实业务或用户已验收。
- 首次全量单测 **1043/1044**：新写知识页字号用了字面 `12px`，违反设计令牌规则；修为 `var(--fs-small)` 后全绿。首次失败原样保留在 `evidence-2026-10-07-codex-ui-recheck-256/regression/`。协同固定区初稿在 320 仍遮前一站，相关几何失败与图保留在 `targeted/collab-context*`；改窄后复核通过。中途因新视觉发现主动中止过一轮未完成回归，未拿它冒充最终结果。
- `git diff --check` 对本轮修改文件无空白问题；未重置、stash、提交、推送或安装依赖。原有脏工作树保持原样。

## 仍需复审

- [T2](evidence-2026-10-07-codex-ui-recheck-256/视觉T2.md)不签发全站“无瑕疵”结论：正常动效的完整观感、真实长内容、真人在已刷新 5178 标签中的体验尚未全覆盖；现存历史批准资料也缺单一不可变包 SHA。
- 项目空间手机端空槽占首屏、银饰内容增多后的阅读节奏，是已批准构图中的设计取舍候选；如决定重做，先走方向确认。协同 390 前一站轴标最左少数字形轻微受遮，但站名、节点与结果均可读，记录给 Claude 观察。
- Claude 与用户尚未复审/终验。没有向 Claude 客户端发送消息；本交接已经写在双方共享目录。

唯一下一步：Claude 读取 `CURRENT.md` 的 `WB-20261007-257` 与本交接，对照同 SHA 构建、批准稿和内容态图做独立视觉复审；把可复现缺陷、设计取舍建议、缺证据分别反馈，由常浩做最终取舍。

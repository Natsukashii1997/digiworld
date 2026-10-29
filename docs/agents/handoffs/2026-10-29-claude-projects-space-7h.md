# Claude｜项目空间项目卡跟着 Vault 知识源只读（样稿 7H 方向 1，2026-10-29）

```text
输入状态 / 输出状态：main 95028f5 / 分支 claude/22-ps-card-state
执行者 / 本轮范围：Claude；#22。常浩问「这个项目卡的作用是什么？无法点击。」→ 样稿 7H（方向 1 跟知识源只读 / 方向 2 读不到不放灰按钮）→「方向1」
样稿：docs/design/ui-v19/项目空间-7H-项目卡状态.html
```

## 改了什么
- **读项目卡的门槛**（`server/project-roster.mjs` `createCardReader`）：不再看 `vault` 能力（设置页「写入 Obsidian Vault · 个人说明采纳写回」），改为跟着已连接的 Vault 知识源只读，选来源用 `selectedProfileSource`（与个人说明同一个来源：规则里指定的，否则第一个 Obsidian，再退到第一个本地来源；飞书不算）。读文件仍走 `createPolicyKnowledgeFiles` 的访问策略。`server/http.mjs` 不再传 `settings`。
- **读不到时的说明**：没连本地知识源 → `off`，档案头写「项目卡：没连 Vault 知识源，只显示本机路径」；来源待重新确认（`KNOWLEDGE_ROOT_IDENTITY_CHANGED`）→「Vault 知识源要在设置里重新确认」；其他 →「项目卡读不到」。后两种仍带 Obsidian 链接。方向 2（读不到时不放灰按钮）没做。

## 注意
- 正式数据里的 Obsidian 知识源当前是「需要重新确认」（`knowledgeSourceHealth` = `needs_reconfirmation`），发布后档案头会显示「Vault 知识源要在设置里重新确认」，常浩在设置里重新确认后才读得到项目卡。

## 测试
- `tests/projects-space.test.mjs` 17 条全过（改写项目卡读取一条：只有飞书来源时不读文件、优先 Obsidian、待确认与读不到的说明）。
- `tests/projects-space-browser.mjs` 11 项 PASS；旧页回归 4 组 PASS；全量 `npm test` 1586 / 1584 过，2 条失败同基线（wiki-local、隐藏目录 factory）。
- 服务是否采用：未发布。用户验收：未做。

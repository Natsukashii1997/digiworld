# Claude｜项目空间档案头与卡带文字（样稿 7G，2026-10-29）

```text
输入状态 / 输出状态：main 1ad3dac / 分支 claude/20-ps-head-cart-text
执行者 / 本轮范围：Claude；#20。常浩看正式页两条意见 → 样稿 7G（A 走线淡出 / B 渐变暗底 / C 丝印标签）→「用 A」
样稿：docs/design/ui-v19/项目空间-7G-档案头与卡带文字.html
```

## 改了什么
- **档案头**（`Head`）：去掉左边代号方块（`.g5-mono`），项目名、简介、目标 / 不做、项目卡说明都从第一列起，左对齐；按钮仍在右上，手机上换到下面一行。删掉 `.g7-head .g5-mono` 两条尺寸规则和手机上重复的列设置。卡带上的代号芯片不动。
- **卡带文字**（`.pcb`，方向 A）：走线 SVG（含过孔和选中时的流光）加一层静态渐隐遮罩——板子上 40% 照常，到 52%–82%（项目名和副标题那一带）只剩一成，底部再浮现到七成；`.tx` 加很浅的投影。遮罩不带动画，避开 Safari SVG 动画结束不重绘的问题。

## 测试
- `tests/projects-space-browser.mjs` 11 项 PASS（新增断言：档案头没有 `.g5-mono`、项目名与档案头左边齐；选中卡带的走线有渐隐遮罩，文字落在淡出带里）。
- 旧页回归 4 组 PASS（projects-v16、ui-v14-projects、project-pending-refresh、projects-freshness）。
- 全量 `npm test` 1586 / 1584 过，2 条失败同基线（wiki-local、隐藏目录 factory）。
- 改前改后截图 `docs/design/ui-v19/shots/项目空间-7G-改前改后.png`：改前取正式 5178；改后用本分支 `dist` 替换页面资源、数据仍读正式 5178（1440 / 390 无横向溢出，档案头无代号）。
- 服务是否采用：未发布。用户验收：未做。
- `/code-review`：Standards 无硬违规（合并了两块同名 `.pcb .trace`、去掉手机上重复的 `grid-column`）；Spec 无实现错误。留作观察：文字顶部约 2% 落在遮罩 50%–52% 过渡区；`.g5-mono` 基础规则现在只剩卡带芯片在用，尺寸都被覆盖（原有，未动）。

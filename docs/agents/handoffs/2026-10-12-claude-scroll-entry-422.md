# Claude · 焚决条目排布 422

输入 420 → 认领 421 → 输出 WB-20261012-422（候选待常浩看效果，写入者仍为 Claude）。

## 要求
常浩给样图：“按照这个信息排布来改，标题和复制按钮一行，下面的小字左右顶住。然后数字表示不用改，还是现在的带框的。”

## 改动（基线 `work/ui-scroll421/baseline/`）
- `src/Assets.jsx`（ScrollCard 条目）：
  - 第一行：带框编号、名称、复制按钮（图标 + “复制”）。没起名称时用占位撑开，复制按钮仍靠右。
  - 第二行：正文通栏（最多 3 行）。
  - 第三行：“已复制 N 次”。
- `src/assets-quick-copy.css`：条目改为纵向三段；复制按钮去掉方框，改为图标加文字，高 32px，悬停变橙并带浅底；编号样式不变。
- 测试同步：
  - assets-actions-browser 3 处、scrolls-browser 1 处，精确文案“复制 N 次”改为“已复制 N 次”。
  - scrolls-preview-browser 的几何断言：逐条复制按钮宽度由“=32”改为“≥56”（因为加了文字），高 32 和图标 14 不变。

## 验证
- 候选构建 `work/ui-scroll421/dist`。scrolls-preview、scrolls-named、scrolls、assets-actions 四个浏览器回归通过；digital-world-ui 单元测试 11/11 通过。
- 正式 dist 和 5178 都未改。

## 唯一下一步
常浩在 5412 `#assets` 看效果。采纳则构建 dist 并核对 5178 HTTP；否决则从基线还原。

## 采用（常浩：“采纳”，输出 WB-20261012-423）
- 原 dist 备份到 `work/ui-scroll421/dist-before`，然后 `vite build` 写入正式 dist。5178 原进程未重启，index.html、index-D3cm-RiP.js、index-DeiFLsij.css 经 HTTP 取回与磁盘 SHA256 一致。
- 正式 dist 下 scrolls-preview、scrolls-named、scrolls、assets-actions 四个浏览器回归通过。
- 已停 5412 预览，删除候选构建。未提交、未推送；改动和既有未提交改动一起留在工作区。

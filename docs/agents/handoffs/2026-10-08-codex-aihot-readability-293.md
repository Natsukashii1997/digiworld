# AI HOT 按钮与资讯可读性返修 · WB-20261008-293

- 输入状态 / 输出状态：`WB-20261008-292` → `WB-20261008-293`。
- 执行者 / 范围：Codex；只改 AI HOT 阅读样式、全站按钮式链接的悬停选择器及专项浏览器断言。用户此前确定的“整页去原站、不放逐条原文链接”继续保留。
- 原因：`ui-v14.css` 的全局 `a[href]:hover` 把实体按钮的深色字覆盖成青色；`aihot-v16.css` 对主卡摘要使用 3/6 行截断，对更多精选和热点使用单行省略。当前本机缓存的精选标题/摘要没有碰到服务端 200/600 字上限，热点缓存无摘要。
- 修改：`src/ui-v14.css` 两处普通链接悬停规则排除 `.button`；`src/aihot-v16.css` 解除标题/摘要的行数和单行裁切、自然换行并以内容撑高，热点条目取消均分拉伸；阅读正文字号适度提高。`tests/aihot-v16-browser.mjs` 检查每条缓存标题/摘要与实际可见几何、长连续英文在 320/390/1440px 不截断，以及按钮悬停字色、无下划线、沿用全站光带动效。服务端字段和真实缓存均未改。
- 验证：`npm run build` 通过；`node tests/aihot-v16-browser.mjs` 通过；`node tests/aihot-learning-browser.mjs` 通过；`npm test` **1176/1176**；`node tests/visual.mjs aihot-readability-293` **138 张，problems=[]**。真实 `127.0.0.1:5178/#aihot` 重载后见精选 10 条、热点 10 条，检查各条标题与摘要可见几何 **0 截断**，且更多精选 `white-space: normal`；本机运行服务已采用新构建。合成 [1440px 截图](../../../test-results/aihot-v16/aihot-full-1440.png)、[390px 截图](../../../test-results/aihot-v16/aihot-full-390.png)。
- 核心文件 SHA256：`src/ui-v14.css` `05ad3a493de7c4df47c4966a81c51d335540b3a0c2517c9dcf09b6870dcf5ff1`；`src/aihot-v16.css` `745641e9f1a5aa96644d60efc07bb35fed191f428512e631af3a9544d1e15d97`；`tests/aihot-v16-browser.mjs` `e468159b920f6b04168fe59ef79e191f5db4fc03f6ea3dda606ee66c37a6dc25`。
- 数据边界：`data/CURRENT.json` SHA256 `a2b7dde77bf2407849df3d0b5c5f35c48a1a91dafa694ec93d9d0f144f4790ec`，与认领前一致；未点击真实刷新、收藏或外链。页面完整显示的是接口缓存提供的标题与摘要，不代表原站文章全文。
- 后续：用户在本轮又提出页头与左下角状态、夜巡徽章、随手记删除、日历完成项，以及“待决剪藏”文案解释；这些是下一批独立认领工作。AI HOT 的真人使用验收尚待常浩查看。

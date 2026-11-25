# #127 动效统一：测量与验证脚本

结果日志、截图和性能 JSON 在本机 `~/Library/Application Support/PersonalAIWorkbench/evidence/127-motion-20261125/`（不进仓库）。这里只放能复现的脚本。

- 路径约定：脚本按当时的沙盒 `~/Sandbox/2026-11-25-digiworld-motion/`（`wt/` 改后副本、`base/` main 副本、`preview.log` 里是合成数据预览地址）写死，复用前改成自己的副本路径。
- 本机 Playwright 缓存浏览器版本（1248）与库期望（1234）不一致时，用 `PLAYWRIGHT_BROWSERS_PATH` 指向一个把 1234 软链到 1248 的目录（见 run-browser.sh）。

| 脚本 | 做什么 |
|---|---|
| inventory.mjs | 抽出全部 CSS 的 transition / animation 声明（审查清单） |
| measure.mjs | 9 个页面 × 3 种宽度的切页与滚动帧间隔、布局偏移；`PW_GPU=1` 用开 GPU 的 Chrome |
| anims.mjs / ab2.mjs | 某页常驻动画清单；首页信号线四种写法的帧对照 |
| stress-flip.mjs | 100 张卡、60ms 间隔连切 30 次分类的样式重算、布局次数与帧间隔 |
| verify-*.mjs | 退场残影、焦点归还、重开层级、SVG id、卡片换位、页签对齐、折叠开合与打断 |
| run-browser.sh / run-list.sh | 并发 3 跑全部 / 指定浏览器回归 |

# Claude：数码世界收藏插件换上「像素数码蛋」图标（2026-11-02）

- 输入状态 / 输出状态：WB-20261031-679 → 未改 CURRENT（另一个 Claude 会话仍是写入者，见下「未完成项」）
- 执行者 / 本轮范围：Claude（会话 local_67b40a5a，由 local_6618c9cb 派出），issue #51，分支 `claude/51-ext-icon`，独立 worktree `.claude/worktrees/ext-icon`，从 `origin/main`（`0247307`）拉出。只动 `browser-extension/collection/`。

## 来由

插件 manifest 没有设 `icons`，Chrome 工具栏显示默认的灰色字母块，和「ChatGPT 回答收藏器」等插件放在一起时不好找。用户看了 3 版方案（像素数码蛋 / LCD 绿屏收纳 / 画布作品卡，带 128/48/32/16 和深浅工具栏预览）后选 A 版「像素数码蛋」。

## 改动文件

- `browser-extension/collection/icons/icon.svg`（新）：源文件。藏青 `#0f1729` 圆角底、奶白 `#f6f2e4` 像素蛋、橙 `#ff8a24` 斑点、右下青 `#4de3ff` 加号，颜色取自 `src/tokens.css`（`--panel`、`--px-egg`、`--orange`、`--cyan`）。8px 一格，16px 下仍能认出蛋形。
- `browser-extension/collection/icons/make-icons.mjs`（新）：用项目已有的 Playwright 把 SVG 渲染成 `icon-16/32/48/128.png`，不加依赖。
- `browser-extension/collection/icons/icon-16/32/48/128.png`（新）：由上面的脚本生成。
- `browser-extension/collection/manifest.json`：加 `icons` 与 `action.default_icon`，四个尺寸。版本号没改（仍是 1.2.0，`server/collection.mjs` 里也写死了这个号）。

## 验证

| 项 | 结果 |
|---|---|
| `npm test` | 整套跑时 `tests/reverse-ai-process.test.mjs` 起的模拟 codex 子进程 0% CPU 挂住 50 分钟，手动结束后整套才收尾。拆开跑：除该文件外 `ℹ tests 1615` / `ℹ pass 1612` / `ℹ fail 3`；三项失败（`capability-services` 生产 factory 接线、`digital-world-ui` 本地 HTTP 供应构建入口、`knowledge-writeback` wiki-local 候选）在干净的 `origin/main`（`0247307`）上同样失败（`ℹ pass 34` / `ℹ fail 3`），与本次改动无关。`reverse-ai-process` 单独跑：「真实OS写入隔离拒绝目标改写…」失败，随后又挂住；没在 main 上对照（结束挂起进程被权限拦下），只改插件文件，判断与本次无关 |
| 加载插件 | Playwright Chromium `--load-extension` 加载本分支插件：manifest 有效，`chrome.runtime.getManifest()` 读到 `icons` 与 `action.default_icon` 四个尺寸，四个 PNG 都返回 200 |
| 出图 | 本机 `node_modules` 里的 Playwright（1.63）找不到对应版本的 Chromium（`chromium_headless_shell-1234` 没下载），本轮出图借用 `chatgpt-clipper` 的 Playwright 跑同一份脚本逻辑；仓库脚本本身未改动这一点。以后在本机重跑需要先 `npx playwright install chromium-headless-shell`，或同样借用 |
| 视觉 | 2 倍屏浅色、深色工具栏前后对比，和收藏器（橙底）、牛马之家（黑底）一眼能分开 |

## 运行服务 / 真实数据

没有发布，没有动正式 5178 和任何数据。已安装的插件从发布目录加载（`server/collection.mjs` 返回的 `browser-extension/collection` 路径），合并并发布后到 `chrome://extensions` 点重新加载才会换上新图标。

## 未完成项

- CURRENT.md 当前写入者是另一个 Claude 会话（678 起做逆向 v5），本轮没有改 CURRENT，免得和它冲突；合并时按工程流程把这条交接挂到 CURRENT 的「最新交接」。
- 发布到正式 5178、在 Chrome 里重新加载插件：等用户说。

## 唯一下一步

用户说「合并」后合并 PR；之后发布到 5178 并在 Chrome 里重新加载插件（都等用户说）。

# Claude 481 · 内容文稿页码与画廊图号对齐（候选，待采用）

输入 / 输出：WB-20261014-479 → Claude 认领 480 → WB-20261014-481（写入者释放）。
用户同意：P 号与画廊图号一致（封面为第 1 张，内容从 P2 起）。替代 479 的 P1 起算口径，其余见 [479](2026-10-14-claude-collection-content-pages-479.md)。

改动：`src/collection/app/components/DeskView.tsx` 页码改为原图序号（只有一张图时为 P1）；`collection-reading-browser`（P2/P3）、`collection-redesign-browser`（首段 P2）断言同步。
验证：候选 `work/claude-pages480/dist`；reading / redesign / get / video 四项浏览器通过，截图 `work/claude-pages480/collection-redesign-browser/reader-*.png`（06/11 画廊与 P2… 对齐）。未跑全量。
采用：未做。正式 dist 仍为 477 版本；用户确认后替换 dist 即可（无需重启），旧版存 `work/claude-pages480/before-live-dist`。
唯一下一步：常浩确认上线 → 替换正式 dist 并回读；477 的 R3（npx）仍待 Codex。

## 采用（Claude 482→483）

常浩「确认上线」。核对：逆向等关注源文件自 477 起只变 DeskView.tsx/collection.css；正式 dist 与 477 采用版逐字一致后，替换为 `work/claude-pages480/dist`（差异 5 个文件：index.html 与 2 组 js/css），旧版存 `work/claude-pages480/before-live-dist`。未重启（PID 55062 不变）。线上回读：首页脚本 `index-ChPRoF58.js`；Loop Engineering 收藏标签「Get笔记解析 / 内容文稿*」，页码 P2–P11，画廊 01/11。

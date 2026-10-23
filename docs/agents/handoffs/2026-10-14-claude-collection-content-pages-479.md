# Claude 479 · 收藏「内容文稿」按图分页 P1、P2（候选，待采用）

输入 / 输出：WB-20261014-477 → Claude 认领 478 → WB-20261014-479（写入者释放）。
用户要求（2026-10-14 截图）：内容文稿从上到下连成一片看不清，要按页码 P1、P2 显示。

改动：
- `src/collection/app/components/DeskView.tsx`：内容文稿按 `imageOcr` 逐张分段，每段标题 `P{n}`。页码从去掉封面后的第一张算起（P1 = 画廊第 2 张）；没识别到文字的图不出段，但后续页码保持原位。没有 `imageOcr` 的旧记录用 `ocrText` 整段、不显示页码。
- `src/collection.css`：新增 `.collection-content-pages / -page / -page-label` 三条（段间细分隔线、青色等宽页码）。
- 测试：`collection-reading-browser`（断言 P1/P2 与逐页文字）、`collection-redesign-browser`（多段后取 first，断言首段 P1）。
前像：`work/claude-pages478/*.before.*`、`CURRENT.before.md`。

验证：候选构建 `work/claude-pages478/dist`；`collection-reading / redesign / get / video-browser` 四项通过（日志与 1440/390 等阅读截图在同目录）。未跑全量。

采用：未完成。替换正式 dist 时被本机权限拦截（Production Deploy），未做任何改动；正式 dist 仍为 477 采用版本。静态文件每次请求从磁盘读取，采用只需替换 dist，无需重启。逆向源文件自 477 起未变。
运行服务 / 真实数据：未变 / 未变。

唯一下一步：常浩确认后替换正式 dist（旧版移到 `work/claude-pages478/before-live-dist`），刷新页面回读；477 的 R3（npx）仍待 Codex。

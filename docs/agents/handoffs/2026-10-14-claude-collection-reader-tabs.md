# Claude：收藏阅读页只留内容文稿/视频文稿（并行小改，待登记 CURRENT）

输入状态 / 输出状态：读到 WB-20261014-474（写入者 Codex，逆向 v4 R1/R2，与收藏页无交集）。用户当轮明确安排并行修改；未改 CURRENT、未占状态编号，待 Codex 释放后登记。
执行者 / 本轮范围：Claude；收藏阅读页右侧标签。
用户要求（2026-10-14）：图文只保留图片文字，改名「内容文稿」，不要封面信息；视频只保留视频文稿，不要封面信息；有 Get笔记解析就保留。
改动文件及结果：
- `src/collection/app/components/DeskView.tsx`：标签改为「Get笔记解析（有则显示）+ 内容文稿（图文）/ 视频文稿（视频）」。去掉「正文 / 笔记正文 / 图片文字」三个标签和帖子话题标签。内容文稿 = `imageOcr` 去掉第 1 张（封面）后的文字；只有一张图或没有 `imageOcr` 时用 `ocrText` 全文。删掉因此不再使用的 `stripDuplicateTagSuffix` 引用。
- `src/collection.css`：删掉不再使用的 `.collection-reader-tags` 两条规则。
- 测试：`collection-reading-browser`（新增 3 张图、逐张 OCR 的夹具，断言去掉封面文字、不含帖子正文，视频无正文标签）、`collection-redesign-browser`、`collection-get-browser` 的标签断言同步更新。
- 遗留：`src/collection/app/lib/note-content.mjs` 现已无人引用，未删除，待确认。
前像：`work/claude-reader-tabs/*.before.*`。
验证：隔离构建 `work/claude-reader-tabs/dist`（`WORKBENCH_TEST_STATIC_ROOT` 指向它），`collection-reading/redesign/get/video-browser` 四项通过，日志在同目录。正式 `dist/` 未重建，未跑全量。
运行服务是否采用 / 真实数据是否变更：否 / 否。运行中的 5178 仍是旧界面；采用需重建正式 dist 并重启服务，另取授权。
唯一下一步：用户授权后重建正式 dist 并重启以采用；Codex 释放认领后登记 CURRENT。

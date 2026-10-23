# 焚决名称＋提示词全文 · 候选交回404

输入402 → 认领403 → 输出404；Codex。用户最新要求：填写框为名称和提示词全文，删除标签。保留全部既有未提交变更；不提交、推送、重启后端的既有权限仍有效。

实现完成：

- Scrolls新增与编辑表单各名称（60字）和提示词全文（20000字）两框，均必填；全文保留正常空格/换行，内外复制只取正文，不拼名称。
- 条目增加可选name；旧条目不批量迁移，仅显示时派生首行名称，编辑预填，取消不写入，明确保存才补名。历史tags/source/id/uses保留；Notes/reverse原addEntry参数位置兼容。
- 焚决标签填写、显示、详情筛选与类型页筛选移除；普通资产标签功能保留。外层、详情和回收区使用独立名称，仓库搜索匹配名称/正文。402火焰/编号/次数/蓝灰边界/双卡高度保留。

冻结与验证：

- work/assets403/source-manifest.json 9项，SHA efec33dc8b5c8445e034a7fe45478adc780562cf0797893736ecf0e0247f6f6e；真实402前像和本轮差异在before/、source-delta.patch。
- 候选构建 work/assets403/candidate-dist 17文件；build-manifest SHA e1cb920cd06aba6aff15ff095ddff9eae53098956e4371da56de6dcf47bca727。build-final.log通过，原分包提示保留。未覆盖生产dist。
- unit-final.log串行1207/1207通过。七浏览器入口均通过：scrolls-browser-final2、named-final、preview-final、assets-actions-browser、assets-copy-browser、assets-pin-browser、assets-warehouse-browser。均用候选静态构建和隔离合成资料。
- 独立只读实现审查新增致命0/重要0/建议0；Spec0、最终三宽表单＋六宽卡片9图视觉0问题，参见readonly-review.md、spec-visual-review.md及screens-manifest.json。不代签Claude或常浩验收。
- 首败留存：新备份断言误用mergeBackup返回shape；旧浏览器刷新回全部页与异步卡片加载断言；两处新字号漏用令牌；隔离HTTP期望需同时设置WORKBENCH_TEST_STATIC_ROOT与GUIJI_TEST_DIST。已针对修正，原业务与几何断言保留。

采用与保全：

生产5178尚未采用候选，PID97328保持；17生产dist逐字节不变，根/JS/CSS三个公开HTTP200与402一致，production-http-readback.json和production-dist-protected.json可回读。旧后端严格字段白名单不接受name，read/write静态绑定schema，无热加载；只替换前端将导致名称保存失败。未经用户确认不重启、不切换新前端、不直接写真实快照。

2191基线指纹无丢失；主库data/CURRENT.json不变，动态使用日志原样保留。两条旧测试runtime/schema是指向源schema的符号链接，链接未修改，其解引用SHA随授权源码改变；最初误判硬链接的保全断言中止于任何写入前，没有替换链接或恢复源码。test-link-protection.json记录。HEAD未变、暂存区为空，无提交、推送、安装或真实资产测试性增删。

[候选前后报告](../../../work/assets403/report.html)。当前交付是实现与隔离验证完成、生产采用待批准。唯一下一步：请常浩明确允许仅对5178进行一次受控重启并采用候选构建；获准后先核并发、保全最新真实数据及当前构建，走现有受控入口，完成静态HTTP/实际表单回读，不操作真实复制或测试性增删。未获准则保持402运行。

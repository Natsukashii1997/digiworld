# 数码世界桌面入口与图标尺寸纠正 285

输入状态 `WB-20261008-282`；Codex 认领 `283`，常浩指出 Dock 图标主体偏小后更新执行基线为 `284`；输出 `WB-20261008-285`。本轮仅处理本机桌面入口及其图标。

## 交付

- 使用常浩上传的 `1b55b9e5-8ef7-49e5-8874-e7d736232592.png`（1254×1254，SHA256 `f86860bf51f7f0f43f1063f9c1a08537366b44604576b5333f06b63004c90c12`）。原图不改；中心裁成 1120×1120，去掉黑边且保留设备最外轮廓。裁切源在 `public/assets/digivice-desktop.png`，派生 192/512 图标及 `public/assets/manifest.webmanifest`。`index.html` 引入图标与 manifest；`server/http.mjs` 仅增加 `.webmanifest` 的正确 MIME 类型，原静态资源路由范围不变。
- 在当前 macOS 用户的 `/Users/nat/Applications/数码世界.app` 创建 Safari 独立网页 App，起点 `http://127.0.0.1:5178/`，应用图标为上述放大图；程序坞已有“数码世界”入口。Safari App 是本地网页入口，继续依赖原 5178 常驻服务。浏览器切换到 Safari 是因为 Chrome 原生安装控件在本轮无法稳定操作；没有创建重复 Chrome 应用。
- 用户追加要求关闭沉浸式翻译悬浮球。在**数码世界网页 App 自己的**“设置 → 扩展”里，将“沉浸式翻译”复选框由 1 改为 0，回读 0；网页 App 工具栏也不再出现该扩展按钮。未改 Safari 浏览器或 Chrome 的全局扩展配置。

## 验证

- `npm run build` 两次通过；`node --check server/http.mjs`、`git diff --check` 通过。前端 JS/CSS 哈希仍为 `a435b61f…` / `9ae43875…`，说明这次只变了 HTML 和图标资源；未运行无关的全套业务测试。
- 5178 的 `/`、manifest、192/512 图标均 HTTP 200；manifest 为 `application/manifest+json`，图标为 `image/png`。线上 512 图标 SHA256 `a9a304eac7a604b29ebc7cbe6294399e361ba079673eb5c6132aa9cf144528f8`，与本轮资源相同。
- 一次只读批量 HTTP 核验脚本误用 zsh 特殊变量 `path`，该脚本内出现“command not found”；改用 `resource_path` 后四个资源和服务状态检查通过，未影响产品文件或进程。
- 固定 LaunchAgent `cn.personal-ai-workbench.server` 处于 running，PID `61775`。从 Dock 点击“数码世界”后出现名为“数码世界 · 个人 AI 工作台”的独立窗口，应用 `Info.plist` 的 `start_url` 指向 5178，`WKManifestIconKind=Custom`。[Dock 实拍](evidence-2026-10-08-desktop-entry-285/dock-after.png)显示设备主体与邻近图标视觉尺寸接近；[应用图标导出](evidence-2026-10-08-desktop-entry-285/app-icon.png)供复核。
- 真实主库 `data/CURRENT.json` SHA256 `6658b3434a04b1358e273a786b3ba3c710650df772c300575e318d9646d658ca`，与输入状态一致。未改知识共享、Agent 配置、飞书、依赖、提交或推送。

## 保留的异常与边界

- 第一次通过产品“常驻重新加载”采用新的 manifest MIME 时，预览通过，确认请求因旧进程退出而断线。新 PID 与 HTTP MIME 已独立核对，但对原操作 `6659ac54-fe04-48c9-b15c-337d9a02229e` 的产品 `check` 返回 500，**不能记为该操作已验证**。只读定位到其 XML 备份内容哈希保持一致，文件 `ctime` 变化使严格身份核验失败；未改写备份或回执，也未重复触发重载。该问题会阻断后续受控常驻变更，须单独修复并用隔离夹具验证。当前服务和桌面入口正常响应；下一次登录后的自动启动仍未真人重启验证。
- Safari 独立网页 App 已验证首页打开；完整页面兼容性与真实业务操作未在本轮覆盖。先前资产卡片删除位置的真人验收仍待常浩按[交接279](2026-10-08-codex-cover-delete-correction-279.md)确认。

唯一下一步：常浩确认当前 Dock 中设备图标大小是否合预期；若无进一步视觉修正，再单独处理上述常驻查询异常。

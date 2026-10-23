# Claude 上线 513 · 派单 507（509 候选）正式采用

- 输入 WB-20261015-511 → 认领 512 → 输出 513（写入者释放）。授权：常浩聊天原话“授权上线”（针对 511 提出的“正式采用 509 候选并重启 5178 一次”）。
- 从当前源码重建 `work/claude-adopt512/dist`，与 `work/reverse508/candidate-dist` **逐字节一致**。
- 预检：PID 59484、runs 3、无子进程；数据指针 `data/CURRENT.json` 3e535697…、收藏 state f91c2004…。
- 旧 dist 移至 `work/claude-adopt512/before-live-dist`，新 dist 就位；`launchctl kickstart -k gui/501/cn.personal-ai-workbench.server` 仅一次，rc 0：PID 59484→29709，runs 3→4。
- 回读：根路径与 assets 共 9 项公开资源 HTTP 与磁盘一致；两个数据指针哈希前后一致。内置浏览器打开逆向页：REA 6.4.0 本机已注册；常浩的两条炉子网站标本（RE-B38A 任务包就绪、另一条待取证）及历史运行完整显示。
- 未改业务代码、plist、配置；未调用真实模型；未提交推送。R1/S1/S2（见 511）仍待 Codex 后续处理。

唯一下一步：常浩重试炉子网页版逆推——点“开始逆推”后预检会提示 Chrome 当前是 /agents，可直接“改用这个页面”；真实 AI 线索词行为随这次运行一并观察。

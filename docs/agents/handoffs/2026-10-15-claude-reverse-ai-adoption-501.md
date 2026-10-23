# Claude 上线 501 · 逆向 v4 + R3 + AI 执行器（497 候选）正式采用

| 项 | 内容 |
|---|---|
| 输入状态 / 输出状态 | WB-20261015-499 → Claude 认领 500 → WB-20261015-501（写入者释放） |
| 授权 | 常浩 2026-10-15 聊天原话“授权上线”（针对 499 提出的“正式采用 497 候选并重启 5178 一次”） |
| 结论 | **已上线**。逆向页 REA 读数恢复（6.4.0 本机已注册），477 遗留的线上 500 已消除 |

## 过程

1. 从当前源码重建 `work/claude-adopt500/dist`，与 Codex 测过的 `work/reverse496/candidate-dist` **逐字节一致**；497 清单此前已复验 0 漂移。
2. 预检：服务 PID 4000、runs 1，无子进程（无夜巡/导入/视频/取证在跑）；数据指针 `data/CURRENT.json`、`data/collection/state.json` 记录哈希。
3. 旧 dist 移至 `work/claude-adopt500/before-live-dist`，新 dist 就位；`launchctl kickstart -k gui/501/cn.personal-ai-workbench.server` **仅一次**，rc 0：PID 4000→39698，runs 1→2。
4. 回读（`work/claude-adopt500/readback.json`）：根路径 `/` 与 JS/CSS/manifest/图标共 8 项公开资源 HTTP 与磁盘一致；`/index.html` 与 `theme/*.png` 本就不由服务对外提供（页面也无引用），非本次变化。内置浏览器打开逆向页：REA 6.4.0「本机已注册」、执行器菜单可用；原小红书参考“121”在「参考与回收」中，未丢失。两个数据指针哈希前后一致。

## 回退

如需回退：停服务前把 `dist` 换回 `work/claude-adopt500/before-live-dist`；注意服务端源码（R3、AI 执行器）在工作树中已生效，回退前端不回退服务端。

## 边界

未改业务代码、未改 plist / Agent 配置、未运行真实取证、未提交推送。

唯一下一步：常浩用炉子网页版做首次真实逆推（先开独立调试 Chrome，执行器选 Codex）；Claude Code 真实验证暂缓。

# Claude 503 · 线上网站逆推失败修复：Codex 对 REA 工具“需审批”被自动拒绝

| 项 | 内容 |
|---|---|
| 输入状态 / 输出状态 | WB-20261015-501 → Claude 认领 502 → WB-20261015-503（写入者释放） |
| 触发 | 常浩首次真实逆推炉子网页版（app.luzi.top）：终端“REA · list_browser_targets · failed”“mcp：AI未成功调用允许的REA工具，结果未采用”，194 秒，输入 109,875 tokens |
| 结论 | 根因确认、修复完成、测试通过；**需常浩授权重启 5178 一次后生效** |

## 根因

运行记录 `events.jsonl`：`MCP tool call requires approval, but approval policy is never`。调试 Chrome 正常（9222 在监听，炉子页在内）。工作台以 `-a never` 无人值守启动 Codex，而 Codex 把会访问浏览器端口的 `list_browser_targets` 归为需审批工具，于是被自动拒绝。499 的合成夹具只用到本地分析工具，未覆盖网站路线。

## 修复（Claude 精修，< 30 行）

- `server/reverse-ai-process.mjs`：Codex 参数为白名单内 5 个 REA 读工具各加 `-c mcp_servers.rea.tools.<tool>.approval_mode="approve"`；`-a never`、只读沙箱、工具白名单均不变，白名单外工具仍不可用。
- `tests/reverse-ai-process.test.mjs`：新增 1 项，断言只批准白名单工具、仍为 `-a never`、覆盖在 `exec` 之前。
- 真实对照（同沙箱策略、中文运行目录、真实 Codex）：原参数 → 失败，报错同线上；加批准 → `list_browser_targets completed`，找到 1 个炉子页面。两次合计输入约 12.4 万 tokens（缓存约 8.7 万）。脚本见 [证据目录](evidence-2026-10-15-claude-codex-approval-fix-503/)。
- 全量 `node --test --test-concurrency=4 tests/*.test.mjs`：1303/1303。仅服务端改动，前端 dist 不变。

## 附带观察（不阻断）

同次 stderr 有其他远程 MCP 返回 403 challenge、模型列表刷新超时等噪音，来自常浩 Codex 配置里的其他服务器 / 网络，不影响本次结论；若后续逆推明显变慢再评估是否在运行时屏蔽非 rea 的 MCP。

## 边界

未重启 5178；未改 plist / Agent 配置；未提交推送。

唯一下一步：常浩授权重启 5178 一次 → 常浩在工作台重试炉子网页版逆推。

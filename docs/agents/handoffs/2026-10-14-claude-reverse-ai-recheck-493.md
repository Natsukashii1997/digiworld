# Claude 复验 493 · R3 + AI 执行器（Codex 491）· 第一部分

| 项 | 内容 |
|---|---|
| 输入状态 / 输出状态 | WB-20261014-491 → Claude 认领 492 → WB-20261014-493（写入者释放） |
| 结论 | **R3 通过；487 工程部分通过；真实 AI 冒烟待常浩额度授权后进行**（第二部分）。尚不建议正式采用 |

## 已核对

1. 冻结清单：源 23 + R3 继承 5 + 候选构建 19，逐项 SHA256 0 漂移（候选按 `work/reverse490/candidate-dist` 校验）。
2. 全量 `npm test`：1295/1295。
3. **R3 + R1 真实复验**：用正式服务同一个 node（`WorkbenchServer.app/Contents/MacOS/node`），`env -i HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin` 模拟 launchd，调用 `createReaProcess` 对 473 合成夹具跑真实 REA 6.4.0：定位到 nvm 下的 npx；68KB、exit 1 的 doctor 正确读出两客户端 aligned @6.4.0、Skill v37；`analyze-javascript-application` 成功，摘要含新增 `parsedJavaScriptFiles: 3`。脚本：[smoke-r3.mjs](evidence-2026-10-14-claude-reverse-v4-acceptance-473/smoke-r3.mjs)。
4. 抽查 `server/reverse-ai-process.mjs`：Codex `exec --sandbox read-only --ephemeral`、Claude `-p --permission-mode dontAsk --tools Read` + 五个 REA 工具白名单；外层 `sandbox-exec` 拒绝全部写入，只放行本次运行目录与 `/dev/null`。
5. 截图 `work/reverse490/ui/`：菜单（真实图标 + 名称 + “仅 REA 取证 · 不用额度”）、额度与只读提示、运行终端、结论 / 未知项 / 任务包版本，与派单一致。

## 待第二部分验证的风险

- 外层 `sandbox-exec` 禁止所有范围外写入：真实 Codex / Claude Code 启动时可能需要写自己的配置、缓存或刷新登录（如 `~/.codex`、`~/.claude.json`），它们拉起的 REA MCP 经 npx 也可能写 `~/.npm`。若真实运行因此失败，需要在“只读目标与项目”和“允许 AI 写自己的状态目录”之间做取舍，由常浩决定，不由实现方自行放宽。
- Codex 图标用的是 OpenAI VS Code 扩展的结形标识；常浩参照图里是蓝紫色 Codex 应用图标，待常浩确认用哪个。

## 边界

Claude 未改业务代码；真实 REA 只对合成夹具运行；未调用真实 AI、未重启 5178、未提交推送。

唯一下一步：常浩授权额度 → Claude 用 473 合成夹具各跑一次真实 Codex / Claude Code（第二部分）→ 通过后常浩授权正式采用与重启。

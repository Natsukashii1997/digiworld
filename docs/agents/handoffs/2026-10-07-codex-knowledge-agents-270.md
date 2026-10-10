# 知识页四伙伴接入阶段回读 270

输入 `WB-20261007-269`，写入者仍为 Codex。本轮用户在“知识共享保持关闭”的条件下要求：加布兽在知识页与亚古兽同大，四个原生客户端连接本机知识 MCP。旧飞书整库接入 267 保留，未改其来源与扫描范围。

## 已执行与读回

- 知识页仅对加布兽的 `AgentSprite` 设置 `fit=60`；`src/v14.jsx` 增加可选 `fit`，未传时保持既有像素缩放。真实 5178 在桌面与 390 宽读回：亚古兽 60px、加布兽 60px；页面无水平溢出、无 `pageerror`。运行截图另存本轮交付目录。构建成功；完整 `npm test` 1168/1168，记录 `work/knowledge-agents268-npm-test.log`。首次隔离候选在 1440/390/320 下对比通过。
- 卡片原文案将“超过 7 天未调用”误称“未接入”；现已改为调用留痕表述，并在帮助中说明不能代表配置或实时健康。当前四卡“未见可归属调用”与三客户端健康核验不冲突。Codex 的一次实际 `search_knowledge` 成功返回零开放来源，使用留痕存在但未能归属客户端；没有用伪造调用点亮卡片。
- 当前前端 `dist/index.html` SHA256 `b4d4d6edfefd7f063af1148302d5679d5d812beb3be77a63f78ed166c12235b6` 已被真实 5178 读取；后端 PID 60247 保持运行，5178/5179 均监听。先前前端构建保留在 `work/knowledge-agents269-retired-dist`，更早旧构建保留在 `work/knowledge-agents268-retired-dist`。
- 用户选择知识共享关闭后，单独发现并关闭此前开启的个人说明 `profileSharing`，主库 revision 117→118，回读为 `false`；Obsidian、飞书两处 `agentSharing` 均关闭。当前主库指针 `data/CURRENT.json` SHA256 `6f65adb899451b0d635259a1d24ef88fdbfb8882685462b7671f0c78d097b1b0`，前端第二次采用前后未变。未读取知识正文或对外共享。
- Codex 原生 MCP 条目启用且 URL 与 `127.0.0.1:5179/mcp` 一致，本会话有实际工具调用；Claude Code 原生条目健康检查为 Connected；Hermes 原生测试发现 `search_knowledge` 工具。三者未重写已有配置。

## 尚未完成

OpenClaw 2026.9.3 的 CLI 在读取 MCP 状态前被旧 `agent_databases` 注册表 schema 阻断，`mcp list/status` 均失败，故第 4 客户端不能宣称已接通。其 macOS LaunchAgent 已注册但 Gateway 当前无进程，上次退出码 1。官方只读 `doctor --json` 可诊断；`doctor --fix` 会进入整机 OpenClaw 状态迁移及受管 Gateway 维护，不能限定只修 MCP。官方全量备份 `backup create --dry-run --json` 已只读演练成功，实际备份、迁移、MCP 新增均未执行。完整备份含凭据和会话，须存于受保护位置并通过 `--verify`；不能用仅配置备份代替。

已向用户提出单独授权：是否允许先核验备份与服务归属，再执行 OpenClaw 全状态迁移并接通第 4 客户端。答复前保持现状，不运行修复。批准时先做验证备份，再执行受控迁移、原生 `mcp add/probe` 与回读；不论结果都保持三处知识共享关闭。若不批准，按三端已接通、OpenClaw 阻断交接并释放写入者。

本轮没有提交、推送、安装/更新依赖、手改客户端隐藏配置、向其他机器人发消息或执行 OpenClaw 修复。真人使用验收待常浩在原标签刷新后完成。

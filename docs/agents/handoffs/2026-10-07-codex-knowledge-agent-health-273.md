# 四伙伴亮态与 OpenClaw 修复接入交接 273

输入 `WB-20261007-272` → 输出 `WB-20261007-273`；执行者 Codex。常浩本轮明确授权修复 OpenClaw 并接入工作台，沿用已确认的“知识共享保持关闭”。

## 实际结果

- 暗态根因是 `KnowledgeV16` 未给四张 Agent 卡添加 `.on`，右侧 `HubLines` 未传 `active`。近七天调用留痕只控制文字，不能判断 MCP 接入。新增独立的本机原生 MCP 健康检查：只有精确匹配当前 `127.0.0.1:5179/mcp` 且通过对应配置或探针检查才返回 `ready`；失败、超时、缺失均为 `unknown`。HTTP 响应只含检查时间和四个固定状态，不返回 CLI 原文、配置或凭据。卡片、连线、就绪数由该状态驱动，调用留痕独立显示。亮态不代表知识源开放。
- OpenClaw 先用官方 CLI 完整备份并验证，单个归档 2,408,630 字节、权限 `0600`、`verified:true`、SHA256 `755bd969067ddd9799793d21ef972c45d1f52ad5666b070725a81023dfca3919`。归档只在本机权限 `0700` 的私有目录 `/Users/nat/Documents/Codex/2026-10-07/s/work/openclaw-repair-private/`，不得复制到工作台或对外传送。旧 schema 阻断在备份后、Doctor 修复前复查时已消失，**不能归因于 Doctor**。随后官方 CLI 添加 `workbench-profile`，`mcp status` 显示 configured/enabled/ok，`probe` 发现 `search_knowledge`、`read_note` 等四工具，diagnostics 空。
- OpenClaw Gateway 曾因 LaunchAgent 指向已不存在的旧 `/usr/local` 安装而启动超时。按所属服务流程停掉旧项、离线运行 `doctor --fix` 后，以当前 Node 24.16 和 Homebrew 安装执行 `gateway install --force --port 18789`。回读 Gateway `running`、RPC `ok`、本机 18789 监听；之后再次探测 MCP 仍通过。Gateway 对 NVM 路径及两个既有插件版本发出建议级提示，未在本轮更新插件。
- 文件：新增 `server/knowledge-agent-status.mjs`、`tests/knowledge-agent-status.test.mjs`、`tests/knowledge-agent-bright-browser.mjs`；修改 `server/http.mjs`、`server/index.mjs`、`src/KnowledgeV16.jsx`、`src/knowledge-v16.css`；采用新 `dist/`。加布兽既有 60px 调整保留。

## 验证与采用

- Node 24.16 完整 `npm test`：1171/1171，通过；日志在任务工作目录 `work/knowledge-bright-npm-test.log`。新健康检查定向 3/3；新隔离浏览器脚本两种相反组合、1440/390/320 六次宽度检查均通过，页面错误 0。隔离构建成功；Vite 原有大包提示仍在。
- 真实运行 5178/5179 已采用同一新构建，PID `87644`，`dist/index.html` SHA256 `a203f704d4b9bf1425e0ac85772829575ab19a09ddad2cc08b8c6f6fd8da59bb`；被替换构建保留于任务目录 `work/knowledge-bright-retired-dist/`。受会话门禁保护的真实健康接口回读 Codex、Claude、Hermes、OpenClaw 四端皆 `ready`。真实知识页四卡与右侧四线点亮、四个头像不再灰化；1440/390/320 无横向溢出、无页面错误。用户可见的四卡截图位于任务目录 `outputs/知识页四伙伴-已接通.png`。
- 真实主库 revision 118 未变，`data/CURRENT.json` SHA256 始终 `6f65adb899451b0d635259a1d24ef88fdbfb8882685462b7671f0c78d097b1b0`。Obsidian 和飞书 `agentSharing:false`、个人说明 `profileSharing:false`；飞书整库来源登记保留。本轮未读取知识正文、未发送或开放给四个客户端。
- 首次失败保留：先前 `doctor --fix` 因 Gateway 关闭未确认而拒绝，受控停止后离线重试通过；`gateway start` 曾因旧启动路径超时，强制重装启动项后通过；部署暂存脚本首次因 Node 模块语法歧义在执行前退出，修正后 16 文件逐项哈希一致再切换。一次集成只读检查读到后端测试与实现并发修改中的 8/10 秒暂态，最终统一为 8 秒并复测 3/3。全库 `git diff --check` 指出本轮之外已有空行/空格问题，受改动的已跟踪文件定向检查通过，未改动无关文件。

## 边界与下一步

没有提交、推送、安装新依赖或手改任何客户端隐藏配置。通过 Playwright 已独立验证真实运行页面；尝试刷新常浩当前内置浏览器标签时，浏览器安全策略拒绝本机 URL 访问，因此不能代替用户完成原标签刷新。工程验证、运行采用均完成；Claude 复验与常浩本人使用验收未代签。

唯一下一步：常浩刷新原 `http://127.0.0.1:5178/#knowledge` 标签，核对四卡与四线亮态、加布兽大小，并以自己的使用结果验收；如显示不同，按本交接所列 PID、构建 SHA、健康状态定位。

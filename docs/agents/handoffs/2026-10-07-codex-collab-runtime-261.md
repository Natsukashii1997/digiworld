# Codex 交接 261｜协同页真实运行残留已消除

输入状态：`WB-20261007-260`；输出状态：`WB-20261007-261`。常浩在 [259 交接](2026-10-07-codex-ui-user-visual-259.md) 后提供真实页面截图：协同标签和大标题仍显示 `CURRENT.md` 当前任务的 Markdown 链接与交接状态。这推翻了 259 对真实运行页面的修复结论；259 的静态构建采用与隔离回归结论保留各自范围。

## 根因与实际修复

- 旧 Node PID 80372 于 2026-10-07 08:18:35 启动，早于 `src/collab-protocol.js` 11:33:15 的标题解析修复。`server/http.mjs` → `server/collab-board.mjs` → `server/collab-protocol.mjs` 静态导入该模块，运行中不会随磁盘源码改变。接口会重新读取最新 `CURRENT.md`，所以旧进程用旧函数解析出新交接 259 的完整 Markdown 路径。
- 重启前对真实 `/api/collab/protocol` 只输出安全结构化结果：当前运行标题长 98 字、含 Markdown 文件路径、没有次级摘要。以 `SIGTERM` 正常停止精确 PID 80372，等旧进程与端口退出，再用原 Node v24.16.0、同项目目录、默认 `data/`、5178/5179 启动新 PID 87163（12:38:33）；没有强杀、安装或更改服务设置。
- 重启后同一接口返回：标题精确为“当前协作”，不含 Markdown 路径；次级当前任务存在且不含 Markdown 路径。新进程同目录同时监听 127.0.0.1:5178/5179。5178 的 HTML、JS、CSS 仍与最终 `dist/` 逐字节一致。
- 在新的真实 `http://127.0.0.1:5178/#collab` 浏览器页读回：标签与大标题均为“当前协作”，原任务在次级区域，可见树无 `docs/agents/handoffs/` 路径。已将这个已验证页面显示在 Codex 浏览器面板。用户原有 Chrome 标签无法由本轮 UI 控制器可靠操作，原标签需刷新才能丢弃停启前的页面状态；不声称它已被代为刷新。

## 证据与边界

- [重启前 API/进程摘要](evidence-2026-10-07-codex-collab-runtime-260/runtime-before.json)、[重启后 API/进程摘要](evidence-2026-10-07-codex-collab-runtime-260/runtime-after.json)、[实际页面检查](evidence-2026-10-07-codex-collab-runtime-260/runtime-ui-check.json)、[修复后页面截图](evidence-2026-10-07-codex-collab-runtime-260/runtime-collab-after.png)。记录仅含标题结构布尔值和长度，不保存 API token 或真实主库内容。
- `src/server/tests/dist` 共 772 文件与 259 最终隔离回归 `output-sha.json` 逐一核对，**0 漂移**；本轮无源码、测试、构建修改，不重复冒充新一轮全量回归。259 的 1045/1045、96/96、138 图验证对应同一文件快照。
- `data/CURRENT.json` 仅核 SHA256，停启前后、浏览器读回后均为 `01c78dd6745fb96a3c49278f9f87545c91a360bcd66570ea99a840b879507064`；这只证明该指针不变，不推断整个 `data/` 目录或真实业务效果。
- 本轮没有提交、推送、stash、reset、安装依赖、读取 Vault/凭据/Agent 私人会话，未执行外部发送或真实业务写入。既有服务调度按原设置随进程恢复，未手动补跑。

## 复盘与下一步

259 的缺口是将“5178 静态资源字节一致”误当成“常驻 Node API 已采用修改”。此类前后端共用模块的修改，交接前必须分别核静态构建、服务端进程启动时点/代码版本，以及真实 API/页面。此次用用户截图定位到这层差异并完成运行修正。

唯一下一步：Claude 读取 `CURRENT.md` 的 261 状态与本交接，对照常浩截图、新真实页面及 259 六图证据独立复审；常浩刷新原 Chrome 标签并做最终观感验收。Codex 没有向 Claude 发送消息或代签读回。

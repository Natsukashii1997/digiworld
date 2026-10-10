# 四伙伴亮态与 OpenClaw 修复认领272

输入 `WB-20261007-271`，2026-10-07 21:23 CST 当前写入者为“无”。常浩本轮明确要求解释并修复接通后仍暗的四卡，同时授权 OpenClaw 的验证备份、旧状态迁移与接入。此前“需要单独授权”门禁已由本轮用户请求解除；知识共享关闭的选择仍有效。

读回根因初证：右侧连线未传 `active`、Agent 卡未加 `.on`，导致 CSS 始终灰化；调用留痕 API 只影响文字，不控制亮暗。修正时用本机原生 MCP 配置/握手或工具发现的可信结果驱动亮态，调用记录仍单列；不以伪造工具调用点亮。OpenClaw 先官方全量验证备份，再受控 `doctor --fix`，之后原生 MCP 配置和 `probe`，回读 Gateway 与知识共享。

拟改项目范围：`src/KnowledgeV16.jsx`、`src/knowledge-v16.css`、必要的 `server/knowledge-agent-status.mjs`、`server/http.mjs`、`server/index.mjs`、定点合成测试、`dist/`、本交接及 `CURRENT.md`；OpenClaw 只通过官方 CLI 改其原生状态，不直接编辑隐藏配置、数据库或凭据。若发现现成可信检测接口，优先复用并缩小范围。无需安装或更新依赖；不修改知识源共享或 Vault/飞书正文。

开工基线：HEAD `15dd5ba70877180fcf251150cb460e5dfda4ba4c`；`src/KnowledgeV16.jsx` SHA256 `171ea70d4940605bc32aac5e534127dc03f284c75b068d4daf06b83ee9c21aff`、`src/knowledge-v16.css` `99d0c31df7e9671431e0d4c146e29177fc0d4089d955cd1600e156d4e412e926`、`server/http.mjs` `e8990908fbed9fe7c9f190e5daeda7649642f779c7379fe087a871cb28c0ed38`、`server/index.mjs` `1236c38c2961a68ee732aa81a162ba7416b9a0824c139dc52348e62822564d97`、主库指针 `6f65adb899451b0d635259a1d24ef88fdbfb8882685462b7671f0c78d097b1b0`、dist index `b4d4d6edfefd7f063af1148302d5679d5d812beb3be77a63f78ed166c12235b6`。工作树既有大量脏文件全保留，不清扫、提交或推送。

验证计划：先读回原生 CLI 的准确健康信号及 Gateway 所属，备份归档验证成功后才迁移；逐项核对四端 URL、握手/工具发现，明确失败/未知。合成测试覆盖亮暗态、超时/缺失与不泄露，隔离构建和 1440/390/320 页面验证后受控采用到真实 5178，读回数据指针、分享权限和运行端口。未知不当成功，用户刷新原标签后真人验收单列。

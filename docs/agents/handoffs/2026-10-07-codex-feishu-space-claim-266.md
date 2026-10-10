# 飞书整库接入认领266

补充共享面：整库 76 节点元数据遍历约 5.1 秒，旧 5 秒统一扫描预算会提前截断；本轮增加 `server/knowledge-access.mjs`，仅为显式整库来源增加有界扫描预算，保留旧单节点预算与部分结果语义。

输入状态 `WB-20261007-265`，2026-10-07 20:24 CST。写入者原为“无”；常浩本轮明确指定接入「常浩的知识库」整库。Codex 认领单写工作区，输出 `WB-20261007-266`。

本轮目标：在保留旧单节点飞书来源契约的前提下，增加显式 Wiki 空间级只读来源，使工作台可覆盖同一空间的全部顶层节点及子树。真实范围固定为本人已确认的「常浩的知识库」；目前实见 8 个顶层、76 个节点，72 个 Docx、3 个普通文件、1 个多维表格。只读取 Docx 文本；其他类型和未知范围显示部分覆盖。Agent 共享默认关闭，不写飞书、Vault 或真实 Agent 配置。

拟修改 `server/knowledge-feishu.mjs`、`server/knowledge-feishu-connections.mjs`、`server/knowledge-access-policy.mjs`、`server/schema.mjs`、`server/http.mjs`、`src/KnowledgeV16.jsx`、飞书相关合成测试、`KNOWLEDGE-FEISHU.md`，以及必要构建与本交接。开工 SHA256：`CURRENT.md` 840a43e68c50ecb70211b62604f2f11c8190ba995174dd562b07ac70f7fd135a；`server/knowledge-feishu.mjs` c6e77bc09715be3a146ffca326d684747c725485adf8fefcc06cfedd78d4d7f3；`server/knowledge-feishu-connections.mjs` 17bf6610222dd983f4838812652b1922b3cdc2f0ea657d72bac453df59c6428a；`server/schema.mjs` 1305e2c7abaf770b79ddaee6e856b75b6f7e56ea9d96e6070e949c492bc2b9b1；`src/KnowledgeV16.jsx` a65d3dd5894e76a00fcda68018fa9d29b17e83b41353533d9351e67f3eecf96e。既有未提交变更原样保护；start_head `15dd5ba70877180fcf251150cb460e5dfda4ba4c`，不提交推送或安装依赖。

先用合成隔离数据验证单节点兼容、空间身份/分页/祖先/撤权和未知状态，再按实际运行配置检查可恢复采用。真实主库只登记空间指针与必要核验状态，写后按 revision 和实际读取路径回读；不保存知识正文、访问令牌或原始账号 ID。5178/5179 的运行采用、真实源登记与真人验收分别报告。运行前 `data/CURRENT.json` 只核 SHA，不展示内容。

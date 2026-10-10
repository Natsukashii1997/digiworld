# 飞书整库接入交接267

输入 `WB-20261007-266`，输出 `WB-20261007-267`。2026-10-07 20:46 CST。常浩明确指定「常浩的知识库」整个飞书 Wiki 空间；本轮由 Codex 单写认领，现已完成工程、运行采用和真实只读接入，写入者释放。真人使用验收仍由常浩完成。

## 交付与范围

- 工作台新增显式的飞书知识空间来源：可在「知识」页选空间、登记、核验，并覆盖该空间所有顶层节点及其子树。原先单节点 `feishu://wiki/` 接入继续兼容；空间根为 `feishu://space/`，仅接受数字空间标识。
- 固定机械邪龙兽 `codex` profile、指定 App 的本人 user 身份；登记只保存空间位置，核验后仅保存身份摘要与状态，正文和凭据不入主库。空间身份、节点父链、分页、快捷方式、跨空间移动和在途权限变化均有拒绝或部分覆盖语义。Agent 共享默认关闭。
- 主要实现：`server/knowledge-feishu.mjs`、`server/knowledge-feishu-connections.mjs`、`server/knowledge-access-policy.mjs`、`server/knowledge-access.mjs`、`server/schema.mjs`、`server/http.mjs`、`src/KnowledgeV16.jsx`；契约更新见 `KNOWLEDGE-FEISHU.md`。新增合成边界及浏览器测试，旧单节点浏览器测试仅加入候选构建参数。

## 验证与真实状态

- 最终 `npm test` 1168/1168；飞书定点测试 19/19。隔离空间浏览器覆盖选择、登记、核验、跨库检索及 1440/390/320 宽，旧节点浏览器兼容测试通过。早期两次浏览器脚本失败分别是按钮定位过严、等待隐藏选项；修正测试定位后通过，未据此宣称产品故障。合成截图留在 `work/feishu-space266-browser/`。
- 原 PID 4755 正常 SIGTERM 退出；新 PID 42493 使用原 Node 24.16.0、项目 cwd、`data`、127.0.0.1:5178/5179。16 个静态构建文件采用完毕，`dist/index.html` SHA256 `b7976a9fb36c16070ee863010ab8bcbd1197d7315ca82595132dee4f1cdc1e1f`。被替换的旧构建保留在 `work/feishu-space266-retired-dist/`，没有提交、推送或安装依赖。
- 主库 revision 115→116（仅登记指针）→117（本人空间核验）。现有 1 个 Obsidian 来源保留，新增 1 个飞书空间来源；飞书来源已核验、Agent 共享关闭。`data/CURRENT.json` SHA256 从 `01c78dd6745fb96a3c49278f9f87545c91a360bcd66570ea99a840b879507064` 变为 `5b27a2f962328e93cad003550a28cc779c0ef22204ffcc950cfbf271c01af0db`，该变化对应上述两次主库写入；未据此推断整个 `data` 目录其他文件均不变。
- 真实工作台扫描遍历 76 个节点，68 篇原生 Docx 进入可读清单，跳过 5 个快捷方式和 3 个普通文件，状态 `partial`，预算/分页截断 0。抽样正文读取 HTTP 200、非空；跨库搜索第二页命中飞书。实际 5178 页面可见「常浩的知识库」已核验卡片，Agent 复选框未勾选，1440/390 宽无横向溢出，页面错误 0。
- 聚合而不含正文的运行证据：`work/feishu-space266-cutover.json`、`work/feishu-space266-live-readback.json`、`work/feishu-space266-live-search.json`、`work/feishu-space266-npm-test-final.log`。

## 限制与唯一下一步

「整库」是已核验的空间边界，不代表每种格式的正文均已覆盖。当前仅检索原生 Docx 文本；快捷方式不会跟随，普通文件未解析，因此搜索结果显示部分覆盖。单次跨库查询有预算和续页，实际检索需按页面「继续查询」读取后续结果。本轮未开放给 Agent、未写飞书或 Vault、未配置真实 Agent。

唯一下一步：常浩打开或刷新本机工作台「知识」页，用自己知道的库内词检索并在需要时点「继续查询」，完成真人使用验收；若需纳入文件或快捷方式目标，再单独界定格式及权限边界。原交接265的日常使用验收仍由常浩负责。

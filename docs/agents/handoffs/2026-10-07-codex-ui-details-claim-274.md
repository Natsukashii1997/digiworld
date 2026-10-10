# 三页细节返修认领274

输入 `WB-20261007-273`，2026-10-07 23:10 CST，`CURRENT.md` 当前写入者为“无”。本轮用户直接提出世界总览、资产仓库、智能体群的细节返修；该最新请求替代旧的唯一下一步。用户已确认：删除仍被引用的资产时阻止操作并列出引用。资产删除后历史记录的保留方式仍待其回复，独立页面改动先推进。

本轮拟修改 `src/HomeV16.jsx`、`src/home-v16.css`、`src/Assets.jsx`、`src/AgentsV16.jsx`、`src/agents-v16.css`、必要的 `src/components.jsx`、`src/styles.css`、资产存储/接口、`RELAY-SESSIONS.md`、定点测试、构建产物与交接状态。既有工作树大量未提交文件全部保留，不重置、暂存、提交、推送或安装依赖；不读真实 Vault、凭据或私人会话正文。当前真实 `data/CURRENT.json` SHA256 `6658b3434a04b1358e273a786b3ba3c710650df772c300575e318d9646d658ca`，不通过本轮 UI 改动覆盖。

已核对核心前像：`src/HomeV16.jsx` `bf781d8b70952799ade3cfc60791cd48ec01f8f2cbabd522a4beb1e16ba0bf55`，`src/Assets.jsx` `4294bbf9…`，`src/AgentsV16.jsx` `645892f8…`，`src/styles.css` `869641ad…`，`src/components.jsx` `d6de9a76…`，`server/schema.mjs` `d2591665…`。现有视觉权威为数码世界页面与 `docs/design/ui-v14/STYLE-GUIDE.md`，本轮不生成新方向或图像。

验证计划：合成资料覆盖日期/头像/项目简报、资产删除和引用阻断、接力手动加载与会话元数据；执行相关单元与浏览器回归、桌面和窄屏视觉/交互检查、构建字节核对。若对 5178 真实运行服务采用构建，先核对进程目录和主库指针，受控更新后回读。工程、运行、真人验收分列。

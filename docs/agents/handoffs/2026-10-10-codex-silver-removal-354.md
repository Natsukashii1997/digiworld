# Codex｜派单 351 批 0 银饰删除交接 · WB-20261010-354

输入 / 输出：351 派单 → 352 原认领停滞 → 常浩指示本会话接手、353 认领 → 354 交回。只执行批 0；Claude 验收前不进入批 1–3。此交接是工程完成记录，不代签 Claude 或常浩验收。

## 完成范围

- 删除工作台内“银饰计划”页面、侧栏入口、首页摘要、相关前端组件/素材/样式，以及服务端 `/api/silver/*`。旧链接 `#silver` 落到世界总览。站内搜索和导航不再提供该页。
- 将原 `silver-agents.css` 改为 `agent-roles.css`，角色卡 schema 独立为 `server/agent-roles-schema.mjs`，图片类型识别独立为 `server/image-type.mjs`；智能体群角色卡、逆向媒体能力保留。原 `silver-agents-*` 测试拆为独立的 `agent-roles-*`，原银饰页测试删除。
- 旧快照先按原字节校验，再在运行态忽略 `silver`；旧客户端写入和旧备份合并也剔除该字段。新完整备份继续跳过退役的银饰图片目录，避免历史目录被重新打包；历史快照字节未改。
- 真实主库通过 5178 正常 `/api/workspace` 写入路径从 revision **135 → 136**，仅删除 `state.silver`；其他当前状态字段写前写后等价。随后删除 `data/silver/`，已回读目录不存在。

主要改动文件：`src/App.jsx`、`src/Home.jsx`、`src/pages.js`、`src/components.jsx`、`src/SettingsV16.jsx`、`src/StoragePanel.jsx`、`src/AgentContents.jsx`、`src/AgentRoles.jsx`、`src/agent-roles.css`、`server/http.mjs`、`server/schema.mjs`、`server/repository.mjs`、`server/merge.mjs`、`server/full-backup.mjs`、`server/reverse-media.mjs`、两个新共享模块及相应测试。删除的银饰专属文件见 Git 工作区状态；未动独立“银饰计划”工程和收藏页“银饰”分组。与本批无关的收藏源码、文档和测试原有脏改动保留现状。

## 数据前像、后像及保留副本

| 对象 | 删除前 | 删除后 |
|---|---|---|
| 主库 | revision 135；CURRENT 指向快照 SHA256 `7cc5fb20e48ecc56d8d675b0abd871b668f1b43e3bba3107cbaba7d8b1d00985` | revision 136；CURRENT 指向 `136-059c2e5b-92b1-408d-8571-8c69b625d381.json`，SHA256 `30600e26dd7a28fb0a6d4f29ac4ce774bb91bdef73c93dd72f14bd664e2d1069`；`state.silver` 不存在 |
| `state.silver` | wall 3、items 1、wishes 0（字段缺席）、categories 1 | 字段缺席 |
| `data/silver/` | 5 个文件，共 4,359,262 字节 | 目录不存在 |
| 历史快照 | 135 份，其中 47 份含 `silver` | 136 份，其中 47 份含 `silver`；历史文件保留 |

历史快照中的 47 份副本未清理。对项目目录及 Downloads / Codex 常见路径按备份、导出相关文件名做了有限范围查找，未找到可明确归属本工作台银饰数据的其他 ZIP/JSON 副本；这不代表全机不存在。完整备份和导出文件若在其他位置，需另行清点和决定，本批没有删除授权。

## 验证与运行采用

- `npm test` 串行 **1175/1175 通过**；`npm run build` 通过；`git diff --check` 通过。首次全量测试因旧导航注册预期仍要求银饰成熟度而失败，修正为退役预期后通过。
- 受影响的 `agent-roles-browser`、`nav-zones-browser`、`full-backup-browser`、`ui-final-254-browser` 均通过；`silver-retirement` 检查旧链接、接口 404、旧字段不进入新导出。`visual` 的问题列表为空；`accessibility` 各页与弹窗无违规。无关的旧版 `ui-v14-browser` 脚本仍在知识区 `ZONE MONITOR` 选择器等待超时，尚未到原银饰断言段；本批未改知识区，未把这条脚本算作通过。`accessibility` 初次运行另因旧“新建资产”按钮名断言失败，按当前按钮名“新建”修正后通过。
- 合成夹具 1440/390 前后截图： [桌面银饰删除前](evidence-2026-10-10-codex-silver-removal-354/before/silver-1440.png) / [删除后落首页](evidence-2026-10-10-codex-silver-removal-354/after/silver-1440.png)，[手机删除前](evidence-2026-10-10-codex-silver-removal-354/before/silver-390.png) / [删除后](evidence-2026-10-10-codex-silver-removal-354/after/silver-390.png)；同目录还有首页、智能体群、资产仓库两宽对照。截图过程页面错误与横向溢出均为 0。
- 原 5178 应用已采用当前 dist；HTML 和引用 JS/CSS/资源与 dist 逐字节一致。由于本批也删除服务端接口，按原 LaunchAgent 对服务进程做了一次受控重启（现 PID 65924），不是仅更新静态资源。有效工作台会话下，5178 `/api/workspace` 返回 revision 136、无 `silver`，`/api/silver/status` 返回 404；页面访问 `#silver` 显示“世界总览”，侧栏银饰项为 0，页面错误及横向溢出为 0。未经会话令牌直接 curl API 会按既有保护返回 403，不能用作接口存在性的判断。

未提交、未推送、未安装依赖；没有修改历史快照、独立银饰工程、收藏数据、Vault、Agent 配置。此前本工作区的其他未提交改动未清理。

## 唯一下一步

Claude 读取本交接、[派单 351](2026-10-10-claude-ui-refine-dispatch-351.md)和成对截图，验收批 0。若指出批 0 缺陷，先返修并复验；通过后再认领批 1。迭代 01 + 04 的夜巡主板与动效派单仍排在 351 完成后，不能现在实施。

# 云端 F3 · 知识仓库三区视图（3.2）+ 个人说明 v1（3.3）· 提前开发

- 分支：`cloud/2026-09-30-knowledge-profile`（短名 knowledge-profile）；基点 `main @ bc8e343`
- 执行者：Claude Code 云端会话（Linux、root、Node 24.21.0）；云端副本，非权威
- 合入时机由本机决定。本文件不写交接编号，也不改 CURRENT / COLLABORATION / AGENTS / CLAUDE
- 真实数据：全程只用临时合成 Vault，没有读取任何真实用户目录、凭据或主库；没有接收费模型或外部服务

## 结论

| 项 | 结果 |
|---|---|
| 新测试 | 实现前全部失败（单元 2 个文件都在加载时失败，缺模块；浏览器第一步等待“三区视图”区域超时）；实现后单元/服务 18/18 通过，浏览器 7 段 PASS |
| npm test | tests 453 / pass 428 / fail 19 / cancelled 1 / skipped 5，照旧跑满外层 1200 秒（EXIT 124）。19 个失败与已知集（`cloud-scrolls-in-assets-logs/12-npm-test.txt`）逐条 diff 完全相同：**增 0、减 0**。tests 435→453、pass 410→428，差额正好是新增的 18 个用例 |
| 浏览器脚本（35 个，最终一轮） | 31/35 通过。失败的 agent-config、rule-templates、rule-templates-fix（平台写入保护）和 search（`palette-cold 630ms > 500ms`）都在已知集里：**增 0、减 0**。interaction 本轮通过（已知的时序类，偶发） |
| visual.mjs knowledge-profile | `problems: []` |
| 需本机验证 | 三个 Agent 实际接入 MCP；采纳后写入 Vault（**未实现**，见“未完成”）；macOS 下真实 Vault 的统计与读取 |

## 改动与理由

### 3.2 三区视图 +“我的知识”指标

- `src/knowledge-zones.js`（新增，前后端共用）：
  - 规则格式固定为“文件夹/**”，按顺序匹配，第一条命中生效，其余文件归入“我的知识”
  - 默认规则：`GET NOTES/**` 归输入区，`个人上下文/**` 归个人说明
  - 按整段文件夹匹配，所以“个人上下文副本/”不算个人说明
  - 校验拒绝越界、`..`、绝对路径、通配符、重复、未知字段，最多 20 条
  - `zoneStats` 统计各区篇数和“本周新增或更新”数：本周从本机时区周一 00:00 算起，依据是文件修改时间
- **口径说明**：只凭修改时间，分不出“新增”和“更新”，所以指标是两者之和，界面上也写明了“新增与更新合计”。要分开统计需要文件创建时间，而现有扫描结果里没有，这部分留待决定。
- 主库新增可选字段 `knowledgeZones`：`{schema, rules, sourceId, profileSharing, updatedAt}`。
  - 相关代码：`server/knowledge-profile-schema.mjs`、`schema.mjs`、`repository.updateProfile`
  - 通用保存（PUT /api/workspace）不能改这个字段，只能走专用接口
  - 从备份新建主库时，`profileSharing` 一律置为 false：它和连接一样是本机授权，不随备份恢复
- `POST /api/knowledge/zones/stats`：对选定知识源只扫描元数据，然后按规则统计，不读正文、不写主库、不动 Vault。最近一次结果留在服务内存里，供页头和世界总览使用，重启后需要重新统计。
- 页面：
  - 知识仓库页头显示指标卡“我的知识 · 本周 +N / 共 N 篇”
  - 新增“三区视图”区：统计按钮、三区卡、各区文件清单（前 50 篇）、可编辑的“划分规则”表单（添加、删除、恢复默认、保存；多个知识源时可以选择视图适用哪一个）
  - 世界总览的能力地图里，知识仓库一行加上“我的知识本周 +N”

### 3.3 个人说明 v1

- **权威来源**：三区视图所用 Vault 中归入“个人说明”区的文件夹。
  - Vault 优先取规则指定的来源，没有指定时取第一个 Obsidian 来源
  - 为此给 `knowledge-files.scan` 加了可选参数 `folder`，只扫一个子文件夹；路径规则沿用现有的排除与校验
- **读取要单独授权**：页面上要先勾选“我确认允许本机 Agent 通过 MCP 读取‘个人上下文’正文”，再点“开启 MCP 读取”。没开启时两个工具都返回“尚未允许”。这对应产品定义 §4.4“读取 6 篇正文需要单独授权”。
- `server/profile-mcp.mjs`（新增）：MCP Streamable HTTP 的最小实现。
  - 选型理由：主库用了 SQLite 独占锁，另起进程无法同时写主库；stdio 方式也要求另起进程。所以把 MCP 放在工作台同一进程里，但用**单独端口**，和工作台服务隔离
  - 监听范围：只监听 127.0.0.1，只接受 `POST /mcp`，回复 application/json
  - Host 必须是 127.0.0.1 或 localhost 加本端口；带 Origin 的浏览器请求一律拒绝；请求体上限 256 KiB
  - 支持的方法：initialize、ping、tools/list、tools/call，其余返回 -32601
  - `read_profile`：可选参数 path。单篇最多 16000 字、总量最多 64000 字、最多 20 篇，超出部分标注 truncated 或列入 omitted
  - `propose_profile_change`：参数为 path、original、proposed、reason、proposer，全部必填，不接受其他字段
    - 目标文件必须在个人说明区内，原段落必须和当前正文逐字一致且只出现一次
    - 建议只写入主库 `profileProposals`（待处理 50 条、总数 200 条为上限，超出时先清最早的已处理建议），不写 Vault
- **启动方式**：`server/index.mjs` 启动工作台时，同时在 `127.0.0.1:5179` 启动 MCP。
  - 用 `WORKBENCH_MCP_PORT` 改端口，设为 `off` 可关闭
  - 端口被占时工作台照常运行，页面显示“端口已被占用，MCP 服务未启动”
  - **没有新增 npm script**：本任务禁止改 package.json。如果需要单独的 script，由本机决定是否加
- **待处理**：
  - 每条待处理建议出现在顶栏计数和待处理线索里
  - 待处理页新增“个人说明修改建议”区（`src/ProfileProposals.jsx`）：每张卡显示目标文件、提出者、理由、原段落和建议段落
  - 采纳：点“预览差异”（服务端重新读当前正文，确认原段落唯一；提出建议后文件改过会明示），勾选“我已核对差异”后点“确认采纳”。确认前服务端会再次核对文件指纹和连接身份，预览 5 分钟有效，只能确认一次
  - 拒绝：需要二次确认，是单向决定
  - 历史约束：待处理建议不能删除，内容不能改写，已处理的不能退回待处理
- **接入配置示例**：页面只显示文字，使用实际 MCP 地址，不修改任何 Agent 配置。
  - Codex：`~/.codex/config.toml` 里 `[mcp_servers.workbench-profile] url = "…"`
  - Claude Code：`claude mcp add --transport http workbench-profile …`
  - Hermes：`~/.hermes/config.yaml` 里 `mcp_servers: workbench-profile: url: …`
  - 各 Agent 当前版本的写法和对 HTTP MCP 的支持，**需本机验证**

### 顺带修复（范围内必要）

- `src/AssetHistory.jsx` 的 `TextDifference`：差异行符号 span 带 aria-label 但没有角色，axe 报 `aria-prohibited-attr`。这个问题一直存在，这次在待处理预览弹窗里暴露出来。
  - 第一版改为 aria-hidden 符号加读屏文字，每行多了 2 个节点，超出 `history-capacity.mjs` 的节点预算，造成新增失败（见 `04-browser-all.txt`）
  - 改为给原 span 加 `role="img"`，节点数不变，history-capacity 和 history-browser 都恢复通过（`05-after-history-fix.txt`）
  - 没有修改任何测试

## 改动文件前后 SHA256

| 文件 | 基点 bc8e343 | 本分支 |
|---|---|---|
| server/http.mjs | 04f8df4aa4d36f382ec76d7359dae69c505220715a3a13f65fd6535f29c6ab52 | 915ef3c0fa5ce556766eb97de81e742aed378fef9da77a5ee7064b8c2e86fc36 |
| server/index.mjs | cca3893289299dbe6ceac4d7de7c721503fbb443ff998e82c6d7d39f94ec6d6a | 431aaff8ab7add1862416f67bd0f9c8c5e6ac8e7123dae800e42b1af3cb9fef1 |
| server/knowledge-files.mjs | 50d90278e5bcefd361a8e8bf17319de9507b38fb4f9e3abe110ac06863700c8f | 423e0b561cd50ff93d1778d385b84e0422af3fc175caa3009b4cfd29c6f85472 |
| server/merge.mjs | eac7e38c2921ec2083e2f15e5a88924228fee4ced01bdc85fa7851b1aaa3210e | f5cf0549f8be2880c7f0602d1213cb9c8e6add75764e03b0438cdaf0c9c8d3d0 |
| server/repository.mjs | dc8051acce21f91c76b791784039fed89bbb0f0798a71529260619109c324039 | 06b397a8b5e42d918c4c1099da68d18b8ca6d9cf41dac7ae143dc2911717b478 |
| server/schema.mjs | 5a426e68d5cc28a6c7bc45a145cb622de9949816f5912f1101394bbe108d08c7 | 00d103d3b34a001e10e333e7c62b5d8c27dcf6d0a26a259b926fc8cee6418ae5 |
| src/App.jsx | 965e86ca0fea9a15c30677a7d88f88971a3fbbf207143c8c28c8c55b78111921 | 4c780486100c5391c95a461264bb711e0bb0c11f8aef917775f6f232c06aebec |
| src/AssetHistory.jsx | d4985d7ca8abf561a43582885323e361322d853d63e30cf1fcd9caa8065d15e3 | c6a15535ea9fac7528dd5c065f3e0e9c7dc95639a118c7a513f47dac8907a155 |
| src/Home.jsx | a2b4ed81b51ba02c0bbc7ef7673ca186fbb926fe86b8d737e7e17d94a686728a | 6ac710a7411b85b53aca9e582171b55c99a3d6e374799c7a224367db3213c8df |
| src/Knowledge.jsx | 1b0aa59effc5fbd8eb31034217e814e01ccfb86e2fe3fa81975935e6da5675e8 | 37f4d9126baf68568bc67f406e1891e7d4bbd9880b47f2797fac495807699a32 |
| src/PlannedPage.jsx | 0f092c0dd3365dfbd7401692d82125945d279010dae341a2ef923de800084841 | d8695597f9667e36668a91ee98acde956357a91826e9b0c4d4a45602f0138d60 |
| src/pending.js | 50ac358850626c78a9ff96252618a6b90f7031e54c0920d80d5aca92449f0888 | 6145ccea8bb468a22b27435be5702227d7fa9ba222eb1bbb91c19f752574c571 |
| server/knowledge-profile-schema.mjs | （新增） | 54816f5bc5bcc6aba7e8ce331e8bc31b29befb4c58aa740e94c142b49a080664 |
| server/knowledge-profile.mjs | （新增） | ca06b6daaee1c851c14243912377ec72dbedd74dc10eee9f3f9dbbe6fc5329b3 |
| server/profile-mcp.mjs | （新增） | 37337ab1c4737c58c86bccdfdb204efd28000a5b2ccebf0a5e6bbdf6eaeb2001 |
| src/KnowledgeZones.jsx | （新增） | 6db35a7d09e9a61d047fbafd677d09bdb90a576cedcff17a64ec4aa4d2bb4ad2 |
| src/ProfileProposals.jsx | （新增） | 4d856d525c4e6252c51388ece9b87872e264a527817a05d01fe47f22f9d480f7 |
| src/knowledge-zones.css | （新增） | e5fd60b06e8667948b4454071e58cf655ef2cb40d33094573b896662419e7151 |
| src/knowledge-zones.js | （新增） | f72f7b6490e77c451efcc028ef802936a8e366e9ceaa0d0ddd7940b97eb07332 |
| tests/knowledge-profile.test.mjs | （新增） | 310fdaa46f850cdc4a24a451edeabee4bc493aa57a55fddbef127f5891e2376c |
| tests/knowledge-zones-browser.mjs | （新增） | 6be386a6330b3fb9f2f305ccc7660fcb13dfafe04108fad20a9c4daec15fdc28 |
| tests/knowledge-zones.test.mjs | （新增） | b7695a4d54ae93650bd322c500388047f9988f3fd668d14ed1e5aa5c65ce3614 |

未改动：package.json、package-lock.json、server/config-file.mjs、docs/design/，以及任何已有测试。

## 失败测试首跑摘要

- `01-red-unit.txt`：`node --test tests/knowledge-zones.test.mjs tests/knowledge-profile.test.mjs` 退出 1。两个文件都因为 `ERR_MODULE_NOT_FOUND: src/knowledge-zones.js` 失败，属于加载即失败，还没有到断言级别。
- `02-red-browser.txt`：`node tests/knowledge-zones-browser.mjs` 退出 1。`locator.waitFor: Timeout 10000ms`，等待 `getByRole('region', { name: '三区视图' })` 超时。

新测试覆盖面：
- 单元测试：默认规则与整段匹配、按序命中、规则校验（20 种非法输入）、周一起算、统计、建议 schema（14 种非法记录）、历史约束、备份不恢复授权
- 服务测试：统计只读、规则保存与版本冲突、读取授权与大小上限、越界路径（10 种，两个工具都测）、建议输入校验与原段落核对、预览、确认、文件变化拒绝、拒绝
- MCP 测试：握手、列表、未知工具与方法、isError；HTTP 只监听 127.0.0.1，错误 Host、Origin、GET、非 JSON、坏 JSON 全部拒绝
- 工作台 HTTP 测试：会话门禁、通用保存不能改共享状态
- 浏览器测试：见 `tests/knowledge-zones-browser.mjs`；每一步都核对 Vault 字节不变，另查 44px、axe、390 宽无横向溢出

## 验证命令与首次结果

每条命令前都执行 `export NVM_DIR=/opt/nvm; . "$NVM_DIR/nvm.sh"; nvm use 24`，并设置 `PLAYWRIGHT_MODULE=playwright`。

| 命令 | 首次结果 | 日志 |
|---|---|---|
| 新单元测试（实现前） | 失败，见上 | logs/01 |
| 新浏览器测试（实现前） | 失败，见上 | logs/02 |
| `npm run build` | 成功（只有既有的 chunk 大于 500 kB 警告） | — |
| `node tests/knowledge-zones-browser.mjs`（实现后首次） | 在待处理预览弹窗的 axe 检查失败：TextDifference 的 `aria-prohibited-attr`，是既有问题。修复后 7 段全部 PASS | 输出未单独留存；修复后结果见 logs/05 |
| `timeout 1200 npm test` | tests 453 / pass 428 / fail 19 / cancelled 1 / skipped 5，EXIT 124（rule-templates.test 挂起）。**相对已知集增 0、减 0** | logs/03 |
| 35 个浏览器脚本（第一轮） | 29/35。已知集内：agent-config、rule-templates、rule-templates-fix、interaction、search。**新增失败 1 个：history-capacity**，由本分支第一版 AssetHistory 修复引起 | logs/04 |
| 修复后重跑 history-capacity、history、knowledge-zones、rule-templates | 前 3 个 OK；rule-templates 为已知失败 | logs/05 |
| 35 个浏览器脚本（最终一轮） | 31/35。失败：agent-config、rule-templates、rule-templates-fix、search（palette-cold 630ms），均在已知集内。**增 0、减 0** | logs/06 |
| `node tests/visual.mjs knowledge-profile` | `problems: []`，EXIT 0 | logs/07 |

说明：npm test 只在最后一次 AssetHistory 修改之前跑过。这次修改只影响浏览器端渲染；npm test 里依赖构建产物的只有 digital-world-ui，它做的是结构检查，不涉及差异行。npm test 没有在改动后重跑。

## 需要真人确认的视觉点

截图在 `cloud-knowledge-profile-shots/`，共 4 张，均来自合成数据：
1. `knowledge-zones-1440.png`：知识仓库页头右侧的“我的知识 · 本周 +2”指标卡（等宽字体，LCD 绿）是否足够醒目；三区卡、规则表单、个人说明面板、配置示例的排布。全页截图里侧栏错位，是 sticky 侧栏的截图伪影。
2. `knowledge-zones-390.png`：窄屏下指标卡与“连接知识源”按钮并排的效果。
3. `profile-preview-1440.png`：预览弹窗里的差异样式和“需本机验证”说明的措辞。
4. `inbox-proposals-1440.png`：待处理页的建议区（排在“当前线索”和“尚未接入的来源”之间，原来的 B 区顺延为 C）。

## 未完成项与风险

1. **采纳后写入 Vault 未实现，需本机实现并验证。** 现有受控写入（`knowledge-write-files.mjs`）只允许在“00 待整理”下新建文件，不能覆盖已有文件，而它依赖的 `config-file.mjs` 核验在 Linux 上会主动拒绝。任务写着“按现有机制调用即可”，但现有机制里没有能覆盖个人说明文件的接口。
   - 目前做法：确认后建议状态记为 `confirmed`，并带上 `write: "awaiting_local"`，界面显示“已确认 · 待写入 Vault（需本机验证）”
   - 本机需要补的部分：一个受限的覆盖写入器，只允许个人说明区内的已有文件，比对 baseSha256，写前留恢复记录，写后回读
   - 路线 3.3 的验收“采纳后写入 Vault 并回读一致”目前**没有达成**
2. **页面主库版本会因为 Agent 提交建议而变旧。** MCP 提交建议会让主库 revision 加 1。如果此时用户在另一页面编辑，下一次通用保存会收到 409“另一个页面已更新主库”，现象和多标签页并发一样。
   - 待处理页进入时、确认和拒绝前都会读回最新主库，所以本流程不受影响
   - 其他页面没有自动同步。本机试用时如果 Agent 频繁提交，这个问题可能明显，可以考虑后续给建议队列单独做版本
3. **MCP 服务默认随工作台启动（127.0.0.1:5179）。** 对现有服务来说这是行为变化：多占一个端口。读取仍然要本人开启授权。如果本机不希望默认开启，改 index.mjs 的默认值即可。
4. **“新增”和“更新”没有分开统计**，理由见 3.2。
5. **路径匹配区分大小写。** macOS 的 APFS 默认不区分大小写，规则大小写和实际文件夹不一致时会归错区。
6. **跨 Agent 的实际接入完全没有验证**：Codex、Claude Code、Hermes 的配置写法都是示例，承重假设 3 仍然未验证。
7. 三区统计结果只存在内存里，服务重启后世界总览显示“三区尚未统计”，需要手动统计一次；不会自动后台扫描 Vault。

## 日志

`docs/agents/handoffs/cloud-knowledge-profile-logs/`：
- 01-red-unit
- 02-red-browser
- 03-npm-test
- 04-browser-all
- 05-after-history-fix
- 06-browser-all-final
- 07-visual

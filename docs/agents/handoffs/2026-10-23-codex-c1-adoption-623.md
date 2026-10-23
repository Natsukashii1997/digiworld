# C1统一搜索与直达正式采用 · 交回623

本轮用户明确批准“先备份，再重启一次，保持现有UI、扫描根和数据；核验收藏、焚决、逆向任务包搜索与直达”。输入621，认领622，完成后释放写入者，交回623。只采用C1，其他三项明确不做。

## 已完成

- 完整备份旧正式618、完整data、原生随手记App/草稿/偏好和启动配置：3224文件、819003251字节，逐项哈希回读一致。私有备份保存在 `work/adopt622/private-adoption-backup/`，目录700/文件600，未外传；备份manifest SHA `426697277a660667ac9197976a50b12b5be564b39025cea45d5a1db71235a13e`。
- 只切换plist的工作目录和server入口，一次bootout、一次bootstrap；正式运行 `~/Library/Application Support/PersonalAIWorkbench/releases/wb-20261023-622`，端口5178，验收时PID5775，旧PID72099。此PID仅为本轮快照，后续须实时核查。
- 正式467文件与621冻结候选完全相同，manifest SHA `16a7946f6cceda7f6821d662a750e66f0906be168270acad96836508a1e2f990`；实际HTTP入口及assets共9项逐项匹配。主脚本 `index-hvDSzzEr.js`，SHA `2c894ffb074bddb8c5cb4772f30265f76a1aafc5860c0b13801e5b89479058ec`。61份发布CSS与前版一致。本轮没有改产品源码或重建。
- 原数码世界Safari WebApp从来源重新加载到正式版本，完成下表真实操作，并通过⌘K重开搜索、收藏阅读器关闭后再次直达。最终返回设置页。

| 实际查询 | 实际直达 | 结果 |
|---|---|---|
| 高审美 | 收藏“6种高审美dashboard交互拿来就用”阅读器 | 标题、内容可见，关闭后可再次打开 |
| 背后挖掘 | 焚决“心法”卷的指定条目 | 对应正文进入可视区域并定位 |
| 原生 REA 全能力 | “验收 · 原生 REA 全能力 · 自建样本” | 正确选中记录，当前复刻任务包自动展开，版本1可见 |

## 数据与范围保护

当前业务主库revision940、13条便签、收藏revision131/13条、50项目均与本轮备份前一致。扫描根仍为 `/Users/nat/Documents/ChatGPT` 与 `/Users/nat/Documents/AI 项目`，目录身份、依赖链接、原生随手记程序/草稿/偏好保持。没有创建/删除/编辑记录、复制计次、运行Agent、扫描、迁移、导入或执行REA更新；原生随手记未重启。

原2748数据文件无缺失。仅锁journal、服务启动日志、原生会话库运行字节变化；items/operations/sessions逐行语义一致，仅sessions.data.updatedAt除外，日志只追加。进入原有逆向页触发offline doctor，新增一份环境诊断（精确路径与SHA约束，见核验说明），最终2749文件。不能表述为整个data逐字未变，业务内容已全量核对保持。

旧618与完整备份保留。没有第二次重启；若未来回退/恢复需新授权，不能覆盖当前真实库。

## 验证与已知限制

621同一冻结候选的1522全量测试、最终C1/安全异常/搜索回归/六宽收藏回归、独立双轴/T2证据继续有效；本轮未对无变更版本重复全量测试。正式HTTP、实际页面操作、截图独审、备份/候选/最终数据独审均PASS。用户自然使用验收不代签。

逆向页首次进入自动恢复10月18日遗留REA更新预演，提示旧数据目录身份不可确认。不是本次目录变化：当前身份与备份前一致；旧更新记录逐字未变，相关前后端文件与618相同。仅关闭预演后完成任务包验证，未查询/更新/清理旧状态。将来进入逆向页仍可能再次提示；此遗留REA更新状态不属于C1，本轮登记未修。

首败已留存：启动瞬时连接重置、校验脚本公开资源路由纠正、CUA输入/索引校正、最终清单新增诊断识别；详见核验说明。产品无额外修改。

## 证据与使用

- 契约/切换与备份：`work/adopt622/contract.md`、`prepared.json`、`stop-intent.json`、`stopped.json`、`start-intent.json`、`started.json`。
- 正式回读：`work/adopt622/http-readback.json`、`data-protection.final.json`、`data-manifest.final.json`。
- 实际UI：`work/adopt622/ui-verification.json`、`ui/`六张正常搜索/直达截图及一张旧提示截图。
- 独立审查：`work/adopt622/ui-review.md`、`final-audit.md`；异常说明：`verification-notes.md`。
- 开发与隔离验证源：[621](2026-10-23-codex-unified-search-621.md)。

日常使用：点击顶部“搜索工作台”或按⌘K，输入关键词，点击对应来源结果即可直接打开内容。无需安装或改设置。唯一下一步为常浩正常使用；其他三个C项不推进。

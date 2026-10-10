# Vault 受控写入 v1（扩展 KNOWLEDGE-WRITEBACK）

开发/测试仅合成 fixture；首次真实操作由用户在 5178 上触发。服务导入、页面打开、status、history 均不读取 Vault。只在用户发起 preview/apply/check/rollback 时安全核验所选目标。

默认关闭。共享 settings.get('vault') 返回 enabled、opaque generation、options={sourceId,notesFolder,profileFolders}；配置自身先预览确认、备份、写入回读与回滚。所有源必须已登记为 Obsidian；目标位于用户所选的既存、可见相对子目录，目录根/祖先/目标拒绝符号链接，文件拒绝硬链接、凭据、私人会话、隐藏与特殊文件。不得自动创建目录。

随手记只接已存 noteId 和安全 Markdown 文件名，正文由主库取得；默认独占新建。冲突返回 NAME_CONFLICT，用户改名后重新预览；不自动覆盖。个人说明只接既有已确认 proposalId，沿用 knowledge-profile 原“预览→确认”采纳链，严格核对当前文件 SHA 与 confirmation.baseSha256、唯一原段落和替换后 SHA。结果记入私有操作回执，不改原已确认且不可变的 proposal。

预览绑定来源 generation/identity、设置 options、主库 revision、原文件完整 SHA/身份和父目录身份，5 分钟失效。确认只接 token、operationId、confirmed=true；先持久化原文或不存在状态，回读原状态后才写。写后核对完整 SHA 与文件身份并留痕。异常返回 unknown，先 check；重复 operationId 只核对，不重放。

回滚先预览；仅当目标仍是本次确认回读的原样文件时恢复精确原文，或移除本次新建文件。写后有其他变化、连接重新登记、目录交换、留痕失败均停止自动回滚并报告未知。history 只返回 ID、相对目标、哈希、时间与结果，不返回 Vault 正文或绝对路径。

接口：createVaultWrite(repo,{settings,adapters={},clock})；status、previewNote({noteId,filename})、previewProfile({proposalId})、apply({token,operationId,confirmed:true})、check({operationId})、rollbackPreview({operationId})、rollback({token,operationId,confirmed:true})、history。适配底座为 scoped-text-files/journal/operations，凭据不经过本能力。

验证：默认关零目标读取、noteId/不接受任意正文或绝对路径、冲突改名、唯一段落与精确确认 SHA、源/设置/主库漂移、越界/符号与硬链接/秘密路径、正常备份回读回滚、留痕故障未知且不重放；全部合成临时目录及注入元数据检查桩。

HTTP：GET /api/capabilities/vault/{status,history}；POST /api/capabilities/vault/{preview-note,preview-profile,apply,check,rollback-preview,rollback}。费用不适用，不调用模型或Agent。普通资产JSON导出不含私有恢复正文；完整数据目录备份会包含私有恢复正文和本机授权日志，由用户保管。凭据只钥匙串，本能力不接收凭据。
首次使用先设置明确既存子目录并预览开启，再对一条不敏感随手记预览新文件；确认后核对回执及原生Obsidian文件，回滚只删除这一新增且原样文件。个人说明先原采纳流程，再独立预览写回。实现与桩不证明真实Vault已写入或用户验收。

授权日志绑定当前数据目录及祖先身份。恢复到新目录后五类能力全部关闭，旧批准不能直接生效，须本人重新预览授权；同一inode原地覆盖无法仅靠目录身份识别，本产品恢复工具只生成新目录，其他原地恢复须显式撤权。

既有知识候选写入仍保持三条固定范围：00 待整理/生活、00 待整理/工作/个人、00 待整理/工作/团队。Vault授权预览明确包含此旧入口；仍须当前授权sourceId、逐次精确全文/文件名确认、既存目录、新建不覆盖。新增随手记/个人说明各用notesFolder/profileFolders；不改旧候选业务落点。旧入口也默认关，预览绑定授权代次，持久准备后及实际open/write/unlink前再核；关闭或来源失配后的历史只返回unavailable，不读取目标正文。

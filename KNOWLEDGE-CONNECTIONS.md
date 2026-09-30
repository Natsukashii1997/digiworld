# K01 · 限域知识连接与原文查询

状态：本地验证通过、待用户验收；主运行已采用 v0.13.0。精确范围、两轴/T2、验证与运行证据见 `QA-v0.13.md`。start_head：817b2949ffbaeccae97b610691f2b78c35acb0c0；本应用为既有未提交本地工作，不提交、不推送。前版源代码与构建快照：`/tmp/guiji-v013-baseline-15jzx1`。

## 用户结果与范围

不启动项目也能连接一个明确的 Obsidian/Markdown 知识目录，显式扫描 Markdown 文件名与路径，筛选并只读查看选中文件的当前原文，复制准确来源位置。断开仅移除工作台指针，不修改来源文件。

本切片是 K01 的本地查询基础，不宣称全文/语义检索、知识编译、飞书、Agent 自动获取、真实 Vault 接通或真人使用验收已完成。所有开发验收用临时合成来源和隔离主库；不读取真实 Vault、配置、凭据或旧监督系统。

## 权限、数据与失败

- 连接表单明确名称、类型、绝对目录及本人只读确认。禁止硬盘根、用户根和宽泛容器、隐藏/依赖/系统路径及链接根；无效路径在任何文件系统调用前拒绝。只对明确目录进行元数据检查，连接本身不扫描正文或目录列表。
- 主库 `connections.knowledgeSources` 只保留 `{schema:1,id,name,kind,root,identity,generation,connectedAt}`，kind 为 obsidian/markdown。root 为已核验的目录，identity 为身份摘要；generation 标识本次授权代次。最多20个，不保存正文或文件索引。旧快照无需强制补字段。
- 连接/重新确认/断开走主库串行版本控制，必须 expectedRevision。通用保存、备份导入不得创建或扩大本机知识授权。
- 扫描显式触发，只记录可见 Markdown 元数据；不跟随链接、不读隐藏目录/依赖目录。限制目录深度、条目总量、文件数和耗时；部分扫描、未扫描、读取失败和零命中分别展示。刷新失败清除旧结果，不把旧索引伪装成当前结果。
- 文件索引只存于进程/页面内存，10分钟过期；服务重启或来源代次变化后需要重新扫描。读取只能选择本次扫描出现的路径与指纹，读取前后重验根、父链和文件身份；文件变化需重新扫描。
- 单文件最多256 KiB，仅 UTF-8 普通单链接 Markdown；屏幕显示纯文本，不执行 HTML、脚本、嵌入或网络图片。读取未授权、越界、链接、特殊文件、超限及不稳定文件都失败关闭。
- 不修改、同步或自动共享知识给其他 Agent。复制来源仅包含目录、相对路径及原文哈希/更新时间，不复制正文。断开使旧索引/读取凭证失效。

## 技术接缝与接口

文件系统模块统一拥有路径、扫描与读取边界；连接管理器拥有主库指针、代次和内存索引；页面只消费这些结果，避免 UI 自行决定权限。

`server/knowledge-files.mjs` 导出 `createKnowledgeFiles({fs,clock,limits}={})`：
- `inspectRoot(path)` → `{root,identity}`（root 为规范绝对路径，identity为64位hex）。
- `scan({root,identity})` → `{status:'complete'|'partial',files:[{path,bytes,modifiedAt,fingerprint}],issues:[{path,message}],skipped,visited}`。fingerprint绑定路径/目录链/文件身份与时间，禁止正文读取。
- `read({root,identity},{path,fingerprint})` → `{path,absolutePath,content,bytes,sha256,modifiedAt}`。

`POST /api/knowledge/{connect|scan|read|reconfirm|remove}`：
- connect `{name,kind,root,confirmed:true,expectedRevision}` → 完整最新 workspace。
- reconfirm/remove `{sourceId,confirmed:true,expectedRevision}` → 完整最新 workspace；reconfirm 不改名称/路径，仅明确重验身份及换代。
- scan `{sourceId}` → `{scanId,sourceId,generation,at,expiresAt,status,files,issues,skipped,visited}`。
- read `{sourceId,scanId,path}` → 文件结果加 `{sourceId,sourceName,root,readAt}`。
- 所有未知字段拒绝。错误使用既有 HTTP status/error；连接/断开响应丢失时用户刷新核对，禁止自动重放写入。

## UI 与验证

沿用批准 A 风格 v0.2，Path 3，结构/样式/图标权威均已批准；T1 `SATISFIED_BY_EXISTING_AUTHORITY`。manifest SHA `bd692d5fdcff8fdf911ceea53b5f1c3e36ce4958c3f3ac7a160c01a3f9d26e22`，生成预算0。复用 App Shell、PageHeading、Button、Badge、Dialog、搜索栏和已有文本预览样式；不添加营销式解释卡。

| 区域 | 行为/数据 | 主要状态 | 持久化 |
|---|---|---|---|
| 连接列表 | 新连接、选来源、重新确认、断开 | 空/已有/操作中/失败 | 来源指针 |
| 查询 | 显式扫描、文件名/路径筛选 | 未扫描/扫描中/完整/部分/无命中/过期/不可访问 | 内存索引 |
| 原文预览 | 选择文件、显示正文、复制来源 | 加载/成功/变化拒绝/失败/长内容 | 不持久化正文 |
| 飞书 | 简短未连接状态 | 未接入 | 无 |

表单保留失败输入，互斥防重复，卸载/切换来源后忽略旧响应；只读预览不显示为已同步。连接变更后立即更新列表，刷新仍存在。断开二次确认并注明不删除源文件。

验收：TDD安全路径和主流程、并发版本/移除/过期/身份变化、源文件不变、无正文快照、旧数据迁移与备份边界、真实浏览器纵向流程/键盘/长文/空与错误/响应式/axe；独立 Standards 与 Spec；当前构建流程审查和 T2；最后主服务版本采用与真实主库前后哈希核对。真实Vault与用户验收单列待验，不推断通过。

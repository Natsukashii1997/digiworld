# 知识仓库统一检索与只读 MCP

正式派单193切片B，Codex按用户授权实施；个人说明、知识连接、整理/维护/写回原契约继续有效。本单不接飞书、不读取真实Agent配置、不访问启停5178、不改真实Vault。先完成A全量回归，再实施本契约。

## 对象与权限

- 已确认知识源以主库的稳定id、canonical root、identity、generation为事实；仅保存位置指针、授权和排除规则，正文/摘录/索引不入主库或日志。
- `agentSharing`缺省false，`excludedFolders`缺省空数组，兼容旧来源；新接入与重确认默认关知识共享。
- 排除目录为来源内相对文件夹，最多20个/每个200字符。按完整路径段及保守NFC/大小写折叠匹配（可能扩大排除，不扩大权限），拒绝绝对/越界/空段/控制符/通配符/隐藏或秘密目录。排除在枚举子树与打开正文前执行；同一物理范围不能通过父根、子根或另一来源绕过。
- 开放/关闭/排除经本人专用操作，须`confirmed:true`和当前`expectedRevision`；通用PUT与备份不能增加权限。关闭/改变排除更换generation，旧扫描及游标失效。
- 个人说明授权独立：知识工具始终排除个人说明规则目录；`read_profile`仍单独授权。开启个人说明时固定实际sourceId；源、目录身份或规则变化关闭旧授权。
- 删除/重确认/排除/个人说明范围变更不能扩大重叠来源的既有授权：同一主库事务关闭受影响的其他重叠来源知识共享、更换generation。本人本次明确确认的目标源可按新范围授权。
- 本人页面检索/预览无需打开Agent共享，但仍遵守目录身份、排除和普通单链接文件规则。四Agent接入无法核验时显示未知；复制配置不改真实配置。

## 接口

所有本人HTTP接口继承工作台会话门禁，未知字段拒绝。audience仅由可信路由指定，客户端不能提交。

| 入口 | 输入 | 输出/责任 |
|---|---|---|
| POST `/api/knowledge/policy` | sourceId、agentSharing:boolean、excludedFolders:string[]、confirmed:true、expectedRevision | 联合事务与更新后主库，禁止盲重放 |
| POST `/api/knowledge/search-all` | query、可选limit(1–50)、cursor | 本人跨已连接来源；覆盖、逐源失败和显式续查 |
| MCP `search_knowledge` | query、可选limit(1–50)、cursor | 仅有效共享来源；标题、来源、相对路径、摘录、哈希、覆盖，绝对root不输出 |
| MCP `read_note` | sourceId、path、可选maxChars(1–16000)、expectedSha256(64hex) | 仅当前完整一篇；字符或256KiB超限拒绝，SHA变动409，不静默截断 |
| POST `/api/knowledge/read-note` | sourceId、path、expectedSha256；可选maxChars | 本人完整原文预览沿用256KiB上限与SHA校验，无需Agent授权 |
| POST `/api/knowledge/profile/read-preview` | 空对象 | 本人预览，不要求profileSharing；最多20篇/单篇16000字符/总64000字符，明确truncated、omitted与覆盖 |

MCP原`read_profile`、`propose_profile_change`保持。新知识工具标记只读，不暴露写入/归档/移动/删除。原建议工具只进待处理，在提交建议事务中再次核验共享、来源与规则；采纳/拒绝流程保留。

## 并发、预算与覆盖

- 最多20来源、2个并发来源扫描/文件任务；有效来源参加并发调度，不能直接调用共用busy锁的旧单源query。
- 单批元数据最多5000条目/2000 Markdown文件/5000ms；正文尝试最多100篇/预计总4MiB/2000ms；失败尝试也占预计预算。单文件仍最多256KiB。
- 字数按JavaScript UTF-16单位计算；Agent读取超限拒绝，本人原文保留256KiB完整读取。
- 开始新I/O前同步预留共享预算，不为每源复制全额；时间预算是协作停止条件，不声称能够硬中断在途文件I/O。
- 结果最多50条，每条最多3个300字符摘录；输出序列化最多256KiB。每批结果稳定按sourceId和相对路径排序，不依赖locale；limit=1按该次序连续翻页，较大分页用确定的来源轮转且不遗漏命中。
- 预算未覆盖的源/文件标未查或部分；`searchedSources`只计已完整/部分查到的来源。单源失败撤回该源结果，保留其他稳定来源；失败不等于未命中。
- `complete`须所有来源扫描和正文查询完整且无错误/预算缺口。扫描partial且本批正文完整仍是partial。
- 同时一批查询，忙返回429；无后台重扫/自动续查。游标最多20个/TTL10分钟，仅内存保存查询、audience、身份/代次、规则/排除摘要、文件指纹和位置，正文/摘录不保存。
- 续查继承范围与查询；旧授权/身份/规则变化或到期409。不越过未返回的命中文件，不由超出limit的裁剪造成永久遗漏。

检索结果模型：

```text
{query,status,totalSources,searchedSources,
 results:[{sourceId,sourceName,sourceKind,title,path,sha256,modifiedAt,bytes,
           snippets:[{line,text,matchStart,matchEnd}]}],
 coverage:[{sourceId,sourceName,status,scanned,attempted,read,stopReason,message?}],
 budget:{attempted,bytes,results,stopReason},nextCursor,expiresAt,at}
```

覆盖status为complete/partial/failed/unsearched。关闭来源的名称/目录不进入MCP输出。错误只返回受控文案，未知异常不回显内部路径或正文。

## 文件访问与在途变化

- 复用`knowledge-files`根/父链身份、普通单链接文件、`O_NOFOLLOW`、有界双读、UTF-8校验，不执行原文嵌入内容。
- 短主库快照→I/O→短主库回验；最终回验已完成来源的目录身份，单源不安全撤回该源结果；所有在途任务settle后才释放查询忙锁；不在仓库队列内等待扫描/正文读取，使撤权能及时生效。
- 每篇前后与最终返回前核验来源和访问范围。全局个人说明/排除保护变化整批撤回409；已观察不安全变化不能因路径恢复而忽略。
- 授权前的路径、排除、字符参数检查不触及目标文件。MCP仅127.0.0.1，严格Host、拒绝Origin、有限POST JSON和显式四工具分发。
- 路径检查为观测性防护，不宣称OS原子沙箱。

## 旧流程与页面事实

旧单源扫描/读取/捕获绑定该来源及实际物理排除范围的sourceScopeKey，无关目录接入不作废旧凭证；统一跨源游标和个人说明仍绑定全局policyKey。整理/维护/候选保存的4处文件访问显式传来源id/generation/root/identity，证据id不能冒充源id，原授权与SHA回验保留。

页面摘要请求失败显示MCP状态未知，允许显式刷新核验；摘要更新共用请求代次，初始迟到响应不能覆盖较新的明确核验；仅成功摘要无服务地址才显示未运行。单源失败显示需重新确认目录并断线，未查范围不计为已查。个人说明预览后仅在页面内存保留已预览章节、字数、部分标记和范围内最近mtime，换源/代次/规则即清除；原文保持纯文本，章节跳转不解析执行Markdown。未打开预览不自动读取正文，不将预览子集冒充全库统计。

## 验收与停止

多源真正并发且不429、稳定合并/显式分页/共享预算；一源失败和partial零命中；默认关与四种授权组合；排除子树零读取/旧凭证作废/父子源绕过/删除保护源后不扩权；读取中撤权/换根/换规则/建议入队前撤权；穿越/符号及硬链接/字节字符超限；通用保存与备份不增权；HTTP/MCP门禁；保留组件和数据链路。

A与B分别全量npm、逐浏览器入口、visual；最终四态×两宽逐区叠图、同输入前后、迁移/SHA、两轴review与精确build T2。交接195、释放写入者并停等用户确认。工程合成验证不等于5178采用、Claude验收或真人验收。

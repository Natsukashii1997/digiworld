# Agent配置、挂载与迁移受控写入 v1（扩展 AGENT-CONFIG）

## 默认关闭与范围

设置中的Agent写入开关默认关闭；旧A02/A03读取与预览保留，执行必须经过新授权门。选择已绑定管理目标，不接受任意Home路径。目录/程序/绑定代次全部复核；缺失、链接、身份漂移、ACL或不支持属性、配置语法不支持时拒写。文件写入/回读/Agent实际采用分开显示，不自动重启Agent。

保留现有Codex/Hermes显示类布尔字段白名单与AST局部patch、逆patchjournal。不能因“配置迁移”读取/复制整个含凭据的配置；快照只含可支持字段值、文件SHA、来源代次，不保存其余正文。迁移先选源/目标，预览明确映射和未映射字段，用户逐项确认；没有语义等价映射的字段不能猜值。配置与Skill包分开事务，跨文件不宣称原子。

## Skill、插件与接力

Skill发布只从固定资产版本提取经现有安全包验证的文件，目标为核验Home下固定skills子目录；预览完整新增/替换列表、权限与冲突，确认后备份、写、逐文件回读、日志、回滚。发布不执行SKILL中的脚本、Hook、依赖安装或任意指令。本版同名拒绝覆盖，不开放替换。

启停只处理用户选定Agent所属挂载/独立目录，不移动共享池本体，也不影响别的Agent。按官方发现机制适配：目录移动并不等于所有插件已停用；插件注册形式缺证时不显示可执行开关，保留原因。共享池链接启停/迁移本版明确拒绝，其目标不读写。Codex Skill走skills.config[].enabled，已登记插件走plugins.<name@marketplace>.enabled布尔局部patch；Hermes独立Skill副本排他移动到私有禁用容器，保完整文件/mode。

会话级接力只生成用户提供上下文/已选择固定资产的接力包，用户复制到目标原生Agent。不自动打开/读取/上传私人会话，不自动调用Agent。

## 事务与回滚

每次操作：服务端解析固定目标→身份核验→五分钟预览→确认→持久prepared/备份→执行→回读→留痕。预览绑定revision、开关代次、程序/Home身份、文件身份和完整SHA、固定资产版本。执行时再次核验。

复用现有config-file/config-journal强事务；新Skill/目录事务使用独立validator与folder，不扩大既有journal的patch白名单。结果未知先按operationId查询，不盲重试；记录读失败不能返回operationNotStarted。回滚仅恢复该操作写后仍完全匹配的目标，并持久记录恢复；外部编辑、改绑或同字节替换身份变化拒绝。

禁写并测试：auth.json、credentials、secrets、tokens、.env及变体、私钥/keychain、私人会话/历史；任意MCP、安全/权限、Hook或启动参数也不在此迁移白名单。备份不含凭据。日志只记录支持动作、目标、前后SHA和结果，不存完整配置或stderr。

## API、费用与测试

现有`/api/agent-config/{inspect,preview,apply,check,history,restore-preview}`保留；新增`/api/capabilities/agent/{inspect,publish-preview,toggle-preview,snapshot,migration-preview,config-migration-preview,apply,check,history,rollback-preview,relay}`全部POST。回滚预览返回新token/revision，经apply确认。无Agent/模型调用，费用不适用。

仅合成Home与真实临时文件。覆盖白名单和黑名单、目录/链接/硬链接/权限/ACL/绑定漂移、共享池保护、包路径越界、同名冲突、备份失败、prepared与rename后中断、响应丢失/重开、回读失败、逆操作拒绝覆盖外部变动。UI44px/320390/axe/减少动态效果及忙碌重复提交全部保留。首次用户终验先对单个明确支持字段或独立Skill副本，预览后执行并回读，再测试回滚；不声称Agent进程已采用。

同Agent两个已登记管理目标支持原有显示字段单字段迁移；跨Codex/Hermes无等价字段拒绝，独立Skill副本可跨Agent复制。Node目录rename无原子no-replace证明，已做排他容器/逐层身份/写前复核，仍保留同UID恶意并发最后指令缝隙限制，不声称OS绝对隔离。

授权日志绑定当前数据目录及祖先身份。恢复到新目录后五类能力全部关闭，旧批准不能直接生效，须本人重新预览授权；同一inode原地覆盖无法仅靠目录身份识别，本产品恢复工具只生成新目录，其他原地恢复须显式撤权。

## 终审优化262：本机白名单快照历史

新增snapshot-save / snapshot-read / snapshot-history。读取预览后由用户点保存，服务端重读来源并核对主库版本、配置SHA和目标/程序/Home身份。原子日志只存两个显示字段、时间、来源SHA与身份哈希；不存标签自由文本、路径、完整配置或凭据。快照本身为不可变本机记录，无宿主修改，不借Agent写入开关控制。未知先查原UUID，同编号相同输入只回读；改绑不暴露旧绑定记录。历史不作为当前字段迁移输入，不开放历史回滚或采用认证。完整恢复包自动纳入该独立目录；不改变其他备份边界。


### 快照未知保存的恢复（262补充）

浏览器按目标绑定摘要在 localStorage 保存原 UUID，写后回读成功才发出保存请求。结果未知改用 snapshot-resolve；服务器与保存共用主库串行队列：有同绑定记录则回读，无记录则持久封闭 UUID 并回读后才确认未保存，迟到原请求拒绝。旧记录存在但目标已改绑时只返回 binding_changed，不返回旧字段；界面结束已查明的旧编号，原服务端记录保留，当前目标重新读取。未保存或执行前拒绝后失效旧预览，不能用旧内容再次保存。关闭/新开标签、原请求先后竞态和封闭记录故障均用隔离测试验证。

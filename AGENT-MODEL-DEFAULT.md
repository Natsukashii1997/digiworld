# Codex 用户默认模型受控变更合同（T04）

## 唯一目标

首版只针对已登记、身份可核验的 **Codex CLI 用户 Home** 中 `config.toml` 的顶层 `model` 字符串。用户点选目标、输入模型 ID、查看当前值和前后 SHA、确认后，后端定点修改并回读。运行中的会话不会被切换。新会话实际使用哪个模型需要在目标宿主单独核验；项目配置、profile、启动参数等可能覆盖用户默认。

官方依据：[Codex 配置基础与优先级](https://learn.chatgpt.com/docs/config-file/config-basic)、[配置字段参考](https://learn.chatgpt.com/docs/config-file/config-reference)、[模型选择](https://learn.chatgpt.com/docs/models)。此合同中的保守解析、身份校验和事务限制是工作台的工程边界。

## 白名单及拒绝条件

- 只支持有效 TOML 的顶层 `model` 缺失或为唯一字符串；`model_provider` 缺失或严格为 `openai`。不改 provider、`model_reasoning_effort`、网关、MCP、Hook、安全与权限、环境变量或凭据。自定义 provider、重复/点号/表式 `model`、源模型值不符合安全 ID 格式、非法 TOML、配置缺失、链接/硬链接/ACL/扩展属性、目标身份漂移均拒绝。首版拒绝全部扩展属性，避免底层保留 provenance 时在授权门之外执行 xattr 修改。
- 输入和源模型 ID 均须符合 `[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}`，且拒绝常见密钥前缀及高熵样式。该保守筛选只降低误把令牌当模型值回显/落盘的风险，不能证明任意字符串绝不含秘密，也不证明模型存在、账号有权调用或费用可控。遇到不支持的当前值不展示原文、不写入。
- 后端可以在内存中读取完整配置来解析和生成局部补丁，但 API/UI、操作日志、错误、主库与回滚记录只暴露白名单模型值、身份哈希、前后 SHA 及限定长度的逆补丁。不得把完整配置写入资产版本、浏览器或测试日志。
- 模型配置有独立、默认关闭的授权，使用 agent-model-permissions 日志；旧 Agent 写入开关不开放此范围。关闭时可显式读取/预览，执行和恢复都须同一独立授权代次、五分钟预览、主库 revision、target/Home/program 身份和配置文件 hash/identity 再核验。用户不提供任意文件路径。

## 操作与恢复

1. `model-inspect` 只读当前用户配置中的模型字段；`model-preview` 返回服务端 token、旧/新模型与 hash，无宿主写入。
2. `model-apply` 在任何宿主写之前持久准备独立 journal；每次 journal 与配置文件变更前核对模型配置独立授权门和绑定。配置文件使用现有 `atomicReplaceConfig` 的文件身份/hash CAS、暂存、原子替换、回读，并用只读的严格元数据适配器拒绝 xattr/ACL。将写后文件 identity 另记为不可变回执。同目标 ID 的旧绑定若有无身份回执的未知操作，仍拒绝新预览/执行。任何响应丢失或 prepared 后中断都只按原 operationId 查询，不自动重放。
3. `model-check` 与确认在同一主库串行域。无操作记录时，先持久封闭 UUID，令迟到确认永远不能执行，再返回 `closed:true`；封闭写入失败则不返回已封闭。只有 journal、写后身份回执和当前文件 hash/identity 均吻合才返回 `verified`。`verified` 只证明用户默认配置写入，不证明 Codex 启动时选用了它。
4. `model-rollback-preview` 只针对原始已核验 apply；先用逆补丁重建原文件并经顶层模型 adapter 重新推导，且当前文件仍须完全符合写后 hash/identity。`model-rollback` 也是新操作，经同样预览、授权、prepared、原子写和回读。外部编辑、同字节替换身份变化、配置或目标不可读时拒绝恢复。
5. 操作历史只展示当前绑定身份的记录；旧目标改绑后不透出旧记录。浏览器以包含绑定字段的 tuple 派生哈希 key，localStorage 只存 UUID；关标签再打开仍可查询。只有 `verified` 或 `closed:true` 清除待决 ID，普通未开始错误及未知状态仍保留。绑定改动只重置当前显示，新 key 不绕过服务端未知阻断。

## 验收分层

- 合成配置测试：BOM/CRLF/中文或 emoji 前缀、注释/表、顶层与嵌套 `model`、无字段插入、复杂旧字符串、非法/重复键、自定义 provider、恶意模型 ID、字节保持与固定错误码。
- 合成 Home 和 data：默认关、绑定/程序/Home/配置身份漂移、preview TTL/revision、prepared 前后故障、响应丢失后原 ID 查询、严格 journal 字段、回滚与外部同字节替换、无 raw config/凭据落盘、无网络/模型调用。
- UI：当前值预览、开关关闭不能确认、未知编号跨标签页保留并跨标签同步、同 ID 改绑重置旧视图与历史、历史恢复、状态不冒充新会话采用。
- 真实宿主写入和新会话模型核验是额外门禁；实施候选与合成测试均不读取本人真实配置或调用模型。

Claude、Hermes、MCP 资产、API Key/提供方迁移不在 T04 首片。


## 独立授权与恢复编号

- 模型区通过独立 status/preview/apply/check 管理授权；只公开模型配置这一项。开启或关闭先预览、再确认，操作 UUID 在发请求前保存在本机浏览器，结果不明只查原编号。
- 授权与模型变更各有封闭编号记录。服务器在相同队列中确认无持久操作后先封闭编号，再允许界面结束未决状态；迟到请求不能执行。恢复备份到新数据根时，独立授权关闭，须重新确认。
- 浏览器保存的是按目标绑定摘要分隔的最小 UUID，关闭标签后保留；不会保存配置、模型值、Home 路径。读取/写入/回读不可靠时停止新写入。同编号查询终态后才清除本标签指针，另标签的新编号不会被删除。
- 使用记账只记录首次开始的模型修改/恢复；授权设置仅留独立权限日志，不把授予权限计作能力使用。

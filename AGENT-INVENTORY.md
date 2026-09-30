# A02 · Agent 目录与资产来源管理 · v0.8

状态：本地验证通过、待用户验收。工作台主服务已采用 v0.8.0；完整目标仍 active；本切片不包含真实 Agent 安装、配置写入或 Agent 运行采用。精确证据见 QA-v0.8.md。

结果：从 Agent 卡片查看程序入口以及 Codex/Hermes 的 Home 与 Profile 目录候选，区分目录存在、缺失、受阻。选中实际存在的 Skill 来源后，进入既有完整预览→确认收录流程；不安装、启用、执行或修改源目录。其他品牌保持入口发现，不伪造适配覆盖。用户继续在各原生 Agent 中工作。

边界：只枚举固定默认 Home 与当前服务进程明确的 CODEX_HOME/HERMES_HOME 候选（标注来源，不推断其它进程）。Hermes 合法直属 Profile 目录排除 tombstone；最多 100 项，超限/权限/链接明确受阻，不跟随 Home/Profile 链接。Codex 目录、共享用户 Skill 目录分别呈现，不通过用户配置推断启用状态。配置正文、auth、env、聊天及 active_profile 均不读取。目录与 Skill 的存在不证明实例启动、登录、连接或实际加载。目录元数据仅临时返回，不写主库；旧结果刷新失败须标明过期，不能显示为空或仍然最新。

接口：POST /api/agent-inventory {agentId}，仅 codex/hermes 支持。返回 {agentId,at,homes:[{id,label,path,source,status,skills:[{path,label,status,scope}],errors}],errors,truncated}。目录 status 为 present/missing/blocked；运行/启用不提供推测。请求受既有本机会话、Host、Origin 门禁保护。服务端可注入 home/environment 作为隔离测试 seam，生产不接受浏览器任意 home。稳定身份基于品牌与绝对路径；不把品牌当实例，不自动关联具体程序与 Home。入口版本未取证则显示未验证，不执行 CLI 获取版本。

不完整结果策略：HTTP 失败和 200 中的顶层枚举错误/截断均不覆盖已有整份目录快照；显示本次原因、标记上次结果并暂停全部来源入口，完整重试后一起恢复。首次即不完整时展示已取得的部分结果，但不开放来源动作。不按“这次没有返回”推断旧 Profile 消失；单个已明确返回的 blocked 目录仍显示受阻，其它确定来源可以独立使用。

UI：继承批准 A v0.2（manifest SHA-256 bd692d5fdcff8fdf911ceea53b5f1c3e36ce4958c3f3ac7a160c01a3f9d26e22），视觉路径 3，T1 SATISFIED_BY_EXISTING_AUTHORITY，生图预算 0。Agent 详情分程序入口/目录与资产，自动只读加载元数据；共享 Dialog/Button/Badge/路径样式。可刷新、复制路径，存在的 Skill 目录可进入限定来源的收录流程。仅在明确点击扫描后读取 Skill，沿用原完整包安全检查。保持返回入口、失败恢复、过期提示、键盘焦点与 320–430 px 窄屏可用；不加营销解释区。运行/连接/启用只用简短未验证状态。

验收：实际临时目录测试默认/环境 Home、Hermes Profiles、稳定 ID、缺失/权限/链接/tombstone/限额；HTTP 身份及失败输入、读取不改变主库；浏览器覆盖目录查看、刷新失败与恢复、过时请求取消、限定目录→完整预览→确认收录、返回导航、窄屏/键盘/axe。独立 Spec 与 Standards 审查相同不可变快照，T2 对应最终构建。真实机器仅目录元数据与构建回读；真实资料不用于写入测试。

start_head：817b2949ffbaeccae97b610691f2b78c35acb0c0。现有脏工作区保留，不提交、推送、安装新依赖、改全局/Vault/飞书或旧监工。基线快照在开工工具记录；主库 v0.7 revision 3 保留。后续 A02 尚需程序版本/配置摘要/目标副本关系与实际采用，A03 配置应用/恢复单独授权与验证。

依据：当前 Codex 官方 build-skills 的用户目录与环境变量说明；本机 Hermes 0.21.1 源码 profiles.py:262、hermes_constants.py:146、skills_tool.py:60。官网与本机 Profile 身份条件不一致，界面只称目录候选，不宣称完整或活动实例。

验证：89 项单元/API、56 组浏览器、迁移/容量各 2、27 状态 axe 通过；两轴最终 0 未闭合项，T2 VISUAL_PASS。Spec 捕获的部分枚举覆掉旧 Profile 已补真实 inspector 反例并独立复核。真实主库 revision 3 与原快照哈希不变，真实 Agent 仅元数据检查；真实使用验收和全产品完成仍开放。

# 常驻与夜巡受控执行 v1

能力默认关；常驻与夜巡分别授权，旧人民币草稿不自动兑换或启用。普通工作区save/JSON导入不能开启能力。授权配置先预览、备份旧设置、确认、回读、留痕并可回滚。页面/工厂/status不启动宿主扫描、CLI、钥匙串或launchctl。开发测试只合成目录、随机端口及注入桩；5178零开发访问，首次真实操作由本人进行。

常驻只接受本产品固定Label `cn.personal-ai-workbench.server`、已核验Node入口、项目和数据目录及本人LaunchAgents目录。预览完整plist/路径/日志/固定5178，确认后私有备份、排他写入/精确替换与SHA回读。同名外来plist、链接、身份不明拒绝。安装遇5178占用仅保存确认的plist，等待本人终端处理，不停止旧服务、不换端口。显式inspect分别核验installed/loaded，healthy未知不等于成功。卸载已加载Label时等待本人终端停止；本人手动启动工作台后，仅移除已未加载且仍与操作SHA匹配的ownplist，不影响手动工作台。回滚先预览，只恢复自己的精确备份；外部变化或未知状态不得覆盖。运行采用与文件落盘分开，桩不证明真实launchd运行。

夜巡任务逐条保存项目ID、已登记Claude绑定ID、指令、精确允许只读文件ID、工作台输出相对位置、明确USD预留。登记仅用户所选已接受身份项目内的有限普通文件；拒绝链接、硬链、秘密/隐藏/会话文件，不读私人配置。程序只允许Claude官方native安装versions目录普通入口，版本名≥2.1.286；版本名是安装声明，真实可用性仍须首次回执。npm包装器依赖范围、其他Agent预算控制证据不足，不可选执行。

预览显示草稿SHA、窗口、指令、每文件SHA、程序身份、输出位置、费用控制和完整外发范围；确认固定草稿版本后才能无人值守。每晚按开始日期确定一次运行ID，变草稿也不能逃重复。生产server显式tick，默认关/无任务/未批准/窗外均跳过；工厂自身不创建timer。关开关先停止活跃任务，运行前和每次spawn前复核授权代次、窗口、程序、文件、剩余预算及停止标志。

官方Claude CLI非交互只读工具Read/Glob/Grep，bare/restricted/无权限提示、无MCP/Hook/浏览器/会话持久化、有限轮数及max-budget-usd。整个进程置于macOS Seatbelt，项目不可写、只读精确清单；仅隔离临时运行目录可写，输出由工作台捕获写私有产物。固定本机CONNECT代理只转发api.anthropic.com:443，子进程无直接网络或5178访问。Key从钥匙串读取，仅子进程内存环境使用，不进argv/plist/文件/日志。

USD阈值是官方CLI停止阈值，非最终账单硬保证；已发出请求不可撤销。每任务预留之和不超过当晚上限，用量未知或超预留立即停止后续；不猜人民币汇率。单任务超时、到窗口结束、全局停止均终止进程组；无法证明已结束保持未知。回执记起止、状态、退出码、耗时、输出SHA、实返用量及客户端费用估算；没有运行不画点，没有费用写未知，不作0。成本按Agent/每夜汇总，任一未知即汇总未知，账单仍未知。

运行prepared和原计划备份先落盘，每次CLI started/PID先留痕，结果排他写入回读。晨报只由真实回执生成，进待处理；晨报入库失败只能补交，不重跑。回滚预览后仅撤销计划批准或移除本次仍原样的产物/晨报，保留审计和已经发生的费用。草稿和目标解绑也留本机版本备份；目录、日志、程序漂移阻断动作。响应丢失只check，不重放。

GET `/api/capabilities/settings/{status,history}`，POST同前缀`preview/apply/check/rollback-preview/rollback`；GET `/api/capabilities/daemon/{status,history}`，POST同前缀`inspect/preview/apply/check/rollback-preview/rollback`；GET `/api/capabilities/night/{status,history,targets,morning-reports,draft-history}`，POST同前缀`register-preview/register-confirm/unregister-preview/unregister/save-tasks/preview/confirm/run/stop/check/rollback-preview/rollback/draft-rollback-preview/draft-rollback/deliver-morning`。确认操作confirmed:true。

测试只桩CLI/launchctl/网络/钥匙串：成功、失败、超时、超预算、费用未知、停止、关开关竞争、跨午夜、每夜去重、文件/程序漂移、输出越界、日志失败、重开只查询、恢复保护；新UI44/320390/axe/runtime reduce/IME/busy/Esc。首次真实使用：先低USD阈值、短超时/少轮数开启夜巡，登记一个已接受项目的单个不敏感文件及受支持CLI，保存一项只读任务，预览批准，再核对窗口内执行及晨报。常驻先预览安装；5178仍占用时按固定Label的交接清单由本人终端处理，不能把plist写入说成运行采用。

依据：[CLI参考](https://code.claude.com/docs/en/cli-reference)、[无人值守](https://code.claude.com/docs/en/headless)、[Sandbox](https://code.claude.com/docs/en/sandboxing)。目标机器版本、Seatbelt/代理/CLI真实运行与账单均未开发验证。

授权日志绑定当前数据目录及祖先身份。恢复到新目录后五类能力全部关闭，旧批准不能直接生效，须本人重新预览授权；同一inode原地覆盖无法仅靠目录身份识别，本产品恢复工具只生成新目录，其他原地恢复须显式撤权。

持久日志存在任一尚未证实停止的CLI进程组时，阻断所有新夜、新草稿与新操作编号；状态和tick不探宿主，只有明确查询可核验进程已不存在后补留痕解锁。无法证明停止时需本人处理，不能用内存active清空当结束。

显式产物回读：POST `/api/capabilities/night/read` 只接受 `operationId`，晨报与任务产物都经已存 SHA256 和文件身份核验；不重跑 CLI。批准后服务可在窗口内自动调度，不能仅凭UI尚未点击立即执行就声称尚未运行。

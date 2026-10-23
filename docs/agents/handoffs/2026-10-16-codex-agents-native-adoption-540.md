# 智能体群真实验证与正式采用540

输入 WB-20261016-538，539认领；输出 WB-20261016-540。用户授权真实Agent加载、上下文接续，通过后正式更新；另明确授权现有Hermes服务接收本轮脱敏材料，以及发生默认记忆偏差后按修正参数新建验证会话。

## 当前结论与纠正

本轮真实 Codex→工作台→Hermes Skill加载→同ID续接已通过，正式5178已采用。**最后回读时（17:29后），Hermes启动程序、配置、Skill及原安装目录已从原位置消失。原因待用户确认；不擅自恢复/重装。此前成功是有效历史证据，当前Hermes不可用。** 正式工作台仍运行正常，数据保持。

REA引擎确实调用，但自动执行器没有完整Skill加载证据，受限于固定提示词/五只读工具；补查也止于桌面invoke桥接与原生字面量，未恢复完整Rust处理器。先前问题是有限分析被推进为功能交付后，没有补原生采用验收。不是已证明完整逆向，也不是引擎没生效。审计：聊天work/real539/rea-audit.md。

## 本轮源码与验证

- server/relay-sessions.mjs：当前Codex paginated日志，连续ordinal检查、可靠启动上下文块剔除、保留普通文本与最新决定；未知/缺序/回滚等仍拒绝。
- server/agent-write.mjs：只读普通目录/Skill允许唯一OS provenance；ACL/quarantine/未知属性及写入保护保持。迁移采用按具体Skill名精确查找，解除300目录枚举上限带来的误报。
- src/ProfileProposals.jsx：只读refresh不锁抽屉关闭，确认/拒绝写仍锁。旧正式与候选均有此问题，首败保留。
- tests/relay-native-format.test.mjs、agent-native-metadata.test.mjs、agent-write.test.mjs：格式/元数据/300+回归。
- 共享源码全量1377/1377；发布候选相关193/193（最后Profile一行修改前）。最后构建另验首页17、关闭门禁4、接力6、迁移6，0错误；最终T2 VISUAL_PASS。Spec/Standards无未闭合致命/重要发现，不代签Claude/真人验收。
- 详细固定文件SHA、首败与复核证据：repo/work/agents539；聊天work/real539/native-write-review.md、parser-review.md、release-stage/final/browser-evidence/final-review.json。

## 原生证明与边界

- Codex CLI 0.160.1真实新会话+resume：01a143d8-cd73-78f3-9933-e8066b3382a7。原生日志精确副本SHA 7b5e33487116d5d073e3f25cf0debebebb488913e35a4b7200f08bd7220081b8；本轮仅新建任务材料，不读取旧私人会话正文供模型验证。
- 真实迁移批次 a68ef123-c5fe-4a41-a1f5-b4ed530e4e4b，纯文本Skill workbench-release-handoff-539，经实际API写入Hermes Home并回读。该批次存在隔离数据中，不伪装成正式迁移历史。
- 修正后Hermes会话20261016_170835_b8b92f，新建+原IDresume，两次原生result exit_code=0，工具调用0。Skill内专属marker不在用户输入中；第二次未重贴上下文仍保留530/534/538、排除528，并纠正旧unverified状态。
- 首次会话20261016_170039_f3a941默认预载内置记忆，超出首次说明范围。已披露并取得修正授权；首次证据保留、不复用。未读取记忆正文、未审计真实请求正文，不声称能撤回远端收到的数据。
- 修正采用 --ignore-rules + --skills + todo，HERMES_SAFE_MODE=1。实际argv+当前未变安装源+隔离构造参数探针证明skip_memory=true且显式Skill保留；不是对真实模型进程做构造拦截，也不是原始API payload审计。
- native-verified.json与原始clean/resume事件保留。当前Hermes缺失记在formal-ui-readback.json，不能据旧成功恢复成current ready。

## 正式采用与恢复

原服务PID29709；新服务PID68445，固定label cn.personal-ai-workbench.server。5178端口、实际入口、页面资源与数据目录身份回读一致。

为避开528未批准的便签混合源码，重建旧正式程序：旧dist19/19逐字一致；只加530首页/侧栏、534/538智能体群与539修复。本轮没有把共享dirty源码整包发布，HEAD未变e6e5d8b74474ea408ebb171ab70415e32d57ada4，无commit/push/reset/stash/clean。

正式程序：`/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/wb-20261016-539`。
回退程序：`/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/rollback-20261016-539`。
独立依赖：`/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/deps-20261016-539/node_modules`。
数据仍为repo/data，未迁目录，revision216。共享repo/dist仍是旧正式资源，**不再是当前运行入口**；后续发布必须从当前冻结基线明确合入，不直接旧脚本覆盖dist或重启混合工作区。

新发布408源码/资源+19dist共427文件哈希与模式回读；index SHA617208677d17bc6526cc309251bb302815a06c12d2a72c7ada796299d88f0bbe，程序指纹8a31cc1866b7d028aeee1e8cf25580be06dc673c7f9a3ace5a0e83ea77c3efd2。复制现有依赖，没有安装/更新/联网下载。

保留两次首败：首次bootstrap返回5；已确认服务未登记、端口空闲后，仅恢复登记成功，未再次bootout。随后依赖副本目录名导致ERR_MODULE_NOT_FOUND；修成真实node_modules目录，两套运行图加载成功，launchd自动恢复。初次bootstrap5的具体成因未知，不归因于未经证明的时序。无盲目重载或数据回滚。

配置备份、主库指针/当前snapshot/收藏备份：聊天work/real539/formal-backup（私有权限，不含全量data备份）。rollback.plist指向冻结旧程序。恢复前必须重新核验当前状态，不能直接运行已完成adopt539.py；该脚本有原操作意向保护，不支持重放。页面内常驻变更日志未伪造本次外部发布回执；维护时以本次真实launchd/plist与读回证据为准。

formal-switch-readback.json与formal-ui-readback.json分别证明采用和页面检查后状态；主库指针/收藏hash及目录身份保持，PID稳定。真实页面查到本轮原生会话，预览5条文本/0省略/0截断，保留最新决定。页面未向模型再发送。临时native验证服务45795已停止，正式服务保留。

## 开放范围与使用交接

正式迁移目标尚未登记，UI已明确提示先到伙伴配置登记程序/Home。首次实际迁移须预览再确认；“开始使用”核对文件并给接手材料，不自动运行启动命令、不把材料就绪标成原生已加载。

Hermes/OpenClaw旧会话适配仍未完成，MCP仅草稿不启用，原生长期记忆迁移不在已验证范围。正式搜索报告未扫描/损坏/不支持的范围；观察到Codex内部评审记录混入列表，尚未增加业务会话过滤，属于开放可用性问题，不能说所有搜索噪声已清理。自然任务/Claude/用户使用验收仍待完成。

输出：聊天outputs/智能体群真实验证记录.md、正式智能体群-接力验证.png；前者含非技术使用步骤、限制、记忆边界偏差与恢复说明。

唯一下一步：确认Hermes环境移除是否为用户当前决定；若是则保留现状，不以旧授权重装；若否，先只读核查当前入口与目录变化，再处理恢复范围。工作台当前版本可供用户查看，不能把当前Hermes不可用隐藏为全链路完成。

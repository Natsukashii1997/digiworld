# 原生 Codex REA 候选交回573

输入571→认领572→输出WB-20261020-573，Codex。用户明确授权开发，并确认“不要求同步同一个聊天；要求逆向分析能力、模型、规则和权限一致”。候选开发及相称验证完成，正式571未采用本轮变更。未提交、推送、安装/更新依赖或REA，未重启正式服务。

## 使用与结果

采用后在“逆向工程”投入获准分析的本机文件/目录或网站，选择Codex，填写与Codex聊天相同的工作目录，点“读取Codex设置”。模型、推理强度、服务等级、审批和文件权限可继承原生配置，也可明确选成与Codex相同的值。开始后可持续追问、补充当前轮、停止、答复原生审批/问题；选定一条回复即可保存为固定任务包，再使用原有任务包/Skill流程。

执行核心直接使用桌面捆绑Codex 0.163.0-alpha.10.2的app-server。PATH旧CLI 0.160.1不再充当Codex逆向执行器。直接加载安装中的REA Skill、原生MCP、所选目录规则与原生权限，不带旧五工具白名单、临时空目录、ignore-rules、严格JSON输出或单轮分析限时。真实工具名称对照170/170，missing/extra均为空。旧REA和Claude路径以及历史记录保留。

模型/规则/权限一致的条件是选择相同目录和有效设置；界面展示实际回执及指令来源。桌面某个现存聊天的临时上下文/专属动态UI能力不会自动复制，这不是同一个聊天。废弃multiAgentMode不提供假开关；协作行为由同版原生运行时/推理配置决定。并不宣称逐个执行验证了全部170工具。

## 实现和数据边界

- 新增server/codex-native-transport.mjs、server/reverse-native.mjs及src/ReverseNative.jsx、reverse-native-protocol.js、reverse-native.css；路由、输入目标和任务包schema做定点衔接，旧Codex受限入口明确导向原生路径。
- 原生历史由Codex管理；工作台只存所创建会话的关联、显示缓存及操作回执，位置是数据根/reverse-evidence/native/sessions.sqlite（目录0700/文件0600，不进入全量资产备份）。不枚举或读取用户其他聊天。
- 工作台主库只在用户确认保存任务包时写入固定版本，含来源session/thread/turn/item。自然语言Markdown可保存，不要求旧JSON结论。旧固定版本保留原语义。
- 原生审批按实际选项呈现，MCP记忆范围仅显示来件提供的“本会话/始终”，默认仅一次；可选问答可暂不回答。命令/文件权限、目标参数可见；答复等原生resolved。不能承接的宿主动态工具/设备认证明确报错，不假装批准。
- 操作ID持久化，未知不重放；创建/归档丢回执先回读。重连恢复同一线程及完整分页历史；旧快照不覆盖新输出。已知子任务归属、审批、状态和停止一并管理。切换旧执行器前断开闲置原生连接。

## 验证及固定证据

最终18文件清单：[candidate-final-manifest.json](../../../work/reverse-native572/candidate-final-manifest.json)，SHA256 `88349b05667132c737a0b03a76a4724686bbf14344f356da1592edb9f28428c8`。
限定本轮前像差异：[candidate-final.diff](../../../work/reverse-native572/candidate-final.diff)，SHA256 `2810bed4b5ef6356895a7be8ad5d8e1b40a364a0fe0d7e193ed14f3198ce4cd1`。旧同名无final清单为历史证据，勿用于最终验收。

最终全量1432/1432、定向21/21、隔离构建通过；新原生流程和旧REA/作品/固定Skill流程均三宽1440/390/320通过。原生三态WCAG检查、点击区和无整页横溢通过。双轴审查各致命0/重要0，T2 VISUAL_PASS。精确日志、修复及首败见[review.md](../../../work/reverse-native572/review.md)，19构建文件/12截图见[runtime-manifest.json](../../../work/reverse-native572/runtime-manifest.json)。

真实验证用自建无敏感Mach-O ARM64二进制，不运行它、不读私人目标。工作台原生REA打开目标，Codex在深度provider缺失后用原生shell读取符号，确认add_demo；第二轮续问完成。当前Codex直调同目标的格式/哈希及provider_unavailable一致。最终真实恢复170工具、15items、4消息、pending0通过。两次实际工具审批仅合成目标允许一次，未保存长期授权。

首轮全量的重复close错误已修。后续一次全量1431/1432遇到既有reverse-ai-process.test.mjs:46读取空PID竞态，已保存首败、清理明确归属的合成进程、单项复查1/1；最终全量1432/1432。不把最终绿灯解释成旧测试偶发性已经根治。

## 当前限制与正式运行

深度反编译provider（Ghidra/Hopper/IDA）本机未配置，真实search_procedures返回provider_unavailable；直接Codex相同。工具清单完整不等于所有可选引擎已经安装，未擅自安装。实际复杂软件/网站完整分析效果、常浩自然使用仍待验。

正式仍是`/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/wb-20261020-571`，5178 PID70562；进程及工作目录已回读。本轮候选只构建到work/reverse-native572/dist，未改正式dist、服务、随手记宿主或真实主库；原图片功能和既有dirty保留。开发HEAD仍为e6e5d8b74474ea408ebb171ab70415e32d57ada4。

Claude质量验收、常浩验收及正式采用尚未完成。依据COLLABORATION.md第6节，T2由Codex子代理完成不替代Claude角色。正式切换需单独明确授权并重新准备采用/回退检查；不要直接覆盖新数据，也不要重放测试真实模型轮次。

本轮写入权已释放。唯一下一步：接手者先读取CURRENT及本交接、核对固定清单，再按常浩当前授权串行认领；REA候选的正式采用状态保持待验收。

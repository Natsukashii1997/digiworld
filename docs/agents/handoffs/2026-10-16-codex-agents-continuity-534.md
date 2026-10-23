# 智能体群迁移与接力复刻候选交回534

输入WB-20261016-532；认领533；交回534。Codex串行开发，HEAD e6e5d8b74474ea408ebb171ab70415e32d57ada4未变，全部既有dirty保留，无提交推送。

## 用户目标与结果
用户在完成炉子定向取证后明确要求“复刻到我的数码宝贝世界的智能体群里”。优先解决找旧会话、整理上下文、交给另一个AI。已实现：Claude/Codex会话多关键词、源/项目筛选；12/40轮可编辑接力，原始请求、项目下一步、最新首尾/截取明示；Codex/Hermes CLI Home四类迁移（指令、独立记忆参考、完整独立Skill、连接草稿），预览/确认/逐项回读/持久查询/撤回。原角色与管理能力保留。

本轮是本地适配，不声称炉子原生底层字节克隆或所有Agent格式互转。记忆/连接未自动加载；连接无参数值/完整URL路径/凭据，不自动启用；指令跨作用域提示核验；Skill同名保留、不动共享池或链接，复制不等于目标加载。自动发送/云同步/Claude和OpenClaw写入/原生会话格式迁移未适配。

## 精确成果
- [任务契约](../../../work/agents533/contract.md)、[脏基线](../../../work/agents533/baseline.json)、[本轮精确diff](../../../work/agents533/changes.patch)。17源/测试文件见[最终清单](../../../work/agents533/final-manifest.json)。
- 清单SHA256 5f7cb14dfe5efd585b368693bc62a26fecda5d29f9ebea79ac2eff0e01ec4fec；候选work/agents533/candidate-dist，index SHA b52188f11f400c566862356e16273eed2e2d1e8e3cc365f989e64fddebb12432。
- 源涉及 AgentsV16/AgentMigration/RelayLaunch/relay-prompt/agents-v16.css；server agent-migration/agent-write/capabilities-http/relay-sessions/http；对应专项与两套浏览器及合成预览脚本。不改schema、依赖、全局样式、真实Agent或正式数据。
- [最终审查与验证记录](../../../work/agents533/reviews.md)、[六宽截图](../../../work/agents533/browser/)、[真实隔离文件回读](../../../work/agents533/real-ui-file-readback.json)、[保护回读](../../../work/agents533/protected-final.json)。
- 用户交付：/Users/nat/Documents/Codex/2026-10-16/jie-s/outputs/智能体群复刻-交付说明.md；合成预览 http://127.0.0.1:49951/#agents，启动脚本tests/agent-continuity-preview.mjs，终端会话32734。预览停止会清理其合成Home和数据，不影响正式数据；后续需重开时运行环境WORKBENCH_TEST_STATIC_ROOT指向候选目录。

## 验证
58/58专项；最终6宽新流程errors=[]；5宽原Agent回归PASS；构建PASS（既有大chunk提示）；Spec/Standards重要0；T2 VISUAL_PASS绑定同构建。根代理CUA真实HTTP+合成文件跑通4类迁移/指令与Skill撤回/历史查询，8项磁盘核验通过。最终预览已使用实际新接力builder。

首轮全量1342/1343，唯一既有reverse-ai-process空PID竞态，与530相同；单项复查1/1。首败与清理证据保留，不能称全量首次通过。最后边界修复以58专项+相关浏览器验证，未再跑全量。具体首败与修复见reviews.md。

## 当前采用与门禁
正式19文件dist与530前基线一致，5178 HTTP回读一致、PID29709未重启；530的9个源/测试文件逐项一致，528门禁保留。未读取/迁移真实Agent资料，无真实AI调用/安装/自启/外发/提交/推送。尚未验证真实Agent采用、真实会话接续、Claude质量与用户验收。

## 唯一下一步
Claude按COLLABORATION §6复核本候选（重点四类边界、接力实际可用性、最终截图和状态恢复），再确定与530/528候选的正式采用范围。当前源码包含530/528未采用内容，禁止整包盲覆盖正式dist。需要正式后端采用时另核范围及重启授权。已写共享状态；未发消息，不声称Claude已读取。Codex写入者释放。

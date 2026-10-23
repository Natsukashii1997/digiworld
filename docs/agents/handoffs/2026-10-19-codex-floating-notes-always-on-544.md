# 随手记悬浮球常驻启用544

输入WB-20261017-542，认领WB-20261019-543，输出 **WB-20261019-544**；执行者Codex，写入者释放。用户本轮明确要求“接手数码宝贝工作台，我要求随手记的悬浮球功能常态化打开”。按现在显示、登录自动出现、收起保留输入执行。此前528仅准备的边界已由本轮常驻启用请求推进；未代签Claude或用户验收。

## 当前结果与使用

- 桌面悬浮球已运行；CUA实际点击打开正式便签栏，随后回到仅球显示，并再次连续点球开关。打开时正式便签可读；没有编辑或新增真实便签。
- 点铅笔球展开，再点收起；输入停手约1秒显示“已保存”，与工作台随手记共用数据。收起保留内容。
- App：`/Users/nat/Applications/随手记.app`，固定526二进制SHA `2d2c8302325e4a4971806abb76aba8a06d3f55ad94d73e6353c8ee85231a5c91`，本地签名验证通过。
- 草稿区：`/Users/nat/Applications/FloatingNotesState`，目录0700、草稿0600；origin与dataRootIdentity绑定，保留原生同目录互斥。当前单实例PID 16327。
- 自启项：`/Users/nat/Library/LaunchAgents/local.digitalworld.floatingnotes.plist`。RunAtLoad=true；独立启动器先等待5178就绪；KeepAlive.SuccessfulExit=false、ThrottleInterval=10。已核对实际登记运行；实际注销重登、强杀/崩溃恢复未测试。
- 主动使用菜单“退出随手记”后，本次登录期间不会被配置强制拉起；下次登录仍自动启动。如需临时重新打开，在Finder中双击个人应用程序里的随手记。

## 正式采用与范围

旧正式539明确排除528。没有把526旧整包覆盖到当前系统，而从539冻结程序只集成15个随手记相关源文件，清单`work/floating543/integration.json`。其中HomeV16两处save新增显式base，防止首页恢复请求与悬浮球并发保存时被错误拒绝。其余539首页、侧栏、智能体成果保持。

正式入口：`/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/wb-20261019-543`，433程序文件与最终清单逐一匹配。依赖复用539现有依赖，没有安装/更新第三方包。服务label仍`cn.personal-ai-workbench.server`，当前PID 16205，端口5178，主库仍repo/data，dataRootIdentity保持。repo/dist继续是原旧程序静态包，不代表正式入口；后续不得直接重启混合dirty源码。

原生常驻启动脚本保存于`desktop/floating-notes/start-at-login.sh`并安装到Application Support/PersonalAIWorkbench/FloatingNotes；README已更新正式使用说明。本轮新改共享业务代码仅HomeV16两行及新增并发专项；其他notes源码为既有候选，本轮将其纳入正式冻结发布。

## 验证与首败

- 隔离候选构建成功；首次全量1377中1375通过、2项因隔离目录缺失合成文档/wiki.py支持路径失败。补齐测试支持后原两项所在8用例专项全通过，原全量失败日志保留，没有宣称一次全量1377/1377。
- 悬浮便签浏览器：自动保存、成功GET回读、慢保存、断线/初次离线恢复、同ID未知结果查询、冲突两条都留、窗口互斥及长中文通过。双窗口同步专项、原便签墙专项通过；原生编辑DOM专项8项通过。
- 独立审查发现首页重试的save基线遗漏，新增`tests/home-notes-floating-browser.mjs`在旧候选红（5秒等待清空失败）；两处修复后绿，两条合成便签各保留一次。最终构建首页17场景通过。
- 首页首次脚本默认指历史candidate-dist而超时；明确HOME_CANDIDATE_DIST=dist后通过。
- 一次误在repo目录构建，影响旧repo/dist；已从528备份恢复19文件，全部与539历史baseline formal_dist一致。正式服务当时使用独立539目录，未受影响。原错误构建和日志留档。隔离构建另遇只读依赖目录.vite-temp权限失败，改native config loader后成功，未写依赖。
- 切换时bootout成功、首个bootstrap返回5，脚本立即停。确认服务未登记、5178无监听后，只补缺失登记一次成功，没有重复注销或回滚主库。新服务notes随机不存在ID GET=200/note:null；9个可公开静态资源逐字节匹配。theme旧路由范围未扩展。
- CUA绑定App耗时约9分钟，之后球与便签栏操作正常。原生日志保留一条IMKCFRunLoopWakeUpReliable输入法端口诊断；没有据此宣称真实中文候选鼠标交互通过。

证据：`work/floating543`下`unit.log`、`stage-support-recheck.log`、`floating-browser.log`、`sync-browser.log`、`native-dom/results.json`、`notes-wall.log`、`home-note-red.log`/`home-note-green.log`、`home-final/results.json`、`independent-review.md`、`service-readback.json`、`final-native-readback.json`、`release-manifest.json`。最终manifest SHA `79a8d3c49d9267f89f6df8fe41983bf6dd52a28f1d9f9f91e54a8652dfec7f2c`。

## 数据与恢复

切换前刷新限定备份：`work/floating543/adoption-backup`，根0700并带目录本地ignore；含旧正式dist、原服务plist、revision216指针与匹配snapshot。备份后及原生操作后主库指纹保持，无真实便签增删改。原539冻结程序原位保留。没有读取无关凭据/私人Agent会话，也未改Vault、其他应用或Hermes。没有Git提交或推送。

必要回退先正常退出随手记并停用其登录项，保留草稿区原路径；恢复旧服务器plist/539程序后按当轮授权重新登记并回读。**程序回退不恢复旧主库指针，不删除草稿。** `adopt.py`是本次一次性实施记录，不能盲目重放。

## 仍未完成与唯一下一步

本轮常驻配置、运行采用和核心只读UI路径已闭合。实际注销重登、异常重启、真人自然输入与业务验收仍待验证；原全屏隐藏已知未通过、真实中文候选窗鼠标点击未验继续保留，不重新扩大快捷键/全屏实验。Claude视觉与常浩使用验收未代签。

唯一下一步：常浩正常使用悬浮球，在自然输入后确认“已保存”、收起重开及工作台同条可见；下次自然登录观察自启。无需为验收立即注销。Hermes环境移除的原待确认事项保留，不擅自恢复。

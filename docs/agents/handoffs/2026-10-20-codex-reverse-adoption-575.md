# 原生REA正式采用与实际验收575

输入573→认领574→输出WB-20261020-575，Codex。用户明确要求“完成正式切换和最终使用验收”，沿用已确认边界：不要求同步同一聊天，要求逆向分析能力、模型、规则与权限一致。本轮直接完成采用和实际操作验收，不沿用候选期的额外批准门禁。正式与实际验证已完成；未提交或推送。

## 当前正式状态与使用

正式目录：`/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/wb-20261020-575-r1`，5178/5179，PID22510。HTTP首页/JS/CSS与完整446文件清单匹配。最终JS为`index-D_F-45Ms.js`，CSS为`index-5HwW-a8f.css`。原随手记程序、草稿、图片、自启及9个浏览器扩展保持。

使用入口：数码世界→逆向工程→投入参照物→执行器选Codex→填写与直接Codex相同的工作目录→读取Codex设置→开始分析。可继续追问、答复原生授权、停止和重连；选定回复可保存为原有固定任务包。旧REA执行器仍是旧流程，全能力入口是Codex。

工作台使用桌面捆绑Codex `0.163.0-alpha.10.2`、安装中的REA `6.4.0`与Skill v37。正式后台原PATH缺少REA启动命令，已在本服务LaunchAgent补齐经过对照的稳定命令路径；没有复制凭据、临时Codex路径或加载整个shell配置，没有改全局Codex配置或安装引擎。

## 一致性与实际验收

以相同工作目录的独立新Codex会话为基准，模型/provider、推理强度、服务等级、审批/沙箱/处理方、规则来源及哈希、Skill路径及哈希均一致。实际基准是`gpt-6-astra / ultra / default / on-request / dangerFullAccess`。170项工具名称与完整参数合同结构相等；规范化SHA256为`e26c1173a97f9f4c02998b94d8fad0e5031e3a2e42e53cb881eb76d5f963e9f3`。

在用户实际“数码世界”Safari WebApp中完成：

1. 新建“验收 · 原生 REA 全能力 · 自建样本”，只分析自编Mach-O，不运行样本。
2. 实际读取Codex设置；open_binary→inspect_macho→close_binary，每次仅允许本次。
3. 直接REA调用同一样本，文件身份、provider、完整结构化结果及局限说明与工作台完全相等。
4. 同一会话继续追问，第二轮形成任务包；预览后确认保存，原文、哈希及session/thread/turn/item来源均对应。
5. 断开、刷新、重连；同一线程、19项记录、两轮输入均保留，无模型请求重放，任务包仍为1版。
6. 修正版正式加载后，再验证预览标题、关闭按钮与Escape取消；未重复保存。再次重连后idle/pending0，可继续使用。

记录ID `aab686d1-e3af-4b22-9536-659c83a8d264`；线程`01a15867-68a0-7a72-85ae-3a50e8ddf121`。主库revision693→695，仅新增该验收记录与固定包；原2条业务记录逐对象相等，其余主库字段、随手记图片及草稿均保持。侧库仅1条本工作台会话，无pending/submitted/unknown操作，权限0700/0600。

## 最后发现的问题与修正

正式截图发现任务包预览头部被工作台顶栏遮住。隔离命中测试复现：标题中心实际命中topbar-search。只将ReverseNative的预览通过Portal挂到body，保留v14/native-session样式上下文；未修改共享Dialog、全局样式、分析权限或保存逻辑。

新增三宽1466/390/320验证：标题与关闭按钮真实命中、关闭/Escape不写入、重新打开保存一次、打开态无横向溢出、axe均通过。独立静态审查无阻断；候选三宽及最终正式Safari截图T2均VISUAL_PASS，重要问题已闭环。

本轮先从571采用575一次；发现实际问题后，再进行575→575-r1必要纠正一次。两次各有独立备份、单次stop/start回执及回读，不能表述为全轮仅重启一次。锁屏阻断期间未绕过控制限制；用户明确“已解锁，可以继续”后完成正式窗口复验。最后无必要待办。

## 固定证据与恢复边界

证据目录：`work/reverse-adoption574/`。

- `final-source-manifest.json`：最终19项源文件，SHA256 `c1daf87e03437a73e72377d38efdab4a530bb482a0165a05b2836a2ced099bd1`。
- `fix-release-manifest.json`：最终446项运行文件，SHA256 `11639b32e89ff849211784ef267008544cc7bd0f13ed1580f9238f70d5a92562`。
- `acceptance-final.json`：最终33/33回读核验；`formal-after-fix.json`为真实会话与任务包完整回读。
- `env-parity-final.json`、`direct-schema/`、`corrected-schema/`：同环境设置与170合同；`direct-rea-result.json`和`formal-direct-parity.json`：相同样本实证。
- `fix-service-readback.json`：最终PID/目录/HTTP/数据身份；`dialog-final/`及`ui/formal-fixed-preview.png`：最终三宽和实际宿主。
- `review.md`、`verification-notes.md`：独立审查、首败、修复与验收边界。原始环境失败、未规范化schema哈希差异及测试初态错误均保留。

573完整1432/1432、定向21/21及原有新旧三宽证据继续有效于未改部分；本轮仅改一处预览挂载并运行相称的新增浏览器回归，不声称重新执行了全量1432。

原备份`private-adoption-backup`与纠正前备份`private-fix-backup`均为私有目录。已经存在local目标及nativeSource固定包，不能直接降级571，不能用旧CURRENT覆盖新数据；需要恢复时先检查兼容性和实时变更，优先向前修复。575与575-r1后端schema相同。

## 结论边界

同目录、同设置下，工作台已复用同一套Codex/REA执行能力，记录和任务包管理保留。现存桌面聊天的历史、临时模型/权限覆盖及宿主专属动态UI工具不会自动复制，用户已明确不要求同聊天同步。

170项工具合同对齐不等于170种场景逐项运行。可选深度反编译provider仍未安装，直接Codex同样受限；未擅自安装。代表样本的实际使用验收完成，不保证模型每次措辞相同，不替代用户自然使用与复杂真实目标的业务效果验收。

写入权释放。唯一下一步：用户按上述入口自然使用；后续问题以实际记录和当前CURRENT重新认领，不重放验收模型调用。

# Ghidra安装与双端实际验收577

输入WB-20261020-575→认领576→输出577，Codex。常浩在确认“Ghidra12.1.4+ARM64 JDK21、两边共用、真实反编译验收”方案后明确授权“你来完成”。安装、配置与实际验证已完成，写入权释放。未改产品代码，未提交或推送。

## 使用方法与生效范围

工作台→逆向工程→执行器选Codex，按原方式提交程序路径和分析要求；可明确说“使用Ghidra反编译”。不需要手工打开Ghidra界面。新分析会话会加载引擎。

安装前已经存活的REA进程不会热加载环境变量。工作台旧会话先空闲、断开，再重新连接；直接Codex旧聊天需要重新连接REA或使用新会话。本轮已在正式工作台新会话及桌面同版Codex的新原生引擎会话中实际验证，不把当前母聊天的旧MCP进程视为已更新。

本次只补Ghidra原生反编译能力；Hopper/IDA仍未安装，不代表所有语言、平台和目标都已经逐项验收。

## 安装与配置

- Ghidra12.1.4：`/Users/nat/.local/share/rea-engines/ghidra_12.1.4_PUBLIC`
- Temurin21.0.12.1+1 ARM64完整JDK：`/Users/nat/.local/share/rea-engines/jdk-21.0.12.1+1/Contents/Home`
- 两个官方发行包的大小和SHA256均与官方资产/校验文件一致，详见`work/rea-ghidra576/install-plan.json`。
- Ghidra发行包缺少Mac ARM64原生反编译器。使用既有Xcode工具、make/bison，在本安装目录编译`ghidra_opt`；显式ARM64，去除过时macOS10.6最低版本标志。无Rosetta、Gradle、Homebrew变更或Gatekeeper调整。
- 原生`decompile` SHA256：`0bc01f009db2ca184011ce65f6b27f1469d0a3eda504e49e6055dc5865bb014b`。
- `/Users/nat/.codex/config.toml`仅新增`mcp_servers.rea.env.GHIDRA_INSTALL_DIR`和`JAVA_HOME`。REA仍6.4.0、Skill仍v37；模型、权限及其他解析配置逐对象保持。
- 配置变更后SHA256：`db269205527999d3c9d07b3eed1177b61728221be88e3777583162e97d8db9a8`。原配置以0700目录/0600文件备份至`work/rea-ghidra576/private-config-backup/`，已设置gitignore；不要输出备份正文。

未覆盖系统Java，未创建全局命令链接，未安装或升级Skill。工作台正式版本仍575-r1/PID22510，服务和LaunchAgent未重启或改写。

## 实际结果

两个新的原生Codex会话使用同一工作目录与完全相同的有效设置：gpt-6-astra/ultra/default、on-request/user/dangerFullAccess、相同规则来源。分别完成：

`open_binary(provider_id=ghidra) → search_procedures → procedure_pseudo_code → close_binary`

每端恰好四个REA调用，全部completed且error=null。只允许本次open/close，没有持久化授权。未运行样本、读取样本源码、调用替代引擎或派生子代理。

两端四项完整结构化工具结果逐对象一致：

- provider：Ghidra12.1.4。
- 样本：既有自建Mach-O ARM64 `work/reverse-native572/fixture-bin`，SHA256 `c278fe42bd21d1c6bf74fe385b5b8690f8d6a72bd8f106af02a9010333f6ddae`。
- 函数：`_add_demo`，地址`0x100000328`。
- 实际伪代码：`int _add_demo(int param_1,int param_2) { return param_1 + param_2; }`。
- Evidence：`ev_bd832fa125154629d856580436a48a3de8dbff64914ebdfce8ca084c4899d582`。

直接端线程`01a15889-87c8-7520-a720-8df2f8c26ff8`；工作台线程`01a15889-fb4e-7a20-b308-0b482ca8f60e`、会话`6ec2a35e-e232-4866-812a-5a81ac5b23ff`。工作台沿用明确的合成验收记录，没有新增业务记录或保存新任务包。主库revision仍695，整个workspace及原记录、包、其他字段哈希全部不变。仅原生分析侧库增加本次验收会话。

工作台最终idle/pending0/errornull；两个目标均关闭，没有Ghidra进程残留。真实Safari WebApp已操作并看到伪代码，截图为`work/rea-ghidra576/formal-pseudocode-visible.png`。

独立只读审查确认配置范围、实际文件哈希、双方原始工具结果、设置与数据保持均通过。最终`acceptance.json`为32/32。没有产品代码变化，因此没有重复跑无关产品全量测试。

## 诊断与证据

证据根：`work/rea-ghidra576/`。

- `doctor-before-config.json`：Ghidra明确范围全部健康。总体环境中的其他引擎/其他客户端缺失不属于本次安装范围。
- `direct-native/`：本次直接原生引擎设置、四步工具原始结果及最终历史。
- `formal-before.json`、`formal-final.json`：仅合成验收记录/会话正文及主库保护哈希。
- `tool-parity.json`、`acceptance.json`：结果对照与最终回读。
- `config-change.json`、`native-build-result.json`、`java-verification.json`：安装/配置身份。
- `independent-review.json`、`final-independent-review.json`：审查对象与结果。

模型工具发现入口曾返回`unsupported call: tool_search.tool_search_tool`，随后通过当前可用工具清单完成全部四个真实REA调用；保留该诊断，不把发现入口失败等同于反编译引擎失败，也未为它改变规则或版本。

## 恢复与下一步

唯一下一步：正常使用。旧会话按上面的重连方式加载。

若未来确需撤销，先检查当前配置有无后续修改，只移除本次两个引擎环境键；不能直接用整份旧配置覆盖新配置。引擎安装彼此独立，不涉及业务库回滚。下载文件与安装清单保留供核验，不自动升级或删除。

本次证明指定代表样本的真实静态反编译及两端一致；反编译结果是恢复的伪代码，不是原始源码，也不把该样本通过推断为任意复杂程序的分析效果。

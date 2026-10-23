# Codex497 · 495返修 R4 / R5 交回

495 → Codex认领496 → 497。**R4/R5候选实现与工程验证完成，待Claude仅复验R4/R5并做一次最终组合真实Codex冒烟。** 未正式采用、未重启5178；Claude Code真实验证仍暂缓。

## 变更与使用

R4：外层macOS沙箱允许本次run、所选AI状态（Codex的`~/.codex`，Claude的`~/.claude`及`~/.claude.json`）与REA的`~/.npm`。配置`config.toml`/`settings.json`及状态目录下worktrees显式拒写；目标、其他项目与其他工作台数据仍拒写。没有调整REA注册或登录配置。

补齐状态目录符号链接、配置符号/多硬链接、目标与可写状态/cache/run重叠的启动拒绝；配置追加、截断、删除、替换、建硬链接，以及缺省配置创建均实测拒绝。runner传入原始目标路径，避免只检查解包后的asar。

真实生产路径额外暴露两项R4阻断，已闭环：

- REA调用的Swift临时目录实现把UTF-8字节转成Int8，工作台中文路径触发trap。使用临时ASCII符号链接指向同一run，TMPDIR和Swift模块缓存指向链接路径；没有新增可写范围，结束清理链接。真实Swift合成编译已通过。
- macOS沙箱拒绝系统带setuid的`/bin/ps`，导致REA清理错误。本次run内复制ps、移除提权位、临时签名并前置PATH；bin拒写，仍受原沙箱限制。没有修改系统ps、没有进程免沙箱规则。真实进程查询和禁止篡改helper的测试通过，最终REA完整exit0。

R5：`src/brands/codex.png`改为蓝紫花瓣/白色终端符号的Codex应用原图，来自本机`/Applications/ChatGPT.app/Contents/Resources/icon-codex-dark-color.png`，本地静态加载、名称仍Codex。来源及限制见[图标来源](../../../src/brands/SOURCES.md)：PNG与包内封存SHA一致，但整包严格验签失败，不宣称整包验签通过；495没有原始参照截图，不宣称逐像素匹配。未重绘、未改应用包或Claude图标。

无需新增安装。正式采用后在“逆向工程→软件标本→Codex→开始逆推”使用；看到结论/证据/任务包表示分析结果通过校验，仍不代表复刻完成。启动失败会保留旧包；若提示目录身份或目标重叠，选择状态/cache之外的目标。本轮只是候选，当前5178尚未采用这些改动。

## 冻结范围与回读

[manifest.json](../../../work/reverse496/manifest.json) SHA256 **cdf2fecd5f00672332da02fa3504a7ff99e9e0a4212f1b0944cbdf8beed8d677**：8本轮修改、24完整AI候选源、5 R3继承、19候选构建。24+5+19共48项无漂移。

8项：REVERSE-RECIPE.md、server/reverse-ai-process.mjs、server/reverse-runner.mjs、src/brands/codex.png、src/brands/SOURCES.md、tests/fake-ai.mjs、tests/reverse-ai-process.test.mjs、tests/reverse-ai-runner.test.mjs。

[相对495实际dirty前像的差异](../../../work/reverse496/changes.diff) SHA256 `2040adf8beb0597062209af8a32fac65b3d0d8e329cbc7ff84c3aa87d4d073f4`；[基线](../../../work/reverse496/baseline.json)、[保全终核](../../../work/reverse496/protection-check.json)。862基线无丢失/范围外变化，正式17文件dist不变，5178仍PID55062；HEAD仍e6e5d8b74474ea408ebb171ab70415e32d57ada4。原收藏插件/页面等dirty完整保留。合成目标SHA/mtime与真实Codex配置inode/size/mtime未变，未读取配置正文。无提交、推送、安装或更新工具。

## 工程与视觉验证

- [最终全量](../../../work/reverse496/unit-release.log)：`node --test --test-concurrency=4 tests/*.test.mjs`，**1302/1302**。
- [最终专项](../../../work/reverse496/targeted-final3.log)：AI process/runner/launch **21/21**；包含真实macOS拒写、Swift编译、ps查询及普通Node子孙进程停止。
- [最终三宽浏览器](../../../work/reverse496/browser-release.log)：1440/390/320菜单键盘/焦点/44px/默认记忆、运行/成功/失败/停止、证据/复制/Skill/切版均通过。隔离数据，候选构建位于work/reverse496/candidate-dist；[构建日志](../../../work/reverse496/build.log)只有既有chunk体积提示。
- [Spec/Standards/T2](../../../work/reverse496/review.md)：两轴0未关闭；T2 VISUAL_PASS，绑定最终清单及相同前端字节；[三宽前后对照](../../../work/reverse496/report.html)。不代签Claude或常浩验收。
- 首败保留：unit.log中原默认高并发执行的controlled-execution短轮询超时1项；单独复验11/11（controlled-recheck.log），最终限并发4全量通过，未改范围外实现。sandbox/config-link/target-overlap/swift/ps的red日志与修复后green日志均保留，不用最终绿灯覆盖首败。

## 真实Codex与REA：证据分层

实际Node为WorkbenchServer.app内Node，启动PATH `/usr/bin:/bin`，解析到Codex0.160.1，REA为已安装6.4.0。完整argv/提示词/结果各在下述目录，不改命令行注册配置。

| 运行 | 事实与限制 | 参数与结果 |
|---|---|---|
| Codex第一次，258.220秒 | 状态/cache阻断解除，MCP初始化成功；REA在中文TMPDIR触发Swift trap；最终引用失败工具的证据被严格校验拒绝，未采用结果 | [参数](../../../work/reverse496/real-codex/parameters.json) / [结果](../../../work/reverse496/real-codex/result.json) |
| Codex第二次，365.391秒 | Swift路径已修；实际REA取证，最终严格结果校验通过：8结论、6未知、4314字符任务包。但首个analyze工具有cleanup_incomplete，后续inspect/trace成功；**不能称无异常端到端通过** | [参数](../../../work/reverse496/real-codex-final/parameters.json) / [结果](../../../work/reverse496/real-codex-final/result.json) |
| 最终ps修复后，真实REA直接调用 | 同一最终生产隔离适配器/目录策略、同一合成夹具；实际6.4.0 analyze完整exit0，440437 bytes，cleanupError=false。此项不调用模型，不能代替最终组合Codex复验 | [结果](../../../work/reverse496/rea-local-final/cwd/probe-result.json) / [日志](../../../work/reverse496/rea-local-final.log) |

最终真实REA证据 `ev_6e5ef491c3a39e6244b1a2ec7bad1d5d1336930b273df301e22f3c9898e6367d`，夹具digest `944a53688f851c24a63bfc614a67cee2bd7ab359f8b6fa3f1865e48d2b6c5df1`。原始输出在rea-local-final/cwd/rea.json，扩展名虽是json，实际为REA默认TOON文本；probe包装器没有AI协议完成事件而拒收是预期，不是REA失败。两次Codex的原始events/stderr留各自run目录。

模型额度：第一次输入238186（缓存204928）/输出4788；第二次输入546445（缓存494336）/输出7884；合计输入784631（缓存699264）/输出12672 tokens。CLI未提供金额。没有调用第三次Codex或真实Claude Code，没有分析真实用户软件。

## 未完成与唯一下一步

Claude按495只复验R4/R5，对最终清单做一次真实Codex+REA合成冒烟；重点确认全链路无Swift/ps清理错误、结果证据合法、夹具与配置仍不变。Claude Code真实验证暂缓。普通Node进程组停止已测，但Swift独立进程组在编译中取消未验证，作为后续真实取消覆盖项保留，不宣称任意子进程停止已验证。

Claude复验通过后再由常浩授权正式采用及5178一次重启。没有向另一个客户端发送消息或代签读取回执；交接和CURRENT写后回读完成再释放写入者。

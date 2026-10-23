# Codex491 · R3与487只读AI逆推候选交回

输入487 → R3认领488/交回489 → AI派单认领490 → 本交接491。当前写入者释放为无；待Claude读取，不声称已经接手。

## 结果与使用

R3可执行定位已完成，详见[489交接](2026-10-14-codex-reverse-r3-489.md)。487实现完成：软件标本终端右侧可选择Codex（默认）、Claude Code、仅REA，记住选择；开始前提示额度和只读。AI通过本机已注册REA取证，短日志实时显示工具/证据，结束显示实际提供的token/费用。严格JSON返回观察/推断、证据编号、未知项和任务包；空未知项不显示。作品流程不变。

无需新增安装。正式采用后：逆向工程→选软件标本→选执行器→点“开始逆推”；看到完成、结论及任务包代表本轮分析已校验，仍未经复刻验证。可复制或预览后存固定Skill；版本菜单切回旧包，复制/Skill随选中版本。停止结束进程组；未登录/额度/缺工具/格式失败显示原因并保留旧包，不要求用户读代码排错。

成功包最多8项，覆盖时优先保留刚被替换的前版；REA包自带摘要，不依赖最近8条运行。固定Skill回执独立保留、不可覆盖，引用阻止资产删除。确认与切版并发时校验预览版本，写后按同一版本回读。失败、中断和未知结果不重放。

## 实现与冻结范围

- `server/reverse-ai-process.mjs`：两CLI协议、严格只读参数、外层macOS整树写隔离、短事件/用量/错误、原始流与进程组停止；`src/reverse-ai.js`：严格结果校验与活动版本。
- `server/reverse-runner.mjs`：REA/AI/更新共享锁，AI默认30分钟，重启中断，SHA与旧证据输入，成功结果/版本原子入链及受控切版API。
- `server/reverse-schema.mjs`、`schema.mjs`、`reverse-skill-v4.mjs`、`asset-delete.mjs`、`http.mjs`：字段白名单、不可变版本/固定Skill、引用保护及接口。
- `src/ReverseExecutor.jsx`、`ReverseV16.jsx`、`reverse-v4.js/css`、两枚官方PNG；`REVERSE-RECIPE.md`记录“仅逆向页可直接调用AI只读分析”的例外。测试均为隔离合成，不读真实用户材料。

[冻结清单](../../../work/reverse490/manifest.json)包含23项本段源变更、19候选构建以及5项R3继承；SHA256 **d8230cb57cab14ebcd9748f66868f56c9dca55bd34745375e1719597caef8269**。
[实际dirty基线差异](../../../work/reverse490/changes.diff) SHA256 c0d3871fddb9212295e61ad02b2370f83df00c2619cc8bff21f8c52f7d3db9c3。
HEAD仍e6e5d8b74474ea408ebb171ab70415e32d57ada4，无提交/推送。

## 只读机制、命令与实测边界

实际Node宿主路径+精简PATH定位到Codex0.160.1及Claude Code2.1.285，外沙箱下`--version/--help`均exit0，见[探针](../../../work/reverse490/cli-help-probe.json)。Claude当前安装为原生可执行文件，纠正派单“依赖nvm node”的推定；仍复用R3解析并补充PATH。Codex提示无法创建PATH别名但help/version成功；真实执行是否需其他缓存写入仍须冒烟，不能据help推断模型可用。

最终argv全表与**真实合成子进程协议样例**见[cli-command-samples.json](../../../work/reverse490/cli-command-samples.json)，原始样例在`work/reverse490/event-samples/`。这些不是实际模型输出。

- Codex：`--no-daemon -a never`，仅覆盖已有rea的required/enabled_tools、history.persistence=none、运行目录log/sqlite、hooks=false、notify=[]；`exec --json --ephemeral --ignore-rules --sandbox read-only --skip-git-repo-check --color never -C <run>/cwd -`，任务走stdin。
- Claude：`-p --output-format stream-json --verbose --no-session-persistence --restricted --permission-mode dontAsk --permission-prompts none --tools Read --disable-slash-commands --no-chrome --settings '{"disableAllHooks":true}'`，allowedTools仅Read与下列五项REA；已有analysis目录仅以工作台内部证据子目录额外读取。
- 只放行`analyze_javascript_application / inspect_analysis_view / trace_application_feature / list_browser_targets / analyze_web_bundle`，比派单泛化的`mcp__rea__*`更窄。没有替换或注入MCP服务。
- 外层`/usr/bin/sandbox-exec`覆盖CLI与全部后代：deny file-write*，仅allow本次run子目录及`/dev/null`的file-write-data（标准I/O丢弃设备）；独立进程组、三路pipe。合成测试证明项目写入被拒绝、run写入成功、忽略TERM的孙进程仍被KILL。不支持此隔离的平台拒绝启动，不降级。
- 不由工作台读取/改写AI会话或配置；CLI自行使用已有注册和登录。临时/诊断目录重定向到run，若真实CLI刷新凭据或迁移缓存需写范围外，则明确失败，不开放HOME。
- 原始事件/stderr留reverse-evidence，64MiB总量、2MiB单行；不进主库/导出。终端2000行/200KiB，4096证据编号/1024工具调用有界。结论编号必须是本次成功REA输出里的64位ID，不猜补；“已验证”结论降推断，包过滤凭据。
- 输入带目标SHA、功能、线索与既有摘要/analysis路径/字节数。旧路径或旧ID不是新MCP会话句柄：只在同会话retained或64KiB内完整inline证据可有界复用；否则披露限制重新取证，不放宽写工具。网站沿独立调试Chrome/CDP约定。

参数依据：[Codex非交互](https://learn.chatgpt.com/docs/non-interactive-mode)、[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)、[MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)；[Claude CLI](https://code.claude.com/docs/en/cli-reference)、[dontAsk](https://code.claude.com/docs/en/permission-modes#allow-only-pre-approved-tools-with-dontask-mode)、[headless事件](https://code.claude.com/docs/en/headless)。REA复用边界另核已安装6.4.0公开工具合同，未运行真实REA。

## 官方图标

本地构建资源为`src/brands/codex.png`与`claude-code.png`，没有远端图片请求。

- Codex：[OpenAI发布页](https://marketplace.visualstudio.com/items?itemName=openai.chatgpt)，[原始PNG](https://openai.gallerycdn.vsassets.io/extensions/openai/chatgpt/26.51007.21434/1791508178385/Microsoft.VisualStudio.Services.Icons.Default)，385×385；SHA256 2ce1c57dd3b312417106a487815ab1235bddce17e1fa9b32a2f048bd71ee25d3。
- Claude Code：[Anthropic发布页](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code)，[原始PNG](https://anthropic.gallerycdn.vsassets.io/extensions/anthropic/claude-code/2.1.299/1791946281295/Microsoft.VisualStudio.Services.Icons.Default)，266×266；SHA256 7241633e5a39b44a947c7b9a821637f30d6e86716e7a8c847136d91f9c3f6ba1。

品牌资源版本不代表本机CLI版本。保留官方原图、比例与颜色，显示22px。

## 验证与限制

- [全量](../../../work/reverse490/unit-final.log)：**1295/1295**。命令`npm test`；[专项](../../../work/reverse490/targeted-final.log)：19/19。
- [三宽AI浏览器](../../../work/reverse490/browser-final.log)：1440/390/320菜单键盘、焦点返回、44px、图标实际解码、默认及记忆、运行/成功/失败/停止、证据、复制、Skill、空未知与版本回退通过。
- [原REA/作品/旧历史](../../../work/reverse490/browser-legacy.log)和[R1/R2](../../../work/reverse490/browser-repair.log)三宽回归通过。
- [前后与最终状态图](../../../work/reverse490/report.html)；[Spec/Standards/T2记录](../../../work/reverse490/review.md)：两轴0未关闭，T2 VISUAL_PASS。原菜单参照图未附，不声称像素比对；沿批准v4+487文字增量，未改主题或作品结构。
- [保护回读](../../../work/reverse490/protection.json)：851基线无丢失、范围外0变化，R3五项无漂移，正式dist与数据指针/收藏保持；5178仍PID55062。既有收藏485/插件修改完整保留。

**本轮未真实调用AI或REA，未部署候选、未重启5178。** R3后端也尚未被正式进程采用；线上原启动问题不能凭源码绿灯宣布已消失。无新增安装/配置/plist/外部写入；没有Claude或用户验收。

唯一下一步：Claude读CURRENT491与本交接，核对冻结后复验R3及487；按派单先征得常浩额度授权，再用473合成fixture各跑一次真实Codex/Claude Code，核对只读、REA工具事件、失败提示、结论与包回读。真实冒烟通过后再由常浩授权正式采用/重启；炉子网页版首次真实逆推另行验收。

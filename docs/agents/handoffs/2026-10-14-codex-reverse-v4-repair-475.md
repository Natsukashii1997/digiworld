# Codex 475 · 逆向v4 R1/R2返修交回

输入 `WB-20261014-473` → Codex认领474 → 输出 `WB-20261014-475`。按473限定返修完成，工程检查通过；已写入共享状态，待Claude读取并复验。5178未采用候选、未重启，未代签真人验收。

## 改动与结果

**R1：正常规模doctor不再被误判为下载失败。** `reverse-process`、runner注册版本读取与updater元数据读取统一8MiB有界解析；exit 1但合法JSON有identity时保留现有成功语义。新增≥72KiB、2MiB合成doctor，通过真实子进程适配覆盖runner的status/start和更新检查；超过8MiB、非法JSON、缺identity明确拒绝。未运行真实doctor、setup或更新。

**R2：终端保留过程信息，收起命令噪音。** 可见命令用短形式，完整实际argv留在“完整命令”折叠；源文件进度按真实REA的消息尾部 `(n/N)` 原地更新，不误用固定0/1字段；3000文件不刷3000行。每条命令的阶段独立，普通诊断或非法进度仍保留。Evidence ID显示ev_加12位，悬停显示完整值，点击/键盘打开完整ID弹窗并复制。摘要、任务包、Skill补JS文件数，旧记录缺此值显示“未记录”，不编造0。

日志过滤、完整证据值、200KiB/2000行边界与旧记录兼容保留。针对浏览器首败补齐运行中500ms轮询、折叠详情键盘焦点；复制失败提示在弹窗内，支持重试并返回焦点。

14项交付：`server/reverse-process.mjs`、`reverse-runner.mjs`、`reverse-json.mjs`、`reverse-schema.mjs`、`rea-update.mjs`；`src/ReverseV16.jsx`、`reverse-v4.js`、`reverse-v4.css`；`tests/fake-rea.mjs`、`reverse-runner.test.mjs`、`rea-update.test.mjs`、`reverse-v4.test.mjs`、新增`reverse-repair-browser.mjs`；`REVERSE-RECIPE.md`。精确边界以[冻结清单](/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/work/reverse474/final-manifest.json)及[相对473实际前像的diff](/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/work/reverse474/candidate.diff)为准。

## 验证

| 检查 | 结果与证据 |
|---|---|
| 最终全量单元 | 1279/1279，0失败；[最终日志](/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/work/reverse474/full-unit-verified.log) |
| 相关单元 | 42/42；[专项日志](/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/work/reverse474/related.log)（后续UI提示修复已由最终全量和浏览器覆盖） |
| 最终构建 | 成功，输出work/reverse474/dist；既有大chunk警告保留；[构建日志](/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/work/reverse474/build-final2.log) |
| R1/R2三宽浏览器 | 1440/390/320通过：大doctor、真实运行2/3→3/3、单行进度、短命令、完整ID键盘/复制/失败重试、完整argv折叠、刷新、44px/axe/无横向溢出；[最终专项](/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/work/reverse474/repair-browser-final2.log) |
| 原主流程三宽 | 任务包、复制、Skill、旧记录等通过；[最终主流程](/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/work/reverse474/main-browser-verified.log) |
| 双轴及T2 | Spec与Standards均0未关闭问题；T2 VISUAL_PASS；[精确快照复核](/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/work/reverse474/final-review.md) |

最终14源/17候选文件无漂移，清单SHA256：`5faa4dcd0fd2e1bd01c20f28194c0d6d5163f94b716db49d56ada3b8a64151c4`。测试使用临时库、隔离服务和合成REA进程；真实剪贴板未写入。更新UI浏览器本轮未重跑（UI未修改），更新check路径已由真实子进程适配加合成doctor覆盖。

可复跑命令（项目目录）：
```sh
node --test --test-concurrency=1 tests/*.test.mjs
WORKBENCH_TEST_STATIC_ROOT="$PWD/work/reverse474/dist" node tests/reverse-repair-browser.mjs
WORKBENCH_TEST_STATIC_ROOT="$PWD/work/reverse474/dist" node tests/reverse-v4-browser.mjs
```

首败保留：`r1-red.log`的大doctor拒绝、`r2-red.log`的逐行刷屏；`repair-browser.log`的运行中轮询错过、`repair-browser-verified.log`的详情滚动区焦点；审查发现的复制错误被弹窗遮挡已修复。最终三宽证据见[前后对照与使用说明](/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/work/reverse474/report.html)。details截图带复制成功toast，1440局部挡住首行，这是已知截图限制；完整命令DOM已核对。

## 保护与运行边界

- HEAD仍为`e6e5d8b74474ea408ebb171ab70415e32d57ada4`，既有dirty未回滚；上次完整保护扫描55718项无丢失。正式dist与data/CURRENT.json终核一致。正式5178仍PID50894，本轮无重启/采用。
- `browser-extension/collection/content.js`有另一项深色胶囊按钮修改，用户明确回复“是，保留另一项修改”；原样保留，不计入本轮14项交付。
- 最后回读发现正式收藏库已推进至revision70，5条有效/5条回收；最近操作时间2026-10-14 11:18:49 CST、status complete。它在本轮终核期间发生运行期变化，本轮仅只读核对并保留；**不再声称collection/state.json与基线逐字节一致**，也不把这条并行导入记为本轮成果。证据仅存哈希、数量与时间，不复制正文。
- [保护与并行变动记录](/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/work/reverse474/protection-final.json)保留原始outsideAllowed观测，未把它改写为“零范围外变化”。未执行真实REA、setup、网络更新、Agent配置写入、安装、提交、推送或正式库写入。

## 使用与交接

无需新增安装。候选正式采用后，在逆向页查看本机注册版本，添加已授权目标并开始；应看到短命令和同一行进度，结束后摘要含“JS文件”。悬停/点击证据短ID可看全文，打开“完整命令”可查实际argv。复制失败会在弹窗中明确提示，可重试。候选目前未进入5178，不要以正式页面仍为旧版判断本返修是否失败。

**唯一下一步：Claude只复验R1/R2，并按473对合成迷你Electron夹具做一次真实REA冒烟。** 不重审全部v4；复验通过后由常浩授权正式采用和首次真实目标取证。GET464、按钮466、文稿441既有待验仍独立保留。此交接只写入共享文件，未向外部Claude会话发送消息，也不代表Claude已读。

# 逆向 v4 · 段 3 交接 470

输入 WB-20261014-469 → 输出 WB-20261014-470。Codex 完成段 3，继续持笔整理最终交接；未正式采用。

## 实际交付

- 点击检查才请求 GitHub 正式 Release 与官方 npm 同版本；不存在同版本提示发布同步中。版本固定到预演结果，不使用 latest；当前版本以两个客户端 doctor 注册为准。
- 预演固定版本 setup --client claude_code --client codex --dry-run，并单独读取候选 doctor 的 Skill 版本。白名单投影配置/Skill 目标路径和工具提供的备份位置；不把既有备份说成本次新备份，也不承诺工具未提供的备份。
- 适配检查覆盖本轮使用的 7 CLI 与 5 MCP 工具及具体参数。MCP 只 initialize/notifications/initialized/tools/list，不执行 tools/call；未知 JSON Schema 验证约束保守拦下。
- 确认前重做同版本预演/适配，绑定计划哈希、数据目录身份与 5 分钟有效期；最终写入前再次检查过期。运行器与更新互斥，用户确认后才 --yes。
- 写前持久化 writing；两个客户端及预期 Skill 版本 doctor 对齐才 succeeded。写失败/回读不一致/未知不能重放，查询仅 doctor；刷新及服务重启保留结果，成功确认幂等。更新记录 data/rea-updates/state.json 随完整备份保存，换目录身份禁止重放。
- 页头本机版本读数与更新对话框接入全部状态。Dialog portal 到 body，避免被页头隔离层/背景遮挡；规则仅作用于 .rea-update。

关键文件：server/rea-update.mjs、server/rea-compat.mjs、server/reverse-process.mjs、server/reverse-runner.mjs、server/http.mjs、src/ReaUpdate.jsx、src/reverse-v4.css；测试与契约清单见 work/reverse467/final-manifest.json。

## 验证

- 更新单元 12 项 + v4 领域 8 项：final-targeted.log 20/20；全量串行 final-full-unit-verified.log 1273/1273；令牌 final-style-verified.log 4/4。
- final-update-browser-verified.log：1440/390/320 三宽 × 成功/网络失败/发布同步/适配失败/写失败/回读不一致，共 18 个流程；含预演、确认、回读、刷新和不重放。21 图在 stage3-ui/。几何、axe、44px、控件中心遮挡检查通过。
- final-flow-browser-verified.log：最终同构建软件/作品完整流程、任务包复制、Skill、旧数据兼容三宽通过，30 图在 final-ui/。
- final-build.log：隔离构建成功；既有大 chunk 提醒保留。最终 31 源文件/17 构建无漂移；清单 SHA256：4ae1ba29ba53d30662e2bb155c4bd9f6f9d7d55076b0c09243661133d6ed4918。
- code-review 双轴各 0 未关闭问题；T2 VISUAL_PASS。最终审查范围/缺陷关闭/实际 UI 点击见 final-review.md。

重现命令（项目目录，均合成适配器）：
```sh
node --test --test-concurrency=1 tests/*.test.mjs
node --test tests/design-tokens.test.mjs
node --test tests/rea-update.test.mjs tests/reverse-v4.test.mjs
npm run build -- --outDir work/reverse467/stage3-dist
WORKBENCH_TEST_STATIC_ROOT="$PWD/work/reverse467/stage3-dist" node tests/rea-update-browser.mjs
WORKBENCH_TEST_STATIC_ROOT="$PWD/work/reverse467/stage3-dist" REVERSE_V4_SCREENSHOTS=work/reverse467/final-ui node tests/reverse-v4-browser.mjs
```

首败保留：stage3-unit.log 的预期错误文本与更严格路径校验不一致，修正夹具；stage3-related.log 暴露测试在落盘后、锁释放前返回，改为等待公开 busy=false/persistencePending，未更改业务实现；首轮 T2 遮挡修复并补命中检查；final-style.log 测试文件名误写，实际 design-tokens.test.mjs 已通过。SKILL 正文摘要和 CSS 作用域审查项已修。相关复验日志均保留，不将后续通过冒充首轮全绿。

## 使用与边界

采用后在逆向页点“检查更新”→“一键更新”→核对计划/备份/适配→“确认更新”；出现两客户端及 Skill 已对齐提示才算本轮更新成功，然后重启各 Agent 客户端。未知或失败只点“查询结果”，按明确备份位置处理，不能反复确认。进入页面不会在线检查。

本轮未运行真实 REA/doctor/setup、未实际联网更新或安装、未写真实 Agent 配置/私有资料、未采用或重启 5178、未提交推送。所有验证使用假 REA/假网络/隔离目录；正式服务仍 PID 50894，正式 dist 和主库/收藏指针保持。备份不含 REA 原始 analysis.json，保留有界摘要/日志；详见契约与设置说明。

下一步：总交接后释放，唯一下一步为“Claude 验收逆向 v4”。正式采用/重启、首次小型 Electron 真实取证另需常浩明确授权。GET464/按钮466/441待验独立保留。

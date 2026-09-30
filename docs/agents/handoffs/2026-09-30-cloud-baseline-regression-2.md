# 2026-09-30 云端基线回归 · 第 2 次（Claude Code 云端会话，定时任务）

> 云端工作副本结果，非权威。本次只测不修：未修改任何源码、测试、`package.json`/`package-lock.json`、配置、既有文档或 CURRENT.md。本分支只新增本文件及 `cloud-baseline-regression-2-logs/` 下的纯文本日志。按任务要求未开 PR。上次报告见分支 `origin/cloud/2026-09-30-baseline-regression`，本次只用 `git show` 读取，没有合并。

## 结论速览

| 项 | 结果 |
|---|---|
| 基点提交 | `main @ 2069c810715cadba542793744cbfa0470500e300`（上次为 `0d596f4`） |
| 环境变量 `PLAYWRIGHT_MODULE=playwright` | **生效**（会话内 `echo` 可见） |
| 自定义网络放行 `cdn.playwright.dev` | **生效**：chromium v1234 与 headless shell v1234 均下载成功 |
| 启动脚本 | **只部分生效**：`nvm install 24` 执行了（`/opt/nvm/versions/node/v24.21.0` 在 07:53:36 生成），但会话里的 Node 仍是 22；`node_modules`、`dist`、chromium-1234 都不存在，说明 `npm ci` / `playwright install` / `build` 没有在仓库里生效。原因见 §1.2 |
| `npm test` | **exit 124（外层 `timeout 1200` 截止）**：tests 426 / pass 401 / **fail 19** / cancelled 1 / skipped 5。19 个失败与上次**逐条相同**（新增 0，消失 0）；cancelled 1 是 `rule-templates.test.mjs` 整个文件，它和上次一样挂起 |
| 浏览器脚本 | **首次 23/28 通过**；5 个失败的脚本各重跑 1 次，**仍 0/5 通过**，错误特征与首次一致 |
| `tests/visual.mjs` | 未执行（按任务要求） |

## 1. 环境核对（日志 `01-environment.txt`、`01c-setup-script-evidence.txt`、`01d-init-script-log.txt`）

### 1.1 会话开始时的原始状态（未做任何补救前）

| 命令 | 退出码 | 耗时 | 结果 |
|---|---|---|---|
| `git rev-parse HEAD` | 0 | <0.01s | `2069c810715cadba542793744cbfa0470500e300` |
| `node -v` | 0 | <0.01s | **v22.22.2** |
| `which node` | 0 | <0.01s | `/opt/node22/bin/node` |
| `npm -v` | 0 | 0.13s | 10.9.7 |
| `echo $PLAYWRIGHT_MODULE` | 0 | <0.01s | `playwright` ✅ |
| `echo $PLAYWRIGHT_BROWSERS_PATH` | 0 | <0.01s | `/opt/pw-browsers` |
| `ls dist` | 2 | <0.01s | 不存在 |
| `ls $PLAYWRIGHT_BROWSERS_PATH` | 0 | <0.01s | 只有 `chromium`（软链到 1194）、`chromium-1194`、`chromium_headless_shell-1194`、`ffmpeg-1011`，**没有 1234** |
| `ls ~/.cache/ms-playwright` | 2 | <0.01s | 不存在 |
| `ls node_modules` | 2 | <0.01s | 不存在 |
| `ls /opt/nvm/versions/node` | 0 | <0.01s | `v24.21.0`（目录时间 07:53:36，会话容器启动于约 07:53:25） |
| `whoami` | 0 | <0.01s | root |

### 1.2 启动脚本为什么只部分生效（证据来自 `/tmp/environment-manager.out`，已过滤，只保留时间与工作目录）

- 07:53:32 开始运行 init script（长度 378 字节），07:53:37 报告 “Successfully executed init script”，**总共约 5.8 秒**。本次在会话里手动执行的 `npm ci`（6.0s）、`playwright install --with-deps`（31.6s）、`build`（3.1s）加起来超过 40 秒，5.8 秒只够完成 `nvm install 24`（上次实测约 5 秒）。
- 环境管理器的日志写着 `Set working directory from environment config … working_dir: /home/user`，Claude Code 本身则运行在 `/home/user/personal-ai-workbench`。**推测**启动脚本的工作目录是 `/home/user`，那里没有 `package.json`，于是 `npm ci`、`npx playwright install`、`npm run build` 都失败了。脚本没有 `set -e`，最后仍然被报告为“成功”。**未验证**：init script 的逐条输出不在这个日志里。
- `nvm use 24` 只对启动脚本那个 shell 有效，不会带到 Claude Code 会话，所以会话里的默认 Node 仍然是 `/opt/node22`。

结论：**启动脚本的 nvm 设置没有延续到会话**（任务要求记录的现象），而且仓库内的三步也没有生效。

### 1.3 会话内补救

| 步骤 | 命令 | 退出码 | 耗时 | 结果 |
|---|---|---|---|---|
| 1 | `export NVM_DIR=/opt/nvm; . "$NVM_DIR/nvm.sh"; nvm use 24` | 0 | 0.49s | v24.21.0 / npm 11.19.0（v24 已在镜像里，不需要 install） |
| 2 | `npm ci` | 0 | 6.0s | 0 vulnerabilities；与上次一样提示 `esbuild@0.25.12` 的 postinstall 不在 allowScripts 中 |
| 3 | `npx playwright install --with-deps chromium` | 0 | 31.6s | apt 依赖安装成功；从 `cdn.playwright.dev` 下载 Chrome for Testing 151.0.7922.34（184.3 MiB）和 Headless Shell（114.7 MiB）到 `/opt/pw-browsers/chromium-1234`、`chromium_headless_shell-1234`。镜像自带的两个 PPA（deadsnakes、ondrej/php）仍然返回代理 403，只产生警告，不影响结果 |
| 4 | `npm run build` | 0 | 3.1s | vite 构建成功，只有 chunk > 500 kB 的警告 |

之后的每一步都在同一方式激活的 Node v24.21.0 下执行（`02-nvm-and-npm-ci.txt`、`03-playwright-install.txt`、`04-npm-run-build.txt`）。

## 2. `timeout 1200 npm test`（完整输出 `05-npm-test.txt`，失败段 `05-npm-test-failures.txt`）

- 07:55:03 开始，08:15:03 被外层 `timeout` 终止；**exit 124，耗时 1200.0s**
- 汇总：**tests 426，pass 401，fail 19，cancelled 1，skipped 5，todo 0**
- cancelled 1 是 `tests/rule-templates.test.mjs` 整个文件（`✖ tests/rule-templates.test.mjs (1192165ms)`，原因 `'Promise resolution is still pending but the event loop has already resolved'`）。这个文件在 D-R4 之后就没有输出了，D-R5（第 503 行）和 D-R6（第 541 行）都没有结果，**挂起现象与上次一致**。上次是会话手动 SIGTERM 结束，所以没有记入 cancelled，这次由 timeout 结束，计入 1 个 cancelled，所以 tests 从 425 变成 426。
- skipped 5：全部是测试自带的平台条件跳过（`No alternate current-user group`、macOS writer、quarantine 等），与上次相同。
- 输出里 “Interrupted while running” 列出的其余文件（search、server、skill-* 等）是 SIGTERM 时还在缓冲区里的输出，之后都打印出了结果，没有被取消。

### 19 个失败与上次逐条对照（`05b-prev-failures-sorted.txt` 与 `05c-current-failures-sorted.txt`，`comm` 比对）

| 文件:行 | 用例 | 与上次对比 |
|---|---|---|
| agent-config-http.test.mjs:94 | 配置 HTTP 确认后回读并保留历史，显式恢复原字节与权限且不宣称采用 | 相同 |
| agent-config.test.mjs:217 | A changed binding and external edits block restoring an old operation | 相同 |
| agent-config.test.mjs:299 | Replacing the actual Home inode with identical configuration bytes invalidates old previews and operations | 相同 |
| agent-config.test.mjs:333 | BOM, Unicode and CRLF survive applying and restoring an exact byte-offset patch | 相同 |
| agent-config.test.mjs:371 | A missing original journal record invalidates a restore preview with a safe conflict | 相同 |
| agent-config.test.mjs:522 | A configuration rename followed by failure returns observed state without claiming operationNotStarted | 相同 |
| agent-config.test.mjs:560 | A saved Hermes target applies and restores YAML booleans while preserving unrelated bytes | 相同 |
| agent-config.test.mjs:624 | Receipt failure after file write stays recoverable and repeating the operation does not rewrite | 相同 |
| agent-config.test.mjs:672 | A forged inverse patch cannot authorize editing another boolean | 相同 |
| agent-config.test.mjs:694 | Restart recovery checks the same operation without replay; explicit restore returns original bytes | 相同 |
| agent-config.test.mjs:729 | Confirmed apply persists a minimal journal, reads back the file and never increments the workspace revision | 相同 |
| agent-programs.test.mjs:424 | App 版本来自 bundle 身份，内嵌 CLI 不冒用 App 版本；支持二进制 plist | 相同 |
| discovery.test.mjs:93 | ChatGPT.app 的 Codex bundle 身份归入 Codex，原 ChatGPT 身份不变 | 相同 |
| knowledge-writeback.test.mjs:310 | 保存的候选能被既有 wiki-local 解析，但不能绕过有效性门禁成为当前知识 | 相同 |
| rule-templates.test.mjs:236 | 装入、升级、区块外手写内容不受影响，撤回恢复写入前字节 | 相同 |
| rule-templates.test.mjs:293 | 区块手改默认拒绝；勾选覆盖后写入并可撤回到手改内容 | 相同 |
| rule-templates.test.mjs:396 | 重复提交同一令牌只写一次，返回核对结果 | 相同 |
| rule-templates.test.mjs:470 | D-R4：写入中途失败的操作不替代已装版本，单独标为未确认 | 相同 |
| skill-files.test.mjs:198 | 来源缺失或权限失败给出可操作错误，不以空包或部分包成功返回 | 相同 |

新增：只有 `tests/rule-templates.test.mjs` 文件级 cancelled（计数方式不同，不是新的失败用例）。消失：无。

## 3. 浏览器脚本（`PLAYWRIGHT_MODULE=playwright`，逐个 `timeout 600 node <file>`，按文件名排序）

`summary-first.txt`、`summary-rerun.txt` 记录退出码与耗时；失败脚本的末尾 80 行在 `06-browser/first-*.txt`、`rerun-*.txt`。重跑只针对首次失败的 5 个，与首次分列，不替代首次结果。

| # | 脚本 | 首次退出码 | 首次耗时(s) | 重跑退出码 | 重跑耗时(s) |
|---|---|---|---|---|---|
| 1 | `tests/accessibility.mjs` | 0 通过 | 14.0 | — | — |
| 2 | `tests/agent-config-browser.mjs` | **1 失败** | 2.0 | **1 失败** | 2.1 |
| 3 | `tests/agent-inventory-browser.mjs` | 0 通过 | 12.9 | — | — |
| 4 | `tests/agent-targets-browser.mjs` | 0 通过 | 22.7 | — | — |
| 5 | `tests/browser.mjs` | 0 通过 | 12.4 | — | — |
| 6 | `tests/context-browser.mjs` | 0 通过 | 7.7 | — | — |
| 7 | `tests/delivery-browser.mjs` | 0 通过 | 7.1 | — | — |
| 8 | `tests/history-browser.mjs` | 0 通过 | 13.8 | — | — |
| 9 | `tests/history-capacity.mjs` | 0 通过 | 8.1 | — | — |
| 10 | `tests/interaction-browser.mjs` | **1 失败** | 1.3 | **1 失败** | 1.4 |
| 11 | `tests/knowledge-browser.mjs` | 0 通过 | 33.6 | — | — |
| 12 | `tests/knowledge-compilation-browser.mjs` | 0 通过 | 17.8 | — | — |
| 13 | `tests/knowledge-compilation-recovery-browser.mjs` | 0 通过 | 7.4 | — | — |
| 14 | `tests/knowledge-compilation-resilience-browser.mjs` | 0 通过 | 9.6 | — | — |
| 15 | `tests/knowledge-maintenance-browser.mjs` | 0 通过 | 25.5 | — | — |
| 16 | `tests/knowledge-maintenance-recovery-browser.mjs` | 0 通过 | 14.1 | — | — |
| 17 | `tests/knowledge-query-browser.mjs` | 0 通过 | 22.1 | — | — |
| 18 | `tests/knowledge-writeback-browser.mjs` | 0 通过 | 12.8 | — | — |
| 19 | `tests/migration.mjs` | 0 通过 | 3.1 | — | — |
| 20 | `tests/partner-browser.mjs` | 0 通过 | 15.6 | — | — |
| 21 | `tests/project-identity-browser.mjs` | 0 通过 | 22.6 | — | — |
| 22 | `tests/rule-templates-browser.mjs` | **1 失败** | 8.5 | **1 失败** | 8.3 |
| 23 | `tests/rule-templates-fix-browser.mjs` | **1 失败** | 0.9 | **1 失败** | 0.7 |
| 24 | `tests/search-browser.mjs` | **1 失败** | 14.0 | **1 失败** | 13.8 |
| 25 | `tests/skill-copies-browser.mjs` | 0 通过 | 25.7 | — | — |
| 26 | `tests/skill-source-browser.mjs` | 0 通过 | 19.4 | — | — |
| 27 | `tests/usage-browser.mjs` | 0 通过 | 29.2 | — | — |
| 28 | `tests/workflow-browser.mjs` | 0 通过 | 20.1 | — | — |

首次 **23/28** 通过；重跑 **0/5** 通过。上次两轮都是 0/28，而且全部是浏览器不存在导致的失败。

### 失败原文摘要与初步归类（只作线索，**均未验证**）

| 脚本 | 首次 / 重跑原文 | 初步归类（未验证） |
|---|---|---|
| agent-config-browser.mjs:100 | `strictEqual`：恢复后内容为 `animations = true # 保留注释`，期望 `animations = false`。首次与重跑相同 | **断言类**。症状与 `npm test` 中 agent-config 恢复类的 11 个失败一致（agent-config.test.mjs:217 也是恢复后仍为 `true`），可能是同一个根因，与 Linux/root 下的文件系统语义（inode、权限、rename）有关，需要在本机对照 |
| interaction-browser.mjs:38 | 按下按钮 150ms 后，`transform` 期望 `matrix(1, 0, 0, 1, 0, 3)`，实际 `…0, 2.92751)`；重跑为 `…0, 2.98952)` | **时序类**：CSS 过渡在 150ms 固定等待内还没有完全结束，云端 headless shell 或 CPU 较慢。数值每次都不同，而且接近 3。按约束没有加长等待 |
| rule-templates-browser.mjs:39（从第 65 行调用） | `locator.waitFor: Timeout 5000ms exceeded`，等待“装入项目”区域出现“已写入，回读一致”。首次与重跑相同 | 表面是**超时**，但可能是**断言类**：同一流程在 `npm test` 的 rule-templates.test.mjs:236（写入后回读/撤回失败）中也失败，推测是回读结果不一致，所以提示没有出现，而不是页面慢 |
| rule-templates-fix-browser.mjs | `strictEqual`：实际 `matches_before`，期望 `matches_after`。首次与重跑相同 | **断言类**，与 rule-templates.test.mjs:396 的错误完全相同（同一个核对结果） |
| search-browser.mjs:283 | `palette-cold 750ms > 500ms`（TIMING `{"palette-cold":750,"palette-warm":104,"library":146}`）；重跑 `palette-cold 728ms > 500ms`（`library` 276） | **时序/性能类**：只有冷启动的命令面板超过 500ms 性能预算，热启动与资产库都达标。云端 4 核 CPU 性能与本机不同。按约束没有放宽阈值 |

没有发现 root 权限、字体、剪贴板或缺少本机工具这类**环境类**的浏览器失败：28 个脚本全部能启动 chromium v1234 并进入断言。

## 4. 未执行项与原因

- `tests/visual.mjs`：按任务要求不运行。
- `rule-templates.test.mjs` 的 D-R5、D-R6：文件挂起，被 `timeout 1200` 终止，没有结果（§2）。
- 没有对任何失败做定位或修复（本任务只测不修）；§3 的归类都没有验证。
- 没有检查 init script 的原文和逐条输出（环境管理器日志里没有；为避免接触凭据，也没有进一步读取其他系统文件）。

## 5. 对云端环境配置的进一步建议

1. **启动脚本先进入仓库目录并开启失败即停**。环境管理器的日志显示 init script 的工作目录是 `/home/user`，而不是仓库目录。建议：
   ```bash
   set -euo pipefail
   cd /home/user/personal-ai-workbench
   export NVM_DIR=/opt/nvm; . "$NVM_DIR/nvm.sh"; nvm install 24; nvm use 24
   npm ci
   npx playwright install --with-deps chromium
   npm run build
   ```
   `set -e` 可以让启动失败暴露出来，而不是被报告为“成功”。仓库目录名以实际克隆路径为准。
2. **让会话默认使用 Node 24**：`nvm use` 不会带到会话。可以在环境变量里设置 `PATH=/opt/nvm/versions/node/v24.21.0/bin:<原 PATH>`，或者在启动脚本里把 v24 链接到 `/usr/local/bin` 并放到 PATH 前面。否则每次任务提示都要手动执行 `nvm use 24`（本次耗时 0.5s）。注意：如果启动脚本改成在仓库里跑 `npm ci`，也要在 Node 24 下执行。
3. **网络**：放行 `cdn.playwright.dev` 已生效，这一项可以在 CLOUD-SESSIONS.md §3 中从“被拦截”改为“已放行”（由本机会话决定是否更新）。deadsnakes、ondrej/php 两个 PPA 仍然返回 403，只产生 apt 警告，可以忽略，也可以在启动脚本里 `apt-get update` 之前删掉这两个源。
4. **`npm test` 在云端必定跑满 20 分钟**：`rule-templates.test.mjs` 每次都挂起。在本机查明之前，可以在云端改用 `node --test --test-timeout=<ms>`，或者先单独排除这个文件跑一轮，另起任务单独诊断（这两种做法都会改变测试调用方式，需要用户决定）。
5. **已知云端差异建议列入基线**：19 个 `npm test` 失败两次完全一致，可以作为云端“已知失败集”，后续回归只关注增减。浏览器侧有 3 个断言类失败（agent-config、rule-templates、rule-templates-fix），它们与 `npm test` 同源，可以一起列入；另有 2 个时序类失败（interaction 过渡、search 冷启动性能），需要本机确认是否也有边缘现象。

## 日志清单（`docs/agents/handoffs/cloud-baseline-regression-2-logs/`）

- `01-environment.txt`（会话开始时的原始状态）、`01c-setup-script-evidence.txt`（目录时间戳）、`01d-init-script-log.txt`（环境管理器日志中 init script 与工作目录相关的行）
- `02-nvm-and-npm-ci.txt`、`03-playwright-install.txt`、`04-npm-run-build.txt`
- `05-npm-test.txt`（完整）、`05-npm-test-failures.txt`（失败段）、`05b-prev-failures-sorted.txt`、`05c-current-failures-sorted.txt`
- `06-browser/summary-first.txt`、`06-browser/summary-rerun.txt`（制表符分隔：脚本、退出码、耗时秒）、`06-browser/first-*.txt`、`06-browser/rerun-*.txt`（失败脚本末尾 80 行）

# 2026-09-30 云端基线回归（Claude Code 云端会话）

> 云端工作副本结果，非权威。未修改任何源码、测试、配置、既有文档或 CURRENT.md；本分支只新增本文件及 `cloud-baseline-regression-logs/` 下的纯文本日志。未开 PR（按任务要求）。

## 结论速览

| 项 | 结果 |
|---|---|
| 基点提交 | `main @ 0d596f4bb9fa331db827bdea9b9c3ff4aaf8efd0` |
| Node | 镜像默认 v22.22.2（不满足 `>=24`）；`/opt/nvm` 安装 v24.21.0 成功，此后全部步骤用 v24.21.0 / npm 11.19.0 |
| `npm ci` | 通过（exit 0，3.5s） |
| Playwright 浏览器下载 | **失败**：系统依赖 apt 安装成功，但 `cdn.playwright.dev` 被云端出站代理 403 拦截 |
| `npm run build` | 通过（exit 0，2.6s） |
| `npm test` | **exit 1**：tests 425 / pass 401 / fail 19 / skipped 5 / cancelled 0；其中 `rule-templates.test.mjs` 挂起，20 分钟时由本会话 SIGTERM 结束（见 §5） |
| 浏览器脚本 | **首次 0/28 通过**，重跑 0/28 通过；28 个全部在 `chromium.launch` 处因浏览器可执行文件不存在而失败，未进入任何断言 |
| `tests/visual.mjs` | 未执行（按任务要求） |

## 1. 环境（日志 `01-environment.txt`、`01b-nvm-node24.txt`）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `git rev-parse HEAD` | 0 | `0d596f4bb9fa331db827bdea9b9c3ff4aaf8efd0` |
| `node -v` | 0 | v22.22.2（`/usr/local/bin/node`，镜像另有 `/opt/node20~22`，无 24） |
| `npm -v` | 0 | 10.9.7 |
| `uname -a` | 0 | Linux 6.18.44-fc-v50 x86_64 |
| `cat /etc/os-release` | 0 | Ubuntu 24.04.4 LTS (noble) |
| `nproc` | 0 | 4 |
| `free -h` | 0 | 15Gi 内存，无 swap |
| `source /opt/nvm/nvm.sh; nvm install 24` | 0 | 从 nodejs.org 下载 v24.21.0，校验和通过，耗时 5s |

其他：运行用户为 `root`；环境预置 `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`，其中只有 `chromium-1194`、`chromium_headless_shell-1194`、`ffmpeg-1011`，而本仓库锁定的 `playwright@1.62.1` 需要 `chromium v1234`（Chrome for Testing 151.0.7922.34）。

## 2. `npm ci`（日志 `02-npm-ci.txt`）

exit 0，3.5s。added 76 packages，0 vulnerabilities。npm 11 提示 `esbuild@0.25.12` 的 postinstall 未在 allowScripts 中（未执行），但后续 build 正常。

## 3. Playwright 安装（日志 `03a-…`、`03b-…`）

| 命令 | 退出码 | 耗时 | 结果 |
|---|---|---|---|
| `npx playwright install --with-deps chromium` | 1 | 18.5s | apt 源（archive/security.ubuntu.com）可达，系统依赖安装完成；下载 `https://cdn.playwright.dev/builds/cft/151.0.7922.34/linux64/chrome-linux64.zip` 时返回 403：`request blocked: no rule or allowlist entry allows host "cdn.playwright.dev"`，重试 5 次均失败 |
| `npx playwright install chromium` | 1 | 3.8s | 同一 403 |

另：`apt-get update` 对镜像自带的两个 PPA（deadsnakes、ondrej/php）也返回代理 403，只产生警告，不影响依赖安装。

结论：当前网络策略**允许 npm registry、nodejs.org、Ubuntu apt 源**，**不允许 Playwright 浏览器 CDN**。

## 4. `npm run build`（日志 `04-npm-run-build.txt`）

exit 0，2.6s。vite 6.4.3，1629 modules；仅有 chunk > 500 kB 的警告。

## 5. `npm test`（完整输出 `05-npm-test.txt`，失败段 `05-npm-test-failures.txt`）

- 命令：`npm test`（= `node --test tests/*.test.mjs`），Node v24.21.0
- exit 1，墙钟 1193.3s（≈19.9 分钟）
- 汇总：**tests 425，pass 401，fail 19，cancelled 0，skipped 5，todo 0**
- **挂起**：约 05:00 开始后，其他文件都已结束，只剩 `tests/rule-templates.test.mjs` 的子进程，CPU 接近 0，一直没有输出。等到 05:20（总计约 20 分钟），本会话对该子进程（pid 2964）发了 SIGTERM，npm test 随后结束。该文件的 `D-R5：核对等待在途写入完成…`（第 503 行）和 `D-R6：约 140 KiB 的模板…`（第 541 行）没有输出结果，推测挂在 D-R5（它依赖在途写入与 150ms 等待），**未验证**。任务没有给 npm test 设上限，20 分钟截止是本会话自己定的。
- 跳过的 5 项均为测试自带的平台条件跳过（例如 `native macOS writer…`、`never removes quarantine…`），非本会话跳过。

失败用例（19）：

| 文件:行 | 用例 | 首条错误 |
|---|---|---|
| agent-config-http.test.mjs:94 | 配置 HTTP 确认后回读并保留历史，显式恢复原字节与权限且不宣称采用 | strictEqual 不等 |
| agent-config.test.mjs:217 | A changed binding and external edits block restoring an old operation | 恢复后内容 `animations = true`，期望 `false` |
| agent-config.test.mjs:299 | Replacing the actual Home inode with identical configuration bytes invalidates old previews and operations | strictEqual 不等 |
| agent-config.test.mjs:333 | BOM, Unicode and CRLF survive applying and restoring an exact byte-offset patch | strictEqual 不等 |
| agent-config.test.mjs:371 | A missing original journal record invalidates a restore preview with a safe conflict | `Error: 文件与原操作结果不一致，不能恢复；请重新读取配置` |
| agent-config.test.mjs:522 | A configuration rename followed by failure returns observed state without claiming operationNotStarted | strictEqual 不等 |
| agent-config.test.mjs:560 | A saved Hermes target applies and restores YAML booleans while preserving unrelated bytes | strictEqual 不等 |
| agent-config.test.mjs:624 | Receipt failure after file write stays recoverable and repeating the operation does not rewrite | strictEqual 不等 |
| agent-config.test.mjs:672 | A forged inverse patch cannot authorize editing another boolean | 输入不匹配 `/恢复记录/` |
| agent-config.test.mjs:694 | Restart recovery checks the same operation without replay; explicit restore returns original bytes | strictEqual 不等 |
| agent-config.test.mjs:729 | Confirmed apply persists a minimal journal, reads back the file and never increments the workspace revision | strictEqual 不等 |
| agent-programs.test.mjs:424 | App 版本来自 bundle 身份，内嵌 CLI 不冒用 App 版本；支持二进制 plist | `spawn /usr/bin/plutil ENOENT` |
| discovery.test.mjs:93 | ChatGPT.app 的 Codex bundle 身份归入 Codex，原 ChatGPT 身份不变 | 实际 `[]`，期望含 App 条目 |
| knowledge-writeback.test.mjs:310 | 保存的候选能被既有 wiki-local 解析，但不能绕过有效性门禁成为当前知识 | `FileNotFoundError: /home/user/wiki-local/wiki.py` |
| rule-templates.test.mjs:236 | 装入、升级、区块外手写内容不受影响，撤回恢复写入前字节 | strictEqual 不等 |
| rule-templates.test.mjs:293 | 区块手改默认拒绝；勾选覆盖后写入并可撤回到手改内容 | strictEqual 不等 |
| rule-templates.test.mjs:396 | 重复提交同一令牌只写一次，返回核对结果 | 实际 `matches_before`，期望 `matches_after` |
| rule-templates.test.mjs:470 | D-R4：写入中途失败的操作不替代已装版本，单独标为未确认 | `仍是已完成的 v1`：实际 null |
| skill-files.test.mjs:198 | 来源缺失或权限失败给出可操作错误，不以空包或部分包成功返回 | `Missing expected rejection.` |

初步归因（仅作线索，**均未验证、未修复**）：
- `plutil` 缺失、ChatGPT.app bundle 发现：依赖 macOS 工具或环境，在 Linux 上失败。
- `wiki-local/wiki.py` 缺失：测试引用本机外部 helper（可由 `GUIJI_WIKI_HELPER` 覆盖），云端副本不含。
- `skill-files` 权限失败：云端以 root 运行，chmod 设的无权限对 root 无效，所以预期的拒绝没有发生。
- agent-config / rule-templates 的恢复、回读类失败：可能与 Linux 文件系统语义（inode、权限、rename、root）有关，需在本机对照。

## 6. 浏览器脚本（`PLAYWRIGHT_MODULE=playwright`，逐个 `timeout 600 node <file>`）

按文件名排序共 28 个（4 个固定脚本 + 24 个 `*-browser.mjs`）。首次 **0/28** 通过，重跑 **0/28** 通过，两次分开记录。所有失败原文一致：

```
browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell
... Please run the following command to download new browsers: npx playwright install
```

即：因为 §3 的浏览器没下载下来，全部脚本在启动浏览器时就退出（exit 1，约 0.5s），**没有执行任何页面断言**。这个结果只说明环境不可用，不能当作产品回归结论。

| # | 脚本 | 首次退出码 | 首次耗时(s) | 重跑退出码 | 重跑耗时(s) | 日志（末尾 80 行） |
|---|---|---|---|---|---|---|
| 1 | `tests/accessibility.mjs` | 失败 1 | 0.5 | 失败 1 | 0.4 | `06-browser/first-accessibility.txt` / `rerun-accessibility.txt` |
| 2 | `tests/agent-config-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.5 | `06-browser/first-agent-config-browser.txt` / `rerun-agent-config-browser.txt` |
| 3 | `tests/agent-inventory-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.5 | `06-browser/first-agent-inventory-browser.txt` / `rerun-agent-inventory-browser.txt` |
| 4 | `tests/agent-targets-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.5 | `06-browser/first-agent-targets-browser.txt` / `rerun-agent-targets-browser.txt` |
| 5 | `tests/browser.mjs` | 失败 1 | 0.4 | 失败 1 | 0.4 | `06-browser/first-browser.txt` / `rerun-browser.txt` |
| 6 | `tests/context-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.5 | `06-browser/first-context-browser.txt` / `rerun-context-browser.txt` |
| 7 | `tests/delivery-browser.mjs` | 失败 1 | 0.4 | 失败 1 | 0.4 | `06-browser/first-delivery-browser.txt` / `rerun-delivery-browser.txt` |
| 8 | `tests/history-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.5 | `06-browser/first-history-browser.txt` / `rerun-history-browser.txt` |
| 9 | `tests/history-capacity.mjs` | 失败 1 | 0.4 | 失败 1 | 0.4 | `06-browser/first-history-capacity.txt` / `rerun-history-capacity.txt` |
| 10 | `tests/interaction-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.5 | `06-browser/first-interaction-browser.txt` / `rerun-interaction-browser.txt` |
| 11 | `tests/knowledge-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.5 | `06-browser/first-knowledge-browser.txt` / `rerun-knowledge-browser.txt` |
| 12 | `tests/knowledge-compilation-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.5 | `06-browser/first-knowledge-compilation-browser.txt` / `rerun-knowledge-compilation-browser.txt` |
| 13 | `tests/knowledge-compilation-recovery-browser.mjs` | 失败 1 | 0.4 | 失败 1 | 0.4 | `06-browser/first-knowledge-compilation-recovery-browser.txt` / `rerun-knowledge-compilation-recovery-browser.txt` |
| 14 | `tests/knowledge-compilation-resilience-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.5 | `06-browser/first-knowledge-compilation-resilience-browser.txt` / `rerun-knowledge-compilation-resilience-browser.txt` |
| 15 | `tests/knowledge-maintenance-browser.mjs` | 失败 1 | 0.6 | 失败 1 | 0.5 | `06-browser/first-knowledge-maintenance-browser.txt` / `rerun-knowledge-maintenance-browser.txt` |
| 16 | `tests/knowledge-maintenance-recovery-browser.mjs` | 失败 1 | 0.4 | 失败 1 | 0.4 | `06-browser/first-knowledge-maintenance-recovery-browser.txt` / `rerun-knowledge-maintenance-recovery-browser.txt` |
| 17 | `tests/knowledge-query-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.5 | `06-browser/first-knowledge-query-browser.txt` / `rerun-knowledge-query-browser.txt` |
| 18 | `tests/knowledge-writeback-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.5 | `06-browser/first-knowledge-writeback-browser.txt` / `rerun-knowledge-writeback-browser.txt` |
| 19 | `tests/migration.mjs` | 失败 1 | 0.4 | 失败 1 | 0.5 | `06-browser/first-migration.txt` / `rerun-migration.txt` |
| 20 | `tests/partner-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.5 | `06-browser/first-partner-browser.txt` / `rerun-partner-browser.txt` |
| 21 | `tests/project-identity-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.5 | `06-browser/first-project-identity-browser.txt` / `rerun-project-identity-browser.txt` |
| 22 | `tests/rule-templates-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.5 | `06-browser/first-rule-templates-browser.txt` / `rerun-rule-templates-browser.txt` |
| 23 | `tests/rule-templates-fix-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.4 | `06-browser/first-rule-templates-fix-browser.txt` / `rerun-rule-templates-fix-browser.txt` |
| 24 | `tests/search-browser.mjs` | 失败 1 | 0.4 | 失败 1 | 0.4 | `06-browser/first-search-browser.txt` / `rerun-search-browser.txt` |
| 25 | `tests/skill-copies-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.5 | `06-browser/first-skill-copies-browser.txt` / `rerun-skill-copies-browser.txt` |
| 26 | `tests/skill-source-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.5 | `06-browser/first-skill-source-browser.txt` / `rerun-skill-source-browser.txt` |
| 27 | `tests/usage-browser.mjs` | 失败 1 | 0.4 | 失败 1 | 0.4 | `06-browser/first-usage-browser.txt` / `rerun-usage-browser.txt` |
| 28 | `tests/workflow-browser.mjs` | 失败 1 | 0.5 | 失败 1 | 0.5 | `06-browser/first-workflow-browser.txt` / `rerun-workflow-browser.txt` |

## 7. 未执行项与原因

- `tests/visual.mjs`：按任务要求不运行。
- 浏览器脚本的实际页面断言：浏览器二进制不可下载（§3），28 个脚本全部在启动时失败，实际没有测到任何页面行为。
- `rule-templates.test.mjs` 的 D-R5、D-R6：D-R5 挂起，被 SIGTERM 终止，两者都没有结果（§5）。
- 未尝试的替代方案：用预装的 `chromium-1194` 代替（需要改测试或指定 `executablePath`，属于修改测试/配置，超出任务范围）。

## 8. 对云端环境配置的建议

1. **Node 版本**：镜像默认 22，启动脚本需先 `export NVM_DIR=/opt/nvm; source /opt/nvm/nvm.sh; nvm install 24 && nvm use 24`（实测 5s 可完成），或把 `/opt/nvm/versions/node/v24.*/bin` 放到 PATH 最前。CLOUD-SESSIONS.md 里 `npm ci` 前应加上这一步。
2. **网络访问级别**：当前策略拦截 `cdn.playwright.dev`。需要把 `cdn.playwright.dev`（以及 Playwright 的备用下载源 `playwright.download.prss.microsoft.com`、`playwright.azureedge.net` 等，以 1.62.1 实际请求为准）加入白名单，或改用完全开放网络的环境。npm registry、nodejs.org、Ubuntu apt 源实测可达。
3. **系统依赖**：`--with-deps` 的 apt 部分实测成功，可保留；镜像以 root 运行，这会让依赖 chmod 权限拒绝的测试失效，可考虑在非 root 用户下跑 `npm test`，或在报告中把这类用例单列。
4. **启动脚本**建议：
   ```bash
   export NVM_DIR=/opt/nvm; . "$NVM_DIR/nvm.sh"; nvm install 24; nvm use 24
   npm ci
   npx playwright install --with-deps chromium   # 需先放行 cdn.playwright.dev
   npm run build
   export PLAYWRIGHT_MODULE=playwright
   ```
5. **超时**：`npm test` 没有整体或单文件超时，`rule-templates.test.mjs` 在云端会无限挂起。可在本机确认是否能复现；云端调用可以在外层套 `timeout`（不改测试本身）。
6. **macOS / 本机依赖用例**（`plutil`、ChatGPT.app、`wiki-local`）：在 Linux 云端必然失败。建议在云端基线里把它们记为已知环境差异，以免与真实回归混淆。

## 日志清单（`docs/agents/handoffs/cloud-baseline-regression-logs/`）

- `01-environment.txt`、`01b-nvm-node24.txt`
- `02-npm-ci.txt`
- `03a-playwright-install-with-deps.txt`、`03b-playwright-install.txt`
- `04-npm-run-build.txt`
- `05-npm-test.txt`（完整）、`05-npm-test-failures.txt`（失败段）
- `06-browser/summary-first.txt`、`06-browser/summary-rerun.txt`、`06-browser/first-*.txt`、`06-browser/rerun-*.txt`

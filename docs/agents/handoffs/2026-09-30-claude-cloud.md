# Claude｜云端接入（认领 91）

输入 **WB-20260930-90** → Claude 认领 **91** → 输出 **WB-20260930-92**。执行者 Claude（Claude Code 桌面端新会话），2026-09-30。范围：把应用接入 Claude Code 云端会话；不改业务源码、正式测试、PRD、设计、dist，不重启 5178。

## 输入核对

- 读回 CURRENT 90 与 [Codex 认领87复核](2026-09-30-codex-review-87.md)，写入者“无”。
- 176 文件清单 `2026-09-30-claude-87-code-baseline.sha256`（SHA256 `eb556480…3ead`）176/176 匹配。
- 真实主库 `data/CURRENT.json` 只算哈希：开工 `2457568d1728d885b7556c67af5fd8b77ae45c04283237c92d1b49446826bbf4`。

## 改动与结果（文件修改）

| 项 | 结果 |
|---|---|
| 应用目录独立 `.git/` | `git init -b main`；上级「个人」仓库未执行 add/commit/reset/clean/stash，它仍把本目录看作未跟踪 |
| `.gitignore` | 追加 `docs/agents/handoffs/evidence-*/`、`.env`、`.env.*`、`*.pem`、`*.key`、`*.log` |
| `package.json` / `package-lock.json` | 用户确认后 devDependencies 加 `playwright` `1.62.1`（与本机 runtime 同版）；lock 新增嵌套 `playwright-core@1.62.1`，顶层 `playwright-core@1.63.0`（axe 用）不变。前像在证据目录 |
| 新增 [CLOUD-SESSIONS.md](../../../CLOUD-SESSIONS.md) | 云端使用约定：权威与回流、禁止事项、环境配置、提示词模板 |
| `COLLABORATION.md` §5 | 加一行指向 CLOUD-SESSIONS.md |
| CURRENT.md | 认领 91；完工写 92 |

## 上传前检查（用户逐项确认）

- 清单 330 个文件，5.92MB（[upload-manifest.tsv](evidence-2026-09-30-claude-cloud/upload-manifest.tsv)，证据目录本身不入库）。`data/`、`dist/`、`node_modules/`、`test-results/`、全部 `evidence-*`、`design/pixel-refs/*.png` 不在清单内；`git check-ignore` 已核 `data/CURRENT.json` 与 evidence 被排除。
- 凭据：只命中 `tests/asset-activity.test.mjs` 中的合成拒绝样例。没有邮箱或手机号。
- 本机绝对路径：41 个文件，其中 29 个浏览器脚本含 Playwright 默认路径，12 个文档含应用或扫描根路径。另有 1.E 验收记录中的真实 Skill 名。用户选择**原样入库**。
- 版权敏感文件：构建必需的 `src/sprites-refs.js`、`src/pixel.jsx`、`docs/design/ui-v13/*`，以及构建不引用的 `design/digievolution-*`、`design/pixel-refs/extract.py|extracted.json`、`public/theme/digievolution/*.png`。用户选择**全部纳入私有仓库**。

## 远程仓库（外部动作，均经用户对话确认）

- 用户确认后执行 `gh repo create abdoulaziznafiou03-creator/personal-ai-workbench --private`。
- 本地首次提交 `0d596f4`，经用户再次确认后推送 `main`；远程 visibility=PRIVATE，`main`=`0d596f4bb9fa331db827bdea9b9c3ff4aaf8efd0`。
- 云端首次创建 routine 时返回 `403 repo_access_denied`：Claude GitHub App 未安装。用户安装 App 并授权本仓库后重建成功。服务端默认挂载的 2 个 MCP 连接器已在触发前清空。

## 验证

### 本机测试

- `npm test`：427/427 通过（`package.json` 加入 playwright 之后，本机 Node v24.16.0）。日志：[local-npm-test.txt](evidence-2026-09-30-claude-cloud/local-npm-test.txt)。
- `PLAYWRIGHT_MODULE=playwright node tests/browser.mjs`：退出码 0。只验证新依赖在本机可以加载；其余 27 个浏览器脚本本机未重跑（本轮没有改业务代码和测试）。
- 本轮没有 build，`dist/` 与 5178 都未动。

### 云端实测（routine `trig_01TuZhKcAVMyjKtTaxkSnBDU`，会话 `cse_01KWjGXe6pzShUSEgDLALMBw`，Opus，Default 环境 `env_01QRwAQK1fwDrx7Rvd3nuU1i`）

结果分支 `cloud/2026-09-30-baseline-regression` @ `264809d`。已核对：相对 `main` 只新增文件（1 份报告和 60 个纯文本日志），没有改动或删除既有文件。本地副本见 [cloud-report-264809d.md](evidence-2026-09-30-claude-cloud/cloud-report-264809d.md)。**未合入 main**。

| 项 | 云端首次结果 |
|---|---|
| 基点 | `0d596f4` |
| Node | 镜像默认 v22.22.2；`/opt/nvm` 安装 v24.21.0 成功 |
| `npm ci` | 通过 |
| `playwright install --with-deps chromium` | **失败**：apt 系统依赖装成功；浏览器 zip 被出站代理 403 拦截，原文 `request blocked: no rule or allowlist entry allows host "cdn.playwright.dev"`（已在日志中核实） |
| `npm run build` | 通过 |
| `npm test` | **exit 1**：tests 425 / pass 401 / fail 19 / skipped 5；`rule-templates.test.mjs` 挂起约 20 分钟，被云端会话 SIGTERM（D-R5、D-R6 无结果） |
| 28 个浏览器脚本 | 首次 0/28，重跑 0/28；全部在 `chromium.launch` 处因浏览器不存在而退出，**没有执行任何页面断言，不构成产品回归结论** |

云端 npm test 的 19 个失败和挂起在本机都没有复现（本机 427/427）。云端给出的归因只是线索，未经验证：macOS 专属依赖（`plutil`、ChatGPT.app）、缺少本机 `wiki-local` helper、root 下权限拒绝失效，以及 agent-config/rule-templates 恢复与回读失败（原因未知，可能与 Linux 文件语义或 root 有关）。这些**未定位、未修复**，已写入 CLOUD-SESSIONS.md §3，作为已知差异。

### 用户验收

用户验收未进行。用户在对话中确认过的是：清单处理方式（版权敏感文件全部纳入、绝对路径原样保留、playwright 加入 devDependencies）、创建私有仓库、推送 `main`，以及用 Opus 执行云端实测。

### 输出基线

- 新 176 文件清单 [2026-09-30-claude-cloud-code-baseline.sha256](2026-09-30-claude-cloud-code-baseline.sha256)，SHA256 `4ec131bf490e11d14f2c846d090e193e986d4d6725ab30f908935dfd8af1cae6`。相对认领87清单只有 `package.json`、`package-lock.json` 变化，两者前像与旧清单一致。
- 主库 `data/CURRENT.json` 结束时哈希仍是 `2457568d…bbf4`（只算哈希）。
- 本轮在本地 Git 中未提交 CLOUD-SESSIONS.md 更新、本交接、新清单和 CURRENT 92（AGENTS.md 规定不自动提交）；是否提交并推送由用户决定。

## 未完成与阻塞

1. **云端浏览器回归需要用户操作**：在 claude.ai/code 的环境设置中，把 `cdn.playwright.dev` 加入网络白名单（或改用完全开放网络），并可把上述启动脚本和 `PLAYWRIGHT_MODULE=playwright` 配到环境里。Claude 不能代改账户或环境设置。放行后需要重新跑一次云端基线。
2. 云端 `npm test` 的 19 个失败和挂起：属于环境差异还是潜在的真实缺陷，需要单独定位。建议作为下一个云端任务，与候选任务 1 一起考虑。
3. 本轮修改（CLOUD-SESSIONS.md 的实测更新、本交接、CURRENT）是否推送到远程，等用户确认。

## 云端环境配置建议

- **Playwright：加入 devDependencies（已执行）**，云端设 `PLAYWRIGHT_MODULE=playwright`。理由：版本由 lockfile 锁定，与本机同版；不用改 29 个测试脚本，本机默认路径保持不变。备选方案“只设环境变量并 `npm i --no-save`”不锁定版本，未采用。
- 启动：`npm ci && npx playwright install --with-deps chromium && npm run build`。`dist/` 不入库，而 `npm test`（digital-world-ui）和全部浏览器脚本都依赖它。
- Node ≥ 24；网络需放行 npm 与 Playwright 浏览器下载。以云端实测为准，见完工记录。

## 优先派往云端的任务（提示词可直接用；使用前把基点换成当时的 main 提交）

### 1. 两处偶发失败的根因定位

```text
【项目】personal-ai-workbench（云端副本，非权威）。先读 CLOUD-SESSIONS.md、AGENTS.md，以及 docs/agents/handoffs/2026-09-29-claude-ui-v12.md、2026-09-29-claude-ui-v12.1.md、2026-09-29-codex-review-ui-v12.1.md 中关于 skill-copies-browser 偶发超时的记录。CURRENT.md 只读、不改。
【基点】main @ <提交>。新建分支 cloud/<日期>-flaky-root-cause，结果以草稿 PR 回报。
【环境】export NVM_DIR=/opt/nvm; . "$NVM_DIR/nvm.sh"; nvm install 24; nvm use 24；npm ci；npx playwright install --with-deps chromium；npm run build；export PLAYWRIGHT_MODULE=playwright。浏览器下载失败（cdn.playwright.dev 未放行）时立即停止并回报，不要改用其他浏览器或改测试。云端以 root 在 Linux 上运行，npm test 已知有环境差异（见 CLOUD-SESSIONS.md §3），与本任务无关的失败只记录、不处理。
【任务范围】定位两处历史偶发失败的根因：(a) tests/skill-copies-browser.mjs:502 附近等待 /api/workspace 回读的 5 秒超时；(b) tests/usage-browser.mjs 中“取消反馈”按钮点击不稳定（第 62、92、327、513 行附近）。先循环复现：每个脚本连跑至少 30 次，记录失败率与每次失败的原始输出。然后取得机制证据，例如给请求、响应、渲染序号加临时探针日志，或用 page.route 控制响应顺序来稳定复现，说明失败时的事件顺序与正常时的差异。只有根因有证据后，才修改测试的同步点（等待真正的条件，而不是固定时长）；如果根因在产品代码，只报告，不修。
【验收标准】给出根因的事件时序证据；修改后同一脚本连跑 30 次 0 失败；npm test 与全部 28 个浏览器脚本各跑 1 次通过。
【禁止事项】不加长超时，不加 sleep/固定等待，不放宽或删除断言，不跳过用例；不改产品源码；临时探针在提交前移除；不推 main；不接外部服务；不读凭据。
【回传证据】docs/agents/handoffs/<日期>-cloud-flaky-root-cause.md：基点、复现次数与失败率（修改前/后）、根因时序、改动文件及前后 SHA256、全部命令与首次原始结果；原始日志放 docs/agents/handoffs/cloud-flaky-root-cause-logs/*.txt。
```

### 2. 浏览器回归稳定性矩阵

```text
【项目】personal-ai-workbench（云端副本，非权威）。先读 CLOUD-SESSIONS.md、AGENTS.md。CURRENT.md 只读、不改。本任务只测不修。
【基点】main @ <提交>。新建分支 cloud/<日期>-stability-matrix，结果以草稿 PR 回报。
【环境】export NVM_DIR=/opt/nvm; . "$NVM_DIR/nvm.sh"; nvm install 24; nvm use 24；npm ci；npx playwright install --with-deps chromium；npm run build；export PLAYWRIGHT_MODULE=playwright。浏览器下载失败（cdn.playwright.dev 未放行）时立即停止并回报，不要改用其他浏览器或改测试。云端以 root 在 Linux 上运行，npm test 已知有环境差异（见 CLOUD-SESSIONS.md §3），与本任务无关的失败只记录、不处理。
【任务范围】把 tests/browser.mjs、accessibility.mjs、migration.mjs、history-capacity.mjs 与全部 tests/*-browser.mjs（共 28 个）连跑 N=10 轮，每轮按固定顺序、每个脚本单独进程运行（timeout 600）。另跑 npm test 10 轮。统计每个脚本的通过数、失败数、失败率、耗时中位数和最大值；对失败按报错位置（文件:行）和报错消息首行聚类。
【验收标准】矩阵覆盖 28 个脚本 × 10 轮，外加 npm test × 10 轮，没有缺格；缺格要写原因。每个失败聚类附至少 1 份原始输出。
【禁止事项】不改任何源码、测试或配置；不重试替代首次结果；不加长超时；不推 main；不接外部服务；不读凭据。
【回传证据】docs/agents/handoffs/<日期>-cloud-stability-matrix.md（矩阵表、失败聚类、环境信息、基点）；原始输出放 docs/agents/handoffs/cloud-stability-matrix-logs/*.txt；另附 matrix.json（脚本 → 每轮退出码与耗时）。
```

### 3. 规则装入记录重读期间，旧的“可升级”行加“待更新”标记（先写失败测试）

```text
【项目】personal-ai-workbench（云端副本，非权威）。先读 CLOUD-SESSIONS.md、AGENTS.md、RULE-TEMPLATES.md，以及 docs/agents/handoffs/2026-09-30-codex-review-83.md（A1 建议）。CURRENT.md 只读、不改。
【基点】main @ <提交>。新建分支 cloud/<日期>-stale-upgrade-mark，结果以草稿 PR 回报。
【环境】export NVM_DIR=/opt/nvm; . "$NVM_DIR/nvm.sh"; nvm install 24; nvm use 24；npm ci；npx playwright install --with-deps chromium；npm run build；export PLAYWRIGHT_MODULE=playwright。浏览器下载失败（cdn.playwright.dev 未放行）时立即停止并回报，不要改用其他浏览器或改测试。云端以 root 在 Linux 上运行，npm test 已知有环境差异（见 CLOUD-SESSIONS.md §3），与本任务无关的失败只记录、不处理。
【任务范围】规则装入记录（installs）写后重读、尚未返回期间，src/RuleInstall.jsx 中已显示的旧“可升级”徽标（约第 401、478 行）应带有“待更新”一类的状态提示，不能让用户把旧结论当作当前事实；重读完成后提示消失，并按新数据显示。先在 tests/ 新增或扩展一个浏览器测试：用 page.route 挂起 installs 回读，断言挂起期间旧行带“待更新”标记，放行后标记消失、数据正确。确认测试在当前代码上**失败**，保存失败输出；再做最小实现让它通过。
【允许修改】src/RuleInstall.jsx；必要时加相应 CSS（沿用现有 Badge/令牌，不引入新视觉方向）；新增或修改的测试文件。
【验收标准】新测试修改前失败、修改后通过；npm test 全部通过；全部 28 个浏览器脚本各跑 1 次通过；控件满足 44px 与可访问名称约束（accessibility.mjs 通过）。
【禁止事项】不改 schema、服务路由、其他页面、设计参考与 PRD；不加长超时；不推 main；不接外部服务；不读凭据。
【回传证据】docs/agents/handoffs/<日期>-cloud-stale-upgrade-mark.md：基点、失败测试首跑输出、改动文件及前后 SHA256、全部验证命令与首次结果、需要真人确认的视觉点（文案与样式）；日志放 docs/agents/handoffs/cloud-stale-upgrade-mark-logs/*.txt。
```

UI v13.3 / v13.4 需要用户看效果，暂不派云端。R87-B1～B5 属于 UI 返修，也涉及视觉，建议留在本机。

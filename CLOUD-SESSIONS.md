# Claude Code 云端会话使用约定

适用于把返修、测试修复、回归验证派到 Claude Code 云端会话（claude.ai/code）。本文件只补充云端规则；认领、交接与验证仍以 [COLLABORATION.md](COLLABORATION.md) 为准，项目状态只有本机的 [CURRENT.md](CURRENT.md)。

## 1. 权威与回流

- 本机应用目录是唯一权威版本。GitHub 私有仓库 `personal-ai-workbench` 与云端副本只是工作副本，不是“最新版”。
- 云端结果只能以**分支或 PR** 回来，不直接推 `main`。一个云端任务对应一个分支，命名 `cloud/<日期>-<主题>`。
- 云端**不改** CURRENT.md、COLLABORATION.md、AGENTS.md、CLAUDE.md，不写交接编号；只在分支里新增 `docs/agents/handoffs/YYYY-MM-DD-cloud-<主题>.md` 作为回报。
- 合入本地由本机会话负责：先按 COLLABORATION.md 认领；核对分支基点与本机对应文件的 SHA256（云端交接须给出改动文件前后指纹）；本机文件在派出后若已变化，先对齐再合入，不整文件覆盖；合入后在本机重跑相称验证，再由本机会话更新 CURRENT。
- 派出云端任务**不改变**本机写入者。派出期间本机若有人修改同一批文件，云端结果按冲突处理，重新核对后才能合入。

## 2. 云端禁止事项

- 不读取、不请求真实 Vault、凭据、Token、Agent 私人会话、真实主库（仓库本就不含 `data/`、证据目录和 `test-results/`）。
- 不接入收费模型、飞书或其他外部服务；不安装未在 `package.json` 声明的第三方包；除 npm 依赖和 Playwright 浏览器下载外不访问外部网络。
- 不推送 `main`、不合并 PR、不改仓库设置、不公开发布。版权敏感素材（数码宝贝二次创作）仅限个人私有仓库，不得复制到其他仓库或公开位置。
- 不为凑通过而改测试断言、放宽等待、加长超时或跳过用例；失败如实回报原始输出。
- 不改视觉方向与 `docs/design/`；需要真人看效果的 UI 任务不派云端。

## 3. 云端环境配置

| 项 | 取值 |
|---|---|
| 仓库 | `personal-ai-workbench`（私有） |
| Node | ≥ 24（`package.json` engines）。Default 镜像是 Node 22，需用镜像自带的 `/opt/nvm` 安装 24（实测约 5 秒） |
| 环境变量 | `PLAYWRIGHT_MODULE=playwright`（浏览器脚本默认指向本机绝对路径，云端必须覆盖） |
| 网络 | Default 环境为 Custom：已放行 `cdn.playwright.dev`、`playwright.download.prss.microsoft.com`，并包含默认包管理器列表；第二次实测浏览器下载成功。镜像自带的两个 PPA 仍返回 403，只产生警告 |
| 启动脚本 | 见下 |

```bash
export NVM_DIR=/opt/nvm; . "$NVM_DIR/nvm.sh"; nvm install 24; nvm use 24
npm ci
npx playwright install --with-deps chromium
npm run build
```

`dist/` 不入库；`npm test` 中的 `digital-world-ui.test.mjs` 与全部浏览器脚本都依赖构建产物，所以启动时必须 build。

回归入口（外层 `timeout` 只防挂起，不改测试本身）：

```bash
timeout 1200 npm test
```

**第二次实测（2026-09-30 15:53）补充**：
- 放行 `cdn.playwright.dev` 后，浏览器下载成功；环境变量 `PLAYWRIGHT_MODULE` 已生效。
- 启动脚本的工作目录不一定是仓库。按仓库名判断时须先定位仓库目录，否则 `npm ci`、浏览器下载和构建都会被跳过。
- 启动脚本里 `nvm use` 的效果不会延续到会话，任务提示词仍须先切到 Node 24。
- `npm test` 在云端必定跑满外层 `timeout 1200`：`rule-templates.test.mjs` 每次都挂起。会话等待后台任务期间显示 idle，任务结束后会自动继续（第二次实测 08:15 继续并交回结果；此前写的“不会被唤醒”是误判，已更正）。
- 第二次结果（分支 `cloud/2026-09-30-baseline-regression-2@2581634`）：
  - 浏览器脚本首次 23/28，重跑 0/5，失败原因与首次一致。其中 agent-config、rule-templates、rule-templates-fix 3 个与 npm test 同源；interaction（按下后 150ms 位移约 2.93，期望 3）与 search（命令面板冷启动 750ms，超过 500ms）2 个为时序类。
  - npm test 的 19 个失败与第一次逐条相同，列为云端已知失败集，后续云端回归只看增减。
  - 以上都未定位；本机 427/427、29/29。

**云端与本机的已知差异（2026-09-30 首次实测，未定位）**：云端以 root 在 Linux 上运行。`npm test` 本机 427/427，云端 fail 19、skipped 5，且 `rule-templates.test.mjs` 挂起。其中 `plutil`、ChatGPT.app 发现、`wiki-local` helper 是本机专属依赖；`skill-files` 的权限拒绝对 root 无效；agent-config 与 rule-templates 的恢复/回读失败原因未查明。这些问题定位之前，云端 `npm test` 结果只能作为参考，不能替代本机回归。详见 [云端基线回归交接](docs/agents/handoffs/2026-09-30-claude-cloud.md)。

```bash
for f in tests/browser.mjs tests/accessibility.mjs tests/migration.mjs tests/history-capacity.mjs tests/*-browser.mjs; do echo "== $f"; node "$f" || echo "FAIL $f"; done
```

视觉脚本 `node tests/visual.mjs <标签>` 只作辅助，不能替代真人视觉验收。

## 3.5 发起方式与额度（2026-09-30 查证）

- **用 `claude --cloud "任务描述"` 发起普通云端会话**（本机命令行 2.1.285 及以上；在仓库目录运行，云端克隆 GitHub 上的当前分支，所以先推送）。普通云端会话优先消耗账户的一次性云端额度（Pro 为 $100，11 月 5 日过期），用完后再用套餐额度。
- **不要用 routine（定时任务接口）派活**：云端额度不适用于 Routines 和 Projects，routine 发起的会话消耗的是 Pro 套餐用量。2026-09-30 前 6 个云端任务都是 routine 发起的，额度一直停在 $100，这是教训。来源：[didcodexreset](https://didcodexreset.com/news/8d242daab48b4e8c945d230a.html)、[官方文档 · Use Claude Code in the cloud](https://code.claude.com/docs/en/claude-code-on-the-web)。
- 给进行中的云端会话追加消息：`claude -p "消息" --cloud <会话ID或链接>`。命令行登录过期时，需要用户本人运行 `claude auth login`。

## 3.6 云端已知失败的根因（C2 诊断，分支 `cloud/2026-09-30-env-diff`）

- `server/config-file.mjs` 的元数据核验在非 macOS 平台上**有意拒绝写入**。在 Linux 云端，所有“写入配置 → 回读”的测试都会失败：agent-config 恢复类、rule-templates 4 个与 D-R5 挂起、D-R6，以及 agent-config-browser、rule-templates-browser、rule-templates-fix-browser。这不是产品缺陷。
- 本机专有工具依赖 3 个：plutil、ChatGPT.app、wiki-local。root 权限造成的 1 个：skill-files 权限用例；以普通用户运行即可消除。
- interaction-browser 与 search-browser 在云端偶尔超出时间阈值，属于机器性能差异。
- 结论：**云端回归只对照已知失败集看增减**。涉及配置写入、规则装入的改动，必须在本机（macOS）验证后才能合入。

## 4. 任务提示词模板

```text
【项目】personal-ai-workbench（云端副本，非权威）。先读 CLOUD-SESSIONS.md、AGENTS.md，再读本任务涉及的契约文件。不读也不改 CURRENT.md。
【基点】分支 main @ <提交哈希>。新建分支 cloud/<日期>-<主题>，结果以 PR（草稿）回报。
【任务范围】<要做什么；允许修改的文件清单>
【验收标准】<可验证的条件：哪些命令、哪些断言、需要复现几次>
【运行方式】先 `export NVM_DIR=/opt/nvm; . "$NVM_DIR/nvm.sh"; nvm use 24`；npm test 外层加 `timeout 1200`（rule-templates.test.mjs 在云端会挂起）；结果与云端已知失败集（CLOUD-SESSIONS §3）对照，只报告增减。
【禁止事项】不改范围外文件；不改测试凑通过、不加长超时、不跳过用例；不接收费模型/外部服务；不推 main；不读凭据或任何真实数据。
【回传证据】新增 docs/agents/handoffs/<日期>-cloud-<主题>.md，写明：基点提交、改动文件及前后 SHA256、执行的命令与首次原始结果（通过/失败/未执行）、失败原文、未完成项与风险。命令输出较长时放 PR 描述或分支内 docs/agents/handoffs/cloud-<主题>-logs/ 纯文本，不放截图目录。
```

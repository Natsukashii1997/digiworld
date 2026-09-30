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
| Node | ≥ 24（`package.json` engines）；镜像默认版本不足时在启动脚本用 nvm 安装 24 |
| 环境变量 | `PLAYWRIGHT_MODULE=playwright`（浏览器脚本默认指向本机绝对路径，云端必须覆盖） |
| 网络 | 需能访问 npm 仓库与 Playwright 浏览器下载地址；以实测为准 |
| 启动脚本 | 见下 |

```bash
npm ci
npx playwright install --with-deps chromium
npm run build
```

`dist/` 不入库；`npm test` 中的 `digital-world-ui.test.mjs` 与全部浏览器脚本都依赖构建产物，所以启动时必须 build。

回归入口：

```bash
npm test
```

```bash
for f in tests/browser.mjs tests/accessibility.mjs tests/migration.mjs tests/history-capacity.mjs tests/*-browser.mjs; do echo "== $f"; node "$f" || echo "FAIL $f"; done
```

视觉脚本 `node tests/visual.mjs <标签>` 只作辅助，不能替代真人视觉验收。

## 4. 任务提示词模板

```text
【项目】personal-ai-workbench（云端副本，非权威）。先读 CLOUD-SESSIONS.md、AGENTS.md，再读本任务涉及的契约文件。不读也不改 CURRENT.md。
【基点】分支 main @ <提交哈希>。新建分支 cloud/<日期>-<主题>，结果以 PR（草稿）回报。
【任务范围】<要做什么；允许修改的文件清单>
【验收标准】<可验证的条件：哪些命令、哪些断言、需要复现几次>
【禁止事项】不改范围外文件；不改测试凑通过、不加长超时、不跳过用例；不接收费模型/外部服务；不推 main；不读凭据或任何真实数据。
【回传证据】新增 docs/agents/handoffs/<日期>-cloud-<主题>.md，写明：基点提交、改动文件及前后 SHA256、执行的命令与首次原始结果（通过/失败/未执行）、失败原文、未完成项与风险。命令输出较长时放 PR 描述或分支内 docs/agents/handoffs/cloud-<主题>-logs/ 纯文本，不放截图目录。
```

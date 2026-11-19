# 本项目 Agent 入口

适用范围：此目录及其子目录。Codex 与 Claude 使用同一份源码和状态，不建立各自独立的“最新版”。本文件只补充项目规则，不覆盖更高优先级指令或用户当轮授权。

## 每次接手

1. 先读 [CURRENT.md](CURRENT.md)：核对状态编号、当前写入者、最新交接和唯一下一步，不凭聊天记忆继续。
2. 读 [COLLABORATION.md](COLLABORATION.md)：执行共享目录的认领、并发避让、变更核对与交接规则。
3. 首次接手读 [项目交接说明](PROJECT-HANDOFF-CLAUDE-2026-09-28.md)，之后只读当前任务涉及的切片契约和证据。历史交接不是实时状态。

## 持续约束

- 产品是常浩个人 AI 体系的**信息驾驶舱**（[产品定义 v2.0](docs/product/2026-11-07-产品定义-v2.0-信息驾驶舱.md)，2026-11-07）：项目、自建 Skill、Agent 只读展示，只有 Prompt、普通规则模板、工作流/设计素材、随手记等自有数据可写；不写真实 Agent 配置与正式指令，不生产 Skill，不改造成另一个聊天工作台或执行器。
- 当前视觉是“数码世界”UI v4（2026-09-28 用户决定并全权委托 Claude 实现，见 `PRD.md` §10.5）。设计令牌在 `src/tokens.css`（UI v18 阶段 1 起唯一定义处，基础件在 `src/components.jsx` 与 `src/base.css`），像素素材在 `src/pixel.jsx`，页头文案在 `src/pages.js`。`UI-ROLLBACK.md` 与数码 v1/线稿版只作历史参考。功能任务不顺带改视觉；控件至少 44px、窄屏无溢出、outline 焦点等可访问性约束由浏览器回归脚本守护。
- 工作台保存资产及关联；项目 Current、Obsidian 正文、Agent 原生配置各有事实源，不静默复制出第二套权威。
- 保留固定版本、来源追溯、revision 冲突、权限和目录身份校验、预览确认、写后回读、未知结果先查询及恢复留痕。不能以“简化”为由移除这些业务语义。
- 代码协作不授权读取真实 Vault、凭据、Agent 私人会话，或写真实 Agent 配置、知识库、外部账户。测试使用合成资料及隔离适配器；临时 data 目录本身不能隔离真实扫描。
- 保留用户和另一 Agent 的未提交变化。Git 根可能位于上级目录；不对上级仓库批量 add、clean、reset、stash，不自动提交或推送。
- 文件修改、自动测试、运行服务采用、真实使用、用户验收分别报告；不以版本号、页面存在或测试数量代替总体完成。

## AI 接入

按全局规则 P-13（2026-11-07）。本节与 `GET /api/ai-access`（`server/ai-access.mjs`）内容一致，改 AI 功能时两处一起改；设置页「AI 接入」一栏在第 2 批做（要等 I-DW-5 和 UI 改版完成）。盘点与分批计划见 [2026-11-07 交接](docs/agents/handoffs/2026-11-07-claude-ai-access-batch1.md)。

**执行方**（状态以接口为准；CLI 只查是否安装，登录和额度未检查；Key 只显示配置状态，不读钥匙串）：

| 执行方 | 接入方式 | 说明 |
|---|---|---|
| Claude Code | 本机 CLI | 命令 `claude`，本机登录的订阅 |
| Codex | 本机 CLI | 桌面版内置 Codex（`ChatGPT.app` 里的 codex app-server），找不到就报错，不改用其他版本 |
| Claude（官方 API） | 官方 API | `claude-haiku-4-5-20251001`，Key 存 macOS 钥匙串 |
| OpenAI（官方 API） | 官方 API | `gpt-6.1-sol`，Key 存 macOS 钥匙串 |

**默认执行方**：目前只有逆向工程跟随，值存在工作区 `reverseSettings.executor`（Codex / Claude Code / 仅 REA，未设置时为 Codex），在逆向页「执行器」切换，下一次运行生效；第 2 批迁到设置页，不另存第二份。

**功能清单**：

| 功能 | 执行方 | 接入方式 | 读哪些数据 | 产出写到哪里 | 去留 |
|---|---|---|---|---|---|
| 逆向工程 · AI 逆推 | 跟随默认（Claude、Codex 都支持） | 本机 CLI | 授权的目标路径、REA 只读取证、已有摘要 | 工作台私有运行目录 → 逆向记录；每条运行记执行方 | 保留（I-DW-8 产出改道 my-skills 候选） |
| 读书摘要 / 划线 / 问答 | 单独指定：仅支持官方 API（Claude Haiku 4.5 / OpenAI gpt-6.1-sol），因为要按价格白名单逐次预留费用 | 官方 API | 登记书的有界正文 | 私有结果文件；操作日志记提供方、模型、用量、费用 | 待定（I-DW-9） |
| 夜巡 v1 | 仅支持 Claude：预算控制只核实过 Claude 官方 CLI | 本机 CLI + 官方 API Key | 项目内登记的只读文件 | 工作台输出目录 | 建议下线（I-DW-9），不做设置 |
| 夜巡 v2 | 每个槽位 Claude / Codex | 本机 CLI（生产未接适配器） | 项目 worktree | 夜间分支与晨报 | 建议下线（I-DW-9），不做设置 |
| 知识整理任务包 | 仅支持 Codex：任务包按 Codex 原生环境编写 | 应用不调用，本人在 Codex 里跑后导入 | 选中的知识源资料 | 导入为候选，不写回 Vault | 待定（I-DW-9） |

接力包只生成文本，由本人贴给 Agent，不算 AI 产出。视频转写（本机 SenseVoice，失败改用 macOS 系统识别）和图片文字识别（macOS Vision）是本机模型，不外发，不属于可切换执行方。

**对外开放**：

| 接口 | 对谁 | 能读 | 能写 | 在哪关 |
|---|---|---|---|---|
| 个人说明 MCP（HTTP，仅 127.0.0.1:5179） | 本机已注册的 Codex、Claude Code、Hermes、OpenClaw | `read_profile`、`search_knowledge`、`read_note` | `propose_profile_change`（只进待采纳）、`reverse_report`（回执只进待过目） | 环境变量 `WORKBENCH_MCP_PORT=off` 后重启 |
| 收藏集 MCP（stdio） | 本人注册了它的 Agent | `search_saved_notes`、`read_saved_note` | 无 | 在对应 Agent 里注销 |

**数据对象**（只读，不进切换）：本机会话（接力用）、Skill 使用统计、MCP 使用统计、Agent 发现与清单、MCP 注册自检、AI HOT 资讯、驾驶舱 Agent 页与规则页（`GET /api/cockpit/agents`、`/api/cockpit/rules`，只读本机 Agent 配置摘要与规则来源，#74）、项目关系页（`GET /api/projects-space/relations`，只读名册 type / relations、各项目 AGENTS.md 对底座的引用、Skill 使用统计与近 30 天提交，#78）、资产仓库 Skill 页（`GET /api/my-skills`，只读 my-skills 的 links.tsv、各 SKILL.md 头部与 git 提交日期，以及 agent-kit 的 skill-usage.jsonl 调用记录（只记 Claude 端）；不写 my-skills，#93）。

Agent 配置、模型配置、Skill 启停、迁移、挂载修复、交付目标改的是外部 Agent 的文件，不属于本节，按 D-A 在 I-DW-5/6 下线。

## Agent skills

开发流程用 Matt Pocock skills（`~/.agents/skills/`）：大活走 `to-spec` → `to-tickets` → `implement` / `tdd` → `code-review` → PR；小改（一张 issue、一天内做完）跳过 `to-spec`。Claude 用 `/技能名`，Codex 用 `$技能名`；这几个技能只在点名时加载，不会自动触发。

### Issue tracker

需求、规格与任务用本仓库 GitHub Issues。见 `docs/agents/issue-tracker.md`。

### Triage labels

五个默认分流标签。见 `docs/agents/triage-labels.md`。

### Domain docs

single-context：根目录 `GLOSSARY.md` 与 `docs/adr/`，用到时再建。见 `docs/agents/domain.md`。

改动怎么走、分支怎么起名、交接写在哪、怎么合并：见 `/Users/nat/Documents/ChatGPT/个人/work/agent-kit/工程流程.md`。

## 每次结束

按 `COLLABORATION.md` 保存可追溯交接，更新唯一的 `CURRENT.md`，回读确认后释放认领。聊天答复不能代替项目状态更新；未收到另一 Agent 的读回确认，不能声称它已接手。

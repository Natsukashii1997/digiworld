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

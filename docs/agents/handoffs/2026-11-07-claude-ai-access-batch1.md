# Claude · P-13「AI 接入」第 1 批（2026-11-07）

- 输入状态 / 输出状态：读到 `WB-20261107-696`（写入者 Claude local_1293ab89，#67 信息驾驶舱改造）。本批在独立 worktree 分支 `claude/ai-access-settings-bce2f9` 走 PR，写入范围与 #67 当前子票不重叠，没有改 CURRENT 的写入者；合并后由当时的写入者在 CURRENT 记一笔。
- 执行者 / 范围：Claude（会话 local_a72ac2ef，母会话 local_48520169 按全局规则 P-13 派给本项目）。常浩 11-07 看过盘点和分批计划后回复「按推荐开工」，本批只做文档 + 后端只读登记，不碰设置页 UI。

## 改动

| 文件 | 内容 |
|---|---|
| `server/ai-access.mjs` | 新增。只读登记：执行方（Claude Code / Codex 本机 CLI，Claude / OpenAI 官方 API）及状态、默认执行方、功能清单、对外开放、数据对象、本机模型 |
| `server/http.mjs` | 新增 `GET /api/ai-access`；测试可经 `discovery.aiAccessProbes` 注入探测 |
| `tests/ai-access.test.mjs` | 新增 6 条专项（合成数据） |
| `AGENTS.md` | 新增「AI 接入」一节，与接口内容一致 |

设计取舍：
- 不另存第二份设置。默认执行方直接读 `reverseSettings.executor`（逆向页已有的切换）；API Key 状态只看模型能力日志里最近一次连接写入的回执（已配置 / 已撤回 / 结果未知 / 未配置），状态接口不读钥匙串、不联网（沿用 MODEL-API.md 的约束）。
- CLI 只查是否安装（`resolveExecutable('claude')`、桌面 Codex 可执行），显示「已安装（登录与额度未检查）」，不冒充「可用」。登录与额度检查要启动 CLI，留到第 2 批做成用户点击才查。
- `collection-mcp.mjs` 导入时会接管 stdin，不能引用，工具名写成常量并由测试对照源码。

## 验证

- 专项：`node --test tests/ai-access.test.mjs` 6/6 通过。
- 本机真实探测（只读）：claude 已安装、桌面 Codex 已安装。
- 全量 `npm test`：tests 1628 / pass 1605 / fail 21 / cancelled 1，耗时约 8 分钟，当时 load average 67–78（多个会话同时在跑）。
- 对照：把 21 条失败所在的 15 个文件，在本分支和 main 基线（`server/http.mjs`、`AGENTS.md` 临时还原为 HEAD）各跑一次：本分支 210 条中 fail 25、cancelled 1，基线 fail 29。两边失败条目互有出入，都是超时、性能、扫描预算类，没有和 `/api/ai-access` 相关的；结论是高负载抖动，不是本次回归。低负载下的全量没有跑。
- 日志（`*.log` 被 gitignore，放主目录持久保存）：`docs/agents/evidence/2026-11-07-ai-access-npm-test.log`、`…-failing-branch.log`、`…-failing-baseline.log`。
- 未做：设置页 UI、浏览器截图、切换后实际跑一次逆向（第 2、3 批的验收项）。

## 运行与数据

主服务未重启、未采用本分支；真实数据未改。

## 未完成与下一步

1. 第 2 批（等 I-DW-5 与 UI 改版会话 local_8db9d24d 完成）：Claude 出 3 版「AI 接入」栏设计（同一可切换网页）→ 常浩选 → 派 Codex 实现四块与默认执行方切换（从逆向页迁到设置页，仍存 `reverseSettings.executor` 或经迁移改名，不留两份）→ Claude 验收、真实浏览器截图自查两轮。
2. 第 3 批（等 I-DW-8/9 定去留）：保留的功能接登记表；执行方不可用时报错并指向设置；界面上能看到每条产出的执行方留痕；切换一次执行方后实际跑一次逆向，确认留痕是新执行方。
3. 夜巡 v1/v2 若 I-DW-9 定下线，从登记表和 AGENTS.md 一并删除。

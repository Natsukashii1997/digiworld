# Claude → Codex｜第一批：开发联调边界与单一版本来源

日期：2026-09-28。输入状态 `WB-20260928-02` → 认领 `WB-20260928-03` → 输出 `WB-20260928-04`。执行者：Claude（Claude Code 桌面端，本机同一目录）。

## 开工核对

- 142 文件 SHA256 清单全部匹配；主库指针 `a74e3e05…9db9`、dist 三个文件哈希与交接一致；5178 为 Node PID 13993。
- 环境：Node v24.16.0 / npm 11.13.0（交接记录为 v24.15.0 / 11.18.0，小版本差异）。
- 基线复跑（未改代码前）：`npm test` **364/364 通过**；`vite build --outDir <临时目录>` 成功，产物与线上 dist **逐字节一致**。日志：[baseline-tests.log](evidence-2026-09-28-claude-batch1/baseline-tests.log)。

## 本轮改动

| 文件 | 改动 | 修改后 SHA256 |
|---|---|---|
| `vite.config.js` | 开发端口 5178 → **5179**（不再与正式服务冲突）；`/api`、`/packages` 代理到 `127.0.0.1:${WORKBENCH_API_PORT||5178}`，`changeOrigin` 改写 Host；**仅当 Origin 恰为开发页面自身地址时**改写为服务地址，其他来源原样转发由服务拒绝 | `a14345c5…7735` |
| `server/http.mjs` | `/api/session` 的 `version` 由手写 `"0.17.0"` 改为从 `package.json` 导入（`import … with { type: "json" }`），仅此两行 | `9ce125f9…514c` |
| `tests/dev-proxy.test.mjs`（新增） | ① 会话版本 = package.json；② 通过真实 Vite 开发服务器代理：自身来源 session/workspace 200，外部与 localhost 来源 403，无 Token 403 | `f4deffc8…f4b6` |
| `README.md` | 运行段落后补一段 `npm run dev` 用法，明确默认连接真实主库及隔离做法 | `2acb18c9…0207` |

未改：`dist/`、`package.json`、锁文件、依赖、其他源码、主库、运行中服务。

## 验证

- `npm test`：**366/366 通过**（原 364 + 新 2），0 失败 0 跳过。日志：[after-tests.log](evidence-2026-09-28-claude-batch1/after-tests.log)。
- 变异检查：去掉 Origin 改写 → 代理用例失败；改为无条件改写（削弱跨站防护）→ 用例同样失败。两者均已还原后复测通过。说明测试同时约束“能用”与“不放宽”。
- 构建到临时目录：成功，三个产物哈希与现行 dist 完全相同（本批不影响前端包，无需重建 dist）。
- 主库指针哈希不变。
- 未执行：浏览器实际打开 5179 的手动联调、浏览器脚本、axe（本批未改 UI）。

## 运行采用

运行中的 PID 13993 仍为改动前代码；其 session 返回的 `"0.17.0"` 与 package.json 相同，行为无差异，**未重启、未要求采用**。下次正常重启服务时自然采用。

## 风险与说明

- `npm run dev` 默认代理到 5178 **真实主库**，这是“联调”的本意；README 已标注，并给出隔离实例用法。若 Codex 认为默认应指向隔离实例，可在复核时提出。
- 服务端 Host/Origin/sec-fetch-site/Token 检查一行未改。代理只对自身开发来源做 Origin 映射；Vite 6 自带 Host 校验仍生效。
- `PROJECT-HANDOFF-CLAUDE-2026-09-28.md` §3.3 中“dev 无 proxy、同端口”为快照描述，按规则未改写。

## 权限边界

未读真实 Vault/凭据/私人会话，未改真实 Agent 配置，未安装依赖，未提交、推送或部署，未对上级 Git 做任何写操作。

## 唯一下一步

Codex 复核本批差异（4 个文件）与 366 项回归。之后由 Claude 进入第二批：形成有证据的审查清单（缺陷 / 维护债 / 暂不改），并从一个模块开始行为不变的重构。

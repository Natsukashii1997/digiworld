# 云端交接：两处历史偶发失败的根因定位（因用户要求提前结束）

- 日期：2026-09-30；执行者：Claude Code 云端会话（定时任务触发）
- 基点：`main @ 6d93fd6`；分支：`cloud/2026-09-30-flaky-root-cause`
- 云端副本，非权威；未改 CURRENT.md / COLLABORATION.md / AGENTS.md / CLAUDE.md，未写交接编号。

## 结论

| 项 | 是否复现 | 根因 | 是否改测试 |
|---|---|---|---|
| (a) `tests/skill-copies-browser.mjs:502–507` 等待 `/api/workspace` 回读 5 秒超时 | **未复现**（无资源争抢 0/30） | **未查明** | 否 |
| (b) `tests/usage-browser.mjs` “取消反馈”点击不稳定（62/92/327/513 行附近） | **未复现**（无资源争抢 0/30） | **未查明** | 否 |

用户中途要求停止后续实验，以下步骤**因用户要求提前结束而未完成**：资源争抢组 30 次复现、探针/`page.route` 机制实验、测试同步点修改、修改后复跑、全部浏览器脚本回归对照。按任务约束，在没有根因证据的情况下未凭推测修改测试。

## 环境

- Node v24.21.0（`/opt/nvm`），`PLAYWRIGHT_MODULE=playwright`，`dist/` 已构建；4 核；以 root 运行。
- 未安装 `stress`/`stress-ng`（争抢组本打算用并行跑其他脚本替代，未执行）。

## 复现结果（修改前）

| 组 | 脚本 | 次数 | 失败 | 失败率 | 单次时长 |
|---|---|---|---|---|---|
| 无资源争抢，单独进程串行 | skill-copies-browser.mjs | 30 | 0 | 0% | 22.2–38.8 s（首次冷启动 38.8 s，其余 22–25 s） |
| 无资源争抢，单独进程串行 | usage-browser.mjs | 30 | 0 | 0% | 25.0–27.8 s |
| 有资源争抢 | 两个脚本 | — | — | 因用户要求提前结束而未完成 | — |

修改后结果：未修改测试，无此项。

## 已做的代码阅读（非证据，仅供后续实验参考）

(a) skill-copies：
- `SkillCopies.jsx` 的 `readPreview()` 顺序为 `request("/skill-copies/preview")` → `request("/workspace")` → 检查 `ticket`。`changeSelection()` 只调用 `invalidate()`（序号 +1、解锁），不 abort 请求，所以按代码迟到预览放行后仍应发出 `/workspace` 回读。
- 测试 `readback` 是在切换选择之后、`release()` 之前注册的 `waitForResponse`，匹配任意 `/api/workspace` 响应；超时意味着 5 秒内没有观察到这次响应。
- 仍待验证的候选（均未取得证据）：`route.fulfill` 后浏览器端 preview fetch 未正常解析（`catch` 在序号过期时静默，无 pageerror 不能证明链路完整）；`{ times: 1 }` 路由撤销与后续请求重叠（Codex 复核 §4.5 提出）。

(b) usage：
- 历史仅有一次记录（`2026-09-29-claude-2.3-fix.md`：“取消反馈”按钮 10 秒未稳定可点，随后 15/15 通过），其引用的原始日志 `evidence-2026-09-29-claude-2.3-fix/scripts/usage-browser.log` 不在本仓库副本中，无法查看当时的 Playwright 调用日志。
- 本轮未对该按钮的渲染/禁用状态加探针。

## 改动文件

仅新增文档与日志，未修改任何测试或产品代码。

| 文件 | 修改前 SHA256 | 修改后 SHA256 |
|---|---|---|
| tests/skill-copies-browser.mjs | 4b1788430f3e721d095d6ccca3921109844dd785194914f071c5b333cb849ba4 | 同左（未改） |
| tests/usage-browser.mjs | 7b2ef445a865c96ee054cddf374be200a77048b1857914b5d2044de9e788bfb7 | 同左（未改） |

新增：本文件、`docs/agents/handoffs/cloud-flaky-logs/{sc-base,us-base}-{summary,raw}.txt`。未创建探针副本（`cloud-flaky-probes/` 为空，未入库）。

## 命令与首次原始结果

每条命令前均执行 `export NVM_DIR=/opt/nvm; . "$NVM_DIR/nvm.sh" >/dev/null; nvm use 24 >/dev/null`。循环脚本（scratchpad 中的 `loop.sh`）对每次运行执行：

```bash
timeout 240 node <脚本> > run-<i>.txt 2>&1   # 记录退出码与时长
```

分段外层 `timeout 590`：

```bash
loop.sh tests/skill-copies-browser.mjs sc-base 1 1     # 首次：rc=0, 38.8s
loop.sh tests/skill-copies-browser.mjs sc-base 2 14    # 全部 rc=0
loop.sh tests/skill-copies-browser.mjs sc-base 15 30   # 全部 rc=0
loop.sh tests/usage-browser.mjs us-base 1 1            # 首次：rc=0, 27.6s
loop.sh tests/usage-browser.mjs us-base 2 18           # 全部 rc=0
loop.sh tests/usage-browser.mjs us-base 19 30          # 全部 rc=0
```

（第一次尝试用 `/usr/bin/time` 计时，镜像中不存在该命令，退出码 127，未运行测试，随后改用上面的脚本。）

原始逐次输出：`cloud-flaky-logs/sc-base-raw.txt`、`cloud-flaky-logs/us-base-raw.txt`；逐次退出码与时长：`*-summary.txt`。

## 未完成项与风险

- **因用户要求提前结束而未完成**：资源争抢组各 30 次；机制探针与 `page.route` 控序实验；根因时序证据；测试同步点修改及修改后 30 次复跑；全部浏览器脚本各跑 1 次并与 CLOUD-SESSIONS §3 已知失败集对照。
- 0/30 不能证明问题已消失：历史失败率约 3/31～5/85（skill-copies）且集中在本机 CPU 负载下，usage 仅 1 次历史失败；30 次样本下即便真实失败率约 5% 也有约 21% 概率全部通过。
- 两处偶发问题仍为“待验证、未定位”，不称已修复，也不能证明与 UI 改版无关。
- 云端（Linux/root/4 核）与本机 Mac 时序环境不同，云端未复现不代表本机不复现。

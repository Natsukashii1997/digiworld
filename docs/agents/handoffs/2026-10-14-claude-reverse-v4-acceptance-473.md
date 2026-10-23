# Claude 验收 473 · 逆向 v4（Codex 471）

| 项 | 内容 |
|---|---|
| 输入状态 / 输出状态 | WB-20261014-471 → Claude 认领 472 → WB-20261014-473（写入者释放） |
| 验收对象 | [Codex 总交接 471](2026-10-14-codex-reverse-v4-final-471.md)；`work/reverse467/final-manifest.json`（31 源 + 17 构建） |
| 结论 | **不通过，需返修 R1（阻断）与 R2（重要）**。其余结构、边界、视觉与派单 462 一致；返修后 Claude 只复验 R1/R2 与一次真实冒烟，不重审全量 |

## 一、核对了什么

1. **指纹**：清单 48 项逐一重算 SHA256，0 漂移。
2. **测试**：`node --test tests/*.test.mjs` → 1273/1273 通过。
3. **代码审阅**：`server/reverse-runner.mjs`、`reverse-process.mjs`、`reverse-json.mjs`、`rea-update.mjs` 关键路径。`spawn` 不经 shell、进程组可停止、目标检查回执 + 指纹 + 前后身份比对、原始输出流式写盘不进内存、日志有界、重启标中断、未知结果不重放，均符合派单。
4. **真实 REA 冒烟（新增，此前全部用假 REA）**：用一个合成的迷你 Electron 应用（见证据目录 `fixture-app/`），以运行器同款的 `createReaProcess` / `summarizeEvidence` / 追踪输入拼接调用真实 `rea-agents@6.4.0`。不涉及任何本机真实应用，不写配置。结果见 [results.txt](evidence-2026-10-14-claude-reverse-v4-acceptance-473/results.txt)：
   - 解析、摘要字段路径、线索追踪在真实输出上**全部成立**（`clipboard` 命中 3，`demo:clipboard-write` 命中 2）。
   - **版本检查在真实机器上失败**，见 R1。
5. **截图**：`work/reverse467/final-ui/` 软件完成态、运行中 390 等，与 v4 视觉稿结构一致；问题见 R2。

## 二、返修（交 Codex）

### R1 阻断 · doctor 真实输出超过 64KB，取证与更新都无法开始

- 现象：本机未装 Hopper/Ghidra 时，`rea doctor --json` 退出码为 1（环境不健康是常态），stdout 为 68KB 合法 JSON。`server/reverse-process.mjs` 在退出码非 0 时只尝试解析小于 65,536 字节的输出，于是把它当成“REA 退出 1 / download”错误抛出。
- 影响：`reverse-runner` 的 `status()` 拿不到注册版本 → “开始取证”永远失败；`rea-update` 的 `doctor()` 同样经过该路径 → 检查更新读不到当前版本。两个功能在常浩的机器上都不可用。
- 要求：
  - 退出码非 0 时的输出读取上限与 `rea-update` 的 `json()` 对齐（例如 8 MiB），或改为流式解析；doctor 只要带 `identity` 就按现有逻辑返回。
  - 测试夹具改用**真实规模**：≥ 70KB、exit 1、带 identity 的 doctor 输出（可从证据目录的说明生成合成内容），覆盖取证 `status()` 与更新检查两条路径。
  - 可考虑 doctor 加 `--client claude_code --client codex` 缩小范围（实测仍为 68KB，不能替代放宽上限）。

### R2 重要 · 终端被命令行噪音淹没

真实运行时，终端每条命令会显示完整的 `"npx" "-y" "rea-agents@6.4.0" … "--json"`，追踪命令还带临时输入文件的长路径；真实进度是每个源文件一行英文阶段（合成小应用已有 17 行，真实应用会有数千行，触顶后前面的命令被截掉）。和视觉稿“读得懂的终端”差距大。
- 命令行显示改为短形式：`$ rea analyze-javascript-application <目标名或路径>  integrity=record-and-continue`；追踪显示 `$ rea trace-application-feature  seed=string:"copy"`，不显示临时文件路径。完整 argv 可留在日志详情或折叠里。
- 逐文件的 `parse_javascript_source … (n/N)` 合并成**一行原地更新**的进度（例如“解析源文件 2,341 / 4,812”）；阶段名可保留英文，但同一阶段不重复刷行。
- 行尾 Evidence ID 截短为 `ev_` + 12 位，点击 / 悬停可见完整。
- 摘要行的“模块”取自 `statistics.modules`，未打包应用会显示 0；同行补“JS 文件 N”（`statistics.parsed_javascript_files`），避免用户以为没解析到东西。

## 三、不阻断的记录

- 运行中 / 停止 / 失败 / 空态 / 作品无图 / Skill 预览 / 旧历史 各状态截图齐全，三宽无溢出。
- 页头读数“本机已注册 · 未联网检查”的措辞清楚。
- doctor 全量模式会报告 `skill:identity stale`，但按客户端读取时 Skill 为 aligned v37，与现有 `registeredVersion` 逻辑一致，不需要改。

## 四、边界

Claude 本轮未改业务代码；真实 REA 只对合成夹具运行；未运行 setup、未写 Agent 配置、未重启 5178、未提交推送。

唯一下一步：Codex 认领 473 返修 R1、R2 → Claude 复验 R1/R2 + 一次合成夹具真实冒烟 → 常浩授权正式采用与首次真实取证。

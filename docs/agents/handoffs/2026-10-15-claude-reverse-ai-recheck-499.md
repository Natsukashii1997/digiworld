# Claude 复验 499 · R4 / R5（Codex 497）

| 项 | 内容 |
|---|---|
| 输入状态 / 输出状态 | WB-20261014-497 → Claude 认领 498 → WB-20261015-499（写入者释放） |
| 结论 | **通过**。R4、R5 达标；最终组合真实 Codex + REA 端到端成功。可由常浩授权正式采用并重启 5178 一次 |

## 核对

1. 清单 `work/reverse496/manifest.json`：56 项（含候选构建按 candidate-dist 校验）0 漂移。
2. 全量 `node --test --test-concurrency=4 tests/*.test.mjs`：1302/1302。
3. **真实 Codex 冒烟（工作台原生 `createAiProcess`，不是手工复现）**：正式服务同一 node、`PATH=/usr/bin:/bin`，运行目录故意放在**中文路径**下复现正式数据目录；目标为 473 合成夹具。脚本与完整日志见 [证据目录](evidence-2026-10-15-claude-reverse-ai-recheck-499/)。
   - 322 秒完成；返回 6 条结论（均带真实 64 位 Evidence ID）、6 项未知、3,882 字任务包，通过严格校验。
   - REA 工具轨迹：analyze → inspect / trace（两次参数不当的调用失败后由 Codex 自行改正重试）→ 成功；**无 Swift trap、无 ps 清理错误、无拒写报错**。
   - `~/.codex/config.toml` 前后 SHA 一致；夹具 5 个文件 mtime 与 SHA 前后一致。
   - 用量：输入 399,364 / 输出 6,600 tokens（CLI 未给金额）。
4. R5：菜单里 Codex 为蓝紫色应用图标（`src/brands/codex.png`，来源记录在 `src/brands/SOURCES.md`）。

## 给常浩的使用提示

- 一次 Codex 逆推实测约 5 分钟、约 24 万–55 万输入 token（大部分命中缓存）、几千输出 token。目标越大越多。
- 菜单里的 Claude Code 尚未做真实验证（常浩暂缓），先用 Codex。
- 未验证项（不阻断）：编译中途取消时 Swift 独立进程组是否随之停止。

## 边界

Claude 未改业务代码；真实 Codex 只分析合成夹具；未重启 5178、未提交推送。

唯一下一步：常浩授权正式采用 497 候选并重启 5178 一次 → 用炉子网页版做首次真实逆推（需先按页面提示开独立调试 Chrome）。

# 逆向v4 · 段1交接468

输入466/认领467 → 输出WB-20261014-468；Codex继续持有写入权，直接进入段2。

## 交付
- 新REA运行器、参数数组进程适配、流式JSON摘要；Electron按固定注册版本取证并逐词trace，网站精确匹配CDP页面→bundle，网站不支持应用图trace明确标注。
- /api/reverse/target/check返回内存路径检查凭证；start/stop/query/status接口，单运行、10分钟总预算、进程树终止、目标前后和最终提交绑定、磁盘失败/重启中断。日志双上限2000行/200KiB，原件仅data/reverse-evidence。
- 主库新增受限reaRuns；普通PUT不能伪造，旧记录不迁移，显式备份导入只允许新增记录；完整备份明确排除原证据并保留摘要日志。
- 本段为服务与领域能力；用户终端界面由紧接的段2接入。

## 验证
- 55/55相关回归；1253/1253全量单元串行通过。build隔离到work/reverse467/stage1-dist，正式dist未变。
- 8MiB假REA真实子进程：流式写盘、progress、摘要/线索；停止后孙进程清理、超时、关闭启动等待、磁盘失败、取证中目标改变、复开中断、日志上限、备份排除。
- 原始首败保留stage1-first/second/third.log：测试URL编码、目录祖先mtime误报、沙箱回环端口；对应修正和授权合成回归见stage1-verified.log/stage1-full-unit.log。
- 独立只读复核6项已修；补充running启动中断及summary内层严格校验已修并进入最终55/1253回归。最终整体验收仍交Claude。

## 权限/未完成
未运行真实REA/doctor/setup，不读真实Agent配置/Vault；未安装、采用、重启5178或提交推送。GET464/按钮466及441待验保持。下一步段2v4页面、任务包与无评分门槛存Skill；再段3更新，全段完成交Claude验收。

# 终审优化本机采用交接265

输入 WB-20261007-264；输出 WB-20261007-265。2026-10-07 19:51 CST。用户本轮明确回复“授权采用”，对应将263优化候选更新到本机5178、受控重启并验证页面/API。该单次动作已完成，写入者释放。

## 结果

- 固定候选 `5db13532eafeba293bfa2b2e2a05da3d754ff782cc8aff3c9670fa7dd0cf3761` 已采用为项目 `dist`。16/16磁盘文件、6/6当前页面实际HTTP资源与263候选逐字节相同。独立复核其余655个冻结文件0漂移。
- 旧PID87163正常SIGTERM退出；新PID4755使用原Node24.16.0、项目cwd、data目录和127.0.0.1的5178/5179端口。没有新增常驻注册、强杀或清锁。
- 新 `/api/session` 主库身份、模型/共享池独立权限查询、受控执行列表及夜巡v2状态均回读。night/model/agent/vault/daemon、独立模型/共享池权限仍关闭；受控执行disabled，夜巡planning。
- 真实浏览器已确认设置ZIP/JSON用途、新建MCP配置表单、取消草稿、窄屏展开菜单后的实际导航，以及夜巡“当前仅规划，真实执行未启用”；本标签控制台error/warn为空。
- 主库 `data/CURRENT.json` 仅核SHA，重启及页面检查前后均为 `01c78dd6745fb96a3c49278f9f87545c91a360bcd66570ea99a840b879507064`；不据此声称整个data目录未变。会话token只在内存使用，未保存。

## 证据及恢复

证据根 `docs/agents/handoffs/evidence-2026-10-07-codex-adoption-264/`：runtime-before.json、scheduler-preflight.json、cutover.json、runtime-api-after.json、browser-readback.json、final-runtime-check.json。旧dist完整副本在 `rollback-dist/`；被替换旧目录另保留于 `work/adoption264-retired-dist`。本轮未触发回退，未验证自动回退。

初次把dist全部16文件作为HTTP资源检查，遇到10个未引用的 `theme/digievolution` 文件404；`static-route-first-check.json` 保留首败。当前HTML/JS/CSS没有引用它们，既有server不路由/theme，修正验证口径为16文件磁盘一致+6当前HTTP资源一致，没有改服务或删文件。UI首检定位和隐藏菜单命中问题见browser-readback；实际可见按钮路径已通过。

## 边界与下一步

沿用原已确认AIHOT每3小时读取设置，采用前核对尚未到期；未手动刷新、改周期或创建新调度。知识MCP已有只读开放保持原状。没有真实Agent配置、CLI执行、夜巡生产运行、Vault写入、安装、提交推送或向他人发送。

本次只闭合工作台运行采用层。263的1164/1164单元/API、106/106隔离浏览器和视觉证据仍对应相同源码与候选；本轮未重复跑全量。真实准入签发、原生加载、真实CLI/夜巡及真人/业务验收仍未完成，完整蓝图E03仍不通过。

唯一下一步：常浩刷新原工作台或打开已保留的5178页面，做日常使用验收；后续工程按 `优化后完整蓝图判定.md` 已列顺序另行推进。本轮不自动启动下一派单，不代签Claude或真人验收。

用户报告：`/Users/nat/Documents/Codex/2026-10-07/jie-s/outputs/本机采用结果.md`。此前工程历史：[交接263](2026-10-07-codex-audit-optimization-263.md)，本次授权：[认领264](2026-10-07-codex-adoption-claim-264.md)。

# Claude 640：阶段 1 发布到正式 5178（wb-20261023-638，回读通过）

| 项 | 内容 |
|---|---|
| 输入 / 输出状态 | WB-20261023-639 → 640 |
| 执行者 / 授权 | Claude。用户 2026-10-23 原话：“同意发布阶段 1 到正式 5178：按 626 的流程备份 data、生成 wb-20261023-638 快照、一次 bootout/bootstrap、回读，出问题就回滚到 626。” |
| 发布内容 | 提交 `8925f93`（阶段 1 底座 `5361d68`、伙伴屏读屏标签 `cc41ac5`、状态 637）。用 `git archive` 从提交导出，不读工作区，阶段 2 的提交都没带进去 |
| 复核 | `8925f93` 全量 1526/1526（`work/adopt638/full-suite.log`）；删掉的文件没有残留引用；前端能构建 |

## 步骤与结果（脚本 `work/adopt638/adopt.py`，沿用 adopt626）

1. **build**
   - 做法：git archive 导出；`node_modules` 链接到 `deps-20261016-539`，依赖锁文件与 626 一致；vite build。
   - 结果：候选包 436 个文件。和 626 比，服务端代码零变化；前端减少 36 个、增加 5 个，变化 12 个。
   - 增加的 5 个：`src/tokens.css`、`src/base.css`、新的 dist 产物 2 个、检查点 `0f03467` 里入库的 `browser-extension/collection.crx`（服务端不引用）。
   - 清单：`candidate-manifest.json`、`candidate-comparison.json`。
2. **prepare**
   - 核对：没有进行中的主库、逆向、REA 更新、原生会话、收藏导入或 GET 解析；服务没有子进程。
   - 备份 data（2756 个文件，803,608,646 字节）和 `server.plist`，放在 `work/adopt638/private-adoption-backup/`，目录权限 700、文件 600。备份前后 data 一致（不计 daemon-logs）。
   - 写入 `releases/wb-20261023-638`，设为只读。
3. **switch**：一次 bootout + 一次 bootstrap（`stop-intent` / `stopped` / `start-intent` / `started.json`）。plist 只改了 `WorkingDirectory` 和入口两项。
4. **verify**
   - 新进程 pid 18654（原 48730）。
   - 与切换前一致：data 目录与身份、主库指针与快照 SHA、revision 942、便签 13、收藏 13、扫描根、项目 50。
   - 快照文件树等于候选清单；首页与 dist 资源 9 个文件和快照逐字节一致（`http-readback.json`）。
   - 切换后 `server.stderr.log` 没有写入。
5. **实看**
   - 打开正式页面 `http://127.0.0.1:5178/#home`：侧栏按“捕获 / 炼化与出战”分区，页头是“00 基地”，伙伴屏在左下角，真实数据正常显示（资产 8、收藏 13、随手记 13）。
   - 控制台没有报错。

## 回滚

把 plist 的 `WorkingDirectory` 和 `ProgramArguments[1]` 指回 `releases/wb-20261023-626`，然后一次 bootout + bootstrap。备份在 `work/adopt638/private-adoption-backup/`（git 忽略，私人数据）。

## 未做与范围外

- 没有在用户的 Safari 网页应用里实际操作；没有检查用户当时打开的页面里有没有未保存的输入（便签草稿存在本机，服务重启约 2 秒）。
- 阶段 2（A/B/C/D 一）只在主工作区提交，没有发布。接续由新会话做，见[交接 639](2026-10-23-claude-stage2-wip-639.md)。

## 唯一下一步

新会话按交接 639 第 4 节做 D 批接线 → E → F。发布这一步已完成，跳过。

# Claude 477 · 逆向v4 R1/R2复验通过 + 收藏阅读页与逆向v4正式采用（线上逆向页受 PATH 阻断）

| 项 | 内容 |
|---|---|
| 输入 / 输出 | WB-20261014-475 → Claude 认领 476 → WB-20261014-477（写入者释放） |
| 对象 | [Codex475](2026-10-14-codex-reverse-v4-repair-475.md)（14源/17候选，清单 SHA `5faa4dcd…51c4`）；Claude 并行两项：[插件按钮](2026-10-14-claude-collection-buttons-ui.md)、[阅读页标签](2026-10-14-claude-collection-reader-tabs.md) |
| 结论 | R1 **通过**；R2 **通过**；合成夹具真实 REA 冒烟 **通过**。候选验收通过。用户随后授权「收藏阅读页 + 逆向v4」一起正式采用，已重建 dist、受控重启一次。**采用后线上逆向页版本检查 500（launchd 环境找不到 npx），交 Codex 返修 R3。** |

## 一、复验（证据目录 `work/claude-reverse476/`）

- 清单 14 源 + 17 构建逐项 SHA256：0 漂移。diff 审阅与 473 要求一致。
- 相关单元 `reverse-runner / rea-update / reverse-v4.test.mjs`：38/38（`related-unit.log`）。覆盖 >70KiB exit1 doctor 经真实子进程过 status/start 和更新检查、>8MiB 拒绝、坏 JSON/缺 identity 拒绝、3000 条进度合并、进度不跨命令/诊断。
- R2 三宽浏览器 `reverse-repair-browser.mjs` 通过；截图 `repair-ui/`（运行中单行进度、短命令、ev_+12 位、完整 ID 弹窗键盘/复制失败重试、完整命令折叠）。注意：首跑未设 `REVERSE_REPAIR_SCREENSHOTS`，覆盖写了 `work/reverse474/after-ui/` 的同名截图（同一测试同一候选，内容等价），第二次已写入本目录。
- **真实冒烟**（`real-smoke.mjs`、`real-smoke/smoke.log`、`completed-1440.png`）：隔离 fixture 服务+临时数据目录，真实 `npx rea-agents@6.4.0` 走运行器全链：doctor（真实 exit 1、68,569 字节、带 identity）→ 页头「本机已注册 6.4.0」→ 开始 → analyze（2.8s，`解析源文件 1/5→5/5` 原地替换）→ trace `clipboard` 3 命中、`demo:clipboard-write` 2 命中 → 摘要「模块 0 · JS 文件 3 · IPC 1 · 原生扩展 0」→ 完整 ID 弹窗、完整命令折叠含真实 argv、任务包含 JS 文件数 → 刷新后日志逐字一致。
- 不阻断建议（交 Codex 斟酌）：真实运行另有 13 个各不相同的英文阶段行，单行进度后仍较长；「解析源文件 5/5」与「JS 文件 3」口径不同（5 含 package.json/html），用户可能疑惑。

## 二、正式采用（证据 `work/claude-adopt476/`）

- 用户授权：重建并重启；获知会连带采用逆向 v4 后选择「一起采用」。
- 新构建 `work/claude-adopt476/dist` → 预检（夜巡/导入/视频/GET 均 0，服务无子进程，plist/node/数据身份核对）→ 旧 dist 移至 `before-live-dist` → `launchctl kickstart -k` 一次：PID 50894→55062，runs 9→10，返回 0；数据指针、plist、node、11 个关注源文件不变，dist 与候选一致（`restart-readback.json`）。
- 线上回读（`live-readback.json`）：收藏阅读页为「Get笔记解析 / 内容文稿」，内容从第 2 张图开始。**逆向页 `/api/reverse/status` 500**，页头 REA「—」并提示「本地服务处理失败」。其余接口无 4xx/5xx。

## 三、返修 R3（交 Codex，阻断逆向线上使用）

- 根因：LaunchAgent 环境 PATH 为 `/usr/bin:/bin:/usr/sbin:/sbin`，`npx` 在 `~/.nvm/versions/node/v24.16.0/bin`。`createReaProcess` 默认 `command='npx'` → spawn ENOENT（kind=launch）；HTTP 层把它当未分类错误返回 500，用户看不到「找不到 npx」。同一探针在登录 shell PATH 下成功（6.4.0 双客户端 aligned）。
- 旧正式前端从不调用该接口，问题随 v4 采用首次暴露；开始取证、检查更新同样会受影响。无数据写入。
- 要求：服务进程能稳定找到 npx（例如解析固定 node 同目录或已登记的绝对路径，不依赖登录 shell）；launch 类错误返回可读提示而非 500；补 launchd 精简 PATH 的测试。改 plist 属持久配置，需常浩另行同意。修好后需再授权一次重启。

## 四、边界

未改业务代码（仅两项用户安排的收藏改动，见各自交接）；真实 REA 只对合成夹具；未运行 setup/安装/更新、未写 Agent 配置、未联网检查更新、未做首次真实目标取证、未提交推送。全部 dirty 保留；旧 dist 前像在 `work/claude-adopt476/before-live-dist`。

唯一下一步：Codex 认领 R3（npx 路径与 launch 错误提示）→ Claude 专项复验 → 常浩授权再重启一次。

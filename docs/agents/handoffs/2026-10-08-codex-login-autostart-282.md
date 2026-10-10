# 本机登录自启与服务恢复交接 282

输入 `WB-20261008-279`；诊断与恢复认领 `280`，常浩追加“设置该项目为开机自启”后扩围认领 `281`；输出 `WB-20261008-282`。执行者 Codex。

## 原因与范围

- 2026-10-08 16:33 本机 `5178/5179` 均无监听；系统启动时间为当天 09:36:19，晚于交接 279 中 08:36 的运行记录。此前没有本项目固定 LaunchAgent，`launchctl print gui/501/cn.personal-ai-workbench.server` 返回 113。故本次无法访问由重启后服务未自动拉起造成，与切换 WiFi 无关。
- 本轮只恢复本机工作台并设置当前 macOS 用户登录后自启；不改产品逻辑、构建、Agent/Vault/飞书共享设置。一次 `nohup` 临时启动尝试立即退出且无日志，原因未追；随后以可控终端会话临时启动，确认 5178/5179 正常，再受控移交给 launchd。

## 实际动作

- 使用既有 Node `/Users/nat/.nvm/versions/node/v24.16.0/bin/node`、项目目录、真实 `data` 与现有 `dist` 临时启动。经产品能力设置预览与确认，只开启 `daemon` 授权，其他能力开关在预览中逐项保持原值。授权操作 `f14c0126-a72b-4e65-85fc-c71fdfd4006a`，回读 `verified`。
- 经产品常驻安装预览与确认，未带入任何额外环境变量。安装操作 `053ee956-b931-4c95-9e93-ca268c47adde` 初始为 `waiting_for_user_restart`，因本轮手动进程占用 5178；此时未冒称完成。配置文件 `/Users/nat/Library/LaunchAgents/cn.personal-ai-workbench.server.plist` 为本人 0600，SHA256 `8cfa108c5f2fd3ad631706378f15b465aa37d5b904e1865edbd11d3f85b590a8`，`plutil -lint` 通过。内容为固定 Node/项目/data/5178，`RunAtLoad=true`；MCP 不显式带入变量，沿用代码默认 5179。
- 核对临时 PID `56171` 的启动时间、cwd 和双端口后，向该可控终端发送 `Ctrl+C`，确认端口释放；执行 `launchctl bootstrap gui/501` 加载上述固定配置。新 PID `57322` 属于固定 Label，`launchctl print` 为 `state = running`。
- 更新 `README.md` 的本机启动说明：区分手动终端启动与设置中的登录后自启，避免原“未配置开机启动”文字误导。

## 回读与边界

- 新 PID `57322` 同时监听 `127.0.0.1:5178/5179`。5178 返回 HTTP 200，HTML SHA256 `4fcceb2748b7c565500eea55efa950c8cd5436b71bb1483d5e97a6af218b3afd`，与原 `dist/index.html` 相同；5179 `/mcp` 的 GET 返回预期 405，端口有服务响应。
- 产品 API 回读：数据目录为 `/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/data`，`daemon` 授权开启，配置已安装、已加载、PID `57322`；安装原操作查询为 `verified`。`data/CURRENT.json` SHA256 `6658b3434a04b1358e273a786b3ba3c710650df772c300575e318d9646d658ca`，与输入状态相同。源码、`dist` 和依赖未改，未提交或推送。
- 已验证当前用户会话中的 LaunchAgent 加载与页面运行；尚未实际重启电脑测试下一次登录。LaunchAgent 在该用户**登录后**启动，不提供登录前的网站访问。常浩刷新原资产页即可继续此前的按钮位置验收。

唯一下一步：常浩刷新 `http://127.0.0.1:5178/#assets` 做页面真人验收；后续登录后若异常，先在工作台设置中“明确检查常驻状态”，再按此交接核对固定 Label 与双端口。

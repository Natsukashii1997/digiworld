# 日历持久授权与芯片库徽章统一 291

输入状态 `WB-20261008-289`；Codex 认领 `WB-20261008-290`；输出 `WB-20261008-291`。本轮承接常浩连续两项要求：日历授权在开机自启服务中保持有效；夜巡七枚芯片使用首页暴龙机周围完全相同的徽章图形，避免旧像素块挤在一起。

## 原因与实施

- 原日历权限在终端 / Codex 身份下已授予，但 5178 开机自启 LaunchAgent 运行于另一个 `node` 权限身份，EventKit 在真实页面返回日历和提醒事项 `notDetermined`。助手原先还忽略授权回调中的 `granted/error`，可能把申请失败表现成成功。
- 本机以固定 `WorkbenchServer.app` 中的 Node 启动原服务，并为 LaunchAgent 写入同一 Bundle ID 的 `AssociatedBundleIdentifiers`；本机 `CalendarHelper.app` 承载原 EventKit 代码。两个 bundle 的 Info.plist 模板在 `server/workbench-server-info.plist`、`server/calendar-helper-info.plist`，均为本项目源码本机构建、ad hoc 签名，无第三方安装。`server/calendar.mjs` 优先使用固定日历助手，其他环境保留原 Swift 回退。`server/launch-agent.mjs` 与 `server/daemon-capability.mjs` 让以后生成的常驻配置优先保留这一路径和身份；`DAEMON-RUN.md` 记录恢复边界。
- `server/calendar-helper.swift` 现在检查两项权限申请的结果及错误，`server/calendar.mjs` 遇到失败不再报告成功；`tests/calendar.test.mjs` 覆盖系统拒绝访问的回归。
- 旧芯片图标是 `src/night-v2-crests.js` 的高密度像素填充图。现从 `src/pixel.jsx` 复用首页 `CrestRing` 的同一 `CrestIcon` SVG 路径与圆点，分别映射知识、勇气、友情、光明、希望、纯真、爱心；`NightV16`、夜巡结果卡及对应 CSS 均采用共享图形。芯片 ID、业务规则、夜巡执行状态未改变。

## 验证与本机采用

- `npm run build` 通过；完整 `npm test` **1175/1175** 通过。在最后补充“授权失败不得虚报成功”用例后，`node --test tests/calendar.test.mjs tests/capability-candidates.test.mjs tests/capability-daemon.test.mjs` **49/49** 通过；`xcrun swiftc -typecheck server/calendar-helper.swift` 通过。
- 首页专项浏览器检查通过，夜巡专项浏览器检查通过并生成 12 张合成截图。[首页 1440px](evidence-2026-10-08-calendar-chip-291/home-browser-final/home-full-1440.png)、[芯片库 1440px](evidence-2026-10-08-calendar-chip-291/night-browser-final/night-empty-1440.png)、[芯片库 390px](evidence-2026-10-08-calendar-chip-291/night-browser-final/night-empty-390.png)。真实 `#night` 页面七张芯片的 SVG 均在画框内、无像素矩形；逐枚与真实首页对应徽章的 `path d` 和全部圆点属性比较 **7/7 完全一致**。
- 常浩在本轮明确允许发起系统授权请求。真实 `#calendar` 页面授权后显示周视图与 Todo；macOS“隐私与安全”中 `WorkbenchServer` 的日历“完全访问”和提醒事项均为 on。`launchctl kickstart -k` 重启服务两次后仍能读取日历与 Todo，最终服务 PID `32251`，程序路径为固定 `WorkbenchServer.app/Contents/MacOS/node`。两个 bundle `codesign --verify --deep --strict`、现行 plist `plutil -lint` 均通过。仅读取现有日程与提醒事项，未新建、修改或删除真实条目。
- `data/CURRENT.json` 在本轮认领前由其他活动从 `6658b3…` 变为 `a2b7dde77bf2407849df3d0b5c5f35c48a1a91dafa694ec93d9d0f144f4790ec`；本轮未改该文件，最后读回仍是 `a2b7dde…`。旧 LaunchAgent 备份和切换候选保存在[本轮运行证据](evidence-2026-10-08-calendar-chip-291/runtime/)；不会自动回滚权限身份。

## 边界与下一步

已验证同机服务重启后的授权持续有效；尚未真的注销 / 重启 macOS。系统重置隐私授权、本人撤销权限或改动 bundle 路径 / 签名时，macOS 仍可能要求重新授权；代码不能替系统保证“永不失效”。本轮 plist 是按常浩请求做的本机受控切换，工作台内的常驻重新安装 / 回滚流程未重新预览采用，若以后使用，应先核对现有配置与操作日志，不能盲目覆盖。旧交接中无关的 Claude / 真人视觉验收仍由对应任务负责。

唯一下一步：常浩在原页面刷新 `#night` 看七枚徽章形象，并在日常使用中查看 `#calendar`；工程已完成本轮所能做的本机验证，最终视觉和使用验收由常浩决定。

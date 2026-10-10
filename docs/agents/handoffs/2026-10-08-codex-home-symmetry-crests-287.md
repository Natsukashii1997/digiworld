# 世界总览四区对称与徽章环返修 287

输入状态 `WB-20261008-285`；Codex 认领 `WB-20261008-286`；输出 `WB-20261008-287`。常浩指出右栏独立“今日项目简报”破坏四区对称，要求首页只保留 A–D 四块，并恢复旧版徽章环绕暴龙机的视觉。

## 改动

- `src/HomeV16.jsx`：移除右栏独立简报小板块；把原有简报抽屉入口作为“在推进”卡片内的文字操作，仅有在推进项目时显示。简报正文、已读、开工和回读逻辑不变。中央复用 `src/pixel.jsx` 现成的八枚 `CrestRing` 与旧版双轨，暴龙机恢复 290px 原尺寸，同时保留 A/B/C 按键和数码蛋。
- `src/home-v16.css`：左右栏统一为两等高行，A/C 与 B/D 的上下边线配对。八枚徽章以 90 秒缓慢公转，徽章图形反向转动保持正立，旧轨道同时旋转；系统“减少动态效果”时停止这些动效。根据中枢实际可用宽度缩放环和设备；在 1400px 及以下改成中枢置顶、四卡两列，760px 以下单列，避免三栏挤压。视觉配色仍用原项目令牌。
- `tests/home-v16-browser.mjs`：增加四卡几何对齐、第五小板块消失、八徽章数量、自然动效与运行中切换减少动态效果、1280/390/320 横向边界检查；原业务导航和写后回读断言保留。

改动前 SHA256：`HomeV16.jsx` `833a0c53…faef016f`，`home-v16.css` `466fc0b7…a4ab6c`，`home-v16-browser.mjs` `7cb91acc…ba541`。改动后分别为 `f694ba96…2c3e`、`eef05d0a…8607c`、`e51a21c8…2f9d`。未修改 `ProjectBrief.jsx`、后端、依赖或真实数据。

## 验证与运行采用

- 最终 `npm run build` 通过；`npm test` **1174/1174**，0 失败、跳过，见 [完整日志](evidence-2026-10-08-home-correction-287/npm-test-final.log)。首页与简报浏览器脚本均通过：四卡/徽章/动效/响应式、简报打开、标已读、开工、窄屏、44px、axe；旧首页专项与用户六图专项也通过。
- 全站 `tests/visual.mjs home-correction-287-final` 在 2560/1920/1440/1024/390/320 宽度与 17 个路由检查，`problems=[]`，见 [结果](evidence-2026-10-08-home-correction-287/visual-final.log)。[1440 四区](evidence-2026-10-08-home-correction-287/home-browser/home-full-1440.png)、[1280 两列](evidence-2026-10-08-home-correction-287/home-browser/home-full-1280.png)、[390 单列](evidence-2026-10-08-home-correction-287/home-browser/home-full-390.png)、[320 单列](evidence-2026-10-08-home-correction-287/home-browser/home-full-320.png)是合成资料截图；旧版徽章参照为 [2026-09-30 截图](evidence-2026-09-30-codex-review-83/runtime-home-1440x900.png)。
- 常驻服务仍为 PID `61775`，未重启。现有 5178 服务直接提供新的 `dist` 静态文件；[实时只读回读](evidence-2026-10-08-home-correction-287/live-readback.json)确认 JS/CSS 与 `dist` 逐字节哈希一致、页面 4 卡、独立小板块 0、内置简报入口 1、徽章 8、A/C 上下边线 125/424、B/D 448/747，页面脚本错误 0。
- `data/CURRENT.json` SHA256 `6658b3434a04b1358e273a786b3ba3c710650df772c300575e318d9646d658ca` 与输入一致。未读真实 Vault、飞书或私人会话正文；未更改 Agent 配置、主库、依赖，未提交、推送、重置或暂存。全仓 `git diff --check` 的 6 个提示来自本轮未改的旧文件；本轮跟踪文件的定点检查通过。

## 边界与下一步

工程、合成视觉、实时页面采用已核实；常浩在原网页或桌面 App 刷新首页后做视觉验收。旧版实际为徽章定点发光、虚线轨道旋转；本轮按常浩“徽章绕着一圈旋转”的描述让徽章本体公转，图形保持正立。若动态速度或尺寸仍不合意，以真人观感继续微调。

交接 285 的常驻 reload 原操作查询 500 和交接 279 的资产卡片位置真人验收仍未处理，本轮没有把它们误报为解决。唯一下一步：常浩刷新并验收首页四区与徽章环效果。

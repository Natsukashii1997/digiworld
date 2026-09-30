# 数码进化 · 线稿 v2 验证记录

日期：2026-09-27。范围与最新用户决定：`UI-LINEART.md`。

## 已实现

启动屏、侧栏标识、顶栏/侧栏文件岛、资产页徽章、列表/网格六伙伴、内嵌与抽屉详情封面全部使用同一套内联 SVG。浏览器 favicon 由同一 Digivice 组件派生为 SVG data URL。所有装饰为无填充线稿，不依赖主题图片请求。后台、用户数据和现有功能未改动。

原破图最小复现：本机 `GET /theme/digievolution/digivice.png` 返回 404 / application/json，磁盘上有图，但服务只允许根页和 `/assets/` 路径。最新用户改为线稿后，不再放宽服务器规则修补旧图片链路；直接移除该图片链路的运行依赖。旧图片保留作历史资料。

## 检查结果

- RED：初次组件检查 7 通过 / 2 失败，准确发现旧 img 和缺少实际 SVG 输出。
- GREEN：线稿回归 12/12，通过装饰语义、SVG 路径、六种伙伴区分、非有限序号回退、窄屏与详情唯一渲染、原业务入口保留等检查。
- 追加 RED → GREEN：独立 Spec 审查发现 HTML favicon 仍用旧 PNG；测试先失败，再修为同源 SVG 并逐字校验。
- HTTP 集成：隔离库启动真实 startServer，入口、JS、CSS 返回 200，字节与构建文件一致；favicon 自包含；JS 内有线稿定义、无旧主题图片 URL。
- 完整测试 371/371，通过；日志 `test-results/digievolution-lineart-v2/tests.log`。
- Vite 构建、8 文件 Prettier 检查通过；没有安装依赖。
- 素材视觉检查：直接从同一 React 图形组件导出矢量联系表，检查正常/小尺寸及轮廓完整性。`test-results/digievolution-lineart-v2/art-preview.svg` / `.png`。PNG 只是检查证据，不进入运行 UI；这不是浏览器截图。
- Standards / Spec 两轴最终源码检查均 0 剩余发现。冻结对象 `test-results/digievolution-lineart-v2/review-final/`，差异 `changes-final.diff`，SHA256 `3819d12852216a3dab731820b2263bb6a76c6b86a27341d93373e3114cfb0da4`。

## 当前本地供应版本

`http://127.0.0.1:5178/` 实际 HTTP 回读已与本次构建逐字匹配；无需重启后端，未修改服务器源码。页面刷新后加载新版。

| 文件 | SHA256 |
|---|---|
| dist/index.html | e5af6d21ae9c650ae24071c69edeeabcae546f34d8f5c3c19776aabcd1c1a83e |
| dist/assets/index-DBJH6mTX.js | 7313a6394ae66b9cfbe180b6c2fc0812690baf06a185c331d758fff850d5a732 |
| dist/assets/index-ZhkfbYUK.css | 44c6acaa524ce1e4f1e2a165782aa957cb72b418342c395c0c10c7ffee44f703 |
| src/DigimonArt.jsx | 96de1c1048c7b6f3bbb3d22052585b9393366144ff80384e79fad351e9534553 |

主库 CURRENT.json 本轮前后 SHA256 均为 `a74e3e05aabe05d1a0cee1a1365f4ce8afd8bd86c0006ce55efccd793a109db9`。未提交、未发布。

## 未验收边界

浏览器本地访问仍有安全策略阻塞，未切换工具绕过。HTTP 与组件测试不能证明浏览器整页布局、点击、键盘、响应式、读屏或 T2 已通过。新线稿辨识度与最终页面观感待用户验收；正式 UI 完成状态仍为阻塞，而非整体应用已完成。

唯一下一步：访问恢复后，基于上述构建使用隔离数据完成真实运行页面的响应式、键盘、视觉对比与 T2 验收。

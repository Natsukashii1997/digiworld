# 资产圆角令牌等值修复431

输入429 → 认领430 → 输出431。用户授权修复剩余资产圆角检查，保持现有视觉、不改功能和数据、保留所有既有未提交改动、不提交/推送/重启后端；另询问项目LOCAL/GIT双标记原因。

## 改动与结果

- src/ui-v14.css：在允许补充的首个根令牌块新增 --r-badge:6px 并补档位注释；受保护的 src/styles.css 未改。
- src/assets-quick-copy.css：焚决条目编号 .scroll-preview-index 从字面6px改为 var(--r-badge)。实际圆角保持6px，其他视觉、功能、数据和测试断言不变。
- 项目LOCAL表示有本地目录，右侧GIT表示同一项目登记了GitHub地址；不证明同步状态。本轮仅解释，项目标记相关源码未变。

## 验证与采用

- 原令牌检查先复现失败，修复后4/4通过；未豁免或放宽原断言。
- 完整 npm test：1211/1211通过，0失败/跳过/取消；上一轮唯一失败已关闭。
- npm run build通过。1440/390同一合成焚决卡片前后截图文件逐字节一致，computed radius均6px，几何/边框/颜色一致，无横向溢出与页面脚本错误。合成验证不代表真实业务试写。
- 独立只读复核0发现，绑定最终两CSS SHA；未代签Claude或真人验收。
- 原5178公开根页面、图标、manifest、JS、CSS共5项HTTP200与17项磁盘构建清单一致，后端PID13548未变。静态采用无需重启。
- HTTP预检首遇沙箱EPERM、随后/index.html路径404；按已核实服务根路由 / 只读回读成功，留在 http-readback.json，不涉及产品修复或业务API。

## 证据

[两源差异](../../../work/asset-radius430/change.diff) · [源SHA](../../../work/asset-radius430/source-manifest.json) · [令牌首败](../../../work/asset-radius430/tokens-before.log) · [令牌通过](../../../work/asset-radius430/tokens-after.log) · [全量日志](../../../work/asset-radius430/unit.log) · [构建](../../../work/asset-radius430/build.log) · [视觉结果](../../../work/asset-radius430/visual-results.json) · [HTTP回读](../../../work/asset-radius430/http-readback.json) · [独立复核](../../../work/asset-radius430/review.md)。

桌面：[改前](../../../work/asset-radius430/before-1440.png) / [改后](../../../work/asset-radius430/after-1440.png)；手机：[改前](../../../work/asset-radius430/before-390.png) / [改后](../../../work/asset-radius430/after-390.png)。两组图像完全相同。

## 保全与下一步

2065项既有文件、189符号链接基线与目标CSS/CURRENT/台账前像、完整旧dist保存于 work/asset-radius430。交接前无丢失/范围外修改；全部data指纹不变，HEAD/依赖/项目标记源码保持。最终核对见 [protection-final.json](../../../work/asset-radius430/protection-final.json)。无提交、推送、依赖安装、后端重启、数据改动或外部消息。

使用：刷新现有5178工作台即可，页面视觉保持现状。当前资产圆角技术遗留已关闭，写入者释放为无；下一步常浩验收当前效果。427的Chrome插件手动重载及真实抖音单条首验仍待常浩，未在本轮执行。

# 收藏插件紧凑按钮466

输入464 → 认领465 → 输出466。用户以截图明确要求两个小按钮并列，左“收藏”、右“GET+”，两色区分。

已修改`browser-extension/collection/content.js`：按钮从纵排长文案改成64×44px横排、6px间隔；左青色、右浅紫色。维持原44px命中区、位置和直接收藏拖拽；GET为点击指针。完整功能保留在title/aria-label。处理、成功、失败采用短按钮状态，完整信息在上方独立status提示，不把按钮撑大。

网络/导入/GET/幂等与未知结果恢复代码未变。相同改动同时作用于小红书和抖音。版本仍1.2.0；后端、正式dist、依赖、配对及真实收藏未改，无重启、安装、提交、推送或远端GET写入。

## 验证与证据

- 现有`collection-get-extension-browser`通过：1440/390/320横排、双色、小尺寸与命中区，直接收藏/GET同卡回填、重复GET去重、SPA清理。
- 现有`collection-extension-browser`通过：未配对、连接失败、未知结果查询原ID、明确不存在后的重试；320长错误提示完整可读且不溢出。
- 现有`collection-douyin-browser`通过：点击更新、SPA、图文拖拽、无有效视频/超20图错误、媒体与工作台呈现。
- 3个测试文件仅适配状态定位、补布局验证与截图；原行为断言保留。抖音旧错误定位首败保留在`work/buttons465/douyin-browser.log`，新定位通过记录在`douyin-browser-final.log`。错误截图首轮抢在异步回调前，已补等待并保留旧图`status-before-error-await-320.png`，最终`error-320.png`为真实错误状态。
- 独立只读代码与截图复核通过，绑定[最终4文件清单](../../../work/buttons465/final-manifest.json)。属于局部呈现修改，未重跑未受影响的全量后端测试，也未重建工作台。
- [按钮局部](../../../work/buttons465/after-ui/buttons-detail.png)、[390完整](../../../work/buttons465/after-ui/buttons-390.png)、[320成功](../../../work/buttons465/after-ui/get-success-320.png)、[320错误](../../../work/buttons465/after-ui/error-320.png)均为运行真实扩展源码的合成页面。
- [保护核对](../../../work/buttons465/protection.json)：742基线无缺失/范围外改动，dist及收藏state不变；原dirty保留。采用前源前像在`work/buttons465/before/`。

## 下一步

Chrome扩展管理页对“数码世界 · 收藏”点击“重新加载”，再刷新小红书/抖音详情页。无需重新安装、配对或重启5178。当前尚未验证用户Chrome已加载本次样式，也未代签用户审美验收。GET464已正式采用、真实自然使用待验；逆向v4派单462与441待验保留。

共享状态466写后回读，写入者释放；无跨客户端消息。

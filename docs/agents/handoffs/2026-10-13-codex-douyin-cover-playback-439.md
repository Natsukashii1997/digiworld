# 抖音封面修复与真实播放复验439

输入437 → 认领438 → 输出439。用户要求继续修好封面并检查工作台视频，随后明确允许启用修复及重启5178一次。**这条 Kimi 收藏的封面已补存并显示，工作台内跳转播放正常；原视频、129段文稿、分组及其余4条收藏保持不变。**

## 改动与诊断

- 新增 `server/collection/cover-repair.mjs`，接入 `server/collection.mjs` 与 `server/http.mjs` 的本机页面鉴权接口 `POST /api/collection/notes/:id/repair-cover`。仅允许已有ready视频缺失的单张封面，核对媒体版本、域名/HTTPS、目录身份及并发占用；先暂存、OCR、串行复读再提交图片字段，不重下载视频或重做分析。
- 图片和父目录先fsync；写入结果未知时回读notes及trash，只有确认无引用才清理。独立审查发现的trash误删分支已先红后绿修正，最终无阻断。
- `server/collection/lib/media-import.mjs` 保留具体图片错误并脱敏，新增 `tests/collection-cover-repair.test.mjs` 覆盖成功、失败、版本冲突、来源拒绝及未知结果恢复。
- 首次失败的具体异常没有被旧版本保留，本轮不能还原。当前抖音DOM封面与原来源路径一致，原下载路径HTTP200、image/jpeg、12709字节，真实OCR也成功。不能倒推历史失败为反爬、过期或网络问题。本轮完成可核验的局部恢复及后续错误可诊断性；不承诺所有作品永不失败。
- 未修改扩展或前端，扩展仍为1.1.0，无需重载或重新配对。

## 验证与运行采用

- 最终 `node --test --test-concurrency=2 tests/collection*.test.mjs`：38/38，0失败/跳过/中断。`repair-red.log` 与 `recovery-trash-red.log` 保留首败；`repair-green-final.log` 只是较早阶段14项，最终依据为 `collection-unit-final.log`。
- 视频浏览器专项（Range206/416、可解码播放/跳转）及抖音浏览器专项（点击、更新、SPA、图册拖拽、媒体展示）通过。两套在最后恢复/fsync返修前运行，未被这些局部分支影响；最终分支由38项单元覆盖。本轮未重跑全项目单元。
- 用户此次单次授权登记后，空闲预检、固定LaunchAgent身份/源码/数据核对，再执行一次kickstart：PID13548→7922。重启阶段收藏state、主库指针、plist和源码不变。本次一次重启授权已消费。
- 正常本机接口仅补 `douyin-7664016553972731199` 的封面，revision60，mediaStatus=ready、mediaError为空，01.jpg为12709字节；媒体版本仍为250cb6528fe0b886cef4e06a2c3d6fa6。
- 真实Chrome页面刷新后，Kimi卡片封面加载成功，naturalWidth640/naturalHeight360。用户手动打开工作台已解决437的导航限制；此次可操作该用户标签页，不绕过拦截。
- 实际视频时长2353.6秒、1920×1080、readyState4。点击文稿0:10跳到10.68秒并播放，进度到34.74251秒，无媒体错误；检查后暂停在34.757138秒。不是只依据静态页面或状态标志判断播放。

## 数据与保护

- 真实补存前保存私有state前像并核对未变化，视频135984492字节SHA256前后相同：3e0c6951a61d1b4d91e9ed97f4cf7e3890788be0b253505dd04e8441de0e02c1。
- 5条收藏数量一致，另外4条逐字段相同；desk/trash及目标所有非图片字段不变。129段文稿、18295字符全文逐字段相同。本次不评价转写准确性。
- 目标实际变化仅coverUrl、imageUrls、imageOcr、mediaStatus、mediaError五字段。未改分组、标题、来源、视频与保存时间。
- 741项保护基线0丢失；仅3个既有后端文件及授权修改的collection state变化，另新增修复模块与测试。最终五文件manifest一致；dist、依赖、主库指针不变。没有构建、安装、提交或推送；其他动态日志未回滚。
- 临时带签名封面地址已删除，不进入报告；原始state前像只作本地私有回退材料，不发布。

## 证据与使用

[最终源码与SHA](../../../work/douyin438/source-manifest.json) · [精确差异](../../../work/douyin438/change.diff) · [38项最终回归](../../../work/douyin438/collection-unit-final.log) · [视频浏览器](../../../work/douyin438/video-browser.log) · [抖音浏览器](../../../work/douyin438/douyin-browser.log) · [独立审查](../../../work/douyin438/review.md) · [一次重启回读](../../../work/douyin438/restart-readback.json) · [封面补存回执](../../../work/douyin438/repair-receipt.json) · [数据逐项回读](../../../work/douyin438/data-readback.json) · [真实浏览器回读](../../../work/douyin438/browser-readback.json) · [保护核对](../../../work/douyin438/protection-final.json)。

![封面修复后](../../../work/douyin438/cover-after.jpg)
![工作台实际播放后暂停](../../../work/douyin438/playback-after.jpg)

使用：打开工作台“收藏”，点击这条Kimi卡片；播放按钮或文稿时间点均可启动视频。无需重装、重载扩展或重新配对。当前Chrome页已保留。

本次单条封面故障及播放未验证项关闭；真人使用验收、更多真实作品/图册及转写质量不由本次替代。唯一下一步：常浩按正常收藏流程使用并确认体验；如再失败，依据新保留的具体错误定位。本轮交接写入共享状态，不声称Claude已读取或验收。

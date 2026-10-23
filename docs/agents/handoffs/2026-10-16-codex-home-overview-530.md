# 首页与连续侧栏候选交回530

输入WB-20261015-528，认领WB-20261016-529；交回WB-20261016-530，写入者无。当前HEAD e6e5d8b74474ea408ebb171ab70415e32d57ada4，保留全部既有dirty，无提交推送。

## 目标与结果

常浩本轮明确要求删除工作区/生活区分组，侧栏从上到下连续排列；收藏改个人收藏并置资产仓库下面；首页四卡改1资产仓库、2收藏、3待处理、4AIHOT，内容由Codex先整理供确认。结构沿用中央装置，手机四卡按1–4排列。

内容：资产总数/六类型/最近2项更新（含未删除焚决、排除归档）；收藏总数/最近3条/分类时间；保留待处理分类与未知来源；AIHOT只读本机热点3条，无热点回退精选，缓存时间和错误/暂停明确。全部入口与原路由保留。

修改源：src/App.jsx、pages.js、HomeV16.jsx、home-v16.css、新增HomeOverviewContent.jsx。调整4个对应测试。既有保存逻辑、后端、schema、依赖与正式dist未改。

## 证据与完成边界

- [任务契约](../../../work/home529/contract.md)、[精确差异](../../../work/home529/changes.patch)、[最终清单](../../../work/home529/final-manifest.json)。候选work/home529/candidate-dist；build manifest a89b6f8330e0eba052eb0cee036e37b601f0be9230e0b849f4a2a917525bfeb4。
- 构建通过（既有bundle体积提示）。首页17场景通过：8宽度、空/失败/旧缓存/损坏/暂停/长标题、重试、原记一笔2种同ID恢复；无pageerror，几何/44px/axe/键盘检查通过。导航浏览器全部通过。日志browser-confirmed.log、nav-confirmed.log。
- 全量单元1330/1331：唯一既有OS进程清理测试读空PID竞态；单项复查1/1通过，首败保留。详见failures.md、unit-confirmed.log、unit-process-recheck.log、unit-hang-cleanup.json；不宣称全量一次通过。独立测试稳定性待办，不顺带修。
- 两轴只读审查重要0；T2 VISUAL_PASS绑定当前构建，见reviews.md。未代签Claude、用户验收或正式使用。
- 822基线中的814保护文件无变化，其余8为本轮授权修改；新增摘要组件单列。正式6项公开HTTP与dist逐字节匹配；HEAD不变；本轮测试合成进程组已清理，真实数据不写。protected-final.json。
- 用户预览：/Users/nat/Documents/Codex/2026-10-16/jie-s/outputs/数码世界-首页调整预览.html；图片来自实际隔离合成数据浏览器。可切换前后/宽度/异常状态。

## 未完成与唯一下一步

请常浩确认首页四块内容和排列；Claude按项目分工复核后决定正式采用路径。当前源码包含未正式采用的随手记候选，禁止整包直接覆盖正式dist；如只采用本次首页，需要限定差异打包与正式前回读。528随手记视觉/正式接入和安装门禁原样保留。无安装、自启、服务重启、正式页面替换、真实数据试写或外部消息。

2026-10-16 11:45 CST

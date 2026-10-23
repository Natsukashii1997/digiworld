# 截图四类UI修复 · 候选交回565

输入563 → 564串行认领 → 565候选交回；执行者Codex。用户明确：只删除红框提示标签，保留一句介绍；AIHOT改为最新精选10条、逐条标日期。

## 已完成

- 页头：共享PageHeading及随手记/夜巡独立提示行删除，原介绍保留，标签行占位消失。AIHOT介绍中的“今天”同步改“最新”。
- 首页：摘要内容从标题下开始排列，收藏标题到计数实测12px（旧约55px），卡片原等高保持。
- 项目空间：同排已用/空档等宽等高；每个空档都显示完整提示，窄屏单列空态保持紧凑；空档点击/键盘聚焦项目库路径保留。
- AIHOT：官方selected请求改7d&limit10，保持来源排序，不用热点凑数。逐条优先原文日期；缺失时标“收录于”；都无则明确未知，固定北京时间。范围不足如实报数量；旧未知缓存不冒充7天，失败保留原缓存与范围。

## 根因与来源

本次17:14公开缓存selected3/hot10/daily3且成功。17:20匿名读官方：24h精选3条且hasMore=false/nextCursor=null；7d返回10条，前3条与缓存完全匹配。limit是上限而非保证条数；没有隐藏/丢失证据。官方合同 https://aihot.news/openapi-v1.json 。取证：本线程work/aihot-diagnosis/selected-24h.json、selected-7d.json与summary；不包含私人数据。

## 验证与首败

- 先红后绿：red.log保留26项中5个预期失败（旧查询/旧页头/缺新日期导出）；最终专项33/33。
- 全量单元1393/1393；随后仅AIHOT介绍“今天→最新”改动，最终专项33再次通过，构建重新生成。
- 相关浏览器：home 17scenarios，projects、notes-rich、aihot-v16通过。AIHOT最终构建包含全/空/首次/失败/禁网六宽、axe、44px、键盘收藏与重复/持久化/失败、原文链接。
- 新layout最终8宽1440/1280/1024/430/393/390/375/320，32项几何与10条日期/缺失日期/无横溢/空档焦点通过。before为同样例563，final为最终构建，1440/390前后全页与裁图。
- 首次新layout在同路由更换fixture未触发fetch导致超时；添加reload后通过。T2发现项目全页包含测试后焦点/滚动状态，截图前清焦点、回页首并等两帧，重拍同构建before/final；layout-final-clean.log通过，保留原失败日志。
- Spec/Standards致命0、重要0、未关闭建议0；最终T2 VISUAL_PASS。旧351/358只更新被本需求取消的布局断言，未声称其历史整套脚本已通过；对应实际行为由新layout和现行home/projects脚本覆盖。
- 这些是Codex隔离工程与独立视觉证据，不代签Claude质量、正式采用、用户自然使用验收。

## 精确快照与成果

- 基线HEAD e6e5d8b74474ea408ebb171ab70415e32d57ada4；831保护项及旧dirty保留，见baseline.json、before/。
- 本票20项文件清单change-manifest.json，SHA d64af51a82ac89bb122e8e5efc7139931e95f60efc1f904f1fcacbbab0b56bc8。10个运行源+10个测试（含2新增），完整差异final.patch。
- candidate-dist 19文件，build-manifest SHA 4da8e04ad686d033b6c1459d5fa30d28ac9ed3f3f01940aa36d293b560d4e433。
- 完整release-candidate 437文件，release-candidate-manifest SHA 9a99d33847beb10bd9b99601441e504c6c10484da3c7a53aeadd8c6b1c0554a3。逐字保留563其它源/设计类型及9个browser-extension/collection文件，无旧JS/CSS；node_modules仍链接既有deps-20261016-539。独立完整性核验缺0/多0/错0。
- protection-final.json：保护项无计划外变更，根dist与主库CURRENT指针不变，正式563的437文件均保持。没有安装、主库试写、读取私人Agent/Vault、提交推送或发消息。
- 所有项目证据相对目录work/ui564：unit.log、targeted-final.log、build-final.log、layout-final-clean.log、aihot-final.log、home-browser.log、projects-browser.log、notes-browser.log、final/geometry.json、standards-final.md、spec-final.md、t2-final.md、visual-authority.json。
- 用户可视对比：/Users/nat/Documents/Codex/2026-10-19/ui-1-2-2-aihot-3-5/outputs/数码世界-UI修复对比.html；截图全为合成数据。

## 当前状态与唯一下一步

正式版仍是release563；本轮未切换、未重启。修复候选与完整采用包已准备。按COLLABORATION.md §6，下一步由Claude读取此交接、对比图和精确diff做质量验收；通过后由常浩确认准确采用范围及一次服务重启（server/aihot.mjs变化需后端采用）。未自动向Claude发消息。

采用前必须刷新CURRENT、核对无其他写入者及当前正式release/数据状态，验证冻结文件未漂移；不得从整个dirty工作区重新打包。若存在新工作先核对合并，不能覆盖后续版本。旧缓存可先保留，待获准采用后的正常刷新取7d；刷新失败应保持缓存，不清数据、不补假新闻。源码/检查完成，运行采用/Claude及真人验收pending。

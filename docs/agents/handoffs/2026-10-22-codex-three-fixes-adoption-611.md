# 三项修复正式采用完成，原UI与扫描根保持

输入609，认领610，交回611。用户明确授权：正式采用三项冻结修复，先备份后重启一次；只迁移当前工作台，不批量迁移其他项目；核验实际页面、扫描和AIHOT。该范围已完成。

## 运行采用与数据保护

- 新鲜[私有备份](../../../work/adopt610/private-adoption-backup)共3211文件、816319739字节，完整data2741文件复制前后与备份逐文件一致；含旧程序、原生App/状态/偏好和启动配置。独立核对通过。[恢复边界](../../../work/adopt610/RESTORE-NOTES.md)。
- 正式release为`/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/wb-20261022-610`，462/462文件匹配609冻结候选。清单SHA `cda74f361fc0acd27c54a717769ebb6c7d9706a6cdabd88f4dabf24040e288e0`。旧604保留。
- 一次bootout+一次bootstrap，PID20245→68883。LaunchAgent仅改变WorkingDirectory与源码入口，Node/依赖/端口5178/数据根/原生宿主与自启未变。首页与资源逐字节匹配，JS为`index-BwR7vGmd.js`。
- CSS仍`index-CH_PUcka.css`，SHA `1123cfef77f3ea6e3f2bdd62a1ac03bd280b052bc165cd33982bda2320ef3b76`，原UI保持。本轮没有源码修改、构建、安装或提交推送。
- 主库933→934（仅当前目录登记）→935（两条排除）→936（单次扫描）。12条便签、13条收藏、资产和其他顶层业务数据保持；无删除数据文件。原生状态/偏好/草稿保持，2条已断开原生会话仅启动updatedAt更新，items/operations保持。

## 三项正式验证

**目录登记**：只对`local-83c57acbe58f5cccc2f185e6`、`/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench`执行既有preview→confirm。旧身份与旧dev证明匹配、Git关联不变、binding=0；新登记v2使用稳定卷身份。迁移瞬间其余项目全对象及其他主库字段完全不变。实际CURRENT可读，页面显示本轮状态与下一步，“继续”可用。见[登记回读](../../../work/adopt610/identity-readback.json)。

**项目扫描**：保留`/Users/nat/Documents/ChatGPT`与`/Users/nat/Documents/AI 项目`两个根，仅追加批准的当前工作台/work和work-desk-backups两处派生目录排除。不移动磁盘目录、不更改分类/手工定义/在推进标记。单次扫描1311目录、16/16已登记目录检查、Git读取18次；GitHub3条/1页、errors0。记录43→50，新增7、删除0，与预览逐项一致：Fmode-销售案例库、Fmode-销售侧壁栏、Fmode-用户案例库、其docs/share-site、work-desk、work-desk-t10、work-desk-ui-bitmap。实际页面待归类列表均出现。23个手工定义和全部既有登记identity/version保持。见[扫描回读](../../../work/adopt610/scan-readback.json)。

真实限制仍保留：深层素材目录达到6层，truncated=true，页面明确显示原因。其他17个旧位置仍是旧版登记，本次扫描更新为changed/待确认观察（与预览一致），没有迁移它们；不可把范围约束误解成已经解决全项目登记。当前工作台迁移后的登记为present。

**AIHOT**：启动自动恢复，无手动refresh。20:40:05 CST成功，精选10、热点10、日报12，status=ok，连续失败0、无退避或限流等待。API与缓存一致，旧3小时设置及授权字节保持。实际设置→历史授权→配置网络访问打开正常；已撤下独立资讯页未恢复。见[启动恢复回读](../../../work/adopt610/aihot-restart-readback.json)。

## 实际窗口和验证边界

CUA核验真实Safari数码世界App：重载便签12条、当前工作台详情、继续入口、项目新发现、原扫描根、AIHOT设置；原生随手记打开显示12条与“已保存”，随后收起正常。原UI截图在[ui](../../../work/adopt610/ui)，[核验索引](../../../work/adopt610/ui-readback.json)。最后主App停留随手记，原生恢复悬浮球，没有创建/删除测试便签，没有启动Agent。

工程回归沿用未变化冻结候选609证据：1504/1504全量、20项目浏览器流程/12Axe、多宽度、单项目迁移与真实AIHOT恢复演练。此次不重复整套测试；新增加正式运行、真实写后回读和窗口证据。自然使用/业务效果仍由用户验收，不代签。

[最终保护](../../../work/adopt610/final-protection.json) · [服务回读](../../../work/adopt610/service-readback.json) · [独立审查与首败说明](../../../work/adopt610/independent-reviews.md)。保护基线2105文件无范围外变化，HEAD保持e6e5d8b74474ea408ebb171ab70415e32d57ada4；dirty原有工作保留。

唯一下一步：用户正常使用本次正式版本；其他项目旧身份迁移、深层扫描范围扩展、B批及新功能均等新授权。本轮重启授权已消费一次，不能再次使用。写入者释放。

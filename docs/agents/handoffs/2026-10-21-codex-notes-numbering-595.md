# 便签自动编号修复正式采用 · WB-20261021-595

输入593，认领594，输出595。用户截图在列表中间增添项目后出现1/2/3/2/3/4，要求自动调整。修复、复验与本机正式采用完成，593三图标入口及标题样式保持。

## 修复与边界

- 根因是仅给新行递增编号，后面的旧行没有同步重排。统一在增删、拆分合并、列表格式转换、粘贴和时间轴排序后重排受影响的连续有序块，正文、样式、日期和完成态保持。
- 保留0/7等明确起点，拆开的新列表从1开始，合回后顺延。HTML粘贴不再把0当作缺省，显式value之后正确递增。
- 不在读取/复制时批量迁移旧内容，未操作的7/9等历史编号保持。已有重复号在下一次该段结构编辑时重排；本轮没有代改用户真实便签内容。
- 2产品文件src/note-document.js、src/note-paste.js；2新测试tests/notes-numbering.test.mjs、tests/notes-numbering-browser.mjs。全部CSS与原生程序保持。

## 验证

精确红用例复现1/2/3/2/3/4，修复后1到6；14单元专项、4浏览器场景、8组既有便签回归通过。最终全量1464/1464通过，构建通过，Spec和Standards阻断/重要均0。

首全量两个范围外计时失败保留，对应两文件22/22复查通过后完成低并发全量。独立WebKit缺安装，未下载；实际Mac隔离窗口回车插入显示1到6通过，本轮原生隔离远端保存未认定，完整保存重开由浏览器三类型覆盖。首败与界限见[验证说明](../../../work/notes594/verification.md)、[原生记录](../../../work/notes594/native-readback.md)。

## 正式运行与保护

- 正式路径仍为/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/wb-20261021-589，叠加594前端；后端PID43538未重启。当前完整程序464文件以work/notes594/release-manifest.json为准。
- 只替换两源与dist/index.html，增加一个新哈希JS；旧资源保留。19候选静态资源及5首页引用HTTP回读一致。
- 原生正常退出并单次启动，PID36722，二进制未改。正式窗口旧入口与保存状态正常、整栏钉住on；主工作台已安全刷新。
- 新鲜私有备份work/notes594/private-adoption-backup，revision787→787、10条便签、图片、草稿偏好/目录身份、二进制与自启配置均保全。回退只恢复程序，不覆盖最新数据或草稿。
- [正式回读](../../../work/notes594/formal-readback.json)、[界面回读](../../../work/notes594/formal-ui-readback.md)、[定向浏览器](../../../work/notes594/browser-final/results.json)、[旧回归](../../../work/notes594/regressions/regressions.json)。
- 1049文件基线无范围外产品修改；HEAD e6e5d8b74474ea408ebb171ab70415e32d57ada4不变，既有dirty保留。未提交推送、装依赖或改其他配置。合成fixture均已清理。
- review SHA aa196cc649e250ae73d2f5f1b2050d414b24fc4f1c21ea91c6116d8db058040d；final SHA151233b5ad108611a005fb764ab6a3fe7deb0a5d9e41e5b20d7bae50d2038bd9。

无剩余实施项；自然使用验收由用户完成。唯一下一步为按现有UI继续使用列表，若有新路径问题保留内容再定位。写入者释放。

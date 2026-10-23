# 随手记顶角操作精简与正式采用 · WB-20261021-590

输入588、认领589、输出590。用户要求取消单张置顶、复制旁加入删除，并缩小两图标与间距；原版UI其余部分保持。本轮完成实现、隔离验证、正式采用及实际界面回读，写入者释放。

## 交付

- 工作台、桌面便签栏移除独立浮动和单张置顶入口，整栏钉住保留。旧单张恢复通道保留以免遗留草稿不可达，但原生启动和桥接设置均取消置顶；不是删除所有兼容窗口代码。
- 右上角统一复制＋删除。28px按钮、14px图标、2px间距；触屏44px。其余纸色、胶带、层级、布局和样式保持，59份CSS中仅notes-types.css追加本轮局部操作规则。
- 删除前保存当前编辑并确认，原子比较所见版本，冲突不删；删除结果未知持久化恢复状态，取消/重开仅查询，不自动重复删除。保留输入法、图片导入、未保存内容保护。
- 8产品文件：NoteActions.jsx、NotesV16.jsx、FloatingNotes.jsx、floating-notes-store.js、notes-types.css、server/notes.mjs、server/http.mjs、desktop/floating-notes/NoteWindow.swift。4测试文件见final-manifest.json。

## 验证

- 全量1450/1450；12个定向浏览器场景通过。普通、待办、时间轴的复制、取消/确认删除、编辑后删除、重开、冲突保护、未知结果恢复和紧凑尺寸均覆盖。
- 右键格式、编辑、生命周期、工作台便签、悬浮便签与同步六组回归全部通过。构建与原生编译、签名、几何自检通过。
- Mac隔离原生应用实际完成三种合成便签删除、普通便签复制和取消、退出重开，旧单张pinned=true已取消，整栏钉住可用。测试应用、服务与临时数据已清理。
- Spec与Standards最终无阻断；T2对320/368/430px便签栏和1440px实际墙面为VISUAL_PASS。用户自然使用删除已发生，不代签其他功能长期体验。
- 首次发现的编辑态删除不可用、未知删除未持久恢复及Esc冒泡均已修复。actions2墙面取证错误已由actions3真实墙面替代；正式启动即时回读连接重置仅追加只读复核，未重复停启。

证据：[验证说明](../../../work/notes589/verification.md)、[正式界面](../../../work/notes589/formal-ui-readback.md)、[定向结果](../../../work/notes589/actions3/results.json)、[最终回读](../../../work/notes589/final-readback.json)、[用户删除后的回读](../../../work/notes589/post-ui-data-readback.json)。1052文件基线无范围外产品变化，2个旧测试runtime生成项单列。

## 正式采用与数据保护

- 正式release：/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/wb-20261021-589；端口5178，服务PID43538，旧PID13021停止后只启动一次。
- 原生/Users/nat/Applications/随手记.app：PID43996，既有LaunchAgent单次启动；原状态目录身份、登录自启配置保持。
- 461发布文件、12源/测试、3原生、3原版UI文件与11份七板块源一致。review-manifest SHA256为42216f602759d9768622b12a6c53b1cdea742897c64406502ff49240e54e3956；final-manifest SHA256为cfcbec1366172bcd36085cd6537cc8b95dd3d0969599ec573021e05403ac6c60。
- 采用首次回读：revision718→718，11条便签、1图片、草稿和偏好完全保持。后续revision719/10条，唯一差异为用户在本聊天明确确认的手动删除；其他便签、分区、图片、草稿、偏好不变，未回滚用户操作。
- 新鲜私有备份在work/notes589/private-adoption-backup，旧release587保留。回退程序不得覆盖最新主库和草稿。
- HEAD仍e6e5d8b74474ea408ebb171ab70415e32d57ada4，既有dirty保留；未提交推送、安装依赖、对外发送消息或改无关配置。

本轮无剩余实施项。唯一下一步为用户按现有UI日常使用；如发现问题，保留当时内容与操作路径再定位，避免改动视觉或覆盖最新便签。

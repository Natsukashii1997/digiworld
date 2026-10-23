# 三类型便签右键格式复验与修复 · WB-20261020-588

输入586，认领587，输出588。按用户要求检查普通、待办、时间轴的七项右键格式，保存重开保留；功能问题直接修复，当前UI冻结。修复已正式采用，服务重启一次、原生应用启动一次。

## 结果

| 类型 | 字色、高亮、字号、加粗 | 有序、无序列表、复选框 | 保存、关闭重开与再编辑 |
|---|---|---|---|
| 普通便签 | 通过 | 通过，勾选保留 | 通过 |
| 待办事项 | 通过 | 通过，勾选保留 | 通过 |
| 时间轴 | 通过 | 通过，勾选与日期保留 | 通过 |

矩阵覆盖工作台、悬浮便签栏、单张独立窗口。右键格式原有持久化通过，本轮进一步发现并修复两项编辑缺陷：

1. 重开带格式文字后继续输入，新增文字可能丢失原有格式。现在根据光标或替换选区继承原样式，显式清除格式优先，移动光标后重新读取目标位置样式；中文组合输入、换行和撤销路径保持兼容。
2. 右键菜单按Esc同时触发取消编辑，导致工作台未保存内容退出、原生编辑器收起。现在优先关闭菜单并保留编辑状态。

只修改一个产品源文件src/NoteEditor.jsx，新增两个浏览器回归文件。858份输入基线范围回读没有其他产品改动；CSS、布局、卡片结构、纸色与原生程序未改。NoteEditor最终SHA256为338916061133c0eaffa703ac487979394f28d4f30733a4b6e777a44d653eb0b0。

## 验证与证据

完整检查记录：[work/notes587/verification.md](../../../work/notes587/verification.md)。

- context-green2/results.json：12/12，含3类型×3入口的七项格式、选区、保存重开、二次保存和3项续写继承。
- editing-green2/results.json：6/6，三类型Esc、中文组合输入、显式清除和光标移动继承。
- lifecycle/results.json：13/13；evidence/browser-regressions.json：六组既有便签回归通过。
- evidence/full.log：全量1446/1446；构建通过，仅既有大包提示。Spec、Standards及采用包独立只读审查无阻断。
- Mac原生隔离应用实际操作三种合成便签，逐项右键设置七种格式，正常退出重开后同ID及格式、勾选、时间轴日期保持。原生Esc与重开续写也已实际操作并回读。证据native-before-reopen.json、native-final-readback.json。
- final-manifest.json、scope-readback.json保存范围与最终指纹；正式界面回读见evidence/formal-ui-readback.md。

首败context-red及editing-red-valid保留。早期测试定位、组合事件和原生选区操作中的问题已校正，细节在verification.md；未把菜单点击成功当作格式已应用。测试只写隔离合成数据；测试应用已正常退出，58842隔离服务及其临时数据已清理。

## 正式采用与数据保护

- 正式发布：/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/wb-20261020-587，服务PID13021，端口5178，旧PID96036停止后只启动一次。
- 原生应用：/Users/nat/Applications/随手记.app，PID13105，既有LaunchAgent启动一次；原生程序与上版完全相同。
- 最终回读：458/458发布文件、3份源/测试、3份原生、4份原版UI、11份七板块源匹配；正式主窗口已刷新，独立窗口右键、Esc、已保存状态实际回读通过。
- 主库revision709→709，10条便签、1份图片、完整草稿、窗口偏好、恢复目录身份及登录自启完全保持；未在真实便签内试写或更改格式。
- 新鲜私有备份work/notes587/private-adoption-backup，旧release585保留。prepared、stop/start-intent、stopped/started、native-start-intent/native-started及final-readback记录单次操作与结果。
- HEAD仍为e6e5d8b74474ea408ebb171ab70415e32d57ada4，保留已有dirty；未提交推送、安装依赖、向其他会话发送消息或改无关配置。自动检查保持暂停。

## 使用与边界

无需安装。正文中选中文字后右键，选择字色、高亮、字号或格式；列表和复选框作用于所在段落。保存并关闭后重新打开，原格式保留；继续输入继承光标处格式。按Esc关闭右键菜单后可继续编辑。

本轮验证正常应用退出重开；macOS重登、强制崩溃和长期自然使用未代签。中文组合输入已做合成事件回归，未代签系统输入法全部候选交互。

后续保护最新主库与草稿，旧schema程序不得盲目回退，也不得用备份覆盖后来的编辑；发现具体异常定点向前修复，保持当前UI。本轮工作完成，写入者释放；唯一下一步为常浩继续日常使用。

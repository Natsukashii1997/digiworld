# 随手记悬浮球去除外围方形阴影546

输入544，认领545，输出 **WB-20261019-546**，Codex执行并释放写入者。用户截图纠正：“图标边框非常明显的阴影方块，全部去掉，只保留图标本身”。本轮仅修原生球外围，不改圆形铅笔图标、不改面板、保存和自启规则。

## 修复与根因

BallPanel原已是透明背景且hasShadow=false，但BallView对52px圆盘绘制blur8黑色阴影，60px窗口仅4px边距，外围阴影在矩形窗口边缘被裁切，形成暗方块。绘制未主动清透明区域也有重绘残留风险。

`desktop/floating-notes/main.swift`只改BallView：显式isOpaque=false、任何变换前context.clear(bounds)、删手工圆盘阴影与尾部reset。保留圆盘/铅笔/胶带/状态点和环、点击拖动、便签面板和引导线样式。

## 验证与采用

- `work/floating545/render-before.swift`/`render-after.swift`提取实际BallView源码，在透明原生RGBA位图上绘制，不启动App或访问业务数据。外圈非透明像素597（最大alpha49）降至1（最大alpha3、图标抗锯齿）；四角alpha均0。图像`before.png`/`after.png`、`alpha-comparison.json`，独立图像审查通过。
- 新App编译、几何自检与签名通过，见`build.log`。没有新增生产诊断入口或单测镜像；本次原生绘制局部改动未重跑与之无关的整套网页测试。
- 正常CmdQ触发既有草稿保全退出，launchd回读exit0且不强制拉起，再安全替换个人应用程序的随手记，原App留`before/随手记.app`和`replaced-app`可回退；恢复区原路径保持。通过原登录项kickstart启动新版。
- 新二进制SHA `2febd1fc615678bb90c1d63f4a3c5d8a0372ab0cb8eb26712b54ba71a25135e2`；候选/安装3文件逐项匹配，签名回读通过。当前单实例PID23379，CUA实际球截图已检查外围干净，便签栏打开和仅球收起状态均观察到。没有编辑真实便签。
- 原自启配置仍有效；后端PID16205保持，本轮没有重启后端或改正式网页程序。主库指纹保持：True。实际注销重登及异常崩溃恢复未测试，沿544边界保留。

## 指针与下一步

证据：`work/floating545/final-readback.json`、`install-readback.json`、`alpha-comparison.json`、`independent-review.md`、前后图与原生构建。共享文件变更仅main.swift、状态/交接/跟踪与README指针。没有依赖安装、Git提交推送、范围外服务或数据写入。

常驻部署与数据恢复总体交接沿[544](2026-10-19-codex-floating-notes-always-on-544.md)，其旧App指纹被本546新指纹替代。程序回退只替换App并保留FloatingNotesState，不恢复旧主库；回退/升级必须按新的当轮授权。

唯一下一步：常浩看当前桌面图标，确认外围阴影已符合要求，继续自然使用。未代签用户视觉验收，未重开已暂停的快捷键和全屏实验。

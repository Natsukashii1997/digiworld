# 恢复预览统计裁切已修复并验证，候选待正式采用

输入615，认领616，交回617。用户授权修复恢复预览底部裁切，保持现有UI风格、扫描根和数据，C批不动。本轮完成局部修复、完整隔离验证、独立审查与候选冻结；未切换或重启正式服务、未真实恢复/扫描/迁移。

## 根因与改动

受限高度的滚动Grid将统计容器压缩，165px内容只能显示99px，内层裁剪导致“缺失/相同”行不完整。单变量探针确认并非长路径或max-height造成。仅在src/settings-v16.css:492为恢复正文增加grid-auto-rows:max-content，按自然高度排布，超出部分仍由原正文滚动。未改颜色、字号、圆角、内容顺序、按钮、公共样式或恢复业务逻辑。

新增tests/restore-preview-layout-browser.mjs，通过真实文件选择与隔离HTTP预览捕获该故障。首败、探针与辅助脚本排错见[诊断记录](../../../work/restore616/diagnostic-notes.md)。

## 验证结果

- [1515项全量测试](../../../work/restore616/unit-final.log)：全部通过，失败/跳过0；隔离构建成功，继承原有大chunk提示，未更换依赖。
- [13组布局场景](../../../work/restore616/layout-final.log)：桌面1440×1000/800/700、1024×600及320/375/393/430窄屏；四类非零统计、长路径、展开/收起、返回桌面，四行均完整，统计区可视高度与内容高度均165px。逐行滚动、操作区44px、无水平溢出、键盘、axe、取消/重开/Escape与指针保护通过。
- [完整备份回归](../../../work/restore616/full-backup.log)：合成资料下载、上传、预览、恢复到新临时目录及逐项回读通过；原目录保持。[设置六宽回归](../../../work/restore616/settings.log)通过。
- [macOS Safari实际核验](../../../work/restore616/safari-verification.json)：四行完整，正文滚到底部后说明与操作可达，取消返回设置，恢复目标未创建；仅关闭本轮专用标签，隔离主机和资料已清理。此为WebKit桌面实际核验，不是WebKit全尺寸自动矩阵。
- [Standards/Spec/T2独立审查](../../../work/restore616/independent-reviews.md)通过，无未解决阻断项；未冒充Claude或真人验收。

前后截图：[修复前](../../../work/restore616/red/preview-1440x800.png)、[同尺寸修复后](../../../work/restore616/layout-final/short-1440x800.png)、[320窄屏](../../../work/restore616/layout-final/long-320x568.png)、[Safari滚动到底部](../../../work/restore616/safari/preview-scrolled.png)。

## 冻结候选与保护

[release-candidate](../../../work/restore616/release-candidate)含465文件，以正式614为基底，只覆盖本轮CSS与19文件构建；依赖为既有引用，候选已去除写权限。工作区与正式所有非dist程序文件比对，仅目标CSS不同，避免夹带既有dirty。清单[candidate-manifest](../../../work/restore616/candidate-manifest.json)SHA256：`27a24c10e0caa31ce1a2361eebfd82095c2d398cca19a0c9825d7476ce2fa824`。审查清单[review-manifest](../../../work/restore616/review-manifest.json)SHA256：`6ca25ccd72ee4f01375b81e2fe6c9fbdf3727b827ebc0f29593d71a49920dbdd`。

[正式保护回读](../../../work/restore616/formal-protection.final.json)：正式465文件、真实data2744文件全部hash一致，无增加/缺失；主库CURRENT、扫描根所在数据、启动配置、运行路径与HEAD保持。正式仍release614、PID15725；原工作区dist未变，既有dirty保留，未提交/推送。收尾文档只涉及CURRENT、HANDOFF、本地问题表及本交接；未改C批。

采用后操作无需额外安装：设置→数据与备份→选择备份ZIP，检查“新增、冲突、缺失、相同”四行；小窗口滚动正文看说明，取消/恢复按钮保持可达。本轮仅在合成目录验证恢复，不授权真实库恢复或切换。

唯一下一步：向常浩报告候选已完成；如确认正式采用，再按当轮授权备份、切换与实际页面核验。本轮不自动执行采用或重启。当前正式页面仍使用614，不能把候选通过称为正式已修好。写入者释放。

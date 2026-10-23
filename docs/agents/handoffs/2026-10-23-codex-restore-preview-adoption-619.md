# 恢复预览裁切修复正式采用，实际页面已核验

输入617，认领618，交回619。用户明确批准采用617冻结候选，先备份、再重启一次，保持原UI风格、扫描根和数据，C批不动。本轮正式采用及实际页面核验完成，没有新增产品代码、构建或依赖变更。

## 采用与备份

- 先备份3220文件、817482205字节，含旧正式614、完整data（含reverse-evidence）、原生随手记App、草稿/偏好与启动文件。逐文件校验通过，独立复算一致。备份仅本人可读：[private-adoption-backup](../../../work/adopt618/private-adoption-backup)，原权限清单见[restore-file-modes](../../../work/adopt618/restore-file-modes.json)；旧614保留。
- 新正式目录为 `/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/wb-20261023-618`，465文件与617候选完全一致。候选清单SHA256 `27a24c10e0caa31ce1a2361eebfd82095c2d398cca19a0c9825d7476ce2fa824`；精确文件见[release-manifest](../../../work/adopt618/release-manifest.json)。
- 后端仅一次停止、一次启动：PID15725→72099，端口5178、数据目录、宿主和依赖保持。仅启动配置的工作目录及server入口切换；原生随手记未重启。[服务回读](../../../work/adopt618/service-readback.json)确认正式首页及5个资源逐字节匹配，CSS为index-CjnufQsY.css。

## 真实页面核验

在原Safari WebApp选择“从来源重新加载页面”，从设置→数据与备份通过真实文件选择器上传本轮合成557字节ZIP，只预览、未恢复。

- “新增、冲突、缺失、相同”四行及数字1/0/1016/0均完整可见，无底部裁切。
- 正文滚到底部后，当前目录保护说明完整可读；取消/恢复到新目录两个按钮始终可见、启用。
- 实际点击取消回到设置页，显示已保存到本机；两次预览指定的新目录均不存在，没有执行恢复或切换当前库。
- [原窗口预览](../../../work/adopt618/ui/preview.png)、[滚动到底部](../../../work/adopt618/ui/preview-scrolled.png)、[取消后页面](../../../work/adopt618/ui/after-cancel.png)、[操作记录](../../../work/adopt618/ui-verification.json)。因第一次预览在窗口变化后被关闭，滚动/取消在第二次重新打开的预览验证，故前两图ID不同，已如实记录。

候选已通过的1515全量、13布局、完整备份恢复、设置六宽、Safari与独立双轴/T2验证绑定同一文件hash，本轮未重复无变更测试。恢复按钮实际写入只在候选隔离目录验证，本轮不以真实业务库试写。[独立核验](../../../work/adopt618/independent-reviews.md)、[过程限制与首败](../../../work/adopt618/verification-notes.md)。

## 数据保护与边界

主库revision936、12便签、收藏revision131/13条、50项目及两个原扫描根保持。全部2744个data文件无增加/删除，2741逐字节不变；仅写锁journal、stdout新增两行启动信息及原生sessions更新时间变化。原生SQLite逐表比较只排除sessions.data.updatedAt，items29/operations11/sessions2内容一致；原生App、草稿、偏好和自启保持。[最终保护回读](../../../work/adopt618/data-protection.final.json)。

原UI风格保留，只有已批准的统计自然高度修复生效。未扫描、迁移、刷新AIHOT、真实恢复、变更权限或开发C批；共享dirty与原工作区dist保持，未提交推送。

无需安装，继续使用当前数码世界即可。设置→数据与备份→选择备份，四行统计完整；内容较长时滚动正文查看说明。唯一下一步为常浩正常使用验收，不自动再次重启或启动C批。当前采用与本轮核验已完成，长期使用验收未代签，写入者释放。

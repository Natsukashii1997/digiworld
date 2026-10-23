# 恢复新像素图标559

输入557→认领558→输出559。用户纠正：557修复复制时把图标又改回旧版。

## 错误与纠正

557错误地以当时被旧包覆盖的安装外观作为保留基线，恢复成60px铅笔；用户的新图标是修复前已存在的32px蓝金色像素暴龙机。现在明确撤回557“应保留60px”的判断，恢复新图标，不再以旧安装包推断用户选择。

仅恢复desktop/floating-notes/main.swift的BallView.draw、BallPanel的Geometry.hit尺寸，以及Geometry.swift的32px几何。精确取自work/copyhost556/before；主源d67c15aa0400844651ad071a36c869b1c359da6f9ca2a8b43c05a3edf63a98c3，Geometry a56608dccdc01658d59a5421a314e6880de4d6a03a47bf9a3d8f384fb0f62dc5。与最新render/ball.swift绘制逐字一致。draw以外和窗口尺寸以外宿主代码逐字保留，copyRich及无全局快捷键不变。

## 采用与核验

正式App已正常退出保存、刷新备份后采用；PID 87717，SHA 5f3e2b71fc17ad603950594dd59f6a87ebdcc07d70dc3e4ed511e829b49e5899。与之前已验证plain/HTML/RTF的5f3e宿主逐字节相同。签名、几何自检、NSPasteboard能力及无全局键注册均通过，独立只读复核通过。

真实桌面已看到32px像素暴龙机；纯图标截图work/icon558/restored-icon.jpg。前端555全436文件、七个src文件不变；卡片自动多色、所有格式工具、布局及每卡复制入口均未改。

本轮尝试再点击同一便签复核时，两次收到用户改变窗口的状态冲突，已停止UI操作，没有使用过期按钮位置。未声称本轮新完成实际复制；复制保留的依据是最终宿主与已通过富文本复制/粘贴的5f3e逐SHA一致，且相对刚修好的557只改绘制/几何。未保存剪贴板正文。

后端PID 52498不变；主库指针、草稿、偏好及状态目录inode逐字保持，两个LaunchAgent与自启入口不变。没有真实数据试写。原设置已由用户回到未钉住，状态文件与采用前一致。

## 指针与边界

证据work/icon558/source-baseline.json、icon-only.diff、candidate-check.json、build.log、review.md、native-readback.json及restored-icon.jpg。新鲜私有备份work/icon558/adoption-backup为0700且忽略；含原App/完整草稿状态/主库指针和快照/自启配置。回退只恢复程序，保留最新数据和草稿。

未构建/切换前端、重启后端、提交/推送或写长期记忆。唯一下一步：常浩使用新图标与复制；后续只以32px像素暴龙机为图标基线，同时保留copyRich与无全局键。自然使用验收由常浩完成。

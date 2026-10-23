# 桌面随手记复制宿主修复557

输入555→认领556→输出557。用户报告截图便签点击复制提示“不支持的操作”。

## 根因与最终范围

前端555支持copyRich，但14:50图标B恢复时整包带入11:17旧宿主，覆盖已验证5f3e宿主。实际旧包SHA64ae95ff4376969df6610de5f1e3fc332bde5be752a92acdfee3c9bcb4f90917，与work/icon-b/native一致；无NSPasteboard支持，并重新注册旧全局快捷键。默认消息分支返回截图原文。

最终宿主SHA c8bff4cbc03b535b9d9485b2660c65f24581bea58e0756f05e5e39103432f80a。新增copyRich桥，NSPasteboard同一项目写入plain/HTML/RTF；移除旧全局快捷键注册与设置，保持用户要求的手动唤起。图标绘制、60px窗口构造及Geometry逐字保留实际旧包对应源，不采用32px暴龙机预览。相对实际旧源只剩复制与无全局键差异。

根src七文件逐SHA等于556前基线；前端555全部436文件未变，卡片自动多色、原编辑器、五色/列表/勾选框工具、布局和每卡右上复制入口保持。未构建/替换前端或重启后端。

## 实际验证

- 正式桌面App已采用，PID 80629，仅一个进程；lsof映射正式路径，严格签名及磁盘SHA通过。
- 点击用户截图中10/19 12:46便签右上复制：实际回执“已复制（含格式）”；不再出现“不支持的操作”。七卡复制入口仍在。
- 系统剪贴板一项目，plain/HTML/RTF三个格式均有非空数据，RTF头合法。只记录类型和字节数，不保存正文；未把真实内容粘贴到测试文件或外部服务。
- 图标绘制/定位逐字对照、原生Geometry自检、剪贴板能力符号/无全局热键、独立只读复核通过。临时钉住恢复off。
- 服务仍PID 52498 / release555。主库指针、状态目录inode、草稿/位置偏好全部字节保持，自启脚本与两个LaunchAgent未变。没有真实便签试写。

## 证据与保护

证据：work/copyhost556/candidate-check.json、visual-preservation.json、native-readback.json、clipboard-readback.json、review.md、DIAGNOSTICS.md、build-preserved-visual.log。source-baseline记录执行前哈希。

原App正常退出（last exit0）后，创建新鲜私有备份work/copyhost556/adoption-backup，含App、完整FloatingNotesState、主库CURRENT及引用快照、自启配置。0700且忽略；真实数据禁止外传。替换前后主库revision 667保持。被替换旧程序另留replaced-native-app。

回退仅还原程序，不恢复旧主库或草稿。work/icon-b/native是旧功能宿主，不可再整包覆盖正式App；以后改图标仅合并绘制与几何到当前宿主，并核对富文本复制和无全局键能力。

未提交/推送，未更新长期记忆。源改动与运行采用、实际复制分别已验证；自然使用验收仍由常浩完成。唯一下一步：常浩照常点击右上复制；后续保持原功能和形式。

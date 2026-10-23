# 随手记本机粘贴图片交回571

输入569→认领570→输出WB-20261020-571，Codex。用户要求便签能粘贴图片，并明确保留原图标、卡片颜色、编辑格式、复制和手动打开。本轮已实现并正式采用；未提交、推送或安装依赖。

使用：复制图片或截图，点进便签正文后按⌘V；图片与文字共存并自动保存，收起/退出重开保留。PNG/JPG/WebP，单张8MiB、每张便签最多20张；图片只存本机。右上角原复制按钮继续带格式复制，支持接收图片的富文本应用可得到图片与文字。

## 实现边界

原paste只读取text/plain并preventDefault，图片被丢弃。现在先验证解码并原子存到主数据目录note-images，正文只放受限内容哈希引用。图片作为文档原子单位，选择/撤销/删除/字色不破坏正文；旧plain/md1无附件保持旧解释。异步上传保存/换卡/筛选/收起等待或阻止未完成动作，超时/失败不吞原文；本地草稿、base/sent、冲突与保留双方均携带images元数据。

服务使用同源授权POST上传与读取，不开放匿名图片GET、不取外网图片。存储拒绝路径/符号链接/硬链接，0700目录/0600文件、单FD校验及原子去重。已有Base64序列化正则在8MiB触发栈溢出的首败已换为等价线性检查；非法输入和真实8MiB均验证。完整备份ZIP包含图片并可隔离恢复，纯JSON导出仅含引用。

Cocoa NSTextView忽略RTF pict，故宿主仅加flatRTFD附件桥接。main.swift相对前像只接入一行，新增RichClipboard.swift与构建输入；32px暴龙机绘制、Geometry、窗口、无全局键及原纯文字复制路径保持。图标与卡片/原工具/布局没有重设。图片复制受原HTML/RTF体积上限及总图片7.4MB限制，超限会清晰报错且不清空剪贴板。

## 验证与审查

- 首败：真实剪贴板PNG paste无img；证据work/note-images570/repro-red.log。
- 最终全量1414/1414，build通过；9套便签浏览器全部通过，含旧多色纸面/工具/光标/布局对照/复制/DOM。RTFD补丁后重跑全量1414/1414、图片浏览器及文档7项。专项存储/文档/HTTP21项、草稿恢复3项通过。
- 原生实际WKWebView：合成PNG粘贴可见，自动保存，正常退出重开保留；文本可与图共存。整卡复制到启用图片接收的系统NSTextView，实际有1个附件和周围文字/红字/序号/勾选框。另以真实JS输出测试2图+emoji+跨行+序号+勾选框的UTF16偏移与Cocoa往返通过。
- Standards/Spec两轴固定25文件快照均阻断0，RTFD补审通过；清单、主宿主及数据身份固定的采用脚本经独立复核。最终脚本SHA cdfdc4bc1c296be1c3abba57799b77f1ce7ca3b232449d8283e5d45b5a796403。
- 关键证据：work/note-images570/review.md、review-manifest.json、release-manifest.json、unit-final-rtfd.log、regression/results.json、image-final.log、rtfd-multi-unit.log、native-paste-rtfd-passed.json、native-rich-paste.jpg。RTF首败保留native-paste-rtf-only-failed.json。

## 正式采用与保全

正式服务器569→/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/wb-20261020-571，PID59259→70562；441项完整程序和公开资源逐SHA回读，原9收藏扩展及继承功能保留。只执行一次bootout、一次bootstrap。bootout后即时launchctl仍可读注销中的job，守卫中止；只读确认return113且端口关闭后，仅补尚未执行的唯一启动，未重复停止或替换。回执见stop-diagnostic、stop-intent/stopped、start-intent/started、service-readback。

正式宿主/Users/nat/Applications/随手记.app，PID73594单实例，实际映射安装路径，新SHA df2ce558f32c759ae49cc55c9a37ff091e4aaf47fd286486bf9d09e040745129；codesign严格验证通过，无RegisterEventHotKey。采用后实际球为32px原暴龙机，点开加载5178、复制入口和已保存状态可见，收起回球。证据formal-ball.jpg及native-readback.json。

正式App正常退出后新鲜备份：work/note-images570/private-adoption-backup（0700目录/0600备份文件、Git忽略）。含主库CURRENT/对应快照、完整旧App、整个草稿状态、启动plist和入口脚本；不能公开或外传。正式FloatingNotesState目录inode、全部文件SHA和自启配置保留。采用前后主库revision670及CURRENT指针SHA完全不变，dataRootIdentity相等。真实便签未试写，测试全部合成隔离数据。

## 本轮异常及边界

用户所示多层“草稿尚未确认”弹窗来自隔离测试宿主：预览中文路径编码错误返回404，旧宿主退出保存错误模态重入。只终止测试PID9790/10208，正式PID87717和旧5f3e程序当时保持；修正预览路径，并只将隔离宿主showError改stderr。后续实测正常，测试App及预览进程已关闭，未修改正式错误提示逻辑。隔离宿主默认53949绝不可正式安装，正式采用的程序从根desktop源构建并固定SHA。

正式产生首张图片修订后，旧569 schema不支持images；禁止直接退旧服务或恢复旧CURRENT覆盖新便签。保留新数据/附件并向前修复，或另外准备兼容schema的旧界面程序。不要用备份覆盖用户后续编辑。

工程回归、正式采用和隔离实际路径已完成；常浩自然粘贴图片及业务验收待本人使用，不代签。唯一下一步：常浩在正式随手记自然粘贴图片使用，有具体反馈再按范围处理。共享写入者释放。

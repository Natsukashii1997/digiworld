# 随手记：只新增带格式复制，原功能和形式恢复553

输入549→复制550采用→551格式可见性候选→常浩明确撤回非复制变动→552还原→553完成。

## 最新范围与结果

常浩最终决定：只新增每张贴纸右上角复制，之前所有功能和形式不能改。551新增字色/列表入口、工具栏前移、scrollIntoView和跨卡保存修改已全部撤回，未曾正式部署。以复制前549（运行release548）为对照，原NoteEditor、浮窗CSS、note-document/note-dom/rich-note逐字相同；新建表单、墙右下旧复制与旧格式栏位置恢复。原随手记常驻、去方形阴影、列表光标和手动唤起要求均保留，无全局热键。

仅保留：新NoteCopyButton与note-clipboard、Notes/Floating的复制挂点、复制专用CSS，以及原生copyRich桥。复制图标绝对定位，不撑高header或卡片；遇旧已炼按钮/草稿徽标仅调整新图标位置，原控件位置不动。编辑时flush获取当前内容，复制不保存/关闭编辑；IME未结束则拒绝复制旧内容。普通新建表单未加新header/控件。

复制提供HTML/plain，原生同一NSPasteboardItem另有RTF；保留中文、emoji、五色、空行、序号/无序/任务状态和完成删除线。Cocoa HTML会重新编号，因此RTF用可见序号/任务框确保7→9保持。纯文本目标仍只能接文字与列表标记。

## 验证

- 全量单元1382/1382：work/copyonly552/unit.log。
- 原功能浏览器：notes-wall.log、floating.log、native-dom.log（8项）、caret.log（三类）；实际富文本复制/粘贴与未保存/长文/IME/失败反馈通过copy.log。
- 原版本布局对照：layout/results.json；320/1440墙、368×600浮窗，卡片/header/body/footer/原按钮/新建表单/编辑器/原底部工具条几何、纸色字色与列表渲染逐项一致；原已炼按钮中心命中通过。layout/有合成截图，未保存真实正文。
- 实际桌面：手动点球打开7张原便签，原字色下拉五色及有序/无序/任务工具已核对；仅打开/关闭菜单，未改真实正文，临时钉住已恢复off。native-readback.json。
- 最终基线差异copy-only.diff、restoration-check.json、validated-scope.json。首败与撤回记录DIAGNOSTICS.md；551候选仅留work/formats551/withdrawn-source诊断，不可采用。

## 正式采用与保护

release553：/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/wb-20261019-553，435程序文件逐SHA匹配；服务PID 39882。原生PID 39956，程序逐SHA等于原550安装版，未再次替换；签名通过、无热键注册符号。

正常退出保存后刷新私有备份：work/copyonly552/adoption-backup（0700且忽略，含真实数据指针/快照，禁止外传）；新鲜revision 625。备份后/服务切换后/UI回读后主库指针完全一致。原数据目录/身份、草稿目录、位置偏好、自启均保留。根dist仍历史原件，正式使用冻结release553；依赖/锁文件/HEAD未变，无提交/推送。验证进程已结束。

回退仅还原程序/plist并正常重开，保留最新主库与FloatingNotesState。原550和548程序留存，不恢复旧数据快照。

本轮为Codex工程、原生与独立只读复核；常浩最终自然使用验收仍由本人完成。唯一下一步：按原方式点击正文编辑及使用右上复制；不再扩大其他功能或形式改动。

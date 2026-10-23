# 桌面随手记：基本使用修复交回526

输入523，524真机验证发现故障，525修复；本次输出 **WB-20261015-526** 并释放写入者。常浩最新范围：“别再测试这个快捷键了不重要，确保点击悬浮球能打开，再点击能关闭，然后便签正常使用功能无错就行”。本轮按此收口；视觉复核仍由Claude负责。

## 结果与候选

点球打开已由CUA实际点击；常浩亲手验证再点球收起、再打开且文字保留，回复“能收起再打开，文字还在”。在真实AppKit/WKWebView候选中验证了中文多行输入、全部删空、重新填写、连续键入、撤销/重做、自动保存API回读、空白草稿退出重开、已保存正文退出重开。上述范围通过，不声称所有环境无缺陷。

- 前端：`work/floating524/candidate-dist`。
- 原生：`work/floating524/native-basic/随手记.app`，临时本地签名。
- 使用：双击`desktop/floating-notes/preview.command`，已改指上述新候选。点球→写一条→停手约1秒看到“已保存”；再点球收起，再点打开内容保留。
- 当前保留一份运行中的**合成预览**：53056服务、`work/floating524/fixed-state`恢复区；不连接正式5178。常浩无需读代码。后续预览启动新隔离轮次；不要直接双击app接入正式旧页面。

## 修复与证据

`src/NoteEditor.jsx`：原生输入可能改写contentEditable内部节点，React重建内部带key包装时会出现removeChild异常，根界面卸载，只剩全局网格。已对这一与用户截图相符的路径建立先失败后通过用例，把重建边界移到外层编辑节点，并在布局阶段重绑事件，保留焦点/选区/撤销。用户当时没有原生JS异常栈，因此不声称已捕获当次黑屏的确切堆栈。

新增`tests/notes-native-dom-browser.mjs`覆盖8项：非可取消输入、内部DOM重排、全部删除、连续组合输入、连续打字、真实换行与撤销/重做。`dom-delete-red`在旧候选3失败/2通过；新候选`dom-green-multiline`8项通过。

完整回归曾暴露测试竞态：下一场景的宽泛断网路由截断了上一条便签的写后GET。强制慢响应复现证据在`floating-race-red`；修正为等待上一条浏览器确认保存，按新便签ID注入失败，并跨恢复阶段观察一次PUT和成功GET。`floating-race-green`及`floating-regression-observed`通过。未为此改动保存业务逻辑。

证据均在`work/floating524`：`final-unit.log` **1331/1331**；`shared-notes.log`、`shared-rich.log`、`floating-regression-observed.log`通过；`build-native-basic.log`编译/几何通过；`native-basic-results.json`记录原生操作、服务回读和用户确认；`blank-draft-on-exit.json`保留空白草稿退出证据。Spec/Standards只读审查无当前范围内重大未闭合代码问题。

## 已撤回实验与边界

全屏隐藏在真机上未通过，常浩收窄范围后停止这条线。`main.swift`与`build.sh`已逐字节恢复524基线，`ScreenCoverage.swift`不在生产源码中；未通过的配置/覆盖范围实验和日志保留在`work/floating524/deferred-fullscreen-source`及其他原始实验目录。它们不是待采用候选。快捷键原有实现保留，不再追加测试。真实中文候选窗鼠标点击仍未验证，不能用中文粘贴或合成composition替代。

无冻结视觉改动，视觉SHA仍为`61e9d0b0ca13a9170ecf73549e6de18ca0ec3856ac32578d5fca4fceb0c5d223`。当前修复与测试、README/preview、状态/交接外无范围外变化；原523候选保留。保护检查及本次文件指纹见`protection-basic.json`、`final-manifest.json`。无真实便签写入、正式dist替换、5178重启、安装、自启、依赖改动或Git提交推送。

**唯一下一步：**Claude从CURRENT读取526，对新固定候选做视觉复核，沿用519冻结稿；不复开用户已暂停的快捷键/全屏测试，不把本轮基本使用通过等同原519全部要求验收或正式采用。正式安装/服务采用另需常浩授权。已写入共享状态，未向Claude发送消息，未代签其已读或验收。

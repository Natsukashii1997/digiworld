# 随手记列表光标修复与手动打开549

输入WB-20261019-546，认领547，用户取消全局快捷键的最新决定进入548，输出 **WB-20261019-549**；执行者Codex，写入者释放。

## 当前可用结果

1. 有序、无序、待选框列表换行后的竖线光标恢复；继续输入、保存以及精确md1内容均通过隔离验证，实际原生WKWebView也观察到三类空新行的光标。
2. 原生用于展开/收起的全局快捷键、快捷键设置入口及事件处理器已移除。旧正式程序正常退出后完成替换，新进程PID63855；二进制不再导入RegisterEventHotKey或InstallEventHandler。
3. 本应用偏好中的旧快捷键字段已清理：['key', 'modifiers']。位置字段、草稿区和主数据保留；没有更改macOS系统或其他App的快捷键配置。
4. 点击桌面球可手动展开，再收起后球仍常驻；正式5178连接回读通过。登录常驻继续保留。标准编辑菜单和便签栏内原有新建操作不属于全局唤起，没有随意移除。

## 根因、限定改动与验证

空列表行的正文span位于flex布局内，只有BR且最小宽度为0；三类换行后的编辑器焦点和文档选区都正确，但正文宽0，浏览器无区域绘制竖线。`src/notes-v16.css`仅新增一行编辑态[data-note-text]的flex:1/min-width:1px/min-height:1.65em；没有改文档模型、选区算法、持久内容，也没有放入零宽字符。

最初把collapsed Range矩形当成光标可见性的直接证据，这个判据被尺寸对照推翻：空BR即便已经绘制真实光标，Range仍可返回0。最终回归改为断言空行正文可绘制尺寸，并结合实际像素/原生截图：旧构建三类正文宽0均失败；新构建有序/无序272px、待选框248px均通过，且第二项精确保存。新专项`tests/notes-list-caret-browser.mjs`。红`width-red`、绿`green`，初始`red`及size/br/textnode/zws探针全部保留，未把试验字符带入生产。

隔离完整单元 **1377/1377**；便签墙、悬浮自动保存/冲突/断线恢复、原生DOM8项均通过；构建成功。实际原生验证使用独立App身份和合成服务，三类空行竖线截图已看见，保存状态可见。待选框输入验证遇到原生组合提交行为后，改为粘贴合成文字、单独Return验证，不冒充真实中文候选鼠标验收。

`desktop/floating-notes/main.swift`移除原生HotKey字段、启动注册、处理器、清理代码、设置菜单/窗口和Preferences key/modifiers。其余球无阴影绘制、点击/拖动、草稿保全、保存和标准编辑菜单保持。原生构建、几何、签名及独立Spec/Standards复核通过；README同步为手动打开。

## 用户纠正与首败

隔离原生旧测试包虽隔离了数据，仍沿用旧App的全局快捷键注册，产生宿主影响，这是本轮遗漏。用户明确要求不要快捷键后，已立即停止该测试进程；后续测试包不含全局注册，最终旧正式App也正常退出，新App不再注册此类按键。所有本轮验证App已退出，并转存`work/caret547/diagnostics/*.app.disabled`避免误启动。未写系统级快捷键设置，不需要把其他应用改回。

本机旧Playwright WebKit启动未完成，已停止，未作为通过证据；改用实际AppKit/WKWebView。准备合成App位置的辅助命令先缺import、后读显示ID为nil，已停止该支线，不触碰正式位置；测试改用固定窗口。一次隔离构建前复制路径误用stage相对路径，未改正式文件；纠正绝对源路径、核对源SHA后重新构建，误构建日志保留。正式App菜单点击两次超时后停止同样尝试，改用应用标准退出路径成功，正常exit0及草稿保全后才替换；没有强杀正式程序。

## 正式采用与数据保护

- 新网页/后端冻结程序：`/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/wb-20261019-548`，433文件指纹与最终清单一致。基于原543，仅CSS源及对应dist变化，backend源码未变；指定服务重新登记使整份冻结程序采用，PID63756。先确认旧登记已无/端口释放，再bootstrap，一次成功。
- 9个公开静态资源逐字节回读；dataRootIdentity保持；随机不存在便签ID只读GET为null。
- 新原生App：`/Users/nat/Applications/随手记.app`，SHA `4dc367a81207008bd64a48194da27dafa2501a6c2759bb6c6e9d4c2f249384b2`；与候选3文件匹配，单实例，手动球开关回读通过。自启配置仍RunAtLoad=true，实际注销重登未执行。
- 最新备份`work/caret547/adoption-backup`根0700、主库文件0600及本地ignore，含原服务器plist、旧App/静态页、revision467主库指针及匹配snapshot、位置偏好。采用前后主库指纹保持True。任务开始到采用前，主库变化：True；属于用户正在自然编辑的状态，保留最新版本，没有拿任务初始快照覆盖。代理没有测试性写入真实便签。
- 旧543冻结程序和旧App原件保留回退。回退只恢复程序，保留最新主库与FloatingNotesState。实施脚本是本轮一次性记录，不得盲目重放。无依赖安装、Git提交推送、Vault/真实Agent/外部系统写入。

## 成果指针与剩余

证据根`work/caret547`：`baseline.json`、`validated-scope.json`、`unit.log`、`width-red/results.json`、`green/results.json`、`native-dom/results.json`、`notes-wall.log`、`floating.log`、`native-observations.json`、`independent-review.md`、`release-manifest.json`、`service-readback.json`、`installed-native.json`、`final-readback.json`。源修复、构建/测试、正式采用和实际手动入口均完成；常浩最终自然使用验收未代签。

唯一下一步：常浩直接点击球，继续三类列表的自然输入与保存；不再设置或试用全局唤起快捷键。原全屏隐藏、真实中文候选点击和Hermes移除等范围外事项保持既有边界。

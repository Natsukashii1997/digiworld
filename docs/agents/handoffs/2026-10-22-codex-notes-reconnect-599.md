# 随手记连接恢复已修复并采用 · WB-20261022-599

输入597→认领598→输出599。用户报告工作台已启动，原生随手记仍显示未启动，点击重试无效。已在实际窗口复现、隔离红测锁定、最小修复并在正式原生窗口回读恢复。

## 根因与修改

正式服务PID844、session与notes均正常（10条）。原生恢复文件3个scope都是空records，但仍保留旧dataRootIdentity，与当前有效身份不同。store.initialize无条件继承空记录旧身份，使connect每次在请求notes前被目录保护拦截，重试沿用同一旧绑定。UI把该拦截统称为服务未启动。

只改src/floating-notes-store.js：仅恢复区有未完成记录时继承旧身份；空恢复元数据不阻止本次正常绑定。已经绑定的页面重复init不清身份；非空草稿、未知保存与待确认删除依然拒绝跨目录，不修改全局身份/API规则。不清空文件、不重置便签库、不顺带改UI或提示排版。

## 验证与正式采用

- 新增tests/notes-reconnect.test.mjs：7专项；最初3项红测证明健康服务仍无法连接，修复后与既有store/lifecycle/root-switch合计23/23。
- 新增tests/notes-reconnect-browser.mjs：原生桥接空旧身份直接打开、首次连接失败后点击重试恢复、非空草稿阻断且原样保留，3场景通过且不写主库。
- 既有floating-notes-browser全部通过，涵盖新增/编辑/自动保存/慢保存/草稿恢复/冲突/未知结果/锁与重试。全量1471/1471、构建通过。
- Spec/Standards独立两轴无阻断或重要项，绑定store SHA b1ebd684f38616cff42ef220e2558b396168dee37384cabf468af942bd5274ab；见work/notes598/review.md。未引入无证据的session空身份/超时额外修复。
- 新鲜私有备份后替换release589中1源、dist/index.html，新增哈希JS，旧静态资源保留；19候选资源和5首页引用HTTP字节一致。完整发布清单work/notes598/release-manifest.json。
- 正式后端PID844未重启；原生正常退出并一次启动，当前PID52556。实际悬浮球打开后10条、已保存、三个新建启用，离线提示与重试消失；整栏钉住保持off。
- revision790→790，主库指针/快照/10便签/图片不变；草稿所有scope为空。1048产品基线仅1源变动，其余1047不变，全部CSS、原生二进制、自启脚本/配置不变。HEAD e6e5d8b74474ea408ebb171ab70415e32d57ada4与既有dirty保留；未提交推送/安装依赖。正式为固定哈希本地采用，未创建提交。

[正式回读](../../../work/notes598/formal-readback.json) · [实际窗口](../../../work/notes598/ui-readback.md) · [浏览器结果](../../../work/notes598/browser/results.json) · [范围保护](../../../work/notes598/protection-readback.json)。完整原文备份仅在work/notes598/private-adoption-backup（0700），回退只恢复程序并保留最新数据和草稿。

本轮当前打开故障已闭环，无剩余实施项。唯一下一步为用户继续使用；下一次macOS重新登录/开机的自然使用未代签。非空跨目录恢复仍需核对，不能以此次空记录修复绕过保护。写入者释放。

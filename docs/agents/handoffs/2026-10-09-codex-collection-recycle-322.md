# 收藏回收整理交接322

输入320 / 认领321 / 输出322。执行者Codex，线程01a11f88-a8ee-7150-987c-13acfff4a943；start_head=15dd5ba70877180fcf251150cb460e5dfda4ba4c。保留共享脏工作区，不提交/推送/发布，不读取Vault、凭据或真实Agent配置。

## 结果与边界

用户授权收藏页集中整理删除笔记到本地、由本人手动永久清理。规格[04-recycle](../collection-replica/04-recycle.md)。此增量工程通过、5178已采用；真人使用待确认。原完整复刻票03的MCP采用、真实ASR和完整验收不因本票关闭。

- 新入口「回收整理」：列表/删除日期/状态/媒体数、整理全部、复制地址、根和单条打开访达、恢复、刷新。沿用数码世界令牌，44px、焦点陷阱、六宽度、长地址/标题换行；未保存/待恢复/正在保存的分组草稿闭锁。
- 唯一库仍 `data/collection/`；回收 `recycle/日期_标题_独立删除ID/` 内有已删除说明、正文/OCR/转写快照及原媒体。同库原目录移动，不复制媒体或硬链接。不触碰活跃版本、未知历史版本、模型、旧书籍原件或其他主库。
- 计划先持久化完整删除快照，导出wx/NOFOLLOW/fsync并回读校验后移动，最后压缩state.trash为摘要。note.json、笔记.txt均绑定hash/bytes；媒体绑定清单、大小、inode/mtime，恢复再验内容hash。
- macOS排他移动使用自编译且hash固定的recycle-move：原父目录身份与canonical根在行动边界前绑定，原生逐层NOFOLLOW+renameatx_np RENAME_EXCL。并发空目标/父目录替换均拒绝；不支持的系统/文件系统闭锁，无普通rename覆盖回退。源码/构建命令/证据在native/PROVENANCE.md，无新增第三方依赖/安装器/后台服务。
- 正反向journal支持中断核对；旧trash稳定ID、纯文本、缺失源媒体、同帖多次删除均覆盖。分析租约保护正在使用的媒体。手动移走/删除已整理目录不重新导出，部分缺失/修改不假装可恢复；同帖新收藏不覆盖。
- 恢复只搬回媒体、提交active，不unlink/rmdir导出目录。原文字历史快照保留供本人手动清理。没有永久清理接口/按钮，不清空macOS废纸篓。未知请求结果只读核对notes/workspace并同步revision，不重放mutation。

## 文件与验证

主要代码：server/collection/recycle.mjs、lib/recycle-move.mjs、native/recycle-move.c和二进制、native-runtime.mjs；collection.mjs/http.mjs；RecycleDialog.tsx、DeskView.tsx、xhs-client.ts、collection.css；ui-v14.css仅补4个新白卡语义色令牌，数值不变。新增collection-recycle.test/browser，fixture默认禁止真实Finder。

最终19文件SHA见[evidence/sha256.txt](evidence-2026-10-09-codex-322/sha256.txt)。无原始真实正文/配对码/凭据被保存到证据。

- 最终完整单元：隔离register + `node --test --test-concurrency=2 tests/*.test.mjs`，1196/1196，日志unit-release.log（118秒）。独立后端审查另跑回收10/10。构建通过，已有大chunk警告保持，不借机代码拆包。
- 最终recycle-release/canvas-release两浏览器专项通过：320/375/390/430/1024/1440、axe、44px、无溢出、焦点、草稿保护、提交后断响应、取消未发保存、计划中断续接、固定Finder stub、人工目录缺失与恢复。对应日志和截图在evidence。
- drag/motion/video/extension四专项通过；最终JS字节SHA与这些专项一致（仅后续局部回收焦点CSS改变），最终回收与画布宽度/焦点重新验证。保留Alt批选、原生拖拽/排序、外部剪藏、双向减少动效、MP4解码/Range/seek、插件未知结果同操作ID查询。
- Standards/Spec后端与UI子代理终审无剩余阻断。初次复核发现文本编辑被删除、restoring未验媒体、双FD读取、rename覆盖并发空目录、调用时realpath接纳外部父目录、恢复后路径清理能删外部文件、丢响应revision和取消待发saving闭锁；均隔离复现并修复。没有将临时fixture攻击移到真实库。
- T2最终VISUAL_PASS：release下11截图（六宽度+organized/missing/draft/empty/resumed），绑定3M2H9ban/BkK7sUwJ。原右/底焦点裁切已通过6px安全区和局部内侧环修复；旧T2不可套用。

首轮unit.log保留1192/1195失败证据：2个收藏设计令牌违规已修；另一个controlled-execution时序失败未改该模块，独立25/25和后两次完整低并发回归通过，不声称已定位其根因。前版final日志/截图保留，不作为最终视觉依据。

## 运行采用与真实数据

同现有launchd cn.personal-ai-workbench.server、Node、目录、数据与5178受控重启。重启后立即读HTTP首试ECONNREFUSED，随后只读就绪轮询确认成功，未重放真实mutation。最终HTML+4引用资源与dist逐字节一致，见runtime-assets.json：JS SHA5d7c116f4b50d63dee0aa92fb9d8d2eb10d0869620e8b9ad3c87364fbff20373；CSS SHA9f0c18e45e88df737ffb5f391491578cb8e7642fbe5a402818fedbc46227f5d9。

实际collection state前后SHA `de985cf7a786e85bef9a11ce93eba38ee96436f6b19657312d2e427b396f1fc5`，revision18，6active/0trash/0processing，未改收藏、配对、分组或删除真实笔记；仅打开根目录时创建空recycle。真实页面已见新入口、0记录、正确地址及「已请求在访达打开」。原生Finder截屏仍受ScreenCaptureKit -3811限制，不声称窗口画面验收。真实整理/恢复尚无已删记录可验，已用隔离合成资料覆盖，真人验收分列。

用户成果：`/Users/nat/Documents/Codex/2026-10-09/ui/outputs/收藏回收整理使用说明.md` 和 `收藏-回收整理已上线.png`；实际新版IAB已展示，保留为deliverable。

## 唯一下一步

常浩查看并实际使用本次回收入口；下一次删除会进入待整理。只有保留删除记录可整理，已彻底删除且无快照的历史内容不能找回；未知历史媒体不盲扫清理。之后继续原03剩余MCP/原生和完整复刻验收，不以本增量通过替代整体完成。若其他Agent接手，先读CURRENT与此交接核对SHA；未向其他独立客户端发消息或声称其已接手。

# 收藏 Obsidian 撤回与纯本地恢复331

输入328，329曾完成批准的2条/4媒体迁移；用户在期间新增第三条。最新用户纠正要求回滚到接入前版本、只本地存储、移除功能及刚同步的3条Obsidian数据。认领330，输出331。start_head=`15dd5ba70877180fcf251150cb460e5dfda4ba4c`。未提交、推送、安装或发布，保留其他 dirty。

## 实际数据结果

- 以当前state37/SHA `71be5ea4c4b390147833abe4541ead83a7a253e8f3a02c6149f4d298d308400f` 反迁，未使用只有2条的旧state33覆盖。3条完整正文/OCR/已有文稿恢复到本地state38；删除active的vaultRef及state的vault/vaultMigration。
- 15媒体共51,826,422字节。旧4媒体仅核对不覆写；第三条 `6ac4ba630000000018038fea` 的11张图片排他复制回 `data/collection/versions/2cb2e844f65b9b93f25c8c21d6a1f5ac/media/6ac4ba630000000018038fea/`。15文件SHA/字节全部一致。
- 当前desk/categories/operations/extensionHash/4条旧trash深相等，3条本地收藏没有删除。state38 SHA `18de873ca7126d14b626c840079c07ac37a3af2dabd45294c1c404a962192582`。
- Vault原专属区 `00 待整理/待分类/数码世界收藏` 不再存在。精确19文件（3MD、15媒体、library.json）已移到 `/Users/nat/.Trash/数码世界收藏-撤销Obsidian-20261009-8c8064a6`，逐文件SHA与原清单相同。没有清空废纸篓或永久删除。
- 本次反迁控制备份在 `data/collection/rollback-obsidian/8c8064a6-c78e-43e6-9c34-3c68ef9afcdb/`，包含37前像及3条hydrated快照；旧一次性迁移快照也保留。它们不是第二套在用来源，禁止自动覆盖新收藏。

## 工程撤回

8个功能源码按327前像恢复：collection、MCP、recycle、http、full-backup、DeskView、xhs-client、types；StoragePanel恢复其单独前像。SPEC边界恢复前像。新增Dialog、3存储适配模块、native .c/二进制、2份Obsidian测试删除；PROVENANCE只删本轮Vault段，旧native/视频能力保留。

collection.css仅删20条Obsidian规则，独立只读重建与接入前CSS字节一致，SHA `f0d0c250c63340298cfea9767cec07e0968bc754601f21805fb0c07420d76b3c`。styles.css无专属规则，保留原共享dirty；不按Git HEAD撤销其他页面。05标明撤回历史，tracker不再当活动功能。收藏相关src/server/tests生产引用归零，独立知识库模块的Obsidian能力没有删除。

## 验证与运行采用

- `npm test` 1196/1196、0失败，38.486秒；移除的14项是已撤回功能专项，不是放宽原1196断言。
- build通过，2174模块，既有大chunk警告；collection-browser及collection-recycle-browser通过，六宽/相纸/堆叠/分组/配对/本地删除/红字隐藏等仍在。
- 同5178服务受控bootout→bootstrap，沿用既有Node/LaunchAgent/cwd/data/端口与配置。根HTML及新JS/CSS逐字节与dist一致；JS `index-C8yaOEMV.js` SHA `85ead98d798e5db9bdb28cd1361e0be15b4f196bda5a6cf9e5f6928eccd73abf`，CSS `index-CAil0ioX.css` SHA `d83c75bd722147c64f9b655c2dc2ec1db2c30d6b949a12187067c8638d365aee`。
- 实际HTTP读回3完整笔记及15媒体，Range206/首1024字节与本地一致；7个收藏Obsidian接口均404。原IAB刷新，Obsidian按钮0、3个封面naturalWidth>0；画布与插件入口保留。
- 主库data/CURRENT.json SHA `9478ee2539d5208e7b7b343867abaa8812172f6d171f0c72fb1c7a6f0bbc6f4f` 与反迁前一致。
- 独立只读复核通过：当前3条/15附件、旧4回收和操作/分组/分类保持，8源码与StoragePanel前像、CSS重建均匹配；原Vault区不存在、Trash精确19文件身份与SHA匹配。最终再次核对state38、15本地附件及19回收文件SHA通过。
- 同固定JS/CSS构建T2 `VISUAL_PASS`；更新实际截图 `outputs/收藏-已恢复纯本地.jpg` SHA `bb7602787810d83eddac18fbb6fe04c593351b6ac2bcc2152f5519230578c310`。展开组内两卡白边/封面/分类/标题无重叠，分组外第三卡退后变暗为既有展开态；不是用户最终验收。
- 329阶段实际Obsidian曾打开两条正文/媒体；其截图现在属于已撤回历史，不是当前功能。

## 首败和边界

回收native mover在本次Trash目标首败 `directory identity changed`；再次只在确认源目录仍完整、目标不存在后取得原错误。未修改native安全规则或声称已修复。随后根一次性普通Node filesystem rename，在精确19清单/SHA/身份与目标不存在核对后完成，源路径不存在及Trash完整19文件回读。这个一次性操作不是产品内自动fallback，也不声称提供同用户恶意竞争下的OS隔离。

本轮不扫描其他Vault/Trash，不读取GET、隐藏配置、凭据或其他私人正文，不修改正式知识或真实Agent。只证明本次指定数据与工程边界，不声称整个Vault零后台变化。新导入/真实转写的长期使用效果、原03其他验收以及用户最终验收未代签。

证据：`evidence-2026-10-09-codex-330/` 中 rollback.json、trash-request/result/first-failure.json、live-verification.json、unit/browser/recycle-browser.log；实际截图在本聊天outputs/收藏-已恢复纯本地.jpg。

唯一下一步：用户验收当前纯本地收藏；不继续Obsidian、自动知识提炼或清扫备份。

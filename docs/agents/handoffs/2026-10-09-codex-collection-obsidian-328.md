# 收藏 Obsidian 单份素材库工程交接328

输入326，认领327，输出328。start_head=`15dd5ba70877180fcf251150cb460e5dfda4ba4c`。用户选择方案3，授权工程实现；真实批量迁移仍需影响清单与回退方案后确认。未提交、推送、发布、安装依赖，保留共享 dirty 工作树。

## 工程结果

新增05规格、受控 Vault 存储/迁移、HTTP 预览/确认/状态/打开/未完成返回原库/原Vault恢复重确认，最小连接弹窗和详情 Obsidian 打开按钮。工作台保留画布/分组/分类及薄索引；正文、OCR、已有视频文稿从来源 Markdown 回读，本地媒体由同一来源区提供。分类不搬文件，来源更新不可变版本，旧版本留存。已连接删除软标记，整理仅生成删除清单，不移动或永久删除来源和媒体。旧回收恢复自动转换并逐文件补齐媒体。原MCP遇已连接 Vault 明确拒绝读取，不自动扩展权限或配置真实Agent。

固定专属目录 `00 待整理/待分类/数码世界收藏`。隐藏目录、GET NOTES、链接/硬链接、数据目录内Vault、状态/文件漂移拒绝。来源手工编辑或换身不覆盖、不复活、不读旧正文回退。新采集先本地临时暂存，校验写入Vault并提交后移除暂存；不明提交保留供核对。迁移复制并保留原状态和原媒体为一次性回退备份，不是第二套在用来源。

`vault-file.c` 本机自建适配通过逐级 `openat`/`mkdirat`/`O_NOFOLLOW` 与目录句柄、device/inode/纳秒birth绑定读写，排他创建、不覆盖；SHA/体积/身份回读。二进制SHA `10dc60d519465207c29895c800c5cee4c24bb2004c1d05226fd5d210d9be3c74`，源码/构建/边界在 native/PROVENANCE.md。不是阻断同用户恶意改写项目运行代码的OS沙箱；哈希校验与启动非原子，这一条件风险保留，不能声称已解决。

工作台ZIP明确排除外部Vault，并在下载/恢复页面告知。reconfirm只适用于原Vault及素材身份不变、工作台目录恢复的场景；整体Vault复制/搬迁导致身份改变不自动接受，仍需另行核对重绑。成功迁移后的旧快照回退必须先核对期间新增数据，不提供覆盖当前库的一键回退。

## 验证与首败

- 最终 `npm test` 1210/1210、0失败，40.847秒；`unit-final.log`。
- Obsidian专项14/14覆盖只读预览/迁移/重启/新导入/分类不搬/软删恢复/旧回收partial补齐/视频Range与重分析/手工编辑保护/替换身份/路径与权限/MCP关闭/ZIP真实集合/原Vault恢复重绑/中断返回/不存在及空部分快照。
- `collection-obsidian-browser.mjs` PASS：六320/375/390/430/1024/1440，输入/预览/全部文件明细、零横溢/axe、44px/焦点；响应丢失先查询无重放/忙态防重复关闭；媒体、详情打开stub、未知返回。`browser-final.log` 与23图。
- `collection-browser.mjs`、`collection-recycle-browser.mjs` 通过，既有相纸/堆叠/散落/分类、分组草稿、配对和本地删除/红字隐藏仍在。
- Spec轴全部已报告重要问题消除。Standards三项对抗复验：父目录换链接外部零写、partial媒体可补齐、同字节新inode首次读取即409；20项相关复验绿。剩余同用户可改二进制的执行窗口是显式信任边界，不作为通用沙箱通过结论。
- T2初版仅unknown提示重复，修正后23图逐张复审 `VISUAL_PASS`，仅视觉，不代签用户。
- 首败保留：最初HTTP404；连接媒体读失败；旧回收恢复缺图；隐藏路径可用及媒体换身；目录检查后越界写；partial恢复永久跳过；迁移快照缺失/部分写锁定；浮点birth跨语言7/30不一致改为纳秒；首全单测1206/1207因新增18/11px未用字号令牌；浏览器focus/滚动列表无焦点、卡片脚本选择collapsed inert对象，均定点修正和重跑。迁移未知不推进成功结论。

## 固定构建与采用

最终build通过，2175模块，既有大chunk警告不扩围。

JS `index-R_Y1A40E.js` SHA `174c5c5e766f272ceb0d6884019d6bef64237cbb0f65520659d337ed79887efc`；CSS `index-O-Y253gz.css` SHA `66bd0efc72d15a6b48576db16014ac28b87e7b1361f8f608e56d592526cb612e`。

原5178后台 PID83033 →69754，仍用既有 WorkbenchServer.app Node、同server/index.mjs、同cwd/data/端口/LaunchAgent；未改常驻配置或授权。新接口404→200，`/`HTML及最终JS/CSS逐字节与dist一致。一次错误探针 `/index.html`404已区分：真实根入口 `/` 正常一致，不把该路由误当漂移。

原IAB tab1刷新后新入口可见，真实只读预览2notes/4media/48.72MiB/4oldtrash，停在确认前。state前后SHA `84c053b830ea905dc385b59d41c01b049d5051f8bcc6d4c0d0b719e142355e40`、revision33不变；目标目录不存在。当前主库指针SHA `9478ee2539d5208e7b7b343867abaa8812172f6d171f0c72fb1c7a6f0bbc6f4f`，本轮未记录其输入前像，不宣称与历史a2b…未变；没有有意修改主库业务内容。

## 指针与下一步

前像10源码及收藏state哈希在 evidence-2026-10-09-codex-327/baseline.json；StoragePanel编辑前像另存baseline/StoragePanel.jsx；collection.css初次改造前未记录前像，不冒充完整回档。

用户影响清单及回退：`/Users/nat/Documents/Codex/2026-10-09/ui/outputs/收藏接入Obsidian-迁移清单与回退.md`，实际截图 `收藏-Obsidian迁移预览.jpg`。目标新增2MD、4媒体、library.json；2在用/4删除、媒体51,082,010字节。4旧回收不迁移；GET、隐藏配置、其他私人正文、正式知识和真实Agent未写。

唯一下一步：用户确认本精确迁移范围后，重新只读预览并核对计划未漂移，再执行一次连接、校验来源与薄索引/媒体/画布、实际Obsidian打开及用户验收。确认前不点击迁移，不自动清扫原文件，不自动开放检索/MCP，不代签真实ASR或其他原03验收。

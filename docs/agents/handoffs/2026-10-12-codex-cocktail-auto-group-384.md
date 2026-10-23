# 调酒本地自动进组 · 工程交回384

输入WB-20261012-382 → Codex认领383 → 输出WB-20261012-384。start_head=`e6e5d8b74474ea408ebb171ab70415e32d57ada4`。用户原话：仅调酒组、本地规则、明显自动进去、不确定留散卡、不调用付费AI、人工调整不再动、支持撤销并验证误分。

本地实现、工程验证、5178运行采用通过。Claude独立验收与常浩使用验收待进行；未声称另一客户端已接单。

## 已实现与使用方式

刷新收藏页；保持现有且唯一的“调酒”分组。以后新收藏满足下列全部证据时自动进去：标题明确是调酒/鸡尾酒制作或配方；导入已有正文/OCR/文稿有已支持的基酒名称、非零用量、实际调制动作；没有酒驾/招聘/营销/AI设计/探店/酒评/无醇/非饮品等冲突信号。没有调酒组、分组重名、证据不全或不确定时留散卡。不根据封面酒杯、孤立“酒”字、单个标签或正文偶然提及做决定。

导入成功后，画布和收藏阅读器显示自动进组原因及“撤销”。撤销回到散卡并恢复原分类，刷新后仍可核对。人工改组/类别、回收、删除后的旧凭据不会覆盖手动操作；重新导入或重新转写也不会再自动分组。旧收藏不回填，不自动建组，不扩展其他组。

未保存分组草稿、编辑、回收/删除/导入处理中禁用撤销。网络异常先核对服务端凭据；结果未知显示“待核对”，下次点击或刷新仍先核对。若另一入口正在导入，409拒绝撤销且无写入。

分类仅执行本地`cocktail-local-v1`规则，不请求模型、不额外转写、不增加依赖；不消耗运行时Codex分类额度或付费AI用量。原有导入/视频文稿流程的提供方与收费不因本次分类改变。测试不实际调用ASR或付费服务。

## 实现与审查边界

- 服务端：`server/collection/lib/cocktail-grouping.mjs`纯规则；`server/collection.mjs`原子导入/receipt/人工优先/撤销；`server/http.mjs`已有session与CSRF保护下的receipt查询及undo接口。GET只派生信息，不迁移、不写收藏库。
- 前端：DeskView共享提示、输入忙/草稿保护、采用服务端导入workspace；xhs-client每次显式撤销先读receipt，仅确认active才POST；types与局部collection.css。原铭牌、纸卡和动效不改。
- 新增10项规则/真实HTTP接口测试、66条可重复合成矩阵、实际浏览器导入/撤销/人工保护专项；既有canvas合成fixture显式进组；动效专项有界等待修正。
- 两轴审查14文件冻结candidate4，SHA256 `3f15431d5dec8ae9d3c2ab0608126934f093a6d0cfbecac7fbb3773b0a9e9ae4`。两轴通过；各轴意见见[最终两轴记录](/Users/nat/Documents/Codex/2026-10-11/readreveal-31ms-199ms-170ms-claude-30/work/cocktail383/review-final.md)。交接时仅票据/规格状态和验证结果元数据更新，代码/测试12文件仍与candidate4相同；记录在delivery-manifest.json。全部修正、首败、无效对照及候选1—4保留，见[修正历史](/Users/nat/Documents/Codex/2026-10-11/readreveal-31ms-199ms-170ms-claude-30/work/cocktail383/review-history.md)。

## 验证与局限

| 验证 | 当前结果 | 证据 |
|---|---|---|
| 保守匹配与实际HTTP导入 | 66条合成样本：10明确配方正确自动入组、56不确定/排除项留散卡，样本误分0；每条经过真实导入接口 | [样本](/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/tests/collection-cocktail-cases.mjs)、[专门10项通过](/Users/nat/Documents/Codex/2026-10-11/readreveal-31ms-199ms-170ms-claude-30/work/cocktail383/green-action-boundary.log) |
| 保护与故障 | 旧数据/无组/重名、手动移动/类别/回收、重导入/转写、幂等撤销、旧凭据409、认证、重启后凭据、并发导入及配对插件409通过 | 同上、[测试源码](/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/tests/collection-cocktail.test.mjs) |
| 全量单元 | 1204/1204通过，0fail/cancel/skip | [最终单元](/Users/nat/Documents/Codex/2026-10-11/readreveal-31ms-199ms-170ms-claude-30/work/cocktail383/unit-reviewed.log) |
| 新浏览器 | 17记录、0pageerror；外部DataTransfer真实导入路径、刷新、键盘、失去响应/未知读回/显式重试、草稿/手动拖动保护 | [结果](/Users/nat/Documents/Codex/2026-10-11/readreveal-31ms-199ms-170ms-claude-30/work/cocktail383/browser-reviewed/results.json)、[日志](/Users/nat/Documents/Codex/2026-10-11/readreveal-31ms-199ms-170ms-claude-30/work/cocktail383/browser-reviewed.log) |
| 六宽 | 320/375/390/393/430/1440的画布提示与阅读器：Axe 0、按钮52×44、无页面/提示横向溢出，完整图与组件图保存 | [375提示](/Users/nat/Documents/Codex/2026-10-11/readreveal-31ms-199ms-170ms-claude-30/work/cocktail383/browser-reviewed/notice-375.png)、[1440阅读器](/Users/nat/Documents/Codex/2026-10-11/readreveal-31ms-199ms-170ms-claude-30/work/cocktail383/browser-reviewed/reader-1440.png) |
| 八个已有浏览器专项 | canvas、plate375、drag、video、recycle、extension、redesign、motion均通过（加新增共9套） | evidence根目录`regression-*.log`，motion以`regression-motion-corrected.log`为最终 |
| 已有视频文稿 | 合成视频正文无配方、已有文稿含基酒用量和步骤时可正确入组；分析1次、额外转写0、付费模型0 | [视频入口结果](/Users/nat/Documents/Codex/2026-10-11/readreveal-31ms-199ms-170ms-claude-30/work/cocktail383/video-transcript-result.json) |
| 最终审查 | Standards无规范违反/判断性建议；Spec通过；T2仅视觉VISUAL_PASS | [T2记录](/Users/nat/Documents/Codex/2026-10-11/readreveal-31ms-199ms-170ms-claude-30/work/cocktail383/t2-visual-record.md) |
| 构建 | 成功；原有>500k bundle警告保留 | [构建日志](/Users/nat/Documents/Codex/2026-10-11/readreveal-31ms-199ms-170ms-claude-30/work/cocktail383/build-delivery.log) |

样本不是长期真实准确率：词表之外、标题无明确制作意图或文稿没有用量的真实调酒视频仍会留散卡。这是第一版有意保守；不能保证所有未来变体零误分。六宽是浏览器模拟，无实体移动设备或人工读屏验收。没有用真实私人收藏做测试性导入/移动/删除，也未真实调用ASR。

首败保留：导入/撤销red；初始规则误入；复审发现画布强制散卡、未知撤销重放、非饮品/无醇和动作词子串、插件并发门禁，已加有效red后修正。旧motion专项首败因既有≤3秒相位与固定1250ms观察窗冲突，改成≤5250ms有界位移观察，原断言保留，产品动效代码未改。原redesign专项有既有FileHandle GC警告，未抹掉。

## 目标运行环境采用

现有服务`cn.personal-ai-workbench.server`，同Node、目录、端口5178，确认无pending导入后受控kickstart；PID 65924 → 97328。不改服务配置、环境或授权，不新装服务。

源码采用指纹`4cc06a07543d22ce0e9077e82ce1ac5cea305387655ef93d8072e9ce20d5cd88`，重启前后及交接前一致。最终dist本地17文件清单SHA256 `352fc26df43b125eadaca61a28e47236d2466650271f537175bac41af40dce7f`；公开的首页`/`和6个当前资源共7个HTTP文件逐字节匹配（不声称其余theme文件公开）。[采用回读](/Users/nat/Documents/Codex/2026-10-11/readreveal-31ms-199ms-170ms-claude-30/work/cocktail383/adoption.json)、[最后保护核对](/Users/nat/Documents/Codex/2026-10-11/readreveal-31ms-199ms-170ms-claude-30/work/cocktail383/delivery-guard.json)。

原用户IAB页已刷新、实际新增帮助文案可见；真实4条收藏、原分组数量保持；没有真实测试导入。真实收藏state从开工到采用后再到交接前SHA256均为`39a70fe1fda7d59e7f393c6a7852072897763484b40dfeada385f50992ccc102`。

主库data/CURRENT.json动态变化：开工eba45e…、采用前后286f37…（该采用边界内相同）、交接前be24af…；不将全轮动态活动声称为“不变”，未定位其来源、未恢复旧快照。实际hash在baseline/adoption/delivery-guard分段保存。本功能与合成测试没有设计主库写入路径，未将动态状态回滚。

## 未完成与唯一下一步

文件修改、工程检查、目标运行采用及隔离用户路径通过；Claude独立验收和常浩真实新收藏使用验收未完成。写入共享CURRENT后交回，未发另一个客户端的消息，未代签读取/接单回执。

唯一下一步：Claude按此交接只读复核关键规则、人工优先、撤销及当前提示截图，再由常浩使用下一条新调酒收藏确认体验；出现失败保留具体标题/输入与请求状态，返回此票修正，不重分类旧收藏。

无安装、提交或推送；HEAD保持开工值；原有`docs/design/ui-v17/`、3个fixture目录和`work/`未清除，无reset/stash。未读取真实Vault、私有Agent配置/凭据，未产生真实付费调用。

复跑：仓库根`node --test tests/collection-cocktail.test.mjs`、`node tests/collection-cocktail-browser.mjs`（默认为隔离测试目录，可用GUIJI_TEST_RESULTS指定结果目录）、`npm test`、`npm run build`。实际采用需按共享写入协议受控处理，不让常浩自行排错。

# Codex → Claude｜认领 87 独立复核：A 通过；B 待返修

输入 **WB-20260930-88** → Codex 认领 **89** → 输出 **WB-20260930-90**。执行者 Codex，2026-09-30。范围仅认领 87 的 A（原图蛋与 83 两条 B 建议）/B（UI v13.2），纯复核；未修改业务源码、正式测试、PRD、设计、dist 或依赖。

**结论：A 通过本轮代码与本机运行复核；B 不通过，5 组重要事项待返修；T2 为 TUNE。没有致命发现。常规回归全部通过不能抵消额外边界失败。不是真人验收。**

## 固定范围与双轴

- 新 176 文件清单 SHA256 `eb556480912567a39a37c8c69b85a4d8f483dd853f7eb34c878fcba7a9e93ead`；开工/结束全部匹配。相对 83：11 修改、4 新增、0 删除，11 个前像全部匹配。应用仍未跟踪，Git HEAD 不作代码基线。
- [固定差异](evidence-2026-09-30-codex-review-87/fixed.diff) SHA256 `f0270a6b58878849630de3e577eb1101305131adc63e05f3fcd44c82e86d89c5`，两个只读子代理用同一内容快照。
- A 阶段清单 SHA256 `fb8151f2120c19c83c97ad5f6eaf1b5038911c0bdfb2dbbe9cfd000b64ae188d`。从核验过的前像在内存应用 A.diff，172 项全部对上；A 改 5 个代码/测试文件。独立建立 [B 增量差异](evidence-2026-09-30-codex-review-87/stage-B.incremental.diff)，没有把 Claude 的累计 B.diff 误当纯 B。
- [双轴报告](evidence-2026-09-30-codex-review-87/review-axes.md)：Standards A 0、B 2 重要/1 建议；Spec A 0、B 4 重要/1 建议。保留轴内分级，根另补运行证据与最终事项分组。

## A：通过

原图 12×14 EGG_ROWS 与 pixel.jsx 原图逐格一致，rasterEgg(0) 每格颜色/空格一致；旋转描边和跳高上沿限制经代码与独立单元回归核对。视觉实际对照 13.1c，侧栏/暴龙机保留原图形状和斑纹。

1. 真正挂起 clipboard promise，移动焦点到合成按钮，再放行：第一粒子 x=1113，原按钮中心约 1131（设计本身第一粒子偏移 -18px），起点仍来自原按钮。使用记录正常保存。
2. 第三颗 data-bit.animate 同步抛错：残余粒子 0、接住事件 1、使用记录 1→2、页面异常 0，83 异常清理建议闭合。

首次起点探针在抽屉过渡动画结束前取坐标，预期 x=1695 已在视口外，得到错误 false。保留 [首次源/日志/结果](evidence-2026-09-30-codex-review-87/boundary-results.attempt1.json)；修正探针等待过渡完成，**仅重测该起点项**，见 [capture-results](evidence-2026-09-30-codex-review-87/capture-results.json)。没有将探针错误误报为产品缺陷，也没有只留重跑通过。

## B：5 组重要返修事项

### R87-B1｜工作流的成功传送字被裁切（重要）

位置：`src/transfer.js:56–65`；`src/styles.css:393`；工作流复制按钮。依据：设计 `13.2-interaction.html:120` 要求完整点阵 TRANSFER OK。

复制工作流说明后，按钮宽 **141px**，画布宽 **160px**（右界 1071 / 1090）；overflow:hidden 裁掉右侧，截图实际缺少末尾 K。[运行数值](evidence-2026-09-30-codex-review-87/additional-results.json)、[工作流裁图](evidence-2026-09-30-codex-review-87/transfer-workflow.png)、[参考](evidence-2026-09-30-codex-review-87/reference-transfer-button.png)。Prompt 六宽度、Skill 桌面完整，问题不能从它们的通过推断排除。

修复标准：现有共享 transfer 内适配按钮可用宽度，不改按钮业务含义/布局方向；三个复制类型在相应窄屏都完整显示且按时复原。断言实际文字/像素可见范围，不只检查 canvas 存在。

### R87-B2｜装饰失败留下覆盖层并锁住后续演出（重要）

位置：`src/transfer.js:28–33、46–65、82–92`。依据：87 声明“全部 try/catch”；装饰异常不得破坏界面或复制/记录；设计约 1.8 秒复原。

仅对 `.transfer-lcd canvas` 注入 getContext=null，其他画布正常：正常动效的延迟 reveal 产生未捕获 setTransform 异常；减少动态效果虽吞同步异常，仍不清理。两模式 2.3 秒后均残留 overlay=1 / is-transferred；恢复 canvas 后第二次复制依然复用残留画布，running 阻止重播。使用记录分别 2→4、4→6，**业务保存没有丢失**。[首次探针](evidence-2026-09-30-codex-review-87/boundary-results.json)、[正常模式残留](evidence-2026-09-30-codex-review-87/transfer-failure-no-preference.png)、[减动画残留](evidence-2026-09-30-codex-review-87/transfer-failure-reduce.png)。

修复标准：同步/延迟 reveal 与打字回调异常都收尾，清定时器/节点/状态类/running，复原原标签，下一次正常复制可以再演出；异常不影响记录幂等与恢复。

### R87-B3｜减少动态效果仍轻弹，并叠显旧、新数字（重要）

位置：`src/interaction.css:178–200、292–300`；`src/Odometer.jsx:9–14`。依据：PRD:375 系统减少动态效果时全部关闭，静态应显示当前数值。

reducedMotion=reduce：REV 更新时旧 8、新 9 的矩形完全相同，两者 display:block / animation:none，叠显约 460ms。另一隔离例把待处理 1→2，顶栏徽标仍 animationName=count-bump，文本采样为“12”。[矩形证据](evidence-2026-09-30-codex-review-87/boundary-results.json)、[父动画证据](evidence-2026-09-30-codex-review-87/additional-results.json)。

修复标准：减少动态效果时直接、唯一显示当前值，旧数不可见；所有父/子徽标动画关闭。验证 REV、资产/随手记/待处理与版本号，含初始值和数字位数变化。

### R87-B4｜数字屏数据滞后；减少动态效果下切屏残影不消退（重要）

位置：`src/Home.jsx:199–205`、`src/PartnerScreen.jsx:36–38`；`src/partner-lcd.js:423–442、514–526`。依据：设计 13.2:164 的待处理条数/蛋切换。

- **a 数据分支**：挂起初次规则记录请求，A 切到数字，再返回模拟读取失败；真实待处理标题 **0→1**，数字 canvas 字节不变，切回蛋再切数字才更新。缺少在数字模式订阅当前 pending.length 的路径。
- **b 画面分支**：减少动态效果切数字后，render 只执行一帧而 glow/tint 保留旧蛋；1 秒后仍有 **108 个橙色蛋像素**。正常动画相同操作为 0，截图清晰叠有旧蛋。不能只修数据订阅后关闭本项。

证据：[数据分支](evidence-2026-09-30-codex-review-87/boundary-results.json)、[像素对照](evidence-2026-09-30-codex-review-87/reduced-number.json)、[减动画数字图](evidence-2026-09-30-codex-review-87/number-switch-reduce.png)。

修复标准：显示数字时随当前事实源更新；切换/引擎重建/减少动态效果时显示干净的当前画面，旧蛋或旧数不会永久残留。加载与错误来源变化也应一致。

### R87-B5｜已确认设计的 C 机身键未实现（重要）

位置：`src/Home.jsx:185–215`、`src/pixel.jsx:845–851`。依据：设计 13.2:154/166 “机身三个按键都能点，也能用键盘操作”；C 戳蛋，直接点屏幕也可。

实际只有 A/B 两个 `.dv-key`；左侧圆键命中 circle，没有 button；可访问按钮树无 C 键。屏幕戳蛋是另一入口。未找到用户删除 C 的后续决定，Claude 交接仅写 A/B 不可代替修改已确认设计。[命中证据](evidence-2026-09-30-codex-review-87/additional-results.json)、[三键参考](evidence-2026-09-30-codex-review-87/reference-three-keys.png)。

修复标准：原左机身位置有 C 键真实可操作与可访问名称、至少 44px、键盘可用，复用已确认的戳蛋轮换行为；保留直接点屏幕入口。

## 非阻断建议与历史项

- **R87-S1**：设计 13.2:138 包括使用次数滚动；AssetUsage:273–276、Assets:307 尚为纯文本，计次正确但视觉只部分实现。
- **R87-S2**：docs/design/ui-v13/README:10 仍写 13.2“尚未实现”；交接应更新为已落地待返修，避免新的接手者误判。
- 83 A 的“重读期间旧升级行标记”继续保留；历史 skill-copies-browser:502 / usage-browser 偶发本轮未重现，**未定位、未宣称修复**。

## 独立验证与运行采用

| 项 | 本轮结果 | 证据 |
|---|---|---|
| npm test | 427/427 首跑通过，0 skip | npm-test.first.log |
| 4 个独立入口 + 24 个 *-browser | 28/28 首跑通过 | validation-results.json 与各 first.log |
| visual 独立标签 codex-review-87 | 首跑完成，120 PNG，problems=[] | visual.first.log、test-results/visual/codex-review-87 |
| 320/375/393/430 额外复制详情 | 无横向溢出；不是各类型裁字的全面通过 | capture-results.json |
| 临时构建 | 13/13 与现有 dist 逐字节一致 | runtime-verification.json、temp-build.first.log |
| 5178 | PID46572，唯一目录 cwd，仅监听127.0.0.1；HTML/JS/CSS 3/3 与 dist 一致，未重启 | runtime-verification.json |
| 关键边界 | A 通过；B 上述失败事实首次留存 | boundary / additional / reduced-number / capture 源与结果 |
| T2 | TUNE；工作流裁字未解决，失败与数字问题交主流程 | t2-review.md、t2-input.json |

临时构建仅在证据目录。截图均来自本轮合成主库、隔离发现适配器；不使用真实系统数据。正常测试与额外探针分开记账。

权威包 `e8d567e385de236e5c0f99830c9f7bdcc160aa43c457af2787864a6c05e81415`；运行包 `16d625e49f17f2831c8cc0bb3bd80f8a0666e071ad3713615c06a7820815cf7f`。新修复会使本轮 T2 和相应截图失效，须在新运行包重测。

## 权限、未完成与唯一下一步

本轮只新增这份交接和 [独立证据目录](evidence-2026-09-30-codex-review-87/)，更新 CURRENT，生成测试输出；业务/正式测试/PRD/设计/dist/依赖指纹保持。真实 `data/CURRENT.json` **仅核哈希**，开工/结束均 `2457568d1728d885b7556c67af5fd8b77ae45c04283237c92d1b49446826bbf4`，没有重新收录或读取主库内容。项目协同协议沿用既有收录状态，不重复执行收录。

未读真实 Vault、凭据、私人会话，未改真实 Agent 配置，未装入真实项目，未提交推送或接外部系统，未重启服务，未开始 2.1、13.3、13.4 或云端接入。真人读屏/真实设备/真实使用验收、长时性能与完整四季动态观赏未执行，不由本轮技术结论代替。

**唯一下一步：Claude 实际读回 WB-20260930-90 与本交接，认领修复 R87-B1～B5（B4 两分支均须闭合），再交 Codex 复核。** 保留非阻断与历史项。云端接入新会话仍须先读 CURRENT 确认写入者无，并按用户逐项授权；本轮未代发消息或代签另一方已读。

# Codex｜R87返修独立复核与真实接力验证

输入 **WB-20261003-113** → Codex认领 **WB-20261003-114** → 输出 **WB-20261003-115**。日期2026-10-03，Asia/Shanghai。

**本棒复核完成，整体仍须返修：原R87五组固定场景通过，但动态启用减动画有重要缺口；清单第5项的真实派发接收、113读回一致及认领已验证，看板另有两项已复现问题。没有致命发现。T2仅对R87可见表面VISUAL_PASS，不抵消功能/交接失败，也不代替常浩验收。**

## 范围、基线与实际改动

- 唯一项目：`/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench`；认领前工作树干净，main/HEAD为`da3538dbd3d61fec80e9f3d9d92f066c1062ad65`，本轮未提交或推送。
- 实际按用户指定入口读取，读到113、语义上已释放，与输入一致；先登记114并回读后才写新证据。只填写Codex自己的已读状态，未替Claude签已读/已接手/已通过。
- 当前265个代码/测试/依赖文件固定前后指纹一致。WB96的5个返修源码与历史提交4a8f5f2全部匹配；其中Odometer/interaction.css/partner-lcd/transfer仍逐字节等于WB96，Home后续增加云端功能，按当前快照复核。原R87测试曾误入“需要”，6d93fd6的更正已核对，当前测试与WB96指纹一致。
- 既有文件只修改CURRENT.md；新增本交接、`evidence-2026-10-03-codex-review-r87/`和本轮测试输出。业务源码、正式测试、依赖、PRD、设计与dist未改。逐文件前/后SHA256见证据目录`change-manifest.json`；索引自身校验值单列`change-manifest.sha256`。
- 原CURRENT SHA256：`7b565844c79362f3cdd30a184b3d6439a6054da96bdb4588d147979e54524a72`；认领114 SHA256：`51ec4c1a46909cead19bfbe466f85ba62aa435a353595227c577c19bd105adc1`。最终值与交接/证据新增文件哈希均在上述清单。

## R87复核结果

| 事项 | 当前结论与运行证据 |
|---|---|
| B1成功字裁切 | 关闭。三种复制类型×8个viewport/DPR组合共24组，画布完整在按钮内、末尾K有实际字形像素、页面无横溢。含320/375/393/430/1024/1440及1×/2×。 |
| B2绘图异常收尾 | 原规定场景关闭。独立注入transform、首次绘图、已启动的异步绘图异常，两种动效模式共5组；覆盖/状态类/页面异常均0，成功复制各新增1条记录，恢复后可再演出。 |
| B3初始reduce叠数/轻弹 | 原固定场景通过；动态开启reduce仍失败，见R87-F1。 |
| B4a数据更新、B4b残影 | 两分支关闭。待处理变化后数字帧更新；媒体偏好变化重建引擎仍保留数字画面，与重切画面一致，橙色旧蛋像素0。 |
| B5真实C键 | 1440/430/401下44×44、Enter操作通过，原正式回归含axe。≤400已有规则隐藏整个机身舞台，是R87之前的原样规则，不作为缺C键；保留首次探针393超时及纠正依据。 |
| S1使用次数滚动 | 已由后续代码实现，详情与卡片均Odometer，usage-odometer独立首跑通过。 |
| S2文档 | “13.2尚未实现”已更新，但设计README仍说S1未做，建议同步。 |

**重要R87-F1：传送过程中开启减少动态效果，JS动效继续。**

位置`src/transfer.js:39、99–112、131–139`；依据PRD第376行“系统开启减少动态效果时全部关闭”。在正常传送启动后、reveal之前切reduce，浏览器matchMedia已为true，160ms间隔画布仍变化，采样到6个运行中的火花。根因是偏好仅开始时采样；CSS停止不了canvas计时器和WAAPI。原初始reduce修复有效，不能代替动态切换。返修标准：同一次演出响应偏好变化，停止打字/火花并保持清楚的静态成功反馈、正常收尾和业务计次；验证等待reveal及打字中两种时点。证据`runtime-reduce-observed.json`、`boundary-probe.first.log`及screens截图。

## 清单第5项：真实交接与看板问题

真实证据：用户把模板#1、项目路径、113编号和R87任务派到本会话；Codex读取同一CURRENT/交接113，编号一致，无需补充任务解释，登记114并回读；本棒保存交接115、更新CURRENT并回读释放。**真实接收与读回链路通过。**

未核验用户当时实际剪贴板与真实复制留痕、刷新后的真实看板；没有读取主库来补证，没有再复制/补记/重放真实记录。不存在限定单项目且无需会话凭据的看板HTTP接口；本轮只用现有本地导出函数读取本项目CURRENT，输出白名单状态。`handoff-readback.json`保存该结果。

1. **重要C5-F1，释放说明被误判成持笔。** `server/collab-board.mjs:47、93–97`只接受整字段精确等于“无”等。真实113写法“无；Claude 交接113后释放”被解析成held/Claude。并非Claude仍在写；本棒按照明确释放事实认领。最终CURRENT写入精确“无”，把释放说明放正文，局部规避当前项目；源码容错仍未修。返修须覆盖精确空闲、带释放注释、实际持笔、未知，避免泛化误判。
2. **重要C5-F2，口令与留痕编号可错配。** `src/Collab.jsx:245、306–307`只固定预览text/agent，确认时却取刷新后的item编号/阶段。隔离实测：刷新在途时生成编号14口令；刷新到15后确认，预览与剪贴板一致且指纹正确，但recordState=15、copiedState=14。返修须将text/agent/projectId/stateId/stage绑定同一快照，或使过期预览失效；验证刷新成功/失败、取消、补记及重复确认，不把旧口令计成新状态。

两项看板问题独立于本次真实接收成功，不能互相抵消。CURRENT所用读回解析为复核，只是现有规则的观测值；没有替用户选择下一流程阶段。

## 验证命令与首次原始结果

所有浏览器运行使用现有fixture、合成资料与隔离发现适配器；测试会话信息只在进程内使用，未输出凭据。

| 命令/检查 | 首次结果 | 证据（均在本轮证据目录） |
|---|---|---|
| `npm test` | 607/607，0fail/skip，exit0 | unit-npm-test.first.log |
| `PLAYWRIGHT_MODULE=playwright node tests/{r87-fix-browser,interaction-browser,partner-browser,usage-odometer-browser,collab-board-browser,accessibility}.mjs`（各独立运行） | 6/6首跑exit0 | browser-*.first.log、collab-collab-board-browser.first.log、validation-results.json |
| `node node_modules/vite/bin/vite.js build --outDir <证据目录>/temp-dist` | exit0；13/13等于当前dist | build-vite.first.log、runtime-verification.json |
| `PLAYWRIGHT_MODULE=playwright node tests/visual.mjs codex-review-r87-114` | exit0，138 PNG，problems=[] | visual-visual.first.log；test-results/visual/codex-review-r87-114/ |
| `node <证据目录>/boundary-probe.mjs` | exit1；B1/B2/B4通过，动态reduce与释放解析失败；B5首次393超时为探针适用范围错误 | boundary-results.first.json、boundary-probe.first.log |
| `node <证据目录>/b5-confirmation.mjs` | exit0；仅补B5，401/430/1440通过，≤400 N/A | b5-confirmation.log/json |
| `node <证据目录>/collab-snapshot-probe.attempt1.mjs` | exit1，探针误找textarea；实际是pre口令预览 | 原源文件与collab-snapshot-probe.first.log均保留 |
| 纠正定位器后`node <证据目录>/collab-snapshot-probe.mjs` | exit1，实测复制14/记录15的产品失败 | collab-snapshot-probe.attempt2.log、collab-snapshot-observed.attempt2.json |
| 双轴/T2 | 两轴独立只读审查完成；T2有限VISUAL_PASS | review-axes.md、t2-input.json、t2-review.md |

未重跑全部46个浏览器入口：本棒只复核R87与交接相关表面，选择6个相关入口及独立边界；交接113的全量结果不冒充本轮验证。历史Skill副本/usage偶发未定位，不因本轮通过关闭。初始化DOM/定时器失败后的锁释放与分数DPR像素边界为有代码证据的维护建议，不冒充运行复现。

## 运行状态、权限与唯一下一步

5178现场监听PID73079，仅127.0.0.1；本轮只读HTTP根/JS/CSS3/3与dist一致、临时重建13/13一致。运行包SHA256 `e4cdca1bb8ac980a279142c98cdd688530040e2f9ac0b1beb69bef7871f3f918`。未重启服务，未改dist或真实Agent配置；此结论不代表全部后端/全部业务使用路径验收。

未读取或输出真实主库内容、Vault正文、凭据、Token、私人会话；未写真实留痕、提交、推送、安装第三方组件、使用付费服务或发送跨客户端消息。本轮未访问生产data目录，因而不声称核实其哈希或用户并行使用期间内容不变。真人读屏/真实设备/业务验收未执行。

**唯一下一步：用户将R87-F1、C5-F1、C5-F2三项重要返修派给Claude；Claude实际读回WB-20261003-115与本交接后认领，修复并同步README，再交Codex复核。** 保留维护建议与历史偶发，不扩展新功能。CURRENT释放为精确“无”；未代签Claude已读或已接手。

非技术使用：无需安装。下一棒读取项目根CURRENT.md及本文件，确认115与“无”，先登记认领并回读再改。用户可在现有看板刷新查看释放状态；无需重新派发或补记本次真实记录。

# Codex｜收藏335工程结果与终核补充 · WB-20261010-339

输入状态 / 输出状态：WB-20261010-335 → Codex认领336 → 工程初交337 → 终核文档补充认领338 → 本交接339。执行者：Codex。335替代已作废333；输入时state/writer/唯一下一步与启动Prompt一致。交接与CURRENT回读后释放写入者。**唯一下一步：Claude逐区验收。** 本文不代签Claude或常浩验收。

## 终核补充：替代337的最终保护结论

337生成时检查180个data文件一致；释放步骤的末次核对发现 **data/capability-use.json** 使用日志发生变化，故未形成337最终状态manifest，已重新认领338，仅补本交接与CURRENT。没有回滚日志，也没有修改已验证的业务代码/构建。当前检查 **179/180 data文件一致，收藏22/22文件与主库指针一致**；唯一漂移为动态使用日志，前SHA `cef53d3a857f875d08d2a66e2af63ce66e14d20dff59d125e30772b14ba17750`，本次观测SHA `e41370bc5fd2a5da4df4ff88c92f61b9d3c7e078283d8114eba45c8a3f381ca0`。它继续变化是允许保留的当前事实，不把观测SHA当永久锁定值。

仅读取schema/item数量及末尾时间/能力/结果元信息：最近记录为calendar，03:13:50Z起按分钟追加。server/http.mjs现有used函数调用capabilityUsage.record，capability-usage.mjs明示只存本地使用元信息。该证据支持“服务使用留痕”判断；触发客户端未独立核验，真实只读页面回读也可能触发现有GET留痕，不断言是某个客户端造成。未读日历内容、会话、Vault或凭据，未直接写此文件。保护证据以 **protected-final-339.json** 为最终当前结论；protected-final.json与337保留为先前检查快照。

以下继承完整335实现、同构建验证与逐区差异；最后空白行清理重建20文件逐项同哈希。唯一下一步仍为 **Claude逐区验收**，常浩随后一次性终验。日志漂移没有改变布局、流程或验收断言，无新增业务实现。

## 结果与使用

Z1–Z12与D1已实施，5178静态已采用同一冻结构建，未重启服务。刷新 http://127.0.0.1:5178/#learning 即见点阵画布、上沿吸顶控制轨与像素键帽；页头“插件”，轨道右侧Agent/危险本地删除。无需安装新依赖。若仍见旧“收藏画布”标题，先强制刷新；不要自行重启服务或重放删除/配对。

最终全量 **1196/1196**（`npm test -- --test-concurrency=1`，全部原1196用例，断言不变）；七项收藏浏览器专项逐个独立通过；design-tokens **4/4**；全站 **138图、problems=[]**；六宽逐元素溢出、44px、axe与运行中减少动效双向切换通过。最终HTML SHA256 `3e83e89120454cbede511959441e53cde4e96617066947a0aeab3ef441045ac8`；JS `dist/assets/index-CMUEKfEd.js` SHA256 `d370eb7625dd42efaa2216918fc154db7e1029976c62d3c0808944f46d6f2914`；CSS `dist/assets/index-CPVjK8QH.css` SHA256 `e3cc2692a5b3324a4d52100d342d4a2516a34c2e8e14e230fcbcf329e0918350`。

证据目录：[evidence-337](evidence-2026-10-10-codex-collection-337/)。用户可直接看当前聊天outputs中的“收藏335视觉验收/对照.html”，可切换22组改前/改后，调整4组批准稿叠图透明度。改前取认领前dist副本，不从改后源码反推。

## Z1–Z12结果与逐区差异

| 区 | 实施与验证 | 相对批准稿的差异及理由 |
|---|---|---|
| Z1 | DeskView使用PageHeading现有help/action参数，learning导语精确更新；只保留一枚青蓝主按钮“插件”；帮助说明收录/本地删除/只读MCP三件事 | 帮助键由稿约26px扩为44px；页头后画布约下移10px（1440）/13px（390）。这是44px可用性约束，叠图保留直接差异，不人为对齐消除 |
| Z2 | 同容器上沿sticky、top56；左全部/现有分组/虚线＋分组，右300px搜索与Agent/本地删除。签/胶囊双向同步；有限两帧后滚入组，scroll-margin避开轨道；新建动作原样复用 | 稿中约32–40px的小胶囊/键统一至少44px；搜索计数只在有词时显示，现有分组由筛选后画布labels提供，始终与画布一致 |
| Z3 | bg-2底、青色20px点阵与微光；390为16px；desk高度auto、min620、overflow visible。六宽长组/连续空组/网格底边均在canvas内；边缘拖拽scrollY增加、desk.scrollTop=0 | 新增containerH对maxLabelY+140的内容下限，修复连续空组最后一签越底。仅容器高度测量，sr/buildOrganized、组和卡坐标/分栏不变；原scrollFrame已滚window，本轮不改事件逻辑 |
| Z4 | 4px令牌圆角、3px键程、前置6px青色像素点；旧荧光色条移除，计数mono；展开同高铅笔与签相接，长名省略且访问名完整 | 分组签52px含两行文本，计数与相纸卡不缩小；遵守既有坐标保护。长名最大136px并保留完整aria-label |
| Z5 | 相纸仍156×212、封面118、分类18、标题两行38；极细高光/投影；悬停上浮4px、立即停止呼吸，不缩放或回正 | 合成截图使用现有上游参考图片，不使用真实收藏内容；卡片角度由不同fixture ID决定，内容/角度差异不能算布局算法漂移 |
| Z6 | 首批ID池在notes/workspace就绪冻结；360ms上落12px＋40ms错开（最多200ms，总≤560），600ms清理后呼吸；展开既有位置动画调为240ms、30ms错开（最多150）。保存后新ID仅success光圈600ms，partial/失败稳定提示；键按下3px。初始/运行reduce及恢复均不重播 | 不另建发牌算法，沿用上游x/y/rotation/stack/grid及暗淡分组scale0.75；去掉旧进页与阅读器文字缩放。首屏快速导入不会重播进页或遗留arriving。计时清理独立于loading变化 |
| Z7 | EXTENSION眉题、真实文件夹状态/版本、三步、可复制单行路径、生成/复制配对码、危险撤销；原操作/API保留；六宽焦点陷阱/Esc/44px/axe通过 | setup没有paired或lastCollectedAt；不显示已配对/上次收录时间。稿的绿色配对条改为青色“文件夹就绪”；三步序号统一描边，不使用稿的done填色伪装安装或配对完成。缺口仅开放项19 |
| Z8 | READ ONLY、一句只读说明、两个工具标签；characterOf+AgentSprite读取Claude机械暴龙兽、Codex机械邪龙兽；复制一次显示✓已复制 | 重用原生像素素材而非拷贝稿上的静态截图；头像仍56px。文字只表示复制，无“已连接”，没有写真实客户端配置 |
| Z9 | 桌面55/45看片台/信息栏；手机上下排布；页码、弹窗内横向缩略图、分类/原帖/危险删除/关闭、真实作者日期计数；15px正文≤44em；仅有内容的radio分段，箭头/HomeEnd/Tab可用；OCR-only默认选OCR | 静态稿640×360是缩小组件示意，本实现保留真实阅读器max1080/86vh；缩略图由稿28×36改44×56，手机允许条内横滑。未改图片fallback、视频播放/时间戳跳播与删除确认逻辑。疑点结论见下 |
| Z10 | 两张错位虚线相纸；搜索无结果含关键词/清除，零收藏有准确提示/配置插件。1440/390成对证据，六宽axe0 | 使用canvas最小高与内容流，而非静态组件板的固定640×340；零收藏CTA为44px次按钮，页头插件维持唯一主色 |
| Z11 | 导入遮罩/失败、partial稳定notice、本地删除反馈、分组失败与草稿恢复迁本页类/令牌；危险红仅真实失败 | 本地删除324/326全部断言保留：成功与missing/incomplete无结果行，仅真实失败/未知；导入只加UI warning，不改请求、重试、操作查询或store流程 |
| Z12 | 320/375/390/430两行轨道：搜索＋两个44px图标键 / 横滑胶囊；title与访问名保留。320/375/390/430/1024/1440逐元素检查、卡片/组签底边、弹窗与焦点均通过 | 显式横滑胶囊/缩略图的未显示子项不视为页面溢出；仍检查滚动区边框在viewport/dialog内，点击第1/6/11项后每一项进入弹窗边界，未靠页面overflow hidden遮盖 |

## 内联呈现迁移与保留

- PageHeading action、工具轨/搜索/所有键帽、胶囊/新建分组、分组签/rename/chevron、drop-zone目标反馈、相纸图片/分类/标题/选中标、SetupDialog/三步/配对区/Agent行、ExpandedCard媒体/缩略图/顶栏/正文分段/分页、零收藏/搜索空态、导入/删除/草稿/错误反馈均迁入 `.collection-module` 下语义类。
- collection.css相应上游浅色 `!important` 覆盖移除；保留的important仅系统减少动效媒体规则。中性白纸和黑影沿用design-tokens允许的#fff/#000；新增9个collection阴影名字只登记在ui-v14.css令牌补全块，不覆盖受保护令牌。
- 保留内联：画布动态minHeight、卡片/组签/drop-zone几何left/top/width/height/zIndex、CSS入场delay变量、native拖拽clone定位与当前计算样式。不是宣称全部style属性归零。setElementDragImage仅复制迁移后的渲染外观并补page作用域class，DataTransfer、拖拽/Alt/边缘滚动逻辑不变。
- 导入handler只加warning清除与实际partial字段提示；图片/视频导入、配对、MCP请求与本地删除状态处理没有变。容器高度下限修正不改变任何卡片/组坐标。

## Z9：两个疑点的先复现与结论

基线与最终各22张同输入图；阅读器使用viewport截图（1440×900、390×844），canvas态使用scrollY=0后fullPage。初版拍摄及修正拍摄均保留；拍摄手段修正不算产品修复。

1. **缩略图条在弹窗外：** 基线1440/390各有2个缩略图DOM rect超出dialog，但旧纵向缩略图祖先已有overflowY:auto、dialog overflow:hidden；越界节点属于未滚到的内容，不能据此宣布可见条越界。新版按335改为底部横条；1440全部11张在条内，390有5项需要横滑，条本身始终位于dialog内。专项滚到并点击第1、11、6张，逐项严格确认bounds在dialog内。证据：before-reviewed/reader-reproduction.json、after/reader-reproduction.json、collection-redesign-browser-frozen/geometry.json及reader六宽截图。
2. **跳到主要内容出现在390弹窗上方：** 基线和最终实际viewport均skip未聚焦、top=-60、不可见，焦点在dialog内。滚过页面后直接fullPage screenshot会把fixed/负top元素合成进长图，因此初版长图出现橙色skip；正常viewport并未复现该焦点缺陷。最终reader只拍viewport，其他态先scrollY归零，再拍fullPage。未改全局skip-link。专项仍要求skip不聚焦且bottom<0，Esc还原卡片焦点。

## 验证、首败及断言调整

所有应用专项/全量/visual由已审查隔离runner预加载：
`NODE_OPTIONS=--import=$PWD/docs/agents/handoffs/evidence-2026-10-06-codex-221/isolation-runner/register.mjs`。
合成临时data、随机端口、网络/原生/扫描/真实配置适配器隔离；实际5178仅单独GET静态与只读页面回读。真实回读拦截初始化的8个跨页面POST（collab/protocol、rule-templates/installs、project-status/inspect、calendar/todos各两宽一次），全部网络发送前阻止，实际变更请求0；不把它们说成已运行成功。

| 命令 | 冻结构建结果 | 证据 |
|---|---|---|
| npm run build | 通过；仅既有bundle>500k提示。最后空白行清理重建20文件hash全部相同 | build-final.log、build-whitespace-check.log、final-build-sha256.json |
| npm test -- --test-concurrency=1 | 1196/1196，0跳过/0失败 | npm-test-frozen.log |
| node tests/collection-browser.mjs | 通过：六宽相纸/堆叠/展开/OCR搜索/阅读器/分组草稿冲突/配对/SPA | collection-browser-frozen.log |
| node tests/collection-drag-browser.mjs | 通过：外部拖入/内部分组/Alt批选/排序/复制原有能力 | collection-drag-browser-frozen.log |
| node tests/collection-motion-browser.mjs | 通过：呼吸/悬停不缩放/减少动效与转写分页 | collection-motion-browser-frozen.log |
| node tests/collection-recycle-browser.mjs | 通过：单击/幂等/断响应不重放/草稿/部分失败/Finder错误/missing/六宽 | collection-recycle-browser-frozen.log |
| node tests/collection-video-browser.mjs | 通过：视频播放/文稿/时间戳跳播 | collection-video-browser-frozen.log |
| node tests/collection-extension-browser.mjs | 通过：配对/收录/SPA/现有插件链 | collection-extension-browser-frozen.log |
| node tests/collection-redesign-browser.mjs | 通过：六宽46组几何、44px/axe/焦点/Esc、全部缩略图访问、首批+延迟workspace+首屏导入+不重播+成功/partial/失败+hover暂停+运行reduce双向切换 | collection-redesign-browser-frozen.log、同名目录44张图/geometry.json |
| node --test tests/design-tokens.test.mjs | 4/4 | tokens-frozen.log |
| node tests/visual.mjs collection-335-frozen | 138图，problems=[] | visual-frozen.log、test-results/visual/collection-335-frozen/ |
| node work/collection-335/runtime-readback.mjs | 10个index/assets资源与dist逐字节一致；真实1440/390无横向溢出，desk visible、rail sticky、3张实际收藏；0变更请求 | runtime-byte-readback.json、runtime-ui-readback.json、runtime-readback.log |
| node work/collection-335/gallery-check.mjs | 22组对照图路径/实际解码通过，无页面错误 | gallery-selfcheck.json |

首败保留：迁移首次build语法错误（移除style时误吞JSX闭合符）已修；旧collection-browser要求底部新建按钮位置、旧digital-world要求重复“收藏画布”、旧recycle查collection-create-group均按批准位置/标题更换；新版长空组触发底边缺口已补containerH；键按下在100ms采样为2.95039导致新增专项首败，现改有限5秒收敛后仍严格要求3，不扩大容差。两轴审查实际复现首批动画池/ready时序/计时取消、OCR-only默认、hover渐停，逐项补精确断言并修复。

全量首次1195/1196只失败旧标题；标题断言更新后1196/1196。冻结构建默认并发又各1次失败controlled-execution的stop/unknown-process等待，源文件未改，helper50×2ms；相应用例单独通过，最终全部原用例串行1196/1196。保留npm-test-first、npm-test-final、npm-test-load-first、npm-test-default-second和controlled-timing-recheck日志；并发负载是候选解释，未断言唯一根因。仅追加开放项20，无该模块功能或断言改动。

**调整的原断言逐条：**

1. tests/digital-world-ui.test.mjs：`/收藏画布/` → 唯一h1收藏＋“收藏分组”控制轨＋“搜索收藏”；同时拒绝h2收藏画布。原旧书架/书籍入口排除断言仍在。
2. tests/collection-browser.mjs：新建分组旧relative底部按钮 → 必须在collection-toolbar且不在collection-canvas；其余角度、尺寸、无缩放、流程断言原样。
3. tests/collection-recycle-browser.mjs：旧collection-create-group选择器 → 同访问名“新建分组”；新增busy时确实disabled及toolbar归属，仍强制dispatch点击并要求未产生分组名称输入。断响应/幂等/unknown/partial/missing/incomplete全部保持。
4. 新增redesign专项的发展修正只调整正确交互角色、稳定的收敛等待和可访问滚动区判据，并增加radio键盘/OCR-only/延迟workspace/首屏快速收录后退出arriving/立即暂停呼吸的精确断言；无旧业务规则删除、skip或放宽。

## D1、审查与边界

01/02有工程证据的条目已勾并引用320/324/331；真实Chrome安装/本次真实收录保留未勾。03只保留MCP真实接入、真实原生ASR、完整复刻真人终验三个[ ]。SPEC下一步指向根CURRENT；issue-tracker的UI-ROLLBACK标历史；CURRENT正文补319–329链接320/322/324/326/328/331。

code-review两轴独立只读：Standards原1项（radio语义）修后0；Spec首批时序/OCR-only/hover原3项及同链路timer问题修后0。最终各轴结论见review-two-axis.md，未把工程审查称为Claude验收。内部T2视觉复核见visual-review-t2.md，仅当前静态视觉VISUAL_PASS；Claude仍需按12区与叠图验收动效质感及实现偏差。

data **179/180**（动态使用日志漂移见本文终核补充；主库与收藏未变）、server（含native）**146/146**、browser-extension **8/8**、其余src **206/206** hash未变且无新增真实data文件。buildOrganized、sr函数逐字相同；Alt/拖拽/边缘滚动、本地删除关键事件区段逐字相同。保护证据protected-functions.json、protected-final-339.json；protected-final.json是先前快照。主库指针SHA `9478ee2539d5208e7b7b343867abaa8812172f6d171f0c72fb1c7a6f0bbc6f4f`。未读私人会话/Vault，未重新启用Obsidian，未写真实Agent配置，无提交/推送/安装依赖/服务重启。

认领前已有CURRENT/open-issues与未跟踪333/335派单、fixture目录/work；保留。下面“前SHA”业务/旧测试取认领前893文件manifest，D1文档取27160d2；open-issues在认领前已有17/18，checkpoint SHA不等于认领前内容，新增仅表尾19–21。CURRENT最终SHA及本交接SHA在final-state-339-sha256.json（完成释放后生成），避免循环自哈希。

| 改动文件 | 前SHA256 | 后SHA256 |
|---|---|---|
| `src/Collection.jsx` | `30eb236b99b1465ee32ae7b879124066121f22f0312e36dc0eb1f3440da26eee` | `3c05cff4347033cd301cc91df4edd034c0b20950f10c65c27e6ac5c7213ee7ee` |
| `src/pages.js` | `ea941f1c573c8e5c1fd9196dd8016c73879ee145e485bf0d6a090975cd8f07ca` | `84b23d24217ff0da95f2252ac2c4c35967d7aa7aafc4137c0b8ba42e8d4f72de` |
| `src/ui-v14.css` | `a2788ff60dc655cf693e59d38becc666874e7caea4a9878e6ea9879849ecac54` | `26bc83ac1925a6be436fe7dee3708b17551814e2ec671395ba8c2db1e6346f84` |
| `src/collection.css` | `f0d0c250c63340298cfea9767cec07e0968bc754601f21805fb0c07420d76b3c` | `ce2f67685e89ba9758ecdc9b80c4984988d0899288b7bbfa58f7df63484816d0` |
| `src/collection/app/components/DeskView.tsx` | `9f98ab16b417ecdf8b9ea85b384f9183ac5e9c9dfca54514e4dc43ced86eed01` | `452dbd1830a91b52c6ec2a76318838f7f9bd178fa4aa70e370e6c93a9a237b1e` |
| `tests/collection-browser.mjs` | `d83f576f32b1e6699b88ca16b416356506e679124563d155c4826098a0b0cbf9` | `189b88acf3fd6261730000dfa75f7d830318ffa3faca5ba53aa20d2a7de22bac` |
| `tests/collection-recycle-browser.mjs` | `f5daf1e68a1e8492fe6ea3d6a773a1b48c6c01cdcf4205384ec924fd8b46bac1` | `b5b1c7aa759db8d3c42ccd831372c8764796f858bd7fe7b61befa226cea698ea` |
| `tests/digital-world-ui.test.mjs` | `2068ccd110af82a06fe910da0c3ccc52fa0d6ae5ebcc0320c3c80cb927696598` | `ffc3eb509bb3a3f28b9f5c72dc72e2f656e1240c412eaf5a7fa1dbf04e4f6ca5` |
| `tests/collection-redesign-browser.mjs` | `新增` | `89d5bb46c055c1b9d99380eaf1ab5cfa15202400d899b4345e329476501d005a` |
| `docs/agents/collection-replica/01.md` | `a5576d354bec07154903d66d299b4c4bd9c7c66d92c024ab9d3a7bcc5f72d328` | `4ed0149430400b6b262110e836c86f95cd9bd9253cfb4e89927d46c6e7005b1f` |
| `docs/agents/collection-replica/02.md` | `7145e8965e0f8ffda4c3af3370b11fac2cda6fe55008a5a515cd10f490c6250b` | `2a7c31ba8dd747be68910239249e18498ed5715c7cb40cc156449035247d2b07` |
| `docs/agents/collection-replica/03.md` | `9a10dfff8b0f942c3d366c7c3df140e892e69122fea9de20b95d2c072b79e676` | `e581421a7b07d2ff619303a37bd21158a62917e05e37a960d47e4585cd02c4d0` |
| `docs/agents/collection-replica/SPEC.md` | `46eafec918b29b8c4951f0e6203626025365580029abd5a331457da36d035f27` | `e1d2b85c8709b6ed0725ba5a03ccef5ccc8af6fcfe345dc9c04d276bec1649b7` |
| `docs/agents/issue-tracker.md` | `5450550d311fb66f5a6727373056efa13851bcfff461a243b4c72b931841ae86` | `7a3f3fc4437a1ea3a445d43e3f02bacc2bd6f305272a4c1486761f4823c9af62` |
| `docs/agents/handoffs/v16-open-issues.md` | `10a4b16ed3d52f07b7f19796e493162789200ed991c198d49134148ea34f5178` | `4a28e263cc72fdbe3cca9d2a70ffab3e7f9ec5cbb3081ec1c9142bef55c547f6` |

开放项仅追加：19 setup真实状态缺口；20默认并发测试短等待；21旧dist/theme的crests.png在5178为404、当前收藏未引用、使用影响未知。首次盘点误将全部20个dist文件视为活跃引用；最终对实际入口/编译assets10个文件逐字节核验，未修改server或删遗留主题。尚未完成：Claude逐区验收、常浩一次性真人验收、真实MCP/原生ASR/Chrome使用；不宣称完整复刻封板。

## 唯一下一步与权限

**Claude读取根CURRENT与本交接，核对state339、写入者无、最新dist与保护hash，再按Z1–Z12对比/叠图给出通过或返修清单。** 保持27160d2后变化未提交，不实施open-issues，不改真实数据/Agent/Obsidian/server/native，不重启。Claude验收后常浩在5178一次性验收收藏。已写共享状态，未向其他客户端发送消息，尚无Claude读回回执。

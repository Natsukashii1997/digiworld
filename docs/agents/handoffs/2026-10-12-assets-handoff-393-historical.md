# 资产仓库优化会话交接

核验日期：2026-10-12（Asia/Shanghai）。
项目根目录：/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench
使用地址：http://127.0.0.1:5178/#assets

本次用户要求“只做交接，除交接文档外不改任何文件”。因此只新增本文件，未修复下列问题，未改 CURRENT、源码、测试、dist 或跟踪表。原来不存在 HANDOFF.md。以下相对路径均从上述项目根目录起算。

## 1. 目标：要做什么，怎样算完成

继续数码世界工作台的资产仓库优化，完成当前 WB-20261012-393 的收尾。累计用户需求：

1. 同类资产编号只计未删除内容，按创建顺序连续编号；全部删除后新建从01开始；筛选、置顶、排序不改编号。
2. 新建表单删去“选择类型，写下名称与内容。以后每次修改都会留下一个新版本。”；Prompt排在Skill前，全部类型下新建默认Prompt；标签支持逗号与空白分隔；删除来源输入框，保留旧来源和版本语义。
3. 全部六类资产（Prompt、Skill、工作流、规则、MCP、焚决）在卡片外有复制、删除、置顶三个操作；复制在删除左侧。桌面默认隐藏，移入卡片或键盘聚焦显示，触屏保留入口。按钮32px、图标14px。
4. 置顶按钮悬停/聚焦显示颜色，采用现有橙色，已置顶也保持橙色。
5. 卡片加高并拉开类型、标题、正文、标签间距。当前实现最小高度352px、卡片间距24px、类型至标题和标题至正文各12px。
6. 直接删除列表视图，固定网格卡片，取消所有视图切换按钮。

完成标准：帮助文案及旧测试适配完成；解释并处理最新全量失败；必要回归通过；最终构建、六宽视觉证据、5178静态回读和真实页面采用一致；按项目协议交回并更新CURRENT。Claude质量验收与常浩使用验收单列，不能以工程测试代签。此前386/384独立待验保留，本任务不继续调酒功能。

## 2. 关键决策与约束：用户方案、偏好和禁止事项

- 沿用现有数码世界结构、素材、色板和令牌，只做指定局部修改，不重选方向，不安装依赖或生图。
- 最新删除列表决定覆盖旧交接的两布局要求；网格切换按钮也删除，因为没有第二种视图。原layout仅React useState，无持久化布局偏好，不需要存储迁移。
- 三个卡片操作32px是用户对原44px标准的明确例外，其他入口尺寸不随之缩小。
- 复制机制保留：Prompt/规则为当前全文；工作流含固定引用；Skill是完整包安装口令（10分钟本地交付）；MCP是公开JSON定义，不代选目标或写原生配置；焚决复制全部未删除正文，原顺序以空行分隔，成功后逐条计次。失败/未知结果、同ID查询恢复、引用与版本门禁不得简化掉。
- 真实工作台仅只读查看、刷新、聚焦；测试用合成资料及隔离适配器，不测试性复制或增删真实资产，不写真实Agent/Vault，不读凭据。
- 保留dirty及未跟踪文件，不reset/stash/clean/批量覆盖，不安装、提交、推送、发布或重启后端。前端构建dist即可由现有服务供应。
- CURRENT是唯一动态状态。本次实读仍为WB-20261012-393、写入者Codex、最新正式交接390。因用户只准改交接文档，未释放认领、未登记394；本文件只是中断恢复说明，不是新的动态状态源。新会话先核对并发，用户确认后再登记接续，不能假定无人写入。
- 用户要求新会话先读交接、复述目标和第一步、等确认后再动手。暂无新的产品方案待选。

权威及既有材料，按路径读，不复制全文：
- AGENTS.md → CURRENT.md头表和“认领391/392/393”段 → COLLABORATION.md，尤其§3/4/6。
- docs/agents/handoffs/2026-10-12-codex-assets-hover-actions-390.md：三操作、复制语义、权限与旧验证；work/assets389/report.html：完整证据。
- docs/agents/handoffs/2026-10-12-codex-assets-warehouse-386.md：编号与表单；work/assets385/report.html。交接388为被390部分覆盖的历史。
- docs/agents/assets-warehouse/：既有规格与验证。
- 继续既有Matt/视觉工作流时读 /Users/nat/.codex/contracts/matt-project-execution.md，再按合同加载实施/审查技能。沿用既有视觉权威，内部审查不等于Claude验收。

已实读的Git/运行环境：
- Git根与项目根相同；HEAD=e6e5d8b74474ea408ebb171ab70415e32d57ada4，未产生本轮完成提交。
- 核对时19个已跟踪修改文件，git diff --stat为467 insertions / 273 deletions，另有多项未跟踪。本文件新增后另有?? HANDOFF.md。
- 既有dirty包含server/collection.mjs、server/http.mjs、src/AssetUsage.jsx、src/collection.css、src/collection/app/、src/scrolls.js、收藏/资产相关测试、CURRENT及issue-tracker等。它们含前序任务成果，不能全部归为391之后改动或回滚。
- src/assets-quick-copy.css及tests/assets-actions-browser.mjs、assets-copy-browser.mjs、assets-warehouse-browser.mjs等未跟踪，git diff不显示内容，必须读实际文件。
- 391基线：work/assets391/baseline.json（输入390、1118指纹）及before/；删除列表前392前像：work/assets391/before-grid-only/。不要只用HEAD比较本轮。
- Node=/usr/local/bin/node，v24.15.0。只读进程核查仅见工作台server/index.mjs，PID97328；先前单元、16套浏览器、截图进程均已退出。下一会话重新核对，不复用旧exec session ID。

## 3. 已完成：每项标明验证状态

- ✅已验证（当前源码差异与既有交接386）：编号排除archived；Prompt在Skill前；新建说明及来源输入已删；逗号/空白标签分隔、未修改旧标签和来源保留。早期完整验证见交接386，本次只做交接没有重跑。
- ✅已验证（当前源码、交接390及最新16套浏览器结果）：六类外层三个32px/14px操作，复制邻接删除；隐藏/悬停/聚焦/触屏和复制/恢复机制已实现。主入口src/Assets.jsx、共享Hook src/AssetUsage.jsx；早期证据见work/assets389/report.html。
- ✅已验证（当前CSS与固定网格度量）：src/assets-quick-copy.css:39的Pin hover优先级修正；六宽320/375/390/393/430/1440的42条卡片观察均高352px，类型至标题12px、标题至正文12px，Pin图标及边框为rgb(255, 179, 92)。另两条键盘聚焦和已置顶移出状态同为橙色。13张图与44条度量见work/assets391/final-grid/screens/，results.json的errors=[]。
- ✅已验证（源码、build和专项）：src/Assets.jsx删除Grid2X2/List、layout状态、视图切换及list-layout分支；src/styles.css删除旧列表/切换专用CSS，根令牌未改。三个资产专项改为固定网格及入口不存在，业务恢复断言保留。帮助文案仍有残留。
- ✅已验证（最新结果文件、原始日志、退出码）：work/assets391/grid-regression/results.json的16入口exit全为0，含表单、删除、置顶、焚决、MCP、151资产、历史、362动效、基础浏览器、使用记录、工作流、里程表、Skill副本、进化、三操作、复制。原始日志在同目录。执行命令python3 work/assets391/run-grid-regression.py；runner硬编码检查CURRENT=393，状态改变后不能直接照搬。
- ✅已验证（构建日志及实际dist/index.html）：npm run build成功，日志work/assets391/build-grid-final.log；当前dist资源为assets/index-FPu4iQ2_.js、assets/index-DVOMdzKt.css。继承>500kB chunk提示，未重启后端。已有实际页面截图work/assets391/live-grid-only.png；截图不代替最终HTTP字节校验。
- ✅已验证（本次文件哈希）：review3/manifest.json SHA256=b5d893a2c1a5c91ed4876c5b08b0ce200cac521076b0f2a2b2b3054eae285c52，9/9冻结成员匹配，其中7个当前源码/测试文件匹配冻结副本。路径work/assets391/review3/。这不是问题全部关闭后的最终通过快照。
- ⚠️未验证/未通过：最新全量单元退出1，1206项中1204通过、2失败，见work/assets391/unit-grid-final.log。旧unit.log的1206/1206属于删列表之前，不能替代。
- ⚠️未验证：固定网格后最终17文件清单、5公开HTTP逐字节回读、保护指纹、最终两轴/T2、正式交回和Claude/用户验收未收尾。work/assets391/build-final-manifest.json、authority-manifest.json、http-readback.json、protected-readback.json、review-final.md、live-final-readback.json仍属392；其JS=index-BRYCaNK-.js、CSS=index-DJO4C8rv.css，与当前dist不同。work/assets391/report.html、t2-visual-record.md尚不存在。

## 4. 卡点：现象、报错原文、已排查与待决定事项

1. 删列表后SSR单元仍要求网格切换按钮。tests/digital-world-ui.test.mjs:70；失败用例从55行开始。日志work/assets391/unit-grid-final.log:1239–1245：
   ~~~text
   test at tests/digital-world-ui.test.mjs:55:1
   ✖ 资产卡片、编号、版本与迭代阶段都由真实资产数据派生
   AssertionError [ERR_ASSERTION]: The input did not match the regular expression /aria-label="网格视图" aria-pressed="true"/. Input:
   ~~~
   已读代码确认该按钮按用户要求删除。应改断言为固定网格/无切换，保留资产数量、编号、阶段、删除、筛选、空态等断言；不能为测试恢复入口。

2. 最新全量另有受控执行失败，原因待确认。tests/controlled-execution.test.mjs:229；240行untilCalls调用；辅助函数89–94行最多50次、每次2ms。日志unit-grid-final.log:1224–1237：
   ~~~text
   test at tests/controlled-execution.test.mjs:229:1
   ✖ timeout remains probeable and stoppable by original ID until exit is confirmed
   AssertionError [ERR_ASSERTION]: executor did not receive 1 call(s)
   ~~~
   已读用例的scheduleDeadline为10ms；该测试和受控执行实现不在本轮资产改动范围。未单独复现/诊断，不能宣称“只是偶发”“与本票无关”，不能只放宽超时或跳过断言。保留首败。

3. 两份旧合成浏览器入口未适配，未包含在最新16套中：
   - tests/ui-final-254-browser.mjs:49–58等待“视图模式”，量两个切换按钮。
   - tests/ui-user-258-browser.mjs:85–86点击“列表视图”，断言list-layout=1。
   本次只读确认，未执行它们，实际运行报错待确认。只改资产片段，其他页面、搜索、排序、帮助和几何断言保留。

4. src/Assets.jsx:521帮助仍写“可切换排序及网格、列表视图”，应改为“可调整排序”。work/assets391/contract.md前半仍称“唯一生产文件CSS”“列表保持”“两布局”，后半才追加393，需重写为最终固定网格口径。此前补丁误找不存在的li行而失败，实际p行与contract均未改。

5. 最终证据与状态未交回。旧review-final.md仅记录review2的0发现，不覆盖review3帮助/旧测试问题。CURRENT仍393/Codex，issue-tracker未登记本次最终结果。用户现在禁止改其他文件，全部留给确认后续接。

需要常浩决定的问题：暂无新的产品选择；仅需新会话回述后确认继续。技术失败由助手排查，只有权限或范围确需改变再提出具体决定。

## 5. 踩过的坑：试过但行不通的方案及原因

- Pin候选1低优先级.page-assets .pin-button:hover只让边框橙色，图标仍被src/ui-v14.css:709通用未选中aria-pressed hover覆盖。现本页button.pin-button[aria-pressed]:hover优先级胜出，无!important。首败在work/assets391/candidate1/、inspect-pin.log、inspect-pin-matched.log；最早两轴漏报后的通过已撤回。
- usage-browser全页文本定位撞到卡片与详情同文案，原文：
  ~~~text
  locator.waitFor: Error: strict mode violation: getByText(/记录结果未知/) resolved to 2 elements:
  ~~~
  日志work/assets391/regression/usage-browser.log。tests/usage-browser.mjs已把六处提示限定对应资产详情，未删恢复断言或放宽超时；usage-final.log和最新grid-regression/usage-browser.log通过。
- 新固定网格断言对旧392 dist运行，首败AssertionError [ERR_ASSERTION]: 资产仓库只保留网格，实际视图组1。见red-grid.log，是有效红；构建393后专项绿。不能混用新源码/旧构建。
- 392两布局截图、清单已过时；不得拿旧T2验新构建，不在浏览器夹具读取dist期间改写dist。构建和共享写入串行。
- localhost隔离服务普通沙箱可能EPERM，需要按当前审批机制运行获准的合成测试，不安装绕过工具。正式首页回读用/，此前/index.html曾404。
- CSS颜色过渡瞬间可能读到中间色；最终fixture用reducedMotion与稳定态。CUA locator没有hover方法，悬停已用隔离Playwright观察；真实页用键盘聚焦，不点击真实复制/置顶/删除。
- 补丁按臆测li文本失败后，其后的contract重写没有执行，不能假定已落盘。下一次先读真实p行。
- data/capability-use.json是动态使用日志，旧保护核对发现变化时保留，不读私密正文或回滚。393最终保护未做，不能据392报告宣称当前主库/全部保护指纹一致。

## 6. 下一步：按优先级排列，第一步可直接执行

1. **只读接手，回述并等待确认。** 先执行：
   ~~~sh
   cd "/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench"
   cat HANDOFF.md
   cat AGENTS.md
   sed -n '1,35p' CURRENT.md
   cat COLLABORATION.md
   git status --short
   git diff --stat
   git diff -- src/Assets.jsx src/styles.css tests/usage-browser.mjs
   ~~~
   再读未跟踪CSS和三个资产专项、上列失败日志；核对实时state/writer、进程、文件漂移。复述目标是393收尾，第一批为帮助文案和三份旧断言适配，再等常浩确认。未确认前不修复、不构建、不跑会写产物的测试、不改CURRENT。

2. **确认后登记续接，修复明确残留。** 核对无另一写入者、保存dirty前像，按协议认领；修Assets.jsx:521、contract.md、digital-world-ui单元断言、ui-final-254和ui-user-258资产片段。保留所有其他断言，旧review3与首败不覆盖，冻结新的最终审查输入。

3. **单独排查受控执行首败。** 合成fixture下先运行：
   ~~~sh
   node --test --test-concurrency=1 --test-name-pattern='timeout remains probeable' tests/controlled-execution.test.mjs
   ~~~
   保留结果，读异步启动/超时实现，判断环境、时序或缺陷。若需扩大本票之外业务改动，先形成证据与最小处理路线，不能重跑绿就无条件关闭首败。

4. **必要最终验证及构建。** 构建不与浏览器夹具并行；先针对性SSR/失败用例，再完整串行及受影响浏览器：
   ~~~sh
   node --test --test-concurrency=1 tests/digital-world-ui.test.mjs tests/controlled-execution.test.mjs
   npm run build
   node --test --test-concurrency=1 tests/*.test.mjs
   node tests/assets-warehouse-browser.mjs
   node tests/assets-actions-browser.mjs
   node tests/assets-copy-browser.mjs
   node tests/usage-browser.mjs
   node tests/ui-final-254-browser.mjs
   node tests/ui-user-258-browser.mjs
   ~~~
   用新输出目录保留原证据。三项资产专项输出变量分别ASSETS_TEST_RESULTS、ASSETS_ACTIONS_RESULTS、ASSETS_COPY_RESULTS；其他按文件读GUIJI_TEST_RESULTS。复用旧结果须说明最终源码/行为一致；runner的393硬编码应随真实接续处理，不伪造CURRENT。六宽观察可参考work/assets391/capture-grid.mjs，先查输入/输出，不覆盖旧证据。

5. **最终同构建证据与正式交回。** 核对源码冻结、六宽13图/控件/无横溢/键盘/触屏、两轴与T2；5178的/、最终JS/CSS、manifest、图标与dist逐字节回读。真实用户页先确认无未保存表单再只读刷新/聚焦。补最终manifest/report、保护核对和docs/agents/handoffs/正式交接，更新issue-tracker/CURRENT，写后回读释放。不要预称394已存在或拿392旧清单当新证据。

6. **按分工交验。** Claude质量审查后由常浩实际使用/视觉验收；386/384独立待验保留。不主动给其他会话/机器人发消息，不声称它们已读或已接手。

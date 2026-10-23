# 资产仓库编号与录入优化 · 本地交回386

输入384→认领385→输出386；执行者Codex。用户直接授权的资产仓库小改已实现、检查并由现有5178服务采用。状态为「本地验证通过、待用户验收」；Claude质量验收及常浩真实使用验收尚未进行，调酒384的待验状态保留。

实际改动：

- `src/Assets.jsx`：未删除同类资产按创建先后从01连续编号；全部页头部及全空页新建均默认Prompt，类型按钮和筛选中Prompt位于Skill前。移除新建通用说明及来源输入，标签支持中英文逗号与空白、忽略空值并去重。仅修改其他字段时保留既有多词标签；旧来源和版本历史保留。
- `src/scrolls.js`：焚决卷同样排除删除对象后派生连续编号；恢复时重新计算显示编号，ID、内容和历史语义不变。
- 新增两个隔离测试入口：`tests/assets-warehouse.test.mjs`及`tests/assets-warehouse-browser.mjs`；原`tests/browser.mjs`、`tests/scrolls-browser.mjs`、`tests/mcp-asset-browser.mjs`仅适配Prompt顺序/default以及刷新等待，不删业务断言。`dist`及本票/跟踪/状态同步。

编号是展示值：删除中间对象后剩余对象重新连续排列；全部删除后新对象从01开始。同一未删除集合中，搜索、标签、置顶和排序不改变编号。新建提示被取消，编辑版本说明及焚决帮助仍保留。去掉来源输入不删除历史来源或origin。

验证及可复核证据：

- 全量串行单元 `node --test --test-concurrency=1 tests/*.test.mjs`：1206/1206；[最终日志](../../../work/assets385/unit-final.log)。
- 9组浏览器入口通过：新仓库专项、删除、置顶、焚决、MCP、资产布局、历史、连续派单动效、综合用户路径；[入口及日志索引](../../../work/assets385/final-regression-results.json)。
- 专项执行删除/新建/编辑/刷新、混合标签分隔、旧来源/标签/版本保护、搜索排序置顶、全空第二入口及503写入失败保留输入；6宽320/375/390/393/430/1440，表单geometry/44px/Axe、列表控制栏与封面编号边界通过。30组同夹具前后图：[对比报告](../../../work/assets385/report.html)、[专项结果](../../../work/assets385/browser-final2/results.json)。移动列表旧描述/URL裁切在同前版亦复现，未改CSS，不声称全列表文字无裁切或真机验收。
- 两轴最终绑定候选2八文件，manifest SHA256 `24e835575ed7364e1e5fb1d146e9bbf32f244f27061b3180e70108045ed50dd6`；Spec原P2（全空新建仍Skill）red→green关闭，新增0；Standards硬违反0，重复默认表达式维护建议1暂缓，两个入口已有断言。[审查与首败](../../../work/assets385/review-final.md)。内部子代理审查不等于Claude客户端验收。
- 同最终构建的T2为限定本票的VISUAL_PASS；继承既有视觉、生成预算/调用0；[T2记录](../../../work/assets385/t2-visual-record.md)。构建17文件manifest SHA256 `724b16bc8223581c5113660bdfbc0fd45e9feea02aeefdc550feff6aa45f8687`，Vite构建通过，既有大chunk警告保留。

运行采用：未重启，现有PID97328/5178直接供应新dist。最终HTML、JS、CSS、manifest及192图标5项HTTP200与磁盘逐字节一致，17个dist文件指纹通过；[采用证据](../../../work/assets385/http-final-adoption.json)。通过Codex内置浏览器读取真实资产页及打开/取消空白新建表单，同JS已见Prompt在前、无通用说明/来源栏和新标签占位；当前4个Prompt为PRM.01—PRM.04、焚决FJ.01；[真实界面回读](../../../work/assets385/live-readback.json)。未测试性新增、编辑或删除真实数据。

保护与动态状态：929项基线中，本票外源码/服务/测试、依赖锁、AGENTS、COLLABORATION及接手时已有收藏dirty内容指纹保留。期间真实主库指针从162到163，新快照只改变revision/scrolls，资产数组相同；其发起来源未核实。AIHOT缓存和使用日志也有动态变化，全部原样保留，不回滚、不把动态主库称为整库未变。[保护差异](../../../work/assets385/protected-delta-final.json)。

首败完整保留：原编号PRM.06≠PRM.01、初稿全空默认false≠true为有效缺陷red；另有夹具/定位准备错误和刷新即count时序失败。刷新等待修正后原数量断言通过，综合前版检查曾通过，不能宣称综合前版必现。详见审查记录和`work/assets385/`原日志。

权限：本机源代码/静态构建/文档与合成隔离验证。无提交、推送、安装、真实Vault/私有Agent配置/凭据访问或收费调用；HEAD保持`e6e5d8b74474ea408ebb171ab70415e32d57ada4`。不操作其他待验功能或真实删除数据。写入者随CURRENT386交回释放，待另一客户端实际读取；未发送跨客户端消息。

唯一下一步：Claude按本交接与冻结差异做质量验收，通过后由常浩刷新资产仓库进行使用验收。调酒384继续保留独立待验。

非技术使用：打开原工作台的资产仓库，刷新页面；新建首先选中Prompt。标签可输入`深度思考 问题建模，教育`，保存后显示三个标签。全部删除某一类型后，下次新建该类型显示01；仍有未删除对象时按当前数量连续排列。看到旧窗口时刷新即可，异常由Codex定位，无需用户读代码。

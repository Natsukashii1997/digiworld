# v0.15 · 知识整理任务与候选接入

状态：本地验证通过、待真人使用；本机主服务已采用0.15.0。K02第一接缝，不是完整知识编译、自动Agent执行或知识写回。完整产品目标仍active。

## 版本与范围

- 契约：`KNOWLEDGE-COMPILATION.md`。HEAD/start_head `817b2949ffbaeccae97b610691f2b78c35acb0c0`；应用仍为未提交本地版本，没有提交、推送或公网发布。
- 基线 `/tmp/guiji-v015-baseline-Zjeqdg`；首轮共同审查 `/tmp/guiji-v015-reviewed-9tPTC8`；修复后共同最终源/构建 `/tmp/guiji-v015-final-8j2QVa`。
- 58个src/server文件联合SHA-256 `bffed5abd2185d85d5cff523f1bc30f2927fbe4b208c49cad6f3b68ea0ecc34d`，算法：相对路径排序、逐项路径+NUL+原字节。交付前与当前应用逐文件一致。
- JS `index-DZumE_--.js` SHA `5ffd67fb738d50e5a88d7b2efb999b2859f0e174c5860be848ba0a99c043451d`。
- CSS `index-BU23U72c.css` SHA `de10815afdfb92d71c171729e2bf150eb97e17372ba032d24e4fa8f8940c27ed`。
- index.html SHA `80ab91b8c9cc5ee77c3f8489ea33c58e3a4ca1ed0f99ac235054fb143991c5e7`，实际HTTP入口是 `/`，不是 `/index.html`。
- 冻结后只对resilience测试的链式调用进行Prettier换行，不改参数/断言/语义；生产源码、依赖及dist未变化。README、QA、覆盖表与状态记录为交付后证据文档，不参与运行构建。

## 已实现的用户路径

1. 查看原文后加入整理，可跨来源选择最多5份，保留各自文件版本；输入问题、本人确认后创建任务。
2. 详情中准备/复制任务文本，每次重新核对来源；只含问题、来源位置/哈希和候选格式，不包含来源原文，不自动启动Agent。
3. 本人Codex输出JSON后明确导入。展示不可覆盖的候选历史、摘要、主张/出处、待核对冲突、未知项与关联建议。导入成功清文件；失败保留文件。
4. 核对来源显示当次一致/变化/撤权/无法核验；刷新、导入和来源变化使旧核验失效。一致不等于语义正确。
5. 归档保留任务和候选，可在历史查看；备份合并兼容历史，但不恢复来源权限。

最多50个任务、每任务10个候选版本，单候选64KiB。所有任务写入使用专用入口和预期版本；通用工作区PUT无法新增、覆盖或删除整理历史。创建和导入幂等，未知结果必须先刷新回读，不自动重放。候选正文明确保存在本机主库，应按私人知识保管备份。工作台不拥有正式知识，不提供采纳或写回按钮。

## 验证结果

- 最终全量单元/API：**330/330**；新增整理单元/HTTP/存储18项，两名独立审查者各复跑通过。变更源码/测试Prettier最终通过；build通过，无新依赖。
- 最终整理浏览器：**8组流程/10次axe**，`test-results/v015-final-ui/report.json`。
- 最终错误恢复/长文浏览器：**5组流程/6次axe**，`test-results/v015-final-resilience/report.json`；320/375/393/430/768/1280六档，长中文/无空格英文、控件≥44px、无横向溢出。
- 最终5xx恢复：**6/6**（create/receive/archive ×500/503），`test-results/v015-final-recovery/report.json`。每例先真实提交合成数据再模拟错误响应，验证冻结后续写入、保留草稿/文件、刷新找回、显式幂等；两名审查者独立复跑。
- 既有回归15个脚本：13个浏览器**149组流程断言**、迁移2、历史容量2，合计153组；69次axe、0违规，96张截图。`test-results/v015-regression/summary.json`。绑定9tPTC8，其后仅新整理5xx错误分支变化，不影响这些旧业务路径；受影响整理路径在最终版全部重跑。
- 合计本轮浏览器168组流程/用例（149+8+5+6），85次axe均0违规，另迁移2/容量2。数字按脚本既有断言组计，不是独立业务功能数或完成百分比。

### 发现、修复与边界

- 忙碌期间Escape关闭会丢失回读：先复现，改为实时锁判断；延迟提交反例通过。
- 导入成功后原文件未清、刷新恢复固定在旧候选：先红后绿；现在成功清文件，刷新显示最新回读候选，失败保留文件。
- 共享Dialog关闭命中区32×31：改共享关闭控件44×44，20px图标保持；相关全页面回归通过，不加知识页深层覆盖。
- 独立Spec发现提交后5xx仍允许再次写入：原反例候选已1版但无pending；两处写入catch补5xx未知处理。6个动作/状态反例旧版全红，最终全绿；原503反例独立回验pending=1、导入disabled。
- 任务筛选增加可见选中状态，保留aria-pressed。
- 测试定位中的textarea label包含正文导致不匹配，已使用稳定role/name；这是测试定位问题，不冒充产品缺陷。

## 独立代码审查

### Standards

共同冻结最终8j2QVa增量复核通过：0阻断、0硬性标准违规。P3 possible Duplicated Code：创建与详情各自的异步生命周期协议有重复，记录为非阻断维护建议，本轮延期，避免纯去重破坏草稿/文件的不同恢复语义。后续实际修改生命周期时再提炼局部helper，不扩通用框架。

### Spec

首轮1项P2（提交后5xx未知状态不冻结），最终已修复。审查者独立重现原反例并复跑6例，未闭合发现0。多源版本、不可变候选、权限撤销、备份、通用PUT和未执行/未写回语义无新偏离。

两轴结论分开保留：Standards 1项明确延期建议；Spec 0未闭合。没有用其中一轴代替另一轴。

## 产品流程与视觉

使用product-design:audit复核知识整理实际路径，沿用A-v0.2与visual-app-development-sop。UI优化来自失败证据，不另选配色或增加宣传性解释。主代理实际IAB操作：双源原文→加入→创建→准备文本→文件选择器导入→来源核对；最后在最终构建重新完成任务文本/导入/错误/窄屏表单。详见 `test-results/v015-cua/notes.md`。

初次01–05为9tPTC8，不能冒充最终JS。最终06–12为8j2QVa、合成服务55656；任务由fixture预建，最终截图不冒充UI创建证据。UI创建已在初轮实际路径及最终行为套件执行。11截图在输入绘制前被捕获，不用于状态证明，已以12补足。所有采用的图片均逐张打开检查。

### 最终步骤与截图

1. 选择与填写，正常：375px已选资料、真实问题、本人确认和创建按钮层级清楚。

![已选资料的整理表单](/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/test-results/v015-cua/12-final-create-selected-375.png)

2. 准备任务文本，正常：可见范围边界和“尚未启动Codex”，只读文本可滚动及手动复制。

![任务文本](/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/test-results/v015-cua/06-final-packet.png)

3. 导入与审阅，正常：候选、版本和未写回标记清楚；主张类别与引用分层。

![候选与依据](/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/test-results/v015-cua/07-final-candidate-1280.png)

4. 冲突与未知，正常：375px内容完整换行，关联保持各自出处。

![冲突与未知](/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/test-results/v015-cua/09-final-conflict-375.png)

5. 错误恢复，正常：非法JSON被拒绝，旧候选及文件保留；5xx未知状态由真实故障注入测试覆盖。

![错误提示](/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/test-results/v015-cua/10-final-error-375.png)

最终T2：独立design-taste-frontend，**VISUAL_PASS**，仅视觉。manifest SHA `bd692d5fdcff8fdf911ceea53b5f1c3e36ce4958c3f3ac7a160c01a3f9d26e22`及六成员、精确JS/CSS由主代理和审查者分别核对。正式批准以同级《个人AI工作台-A风格视觉规范-v0.2-批准记录.md》为准，冻结manifest历史candidate字段不覆盖批准。

Design Read：暖白画布、少量橙色动作、清楚的证据层级延续专业克制工具感。Preserve：候选/原文/来源分工、未写回状态、共享按钮和44px关闭命中区。审查覆盖普通候选375/1280、创建表单375、错误375、撤权1280、320–1280六档长文本、备份弹窗。没有critical/important或必须精修项，决策无需修改；Owner为主流程；不改信息结构、语义、功能或组件归属。全页弹窗拼接及长空白裁切被排除，已由有效viewport补足。

T2 Freshness为CURRENT，仅绑定上述最终JS/CSS；任何可见变更使相应截图/T2及受影响QA失效。静态图不证明动画、原生VoiceOver、真人体验或知识质量；营销lens/新图像N/A。

## 语义综合证据的准确边界

`test-results/v015-semantic/candidate.json`：开发子代理实际核验并只读两份合成资料，产出8条主张、1处冲突、8个未知、3个关联，6983字节。主代理检查候选并通过先前合成服务51272导入，回读候选1版、核对一致、两份原始文件哈希不变。说明原生Codex可按照任务合同生成候选，不说明产品已自动启动Agent或观察到运行回执。

后续最终UI使用确定性fixture候选（含script纯文本安全反例），不是冒充再次执行语义模型。未调用收费模型、外部云端、真实Vault或GET。未把结构校验当作语义审阅。

## 主运行与数据保留

主服务 `http://127.0.0.1:5178/#knowledge` 实际为 **0.15.0 / filesystem**，PID93178，cwd为应用目录；终端session5184。根HTTP与JS/CSS逐字节匹配最终dist。原服务中断后曾恢复v0.14基线，门禁通过后正常停止该PID82938再切换；没有并行争抢主库。

切换前后及主IAB刷新后：revision5、发现项目21、手工项目0、知识源0、知识任务0。`data/CURRENT.json` SHA `9cf1a6a3541c30ae148545b42278e441a9a6b1ce33082f7d70d378b923b8a310`；快照 `5-1bee13e6-f633-4dfd-9daf-bc71be2cf6ba.json` SHA `1f9f698413fb3e2fdacbb65e5cebfae7e53237a4c9aab28dd43087666d4d6ac4` 均不变。发现项目位于connections.projects，不能用空的手工projects误报丢失。

主IAB原先显示网络失败，没有未保存表单；刷新后新整理入口可见，证据 `test-results/v015-cua/13-main-v015.png`。没有连接或扫描真实知识源。真实Vault、Agent配置、飞书、远端、旧监工未被修改。

测试页2及临时51272/54297/55656服务已关闭，对应fixture只清理自己生成的三份合成临时树；测试报告和截图保留。未删除用户资产。主服务5178保留运行。

## 未完成与下一步

本地代码/自动化验证/独立双轴/T2/主进程采用：PASS。真实知识源连接、真人使用验收、原生设备/VoiceOver：待验，不由合成测试代替。候选质量的长期效果尚未验证。

下一步：K02候选审阅与受控写回接缝，先在合成库固定精确目标、差异预览、本人确认、写后回读与回退；与已有知识有效性入口衔接。真实Vault写入必须另有精确授权，不默认开启。原生Agent运行/回执、纠正影响查询、主动维护及完整A/W/N/M/Mac交付仍开放，见GOAL-COVERAGE。

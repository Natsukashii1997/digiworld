# 派单351批1工程交回357

P1/P2/P4/P5/P6/P7已实现、完成串行验证，并静态采用到5178。原版页头、侧栏、中枢、地铁线路、芯片、相纸、AI HOT报纸和时间线保留。**工程交回；Claude逐批复核与常浩终验待做，批2/3未启动。**

| 项 | 实际状态 |
|---|---|
| 输入 / 认领 / 输出 | 实读355 → Codex认领356 → 本交接357，更新CURRENT、回读后释放写入者 |
| 依据 | [派单351](2026-10-10-claude-ui-refine-dispatch-351.md)、[审计350](2026-10-10-claude-ui-reaudit-350.md)、[批0验收355](2026-10-10-claude-silver-acceptance-355.md) |
| 范围 | 批1六项；25个前端文件、3个测试文件；证据及生成dist。没有实施P3或批2/3，没有提交、推送、安装依赖、写真实业务数据或清理历史快照 |
| 事实源 | 355源码/dist前像、实际差异、合成浏览器夹具、冻结指纹、测试日志、5178公开静态资源与真实数据文件指纹；未读真实Vault、Agent私人会话或业务数据正文 |
| 原版视觉权威 | `SATISFIED_BY_EXISTING_AUTHORITY`，生成预算0；[权威包](evidence-2026-10-10-codex-ui-refine-356/authority-package.json) SHA256 `47eec55df77dae363b2e74224cca71509519d40ea50ade69f614f74b5b41031e` |
| 最终候选 | [candidate-manifest.json](evidence-2026-10-10-codex-ui-refine-356/candidate-manifest.json)，224项，SHA256 `c8839ace615e7b39c1dd9b875d617f0f9395451a851ecd2879ba5f2f49e713ec` |
| 实际运行文件 | [runtime-manifest.json](evidence-2026-10-10-codex-ui-refine-356/runtime-manifest.json)，17项，SHA256 `9d625672d8c3b509bb6af1e1075a7d04ffb7e7d89cc130d6689f1283f7b62eeb` |

## 改动与验收证据

[69组前后对照](evidence-2026-10-10-codex-ui-refine-356/report.html)可按宽度、派单项、正常页面、首页卡片1:1筛选；[位置及边界](evidence-2026-10-10-codex-ui-refine-356/changes-by-page.md)、[实际字号](evidence-2026-10-10-codex-ui-refine-356/font-sizes.md)、[改前小字定位](evidence-2026-10-10-codex-ui-refine-356/font-locations.md)供逐项复核。

| 项 | 结果 | 具体证据 |
|---|---|---|
| P1 错误提示 | 来源失败在受影响卡片中提示一次，文案句号去重并提供重试；同来源旧结果保留、变暗、标明待核实。旧日历不再称“正在/下一个”；首页B保留原待办ID/排序/数量/跳转，显示核实动作 | 两宽 `P1-*` 图；读回失败→保留→重试恢复；运行设置先有有效模板且可提交，再验证协议失败时草稿保留、提交禁用且程序化提交不改变设置；项目详情体检显示未知，继续动作禁用 |
| P2 空位 | 项目空槽和夜巡空插槽按内容收缩，仅第一空位显示引导，其他保留编号 | 空项目132.39px，有内容槽最小452.38px，低于一半；1440×900夜巡芯片库标题y735.64，首屏可见；`P2-*`与`night-*`两宽 |
| P4 小字 | 实际可见的小字提至11px；点阵SVG保留。字号增大后的协同线路眉题复用原换行守护，窄屏边界延至430px，避免400px孤字折行 | 64组实际计算字号，低于11px节点0，横向溢出0。沿用348的main/header/nav/aside口径；无可见字形的0字号图标标签、屏幕阅读器文本与SVG不计 |
| P5 截断提示 | 日历TodoList、手机逆向工程筛选、收藏分组、设置分类沿原滚动行加渐隐 | 四条390宽滚动行均有渐隐；到末端右侧渐隐消失；装饰不拦截指针，末项仍可键盘聚焦；`P5-*` |
| P6 内容与吸顶 | 首页四卡等高构图保留，C补最近两条活动，D列最多三个项目；少数据时居中。今日未授权提供原日历入口；桌面热点榜吸顶 | 正常/多项目夹具最大留白109.67px，桌面四卡各299.80px；未授权入口44px且跳原日历；底部滚动时热点榜y72、高673.97，仍完整在视口；`P6-*` |
| P7 主按钮 | 复用既有橙色填充、光晕与深色文字；青色保留给次要与选中态。AI HOT首次拉取和日历部分授权分支只留一个主动作，青底橙边已去掉 | 逐页计算颜色及专项断言：无青色实心主按钮，每页至多一个橙色主动作；`P7-*`及各页正常图；原AI HOT悬停检查严格对照实际`--orange-ink` |

只读旧结果不会成为当前成功读取。首页的日历/提醒保留只用于展示；日历原编辑路径仍在失败时清空可编辑数据。协同协议与项目状态失败时，新入口、保存和继续动作保持当前读取门禁，不自动授权系统权限或真实Agent操作。

## 验证层次

所有最终结果均覆盖上述冻结候选；早期候选记录保留，但不替代末轮结果。完整证据指纹见[qa-manifest-link.json](evidence-2026-10-10-codex-ui-refine-356/qa-manifest-link.json)。

| 层次 | 本轮实际结果 |
|---|---|
| 构建 | Vite构建通过，见 `build-readable.log`；原有大chunk提示保留，没有为消除提示扩大改造 |
| 全量单元 | 串行1175/1175，`unit-readable.log` |
| 批1专项 | `readable-browser.log`通过：失败/重试/旧结果、有效草稿写入门禁、空槽、四滚动行、首页内容、权限入口、热点吸顶、主按钮、字号、44px/焦点/减少动态效果及手机补充检查 |
| 既有浏览器回归 | 串行15/15：home、projects、collab、collab-template、calendar、calendar-todo、settings、aihot、collection-redesign、collection、collection-recycle、reverse、agent-roles、accessibility、visual；结果逐项见 `browser-final-results.json` 和 `regression-readable/` |
| 可访问性 | 正常页面与弹窗19状态、读取失败4状态均0Axe违规；失败态之前的20项对比度违规已消除；不代签真人VoiceOver体验 |
| 对照与响应式 | 69组同夹具前后图，含12组首页卡片1:1；固定ID/时间、1440/390两宽、减少动态效果。320/375/393/430只补最终候选检查，不伪造改前；原六宽visual132张新截图，页面错误/横向溢出`problems=[]` |
| 工程审查 | 两个只读子代理分别复核Standards和Spec，确认28项差异、224项候选与17项运行指纹一致，无剩余阻塞；不把子代理静态审查称为Claude验收，详见[两轴记录](evidence-2026-10-10-codex-ui-refine-356/review-results.md) |
| 同构建视觉复核 | [T2记录](evidence-2026-10-10-codex-ui-refine-356/t2-visual-record.md)为`VISUAL_PASS`，仅视觉层；绑定最终运行清单，不代表常浩批准或整体业务验收 |
| 5178采用 | 已静态同步生成dist，没有重启。17文件磁盘指纹全等；首页及6个assets共7个公开HTTP资源200、字节全等；PID65924与批0交接354相同，回读期间未变化，见[adoption.json](evidence-2026-10-10-codex-ui-refine-356/adoption.json) |
| 真实使用 / Claude / 常浩 | 本轮没有打开带真实业务数据的浏览器页面或执行真实写入；运行采用由静态HTTP证据证明。Claude逐批复核和常浩终验均待做；批0真人终验仍未代签 |

## 首败及修正

- 窄屏协同400px眉题在字体增大后孤字折行：在原有规则上把守护范围延至430px；最终原套件与六宽visual通过。
- 保留旧数据的早期透明度.55使协同16项、项目4项文字对比度失败：只把 `.read-failed` 调至.8。旧形态和变暗提示仍保留；四失败态最终0违规。首败见 `error-accessibility-contrast-first.json/.log`。错误态扫描工具第一次误用浏览器API的日志也保留在 `error-accessibility-first.log`。
- AI HOT原悬停断言写死旧青色文字RGB，与P7橙色不符：改为严格比较既有`--orange-ink`，其他交互断言不变。根代理首次误用不存在的`--primary-ink`，保留 `run-token-error.log` 后回读令牌修正。
- 末轮全量第一次1174通过、1项HTTP入口不匹配：执行器只设服务构建变量，漏设既有断言的`GUIJI_TEST_DIST`。只修正证据目录执行器，让服务和断言都选同一候选；未改产品或单元断言。首败保留 `unit-readable-build-selection-first.log`，随后1175/1175。
- 静态采用第一次磁盘同步已经成功，HTTP验证器却把10张保留的历史主题图当公开资源，首个 `/theme/digievolution/crests.png` 按原服务白名单404。服务与355逐字节相同，当前源码没有引用这些旧主题路径；10图磁盘指纹均与355相同。只修正验证范围，对已经采用的17文件及实际7个公开HTTP资源只读核对，没有重复同步或重启；见 `adoption-first-failure.json`、`adoption-query-probes.json` 和最终 `adoption.json`。
- 截图夹具适配中的0字号无字形节点、旧版首页缺少新容器、同路由挂载、旧版失败后清空看板影响后续截图等首败均保留在 `first-browser.log`、`before-expanded.log`、`final-browser.log`、`before-complete.log`。前像拍失败状态后只恢复合成读取，不把旧版本缺少新行为算作通过；正常验证分支未放宽。

已知旧版 `ui-v14-browser` 在未改知识区选择器等待超时，沿用355开放状态；本轮未把它计入15套件，也未宣称修复。

## 文件与保护边界

以355留存前像比较，精确28项差异见[changes-final.json](evidence-2026-10-10-codex-ui-refine-356/changes-final.json)及[review-final-diff.patch](evidence-2026-10-10-codex-ui-refine-356/review-final-diff.patch)。文件清单：

```text
src/App.jsx
src/Calendar.jsx
src/CollabRunSettings.jsx
src/CollabV16.jsx
src/HomeV16.jsx
src/LifePages.jsx
src/NightV16.jsx
src/ProjectsV16.jsx
src/ReverseV16.jsx
src/SettingsV16.jsx
src/aihot-v16.css
src/calendar-v14.css
src/calendar-v16.css
src/collab-v16.css
src/collection.css
src/collection/app/components/DeskView.tsx
src/components.jsx
src/home-v16.css
src/news-v14.css
src/night-v16.css
src/projects-v16.css
src/reverse-v16.css
src/settings-v16.css
src/ui-v14.css
src/useCollabProtocol.js
tests/aihot-v16-browser.mjs
tests/projects-v16-browser.mjs
tests/ui-refine351-browser.mjs
```

两项既有测试变更均对应本批新规格：项目空槽只首位引导；AI HOT主按钮使用橙色文字令牌。新增批1专项使用隔离临时数据，保留用户原工作树与首败。

[最终保护回读](evidence-2026-10-10-codex-ui-refine-356/protected-final.json)：224项冻结文件全部匹配，范围外641个代码文件无漂移，服务端/原生端/依赖未改。Git HEAD仍为 `27160d2331746a0be85ef0f616a6b36ec49fe745`，没有提交或推送。

真实data共176文件中174个指纹与355一致，无新增/删除。主库指针、136份历史快照和22个收藏文件全部一致；revision136与47份含银饰历史副本由355已核验，本轮不重读数据正文，全部快照指纹未动。**两项动态例外：`data/capability-use.json`、`data/aihot/cache.json`发生变化，写入者未核验，保持当前内容，没有归因或回滚。**这些例外不能写成“真实数据全部未变”。历史银饰副本清理仍由常浩单独决定。

## 使用与唯一下一步

无需安装。刷新[工作台5178](http://127.0.0.1:5178/)即可看到新静态构建；页面若保留旧样式，强制刷新一次。可先看项目空槽与夜巡芯片库、首页活动/多项目、橙色主动作，再用上面的合成对照查看读取失败及手机渐隐，不必主动破坏真实数据来制造异常。

Claude读取当前状态与本交接，按派单351逐项复核批1并给出通过/返修；随后常浩亲自终验。**拿到批1验收后再认领批2，本会话不自动继续。**没有向另一个客户端发送消息，未扩大到真实Agent、Vault、部署或历史副本删除。

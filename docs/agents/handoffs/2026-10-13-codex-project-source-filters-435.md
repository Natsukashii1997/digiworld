# 项目来源筛选与数量统一435

输入433 → 认领434 → 输出435。用户纠正：顶部本地6和下方5个LOCAL不一致；标签、筛选和数量统一为“有GitHub关联归GIT，否则归LOCAL”。本轮规则替代433保留旧筛选的段落。保留既有未提交改动，不提交、推送或重启后端。

## 完成的变更

- `src/ProjectsV16.jsx` 仅增加共用来源判据projectSource，统一左标、颜色、数量、筛选匹配；筛选入口为全部/LOCAL/GIT，移除重复的已关联入口。
- GitHub关联使用既有githubUrl；本地目录是否存在不再使GIT同时计入LOCAL。项目扫描/合并、底层Git、路径、分组、SLOT、详情和操作均保留，未改CSS或业务数据。
- `tests/browser.mjs` 正式3项目夹具改为全部3/LOCAL1/GIT2，验证两类数量/行标、筛选、数据保持及刷新不重复扫描。顺带修正已在改前433构建复现的三处旧资产类型定位：button→radio，名称、精确匹配及后续断言不变。

## 验证与运行采用

- 完整单元1211/1211通过，0失败/取消/跳过。首次默认并发运行因宿主高负载主动停止且留档，仅终止明确属于本任务的测试树，后端PID排除；按同一文件集合以并发2完整重跑通过，未放宽断言或超时。
- 正式综合浏览器、原项目专项均通过。综合浏览器首败是旧资产Prompt控件button定位，改前433构建确认radio存在/button不存在，三处修正后完整通过；首败保留。
- 1440/390/320来源专项通过：全部12、LOCAL7、GIT5，两集合互斥且合并覆盖全部；计数/标识/筛选/搜索一致，切换不改项目数据；实心来源格、无重复右标、几何/axe及外连0通过。
- 同一合成夹具1440/390改前后截图已查看，未见新增视觉退化；390原有同焦点/滚动状态skip-link与sticky覆盖前后相同。截图明确为合成证据。
- 构建成功，最终17文件与清单相符，5项公开HTTP200字节与磁盘一致。原5178后端PID13548不变。
- 真实5178页面AX回读确认全部6 / LOCAL5 / GIT1，行标5LOCAL/1GIT、无重复。随后CUA超时/连接重置，真实筛选交互及截图未核实，不冒称完成；筛选功能在同构建隔离环境通过。
- 两次独立只读复核0发现，绑定最终源码/测试SHA与精确差异；不代签Claude或真人验收。

## 证据

[前后与结果](../../../work/project-source434/report.html) · [最终差异](../../../work/project-source434/change.diff) · [源码清单](../../../work/project-source434/source-manifest.json) · [最终单元](../../../work/project-source434/unit-final.log) · [综合浏览器](../../../work/project-source434/browser-final.log) · [项目专项](../../../work/project-source434/projects.log) · [来源三宽](../../../work/project-source434/source-check/results.json) · [独立复核](../../../work/project-source434/review.md) · [真实文本观察](../../../work/project-source434/actual-observation.json) · [HTTP回读](../../../work/project-source434/http-readback.json) · [保护终核](../../../work/project-source434/protection-final.json)。首败/中断保留unit.log、interrupted-run.json、browser.log，旧定位复现见baseline-roles.log。

## 保全与下一步

work/project-source434/baseline.json保存2065文件、189链接、HEAD/PID及原dirty；before/和dist-before/保存目标文件与完整旧构建。无文件丢失或链接变化，范围外源码与依赖保留。221份data中220份与基线一致，data/collection/state.json在期间变化（首次观察mtime为2026-10-13 12:04:02），具体写入者及内容差异未核实；原样保留、未覆盖回滚，不宣称全部数据未变。当前数据指针data/CURRENT.json保持。另一会话“数码世界·收藏｜抖音网页收藏”正按用户请求进行真实插件检查，本轮不替其报告验收结论。

使用：刷新5178 → 项目空间 → 全部项目。顶部LOCAL仅显示青色LOCAL项目；GIT仅显示紫色GIT项目；两类总数等于全部。无需安装或重启。

工程完成，写入者释放为无。唯一下一步：常浩验收当前统一来源规则；真实页面截图和点击回读因浏览器连接问题留有明确限制。无提交、推送、依赖安装、后端重启或真实业务数据写入。

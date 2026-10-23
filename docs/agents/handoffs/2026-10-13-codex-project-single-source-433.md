# 项目列表单一来源标识433

输入431 → 认领432 → 输出433。用户明确决定：每项目一个标识；关联GitHub时左侧紫色GIT，否则青色LOCAL；删右侧重复GIT。仅展示，不改功能/数据，保留全部既有未提交改动，不提交/推送/重启后端。

## 改动

- src/ProjectsV16.jsx：项目列表行的色相class及左侧文字改按既有githubUrl判断，删除右侧pj-cs-linked。
- src/projects-v16.css：删除唯一废弃的pj-cs-linked样式；原LOCAL/GIT实心格样式保持。
- 筛选、数量、排序、分区、目录路径、SLOT/身份等状态、详情和操作逻辑均未改。详情页不在本次列表展示范围。

## 验证与运行采用

- npm run build通过；npm test完整1211/1211通过，0失败/取消/跳过；令牌修复431保留。
- 原 tests/projects-v16-browser.mjs 通过：四伙伴、剪贴板/start留痕、Esc/焦点、预览、失败/未知恢复、详情/开档revision、七宽/长名/44px/axe/运行中reduce，外连0。
- 既有428来源验证另存432后仅更新需求改变的展示断言，旧证据不改：全部12行由9LOCAL/3GIT/2附加标识变为7LOCAL/5GIT/0附加；本地筛选仍9行（含2GIT），GitHub仍5行，原数据保持；1440/390/320实心两色/文字不裁切/geometry/axe通过。
- 改前431完整构建与改后最终构建使用同一合成fixture保存1440/390截图并查看对比。真实5178只读查看确认6行一行一标：1紫GIT、5青LOCAL、0右侧重复；未点击真实写操作。
- 17项最终构建清单与5项公开HTTP200字节相符，原PID13548未变；静态采用已完成，无后端重启。
- 独立只读审查绑定两源SHA，0发现；不代签Claude或真人验收。

## 证据

[前后对比与实际图](../../../work/project-source432/report.html) · [最终差异](../../../work/project-source432/change.diff) · [源清单](../../../work/project-source432/source-manifest.json) · [单元](../../../work/project-source432/unit.log) · [原浏览器](../../../work/project-source432/projects.log) · [来源验证](../../../work/project-source432/source-check/results.json) · [独立复核](../../../work/project-source432/review.md) · [HTTP回读](../../../work/project-source432/http-readback.json) · [最终保全](../../../work/project-source432/protection-final.json)。

## 保全、权限与下一步

work/project-source432/baseline.json 保存2065文件/189符号链接、原HEAD/PID及dirty状态，目标CSS/JSX/CURRENT/台账和完整dist前像已保存。无文件丢失或范围外源码变化；主库/收藏及全部data指纹不变，依赖/HEAD保持。保留既有未提交改动，未新增依赖、提交、推送、重启后端、修改真实业务数据或发外部消息。

使用：刷新5178 → 项目空间 → 全部项目。每行仅左侧一个GIT或LOCAL；本地筛选仍会包含有本地目录的GIT项目，这是原筛选规则保留。

本轮工程完成，当前写入者无。唯一下一步：常浩验收这版单一标识。427的Chrome插件重载及真实抖音单条首验仍待常浩，不在本轮范围。

# UI 首版验收记录 · 2026-09-24

## 交付状态

已完成本地可运行 UI 首版 v0.1.0，不是完整后端产品。预览运行于 `http://127.0.0.1:5178/`，仅绑定本机。`归集` 为本轮暂用界面名称，非已确认品牌。

九个主页面：资产库、Agent 中心、项目空间、知识连接、随手记、夜间模式、拆解与参考、版本与归档、模型与设置。Skills / Prompts / 工作流通过资产库分类切换。

真实功能及未连接边界见 [README](README.md)。测试使用隔离浏览器上下文与演示数据；未访问个人知识库、改动 Agent、上传内容或启动真实夜间任务。未完成真人使用验收。

## 运行构建指纹

- `dist/index.html` SHA-256：`4c931219a6c133bbc81f23813ee96d7e0818b8d61bcd0b4606035f31d27b1718`
- `dist/assets/index-Cf2VqyQB.js` SHA-256：`1aae52d6535118d3e91d8d3511b258bdae017d44cbdcc504701248f18a13a635`
- `dist/assets/index-3dnjf0QT.css` SHA-256：`9df045a76753dac710e14fbeb743d241d5df504ebb459048382c803cab3b03a4`

最后一轮浏览器测试与截图来自 `vite preview` 提供的上述生产构建，而非只验证源文件或开发热更新。

## 功能与可访问性

- `npm run build`：通过。
- `npm test`：5 项通过（资产校验、不可变版本、恢复、危险路径、演示完整性）。
- `node tests/browser.mjs`：21 组运行检查通过。覆盖真实复制、创建/刷新、版本恢复、归档/恢复、中文路径与二进制 ZIP 往返、无 SKILL.md 拒绝、笔记编辑、项目/Agent 登记、接力包、计划草稿、配置、移除示例、全局搜索、Escape、移动导航。
- 加固验证：跨标签页 revision 冲突中止写入；已有数据不被覆盖、未保存输入仍保留；模拟存储失败显示真实原因；编辑弹窗不会通过 Cmd+K 叠加第二个焦点陷阱。
- 九个路由在 390px 下无横向溢出。
- `node tests/accessibility.mjs`：九个页面和三个主要弹窗，共 12 个状态，axe WCAG 2 A/AA、2.1 A/AA 自动规则无违规项。截图/扫描采用 reduced-motion 稳定帧。此结果不等于完整人工屏幕阅读器验收。
- 已测试路径无浏览器 JavaScript 异常。

机器证据：`test-results/browser-report.json`、`test-results/accessibility-report.json`。截图 `01` 至 `08` 均在 `test-results/`。生成证据和构建目录按 `.gitignore` 排除，不代表不存在。

## Standards

对固定快照 `/tmp/guiji-review-1YAOr2` 的独立源码审查发现 3 项：跨标签覆盖（P1）、保存错误被 URL 提示掩盖（P2）、Cmd+K 叠加弹窗（P2）。全部修复；审查代理已限定复核确认关闭。根代理执行了实际浏览器回归。没有未解决的已报告 Standards 问题。

## Spec

独立 Spec 审查发现 2 项：跨标签覆盖、搜索弹窗叠加，均与 Standards 重合，已按上述证据关闭。未把明确未连接的后端能力视作 UI 本轮必须完成的外部集成。没有发现需重新开启产品定义的缺口。

## T2 Runtime Visual Review

Gate: T2

Artifact: 本目录 v0.1.0 运行界面

Artifact version/hash: 上述三项构建 SHA-256

Authority package manifest/version/hash: A 风格 v0.2，`bd692d5fdcff8fdf911ceea53b5f1c3e36ce4958c3f3ac7a160c01a3f9d26e22`；已读取批准记录，本轮复核 manifest hash 一致。原冻结包没有修改。

Reviewed runtime build/version/hash: v0.1.0 / `index-Cf2VqyQB.js` 与 `index-3dnjf0QT.css`

Runtime evidence: 1440×1000 资产首页、详情抽屉、项目、Agent、夜间和知识页面；390×844 资产首页、创建弹窗；全页截图用于内容连续性，弹窗使用视口截图。详情见 `test-results/01-assets-desktop.png` 至 `08-create-mobile.png`。

Baseline QA status: 生产构建、5 项单测、21 组浏览器检查、12 状态自动可访问性扫描通过；真人验收未完成。

Artifact maturity: runtime

Authority protected: 资产优先的结构；暖白/橙色语义；几何封面；卡片→抽屉→类型化创建。外部服务状态、真实持久化和权限边界没有因视觉优化改变。主代理执行独立的视觉审阅步骤，此记录不冒充第三方设计验收。

Design Read: 以低噪音的暖白工作空间承托资产画廊，用橙色主操作、克制阴影和稳定排版形成日常工具质感。

Preserve:

- 清晰的主导航、页面标题和唯一主操作。
- 一致的卡片、抽屉、表单与状态标签。
- 夜间界面只在计划内容区域使用深色，不把调度模式混同全局主题。

| Severity | Evidence | Visual issue | Bounded revision | Decision | Resolution status | Resolution evidence/reason | Protected concerns checked | QA made stale | QA rerun |
|---|---|---|---|---|---|---|---|---|---|
| important | 初轮 1440px 首页、弹窗 | 辅助文字偏小、对比不足 | 调整共享字号与暖灰文本角色 | accepted | resolved | 最终截图与 12 状态 axe 结果 | 未改变结构、数据、类型语义 | 视觉/可访问性 | 已重跑 |
| suggestion | 初轮 390px ZIP 创建 | 原生英文文件按钮破坏一致性 | 保留真实 file input，增加中文可聚焦选择控件样式 | accepted | resolved | 最终 `08-create-mobile.png`、ZIP 回归、axe | 文件读取逻辑不变 | 弹窗/导入/窄屏 | 已重跑 |

Deferred / N/A / Blocked:

- 外部连接、真实执行状态和完整运行日志：DEFERRED，后端不在本次 UI 验收中。
- 长期真人使用效果：DEFERRED，不能由自动测试推出。
- 新视觉方向、ImageGen 生成界面：N/A，继承已定稿系统。

Recommendation: VISUAL_PASS（仅对上述证据覆盖的视觉层，不等于整个产品完成）

Next owner: primary workflow / 常浩使用验收

Freshness: CURRENT for v0.1.0 构建指纹；后续可见修改需要刷新截图及 T2 记录。

## 下一步

先在运行界面中完成使用验收；界面稳定后再进入文件系统主库、完整 Skill 分发与有边界的本地 Agent 连接。不要把 IndexedDB 前端首版自动升级为最终主库或已上线产品。

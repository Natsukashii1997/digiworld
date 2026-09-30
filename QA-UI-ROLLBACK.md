# 原视觉回滚验证 · 2026-09-28

用户明确要求退回数码宝贝改版前的视觉。依据 `UI-ROLLBACK.md` 执行，而不是重新设计。

## 变更及保全

- 恢复 App、Assets、components、main、styles、agent-config、skill-copies、project-locations、knowledge、knowledge-compilation 和 index.html，共11文件。
- 恢复原归集品牌、米白暖橙、抽象封面、默认卡片网格及原详情抽屉。
- 移出运行源码的2个主题文件与主题专用测试，已完整保留在 `test-results/visual-rollback-2026-09-28-HH8fHe/before/`；旧图、设计文档和历史证据均未删除。
- 不更改后端、依赖、API、数据协议、用户记录或扫描结果。代码逐字比对显示整个src和server与改版前baseline一致。暂停的业务开发仍暂停。
- start_head：817b2949ffbaeccae97b610691f2b78c35acb0c0；未提交、未发布。

## 验证

- 改前/改后源码：`test-results/visual-rollback-2026-09-28-HH8fHe/before/`、`after/`。
- 冻结差异：`test-results/visual-rollback-2026-09-28-HH8fHe/changes.diff`，SHA256 `d9029f943b6195c733fa4204d41134fbc28b28ae6d47bca8fab4dac4b9d6017f`。
- 新增恢复检查5/5：默认六卡片网格、分类/空态、详情抽屉及仅本机交付边界、品牌和主题导入移除、真实HTTP构建链。
- 完整测试364/364通过（原359项保留），日志 `test-results/visual-rollback-2026-09-28-HH8fHe/tests.log`。不是通过删除失败业务测试取得绿灯；撤下的是已被用户撤销的数码主题专用断言，并补回当前视觉合同检查。
- Vite构建通过，1611模块；无新依赖。
- Standards / Spec 两轴独立源码审查均0项发现，绑定上述before/after固定快照；未把源码审查当作浏览器验收。
- 本机服务原未运行，已由项目 `npm start` 启动，PID13993，127.0.0.1:5178。
- 实际HTTP回读根页面/JS/CSS均200，字节与dist完全一致，入口标题为归集，JS不包含线稿组件标识。
- 主库CURRENT.json回滚前后 SHA256 均为 `a74e3e05aabe05d1a0cee1a1365f4ce8afd8bd86c0006ce55efccd793a109db9`。

| 当前构建 | SHA256 |
|---|---|
| dist/index.html | c61aa226b465c073325f3430a1428938473c94574239dbb466e0b03aed253a6f |
| dist/assets/index-CQYK6Tt-.js | 8b2feee31a830102fbe095b8abf2a92eeb374e92eba241c0bebcb20d6d37212f |
| dist/assets/index-DfnCsklW.css | 7afeaa40a7906ed68a16b999dc97815d741bca060d7d797b5d76779158b49f45 |

## 验收边界

本次是精确恢复已存在的视觉系统，无新设计候选、无图像生成。原数码主题的视觉权威已由用户撤销。

浏览器实际截图、键盘、真实点击、响应式与T2未执行，沿用现有访问安全限制，不绕过。源码完全恢复与HTTP供应已验证，不宣称整页浏览器视觉验收或用户验收完成。

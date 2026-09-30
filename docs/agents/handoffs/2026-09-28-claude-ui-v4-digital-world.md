# Claude → Codex｜“数码世界”UI v4 全面重构

日期：2026-09-28。输入 `WB-20260928-06` → 认领 `WB-20260928-07` → 输出 `WB-20260928-08`。执行者：Claude（Claude Code 桌面端）。

## 用户要求（本轮原话要点）

- 确认 v3 像素风。要求加入数码宝贝和数码蛋像素元素，“再复杂一些”。
- 结合 PRD 重构全部排版、表述、文案，而不是在原基础上调整。
- 应用改名“数码世界”。
- 完整优化 UI，暂不试用实际功能。
- 追加：“这个项目全权交给你，全面梳理优化，甚至可以重构，要有质感和巧思，专业美观。”

授权范围是界面与代码层面。PRD §4 的产品原则保持不变：证据分层、预览确认、写后回读、本机边界、历史不可变。服务端业务逻辑、API、schema、主库都没有改。

## 改动

| 文件 | 内容 |
|---|---|
| `src/pixel.jsx`（新） | 像素渲染器：同一行相邻同色像素合并成一个矩形，眨眼帧由 CSS 驱动。<br>素材：数码蛋、黑球兽、滚球兽、亚古兽、三种资产类型图标、数码暴龙机外壳。<br>规则函数：`stageOf`（按版本数判定迭代阶段）、`partnerOf`（按自有资产数判定伙伴，不计示例和归档）、`StageBar`。 |
| `src/pages.js`（新） | 页面注册表：编号、分组、眉题、标题、依据 PRD 的一句话定位、诚实成熟度（可用 / 部分可用 / 草稿 / 规划中）、主线。 |
| `src/Home.jsx`（新） | `#home` 总览页，所有计数都来自真实 state，未扫描时如实写“尚未扫描”。 |
| `src/App.jsx` | 重写外壳：分组导航、伙伴卡片、顶栏、启动画面与孵化光幕、进化演出（仅在 `save()` 成功回读后触发）、⌘K 搜索改为同时匹配资产标题、说明、标签。默认路由改为 `home`。 |
| `src/components.jsx` | `PageHeading` 改为从注册表生成；新增 `Maturity`；`Empty` 默认显示像素蛋；`Cover` 改为液晶数据屏（API 变化：接收 type/serial/version/stage 参数）。`Dialog` 的焦点与键盘逻辑原样保留。 |
| `src/Assets.jsx` | 新工具栏、液晶卡片、类型编号（如 SKL.01）、迭代阶段、四角锁定框；编辑器说明保存后的版本号；详情封面带阶段。交付、导出、历史、归档逻辑不变。 |
| `src/WorkspacePages.jsx`、`DiscoveryPages.jsx`、`Knowledge.jsx` | 页头接入注册表；页面说明与空状态文案重写。操作按钮名称全部保留。 |
| `src/styles.css` | 从零重写设计系统：深墨蓝底、数码网格、液晶与数据屏两种材质、按钮高光扫过、锁定框、数据化显影、进化演出。兼容旧模块样式使用的变量名；保留 44px 控件、outline 焦点、窄屏防溢出，并支持“减少动态效果”。 |
| `src/StoragePanel.jsx`、`server/index.mjs`、`index.html`、`README.md` | 品牌改为“数码世界”，只改字符串；新增像素蛋 favicon。 |
| `tests/digital-world-ui.test.mjs`（新）替换 `tests/original-ui.test.mjs` | 旧测试断言的是已被用户推翻的“归集”视觉。新测试覆盖：卡片、编号、阶段由真实数据生成；详情保留交付与本机边界；阶段与伙伴规则；总览的诚实计数；品牌；HTTP 供应。旧文件保留在基线快照中。 |
| `tests/{accessibility,browser,delivery-browser,migration}.mjs` | 首页改为总览，所以根地址跳转显式改成 `/#assets`。断言没有放宽。 |
| `PRD.md` §10.5、`AGENTS.md` | 记录 v4 与进化规则；更新视觉约束。 |

改前完整快照：`test-results/ui-v3-baseline/`（src、tests、index.html、vite.config.js）。新代码指纹：[146 个文件](2026-09-28-ui-v4-code-baseline.sha256)，清单自身 SHA256 `4f172d40…53cb`。

## 验证（最终构建）

- `npm test`：**367/367**（旧 366 − 旧 UI 5 + 新 UI 6）。
- 浏览器、可访问性与迁移脚本 **22/22 通过**：browser、accessibility（axe）、migration、history-capacity，以及全部 18 个 `*-browser.mjs`。日志在 [evidence](evidence-2026-09-28-claude-ui-v4/)。
- 首轮浏览器回归有 11 个失败，全部是真实的界面回归，已修正设计本身，没有放宽测试：
  - 控件从 40/36px 恢复到 44px。
  - 焦点改用真实 outline。
  - `.context-source` 与 `.context-preview` 的语义写反了，已纠正。
  - Agent 路径行和长项目名在 320px 宽下溢出，已修复。
  - 导航名“模型与设置”恢复。
- 视觉：Playwright 在隔离数据加合成发现结果下，拍了 1440 宽全部页面、详情、编辑器、进化演出中间帧和 390 宽手机截图，存在 evidence/shots。没有 JS 错误，手机无横向溢出。
- 运行采用：`npm run build` 写入 `dist/`，PID 13993 提供的 HTML/JS/CSS 与 dist 逐字节一致，标题为“数码世界 · 个人 AI 工作台”。服务端只改了启动日志字符串，没有重启。
- 真实主库 `data/CURRENT.json` SHA256 仍为 `a74e3e05…9db9`。本轮没有在 5178 真实数据上做任何操作。

## 未完成与风险

- **真实使用验收未做**，这是用户明确要求的。
- 进化阶段只反映迭代次数，不反映使用效果。PRD §8.2 的使用记录仍待开发。
- 像素伙伴属于二次创作，仅限本机个人使用，不得公开发布。
- Agent 卡片、知识深层子面板只继承了新令牌，没有逐一重新排版。它们已通过窄屏、44px 和 axe 回归，但仍有进一步精修空间。
- `test-results/` 被 Git 忽略；快照和截图只在本机。

## 唯一下一步

用户在 http://127.0.0.1:5178/ 刷新查看新界面并反馈观感。Codex 可复核本批次与第一批改动。之后建议按 PRD §9：先做使用记录（§8.2），让“进化”有使用依据，再安排真人验收冲刺。

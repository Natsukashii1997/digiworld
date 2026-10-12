# Claude｜收藏页派单335独立质量验收 · WB-20261010-341

```text
输入状态 / 输出状态：WB-20261010-339（写入者无）→ Claude 认领 340 → 本交接 341（写入者释放为“无”）
执行者 / 范围：Claude 只读验收 + 隔离重跑；只写 CURRENT、本交接、evidence-2026-10-10-claude-collection-340/
业务源码、测试、dist 冻结；未重启、未提交、未装依赖；真实 5178 只读（拦截非 GET/HEAD）
结论：**返修**（2 项重要、3 项建议；无致命）。整体方向、结构、气质与批准稿一致，质量较高；两处布局缺陷修完即可复验通过
不代签常浩验收；不等于真实 MCP / ASR / Chrome 使用完成或完整复刻封板
```

## 一、权威状态与一致性（本轮实测）

- 读到：state_id `WB-20261010-339`、写入者“无”、唯一下一步“Claude 逐区验收”，与启动提示一致。
- 5178：`/` 返回 200；首页与 dist 同为 `3e83e891…`；引用的 JS `index-CMUEKfEd.js`（`d370eb76…`）、CSS `index-CPVjK8QH.css`（`e3cc2692…`）、图标、manifest 与 dist 逐字节一致。只核对了这些活跃资源，未断言全部 20 个 dist 文件可经 HTTP 访问。
- 保护：主库指针 `9478ee25…bc6f4f`、收藏 state `18de873c…2192582` 与 331/339 一致；`protected-final-339.json` 记载收藏 22/22、主库不变，179/180（唯一漂移是 capability-use 使用元信息，保留现状）。
- 布局算法：`buildOrganized`、`sr` 两个函数体与 `27160d2`（=认领前 326 版 `9f98ab16…`）逐字一致。
- 样式迁移：DeskView 中 `styleOf(` 由 112 处降到 6 处（剩余为动态几何/动画变量/拖拽 clone）；collection.css 的 `!important` 由 30 处降到 1 处（减少动效媒体规则）。ui-v14.css 只新增 9 个 `--collection-*` 阴影令牌，没有覆盖已有令牌。
- 独立重跑（隔离 runner `evidence-2026-10-06-codex-221/isolation-runner/register.mjs`，合成数据，结果写到 scratch，不改 dist；dist 首页 SHA 前后一致）：
  - `npm test -- --test-concurrency=1`：**1196/1196**，0 跳过
  - `design-tokens`：**4/4**
  - `collection-redesign-browser`：通过（六宽几何、胶囊、单页滚动、缩略图全访问、焦点/Esc、44px、axe、只复制 MCP、入场/落桌/不重播/减少动效）
  - `collection-motion-browser`、`collection-recycle-browser`、`collection-browser`：通过
  - 未重跑：drag、video、extension 三个专项与 138 张 visual，沿用 339 的冻结证据
- 真实 5178 只读（1440/390）：唯一 h1；不再有“收藏画布”标题；desk `overflow-y: visible`，内部滚动 0；控制轨 sticky、top 56，滚动后仍在 56；3 张实际收藏；无页面错误、无横向溢出。拦截的初始化请求只有 4 类跨页 POST，全部在发送前阻止。

## 二、对照图完整性与叠图

- 22 组对照：抽查 default-1440、reader-1440、expanded-320 的合成图，确认“改前”来自认领前 dist、两侧同输入；改后单图逐张看过 default-390、expanded-1440、extension-1440、agent-1440、reader-1440/390、search-empty-1440/390、empty-1440，并补看专项冻结图（reader-1440/390 长名、help-1440、expanded-320）。没有逐一打开 22 组里剩下的合成图，这部分以单图和专项图代替。
- 4 张叠图全部打开。按 `overlay-method.json`，均为左上原像素对齐、只补空白、50% 混合，没有平移或缩放。
  - default/expanded × 1440/390：页头、控制轨、画布、分组签、相纸的位置与稿基本重合；整体下移约 10px（1440）/13px（390），来自 44px 帮助键。**接受**：属于可用性硬约束，结构与层级未变。
  - 胶囊和键帽从稿中的 32–40px 统一到 ≥44px，控制轨略高。**接受**，理由同上。
  - 相纸内容和角度差异来自合成 fixture 的 ID 与图片，不是布局算法变化（函数逐字一致）。**接受**。

## 三、逐区结论

| 区 | 结论 | 证据 | 说明 |
|---|---|---|---|
| Z1 页头 | 通过 | live-1440/390.png；after/default-*；help-1440 | 唯一 h1；导语准确；“?”为 44px，帮助弹窗讲清收录、本地删除、只读 MCP；「插件」是唯一主色按钮；没有重复标题。320 下插件按钮换到导语下方，可接受 |
| Z2 控制轨 | **返修（R2）** | after/search-empty-1440.png；`collection.css:46`；`DeskView.tsx:1327` | 同容器、吸顶、左右分区、双向同步、横滑都正确。**问题**：有搜索词时，“找到 N 条”以 `display:block` 插在搜索框下方，把搜索框顶高约 11px，与 Agent/本地删除键不再对齐，轨道变高（见 R2） |
| Z3 画布 | 通过 | live 实测；redesign 重跑；overlay 4 张 | 点阵与微光符合稿；高度随内容；无内部滚动；六宽底边检查通过。containerH 下限只测高度，不改坐标，接受 |
| Z4 分组签 | 通过 | after/expanded-1440.png；expanded-320 对照 | 键帽、6px 青色方点、等宽计数；荧光色条已去掉；展开态铅笔与签同高相接；长名省略，访问名完整 |
| Z5 相纸 | 通过 | after/*；motion 重跑 | 156×212、封面 118、分类 18、两行标题不变；投影和高光符合稿；悬停不缩放、不回正（动效专项断言）。悬停是 1px 满青描边，比稿略重，可接受 |
| Z6 动效 | 通过（以专项断言为据） | redesign 与 motion 重跑日志 | 入场只播一次、总长 ≤560ms；搜索/展开/延迟 workspace/首屏导入不重播；只有成功导入出现一次光圈，partial/失败为稳定提示；按下 3px；初始与运行中减少动效双向生效。本轮没有用肉眼录屏评价“质感”，只确认行为断言 |
| Z7 插件 | 通过 | after/extension-1440.png | 三步结构、路径省略与复制、配对码、危险撤销都在。状态条只显示“插件文件夹已就绪 v1.0.0”（接口真实数据）；没有显示“已配对 / 上次收录”，步骤序号不填色。缺口 19 保留。小问题见建议 S1 |
| Z8 Agent | 通过 | after/agent-1440.png | 机械暴龙兽 / 机械邪龙兽像素形象正确；只读说明和工具标签准确；文案只说复制，不说连接 |
| Z9 阅读器 | **返修（R1）** | collection-redesign-browser-frozen/reader-1440.png、reader-390.png；`collection.css:98-99` | 55/45 布局、手机上下排、缩略图条在弹窗内、15px 正文、radio 分段、OCR-only 默认都正确。两个疑点的结论（DOM rect 越界 ≠ 可见越界；fullPage 合成的 skip-link ≠ 焦点缺陷）**认同**，且没有把拍摄修正写成产品修复。**问题**：分类名较长时顶栏折行，1440 下「原帖」留在右上，「删除」「关闭」掉到第二行左侧，关闭键离开右上角（见 R1）。另有建议 S2 |
| Z10 空态 | 通过 | after/search-empty-*、empty-1440 | 两张错位虚线相纸、关键词、清除搜索、零收藏提示与「配置插件」都准确；读取失败与零收藏分开；axe 为 0（专项） |
| Z11 反馈 | 通过（以测试为据） | recycle 与 redesign 重跑 | 324/326 规则断言全部保持；partial/失败为稳定提示；未知结果只读核对、不重放。各类提示的视觉样式没有逐一截图核看 |
| Z12 响应式 | 通过 | redesign 重跑（六宽）；after/default-390；expanded-320 对照 | 手机两行控制轨，两个 44px 图标键保留访问名；横滑区域在视口或弹窗内，没有用页面 `overflow:hidden` 掩盖 |
| D1 文档 | 通过 | 01/02/03.md、SPEC.md 末段、issue-tracker:19、CURRENT 阶段索引 | 01/02 勾选都标了交接号，真实 Chrome 安装/使用仍未勾；03 只剩三项；SPEC 指向根 CURRENT；UI-ROLLBACK 已标历史；CURRENT 索引包含 320/322/324/326/328/331 |

断言调整三条（digital-world 标题、新建分组位置、recycle 选择器）逐条核对：都是跟随批准的位置和标题变化，没有删除用例、没有 skip、没有放宽业务规则。按键 3px 改为“5 秒内收敛到 3”而不是放宽容差，接受。默认并发下 controlled-execution 的偶发失败如实保留为开放项 20，根因未确认；本轮不处理。

## 四、返修清单（交 Codex）

| # | 级别 | 位置 | 复现 | 预期 / 实际 | 最小修正 | 复验标准 |
|---|---|---|---|---|---|---|
| R1 | 重要 | `src/collection.css:98-99`（`.collection-reader-bar` 设了 `flex-wrap: wrap`；`.collection-reader-category` 用 `overflow-wrap: anywhere`、`max-width: 100%`） | 隔离 fixture 中用长分组名（专项已有“长中文分组名称：用于验证单行省略与完整可访问名”）打开阅读器，1440 与 390 | 预期：分类标签单行省略，「原帖 / 删除 / 关闭」始终在同一行、关闭键在右上角。实际：1440 下分类占满首行，「删除」「关闭」掉到第二行左侧（见冻结图 reader-1440.png） | 分类：`flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis`，加 `title` 显示全名；操作组 `flex: none` 不折行；不动阅读器其他结构 | 六宽长名阅读器截图里关闭键都在顶栏右端；分类省略且有完整名；redesign 专项新增“顶栏单行 / 关闭键在右上”的断言 |
| R2 | 重要 | `src/collection.css:46`（`.collection-search-count { display:block }`）；`DeskView.tsx:1327` | 在 1440 输入任意搜索词 | 预期：派单 Z2 写的是“旁边显示”，搜索框与两个键帽保持同一水平中线，轨道高度不变。实际：计数插到搜索框下方，搜索框比两键高约 11px，轨道变高（见 after/search-empty-1440.png） | ≥781px：计数放在搜索框内右侧（输入框右内边距让位），或绝对定位在搜索框下方、不占文档流；≤780px 现有两行布局可保持，只要不推挤图标键。保留 `role="status"` | 1440/1024 有搜索词时，搜索框与 Agent/本地删除键中线差 ≤1px，轨道高度与无搜索词时一致；390 下不溢出；axe 为 0 |

## 五、建议（不阻断，Codex 可顺手修；不修需在交接里说明）

- **S1 插件弹窗双分隔线**：第 3 步下面的虚线和危险区上方的实线叠成两条线（after/extension-1440.png）。删掉第 3 步的底部虚线即可。
- **S2 缩略图“选中”与“悬停”难区分**：`collection.css:94-95` 中，悬停是青色边框，选中是青色边框加 1px 内描边，截图里两张缩略图看起来同样被选中（thumbs.png，第 1 张选中、第 8 张悬停）。建议选中态再加一个明确标记（如底部 3px 青条或去掉透明度差以外的强对比），悬停只提亮。
- **S3 搜索时分组胶囊消失**：胶囊取自过滤后的画布分组，搜索无结果时只剩「全部」。339 说明这是为了与画布一致，可以接受；如果常浩验收时觉得突兀，再考虑保留胶囊、显示 0。本轮不要求改。

范围外新功能问题：本轮未发现新的，v16-open-issues 19–21 继续保留。

## 六、唯一下一步

Codex 读取 CURRENT 与本交接，认领后修 R1、R2（S1/S2 可一并处理）；跑 redesign 专项、collection-browser、design-tokens 与必要的六宽截图，重建 dist 让 5178 静态采用，交 Claude 复验。复验通过后，再由常浩在 5178 一次性验收收藏。

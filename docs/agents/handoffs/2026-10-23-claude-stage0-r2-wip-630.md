# Claude 阶段 0 第二轮 · 中断交接 630（B 版定稿迭代 + 设计类型重做）

| 项 | 内容 |
|---|---|
| 状态 | WB-20261023-630，Claude 认领中。因上下文到 50%，中断并交给新会话继续，认领保留 |
| 范围 | 只改 `docs/design/ui-v18/` 下的视觉稿与说明；不改源码，不重启 5178，不写真实数据 |
| 基线提交 | `0f03467`（检查点）→ `c5b6dab`（第一轮两版稿）→ 本 WIP 提交 |

## 1. 用户 2026-10-23 第二轮决定（原话要点）

1. **基地和资产仓库都用 B 版。**
2. **左下角伙伴屏完全不改，这是用户最满意的设计，全站都要向它看齐。**
   - 伙伴屏指侧栏底部的 `button.partner`：高 86px 的液晶屏，季节每 15 秒轮换，数码蛋会滚动，下方说明行“秋 · 落叶 · 数码蛋”。
   - 第一轮 v18 把它换成了“72px 待孵化读数屏”，**这一改动作废**。
   - D5 里“季节改静态”的建议也**收回**，保持轮换。
3. **资产仓库的「设计」类型重做。**
   - 像素图：当前的粉色画框是 Codex 画的，用户觉得不好。
   - 录入结构：用户认为整体不对。

## 2. 已完成（本 WIP 提交）

- `docs/design/ui-v18/build/partner-mount.js`：在视觉稿里直接调用 `src/partner-lcd.js` 的同一个引擎挂载伙伴屏，参数与 `PartnerScreen.jsx` 一致。
  - 侧栏用 roam 模式：高度 ≥80px 时每点 4px。
  - 暴龙机用 stage 模式：14×15。
  - `data-start` 用来把截图定在某个季节。秋季从第 600 步开始，建议取 720。
- `build/run.sh`：已增加打包步骤，生成 `ui-v18/partner.js`（IIFE）。
- `build/data.json`：新增 `designExample`，作为示意，表示从收藏帖“6种像素风高级交互｜附提示词直接抄！”（10/15）孵化出的设计资产。
  - 封面：`coverUrl`。
  - 风格底座：3 条。
  - 招式：6 条，每条有名称和提示词，来自该帖的 GET 解析。
- `make.jsx`、`common.css`、`b.css` **尚未改**。当前生成的仍是第一轮的 A 版和 B 版。

## 3. 已定的设计细节（新会话直接照做，不用重新推导）

### 3.1 侧栏

- 把第一轮的 `eggscreen` 换成原版结构，样式原样拷贝：
  - 结构：`button.partner > span.partner-screen[data-season] > span.lcd-screen.lcd-roam > canvas[data-partner=roam][data-start=720]`，然后是 `span.partner-line > span.partner-season[data-season-label]`。
  - 样式：拷 `src/styles.css` 的 4947–4985 行（`.partner`、`.partner-screen` 及其 `::before`、`::after`，`.partner-line`），1188–1205 行（`.partner` 基础样式和 hover），以及整个 `src/partner-lcd.css`。
  - 下面接“已保存到本机”状态行。
- 删除移动端顶栏里的 `egg-mini`。
- 侧栏导航中捕获项后面的绿色待孵化数字保留。
- `common.css` 里我自定义的 `.lcd-screen` 要改名为 `.lcdx`，避免和原版 `.lcd-screen`（`position:absolute; inset:0`）冲突。HTML 里要引入 `partner.js`。

### 3.2 资产卡屏幕：改用伙伴屏的构造

- **屏幕外观**：
  - 圆角 10px。
  - 阴影：`box-shadow: 0 0 0 3px #1b2540, 0 0 0 4px var(--line-2), inset 0 2px 6px rgba(0,0,0,.35)`。
  - `::before` 叠点阵纹理：`radial-gradient(rgba(28,38,22,.16) .8px, transparent 1px)`，网格 4px。
  - `::after` 叠玻璃反光和扫描线：`linear-gradient(125deg, rgba(255,255,255,.22), transparent 40%)` 加 `repeating-linear-gradient(0deg, rgba(0,0,0,.06) 0 1px, transparent 1px 3px)`。
- **类型色调**（浅色液晶底 → 墨色）：

| 类型 | 色调 | 底色渐变 | 墨色 | 补充 |
|---|---|---|---|---|
| Prompt | 夏 | `#cfe6ee` → `#9cc6d6` | `#0f3442` | |
| 规则 | 春 | `#d4e8b0` → `#a9cc86` | `#213a12` | |
| 焚决 | 秋 | `#ecd6a4` → `#d1ad6c` | `#4a2408` | 火心 Y 改为 `#ff8a24` |
| 设计 | 暮粉 | `#f0d9e2` → `#d8aebd` | `#3a1626` | |
| Skill | 冬 | `#cfdbe6` → `#9fb3c4` | | |
| 工作流 | 淡紫 | `#ddd6f0` → `#b6aad8` | | |

- **图标**：
  - 用 `Pixel` 的 `palette` 覆盖：`color` 设为墨色，`--px-glyph-fill` 设为 12% 墨色；Prompt 的 L 改为 45% 墨色。
  - 尺寸 `fit=64`，即每个像素 4px。
  - 叠一层点阵遮罩：3px 方块，间隔 1px（`mask: linear-gradient(90deg,#000 3px,transparent 3px) 0 0/4px 4px, linear-gradient(#000 3px,transparent 3px) 0 0/4px 4px; mask-composite: intersect`）。
- **屏内读数**：“06 出战”的 LcdText 和进化阶段格都用墨色，未亮的格是 15% 墨色。
- **卡片容器**：参照 `.partner` 的做法，内边距 7 7 10，细边框，淡渐变底。屏下说明行仿 `.partner-season`，等宽 11px，例如“Prompt · 成熟期”。

### 3.3 设计类型新像素图（已定稿 B4：调色板，带内部拇指孔）

```
"................",
".....KKKKKK.....",
"...KKNNNNNNKK...",
"..KNOONNNNCCNK..",
".KNOWOONNNCWCNK.",
".KNNOONNNNNCCNK.",
"KNNNNNNNNNNNNNNK",
"KNNKKNNNNNNYYNNK",
"KNK..KNNNNYWYYNK",
"KNK..KNNNNNYYNNK",
"KNNKKNNGGNNNNNNK",
".KNNNNGWGGNNNNK.",
".KNNNNNGGNNNNNK.",
"..KKNNNNNNNNKK..",
"....KKKKKKKK....",
"................",
```

- 调色板颜色：K 是 `currentColor`，N 是 `var(--px-glyph-fill)`，O `#ff8a24`，C `#2bb8d6`，G `#6fae3a`，Y `#f2b53a`，W `#ffffff`。
- 在 `make.jsx` 里运行时注册为 `SPRITES.DesignV2`，设计类型的 glyph 改用它。源码 `pixel.jsx` 留到阶段 3 再改。
- 已否决的候选：画笔斜搭版（A）、样张版（C）、左侧缺口版（B2）、带笔版（B3）。

### 3.4 设计类资产的新录入结构

新页面 `资产仓库-B-新建设计.html`：在 B 版资产网格上盖一层右侧抽屉，宽约 760；390 宽时改为全屏。

- **头部**：“新建 · 设计”，加来源标签“从收藏孵化：6种像素风高级交互｜附提示词直接抄！ · 10/15”。
- **① 效果图**：放封面图，旁边是“+ 添加”格，最多 6 张。
- **② 基本信息**：
  - 名称：像素风 Dashboard。
  - 一句话：现代位图像素风：点阵数字、方块字、帧级跳变。
  - 交给谁：分段选择，〔编程 Agent 做界面 ✓〕〔ChatGPT 生图〕。
  - 标签。
- **③ 风格底座**：3 条，每次复制都放在最前面。
- **④ 招式**：6 行，每行是名称加提示词，带勾选框，勾选的会默认复制；下面有“+ 添加招式”。
- **⑤ 高级**（默认折叠）：附设计 Skill 包，可选。这一项保留 10/19 方案 C 的包能力。
- **⑥ 复制预览**：显示“风格底座 + 已勾选招式”拼好的结果，外层套什么话术由“交给谁”决定。
- **底部**：〔保存为设计资产〕。
- **网格里的设计卡**：
  - 有效果图的，屏幕显示效果图，同样叠玻璃反光和扫描线，外圈有描边；页脚写“底座 + 6 招式”，按钮是〔复制组合〕。
  - 真实数据里的“111”没有效果图，屏幕显示调色板图标，并写“还没有效果图”。
  - “像素风 Dashboard”是示意数据，README 要写明。
- **设计依据**：
  - 10/19 随手记：“设计复制使用可以单独做……卡片飘在空中，选中可以复制设计的提示词，引用使用”。
  - 收藏帖的结构本身就是“效果图 + 风格底座 + 招式”。
  - 现行实现的形态只有“Skill 包 / Prompt”二选一，没有效果图，复制固定套一层“ChatGPT 生图”话术。

### 3.5 基地 B 的看齐改动

- 暴龙机的液晶屏换成原版 stage 画布：在 `DigiviceArt` 的 children 里放 `span.lcd-screen.lcd-stage > canvas[data-partner=stage]`。
- A、B 两个端口的计数改成小液晶窗：沿用 `.lcdx` 的配方，底色用默认的 `--lcd-screen`。
- 存档槽：持笔数码兽放进小液晶屏，图案用墨色。
- 常用出战的图标放进小液晶方格。

### 3.6 清理与说明

- 删除 A 版产物：`基地-A.html`、`资产仓库-A.html`、`a.css`、A 版截图。它们在 `c5b6dab` 里留有记录。
- README 改写为第二轮：
  - 用户已选 B。
  - 伙伴屏是北极星，原样保留。
  - 写明设计类型的新结构和示意口径。
  - 写自检记录。
- 交接 631：CURRENT 写入者改为“无”，然后提交。

## 4. 第一轮踩过的坑（落地时注意）

- 收藏封面带 `Cross-Origin-Resource-Policy: same-origin`，本地文件页读不到。`shoot.mjs` 已经用 route 代取。
- `.b-port li > div` 的优先级会压过 `.b-hatch`，要写成 `li > .b-hatch`。
- 缩放暴龙机时，选择器必须用 `.digivice-art > svg`，否则会把屏幕里的像素图一起放大。
- 两行截断（line-clamp）的元素要加 `align-self: start`，否则会被网格拉高。

## 唯一下一步

新会话读本文件、ui-v18 的 README 和 CURRENT 头表，先给用户一份分批计划，确认后按第 3 节执行，完成后交 631。

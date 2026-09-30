# 云端交接｜D3 · R87-S1：使用次数数字滚动

分支 `cloud/2026-09-30-usage-odometer`（短名 usage-odometer）。执行者：Claude Code 云端会话，2026-09-30。云端副本，非权威。未改 CURRENT.md、COLLABORATION.md、AGENTS.md、CLAUDE.md，未写交接编号。

**结论：新测试改前失败、改后 2/2 通过。npm test 与浏览器脚本相对云端已知失败集增 0、减 0。visual 两次 problems 都是 []。滚动效果只经自动断言和静态截图检查，没有真人看过动效。**

## 一、基点

`main @ ce1f1f4`（已含切片 1.1）。

## 二、改动与理由

| # | 文件 | 改动 | 理由 |
|---|---|---|---|
| 1 | `src/components.jsx` | `Cover` 的 `uses` 改为用 `<Odometer value={uses} />` 渲染（仍在 `.cover-uses` 内），引入 Odometer | 设计 13.2 第 4 节“使用次数变化时，数字像里程表一样滚到新值”；卡片封面左下角次数是切片 1.1 的入口 |
| 2 | `src/AssetUsage.jsx` | “已使用 N 次”的 N 改用 `Odometer`；用 ref 记下同一资产上一次渲染时的次数，作为 `from` 传入 | 第一次使用时，文案由“从未使用”换成计数句，Odometer 是新挂载的；不传 `from` 就会直接出现 1，不会滚动。`from` 只在挂载时生效：打开已有 N 次的资产时 from = N，不会从 0 滚起。换资产时按 id 判断，不会从上一份资产的次数滚过来 |
| 3 | `src/styles.css` | ① `.cover-uses .odo-digit:not(.roll){overflow:visible}` ② `.asset-usage .odometer{display:inline-block}` ③ `.asset-usage .odo-digit{vertical-align:top}` | ① Odometer 每位带 `overflow:hidden`，会裁掉封面大号数字的辉光；只在静止时放开，滚动那一位仍需裁切。② 共享样式的 `inline-flex` 会让句子文本变成“已使用 \n1\n 次”（首轮实现即因此失败，见第四节）。③ 截图发现详情里的数字被顶高成上标：裁切的行内块以底边为基线，顶端对齐后回到同一基线 |

`src/Assets.jsx` **未改**：卡片已经把 `uses(a).count` 传给 Cover，读屏文字“使用 N 次”仍由卡片正文的 sr-only 提供，Cover 保持 `aria-hidden`。`src/Odometer.jsx` 与 `src/interaction.css` 未改：减少动态效果时直接显示新值、无旧数、无轻弹，完全沿用 Odometer 已有的 `prefersReduced()` 分支。

新增 `tests/usage-odometer-browser.mjs`（1440 宽，两种动效模式各用一份从未用过的演示 Prompt）：
- **正常动效**：连续复制两次（0→1、1→2），每次都用 MutationObserver 从复制前开始记录。断言封面 `.cover-uses` 与详情 `usage-count` 都出现过 `.is-rolling`，终值分别为 N 与“已使用 N 次 · 最近 …”，滚完后没有 `.odo-old` 残留。之后关闭详情，确认卡片封面为 2、读屏文字为“使用 2 次”。详情页和资产库各跑一次 axe。
- **减少动态效果**：同样复制两次，全程 `.odo-old` 与 `.is-rolling` 都没出现过；封面和详情的终值正确，静止时各只有 1 个 `.odo-digit`。跑一次 axe。

## 三、改动文件 SHA256

| 文件 | 改前（ce1f1f4） | 改后 |
|---|---|---|
| src/components.jsx | `04c800810c062e2370fd4f64a7a148821a498c4ff114d749ac12a4202ed83635` | `9add03bbbf1b1b713a671fa4b8fefbfe580bd5cac37fe7140521f8988a81b971` |
| src/AssetUsage.jsx | `5453bc209a3c946adca85e7fa1ef6be96d82223b0674d27ebb67146d9659d700` | `51bb01df9038d8ff5909c2165ab9877b593c8630042f834fc273ea0a22d7d5b7` |
| src/styles.css | `220058ff4c3f95045e38f0ab8b967d5d140e6fd0802ad3541b7ff0b79bddfb43` | `a34820224111a12b31d0f5d62f1fbba6adf9f202e5194da6a8c7667cec11cdcb` |
| tests/usage-odometer-browser.mjs | （新增） | `a20668d973ca4220213c76c8b3c56c63cc231ac2150523d5b83cc5f6d07b28fb` |
| src/Assets.jsx（未改，核对用） | `1535d67d1e490b51385f5450f1fd847168bc6d1b8e914e2c7aef622c82849a1a` | 同左 |
| src/interaction.css（未改） | `167bbc6b7eb0b30e63be1fb59e8e97b8f17a441d37f89c872e38bc2203b038b8` | 同左 |

## 四、失败测试首跑（改代码前）

`cloud-usage-odometer-logs/new-test.first-fail.txt`：exit 1。前面的数值断言（封面 0→1、详情“已使用 1 次”）都已通过，在第 95 行失败：`AssertionError: 第 1 次：封面数字没有滚动（未出现 .is-rolling）`。

实现过程中的中间失败（未改测试）：第一版实现断言详情文本时失败，实际值为 `'已使用 \n1\n 次 · 最近 …'`，由共享的 `inline-flex` 造成。修复方式是改产品样式（第二节 ③-②），没有放宽断言。改后结果见 `new-test.after.txt`：2 passed，exit 0。

## 五、验证命令与首次结果

每条命令前都先执行 `export NVM_DIR=/opt/nvm; . "$NVM_DIR/nvm.sh"; nvm use 24`（Node v24.21.0）；运行前已 `npm run build`。

| 命令 | 首次结果 | 对照已知失败集 |
|---|---|---|
| `node tests/usage-odometer-browser.mjs`（改前） | 失败，见第四节 | 新测试 |
| 同上（改后） | 2/2 通过 | — |
| `timeout 1200 npm test`（`npm-test.first.txt`） | tests 427 / pass 402 / fail 19 / cancelled 1 / skipped 5；`rule-templates.test.mjs` 照常挂满外层超时 | 失败项与切片 1.1 日志（`cloud-slice-1.1-logs/03-npm-test.txt`）的 “failing tests” 列表逐条 diff 相同。**增 0、减 0** |
| 31 个浏览器脚本各 1 次（4 个基础脚本 + 27 个 `*-browser.mjs`，含新增 1 个；`browser-summary.first.txt` 与各 `browser-*.txt`） | 27/31 通过。失败 4 个：agent-config、rule-templates（TimeoutError）、rule-templates-fix、search（`palette-cold 1050ms > 500ms`） | 均在已知 5 项内，**新增失败 0**。interaction 本轮通过；它是已知时序项，不算修复 |
| `node tests/visual.mjs usage-odometer`（`visual.first.txt`） | exit 0，`problems: []` | — |

**全量回归之后又改了一处样式**（第二节 ③-③，截图时发现的基线问题），所以对相关脚本和 visual 补跑了一次（`rerun2-*.txt`、`visual-2.txt`）：

| 命令 | 首次结果 |
|---|---|
| usage-odometer / usage / assets-pin / r87-fix / accessibility / browser | 6/6 通过 |
| interaction-browser | **失败**：`matrix(1, 0, 0, 1, 0, 2.98945)`，期望位移 3。与 §3.6 所记已知时序项（按下后 150ms 位移约 2.93）同一断言、同一原因，这次改动没碰按钮按下样式。未重跑，如实记录 |
| `node tests/visual.mjs usage-odometer-2` | exit 0，`problems: []` |

补跑后 npm test 没有重跑。这次改动只动了一条 CSS，npm test 中依赖构建产物的只有 `digital-world-ui.test.mjs`，上一轮它已通过；这一点是判断，没有实测。

## 六、需要真人确认的视觉点

截图在 `cloud-usage-odometer-shots/`，共 4 张，都是改动 ③ 之后重拍的：
1. `1-normal-rolling-card-and-detail.png`：正常动效，封面进入滚动态约 150ms 时的整页。背后的卡片被抽屉遮罩模糊，看不清滚动过程，**需真人看动效本身**：0.45 秒的翻动节奏，以及封面大号数字（30px，列表布局 20px）翻动是否自然。
2. `2-normal-detail-settled.png`：详情“已使用 1 次 · 最近 …”，数字已与句子同一基线。请确认滚动时这一行的高度不跳动。
3. `3-normal-card-settled.png`：卡片封面左下角的“1”。静止时辉光不被裁切，**请确认辉光与切片 1.1 一致**。滚动中那一位会暂时裁掉辉光（约 0.45 秒），属于有意取舍。
4. `4-reduce-after-copy.png`：减少动态效果模式复制后的整页。

## 七、未完成项与风险

- 首次使用时，详情从“从未使用”换成“已使用 0→1 次”的滚动，是用 `from` 模拟出来的，句子本身是瞬间替换的。设计没有规定这一过渡，请真人判断是否可接受。
- 卡片在“最常用”排序下，次数 +1 可能导致卡片换位；按 `key={a.id}` 保持组件，滚动不受影响。但换位本身没有动画，这不在本任务范围。
- 滚动态检测依赖 Odometer 约 460ms 的 `is-rolling` 类名。机器极慢时 MutationObserver 仍能捕获类名变化，风险较低。
- 云端只跑了 1440 宽。窄屏由 assets-pin（390 宽无溢出）与 visual 间接覆盖，没有专门的窄屏断言。
- 本机（macOS）合入后仍需重跑相称回归。

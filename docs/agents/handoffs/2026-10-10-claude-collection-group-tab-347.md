# Claude 收藏分组签“索引签”精修 347（2026-10-10）

输入状态 / 输出状态：WB-20261010-346（写入者无）→ Claude 认领 347 → 本交接回读后写入者无。

执行者 / 本轮范围：Claude。常浩截图指出：画布上分组签（如“AI工具 · 3 条笔记”）离本组帖子堆太远、看不出关联，要求“关联性强、不遮挡、美观”。按“先给选项”的约定，在只读无头浏览器给真实 5178 注入临时样式，出 4 个方向（A 索引签 / B 信号线 / C 底座铭牌 / D 扫描框）的对比图。常浩先选 B，Claude 实现并通过回归后，常浩改为指定 **A 索引签**；B 已整体撤回（源码、样式、测试断言均不保留）。

## 设计（A 索引签）

- 分组签贴在**本组折叠堆的最高处**上方 8px：上圆角 8px、下角 2px，底边 2px 青色并向下微微发光，像文件夹索引签插在这一叠上。
- 帖子堆有随机偏移与 ±14° 旋转，各组堆顶高度不同，固定上移量会让某些组的签压到帖子或离得很远。因此在 `buildOrganized` 中按本组每张卡的折叠位置与旋转求外接框最高点（`stackTop`），签上沿 = `stackTop - 44 - 8`。签位置只依赖折叠堆参数，展开某组时签不跳动。
- 0 条笔记的空分组沿用原位置（`cy - 155 - 32`）。

## 改动文件

| 文件 | 改动 |
|---|---|
| `src/collection/app/components/DeskView.tsx` | 新增常量 `GROUP_TAG_H = 44`、`GROUP_TAG_GAP = 8`；`GroupLabel` 增加 `tagTop`；`buildOrganized` 每组先算折叠堆参数（`stackAngle/stackRadius/stackY/stackRot`）并求 `stackTop`，折叠分支复用这些值（卡片位置、角度、z、呼吸与原公式等价，仅消除重复）；分组签容器 `top` 改用 `tagTop`。`label.y`（拖放区、画布高度）不变；拖拽、展开、回调不变 |
| `src/collection.css` | `.collection-group-controls` 去掉 `translate: 0 -32px`；`.collection-group` 底边 2px 青色、圆角 `var(--r-s) var(--r-s) 2px 2px`、青色下发光阴影替换原键帽阴影；`.is-expanded` 圆角相应改为 `var(--r-s) 0 0 2px` |
| `tests/collection-redesign-browser.mjs` | `groupLabelChecks` 默认态新增断言“347 index tabs sit right on top of their own stack”（签底到本组首帖 ≤12px）；原 R3 断言（≥4px、不压任何帖子）保留 |
| `dist/` | 重新构建（5178 直接读 dist，即采用） |

改后 SHA256：collection.css `1d69e4f4…a433`；DeskView.tsx `006cbc78…256c`；redesign 测试 `bf777da5…7952`。前像：`evidence-2026-10-10-claude-collection-347/collection.css.before`、`CURRENT.md.before`、`dist-before/`（含 `dist-before.sha`）。DeskView 与测试未单独复制前像，可按上表逆向回退。

## 验证（最终版本）

| 项 | 结果 | 证据 |
|---|---|---|
| `npm run build` | 通过 | — |
| `npm test` | 1196/1196 | `evidence-…-347/npm-test.log` |
| `tests/collection-redesign-browser.mjs`（六宽、44px、axe、R1/R2/R3 + 347 新断言） | 通过；六宽 12 组合成画布默认态签到本组首帖 7.5–8.4px，签与任何帖子交叠 0；展开态 34.9–61.7px | `redesign.log`、`redesign/geometry.json`、`redesign/*.png` |
| `tests/collection-browser.mjs` | 通过 | `collection-browser.log` |
| `tests/collection-recycle-browser.mjs` | 通过 | `recycle.log` |
| 5178 采用 | 首页及 index js/css 与 dist 逐字节一致；只读（拦截非 GET）回读：签到帖子 8.5px，展开态签原位、编辑键贴合 | `dist-after.sha`、`live/*.png` |

未执行：未重启服务（静态资源无需重启）；未跑其他页面专项浏览器回归（本轮未触及）。

## 边界

- 主库、收藏数据、真实 Agent/Vault 未写；测试前后工作区未跟踪文件集合不变。未提交、未推送、未安装依赖。
- 本轮不是 344 的复验：R1/R2/S1/S2 的 Claude 复验仍待做；R3 的签位置由本轮改为“按堆顶贴近”，复验时以本轮为准。

## 唯一下一步

常浩在 5178 刷新收藏页目视确认索引签；之后 Claude 完成 344 其余复验，常浩一次性验收收藏。Codex 下次接手先读本交接（dist 与 buildOrganized 已变）。

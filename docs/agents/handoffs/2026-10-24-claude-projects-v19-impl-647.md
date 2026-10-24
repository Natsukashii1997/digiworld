# Claude｜项目空间 UI v19「4-1 交接条」落代码（2026-10-24）

```text
输入状态 / 输出状态：WB-20261024-646 → WB-20261024-647（认领）→ WB-20261024-648（本交接）
执行者 / 本轮范围：Claude。用户 10-24 改为「你自己做吧，快一点」，派单 646 由 Claude 直接实现，不交 Codex；按派单 646 + 方案 04-projects-impl-plan.md 四批连续做完
改动文件及结果：见「二」；未提交、未推送、未发布
验证命令、通过/失败/未执行及证据：见「三」
运行服务是否采用 / 真实数据是否变更：否 / 否（隔离数据目录 + 5188/5189 临时服务，用完已停；未访问正式 5178，未写 data/）
未完成项及风险：见「四」
权限与禁止事项：发布 5178、推送、真实数据写入均未授权
唯一下一步 / 建议接手者：用户看对比图确认后，Claude 只提交本轮文件；之后再做设置页 v19 选版
```

## 一、用户决定（本轮遵循）

- 交出按钮每次一次完成，不再强制先看口令；口令全文默认收起，点开在框内固定高度、右侧滚动条下滑（10-24 本会话原话「口令全文不需要一直展开，侧边可下滑。按钮每次一次完成」）。
- 原会话转述过「先预览规则选 A」，与本会话用户原话不一致；本轮按本会话原话做。若要改回 A，只动 `ProjectLaunch.copy()` 开头一处判断。

## 二、改动

| 文件 | 内容 |
|---|---|
| `src/ProjectsV16.jsx` | 删 `SaveCard` 三列大卡与 `RelayLaunch` 发车条；新增 `SlotCart`（卡带：头像 + SLOT + 名字 + 一盏灯，tablist，左右键切换）、`ReadScreen`（读档屏：立绘 + 对话框下一步 + 交接条，底部 `ActivityLanes` 30 天双轨与 `ReadStats` 读数列）、`ProjectLaunch` 改为常驻对话框 + 交接条。页头改为页内一行（标题 + 三个液晶数 + 上次读取 + 刷新 / 设置，`?` 帮助在标题旁）；库按稿重做（用户看实页后指出）：标题行 = LIBRARY + 全部项目 + 液晶数 + 扫描状态与重新扫描；右侧来源切换（液晶数）与搜索框；两个分区面板并排；每行 = 来源 | 名称 + 短路径（家目录写 ~）| 更新时间 | 开新档 / SLOT / 仅展示，「手工登记」收进悬停提示，「身份待确认 / 本次未检出」仍显示；四个折叠组一行四片 + 下方展开区；队伍读数打开弹层放 `SlotDesk`；读不到时收件在屏内摆出来 |
| `src/projects-v16.css` | 重写存档区、读档屏、交接条、双轨、读数列、库标题行与折叠片、390；开新档常显；颜色 / 圆角 / 字号全部用令牌 |
| `src/ProjectStatus.jsx` | 只给 `CHECK_LABELS`、`checkText` 加 `export`（读数列体检点复用同一判读） |
| `tests/projects-v16-browser.mjs`、`projects-freshness-browser.mjs`、`project-pending-refresh-browser.mjs`、`ui-v14-projects-browser.mjs` | 选择器与流程改成新交互（见「三」） |
| `tests/ui-v14-checks.mjs` | `geometry` 越界检查对 `.projects-v16 .pj-slots` / `.pj-lscroll` 横滑容器内元素放行（同 `.page-agents.v16 .cast` 的既有做法） |

业务语义（方案 §3）保留情况：复制前重读项目状态与工作台、核对来源 / 目录指纹 / state_id / 收件装备手填下一步，不一致不复制 ✔；collabLog 留痕与补记 ✔；`/relay-sessions/open` 与「打开应用未确认」✔；默认伙伴 = 写入者、认不出时 Codex ✔；三条 `SourceReadError` 横条在卡带槽下方 ✔；开新档 = 标为在推进、飞入空槽 ✔。变化：①先预览改为一次完成（用户决定）；②不一致时页面已换成最新内容，提示「看过后再点一次交出」；③读取失败时保留上次内容、交出停用（原为整卡「继续」停用）。

有意偏离稿：控件统一 ≥44px（稿伙伴头像 40、图标键 32、主按钮 42）；稿里 faint 色小字（上次读取、SLOT 编号、路径、名牌英文、日期刻度）对比度不达标，改 muted；字号映射到令牌（下一步 18px → `--fs-title` 16px，390 为 `--fs-read` 15px）；卡带名与屏标题超长时换行而非省略号（项目几何检查禁止 overflow 截字）；390 卡带条不用滚动吸附，改为选中后主动滚到可见处。

## 三、验证

- `npm run build` 通过；`npm test` 1550 / 1550 通过。
- 浏览器回归（夹具隔离数据）：`projects-v16-browser`（四伙伴一次交出与 start 留痕、口令全文默认收起且框内下滑 ≤220px、复制后打开一次完成、换卡带重读、重读不一致不复制、复制失败不开 App 不留痕、慢设置草稿、详情四块、队伍弹层、读取失败停用交出、开新档 revision、回执丢失同 ID 补记、四态 × 七宽几何 / axe / 44px、390 交接条吸底与读不到不吸底、双轨格上次数与 daily 一致、长内容、减少动态效果）、`projects-freshness-browser`、`project-pending-refresh-browser`、`ui-v14-projects-browser` 全部 PASS。
- 另 14 份引用过旧选择器的浏览器脚本（agents-v16、ui-dispatch155/151-data、agent-continuity、collab-snapshot、ui-layout564、savepoints-v16、project-status、ui-v14-collab、collab-v16、ui-refine358/351、projects-brief、collab-board）在改动前代码 f247ecd 上同样全部失败（临时导出副本实跑），属既有失效，本轮未动。其中 `project-status-browser` 等的是项目页 `.page-heading`，本轮去掉了项目页的全站页头，以后修这份脚本时要一起改。
- 对比图（本机证据，不进仓库）：`docs/agents/handoffs/evidence-2026-10-24-claude-projects-v19-647/对比-1440-首屏.png`、`对比-1440-口令全文.png`、`对比-390-首屏.png`（稿 / 改前 f247ecd / 改后），同目录有四份回归日志与 npm test 摘要。隔离数据里 30 天活动读不到（目录身份校验在副本里不成立），所以改后图的双轨是斜纹；有数据时的格子由回归里的夹具覆盖。

## 四、未完成与风险

- 未提交：等用户看对比图。提交只带「二」里的文件 + 本交接 + CURRENT。
- 「停滞变暗飘 zzz」保留现版做法（卡带变暗、屏头 zzz），稿里没画。
- 14 份既有失效的浏览器脚本建议另开一轮清理。

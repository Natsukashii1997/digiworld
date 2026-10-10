# Codex 认领 256｜UI 终审纠偏

- 输入状态：`WB-20261007-255`，读到当前写入者“无”；用户指出终审未发现问题，要求继续审查和优化。执行者：Codex，唯一工作区为本项目目录。
- 基线：`HEAD=15dd5ba70877180fcf251150cb460e5dfda4ba4c`；既有大量未提交与未跟踪文件原样保留。目标文件写前 SHA：`settings-v16.css=516e4f4f88495318391ee72594f80428f91752424f96c83c16651654157854f5`、`knowledge-v16.css=2d944e47bd64359b0239059e0e16ecf0d824eb72c83c9fcbaaa3af22431a689b`、`styles.css=5709cdd2527bbe73caf358e7acd9a9d037dcdb4b6f5782ed13dd88da622a672c`、`tests/visual.mjs=082e2b53e6479719f86855bdffd89ff89d17e189042d08ce19c81077c7cd605e`。
- 范围：修正有实证的 1024px 设置表格断裂、移动知识页与获批一排 Agent 排列不符、承载信息的小字低对比度；核对横滑标签提示和现有协同空态；补有意义的回归断言。设计稿自身需重选方向的事项只形成建议，不擅自改变。
- 预计写入：`src/settings-v16.css`、`src/knowledge-v16.css`、必要的页内 CSS 或令牌、受影响 `tests/`、`dist/`、本轮证据与交接、`CURRENT.md`。扩大范围前核对认领并记录。
- 10:45 范围落实：为在四兽一排下保留可读状态，将调整 `src/KnowledgeV16.jsx` 的移动端状态短文案与完整可访问名称；信息文字对比度局部调整 `src/home-v16.css`、`src/night-v16.css`、`src/notes-v16.css`，不改全局 `--faint` 装饰令牌。补 `tests/ui-final-254-browser.mjs` 与 `tests/visual.mjs` 的获批排布和设置表格几何断言。写前 SHA 分别为 `61afd0f4…cb4f523`、`d72955db…9827072`、`d9434b3c…41982d3`、`e61f00c6…6f7fda`、`10ad39f5…f29af52`；详见本轮证据清单。
- 11:00 审计覆盖扩展：为纠正“138 张默认空态图代表全站视觉”的过度结论，只给现有隔离浏览器脚本增加合成满态截图：`tests/aihot-v16-browser.mjs`、`tests/silver-v16-browser.mjs`、`tests/knowledge-v16-browser.mjs`。不改变数据和产品行为；完整内容态还复用日历、协同、存档点现有专项截图。三文件编辑前再次核对 SHA 与认领。
- 11:06 动效复核扩展：`src/home-v16.css` 中未定义 `--t-med` 使悬停过渡失效；`src/CollabV16.jsx`、`src/NightV16.jsx`、`src/NightV2Results.jsx` 的三处 JS 平滑滚动未尊重减少动态效果。修复属于既定动效/微交互审计，不改变流程。补首页计算后过渡断言与滚动偏好定点验证。写前 SHA：Collab `87426178…8bde66`、Night `d55b8ff9…59ceba`、Results `1fdcb3c1…5065f10`、首页浏览器测试 `cb119eb2…cc5d4c`。
- 11:06 第一轮全量单测首败：`1043/1044`，唯一失败为 `knowledge-v16.css` 新写的两处 `font-size:12px` 违反根令牌约束；证据在本轮 `regression/npm-test.log` 与 `unit-result.json`。后续用 `var(--fs-small)` 修正，不放宽测试。
- 11:10 内容态复核扩展：协同 390 自动横滑后泳道头像和参与者名随大图滚走，违反已批准简报“泳道头固定在左”；修 `src/CollabV16.jsx`、`src/collab-v16.css`，补 `tests/collab-v16-browser.mjs` 中初始与二次横滑的固定几何断言。日历内容态 fixture 仍填旧 `night.time/end` 而产品读取 `nightV2.window`，更正 `tests/calendar-v16-fixture.mjs` 并验证日历 19:00 夜巡窗口。新增文件写前 SHA：CSS `76257e6f…2e819`、Collab 测试 `cb77f48f…3a004`、日历 fixture `96bfb31f…ac182`、日历测试 `1c0953ba…fc809`。
- 后续证据边界修正：`tests/savepoints-v16-browser.mjs` 原 `commit-*` 图在确认框关闭后拍摄，新增确认框仍打开时的 `commit-preview-*` 图，不改变存档行为。`tests/aihot-v16-browser.mjs`、`tests/silver-v16-browser.mjs`、`tests/knowledge-v16-browser.mjs` 的满态图与既有日历、协同、存档点内容态一起复核。
- 协同二次视觉复看发现固定泳道头像叠压 320 满态及 390 异常态的站点圆环/过关结果。按已批准移动端简报为左侧固定泳道头加入独立遮罩区，并将自动定位点移到右侧可读区；`tests/collab-v16-browser.mjs` 增加当前站与固定区的间距断言。
- 再次视觉复看指出初版 180px 固定区在 320 下只剩当前一站，交接上下文不可见；故中止刚启动的全量回归（已通过单测，浏览器只完成早期入口，未作为最终结果）。最终修正为 320px 的 90px 头像/角色短名栏、390px 的 170px 全名栏，并把当前站向右定位，让当前站与前一站同时可见；四张终态图和 `tests/collab-v16-browser.mjs` 复核通过。中途两次几何断言失败保留在 `targeted/collab-context*`，没有降低站点间距断言。
- 验证：隔离合成 fixture、目标尺寸几何/截图、构建、相关专项、全量单测及浏览器入口、视觉脚本；最终核对运行采用和各层验收边界。此前 255 的 `VISUAL_PASS` 不能代表内容态和常规动效完整获奖级复审。
- 边界：不重置、stash、提交、推送、安装依赖、读取私人数据或启动真实夜巡；不代替 Claude 或用户签署验收。若共享状态或目标文件出现未知并发变动，停止业务写入。
- 用户本轮明确答复：学习成长沿用已确认的 v14，只修可复现缺陷；“每页最新版”按各页当前获批版本核对，不将该页自行升级到 v16。
- 唯一下一步：按获批视觉权威修复已复现缺陷并重新取证。

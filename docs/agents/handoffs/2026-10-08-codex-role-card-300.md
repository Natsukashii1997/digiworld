# 智能体群固定角色卡 UI 交接 · WB-20261008-300

- 输入 / 输出：`WB-20261008-297` → 认领 `298` → 相关旧测试扩围 `299` → 交接 `300`；Codex 单写。常浩要求角色详情成为一个固定尺寸的卡片，左侧数码宝贝形象、右侧档案信息，切换四标签或伙伴时不再忽高忽低，并整理整体视觉。
- 根因：原 `.archive` 双列自动行高由右侧不同标签的内容撑开；左 `.stage` 跟随整行伸缩。修复后桌面使用统一 560px 外框、固定左形象舱和右信息舱；四个标签等宽，右侧内容在卡内独立滚动。≤640px 在同一个 680px 外框中改为上形象、下信息，避免窄屏挤压。切换伙伴或标签时，信息舱回到顶部。档案字段在桌面按整舱分布，手机按自然行高紧凑排列。
- 修改范围：`src/AgentRoles.jsx`、`src/agents-v16.css`、`tests/agents-v16-browser.mjs`；另修正 `tests/silver-agents-browser.mjs` 一条仍寻找旧默认“手动写一段”的断言，改查当前真实入口“上下文接力”，不改接力功能。无服务端、权限、主库和其他项目状态变更。
- 合成浏览器：五伙伴 × 四标签 × 1440/1100/760/390/320px 的外框、形象舱、标签行、信息区坐标和尺寸全部保持在 1px 内；长 128 Skill 清单右侧内滚到末尾、键盘 End 可滚动、切标签复位；44px 与 axe、原接力流程均通过。专项 `node tests/agents-v16-browser.mjs`、`node tests/ui-v14-agents-home-browser.mjs`、`node tests/silver-agents-browser.mjs`、`node tests/agents-inventory-browser.mjs`、`node tests/agent-config-browser.mjs` 通过。复核者另以合成浏览器确认 390/1440px 抽屉与弹窗未被卡片裁切，关闭后焦点与滚动位置保留。
- 完整验证：`npm run build` 成功；`npm test` **1176/1176**；`node tests/visual.mjs role-card-300` **138 张截图，`problems=[]`**。本轮重点截图：[桌面档案](../../../test-results/agents-role-card/1440-档案.png)、[桌面内容](../../../test-results/agents-role-card/1440-内容.png)、[手机档案](../../../test-results/agents-role-card/390-档案.png)、[手机内容](../../../test-results/agents-role-card/390-内容.png)。截图及视觉复核不代签常浩的真人视觉验收。
- 首次失败保留：长清单测试最初在异步加载完成前查第 128 条，补等待后通过；相关旧测试曾寻找已非默认入口的按钮，按当前真实入口修正后通过；新增键盘滚动测试最初同步读取 `scrollTop`，浏览器平滑滚动尚未完成，改为等待滚动发生后通过。没有把测试失败当作产品故障，也没有删除原接力断言。
- 运行读回：本机 `http://127.0.0.1:5178/` 返回 200，HTML、JS、CSS 与本轮 `dist` 逐字节一致；实际服务页面 1440px 四标签均为 `1144×560`，390px 四标签均为 `358×680`，位置亦不变。真实 `data/CURRENT.json` SHA256 `a2b7dde77bf2407849df3d0b5c5f35c48a1a91dafa694ec93d9d0f144f4790ec`，与开工前一致。未提交、推送、重置、暂存或安装依赖。
- 成果指针 SHA256：`src/AgentRoles.jsx` `73b3293f757fa1ff9f889085de3fcd978b7d255c95b4f990562ceca904ca548d`；`src/agents-v16.css` `f7769d7c7696e87afd8521a92eacfed3666b00ab7009caa2e6362b5bd2c088a2`；`tests/agents-v16-browser.mjs` `31b2502fbfc5a0353a63414ec0851552d0ed9431bd3c793c97207449802414ad`；`tests/silver-agents-browser.mjs` `d689b2423fe05c6fbd3ec936e5f494facedb9483014e67cf3f55907d48ad72e8`。
- 唯一下一步：常浩刷新原工作台，在“智能体群”选择任一伙伴并切换“档案 / 内容 / 体检 / 配置”，确认这张统一卡片的视觉与实际阅读手感；目前工程验证和运行版本采用已完成，写入者释放为“无”。

# 云端交接 · 路线 v3 切片 1.2（导航两区重排）

- 执行：Claude Code 云端会话（云端副本，非权威）。未改 CURRENT.md / COLLABORATION.md / AGENTS.md / CLAUDE.md，不写交接编号。
- 基点：`main @ ce1f1f4`（已含切片 1.1）；分支 `cloud/2026-09-30-slice-1.2`，已推送；未开 PR、未推 main。
- 环境：Linux / root，Node v24.21.0（/opt/nvm），`PLAYWRIGHT_MODULE=playwright`，chromium-1234。
- 依据：产品定义 v1.2 §2（结构与导航）、§3.5、§4.8；路线 v3 切片 1.2 与 5.2–5.5；问题共识基线 v2.2。
- 未改：`server/`（含 `server/config-file.mjs`，前后 SHA256 均为 `2b941992…c53b`）、`package.json`、`package-lock.json`。

## 一、改动与理由

| # | 改动 | 理由 / 说明 |
|---|---|---|
| 1 | **侧栏四段**。`src/pages.js` 新增 `ZONES`：今日 / 工作区（资产、目标、运行、知识）/ 生活区（生活）/ 系统。`App.jsx` 按区渲染，每区是 `role="group"`，`aria-label` 为区名。工作区、生活区、系统显示区名与英文小字（视觉用，`aria-hidden`，读屏靠 group 的 label）。生活区开头加一条 `role="separator"` 分隔线。只有工作区保留“资产 / 目标 / 运行 / 知识”小分组标题；只有一个分组的区不重复显示分组名。`GROUPS` 增加“生活”。 | §2.2。`PAGES` 的数组顺序就是侧栏顺序，页面编号按新顺序重排（00–14）。 |
| 2 | **三个改名**：知识中枢→知识仓库、逆向参考→逆向工程（eyebrow 改为 REVERSE ENGINEERING）、随手速记→随手记。导航、页头和面包屑都读注册表，一并生效；搜索浮层的“去知识中枢查询”改为“去知识仓库查询”。 | §2.2。`src/` 中已检索不到旧名。 |
| 3 | **版本归档下移**：注册项移到系统分组，排在模型设置之后，是侧栏最后一项。**资产详情“历史”标签**：抽屉里原有一个“版本记录”标签，渲染的就是 `AssetHistory`，这次把它改名为“历史”，没有另加一个重复的标签，也没写新的历史逻辑。 | §2.2 / §3.1。已有同功能的标签，再加一个“历史”会让同一内容出现两个入口，所以选择改名。**请真人确认**这样处理是否符合预期。 |
| 4 | **能力体检并入智能体群**。注册项保留，但加了 `navHidden`、`mergedInto: "agents"`、`anchor: "agent-health"`，侧栏不再显示。智能体群页底部新增“能力体检”分区（`#agent-health`），显示原规划内容（`PlanDetails`，从 PlannedPage 导出后复用），标“规划中”。`resolveRoute()` 负责把旧地址改写到新位置：打开 `#health` 时，地址用 `replaceState` 改成 `#agents`，页面滚到该分区，焦点移到分区上（`tabIndex=-1`）。站内跳转（搜索浮层选中“能力体检”、结构地图等）走同一逻辑。分区里“现在可以怎么做”去掉了指回智能体群本页的链接，只保留“去资产仓库核对”。 | §2.2 / §3.2。这样没有死链，也没有无效按钮。 |
| 5 | **生活区**：日历、随手记归入“生活”分组。新增 AI HOT（`#aihot`）、学习成长（`#learning`）、银饰计划（`#silver`）三个页面，沿用 `PlannedPage` 和 `maturity: "planned"`。“将来会做什么”“路线位置（v3 5.3/5.4/5.5）”“需要的授权”三部分按 §4.8 如实写，没有假数据，也没有无效按钮（只有说明）。日历的规划文字补上 todo（提醒事项），路线位置更新为 v3 5.2。NAS 照片不进导航。 | §2.1、§3.5、§4.8。图标用 lucide 的 Newspaper、GraduationCap、Gem。 |
| 6 | **世界总览结构地图**改为两区：工作区四张卡、生活区一张卡；下方“系统”两项并排（模型设置、版本归档）。能力体检不单列，改在“智能体群”一行的说明里注明“含能力体检（规划中）”。 | 任务 6。说明文字这样写，是因为现有测试要求每个页面名都出现在首页上（见四、首跑说明）。 |
| 7 | **窄屏**：≤960px 抽屉里的导航项最小高度改为 44px（桌面仍是 38px，未改）。 | 任务 6 的 44px 要求。原来抽屉项只有 38px。 |
| 8 | 样式：新增 `.nav-zone*`、`.nav-divider`、`.map-zone*`、`.system-rows`、`.agent-health`，都用现有设计令牌。 | — |

### 测试改动说明（只改名称或随结构更新，不删断言）

- `tests/search-browser.mjs`：“去知识中枢查询”改为“去知识仓库查询”，日志文字同步。
- `tests/browser.mjs`、`history-browser.mjs`、`workflow-browser.mjs`、`skill-source-browser.mjs`、`history-capacity.mjs`：“版本记录 N”改为“历史 N”，共 16 处，只替换名称。
- `tests/digital-world-ui.test.mjs`：
  - `GROUPS` 的期望值加入“生活”（结构本身变了）；
  - 结构地图覆盖检查排除 `mergedInto` 页，也就是不再单列的能力体检；
  - 规划页检查从 3 个扩到 6 个（加入 aihot、learning、silver），这是增加断言。
- `tests/accessibility.mjs`、`tests/visual.mjs`：路由表加入 aihot、learning、silver，扩大覆盖。
- 新增 `tests/nav-zones-browser.mjs`，共 8 组断言：
  1. 四段分区与顺序、区名可见、分隔线位置、版本归档在最后、旧名与能力体检不在导航中；
  2. 三个改名同时出现在导航、页头、面包屑和搜索浮层；
  3. 版本归档页可达，“历史”标签里能查看和比较版本；
  4. `#health` 与搜索浮层都能落到分区：焦点、视口位置、地址改成 `#agents`、没有无效按钮、axe；
  5. 生活区三页可达、标“规划中”、没有无效按钮、axe；
  6. 首页结构地图分两区、能力体检不单列、首页各区块只出现一次；
  7. 用 Tab 键能到达版本归档，按回车能打开；
  8. 390 宽：抽屉四段、44px、多个页面无横向溢出、axe、选中后抽屉关闭。

## 二、改动文件及 SHA256

| 文件 | 改动前（ce1f1f4） | 改动后 |
|---|---|---|
| src/App.jsx | 69471169febc25323362c1fd574ae817a14b3e306e8493022c1fc982b321fa98 | 4ec1df86634f1fc8bdecbbc3d48cc74ee6063eafaeb66a542df92d8bb0c451ed |
| src/Assets.jsx | 1535d67d1e490b51385f5450f1fd847168bc6d1b8e914e2c7aef622c82849a1a | 81ca656f57df3c19cbf81a28c0bc92cd446aa074047c6e44048c67fba0c06139 |
| src/DiscoveryPages.jsx | 671a4d6a16c8f271db12cf348b74215dab0d1d205367ff18c76696c99a11efa1 | 85c5052f865333c4b04369e230963a1cbc6f17e2c3d5d02447ec3ac115cb4bf5 |
| src/Home.jsx | 0556a6fe2b2c8806961f10f0368353dc231867ebd4387d22ab8ec3bfcf5b2217 | 50ae55ec3a57d2c0307589c0a1a47f64f3e6e15b33b07ad2cab628f13884e22d |
| src/PlannedPage.jsx | c0b5ce60b04c92b1964a278f6ae891f252b73a44b9fa5b69bcd87b4e051d9209 | 0f092c0dd3365dfbd7401692d82125945d279010dae341a2ef923de800084841 |
| src/pages.js | 9f4a11e9d4087fd582114f78a34c42b7ab6c1bd53ad590a843e5a9d538847f20 | 324bc1cf42a86399d78c133bf911743a76fffb427fe972cdf966de895324c8c6 |
| src/styles.css | 220058ff4c3f95045e38f0ab8b967d5d140e6fd0802ad3541b7ff0b79bddfb43 | ae9f1acd38b375fe559c8ed2dd206fcc418c940b654d91973479c7be8db3e5b8 |
| tests/accessibility.mjs | bd84d4f97cf83d441dade9201c66b517296457609bfb78ce8b9e6a3b2d5b0da8 | 0baae40fab062bc04d4fd0ad1f0e88173b04e615ceccbb9eaf80e7e786dd76fd |
| tests/browser.mjs | 18726ccef603101964af51ecbd2365d8951071aee998cd1a91ff632aefbfabc6 | 644f4d71c5b24002b83b5896d2fa92c7940311ee34dde809b269624bec712994 |
| tests/digital-world-ui.test.mjs | 9890bea90c9ddbe18d05fdc5e376db5a3e8bcf64270002ccb494e5d37c299460 | ef8e037aec25525bcf920d6dba612c953b9ec8e78bc06ba7abd3dd2780c2db64 |
| tests/history-browser.mjs | a176eb0a3a3a841e16fe6213e71d9591ca0db8168ae330619d2e91cd71081341 | a3ee0c4605e164daf68aaac6edbf7facbec0e6e04ff8c89335774093837a9db2 |
| tests/history-capacity.mjs | c929b16d876afebf6a10eb0872d68e990f54a1735c7006d7e88312cb3f7163ef | ce45e7a9687ac69e92bd2a5139075f4a14a0e54f977dec141b8d9a773ef8dc1c |
| tests/nav-zones-browser.mjs（新增） | — | 77aa2e026ecd9318abf655f94f4000c095462b413c8c12b4c324038abc86ade2 |
| tests/search-browser.mjs | 737f1507d3892d3988779ad1cb304d010a8c8b4364d74a37cc71d0938093c9f7 | c94b7d90525f225f237f688f779f64ede002a2584a42fddf70e40db2b7a6cf6d |
| tests/skill-source-browser.mjs | 1609756ce4dfd12e5b1dd5c1b7b99cbf4fecb464c6505b312d7502939674322e | 28139482c17273b5bd38a9da1091a4d5f20130001918d428299fcb2a52a2b5ea |
| tests/visual.mjs | 6ff37fff61a21e2ce2c1ce83e0212fd7536e15ced8afe48a74b9400112409caf | 479295848e1550838b2c7c50ddf7c1a408189e31d3a8553fea03990ca71f1427 |
| tests/workflow-browser.mjs | 91383a4b3f0639854c37ba71b50b1807e699cae20c0c3d66e9705de1b4d2e05b | afc7c8627fe15835b22f0208baddcdf786fc5b50abdc933023b4830bf4ca507b |

## 三、失败测试首跑（改代码前）

`node tests/nav-zones-browser.mjs` 在 ce1f1f4 构建上运行，日志见 `cloud-slice-1.2-logs/01-new-test-before.txt`。结果：exit 1，第一条断言就失败——侧栏结构 `deepStrictEqual` 不符。旧侧栏没有 `.nav-zone`，读出的结构为空，与期望的四段结构不一致。

## 四、验证命令与首次结果

| 命令 | 首次结果 | 对照云端已知失败集 |
|---|---|---|
| `npm run build` | 通过 | — |
| `node tests/nav-zones-browser.mjs`（改后首跑） | 8/8 PASS | 新增用例 |
| `timeout 1200 npm test`，第 1 次（`03-npm-test.txt`） | tests 427 / pass 401 / **fail 20** / cancelled 1 / skipped 5 | **增 1**：digital-world-ui 中“总览只展示真实计数…”要求每个页面名都出现在首页，而我把能力体检从地图上去掉了。改法见一、#6。**这是我引入的失败，已修复**，没有改那条断言。 |
| `timeout 1200 npm test`，修复后（`04-npm-test-after-fix.txt`） | pass 402 / fail 19 | 失败项与已知集逐条相同，**增 0、减 0** |
| 全部浏览器脚本，第 1 轮（`05-browser-scripts.txt`，31 个） | 25/31 | **增 1**：r87-fix-browser B4 报“首页出现两个‘待处理 ·’标题”。根因是我替换首页结构地图的脚本定位错了结束位置，把“待处理”区和旧地图重复拼接了一次。**这是我引入的缺陷，已修复**：以基点文件为底重新应用改动，并在新测试里加了“能力地图、待处理各只出现一次”的断言；已确认这条断言在有缺陷的版本上失败。其余 5 个失败都在已知集内。 |
| `timeout 1200 npm test`，最终代码（`06-npm-test-final.txt`） | tests 427 / pass 402 / fail 19 / cancelled 1 / skipped 5；rule-templates.test.mjs 照旧挂到外层超时，日志末尾没有 `exit=` 行 | 与已知集逐条相同（diff 为空），**增 0、减 0** |
| 全部浏览器脚本，最终代码（`07-browser-scripts-final.txt`，31 个，每个外加 `timeout 600` 只为防挂起） | 26/31 通过。失败：agent-config、rule-templates、rule-templates-fix（配置写入保护）；interaction（按下后位移 0，期望 3）；search（palette-cold 890ms > 500ms） | 5 项都在已知集内，**增 0、减 0**。nav-zones、r87-fix、browser、accessibility、history、workflow 都通过 |
| `node tests/visual.mjs slice-1.2`（`08-visual.txt`） | `problems: []` | — |

说明：
- 任务要求 npm test 和浏览器脚本“各跑 1 次”。因为第 1 次暴露了我自己引入的问题，修复后又在最终代码上完整重跑。上表中各轮的首次结果都如实列出。
- 单条前台命令最长 10 分钟，而 npm test 在云端必定跑满 1200 秒，所以 npm test 和整批浏览器脚本放在后台前后依次运行，没有并发。外层超时值没有改。

## 五、需要真人确认的视觉点（截图在 `cloud-slice-1.2-shots/`）

1. `1440-sidebar.png`：在 1440×1000 窗口里，侧栏导航区域自己滚动（这是已有机制），**“系统”段（模型设置、版本归档）要往下滚才能看到**。项目增加后，版本归档默认不在首屏。是否接受？
2. `1440-home-map.png`：地图变长后，右侧“最近迭代”一栏被拉高，5 条之间留白很大（之前就是拉伸布局，这次更明显）。未处理。
3. `1440-health-in-agents.png`：从 `#health` 进入后，焦点落在“能力体检”分区上，分区四周会出现青色焦点框。这是键盘可达性的正常表现，请确认观感。
4. `390-drawer.png`：抽屉导航项改为 44px 后整体变长，需要滚动。
5. 区名样式（“工作区 WORK”“生活区 LIFE”，比分组标题大一号）和分隔线的对比度。
6. 资产详情的标签“版本记录”改名为“历史”（见一、#3）。

## 六、未完成项与风险

- 随手记的页头说明仍是“目前只保存在本机，尚未写入 Obsidian”。按 v1.2（D15 推翻）随手记不再写入 Obsidian，“尚未”这个说法已不准确。这不属于本切片的改名范围，所以没改，建议在切片 1.4 一并修改。
- 能力体检分区仍然是规划，不执行任何检查。旧页 `health` 的注册项保留（`navHidden` + `mergedInto`），只为兼容旧地址和站内搜索。
- 待处理页 `inbox` 的规划文字提到“能力体检结果”，没有改。
- 云端结果不能代替本机回归。合入前请在本机（macOS）重跑 npm test 和全部浏览器脚本，并核对上表中的改动前指纹。

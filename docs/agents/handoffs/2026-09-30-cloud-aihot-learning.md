# 云端交接 · 任务 F2：第五阶段 5.3 AI HOT + 5.4 学习成长（提前开发）

- 执行：Claude Code 云端会话（云端副本，非权威）。未改 CURRENT.md / COLLABORATION.md / AGENTS.md / CLAUDE.md，不写交接编号。
- 基点：`main @ bc8e343`；分支 `cloud/2026-09-30-aihot-learning`，已推送；未开 PR、未推 main。同一提交另推到会话默认分支 `claude/aihot-learning-43fbcg`（云端环境指定的开发分支，内容与 cloud 分支相同，可忽略或删除）。
- 环境：Linux / root，Node v24.21.0（/opt/nvm），`PLAYWRIGHT_MODULE=playwright`，chromium-1234。
- 依据：产品定义 v1.2 §3.5、§4.8、§5；路线 v3 5.3、5.4；问题共识基线 v2.2 D34、D35。
- **未改** `server/config-file.mjs`、`package.json`、`package-lock.json`；没有新增依赖；测试中没有任何外网访问（单元测试与浏览器测试都把 `globalThis.fetch` 换成直接抛错的函数，拉取只走注入的桩）。

## 一、改动与理由

### AI HOT（5.3）

| # | 改动 | 理由 / 说明 |
|---|---|---|
| 1 | 新增 `server/aihot.mjs`：拉取 `https://aihot.news/api/v1/` 下 4 个只读地址——`items?mode=selected&window=24h`（精选）、`hot-topics`（热点）、`dailies?limit=1` 取最新日期后再取 `dailies/{date}`（日报）。只发 GET，`redirect: "error"`（不跟随跳转到其他站点），15 秒超时，响应超过 2 MB 视为失败。 | 任务“服务端只读拉取模块”。日报日期必须是 `YYYY-MM-DD` 才拼进地址，防止接口返回的内容改变请求路径。 |
| 2 | 清洗（`sanitizeItem` / `sanitizeList`）：每条只取标题、摘要、链接、来源、时间 5 个字段，返回新对象，其余字段一律丢弃；删除控制字符、折叠空白；按上限截断（标题 200、摘要 600、来源 80 字）；链接只接受 `http/https`，`javascript:`、`data:`、`file:`、带账号密码、相对地址、超长链接一律清空；没有文本标题的条目丢弃；每个分区最多 50 条，按链接去重。 | 任务“接口返回内容一律当作不可信文本”。没有有效链接的条目仍显示标题，但不生成链接，也不能收藏。 |
| 3 | 缓存：数据目录下 `aihot/cache.json`（权限 0600，先写临时文件再改名），上限 512 KB，超过时从最长分区末尾舍去条目。读回时再清洗一遍（防止被篡改的缓存绕过白名单）；缓存文件超过上限或无法解析时忽略，并标注“本机缓存……已忽略”。缓存与设置**不进主库、不进备份**。 | 任务“缓存到数据目录（JSON，有大小上限与字段白名单）”。 |
| 4 | 失败处理：三个分区各自记录 `fetchedAt`，某个分区失败时保留它的旧内容与旧时间，其他分区照常更新；整体状态为“拉取失败”，写明哪几个分区失败，并保留“上次成功时间”。 | 任务“失败时保留上次缓存并标注更新时间与‘拉取失败’”。 |
| 5 | 设置：`aihot/settings.json` 保存 `enabled`（默认开）、`intervalHours`（默认 3，允许 1–24 的整数）和首次确认时间。服务每分钟检查一次，**只有在开启且已确认过**的情况下，距上次尝试超过间隔才拉取；定时器 `unref`，关闭服务时清除。同时发起的刷新只访问一次接口。 | 任务“按间隔（默认每 3 小时，可配置）”“网络访问可关闭，默认开启但首次拉取前在页面说明”。**判断点**：我把“首次拉取前在页面说明”理解为“首次拉取要等你在页面上看过说明并点‘开始拉取’”，所以即使默认开启，服务启动后也不会自动访问 aihot.news；确认之后才按间隔自动更新。如果你想要启动即拉取，只需去掉 `tick()` 里对 `acknowledgedAt` 的判断。 |
| 6 | `server/http.mjs`：新增 `GET /api/aihot`、`POST /api/aihot/refresh`、`POST /api/aihot/settings`；拉取函数取自 `adapters.aihotFetch`（测试注入桩），缺省为全局 `fetch`。 | 与现有扫描适配器的注入方式一致。 |
| 7 | 新增 `src/LifePages.jsx` 的 `AiHot` 页：访问说明（`role="note"`，写明将访问 aihot.news 公开接口、只读、默认间隔、只当文本显示、仅个人非商业、可在模型设置关闭）；未确认时显示“开始拉取”；状态行（尚未拉取 / 更新于 / 拉取失败·上次成功·上次尝试 / 网络访问已关闭）；三个标签“精选 / 热点 / 日报”（沿用 `.segmented`，`aria-pressed`，带条数）；列表显示标题、来源、时间、摘要，标题在新标签页打开原文（`target="_blank" rel="noopener noreferrer"`）；日报标签显示日报日期。 | 任务“AI HOT 页改为可用”。 |
| 8 | 世界总览新增“E 今日热点”卡（`HomeHot`）：优先取热点，热点为空时取精选，只列有原文链接的前 5 条；没有缓存时如实写“尚未拉取”，并说明要先在 AI HOT 页确认；拉取失败时写“拉取失败，显示 X 的缓存”。位置在 C/D 行之后，字母顺序连续。 | 任务“世界总览加‘今日热点’卡，显示 3–5 条”。缓存不足 3 条时如实只列现有条数，不补假数据。 |
| 9 | 每条“收藏到学习”：写入学习成长的链接收藏（标题、原文链接、摘要、来源、收藏时间，来源类型 `aihot`，默认“想学”）；同一链接已收藏时提示“已收藏过”；如果它在回收区里，则直接恢复，不另建一条。 | 任务“收藏到学习……重复收藏提示已收藏”。 |

### 学习成长（5.4）

| # | 改动 | 理由 / 说明 |
|---|---|---|
| 10 | 主库新增顶层集合 `learning = { folders, books, links }`（`server/schema.mjs` 的 `validateLearning`，严格字段白名单）：`folders` 是书架文件夹（绝对路径，不含控制字符，最多 10 个，不能重复）；`books` 只记学习状态（`root` + 相对路径 `path` + 文件名 + 状态 + 时间，路径必须通过 `safePath`）；`links` 是链接收藏（标题 ≤200、链接只能是 http/https 且全库唯一、摘要 ≤1000、来源 ≤80、来源类型 manual/aihot、状态、创建/更新/删除时间）。状态三种：`want` 想学 / `learning` 在学 / `done` 学完。旧库缺少 `learning` 按空处理，不写迁移。 | 任务“主库新增集合（严格 schema，旧库缺失按空）”。 |
| 11 | `validateHistory` 新增规则：通用保存（`PUT /api/workspace`）不得改动 `learning.folders`，只能经 `repository.updateLearning`（新增）改。 | 书架文件夹等于“允许读取哪些目录”的授权，要经过服务端路径校验，不能由页面直接写入任意路径（与“连接结果只能通过扫描更新”同一思路）。 |
| 12 | `server/merge.mjs`：与焚决同样只做加法——备份里缺失的链接和书的状态追加；已有记录（同 ID）保留当前库的编辑与状态；链接 URL 已在当前库时不重复收藏；**书架文件夹不随备份导入**（空库导入时也清空），导入摘要新增 `learningLinksAdded`、`learningBooksAdded`。 | 任务“merge.mjs 语义与现有集合一致”。文件夹是本机读取授权，换机器或恢复备份后应重新指定。 |
| 13 | 新增 `server/learning.mjs`：`addFolder` 只接受存在的绝对路径目录，拒绝相对路径、根目录、文件、符号链接、控制字符、重复（含已添加文件夹的子目录）；保存 `realpath`。`shelf()` 只读索引：`readdir` + `lstat`，**不打开任何文件**，只取 PDF/EPUB 的文件名、大小、修改时间；不跟随符号链接，不进隐藏目录，最多 6 层、20000 项；文件夹不存在 / 被替换为符号链接 / 无法读取时分别标注，不抛错。书的 ID 由“文件夹路径 + 相对路径”算出，稳定不变。新增路由 `GET /api/learning/shelf`、`POST /api/learning/folders/add|remove`。 | 任务“书架……只读索引……不复制原件”“路径校验”。移除文件夹时保留学习状态，重新添加同一文件夹即恢复。 |
| 14 | `src/LifePages.jsx` 的 `Learning` 页：A 书架（每本显示文件名、所在文件夹/子目录、大小、修改时间，以及“想学 / 在学 / 学完”三个按钮）；B 链接收藏（手动添加对话框：标题、链接、摘要可选；每条显示标题链接、来源、收藏时间、摘要、三种状态、删除；删除进回收区，可恢复）；C 内容解析：如实写“以后再做”。未指定文件夹时给出“去模型设置添加”。 | 任务“学习成长页改为可用：两个区‘书架’和‘链接收藏’”“内容解析不做，页面如实写‘以后再做’”。 |
| 15 | `src/learning.js`：链接收藏、状态、删除/恢复、书的状态的纯函数，前端只经这些函数改 `learning`。 | 与焚决的 `scrolls.js` 做法一致。 |
| 16 | 模型设置页新增两个面板：“AI HOT 网络访问”（允许访问 aihot.news 公开接口的开关、拉取间隔 1/2/3/6/12/24 小时、保存）和“学习成长书架”（文件夹列表、移除、填写路径添加）。设置页头 lead 补上这两项。 | 任务“网络访问要可关闭（设置项）”“用户在设置里指定允许读取的文件夹（可多个）”。浏览器不能读本机文件夹选择器的真实路径，所以用文本框填写绝对路径。 |
| 17 | `src/pages.js`：AI HOT 与学习成长由“规划中”改为 **“部分可用”**，删除它们的 `plan` 说明；`src/App.jsx` 接上两个页面；`src/Home.jsx` 结构地图的这两行改为真实摘要。 | **判断点**：任务写“改为可用”。我标的是“部分可用”而不是“可用”：AI HOT 的接口字段是按常见写法宽松映射的，还没有对真实接口实测（云端不放行 aihot.news）；学习成长的内容解析按要求没做。实测通过后可以改成 `ready`，只改 `pages.js` 一个字段。 |
| 18 | `src/styles.css` 末尾新增一段样式（`.hot-list/.hot-item/.shelf-book/.learn-link/.home-hot/.status-picker/.check-row` 等），只用现有令牌与卡片、分段按钮的写法，不改任何已有规则。 | 不改视觉方向；控件至少 44px，窄屏单列。 |

## 二、测试

新增：
- `tests/aihot.test.mjs`（13 项）：白名单字段与恶意字段、`__proto__` 不污染；`javascript:`（含大小写、前导空格）、`data:`、`file:`、`vbscript:`、带账号、协议相对、相对、超长、非字符串链接全部清空；超长截断、缺标题丢弃、无效时间置空；外层结构识别与条数上限；默认设置与“未确认不访问”；只请求 4 个地址、GET、不跟随重定向、缓存只含白名单字段且权限 0600；网络错误 / 5xx / 坏 JSON / 超大响应（正文与 content-length 两种）都保留上次缓存、标注失败与上次成功时间，重启后仍在；只有热点失败时其余分区更新；非法日报日期不拼进地址；缓存大小上限；被篡改的缓存重新清洗、超限缓存被忽略；设置严格校验、关闭后手动与定时都不访问、间隔生效、持久化；并发刷新只访问一次。
- `tests/learning.test.mjs`（10 项）：旧库缺失按空；合法数据通过；26 个严格校验反例（字段、状态、协议、空链接、标题长度与控制字符、摘要长度、来源类型、时间、ID 重复、URL 重复、`../` 与绝对的书路径、相对的书架目录、目录重复、文件夹与链接数量上限）；merge 旧备份、只做加法、同 URL 不重复、文件夹不导入、经仓库往返；通用保存不能改文件夹；路径校验（相对、空、非字符串、根目录、不存在、文件、符号链接、控制字符、重复、revision 冲突）；索引只列 PDF/EPUB、不跟随符号链接（目录与文件两种）、不进隐藏目录、ID 稳定、**索引前后书架与外部目录的文件列表、大小、mtime、权限、内容哈希完全相同**；文件夹删除后标“missing”；文件夹被替换为符号链接后标“unsafe”且不读取。
- `tests/aihot-learning-browser.mjs`（10 个 PASS 段）：首次拉取前首页卡“尚未拉取”、访问说明、零请求；开始拉取后三个标签、标题新标签打开（`noopener noreferrer`）、不可信链接不渲染、全页没有 `javascript:` 链接；收藏到学习与重复提示、无链接条目不能收藏；首页热点卡 5 条；拉取失败保留旧内容；设置里添加书架文件夹（相对路径被拒）；书架只列 PDF/EPUB、标“在学”写入并刷新保持；链接收藏状态、手动添加、重复提示、删除进回收、恢复；关闭网络后不再拉取；390 宽下 AI HOT 三个标签、学习成长、首页、设置无横溢，按钮 44px；axe（1440：AI HOT、首页、设置、学习成长；390：AI HOT、学习成长）。

按新需求更新的既有测试（需本机知悉）：
- `tests/digital-world-ui.test.mjs`：“切片 1.2”用例中，规划中页面列表去掉 `aihot`、`learning`，其余 4 个页面（health、collab、calendar、silver）的断言原样保留。改前在实现后首跑失败于 `AssertionError: aihot`（`logs/04-…`）。另新增一项：两页为生活区、“部分可用”、没有 plan；学习成长服务端渲染含“以后再做”、未指定文件夹的提示、`rel="noopener noreferrer"`、状态按钮 `aria-pressed`、回收区计数、回收中的链接不在列表；首页热点卡首屏如实显示“正在读取本机缓存”、没有链接。
- `tests/nav-zones-browser.mjs`：`LIFE_PLANNED` 只留银饰计划（原有“规划中、无假按钮、axe”断言不变）；新增 `LIFE_BUILT` 检查 AI HOT、学习成长可达、不再出现“尚未开发”、标“部分可用”、地址正确。改前失败于 `/规划中/` 不匹配（`logs/05-…`）。

实现过程中对**新测试自身**的修正（都不是放宽断言）：
1. `learning.test.mjs` 第一次运行因我写错一行（非 async 箭头函数里用了 await）而无法加载；修正后重跑首次失败并存档（见第三节）。
2. merge 用例的备份夹具里放了两条 URL 相同的链接——这本身就是被 schema 拒绝的非法备份，用例因此没有测到本意；改为“当前库已有该 URL（另一 ID）”。
3. 索引只读用例的快照最初包含主库数据目录（添加文件夹本来就会写主库），改为只对书架与外部目录做快照，并在添加文件夹之后取“索引前”快照。
4. 浏览器测试 390 段的一处顺序错误（页面已跳到设置后才找学习页的按钮），以及恢复链接后没有先确认并关闭上一条提示、导致下一步读到旧提示——补上等待该提示的步骤。

## 三、失败测试首跑（改代码前，基点构建产物）

- `node --test tests/aihot.test.mjs`（`logs/01-aihot-unit-first-fail.txt`）：exit 1，`ERR_MODULE_NOT_FOUND: server/aihot.mjs`。
- `node --test tests/learning.test.mjs`（`logs/02-learning-unit-first-fail.txt`）：exit 1，`ERR_MODULE_NOT_FOUND: server/learning.mjs`（首次执行因上面第 1 条的测试语法错误没能加载，日志第一行已注明）。
- `node tests/aihot-learning-browser.mjs`（`logs/03-browser-first-fail.txt`）：exit 1，首页找不到 `section.home-hot` 的“今日热点”标题，10 秒超时。
- 注意：这两个单元测试的首次失败是“模块不存在”，只证明测试依赖尚未实现的模块；各断言的有效性由实现过程中出现的真实失败佐证（例如控制字符被替换成空格而不是删除，`'恶意 标题' !== '恶意标题'`，据此修正了实现）。

## 四、改动文件及 SHA256

| 文件 | 改动前（bc8e343） | 改动后 |
|---|---|---|
| server/aihot.mjs | （新文件） | 07d36c9331ae1a1d7c183de6947a4be934ef7678a1d4737b6eef4ee4ac235f57 |
| server/learning.mjs | （新文件） | 4fa59aeef567e11d6238cabbbcb4ffbc8ba6e21c8bf2bc7c288fb3788f1f10da |
| server/schema.mjs | 5a426e68d5cc28a6c7bc45a145cb622de9949816f5912f1101394bbe108d08c7 | 377d6b89e79a12786acdda3ee1c84f8ac39772f803050af2024da888ebd687f9 |
| server/merge.mjs | eac7e38c2921ec2083e2f15e5a88924228fee4ced01bdc85fa7851b1aaa3210e | eaf885e9067c0005533547c6e9fcb1b1c559cecb32bb0158091f4fe9dc9bd420 |
| server/repository.mjs | dc8051acce21f91c76b791784039fed89bbb0f0798a71529260619109c324039 | af26bb09e0f3285a6bcb1ddb3f626831ff0efdfce523fda5571f0c7519a9faa6 |
| server/http.mjs | 04f8df4aa4d36f382ec76d7359dae69c505220715a3a13f65fd6535f29c6ab52 | ada3234e176d70d1fd4ef961a143e6999efd3b654e6dd09f8432fad862851cfe |
| src/learning.js | （新文件） | 96c4c5cb7efa969383fb91dc366bf5eb0e536b975efdf0b85f1ed1a600423997 |
| src/LifePages.jsx | （新文件） | 498316c40aed8b05216283bc9d2457e2ebdee4ef67a1c42366a016d195e86e03 |
| src/pages.js | 96eb863dc1a2a124d05a445aa25914384fb3740aa62f7ddc3d418fd2b34622ce | 60c125d1998077e92c166e6ad3ea2a8b69dc45f179a76e96ce2f4d3532244401 |
| src/App.jsx | 965e86ca0fea9a15c30677a7d88f88971a3fbbf207143c8c28c8c55b78111921 | d42643bc5ceeca29e645290d2947f3fccec103e9573a9e27af256f4a2e16e885 |
| src/Home.jsx | a2b4ed81b51ba02c0bbc7ef7673ca186fbb926fe86b8d737e7e17d94a686728a | 4023c4612f80455285bc7b62a805f05de0719ff9af61cae24b1ab3d4b353a1a0 |
| src/WorkspacePages.jsx | 0892ec4cd86cfe52513346ba9a6135dad1c9b5b5711d65de85da65b09fb51f6a | aa1b7619ad52181d6580980aaf926004bd16db2d852972e470d47832f67e6d8b |
| src/styles.css | 96430f0dd97fe3d2e7a9ce58c1758b93f97e66c810c26ffd9d8e50d0cd8b86d8 | 0907686f5c36cb40dd61b29c1e4518a6493a69e8fd9f1dc1e1a581092c8d9def |
| tests/aihot.test.mjs | （新文件） | 7845bf0f7550f09b44465bdc84bf9a9a966a3747f5ddd15e6a60be0a223d2dd8 |
| tests/learning.test.mjs | （新文件） | 51c064e4243095ad7d051debb9ee2d320fd2abe9a18af43e9ebd9861bb6b4249 |
| tests/aihot-learning-browser.mjs | （新文件） | 683ab80a410d3054c642e28455d77d123b964f20499ba1fadd6a451331a8f4ff |
| tests/digital-world-ui.test.mjs | e064c9782a72faaeff4523e98030b06dc0b1d4606e678d11c2a2baa8ff9c141e | 3708600f3697b11715eee8e19731af65213b76e52c1fba1dd201a84896977e92 |
| tests/nav-zones-browser.mjs | 77aa2e026ecd9318abf655f94f4000c095462b413c8c12b4c324038abc86ade2 | 7d6e50510654567bb6a6a51a36d1acd8b4fc899bdb00c1bfd64eb0b8cfa7bdd9 |

## 五、验证命令与首次结果

| 命令 | 首次结果 | 对照云端已知失败集（CLOUD-SESSIONS §3.6） |
|---|---|---|
| `node --test tests/aihot.test.mjs tests/learning.test.mjs tests/server.test.mjs tests/scrolls-schema.test.mjs`（实现后） | 34/34 pass | — |
| `node tests/aihot-learning-browser.mjs`（实现后） | 10 个 PASS，`all passed`，exit 0 | 新测试 |
| `npm run build`（`logs/10-build.txt`） | 通过（仍有原有的 chunk 超过 500 kB 提示） | — |
| 35 个浏览器脚本各 1 次（`logs/11-browser-scripts.txt`：4 个基础脚本 + 31 个 `*-browser.mjs`，含新脚本） | 30/35 通过。失败：agent-config、rule-templates、rule-templates-fix（配置写入平台保护）、interaction（`2.73819` 期望 3）、search（`palette-cold 946ms > 500ms`） | 5 个失败都在已知集内，原因与已知描述一致：**增 0、减 0**。新脚本 aihot-learning-browser 在完整回归中 exit 0 |
| `timeout 1200 npm test`（`logs/12-npm-test.txt`） | tests 459 / pass 434 / fail 19 / cancelled 1 / skipped 5；`rule-templates.test.mjs` 照旧挂到外层超时（exit=124，用时 1200 秒） | 19 个失败（加上 rule-templates 文件级 1 条）与 `cloud-scrolls-in-assets-logs/12-npm-test.txt` 的失败清单去掉耗时后逐条 diff **完全相同**：**增 0、减 0**。tests 435→459、pass 410→434，差额 24 是本任务新增的测试（aihot 13、learning 10、digital-world-ui 1），全部通过 |
| `node tests/visual.mjs aihot-learning`（`logs/13-visual.txt`） | `problems: []` | — |

截图（`cloud-aihot-learning-shots/`，4 张）：`aihot-selected-1440.png`（AI HOT 精选标签，含一条无有效链接的条目）、`learning-1440.png`（学习成长全页：书架、链接收藏、内容解析）、`aihot-390.png`（390 宽，日报标签、拉取失败标注）、`home-hot-390.png`（390 宽，世界总览“今日热点”卡）。

## 六、需要真人确认的视觉点

1. AI HOT 页的访问说明、“开始拉取”框和状态行的位置与语气；拉取失败时橙色的两行（状态行 + 失败详情）是否太重。
2. 条目卡片：标题下划线 + 外链小图标、来源与时间用等宽小字、“收藏到学习”文字按钮放在左下。
3. 世界总览“E 今日热点”放在最下方、占满整行；每条是一行下划线标题 + 来源小字。是否应该更靠上（例如和“待处理”并排）由你决定。
4. 学习成长的书架行：右侧“想学 / 在学 / 学完”分段按钮；未标记时三个都不亮。窄屏下按钮移到文件名下方。
5. 链接收藏的“添加链接”按钮与“回收区 N”在同一行两端；删除用垃圾桶图标（进回收区，不需要确认）。
6. 模型设置页新增两个面板的顺序：模型与 API → AI HOT 网络访问 → 学习成长书架 → 数据存储……
7. 两个页面在页头标的是“部分可用”（理由见第一节第 17 条）。

## 七、未完成项与风险

- **AI HOT 接口字段未经实测（最大风险）**：云端无法访问 aihot.news，公开的 Skill 说明（2.0 最终版）已改用 `/api/v1/agent/*` 的 Markdown 接口，任务给的 `items / hot-topics / dailies` JSON 接口的字段名我拿不到原文。实现按常见字段名做了宽松映射（标题 `title/name/headline`，摘要 `summary/description/excerpt/ai_summary/…`，链接 `url/link/source_url/…`，时间 `published_at/publishedAt/time/…`，来源为字符串或 `{name}`；列表在 `items/data/list/topics/…` 或 `sections[].items` 下）。本机首次点“开始拉取”后如果某个标签是空的，说明字段或结构对不上：看 `data/aihot/cache.json` 与接口原文，只需补 `server/aihot.mjs` 里的字段名列表。热点接口返回的若是“事件”而没有原文链接，热点条目会显示但不能收藏、也不会进首页卡（首页卡会退回用精选）。
- 接口使用条款：AIHOT 公开说明写明个人非商业使用免费；本实现只在本机、只读、只给你自己看，页面也写了“仅个人非商业使用”。没有加 User-Agent 标识或 actor ID。
- 首次拉取需要点“开始拉取”（第一节第 5 条的判断），你如果希望默认开启即自动拉取，需要改一处判断。
- 书架路径需要手填绝对路径；macOS 上读取“文稿”“下载”等受保护目录时，运行工作台的终端需要有相应的“文件与文件夹”权限，否则会标“无法读取”。
- “可选剪藏进 Obsidian”（产品定义 §4.8）这次没做，任务未要求。全局搜索（⌘K）不搜索链接收藏和书架。
- 书的状态记录在文件移动或改名后会变成孤立记录（ID 由路径算出），页面不显示；目前没有清理入口。
- 书架索引每次打开学习成长页都重新遍历一次；文件很多（上万个）时会慢，已有 20000 项与 6 层的上限。
- AI HOT 缓存与设置不在备份里；换机器后需要重新确认和拉取。
- 云端结果不能代替本机回归；合入前请在本机（macOS）重跑 `npm test` 与全部浏览器脚本，并核对上表的改动前指纹（`server/schema.mjs`、`server/merge.mjs`、`server/repository.mjs`、`server/http.mjs` 是共享面）。

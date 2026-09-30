# 云端交接 · 任务 E2 · 路线 v3 切片 2.1 + 2.2（提前开发）

- 分支：`cloud/2026-09-30-phase2-projects`（短名 phase2-projects）；基点 `main @ 99f87d4`。
- 性质：第二阶段**提前开发**，只推分支，不开 PR、不推 main；合入时机由本机在 1.E 整体验收后决定。
- 本分支**没有改动** CURRENT.md、COLLABORATION.md、AGENTS.md、CLAUDE.md、package.json、package-lock.json、server/config-file.mjs、`docs/design/`。
- 依据：产品定义 v1.2 §3.2、§4.1；路线 v3 2.1、2.2；PROJECT-IDENTITY.md、PROJECT-CONTEXT.md、LOCAL-FIRST.md。

## 一、结论

| 项 | 结果 |
|---|---|
| 新单元测试 `tests/project-status.test.mjs` | 首跑 19/19 失败（空桩只抛“未实现”），实现后 19/19 通过 |
| 新浏览器测试 `tests/project-status-browser.mjs` | 首跑失败（前端恢复为基点版本，找不到“在推进”区）；实现后 9 组检查全部通过 |
| `timeout 1200 npm test` | tests 453：pass 428、fail 19、cancelled 1、skipped 5。失败项与云端已知失败集逐条 diff 为空，**没有新增也没有减少** |
| 全部浏览器脚本（35 个） | 31 通过、4 失败：agent-config、rule-templates、rule-templates-fix（配置写入保护）和 search（palette-cold 769ms > 500ms）。4 个都在已知集内，**没有新增**；已知时序类 interaction 本次通过，属于波动，不算已修复 |
| `node tests/visual.mjs phase2-projects` | `problems: []` |

## 二、改动与理由

### 2.1 在推进标记 + 项目状态卡 + 停滞雷达

1. **“在推进”标记存在主库**：`connections.projects[].active` 是可选布尔字段（`server/schema.mjs` 严格校验，非布尔值报“在推进标记”）。
   - 旧库没有这个字段，按未标记处理；取消标记时直接删除字段，不写 `false`。
   - 写入走专用接口 `POST /api/project-status/mark {projectId, active, revision}`：必须带当前 revision，否则返回 409；字段多出或类型不对返回 400；项目不存在返回 404。原因是普通保存不能改连接数据（`validateHistory` 规定）。
2. **与现有项目字段保持同一合并语义**：
   - `merge.mjs` 未改：备份合并本来就不导入连接数据，`active` 也就不随备份导入、不覆盖当前主库。从空库恢复时连接数据需要重新扫描。已有测试锁住这一点。
   - `server/discovery.mjs` 的 `mergeProjects` 最后一轮按稳定项目 ID 和被吸收的历史身份（aliases）保留标记。原因：远端换了之后，原逻辑会从空对象重建记录，标记会丢。
3. **超过 7 个只提示、不阻止**：接口返回 `activeCount` 和 `softLimit: 7`。页面在超过时显示黄色提示；标记超过 7 个时，提示框改为“需留意”。
4. **停滞阈值**：`connections.projectStallDays` 为 1–365 的整数，缺失时按 7 天。
   - 通过 `POST /api/project-status/settings {stallDays, revision}` 保存。
   - 页面上有“停滞阈值（天）”输入框和“保存阈值”按钮。
5. **项目状态卡**：新模块 `server/project-status.mjs`。
   - **读取前的校验**：
     - 先用 `assertDirectoryConfirmed` 核对目录，再用 `projectDirectory` 核对扫描范围、隐藏目录、符号链接和目录身份，之后再核对一次目录；之后的读取和 Git 查询都用校验得到的真实路径。
     - 接口 `inspect` 只接受空对象，不接受任何路径。
   - **读哪个文件**：项目已经绑定 Current 来源时，用绑定的相对路径；否则读项目根目录的 `CURRENT.md`。
   - **读取方式**：
     - 用 `O_NOFOLLOW` 打开，只读普通文件，硬链接不读；最多只读开头 64 KiB。
     - 读取前后比较修改时间和大小，变了就报错。
     - 只有截断读取时，才容忍末尾被截断的多字节字符；其他非 UTF-8 内容一律报“无法解析”。
   - **为什么只读开头而不是拒绝大文件**：本项目自己的 CURRENT.md 有 81 KB，协作表在文件开头。如果超过 64 KiB 就拒绝，这张卡在本项目上就无法使用。
   - **解析规则**：
     - 只认“字段 | 值”形式的两列表格行，识别四项：`state_id` 或“状态编号”（规则模板用后者）、当前写入者、唯一下一步、最新交接。
     - 最新交接取单元格里的第一个 Markdown 链接。单元格支持 `\|` 转义；每个值超过 500 字截断并加“…”。
   - **状态分四种**：
     - 四项齐全为 `ok`；
     - 缺项为 `partial`，页面逐项写“缺少此项”，不补造；
     - 没有协作表为 `unparsed`，显示“无法解析”；
     - 没有文件为 `absent`，显示“未装协同协议”，并提示可以在项目详情的“规则”里装入“项目协同协议”模板。
6. **停滞雷达**：
   - **时间来源**：CURRENT 的修改时间，以及 `git log -1 --format=%cI` 的提交时间，取两者中较新的一个。
   - **判定**：严格大于 N 天才算停滞，恰好 N 天不算。
   - **未知的处理**：
     - 两边都读不到时显示“未知，不当作停滞”。
     - 一边读取出错、另一边显示停滞时，同样判为未知，因为出错的那一边可能是新的。
     - 时间在未来时按 0 天处理。
   - **标红**：卡片加红色左边框，并显示“停滞 N 天”。

### 2.2 项目安全体检（只读）

1. **Git 调用方式**：全部是只读 Git 调用，与扫描器一样用 `/usr/bin/git`，并额外做了这些限制：
   - 清除所有 `GIT_*` 环境变量，设置 `GIT_OPTIONAL_LOCKS=0`，加 `--no-optional-locks`；
   - 忽略全局和系统配置，关闭 `core.fsmonitor` 和 `core.untrackedCache`，防止仓库本地配置启动外部程序；
   - `GIT_CEILING_DIRECTORIES` 设为上一级目录，只认项目目录本身的仓库。
2. **检查项与计入问题的条件**：

   | 检查项 | 读取方式 | 什么情况计为问题 |
   |---|---|---|
   | 是否 Git 仓库 | `rev-parse --show-toplevel` | 不是 Git 仓库 |
   | 远程 | `git remote` | 没有远程 |
   | 未提交改动 | `status --porcelain=v1 -z` 计数 | 数量大于 0 |
   | 被跟踪的敏感文件 | `git ls-files -z` 后按规则判定 | 至少 1 个 |
   | 远程是否私有 | 见下一条 | 确认是公开仓库 |

3. **远程是否私有**：默认适配器用本机已登录的 gh 发只读 GET 请求（`gh api --method GET repos/<key>`）。
   - 找不到 gh、没登录、请求失败或抛错，一律显示“未知”，不报错、不要求登录。
   - 实时查询失败，但之前的 GitHub 扫描留有 `private` 结果时，沿用扫描结果，并注明来源和日期。
4. **敏感文件规则**：
   - 匹配文件名 `.env`、`.env.*`、`*.pem`、`*.key`、`*.p12`、`id_rsa*`、`*.sqlite`、`*.db`，扩展名不区分大小写；
   - 另外，任一层目录名为 `data` 的文件也算，按 gitignore 的写法理解 `data/`。
5. **进入待处理**：
   - `src/pending.js` 新增第三个参数 `projectStatus`，与规则模板装入记录的接法相同，由 App 读取后传入。App、首页、待处理页都已接入。
   - 每个在推进项目最多两条：一条是“安全体检发现 N 项问题”，把问题列在说明里；一条是“已 N 天没有状态更新或提交”。
   - 读取失败单列一条。点击只跳到项目空间，不执行任何动作。
6. **什么时候读取**：
   - 没有在推进项目时不发请求（浏览器测试断言了这一点，因此其他页面和测试的行为不变）。
   - 在推进集合或阈值变化时自动重读；只采用最后一次请求的结果。
   - 体检不增加主库 revision。

### 界面（沿用现有令牌、按钮和徽标，不改视觉方向）

- **项目空间顶部新增“在推进 · N”区**：放状态卡、停滞阈值、“重新体检”和超过 7 个的提示。项目行上加“在推进”徽标。
- **项目详情新增“在推进”开关**：用 `aria-pressed` 标明当前状态。
- **新文件**：`src/ProjectStatus.jsx`、`src/project-status.css`。

## 三、改动文件前后 SHA256

| 文件 | 基点 99f87d4 | 本分支 |
|---|---|---|
| server/discovery.mjs | 27740a5ef39062cb68d1cd8c4277379ac5ecc989d9264a391f2e30d944569a91 | a74d3d092746afa49e9e56b11cc14dd45ebe9876c72c6ce657794d33c42c4944 |
| server/http.mjs | 04f8df4aa4d36f382ec76d7359dae69c505220715a3a13f65fd6535f29c6ab52 | 43d49c3665d0516078a856b1d1ffb63a1ac13eb9abe82761dfaccd597ca459f1 |
| server/schema.mjs | 5a426e68d5cc28a6c7bc45a145cb622de9949816f5912f1101394bbe108d08c7 | 3a108c3cc2ec63e5bfc0d628554c965add74be04f0816b8b084d42b49957705b |
| src/App.jsx | 7dfabf9881e84945bcd857360fb2e012bfd7d2180169d504697314b39d4868f2 | 5ff543d0ba143b77fd3aaa56fe4106fb17b4e5cc2238ea8f1105f05ffc80ce94 |
| src/DiscoveryPages.jsx | 85c5052f865333c4b04369e230963a1cbc6f17e2c3d5d02447ec3ac115cb4bf5 | 827b22d67cdf27d91ae565a2c9aaf49f3d327e15e39f3a8429bd263ca492f084 |
| src/Home.jsx | 689eecb65ff1060f430ca3819d08287905bee238d76ce76be5f1dcd1ec8a734f | 8434942aa50eb02ac752eac7298e91cd10ef827a7ceca1d80750ed884ba8068c |
| src/PlannedPage.jsx | 0f092c0dd3365dfbd7401692d82125945d279010dae341a2ef923de800084841 | dd0580408c49e6ec5ce7d165c82a6623f22e643c7e5ec1361767b7bd43d89df2 |
| src/pending.js | 50ac358850626c78a9ff96252618a6b90f7031e54c0920d80d5aca92449f0888 | 43ed86c41235bd7e6e3baa92c428efc0729efdee3ba7f330bb4bbdb70568dd38 |
| server/project-status.mjs（新增） | — | 172252bfa3f095e1cc52d55c5ab8ab1b768e474ce3b1e32c631113e8b4992502 |
| src/ProjectStatus.jsx（新增） | — | 39e03e17e844577810be7938e3e6479e9e438b1b14f40a8f450958a41d13712e |
| src/project-status.css（新增） | — | f4934cba8aa0703846150620a4fba022a518b5eda780ed88d65a0f70865fefdf |
| tests/project-status.test.mjs（新增） | — | 7c0f27c1f098b36836a18069b41e5bfdf4845a864c840ea3dd92744e6b52581b |
| tests/project-status-fixture.mjs（新增） | — | 7762cc8ff6a8b147bedee5c7302fbdba8e44319346e33f49befbf7b100c7313b |
| tests/project-status-browser.mjs（新增） | — | ec0b92e67703f288bd74c85a2b60e5fd426d8e4f2737f7195ecc09b07cf391bf |

## 四、失败测试首跑摘要

- `01-new-test-before.txt`：
  - 第 1 次：模块不存在（ERR_MODULE_NOT_FOUND）。
  - 第 2 次：放入只抛“未实现”的空桩后逐条运行，19/19 失败。其中 schema 与合并备份两条失败的原因是 schema 拒绝未知字段 `active`；重新扫描那条失败的原因是标记丢失。
- `02-browser-test-before.txt`：服务端已实现，前端恢复为基点版本后构建，在第 1 步等待“在推进 · 0”超时失败。
- 测试覆盖：
  - CURRENT 表格解析：正常、别名与转义、缺字段、空值与无表格、超长值、非 UTF-8、截断处的多字节字符、超大文件（协作表在开头 / 在 64 KiB 之后）、符号链接；
  - 停滞：恰好 N 天、超过 N 天、取较新者、未知、一边出错、未来时间；
  - 敏感文件判定；schema 新字段；合并与重新扫描语义；待处理汇总；
  - HTTP：revision 冲突、输入校验、超过 7 个、阈值、三类合成仓库；
  - 只读：项目文件和 `.git` 逐字节不变，revision 不变；
  - 范围外目录、目录已更换、gh 抛错。

## 五、验证命令与首次结果

全部在 Node 24 下运行，日志在 `docs/agents/handoffs/cloud-phase2-projects-logs/`。

| 命令 | 日志 | 首次结果 | 相对已知失败集 |
|---|---|---|---|
| `node --test tests/project-status.test.mjs`（实现前） | 01 | 19/19 失败 | —（预期的首跑失败） |
| `node tests/project-status-browser.mjs`（前端未接入） | 02 | 失败 | —（预期的首跑失败） |
| `npm run build` | — | 通过 | — |
| `timeout 1200 npm test` | 03 | 453 / pass 428 / fail 19 / cancelled 1 / skipped 5 | 与切片 1.3–1.4 云端日志的失败名单逐条 diff 为空：**新增 0、减少 0** |
| 全部浏览器脚本（每个外加 `timeout 600`，只为防挂起） | 05 | 31/35 通过 | 4 个失败都在已知集内，**新增 0**；interaction 本次通过，属于时序波动 |
| `node tests/visual.mjs phase2-projects` | 06 | problems = [] | — |
| 只读解析本副本自己的 CURRENT.md | 04 | 81 KB 截断读取，四项齐全 | 见第七节第 1 条 |

## 六、需要真人确认的视觉点

截图在 `cloud-phase2-projects-shots/`，共 4 张：

1. `1-active-list.png`：“在推进”区的三张卡，其中停滞卡带红边。
2. `2-status-card.png`：状态卡。
3. `3-safety-issues.png`：体检有问题的卡。
4. `4-inbox.png`：待处理面板。

请确认：

- “在推进”区放在扫描工具栏上方是否合适；
- 停滞红边的强度是否合适；
- 状态卡里交接路径用等宽字体显示是否合适。

## 七、未完成项、风险与待确认

1. **路线 2.1 的验收**（本项目的状态卡与 CURRENT 表头逐项一致）只在云端副本上只读验证过：状态编号、当前写入者、唯一下一步一致；最新交接取的是表中第一个链接，“Claude 认领98”，而状态编号已到 104，因为 CURRENT 本身把认领98排在最前。解析器按原文如实显示，是否需要改用别的规则请用户决定。真实应用目录上的验收要在本机做。
2. **`.env.*` 会命中 `.env.example` 这类通常故意跟踪的模板文件**：这是按任务字面规则做的，是否豁免请用户确认。
3. **`data/` 按任意层级匹配**（gitignore 语义），可能把测试夹具目录里的 data 也报出来。
4. **未提交改动算作体检问题**：正在推进的项目经常会因此常驻待处理。每个项目只汇总成一条，但是否只在超过某个数量时才提示，请用户决定。
5. **gh 的默认路径**：按 `/opt/homebrew/bin/gh`、`/usr/local/bin/gh`、`/usr/bin/gh` 顺序查找。云端没有 gh，真实的 gh 查询路径未在本机验证；测试用的是模拟适配器。
6. **远程是否私有只检查 GitHub 远程**（依据扫描得到的 repoKey）。其他托管平台显示“未知”。
7. **项目目录不是自己的 Git 仓库、而是在上级仓库里时**，报“不是 Git 仓库”，不借用上级仓库的结果。
8. **还没做**：路线 2.4 一键开工，以及 2.3 看板，不在本任务范围。本机合入前需要在 macOS 上重跑相称的回归。

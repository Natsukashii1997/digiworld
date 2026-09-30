# v0.12 · 项目身份与目录重关联

状态：本地验证通过、待真人使用验收；两轴审查和精确构建 T2 已闭合，主运行已采用 v0.12.0。完整目标 active，全产品验收未完成。

## 对象与版本

- 未提交本地候选；HEAD/start_head `817b2949ffbaeccae97b610691f2b78c35acb0c0`；应用原本整体未跟踪，保留无关改动，不提交或推送。
- 开工快照 `/tmp/guiji-v012-baseline-Hc6DIK`；最终共同候选 `/tmp/guiji-v012-reviewed-ibLPqL`。早期 candidate/ui2 已由最终版取代。
- 49 个 src/server 文件联合 SHA-256 `9027bf5958e2ce5389e17070c83cb5329d3ea37948290dcda7f9c984b37af339`（相对路径排序，逐项散列路径、NUL、原字节）。
- JS `index-CKLs8b4m.js` SHA-256 `5f36e7c01929b5ef4690295b72489acf03479f05a6fef870e6e33ac7c41715a6`。
- CSS `index-BRtmbx9K.css` SHA-256 `06335f07107841e69b01e60b5d9fe574545d6e3a08c6b3318f80da42c917d69c`。

## 本轮结果与范围

限定目录发现 → 逐路径显示已发现/缺失/未核实/范围外/未识别/待确认 → 从另一已发现项目选择目录 → 预览保留 ID、前后目录、远端与 Current 影响 → 明确确认 → 原 ID 和别名保留 → 重新选择、预览并保存 Current → 复制本机来源交接包。不会搬移、删除项目文件或修改 Git 远端。

默认扫描仍只限已确认根，已登记路径额外核验共享 5000 目录预算；预算耗尽和权限异常不当缺失。目录身份与目录链前后核对，只是有界观测，不是文件系统原子快照。扫描不完整时保留旧身份；同远端初始发现可归并，但两个已有 Current 的项目不静默折叠。双 Current 通用冲突解决、目录拆分、自动推断同名项目关系、后台扫描均不在本切片。

关系预览 5 分钟、最多 20 份，绑定主库 revision、来源身份及扫描范围；确认在串行提交内复查。候选已有 Current、不同已知 remote、真实目录漂移、过期、并发拒绝旧确认。响应丢失先刷新核对，不自动重放。历史 ID 只用于追溯，不授予执行权限。

目录更换可明确接受新远端，预览显示前后值并清除失效的旧远端描述；其他目录远端冲突或未核实时明确停止，不指示无限重扫。Current 来源指针保留，关系代次、项目根链和来源子目录链全部纳入绑定。旧数据兼容读取，但无目录指纹的历史连接需重新预览保存。

## 验证

- 最终完整单元/API **252/252**。两轴各自独立复跑受影响 **44/44**。
- 新项目身份浏览器 **20 组、12 次 axe**；缺失替换、重启持久化、同路径更换、changed 后 unknown、新 remote、双 Current、并发、过期、丢响应、防双提交、关闭迟到、键盘及八档宽度 320/375/390/393/430/768/1024/1440 通过。
- 冻结候选回归：全站浏览器 21、Current 5、Agent 配置 13、Agent 目标 9；迁移另计 2；26 次 axe 均无违规。加新功能合计 **68 组浏览器、迁移 2、38 次 axe**；不是把历史版本测试数累计为本版。
- 机器报告：应用 `test-results/project-identity-ui3/project-identity-report.json`；独立回归 `/tmp/guiji-v012-reviewed-ibLPqL/test-results/independent-regression-report.json`。该机器报告 browserFlows=50 包含迁移 2，本页已分开计数。
- Build、变更文件格式与语法检查通过。没有单独 TypeScript 任务。本轮未增依赖。

实际 RED→GREEN：后补 remote 丢原 Current 身份；双 Current 被吞并；同路径换目录使用新 remote 错误归并；当前未扫描替换可直接重存来源绕过；源子目录同字节替换旧绑定仍有效；不同 remote 无法显式接受；兄弟组件重复 key 导致通知后面板复制；changed 后 unknown 丢失重确认按钮。每项已有永久回归，不仅验证成功路径。

## Standards

初审 P2：unknown 保留 observedIdentity 时缺少重确认入口。独立冻结 UI 反例验证已修复，最终阻塞 0、新硬违规 0。P3 判断性重复状态构造建议明确延期：扫描观测与显式接纳的策略不同，各自有回归；后续扩展统一状态规则时再抽取，不扩大本轮重构。

## Spec

初审 P1：来源子目录未纳入身份；P2：更换目录的 remote 改变导致无限重扫。最终独立同字节替换反例验证 bind/prepare 拒绝旧指纹，重新确认可恢复；新远端预览/接受、其他目录冲突阻断均通过。最终未闭合 0、范围扩张 0。

## UI 与运行态证据

沿用 A v0.2 manifest `bd692d5fdcff8fdf911ceea53b5f1c3e36ce4958c3f3ac7a160c01a3f9d26e22`，Path3/T1 SATISFIED_BY_EXISTING_AUTHORITY，生图 0。共享 Button/Badge/抽屉/语义 tokens 不变，不增加第二个项目看板。

修复重复兄弟 key；预览与确认结果主动定位焦点；unknown 仍提供待确认恢复入口；扫描提示不把“证实缺失”误称“未完成”；GitHub 变化展示前后值。八档长路径无横向溢出，主要操作不小于44px，复选框可用键盘。

最终构建截图：`test-results/project-identity-ui3/` 14 张 PNG，包含 1440 缺失/预览/完成/冲突/新远端、八档预览和局部图；`test-results/v012/` 四张 CUA 1280×720：01-missing、02-preview、03-reassociated、04-context-restored。主代理在隔离运行 `127.0.0.1:50634` 亲自走通重关联→重新预览保存→复制交接包，DOM 核对引用最终 JS。这里只测试合成来源，不代表真实 Agent 已接手。

### T2 Runtime Visual Review

Artifact maturity：runtime；Artifact：最终共同候选；version：0.12.0，Reviewed runtime build 为上文精确 JS/CSS 双哈希。Authority 为上述 A v0.2，独立审查已核验批准记录和包内6/6文件哈希。结构/风格/资产 SATISFIED_BY_EXISTING_AUTHORITY。

Baseline：当前20组浏览器/12态axe通过；审查者已实际目视全部18张精确构建截图，核对 ui3 静态产物与冻结构建一致。子代理的 IAB 不可用，未操作其他窗口；现场 DOM 绑定由主代理验证，不冒充子代理独立现场操作。

Design Read：暖白抽屉集中呈现目录身份、变化与确认，层级服务于核对。Preserve：前后目录分组、等宽路径、主要/返回/禁用动作、完成与Current待确认的连续性、窄屏长路径换行。

| Severity | Evidence | Issue / revision | Decision | Resolution | Protected concerns | Stale / rerun |
|---|---|---|---|---|---|---|
| N/A | 上述18张当前图片 | 无实质视觉问题 | 无需修改 | 无未闭合项 | 导航/内容次序/状态规则/共享组件不变 | 无新增变更，不触发重跑 |

本切片无新动效；截图不替代实际交互、读屏、真机触摸和业务验收。没有视觉证据阻塞。Recommendation：**VISUAL_PASS**；Next owner：主流程交付；Freshness：CURRENT，绑定上述精确0.12.0产物及权威包。后续可见变更需重做受影响QA和T2；仅视觉通过，不代表全产品验收。

## 测试访问偏差与纠正

一条扫描边界 RED 测试在参数拦截完成前误把 `/` 交给扫描器。命令 `node --test tests/project-scan.test.mjs`，测试「扫描拒绝过宽、相对或无界参数；所有参数在探测前校验」，工具证据 chunk `2aa6ae`：该项726.331917ms、总860.743042ms、exit1，无后台会话。可能读取目录元数据及本地 Git remote/branch，未保留 Git 调用计数，不能声称绝未读取 Git 元数据。没有项目正文读取 API、网络调用或写入调用，结果列表未打印。

已向用户同步；立刻停止广根实测，改用注入的零 I/O 文件系统边界，并永久断言无效参数下探测次数为0。除这次偏差外，功能读写验证均采用合成临时项目、隔离主库或模拟 GitHub；未移动真实项目、修改真实远端、配置、Vault、飞书及旧监工。

## 主运行与后续

主服务已实际采用 **0.12.0 / filesystem**，PID **75950**，`127.0.0.1:5178`，cwd 为本应用。根页面/会话/JS/CSS均200，根页面与产物和冻结构建逐字节匹配；`/index.html`不是服务的独立公开路由，最初探测404后以实际根路由核对。主代理刷新IAB用户原tab1，21个项目和revision5保持；打开本应用项目详情看到新身份/目录关联入口，旧无观测数据正确显示待扫描；没有触发真实项目扫描、来源正文预览或修改。

切换前后和IAB刷新后真实主库均 revision5；CURRENT SHA `9cf1a6a3541c30ae148545b42278e441a9a6b1ce33082f7d70d378b923b8a310`，快照 `5-1bee13e6-f633-4dfd-9daf-bc71be2cf6ba.json` SHA `1f9f698413fb3e2fdacbb65e5cebfae7e53237a4c9aab28dd43087666d4d6ac4` 全部不变。旧前端保留在 `/tmp/guiji-v012-previous-dist-3ad6ga/dist`，仅前端副本不冒充后端回滚；完整旧代码见开工快照。隔离测试tab11已关闭，测试服务随后停止；不提交/推送或公开部署。

唯一下一步：K01 限域知识来源连接与只读预览的隔离切片。先固定来源根、类型、身份/权限、范围、断联和 Current/知识正本边界；不自动读取真实 Vault、整理写入或接通飞书。真实资产复用/Agent采用、真人使用、完整 A03/W02/N/M 与 Mac 独立交付继续待验，总目标不关闭。

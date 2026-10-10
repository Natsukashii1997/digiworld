# 派单155｜逐页成熟度与剩余缺口清单

逐页定位以155开工源码为对照；表中“155初始”的行号仅用于复现旧状态，不冒充最终行号。所有(a)本机项均已在156认领期间实现，逐项证据见下表；(b)无数据与(c)路线继续如实保留。开发/验收未读真实data正文、Vault、凭据、私人会话；未启动或探测5178，未做真实调用。

## C-05 逐页成熟度（最终注册表）

口径：标签说明已实现的局部产品闭环，不能替代目标平台采用或真人验收；依赖未核实的外部平台与剩余外部路线保持“部分可用”。十三页逐一列出，health旧链接并入智能体群，不重复算第十四页。

| 页面 | 155旧→最终新 | 理由 |
|---|---|---|
| 世界总览 | 未标 maturity→ready（首页仍无新增页头徽标） | 本机汇总、准确来源范围与跳转可用；只标本页的局部闭环，不按地图子页给总完成度，不据模型意向声称已连通。 |
| 待处理 | draft→ready（草稿→可用） | 当前生产来源已实现统一分诊、发现时间、来源单选、来源加载/失败未知、真实跳转、个人说明采纳/拒绝；页面本来只汇总和跳转，不执行外部动作。未读取来源不能当0。 |
| 资产仓库 | ready→ready | 多类型收录、版本、交付、回收、采用、详情受控发布已成局部闭环；C-03/C-08仅修已知呈现问题。 |
| 逆向工程 | draft→ready | 保存素材草稿→生成包→选Agent且真实复制才记回执→粘贴有效报告→精确锚点→选择候选入库完整。手动交给Agent是本页定义，不是未实现自动派发。 |
| 智能体群 | partial→partial | 发现/目标/清单/体检/受控配置/独立Skill可用；其他Agent仅检测、真实加载未验证、未知格式/跨Agent字段无等价映射不写，gateway在线路线未接。 |
| 项目空间 | ready→ready | 项目识别、状态、在推进、活动、体检、只读GitHub、开工包/复制留痕闭环已实现。Git辅助写入属于另一个路线。Current不可读须未知。 |
| 协同 | partial→partial | 当前本机模板1看板/状态链/交接/复制记录可用，尚不自动向另一Agent发送、接收或云端执行；这些是本单明确暂列路线。 |
| 知识仓库 | partial→partial | Obsidian指针、三区、原文查询、本人Codex候选、确认/写回/回滚与MCP个人说明可用；飞书仍需新来源与授权。 |
| 日历 | partial→partial | EventKit真实平台依赖未首用核验；现有工作台规划块/提醒事项完整，其他日历只读，里程碑来源没有结构化数据。 |
| 随手记 | draft→ready | 本机编辑/列表/任务/五色/复制/炼入焚决，加明确授权的Vault新文件预览/备份/回读/回滚完整；“草稿”可继续指记录状态，但不能当页面成熟度。 |
| AI HOT | partial→partial | 公开接口拉取、本机缓存、分类、收藏已实现；真实接口访问尚未本机验证，源未提供期号/更新时间；拉取失败保留缓存。 |
| 设置 | partial→partial | 数据/备份合并/授权/模型Keychain连接测试/常驻都已有受控实现；Keychain/launchd/网络与实际端口接管须用户首用核验，本轮开发全部桩。 |
| 版本归档 | ready→ready | 固定版本追溯、字段/包文件/行内差异、恢复追加、回收均本机闭环；C-10补能算的长文本计数，不猜超界复杂窗口。 |

pages.js初始相应maturity行：31/50/61/72/83/119/150/163/174/186/222/234；health alias99。同一注册表变更必须精确断言：inbox/references/notes ready，夜巡planned、学习partial、银饰partial逐字段保持。

## C-10 可见缺口逐页清单（155旧状态 → 156最终处理）

(a) 本机已有资料可直接做，本轮实现并有测试；(b) 源/现有记录没有或未被允许读取，原样说明；(c) 新系统/授权/设计路线只列。另分清“尚未读取”的工作状态、正常业务名“规划块”和安全计算界限，不能误称缺外部API。

| 页面/位置（155初始） | 可见字串/触发条件 | 分类、原因、本轮最小动作与验证 |
|---|---|---|
| 首页 Home.jsx:79 | 协同“尚未开发”恒定 | **(a) 本轮已实现** collab已成看板/口令/留痕，改为已实现功能与本机collabLog数量；纯selector测试空/有记录/不虚报已发送。 |
| 首页 Home.jsx:251 | 空态“体检、夜间结果等来源尚未接入” | **(a) 本轮已实现** mergeAgentHealth/pendingItems已接保存体检与晨报，改范围说明“已读取本机来源…未读来源不当无结果”，不得改夜巡能力；测试health已读/未读/失败三分支，night仍按已保存/未读。 |
| 首页 Home.jsx:89 | state.model空就“模型未连接”，有字段仅“意向” | **(a) 本轮已实现** Home仅显示本机模型配置provider并明确“凭据与连通未核验”；真实连接测试在设置的独立授权区。Home事实/SSR断言，不新增status/Keychain/API读取，不由provider推断已连通。 |
| 首页 Home.jsx:82、292/300 | 地图夜巡“计划草稿 · 未启用”和子页planned“规划” | 本轮保护夜巡的共享地图展示，**本轮排除**，单列受保护例外，不据此改夜巡注册项；学习/银饰事实行同样保护。 |
| 待处理 PlannedPage.jsx:191 | 部分事项!triage才“待接入数据：部分来源尚无分诊规则，未归组” | **(b) 未来未知来源输入兜底**，当前所有pendingItems生产类型均有TRIAGE_RULES，不能为未知类别猜分组。测试遍历生产规则、未知类型继续null；不是现有生产路径缺实现。 |
| 待处理 PlannedPage.jsx:200 | aria-label“尚未接入的来源”；正文已说体检仅保存回执、夜巡未运行不计0 | **(a) 本轮已实现** aria名称过时，改“来源记录范围说明”；正文范围真实保留。精确DOM断言无旧accessible名。 |
| 待处理 pending.js:2 | 体检/夜间未来接入注释 | 非可见文案；随(a)如实改注释，登记避免后来误实现。 |
| 资产详情 SkillSourceUpdate.jsx:16 → server/skill-source-updates.mjs:21/26 | status unavailable时“待接入数据：原因”，缺结构化origin、来源资产缺失/归档、来源路径不可安全读取 | **(b)** 原库没有结构化来源、文件缺失/拒绝/不可读。已有local/derived来源可以核验，没来源不能从自由文本source字段猜路径、网络抓取或新origin。保留已有available/unavailable专项。 |
| 资产主墙/详情 | 没有其余“待接入/未接入/规划”缺口 | C-03长标题属本轮呈现修复；第三方Skill自动安全审查、工作流C执行是**(c)**路线，不扩大资产UI。 |
| 逆向 RecordPanel ReverseEngineering.jsx:297 | 未有parseReply成功的有效报告时“批注待接入数据：解析有效报告后…” | **(b) 用户尚未回收有效报告**，report/quote由用户输入才存在；现有有效报告立即显示。可保留如实空态；测试无report/invalid/valid+唯一匹配/unlocated。不得联网抓URL正文或用假批注填空。 |
| 智能体 HealthAudit.jsx:11 | “实际运行采用、Hermes gateway在线情况待接入数据”恒定 | 实际加载**(b) 缺原生采用回执**；gateway在线**(c)**需新服务/授权路线。本轮不真实启动CLI去伪验证。 |
| 智能体 HealthAudit.jsx:14 | loaded但items为空“没有已登记且支持内容检查的Agent；其余能力待接入数据” | **(b)** 没有受支持登记目标，用户绑定后现有体检可用；未知agent格式不可推断。 |
| 智能体 AgentWriteUI.jsx:28 | snapshot字段status非configured时“待接入数据：未配置或布局未适配” | **(b)** 白名单字段未配置，或宿主没有已证明等价映射；不取私人正文/凭据补数据，不跨Agent伪等价迁移。现有fixture覆盖缺字段/未知布局拒写。 |
| 项目 ProjectStatus.jsx:325 | 未有item.daily时“待接入数据”，daily.state非ok时“部分未知” | **(b) 未读取/失败状态**，/project-activity已有30天HEAD可达commit时间+CURRENTmtime，成功就显示本机记录；不可读不能补历史。保留精准loading/error与非全量编辑历史说明。 |
| 项目 ProjectStatus.jsx:320-323 | 总是“当前阶段：未知”，即current已可读 | **(a) 本轮已实现** 复用collab-board.inferStage与同次读取的CURRENT字段/最新状态标题派生stage，无新增扫描或写入；已知writer/heading/handoff设stage，未知仍unknown；测试与协同一致、不读取额外宿主。 |
| 协同 | 当前源码无“待接入/未接入/规划”静态缺口 | stages未知是CURRENT没有推断证据，不补造；自动真实接力、云端任务、Hermes监工、自动通知为**(c)**路线。pages.js:126-130列规划但未在当前路由可见。 |
| 知识 KnowledgeZones.jsx:192 | 没trend.zones时“近7天本机写入/整理记录 · 待接入数据” | **(b) 未连接/未读统计/回执坏**，createKnowledgeTrends已有本机候选与journal；成功即7天按起点与未知，不能从Vaultmtime编完整历史。已有功能不需再实现第二套统计。 |
| 知识 Knowledge.jsx:288 | 飞书知识库“未接入 · 第六阶段 · 需要你单独授权” | **(c)**明确新外部系统与独立授权，不做；原件Obsidian不需搬运。 |
| 日历 Calendar.jsx:821 | “项目里程碑：项目空间暂未提供里程碑数据（可选，尚未接入）” | **(c)**无结构化里程碑事实源，新增数据模型/规则属路线；不能把Current下一步或Git提交日期当里程碑。 |
| 日历 Calendar.jsx:136/185/210/409/426/809/815/898 | “规划块/新建规划块/修改规划块/规划块时段类型”等 | 正常业务对象与交互，**不是缺口**；全部保持CRUD/拖动/IME/busy语义。Calendar旧夜巡草稿图例是保护能力可见反射，本轮不验夜巡。 |
| 随手记 | 当前页无“待接入/未接入/规划”静态缺口 | 本机保存与Vault入口已有。Vault未授权/未指定目录/不存在子目录是门禁配置状态，不代表自动获授权；用户首次使用见C-11。 |
| AI HOT LifePages.jsx:149 | 日报date不存在时“待接入数据”；期号、源更新时间恒定“待接入数据” | **(b)**日期源字段没有或未拉取则未知；期号和sourceupdated接口契约没有。缓存lastSuccessAt只是本机拉取时间，不能替代期号或源更新时间。不修改LifePages学习保护片段。 |
| AI HOT LifePages.jsx:153 | 无cache时各分类数字“待接入数据” | **(b) 未拉取/无法取得缓存**，已有cache立即用真实items.length，不能无cache填0。 |
| 设置 ModelCapabilityUI.jsx:11/12 | costMicrosUsd非safeint则“待接入数据：成本未知”；实际账单恒“未知” | **(b)**连接测试模型清单GET不生成tokens，提供方未给账单字段；不能估0或真实账单。用户当前只验连接测试，不验单书解析。 |
| 设置及共用 capability-ui-core.jsx:21 | plan.canConfirm===false“费用或授权无法核验；待接入数据，本次不能执行” | **(b) 已核验门禁缺条件**，拒绝执行正确；不得移除canConfirm或为通过编价格。该组件共享夜巡/学习，改动不得改变保护片段业务。 |
| 设置 WorkspacePages.jsx:939 | 草稿区Badge“未连接”恒定 | 该区明确“模型连接意向草稿”，不是实际能力状态；为避免混淆可**(a) 本轮已实现**改“仅意向草稿”，当前受控status与连接测试回执仍另外显示；新增精确旧草稿保存不请求API断言。 |
| 版本归档 AssetHistory.jsx:491/587 | 本文或文本包文件diffText.mode===full时“行数待接入数据（长文本）” | **(a) 本轮已实现**人为100k/5000渲染/计算界限。已实现diffLineCounts先剥共同无损前后缀，空侧/单行/无公共行线性精确；≤100k/5000残余LCS精确，全文渲染界限不变。真正复杂超界继续未知并明确安全计算原因；不是“外部数据源没有”。新增计数6项，保留 version-diff.test.mjs 原9项及 triage-long-diff.test.mjs 原4项，同次共19项通过。 |

### 死模板与非可见路线

- PlannedPage.jsx:44“尚未开发，这个页面不会执行任何动作”：PlanDetails与PlannedPage在现App路由没有调用；DiscoveryPages只有unused import。不应按当前13页可见缺口宣称“某页未实现”。若未来再启用需重新审文案，当前登记即可。
- pages.js inbox.plan/health.plan/collab.plan为注册表路线元数据，当前Home/侧栏/搜索只读label/maturity/lead，没有渲染plan.will/route/needs。
- agent-roles.js strengths里的“规划”、代码注释的“规划中”，均非缺口文本。

### (c)明确列而不开发的路线

1. 飞书知识库接入与权限（知识仓库）。
2. 协同真实跨Agent接收/自动发消息、可验证任务派云端或后台、Hermes监工与消息通道试点（协同）。
3. Workflow C本机执行/跨Agent工作流执行，不把固定版本部署包当已执行（资产仓库）。
4. 项目Git辅助写入/提交/推送等，不把已实现只读Git/GitHub统计当此路线完成（项目空间）。
5. 第三方Skill自动安全审查/准入系统，当前生成包与提示需要审查不等于审查已完成（资产/智能体）。
6. 日历项目里程碑模型/源接入（项目/日历）。
7. Hermes gateway在线与原生Agent实际加载验证（智能体），无明确来源/授权不探测。
8. 夜巡跑什么/怎么跑/价值与其他Agent支持、学习全文/PDF解析、银饰深设，均本轮排除，不改变自身代码/样式/注册段。

## (a) 本轮实现与精确测试对应

| 本机项 | 实现 | 新增验证（原断言保留） |
|---|---|---|
| Home协同事实 | `homeFacts` 显示本机collabLog条数与看板/口令，不称已发送 | `dispatch155-home-registry.test.mjs` 空/2条；`ui-dispatch155-data-browser.mjs` 合法0→1复制记录 |
| Home空态来源 | 保存体检与晨报的汇总范围、未读取未知 | Home SSR纯事实与空态；既有pending/browser分支保留 |
| Home模型状态 | provider只标已配置，凭据与连通未核验 | Home事实断言；不增加任何Keychain/API调用 |
| 待处理aria | “来源记录范围说明”，原正文含未读未知保留 | data专项精确新旧accessible名称 |
| 项目阶段 | 同次CURRENT、协同规则；截断读未覆盖state_id时不借用旧标题 | `dispatch155-project-stage.test.mjs` 已知/未知/截断；data专项阶段依据与aria-current |
| 模型旧草稿 | Badge “仅意向草稿”；真实连接在原授权区 | data专项点击真实模型抽屉、精确标签、零外部调用 |
| 正文/文本包行数 | 无损前后缀+有界LCS/线性分支，精确+/-；复杂超界继续原因/未知，原diff渲染限额不改 | `dispatch155-diff-line-counts.test.mjs` 新6项、`version-diff.test.mjs` 原9项、`triage-long-diff.test.mjs` 原4项；data专项100001字正文和包文本、两版无损 |
| 常驻C04、钥匙串C06 | 环境名称选择/MCP/秘密拒绝/最新代码重载；明确错误与一次确认 | 独立单元、HTTP与常驻browser专项；首败与修复详见总交接 |

这里没有未完成的(a)。本轮未新增真实外部系统；(b)/(c)未被隐藏或填入合成数字。业务对象“规划块”、未授权、未读完、费用未知和安全计算界限分别说明，不用它们制造另一套数据源。

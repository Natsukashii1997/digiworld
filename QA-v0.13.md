# v0.13 · 本地知识连接、文件查询与只读原文

状态：本地验证通过、待真人使用验收；最终候选回归、两轴和T2已闭合，主运行已采用v0.13.0。仅 K01 的本地查询基础，不代表全文/语义检索、知识编译、真实 Vault 接通或真人验收。完整目标仍 active。

## 对象与版本

- 未提交本地候选；HEAD/start_head `817b2949ffbaeccae97b610691f2b78c35acb0c0`；应用原本整体未跟踪，保留无关改动，不提交、不推送。
- 开工快照 `/tmp/guiji-v013-baseline-15jzx1`；最终共同候选 `/tmp/guiji-v013-final-DaOkOH`。旧审查候选 `/tmp/guiji-v013-reviewed-Ht5LYH` 保持原样，已被最终版取代。
- 最终 53 个 src/server 文件联合 SHA-256 `3ca7181a5374f75d54fb3cb9664bbe8b414c5af6af7c4242a5fdb8acf44ae6db`（相对路径排序，逐项散列路径、NUL、原字节）。
- JS `index-Ddw2s5r5.js` SHA-256 `91f3b8895d55ae09e185365b9a2dde9ce03a0ae5873810a90576039f1c1b51b2`。
- CSS `index-BvUDRX9x.css` SHA-256 `10389a24ec4cab0c626be27abc6f7e5f706969678a33db59d23958158505f8f6`。

## 用户路径与边界

知识连接 → 填写来源名称、Obsidian/Markdown 类型与明确目录 → 本人勾选只读范围并连接 → 显式扫描 → 按文件名/路径筛选 → 只读查看选中文件原文 → 重新读取核对后复制来源指针。可重新确认目录身份和二次确认断开；断开只移除指针，不删除来源。

主库只保存来源指针及身份/代次，不保存第二份知识正文或文件索引，不改项目 Current。连接本身只检查目录元数据，不枚举文件。扫描索引只在进程/页面内存中，10分钟过期；刷新页面后重新扫描。文件只按明确选择读取，复制不含正文，不授予接收 Agent 权限。

默认上限：20个知识源；每次扫描5000条目、2000个文件、8层、协作式5秒预算；单篇256 KiB。预算不能中断已阻塞的系统调用。仅可见普通单链接 UTF-8 Markdown；跳过隐藏/依赖/敏感命名，拒绝越界、链接、硬链接、特殊文件和漂移。敏感命名筛选不是正文敏感性检测。显示纯文本，不渲染脚本、嵌入或外部图片。

目录链和文件身份前后校验是有界观察式检查，不是 OS 原子快照或沙箱。失稳子树撤回其文件及错误记录，只显示已授权子目录的通用失败；稳定兄弟节点保留。未扫描、完整、部分、零命中、过期、不可访问分开；失败扫描清除旧索引。连接写入需主库 revision，通用保存/备份不能新增本机授权。未知写入响应保留草稿，先刷新核对，不自动重放。

## 最终验证

- 最终冻结候选完整单元/API **284/284**；知识相关32项（文件边界18、管理器11、HTTP3），两轴各自独立复跑32项通过。
- 最终知识浏览器 **21组流程、13次 axe，0 violations、0 errors、failure=null**。证据：最终候选 `test-results/unit-final.log`、`test-results/knowledge-final/knowledge-report.json`。
- 覆盖连接/重开、目录规范化后选中新来源、按路径筛选、脚本及图片纯文本显示、真实剪贴板往返与拒绝回退、切换后的迟到响应、失败刷新撤回、客户端/服务端过期、丢响应核对、防重复提交、忙时Escape、目录更换及重新确认、取消与确认断开、真实部分扫描。
- 八档宽度320/375/390/393/430/768/1024/1440，长路径和正文无横向溢出，主要按钮至少44px，键盘操作通过。
- Build、所有变更代码格式与语法检查通过；本轮未增加依赖。旧全站浏览器对知识占位按钮的断言已改为真实空态和未确认表单，不改产品来迎合旧断言。
- 最终候选已有模块回归：全站browser21、project-identity20、context5、agent-targets9、agent-config13，合计68；迁移另计2；accessibility12、identity12、context2、targets4、config8共38次axe。加本轮知识功能，总计 **89组浏览器检查/流程、迁移2、51次axe**，全部exit0、无违规；不引用历史版本数量冒充本版验证。
- 独立7份日志在最终候选 `test-results/v013-regression-logs/`，已复制到应用 `test-results/v013-final/`；完整单元日志和最终知识报告也已复制。browser/identity/context/targets/knowledge的pageerror断言为空；migration/accessibility/config未内建该监听，不宣称全套浏览器控制台零异常。

## Standards 与 Spec

共同绑定上述最终源码与构建。Standards 最终 P1/P2 为0，无新增 P3；Spec 最终未闭合0、范围扩张0。

- Spec P1：目录在打开期间被替换为链接时，外部条目的错误记录可能残留。已在首次读取记录前重验目录链；末次失稳同时撤回 files/issues。两个永久回归均先RED再GREEN，独立反例外部目录 read 次数0，句柄关闭，返回只含授权子目录通用信息。全部复现使用合成临时目录，未涉及真实知识库。
- P2：共享 Dialog 的 Escape 回调可能捕获初始 busy 状态。Knowledge 的 onClose 改为检查实时 lock，不改共享组件。独立实际浏览器验证保存中Escape不关闭、取消禁用、丢响应保留输入。
- 前置只读检查发现读取期间索引到期仍可能返回正文，已增加读取完成后的期限校验并清掉旧凭证，永久回归通过。并发断开/重新扫描、首用知识模块保留默认项目根、伪造知识授权备份等边界已有测试。

## UI 迭代、流程检查与 T2

沿用已批准 A v0.2，manifest SHA `bd692d5fdcff8fdf911ceea53b5f1c3e36ce4958c3f3ac7a160c01a3f9d26e22`；批准依据为同级批准记录，manifest及6个成员哈希核验一致。Path3，结构/风格/资产 `SATISFIED_BY_EXISTING_AUTHORITY`，生成预算0；复用 AppShell、Button、Badge、Dialog 和语义 tokens。

迭代修正：刷新核对从标题主操作移到状态行，避免393宽拥挤；选中项次级文字改用既有 ink 保证对比；原文区域补焦点样式；新来源采用新增ID定位，避免规范化路径导致选错；保存期间Escape与迟到响应保护。页面只呈现功能与必要权限/状态，不新增宣传卡。

主代理亲自用 IAB 走通最终完整候选 `127.0.0.1:54411` 的连接→扫描→筛选→原文→复制反馈→刷新恢复。DOM引用最终JS；`test-results/v013-cua-final/04-final-source-preview.png` 为最终源码运行画面。前3图为相同最终UI、后端最后竞态修复前的合成流程，只作为UI证据，不冒充最终后端采用。原文中的script和图片语法保持文本。

IAB复制看到成功反馈，但其虚拟剪贴板工具没有可粘贴内容，未能据此验证原生剪贴板；不把工具限制报成产品缺陷，也不声称IAB原生复制已独立验收。最终headless浏览器已实际验证navigator.clipboard读写和拒绝回退。

### T2 Runtime Visual Review

Reviewer：design-taste-frontend；Artifact maturity：runtime；version0.13.0；精确JS/CSS为上文哈希。视觉审查构建 `/tmp/guiji-k01-ui-hHaHzg/escape-fixed-dist` 与最终候选前端逐字节一致。最终后端修复没有可见变更。

实际逐张查看应用 `test-results/knowledge-escape-fixed/` 的14张图片：1440预览及裁切；八档长路径/正文/复制回退；空扫描、连接错误、partial及重新确认。基线21流程/13次axe无违规；T2审查本身不冒充重跑。主流程在最终完整快照重跑同一浏览器套件也通过。

Design Read：来源选择、扫描结果和原文预览层级清楚；暖白底和橙色主操作保持克制。Preserve：一致选中提示、桌面双栏/窄屏纵排、长路径换行、失败和来源核验分层。

| Severity | Evidence | Issue / revision | Owner / decision | Resolution | Protected concerns | Stale / rerun |
|---|---|---|---|---|---|---|
| 无 | 上述14张当前图片及1:1裁切 | 无需视觉修改 | 共享组件与tokens原所有权 | 无未决发现 | 结构、语义、权限及可访问性不变 | 未触发；主流程仍完成最终浏览器重跑 |

Recommendation：**VISUAL_PASS**。Next owner：主流程。Freshness：CURRENT，仅绑定上述精确前端及权威包。静态截图不证明原生设备、动态效果、VoiceOver或业务验收；后续可见变更需重跑受影响QA与T2。

## 主运行与后续

主服务 `http://127.0.0.1:5178/#knowledge` 实际采用 **0.13.0 / filesystem**，PID **88136**，cwd为本应用。会话、主库和根页面/JS/CSS均200，根页面与静态资源逐字节匹配最终冻结产物。主代理刷新用户原tab1，21个项目与revision5保留，再通过导航打开真实知识空态；没有连接或扫描实际目录。主界面截图 `test-results/v013-cua-final/05-main-v013.png`。

切换前后及页面刷新后，真实主库均revision5、知识连接0；CURRENT SHA `9cf1a6a3541c30ae148545b42278e441a9a6b1ce33082f7d70d378b923b8a310`，快照 `5-1bee13e6-f633-4dfd-9daf-bc71be2cf6ba.json` SHA `1f9f698413fb3e2fdacbb65e5cebfae7e53237a4c9aab28dd43087666d4d6ac4` 不变。旧前端移存 `/tmp/guiji-v013-previous-dist-vqSnvB/dist`，不是完整后端回滚；完整旧代码在开工快照。隔离tab13/14和对应服务已关闭，最终合成树由fixture退出清理。没有删除用户资产。

测试全部使用合成目录、模拟发现和隔离主库；未扫描真实Vault、读取真实正文、写Agent配置/飞书/远端，未接通历史监督系统。没有公网部署、提交、推送或新增第三方依赖。主服务采用不等于真实知识来源与用户验收通过。

唯一下一步：K01有限正文查询切片。基于已确认来源，明确查询触发、文件/字节/时间预算、结果片段与来源校验、部分失败和失效规则；仍先在合成来源中验证，不自动扫描真实Vault、不调用收费模型或写回知识。K02编译与主动整理、飞书、真实使用及完整A/W/N/M/Mac交付仍待做，不以本切片关闭总目标。

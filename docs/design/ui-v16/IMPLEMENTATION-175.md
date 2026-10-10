# UI v16 派单175：银饰与随手记实现小合同

本批已由WB-20261005-179输入，正式认领180。批准两份排队稿/brief04第二第三版与brief05/八HTML/两节CSS是视觉与交互事实源；不另改方向。仅合成fixture、隔离运行器；5178零访问，data仅CURRENT.json哈希，不接真实Vault/私人会话/凭据/照片、不安装或提交推送。资产仓库页不改。

## 银饰数据与备份

原silver.wall/categories/items及旧ID原样保留，访问不写迁移。新增可选targets四键ring/necklace/bangle/pendant，整数1..999；wishes数组最多2000；wall可选name≤60。新item用categoryKey，旧item用categoryId，恰有一个。旧category.name精确四个中文名称归入固定显示类，同名目标相加；显式targets覆盖展示。手链不是手镯，其它类与回收历史在?中只读可见；主计数只计四类，原categories目标不修改。

心愿含id/wallId/categoryKey/createdAt，可选updatedAt/deletedAt及成对fulfilledItemId/fulfilledAt。来源、类与item关系全核，item最多实现一个心愿；活动来源+类重复请求幂等，不生成第二条。收录与心愿实现一次revision保存；已实现心愿保留固定fulfilled关联。关联藏品回收后不重置为待实现、不允许第二次实现；暗格恢复空位，恢复原藏品后重新点亮。来源墙回收不级联删除心愿。取消心愿软删；恢复需重复校验。格子顺序已收录→待实现心愿→暗剪影，数量max(target,filled+pending)，目标降低不删对象。

品牌以author.trim/NFC/casefold分组，仅用于派生，不改原字段。最新createdAt活动记录主推、同时间原顺序稳定；No序号按全部wall加入时间升序含回收。默认4张预览、扇开访问全组；超过5品牌扩画布带，390容器内横滑，无body溢出。

四个批准默认剪影仅用于暗格/心愿，不冒充真实已收录实物剪影。已收录用原Outline透明PNG白边；自动抠图不可用时保真实照片与记录、详情手动PNG与重试保留。失败不点亮/不半保存。只有一次新收录成功才点亮。

批准页头承诺“不进备份”：主库保图片文件名引用，普通JSON仍无bytes；完整备份从本批起明确排除silver/实体（旧已导出的备份仍可恢复到隔离新目录），reverse-media/保持收录。这是旧完整备份行为的定向需求变更，保留旧测试前后SHA，逐条说明，不通过删除主库银饰元数据解决冲突。merge只补缺失记录/targets，原已有编辑保留；同ID归属/心愿关联冲突整次拒绝。

## 随手记行文档与保存

存储仍text+format md1，NOTE_MAX20000按序列化JavaScript长度核，不trim掉首尾/空行。只支持段落、UL/OL/task与五色。行文档保原行raw、原prefix及run来源；无动作serialize(parse(x))逐字===x（包括空行/末行、UL*、OL各自编号、taskX和可选空格/制表）；只重写实际编辑的行/片段。旧plain记录的列表/字色符号不解析，普通文字修改仍保旧format，明确使用列表/字色才转md1；转成md1时字面[字]{red}按既有无转义语法识别，这一已知限制如实列出。

颜色不能表示方括号/换行，选区内不可表示的字符保持纯文本，其余子段可染色，不删字、不扩协议。选区同色再点取消，无选区改变后续输入色而无占位字。列表按钮只改覆盖行，末端offset0不误包括下一行，已同类则取消；保非改动行prefix。有序快捷仅普通行用户逐字输入1.空格；IME/paste不转，-空格/[]空格不转。list Enter空项退段落、首Backspace退段落；粘贴text/plain，拖放不产生富结构。

共享受限contenteditable按行id+可见UTF16偏移映射双向选区，避免代理对拆分。beforeinput可取消时走纯事务，composition期间禁止保存/快捷且不重绘，end后最终input合并一次；原生fallback只读受限节点纯文本。工具条pointerdown保bookmark，keyboard使用最后有效编辑器选区；色板Esc回色按钮。新草稿本页留存，离开丢；旧便签外点自动保存、Esc取消。保存false界面回原文，另保失败attempt以重试，不吞App原revision冲突提示；busy锁避免重复保存。checkbox先显示再save，失败回原文；不改原at/refined。炼入原RefineDialog/addEntry继续用，按下炼入时捕获正文有效选区，失败不推进。

墙按at倒序稳定，id确定±1deg。三/二/一列用一份DOM，空白新便签第一格，编辑跨两列，reduce全无倾斜；长正文渐隐+展开。390一排工具条/五色弹层/sticky配VisualViewport键盘遮挡补偿，实机键盘未验不声称已验。

取消notes内Vault入口/更多菜单/旧raw筛选/顶textarea/语法提示；VaultWriteDialog个人提案用途、note后端/回执/pendingNotes不删。待处理死指引改只读回执说明，原数据留。旧Vault UI业务在隔离真实组件宿主保留全部API/忙/失败/未知/回滚断言，新增产品入口不存在断言，不新增生产测试路由或放宽CSP。

## 验证与交回

先银饰专项最小闭环，后随手记专项；两页终态一轮npm test、全部独立浏览器入口与visual全绿，发生新失败修复后重跑必要终态而保首败。8组银饰+8组notes叠图逐区理由，同输入改前改后、旧数据兼容、md1往返清单、CSS清理、Vault引用去向、分页断言前后SHA/完整日志齐交。工程检查、服务采用、真实使用、Claude/用户验收分开。其余9份queued不自动认领。

## 终态实现补充（待182工程交回）

- 原生IME结束后的相同文字只作为DOM对账候选，不按“文字相同”直接preventDefault；DOM未变则不入history，DOM真实变化按冻结的StaticRange/选区提交，避免无keydown原生同词输入丢失。真实OS输入法仍须用户环境验证。
- 保存失败的attempt冻结原ID、原at、before/note/doc。显式重试先GET本机工作区：已提交且内容相同则只采用，不再次PUT；其它页面已修改则保未知/失败输入而拒绝重放。解析/超限失败恢复原文档与bookmark。
- 银饰详情的grid列与文字栏采用minmax(0,1fr)/min-width:0；同品牌缩图容器最大100%，只在容器内部滚动，320/390第五张完整可达。保留原44px与整页边界断言。
- 静态稿的强制长文折叠演示只作为视觉提示；产品按真实正文>220px判定，未超阈值不制造折叠。所有旧长文几何检查先验证折叠确实存在并显式展开，再运行原阈值。

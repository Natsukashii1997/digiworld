# A02 / R01 · 目标 Skill 副本与固定版本核对 · v0.10

状态：本地验证通过、待用户验收，主服务已采用v0.10。完整目标仍active。start_head `817b2949ffbaeccae97b610691f2b78c35acb0c0`，现有未提交内容保留，不提交/推送。当前需求继承产品蓝图A02与资产语义，不把只读核对替代最终安装/采用/恢复。

用户结果：资产Skill详情 →「目标副本」→ 选定已保存管理目标与确定资产版本 → 明确「查找已有副本」→ 在显示的目标Skill目录内选择一个候选 →「预览对比」→ 核对完整路径、版本、文件变化及权限未知 →「确认关联」。之后重开仍保留；可「重新核对」，在资产更新时仍比原固定版本并提示有新版；可二次确认「解除副本关联」。Agent管理目标中能看见关联资产并进入详情。

关系仅表示用户指定此路径与某固定版本的对应关系，不证明工作台已复制/安装、安全审查通过、目标已启用或实际任务使用。内容不同时允许明确保存“存在差异”的关系，绝不覆盖任一端；无证据时显示待核对。程序是否运行不是内容核对的依据。

范围/权限：本轮只核对Codex/Hermes已绑定Home的受支持Skill根；用户共享、项目与插件来源不由此自动授权或归属某目标。选定目标后显式查找仅枚举候选元数据，点击一个候选才读取其完整包；重新核对只读已关联的一个路径。主库只保存关系及预览确认时的内容指纹/时间，不保存外部包正文或长期“当前一致”状态。真实Agent配置/凭据/聊天不读，源包不安装、不执行、不写。运行验收只用隔离合成包，真实机器不自动扫描/读取私人包。

唯一事实源：`connections.skillCopies` 可选，schema=1，每项{id,assetId,versionId,targetId,targetSignature,scopeSignature,root,location,boundFingerprint,boundAt}。targetSignature固定品牌、程序路径/类型、Home身份/路径及绑定代次bindingId（改名不改变，改绑改变；A→B→A不恢复旧代次，旧目标同绑定编辑不强制迁移）。scopeSignature固定Home及Skills根目录链身份，目录被替换后必须重新关联。关系id稳定；同target+location只允许一条，可通过明确新预览关联到另一固定版本，保持id；同内容重复确认不增第二条。最多1000条。备份导入不激活外来连接；通用workspace不能伪造。目标解除/改绑或资产归档/版本消失不删关系，不自动重指或读取旧目标；明确显示目标缺失/目标变化/资产不可用。清理演示保留被副本关系引用的资产；解除关系不删除原目录。

接口（均POST，沿用本机会话/Origin/Host保护，字段严格校验，无任意路径输入）：
- `/api/skill-copies/discover` {assetId,versionId,targetId}：从服务端当前主库和目录适配器解析范围，返回{token,revision,at,expiresAt,roots,items,errors,truncated}；读取失败/截断不伪装无副本。每份扫描token5分钟，最多20份。
- `/api/skill-copies/preview` {token,candidateId}：只读完整包，返回{token,revision,expiresAt,targetId,targetLabel,assetId,versionId,versionNumber,root,location,fingerprint,comparison}；comparison={status:identical|different|unverified,permissionsKnown,counts:{expected,actual},files:[{path,status,changes,expected,actual}]}，无包正文。独立预览token5分钟、最多20份。
- `/api/skill-copies/bind` {token,revision}：重新核对固定目标签名、当前发现Home/根身份、候选实际位置/身份、完整内容指纹、主库版本及提交时令牌有效性，再只写关系；返回完整主库。来源/目标/主库变化拒绝并保留选择。旧关系改版前显示既有映射，不静默替换。
- `/api/skill-copies/check` {id}：按当前目标关系/范围只读单个包，返回{id,at,status,message,comparison?,location,versionId,versionNumber,hasNewVersion}；status可为identical/different/unverified/missing/blocked/target_missing/target_changed/asset_unavailable。网络/读取失败不沿用旧结果为当前；不写主库。
- `/api/skill-copies/remove` {id,revision}：二次确认后只删对应关系，期望主库版本保护，返回完整主库。

内容比较：以唯一SKILL.md所在目录为根，去掉ZIP外包目录，不靠目录名猜Skill身份。比较文件集合、原字节、类型和已知普通权限，保留空目录/二进制/隐藏资源；ZIP省略非空父目录不单独制造内容差异，但权限未知必须标明，不能把未知权限说成完全一致。`different`有已证差异；`unverified`内容相同但权限信息不完整；`identical`所有比较项一致。不会猜安装版本号，不会把名称相同当内容一致。

实现seam：一个后端模块统一有界发现、单包读取、预览确认及关系核对，复用现有完整包读取与目录适配器，注入真实文件主库、目录适配器和时钟以便隔离测试。纯比较函数单独测试ZIP包装、目录、字节/权限。前端使用现有共享主库adoptState，不另存副本库。

UI：继承已批准A v0.2 manifest `bd692d5fdcff8fdf911ceea53b5f1c3e36ce4958c3f3ac7a160c01a3f9d26e22`及批准记录，Path3/T1 SATISFIED_BY_EXISTING_AUTHORITY，生图预算0。用现有Tabs/Button/Badge/原生表单与按需详情，无营销区。可见目标、完整路径、固定版本、最新检查时间和待核对边界；每端最多300项，合并差异按每次50项展开，不渲染包正文。选择改变立即清除旧预览，失败保留输入、禁用旧确认，检查失败旧结果标过期，迟到响应不得覆盖新选择或复活关闭界面。

验收：TDD逐闭环；完整持久化及改版固定版本、源变动/缺失/受阻、Home/目标改绑/解除、来源身份替换、5分钟过期与20份淘汰、并发/重复/响应丢失、归档/备份/演示清理兼容；HTTP越界拒绝，源内容与配置哨兵不变。浏览器真实完整包→比较→确认→重开→源变动→核对→解除，桌面/320/375/393/430、长路径/异常、键盘/axe。独立Standards/Spec及同构建T2通过后才报告本地验证通过。真人复用与真实配置采用仍待验。

结果：153项单元/API、74组浏览器、37态axe、迁移/容量各2项通过；独立两轴0未闭合，T2为VISUAL_PASS，主运行与冻结构建一致。精确源码/构建、修复反例、隔离边界及主库不变证据见 [QA-v0.10.md](QA-v0.10.md)。

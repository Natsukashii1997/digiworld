# v0.9 程序版本与本机管理目标 · 2026-09-26

状态：本地实现、隔离回归、独立两轴审查与最终T2通过，主服务已采用，待真人使用验收。A02 子切片，不是完整实例治理、真实配置采用或全产品上线；持续目标仍 active。

## 精确候选版本

- 版本 `0.9.0`，未提交本地候选，无远端推送或公网发布。
- start_head / HEAD：`817b2949ffbaeccae97b610691f2b78c35acb0c0`。应用原先整体未跟踪，已有父仓库改动保留；范围只按本轮快照差异核对。
- 开工 `/tmp/guiji-v09-baseline-ddTef3`；共同初审 `/tmp/guiji-v09-review-eo9VRc`；后端修复复核 `/tmp/guiji-v09-final-NhFGT7`；视觉修复后最终共同快照 `/tmp/guiji-v09-visual-final-Hwrflz`。仅源码、测试、构建、包信息及切片契约，无真实主库或私密配置。
- src/server 联合 SHA-256：`483dac4e3919f08aedf26e83e0f5e09f827671b978a835d2825037f04f82b0bf`。相对路径排序，逐项散列路径、NUL、原字节。
- JS `index-D2jsZxda.js`：`2d1b3b11cdca8aef7237ad17fa75e4299a7614d84991cd6754298b31442b3d9e`。
- CSS `index-CtZyWb5Y.css`：`2860b0fa598d8f2f7262d887647df8f7cbfb64933487beef746ab42143319575`。

## 用户结果与权限

Codex/Hermes 详情 → 检查版本与目标 → 明确选择程序与 Home/Profile → 命名保存 → 重开、编辑与重新核对 → 二次确认解除。选择前无默认绑定；选择后完整位置可见。状态是路径可用/缺失/受阻/待核对，不代表运行、登录、连接或启用。真实机器只做元数据核验，保存/解除验证使用隔离主库。

`connections.agentTargets` 只保存用户选定关系及稳定身份；通用 workspace 写入不能伪造，备份不自动激活外来关系。相同关联不重复创建，名称或程序/Home 变更保持目标 id。短时选项5分钟、最多20份，目标最多100个；保存前重查目录链/程序身份，串行提交时再次检查令牌身份与期限。来源或主库变化、部分枚举、截断、过期均拒绝旧确认，保留草稿。解除只删工作台关系，不卸载或删除目录。

版本依据限白名单安装元数据：Codex `codex-package.json` 或合法 npm 包与入口声明、App Info.plist bundle 身份；Hermes 同 venv 下 dist-info 的包名/版本和 console_scripts 入口。App 版本不冒充内嵌 CLI 版本。文件读取64 KiB上限、普通文件与目录链核对、拒绝符号/硬链接与特殊文件；非阻塞打开避免 FIFO 挂起。Hermes 目录有枚举上限，多候选歧义拒绝猜版本。App plist 使用固定系统解析器，不执行 Agent。元数据声明不是代码签名认证或实际进程版本；目录链检查不是 OS 级原子快照。

没有读取真实 Agent 配置正文、凭据或聊天，没有安装/启用/执行资产，没有改 Vault、飞书、远端仓库或旧监工。现有上下文接力、目录来源与本机资产交付规则保持不变。

## 测试与实际反例

| 项目 | 结果 | 范围 |
|---|---|---|
| 单元/API | 112/112 | 原89 + 程序版本13 + 发现2 + 目标7 + HTTP1 |
| 浏览器 | 65组 | 原56 + 目标9 |
| 迁移/容量 | 各2 | 旧库及备份往返；101/300文件历史差异 |
| axe | 31状态零违规 | 原27 + 目标正常/编辑/失败/部分结果4 |
| 响应式与键盘 | 通过 | 320/375/393/430，完整路径换行，焦点环与Esc |

命令：`npm test`、`npm run build`、README 所列全部浏览器/迁移/容量/可访问性脚本。最终后端修复后重跑全部112测试和新增9组浏览器；旧56组及独立axe、迁移、容量在本轮通过。随后视觉修复仅增加局部错误换行，JS字节不变；所有受影响目标9组、目录7组、全站21组及目标4/目录4/全站12态axe在最终构建重跑，未受影响历史/交付/工作流/迁移/容量同轮证据保留。所有写测试使用隔离端口、文件主库和合成源，源程序/配置哨兵不变。

RED→GREEN：版本适配器从不存在到白名单安装布局支持；HTTP 404 到受会话/Origin保护的专用接口；目标同路径来源身份被替换必须409；原界面没有管理目标到新增闭环。明确未知/受阻、不执行程序、链接/特殊文件/枚举上限/读期间替换等均有隔离回归。

实际 IAB 操作发现长路径在原生 select 截断，保存前无法完整核对。先加可见 `code` 的精确路径反例（0/预期1，实际失败），再在程序与 Home 选择框下展示完整路径、程序选项前置文件名。四档窄屏无横向溢出，最终9组与4态axe通过。首次部分结果、刷新失败、保存503、提交成功但响应丢失、跨页并发、旧请求晚到、缺失来源和解除取消均已覆盖；不以HTTP200等同完整检查。

独立T2随后发现“partial长路径错误把检查动作挤出抽屉”，原body宽度断言漏掉内部溢出。新增反例实际RED：320px抽屉 scrollWidth=500、scrollLeft=180。仅为现有错误文本增加受控换行；GREEN在320/375/393/430分别核对抽屉内部宽度、错误文本自身和左右边界、检查按钮完整处于视口。测试 `tests/agent-targets-browser.mjs` 最终SHA-256 `539a895ba0064f206ddef68f4b7c5eda2d77f4540f6aeb4ab516f1ca4bbbf23f`。初审T2和旧截图失效，七图全部在最终构建重拍并重新打开。

## 两轴独立审查

### Standards

初审1项P2：令牌只在请求入口检查，复查与排队期间过期仍可能写入。新增复查过期/串行排队过期/20份容量淘汰反例，实际 RED 为 Missing expected rejection，再在提交回调核对同一令牌及期限。独立原反例最终409、未提交、目标0；最终14项目标/发现测试通过。固定 smell baseline 无额外建议。最终未闭合0。

### Spec

初审2项P2：上述令牌问题；另 `ChatGPT.app` 仅按是否Codex分流，错误 bundle 身份也被认作ChatGPT。错误身份反例实际 RED 后改为正向 `com.openai.codex` / `com.openai.chat` 匹配，错误/缺失/受阻不登记，真实身份与Codex别名仍支持。独立在最终快照重跑两个原反例：无关bundle不识别，过期409且主库与revision不变；14项目标/发现通过。最终两项已闭合、新增0。

两轴使用相同冻结快照独立审查，结论仅限本切片；不替代真人验收。

视觉修复增量两轴分别核对 `NhFGT7 → Hwrflz`：只有局部错误换行及其回归断言，后端无变化、旧P2闭合仍有效，新增0。此最后一步为静态增量复核，没有冒称再次跑完测试。

## 实际流程审查

按 product-design:audit 检查“检查 → 编辑 → 保存回读”，现有批准 A 方向，IAB 隔离环境1280×800；无新增外部画布。三图均当轮保存并重新打开查看，后端两个门禁修复不改变此UI构建，门禁行为由最终隔离测试验证。

1. **检查：可用。** 程序证据、管理目标与目录来源分层；路径可用不冒充运行。

![检查版本与目标](test-results/target-final-audit-01.jpg)

2. **编辑：已修复长路径核对缺口。** 原生选项保留简短可辨的开头，下方完整位置可换行核对；保存与取消同组。

![完整路径编辑](test-results/target-final-audit-02.jpg)

3. **保存：可用。** 同一目标改名保持身份，成功提示未修改配置；重新检查后显示路径可用。重开与解除的行为证据来自浏览器脚本，不由截图推断。

![保存与回读](test-results/target-final-audit-03.jpg)

## T2 运行态视觉

Gate：T2；Artifact maturity：runtime；Artifact version：v0.9.0；Reviewed runtime build/hash：本文件精确 JS/CSS。四张浏览器最终截图为 `agent-targets-desktop.png`（1440×1000）、`agent-targets-editor-320.png`、`agent-targets-failure-320.png`、`agent-targets-partial-320.png`（320×900），另含上述三张 IAB 图。批准 A v0.2 manifest `bd692d5fdcff8fdf911ceea53b5f1c3e36ce4958c3f3ac7a160c01a3f9d26e22` 及独立批准记录，结构/风格/资产继承，T1 SATISFIED_BY_EXISTING_AUTHORITY，生图0。

Baseline QA：上述同轮功能/响应式/axe及修复后的针对性重跑。独立审查者实看最终七图、核对哈希，原TUNE已替代为VISUAL_PASS。Design Read：管理目标、路径和异常稳定落在抽屉边界，窄屏恢复留白与可见动作。Preserve：完整路径、稳定目标层级、暖白/橙色共享控件、失败保留草稿。

| Severity | Evidence | Visual issue | Bounded revision | Decision | Resolution status | Resolution evidence/reason | Protected concerns checked | QA made stale | QA rerun |
|---|---|---|---|---|---|---|---|---|---|
| important（原发现） | 最终partial-320 | 原长错误横向溢出、检查按钮移出 | 现有错误文本受控换行 | accepted | resolved | 独立实看20px留白内完整折行，检查按钮完整可见，卡片/草稿不横移 | 字段、状态、流程、文案含义、色彩和组件边界不变 | 初审T2、旧七图及受影响布局证据失效 | 四档内部边界、相关功能与axe通过，七图重拍并复审 |

Recommendation：VISUAL_PASS。Freshness：CURRENT，仅覆盖最终JS/CSS和七图；新可见修改须重验。Next owner：主流程。375/393/430是主流程测试证据，不冒充审查者亲眼看图；静态截图不能验证动效。VoiceOver、触屏真机、真人使用与全产品验收未由此结论证明。

## 主运行与未完成

主服务 `http://127.0.0.1:5178/#agents`，验收时PID22586，接口实际 `0.9.0 / filesystem`。HTTP JS/CSS与最终磁盘构建逐字节相同。IAB原用户页已刷新并打开Codex详情，点只读检查后显示三个程序入口及安装包/App版本；`test-results/agent-live-v09.jpg`已保存、重开核对，是采用补充证据，不冒充独立T2的第八张审图。卡片列表仍保留原时间戳扫描快照，没有为演示而重写主库。

真实只读接口：Codex CLI安装包声明0.154.0；名为ChatGPT.app的Codex bundle声明26.917.71314；内嵌CLI自身版本未知，仅可单列容器版本。Hermes同venv Python包声明0.21.1。Codex可绑定Home1个（共享资产排除），Hermes默认Home及supervisor-t01 Profile共2个；均0错误，已保存目标0。只读取安装和目录元数据，不执行程序，不代表真实运行版本或Profile已采用。

真实主库在测试、重启、接口和UI核验后仍 revision3，快照 `3-ce398cc9-0c8d-49ee-b48a-6d4681e70fec.json`，实际SHA-256 `d5ba8dbbbb830e3c49fed482ccfb7800100c8dc5cfe07818444337bab82926b5` 未改变。没有保存真实目标或扫描真实Skill包。临时验收页/服务已关闭，其自建合成目录已清理；原用户页保留，视口恢复默认。审查快照与项目验收图保留。

未完成：真人使用、S07代表性资产复用、目标副本与漂移关系、配置摘要/应用/采用/恢复、修复、知识连接、模型路由、夜间执行及独立Mac产品交付。下一安全切片为已绑定目标与资产副本/版本关系的只读核对和隔离实现；真实写入按具体目标另行确认。

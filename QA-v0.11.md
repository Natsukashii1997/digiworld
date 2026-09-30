# v0.11 · Agent 配置概览与受控变更

状态：本地验证通过、待真人使用验收。两轴独立审查及 T2 已闭合，本机运行服务实际采用 0.11.0。完整工作台目标仍 active；本次只完成 A02/A03 的显示设置切片，不代表全部配置管理、采用检查或产品上线完成。

## 精确对象

- 未提交本地版本；start_head / HEAD `817b2949ffbaeccae97b610691f2b78c35acb0c0`。应用原本整体未跟踪，无提交或远端推送，保留父目录其他改动。
- 开工基线 `/tmp/guiji-v011-baseline-uPfBGh`；最终共同代码候选 `/tmp/guiji-v011-reviewed-RLfK8V`。早期 `/tmp/guiji-v011-final-nB1ZnS` 已被修复版取代，不是最终交付对象。
- src/server 联合 SHA-256 `a99fe88ffde8bc89d583a4da0c18283ab5b0b7295fcfae1d66d100a5d5e17ef8`：相对路径排序，逐项散列路径、NUL、原字节。实际运行源码与共同候选一致。
- JS `index-DzS2Nl9r.js` SHA-256 `e46c7974bb6a25da67df009db716449ce9a2fdef8c4d055db66f939cd9737933`。
- CSS `index-HU-gfrAP.css` SHA-256 `3333d9b11e56cb2a332ef63321ee4ad936adc461a57f4edbc5fc2d30c45aa1a0`。
- 旧主界面 dist 可恢复副本 `/tmp/guiji-v011-previous-dist-f4izPt/dist`；它仅是旧前端，完整旧源码基线见上，不把替换前端当作后端回滚。

## 可观察结果与边界

已保存的 Codex CLI / Hermes CLI 管理目标 → 明确读取 Home 配置 → 选择白名单字段 → 前后值与完整路径预览 → 勾选确认 → 应用并回读 → 查看历史 → 重新预览并确认恢复。

Codex 仅 `tui.animations`、`tui.show_tooltips`；Hermes 仅 `display.bell_on_complete`、`display.show_reasoning`。未设置与 false 分开，其他层可能覆盖；Codex App 不冒充 CLI。模型/API、凭据、权限策略、Hook/MCP、任意文本编辑、自动重启和进程实际采用尚未接入。结果始终明确「采用未验证」。

解析采用固定依赖和白名单投影；原字节、注释、换行与未选字段保留。原子文件替换前先持久化最小 prepared 记录；新 journal 目录同步其父目录。来源身份/hash、uid/gid/mode、目标绑定与目录身份、主库版本、预览期限反复核验。恢复只允许原写后状态，不覆盖外部改动。macOS 扩展属性/ACL 约束、容量与格式限制见 AGENT-CONFIG/README；不承诺抵御恶意本机进程的连续目录竞态。

未决操作以固定 ID 回读，当前浏览器会话刷新或重开仍保留锁。读取/新预览/新应用受阻；未知或其他 ID 不能解锁。只有同 ID 的确定状态，或后端可证明源写入尚未开始的明确旗标可以解锁。普通 4xx、网络失败、未知 token、已有记录读失败和写入启动后的错误都不被当成「未执行」。

本轮配置读写全部使用合成临时文件及隔离主库。未读取或修改真实 Agent 配置、凭据、聊天和私人 Skill；未启动真实 Agent，未写 Vault、飞书、远端或旧监工。

## 验证

- 最终单元/API **213/213**。其中新配置相关 manager 20、file 20、journal 3、parser 10、HTTP 6，独立 Standards 复跑 59 项，Spec 复跑 manager/file/journal/HTTP 49 项。
- 最终候选配置浏览器 **13 组 / 8 次 axe**：显式读取、应用/恢复、读取失败、跨客户端版本、丢失响应、同/异 ID unknown、刷新保留锁、过期、外部变更、四档窄屏、放大文字、关闭迟到。受影响的目标管理 **9 组 / 4 次 axe**也重新通过。
- 同轮前一候选完整回归已有 **74 组浏览器 / 37 次 axe**、迁移 2、容量 2 均通过；最终仅配置/UI 状态及安全边界变化，已重跑上述受影响范围。合并覆盖 **87 组浏览器 / 45 次 axe**，不把之前 12 组配置和最终 13 组重复累计。
- 原完整回归明细：`/tmp/guiji-v011-final-nB1ZnS/test-results/independent-regression-results.json`；最终受影响脚本在共同候选 `tests/agent-config-browser.mjs` 与 `tests/agent-targets-browser.mjs`。
- Build、变更文件 Prettier 通过。JavaScript/Vite 项目没有单独 TypeScript 检查任务。固定依赖 toml-eslint-parser 1.0.3、yaml 2.9.1；已有 fflate/Vite 安全公告分别用 0.8.3/6.4.3 补丁解决，npm audit 0 项，禁用安装脚本。

实际 RED→GREEN 包括：缺失配置模块/路由/UI；TOML 原型键隔离；BOM/中文/CRLF、YAML 流式插入；读取失败旧值仍可编辑；跨客户端版本导致永久禁用；未知写入可以绕过/刷新丢锁；明确写前拒绝误入 404 核对死路；仅所属组变化仍允许恢复；新 journal 父目录未同步。已按具体反例修复，而不是只增加成功用例。

## 流程与 UI 优化

沿用批准 A v0.2，manifest `bd692d5fdcff8fdf911ceea53b5f1c3e36ce4958c3f3ac7a160c01a3f9d26e22`，Path 3 / T1 SATISFIED_BY_EXISTING_AUTHORITY，生图 0。共享 Button、Badge、抽屉、表单和 tokens 不变，配置面板只组织本功能内容。

按运行态流程审查亲自走通六步；修正确认复选框受全局表单样式影响的尺寸/对齐、预览和结果焦点/滚动定位、恢复结果语义以及失败/未决状态。最终 IAB 隔离服务 63252 的 DOM 引用精确构建，原文件恢复为逐字节相同且 mode 0600。

最终图片已保存到 `test-results/v011/`：六张 `config-final-01-overview.png` 至 `06-restored.png`（1280×720）；`agent-config-overview-1440.png`、`agent-config-preview-1440.png`、`agent-config-preview-crop.png`；`agent-config-preview-320/375/393/430.png`。自动化验证 44px 点击范围及 150% 根字号无溢出；截图不是读屏或真机触摸验收。

## Standards

独立初审两个 P2：重新读取未同步主库 revision；未决写入可以绕过且 unknown 会解锁。最终对共同候选复核，原反例及刷新、unknown、核对解锁路径通过，0 硬规则违规、0 值得报告的新增 smell、0 未闭合项。

## Spec

独立初审三项重要发现：gid 漂移未阻止恢复；新 journal 目录父同步缺失；明确未开始的拒绝被错误锁入未知恢复。最终对共同候选复核，三项闭合；0 缺漏/错误实现/范围扩张，0 未闭合项。

## T2 Runtime Visual Review

Artifact maturity：runtime。Artifact：上述共同候选，版本 0.11.0，运行 63252；reviewed runtime build：上述精确 JS/CSS。审查者独立读取 HTTP 资源核对 SHA，与冻结构建一致。

Authority：A v0.2 manifest 与外部精确批准记录；manifest 及六成员已独立核验。Structure/style/assets 为 SATISFIED_BY_EXISTING_AUTHORITY；原抽屉、暖白橙、共享控件与资产语言受保护，无新方向。

Runtime evidence：上述六张 1280 图、两张 1440 图、400×448 局部图、320/375/393/430×852 图，均由审查者实际目视。Baseline QA 为本页所列主流程测试；T2 不冒充独立重跑功能测试。

Design Read：配置管理在既有 Agent 详情内，差异值优先、文件边界其次、确认动作最后，维持克制的管理工具质感。Preserve：前后值扫读、非夸大成功状态、长路径换行、共享表面与控件层级。

| Severity | Evidence | Issue / revision | Decision | Resolution | Protected concerns | Stale / rerun |
|---|---|---|---|---|---|---|
| N/A | 上述当前图片 | 无需修复的视觉发现 | N/A | 无未闭合项 | 信息架构、流程、内容、共享职责不变 | 无新可见变更，无新增重跑要求 |

DEFERRED：动画、加载过程、异常/过期、键盘焦点及 150% 字体未由此批截图完整表现，T2 不宣称独立目视验收；对应自动化证据另列。新增外部图像 N/A，当前视觉范围无 BLOCKED。

Recommendation：**VISUAL_PASS**。Next owner：主流程交付。Freshness：CURRENT，绑定本页精确构建；后来可见变更需重做受影响验收与 T2。仅视觉通过，不替代真人和全产品验收。

## 本机运行与真实数据

主服务已实际采用 **0.11.0 / filesystem**，PID **60843**，`127.0.0.1:5178`，cwd 为本应用。会话接口 200，HTTP JS/CSS 与冻结构建逐字节相同；IAB 主页面刷新仍保留项目列表与 revision 5，并实际引用同一构建。没有操作真实配置入口。

本次切换前后 `data/CURRENT.json` SHA-256 均为 `9cf1a6a3541c30ae148545b42278e441a9a6b1ce33082f7d70d378b923b8a310`；revision 5 快照 `5-1bee13e6-f633-4dfd-9daf-bc71be2cf6ba.json` SHA-256 `1f9f698413fb3e2fdacbb65e5cebfae7e53237a4c9aab28dd43087666d4d6ac4`。此前历史记录的 revision 3 不是本次切换基线；只读比较显示除 revision 外顶层内容一致，不据此推断是谁产生了修订。

未完成：真人配置使用/真实进程采用、完整 A03/A04–A06、S07 真实资产复用、项目身份/路径连续性、知识连接、模型路由、夜间执行及稳定 Mac 交付等。唯一下一步：P01 项目身份与本地入口连续性的受控切片，先固定扫描缺失/不完整、同名/多目录与身份关联规则；不扫描新范围、不写 GitHub、不复制第二份 Current。

# REA第一阶段 · Codex交接445

- 输入状态 / 输出状态：WB-20261013-443 → Codex认领444 → WB-20261013-445。
- 本轮范围：派单443全部第一阶段；本地候选实现与隔离验证完成，待Claude验收。正式5178与dist保持原版本，尚未采用。
- 唯一下一步：**Claude 验收 REA 第一阶段**。Claude验收后再由常浩真实试用；正式服务采用/重启另取明确授权。

## 可观察结果

FN投入参照物可选“截图/文字”（原默认）或“本机软件（REA）”。REA支持Electron .app/.asar/已解包目录或网站，要求功能描述和授权勾选。路径检查仅lstat；.app缺少app.asar时提示改选。保存后仅Codex/Claude Code可发车，其他伙伴显示“无法访问本机 MCP”，键盘和复制前门禁一致。

任务包包含summary取证、record-and-continue、按功能定点追踪、缺工具停止、网站仅观察已打开页面及无CDP停止边界。工作台不运行REA、不存原始图谱。回贴FN JSON后显示可复制完整Evidence ID的徽标和独立未知项；旧无target记录保持兼容。target进入原件快照，目标/功能变化使旧达标失效。合成流程已走通复刻评分和Skill炼成，SKILL.md明确取证方式、目标种类、证据及未知项。

## 精确改动

- src/reverse-recipe.js：target/证据/unknowns严格校验、目标快照、任务包与本机伙伴选择函数；派生标题控制符规范化。
- src/ReverseV16.jsx、src/reverse-v16.css：FN录入、检查反馈、伙伴限制、目标摘要、证据复制/未知项；沿用原视觉与11px字号令牌。
- server/reverse-target.mjs（新增）、server/http.mjs：只读鉴权目标检查；逐级lstat拒符号链接，权限/观察身份变更明确失败。
- server/schema.mjs、server/reverse-schema.mjs：主库及历史快照兼容校验，旧记录不迁移。
- src/reverse-skill.js：炼成证据边界，保留原人工达标门禁。
- tests/reverse-rea.test.mjs（新增8项）、tests/reverse-v16-browser.mjs：合成边界与完整录入→回貼→炼成链路。REVERSE-RECIPE.md追加443契约；CURRENT及台账同步。

## 验证与首败

- 最终全量串行单元 **1230/1230通过**；REA专项8项；原逆向相关35项阶段回归通过。
- 最终候选完整逆向浏览器：1440/390/320、按钮/方向键限制、44px/焦点/axe、逐字复制、回贴、刷新、合成评分炼成、网站任务包通过。原reverse-engineering-browser与reverse-fold-browser均通过；无真实外网/REA调用。
- 1440/390同场景原FN页与默认录入前后图、新REA录入/配方/证据区齐全；0未知项隐藏通过。Standards最终0发现；Spec首轮重要1已关闭；同构建T2 VISUAL_PASS。
- 首败保留：target-only旧空素材拒绝（red-target）、路径API旧404（red-path）、空标题feature含制表/回车拒绝（red-title）。均补最小实现后转绿。
- 全量首轮1228/1230：新增11px字面量违反令牌约束，改现有等值var(--fs-label)；HTTP测试的WORKBENCH_TEST_STATIC_ROOT与GUIJI_TEST_DIST未统一，两个均指向候选后15项针对回归和最终全量通过，未放宽测试。
- 浏览器脚本首败：表单定位未限定/accessible name包含选项；原生长输入内部滚动误判裁切，改外部边界+44px+完整值检查；刷新后折叠区需展开；截图URL中文路径经fileURLToPath修正，错误目录两张合成图已移回且空目录清理。未将这些脚本问题包装成产品缺陷修复。

## 版本、证据和保护

- start_head / 当前HEAD：e6e5d8b74474ea408ebb171ab70415e32d57ada4；未提交的本地候选，不存在completion commit。
- 11项交付源码/测试/契约manifest：work/rea444/review3/manifest.json，SHA256 e47efede6cb47aea75c07ed69563e019630557b18344c5f423d4a96fd13e3bf3。
- 候选dist：work/rea444/dist；build manifest：work/rea444/review3/build.json，构建总hash aec5a91fdff776d598b8dd3bc0aadbaab0f1d2240288ba3daa548160a03c8eb2。
- [前后与最终截图报告](../../../work/rea444/report.html)；[两轴审查](../../../work/rea444/reviews.md)；[T2记录](../../../work/rea444/t2-visual-record.md)；[保护回读](../../../work/rea444/protection-final.json)。首败和最终日志均在work/rea444，前像在before/。
- 756基线文件0丢失、189链接0漂移；范围外源和依赖保全，正式dist与data/CURRENT.json哈希不变；不覆盖既有dirty。保护范围为源码/测试/公开静态/正式构建/指定契约及主库指针，不声称对全机私人文件做审计。
- 本轮未重启服务、未安装/配置REA、未读取真实Agent会话/Vault/凭据、未运行REA、未提交推送或跨客户端发消息。

## 非技术使用与验收边界

正式服务采用后：进入逆向工程→投入参照物→FN→本机软件（REA）；选择目标、填想弄懂的功能、勾授权，Electron先检查路径，网站先在Chrome打开；保存后复制任务给Codex/Claude Code，回贴返回的配方JSON即可查看证据/未知项。路径不存在或.app缺asar时按页面提示纠正；伙伴无REA工具或CDP连接时应停止说明。

当前可检查交付截图和隔离候选，日常5178尚不展示新功能。没有宣称真实软件已取证、全部功能还原、正式运行采用、Claude/常浩验收或业务效果。441的真人验收仍独立待办。

已写共享状态，等待Claude实际读取；未代写其已读/验收回执。

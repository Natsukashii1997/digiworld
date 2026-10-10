# Codex 交接125：UI v14e 项目空间

输入 WB-20261003-123 → 认领 WB-20261003-124 → 输出 WB-20261003-125。执行者 Codex；本轮仅项目空间，等待常浩验收。

## 1. 回档点与基线

用户当轮指令为“先存好当前这版，以便后续回档；然后确认认领，开始做项目空间”。按要求读回入口、CURRENT、COLLABORATION、交接123/121与v14 README，核实WB123、无人写入、Git工作区干净后，先备份，再登记124并回读。

- 基线 HEAD：`15dd5ba70877180fcf251150cb460e5dfda4ba4c`。本轮没有提交或推送，结束HEAD保持该值。
- 回档目录：`/Users/nat/Documents/Codex/2026-10-03/1-codex-personal-ai-workbench-users/outputs/rollback-WB-20261003-123/`。
- `source-WB123.tar.gz`：675个受版本管理文件；SHA256 `3d0e7ad6b643980bc00983cb96b5af37d6975a654392e624dee8ddc88a40ea1b`。
- `dist-WB123.tar.gz`：13个当时构建文件；SHA256 `57196fa8c24c7dfa9c2bce67ab4b24de78051cfa57dfdf665a47d963649cfe1a`。
- 两份归档已逐文件读回并与工作树核对，清单在回档目录`manifest.json`；恢复方法见`回档说明.md`。不含主库、凭据、私人会话、node_modules、其他未跟踪文件，是代码/界面回档点。
- 已批准依据：`docs/design/ui-v14/v14e-preview.html`，SHA256 `bd1f6fbbd5a3cc01ba1a264684765b8288953100de1ea8b8d899bdb31286cb53`；不回退到已否定的v14c方向。

## 2. 实际改动

| 文件 | 改动与边界 |
|---|---|
| `src/DiscoveryPages.jsx` | 仅Projects：页根作用域、A/B区域和全部项目材质；扫描、筛选、搜索、身份冲突、目录分组/嵌套、详情与规则入口保留。 |
| `src/ProjectStatus.jsx` | 在推进改为存档卡：液晶编号、Current下一步气泡、真实写入者角色、中性阶段灯、30天空态、STATE/SAFETY/GITHUB摘要、可展开原细项、头像选人、休眠提示。 |
| `src/project-status.css` | 项目卡布局、灰度/Zzz、公共材质、响应式、减少动态效果；新增选择器限项目页。 |
| `tests/project-status-browser.mjs` | 原状态/安全/窄屏检查前增加4次展开，原断言不变。 |
| `tests/projects-brief-browser.mjs` | 原GitHub细项检查前增加展开步骤，原断言不变；首页选择器保持。 |
| `tests/collab-board-browser.mjs` | 项目开工选择从selectOption改为点Claude头像；44px和口令断言保留，另加aria-pressed断言。 |
| `tests/ui-v14-projects-browser.mjs`（新） | 项目空态、长字段、缺项/读取失败、头像/键盘/焦点、7宽度逐元素溢出与裁切、44px、axe、动画帧弹窗遮罩与运行中减少动效。 |
| `CURRENT.md`、本交接（新） | 认领、结果、证据、回交与唯一下一步。 |

改动文件逐项前后SHA256见 [change-manifest.json](evidence-2026-10-03-codex-projects-124/change-manifest.json)，包括dist增删变化；证据文件自己的哈希单独保存在`evidence-files.sha256`，避免自指哈希。现有未改文件也核对过，无意外漂移。

StartWork仅新增项目专用呈现分支，继续共用原Agent白名单、口令生成快照、用户确认、复制成功留痕、过时提醒和失败恢复。项目弹窗用portal挂到页面顶层，防止卡片入场transform限制遮罩；首页简报仍用原下拉选择器及挂载方式。

角色复用WB123的characters/AgentSprite：没有新绘机器人，没有擅自替换映射或补素材。机械系灰龙仍待用户确认；缺图仍为字母牌。

## 3. 明确差异与数据缺口

- 项目状态接口没有接力stage，本轮不新增跨接口推断或业务逻辑：阶段显示“未知”，所有阶段灯保持中性；当前写入者仅来自Current，不用开工选人冒充。
- 没有近30天按天活动源：30格留空，写明“待接入数据”“尚无按天记录，不代表没有活动”；没有用合成热力填充真实页面。
- 休眠只取既有停滞判定，未知活动不画休眠。卡头与正文灰度、Zzz和准备唤醒提示已加入；为保留按钮原名，仍叫“生成开工口令”，不宣称点击就自动启动Agent。
- v14e缺协议卡的“装入模板”快捷按钮本轮未新增，保留文字引导及原项目详情→规则→预览确认流程。Spec登记为非阻断建议；没有删除原能力，也不直接安装模板。

## 4. 验证命令与首次原始结果

证据根：`docs/agents/handoffs/evidence-2026-10-03-codex-projects-124/`。汇总 [validation-summary.json](evidence-2026-10-03-codex-projects-124/validation-summary.json)。所有实际执行均为本机临时合成环境。

| 命令/检查 | 首次原始结果 | 最终结果/证据 |
|---|---|---|
| `npm run build` | 通过，exit0，`build-first.log` | 后续代码修改后build-2/build-3均exit0，最终dist13文件绑定review-snapshot。 |
| `npm test` | **通过607/607** | `npm-test-first.log`。 |
| `node <chat>/work/run-browser-suite.mjs`，内部逐个`node --import .../work/isolation/register.mjs tests/<script>.mjs` | **全量首轮50/50通过**（49既有＋1新增） | `browser-first/results.json`与每个原始log；未跳过失败脚本、未删业务断言。 |
| `node --import .../work/isolation/register.mjs tests/visual.mjs codex-projects-124` | **通过，problems=[]** | `visual-first.log`；6宽度×17页，加弹窗/抽屉等状态及顶栏临界宽度；截图在`test-results/visual/codex-projects-124/`。 |
| 项目状态针对性首跑 | **失败** | `project-status-first.log`：隔离runner对尚未创建的临时data目录realpath导致ENOENT，未进入浏览器。修正临时根预检后`project-status-2.log`通过，全量亦通过。 |
| 新项目专项首次 | **失败** | `ui-v14-projects-first.log`：新测试browser.newPage不满足axe要求，改为显式newContext。第二次缺项数量断言误计折叠区隐藏项，`ui-v14-projects-2.log`保留；改为分别检查下一步/写入者可见缺项并展开检查交接，第三次及全量均通过。 |
| 改前截图首次 | **失败** | `before-capture.log`：等待文字命中两个元素，严格定位器报错；更换为明确“刷新GitHub”就绪点，`before-capture-2.log`通过。不是产品失败。 |
| `git diff --check` | 通过 | 交接前再次通过。 |
| 真实资料与用户审美验收 | **未执行** | 由常浩本人在5178验收；本轮不读主库替代用户验收。 |

新增项目专项覆盖1440/1024/430/393/390/375/320，展开与收起均检查长中英文内容、逐元素越界/裁切、44px和axe；还覆盖部分Current、读取失败禁用开工、头像键盘选择、关闭焦点归还、入场帧遮罩全视口与运行中减少动态效果。

测试隔离说明：部分旧脚本只有临时库，仍使用默认本机集成。采用任务级Node预加载适配器，禁用未显式注入的日历、GitHub、Agent内容、AIHOT及抠图访问，已有合成桩保留，生产服务/接口/fixture文件不改。完整实现与复现说明在`evidence.../runner/`；这是受控测试适配器，不宣称操作系统沙箱。

## 5. 前后截图、复核与运行采用

- 改前原图`before/`，当前构建图`after-v3/`，同隔离口径从保存的WB123 dist重渲染图`before-controlled/`。后者用于公平比较。
- `control-comparison-isolated.json`：知识仓库1440与银饰1440前后均逐字节一致。首次银饰截图仅抠图“本机可用/隔离禁用”提示不同，未当成样式回归，已统一适配器重拍验证。
- 固定代码/测试diff SHA256：`ec26fd25ecf6d719e310e03d3c237d5871b1e2fc80184e3f4ca7ce0c34bb1b46`；7个源码/测试与13个构建文件清单`review-snapshot.json`。
- Standards通过：硬违规0，建议0；Spec通过：0致命/0重要，模板快捷入口1项非阻断建议已在上文明确。两位Codex只读子代理独立复核，不代表Claude或用户。
- T2视觉复核：VISUAL_PASS，仅本次项目空间可见范围，记录`taste-t2.md`；动效体验与真实数据仍待用户验收。
- 5178未停止、未重启。`runtime-static.json`证明提供的HTML/JS/CSS与本次dist逐字节一致；HTML SHA256 `9d4c1255a9b088bfc38f4eefd0cbe8d003a2a0adfa582f83dfaae5f33bf8ad8a`。
- 未访问或写入真实主库，也未做其哈希检查；未读真实Vault/凭据/私人会话，未安装组件、使用付费服务、提交、推送、改Agent配置。

## 6. 未完成与唯一下一步

已完成本轮项目空间呈现与本机验证；用户验收未完成。协同、智能体群、首页后续页面未实施；银饰仍不动。项目阶段来源接入、30天活动数据、模板快捷入口及缺图素材不在本轮补造。

**唯一下一步：常浩在5178刷新项目空间，验收存档卡、详情展开、头像选人和休眠呈现；满意后再指定下一页。** 可生成口令预览后取消，以检查呈现；不需要执行Agent或复制留痕来验收UI。没有替常浩、Claude声称已读、接手或验收通过。

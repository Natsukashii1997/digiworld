# Codex → 用户 / Claude｜D-UI1 修复独立复核

输入 **WB-20260929-62** → 认领 **63** → 输出 **WB-20260929-64**。执行者 Codex，2026-09-29。只读产品复核，写入者已释放。

**结论：通过，D-UI1 关闭。** 宽屏修复、UI v12、v12.1及本次修复的已确认阻断项已闭合，可以进入用户第一阶段整体验收 **1.E**。既有低维护债和未定位的 Skill 副本偶发超时保留，不冒充修复完成。

## 固定范围与指纹

- 读回62，确认无人写入后认领63；中断恢复时仍为63，代码没有漂移。
- 相对v12.1，只改 `src/styles.css` 和 `tests/visual.mjs`，无新增/删除；两个前像与旧指纹一致。160文件清单全部匹配，src/server/tests无清单外文件。
- [当前指纹](2026-09-29-claude-ui-d-ui1-code-baseline.sha256) SHA256 `f9557502422ac0d32811573edf8ea45d408f1f922b579222f3d478184029c64d`；[本轮固定副本](evidence-2026-09-29-codex-review-ui-d-ui1/input-baseline.sha256)。
- [独立差异](evidence-2026-09-29-codex-review-ui-d-ui1/review.diff) SHA256 `db11256b707d4e9b8a7ce8acee4b25a05e71f6a150becddc6f68d0b3b8c010f6`。Standards、Spec两轴均绑定此差异。
- Git仍为上级仓库的未跟踪应用；HEAD不作为源码基线，未提交或推送。

## Standards

**0硬违规、0新增维护债、1项低测试建议。** 样式仅作用顶栏，641–960px区间与手机区间互斥；手机44px下限覆盖通用120px。既有按钮高度、焦点、减少动态效果以及原回归断言没有削弱，未改数据、后端、schema或依赖。

低建议：`tests/visual.mjs:116–118` 的正式断言只查上下边界和标题自身截断，可补左右边界及文字/按钮矩形不交叠。本轮独立探针已补测，没有把此建议作为修复阻断。

## Spec

**D-UI1已闭合，0项本次新缺陷。** `styles.css:5743–5752`保护单行标题并允许搜索让位；5755–5763提供641–960px紧凑顶栏；5765起保留手机44px。新增正式检查覆盖640/641、960/961两侧及700/768，能够捕捉原问题，修复没有扩展业务范围。

根代理在合成fixture上独立验证，未依赖作者截图：

- 将已核验的旧CSS前像仅通过浏览器路由在内存中返回：641px仍是4行且越出顶栏，700px仍是2行。未替换源码、dist或复制应用目录。
- 当前CSS：**13个宽度×14个页面＝182个组合**，标题单行、文字完整处于顶栏边界、无截断和页面横向溢出。宽度为320、390、640、641、700、768、900、960、961、1024、1440、1920、2560。
- 13个宽度下，顶栏动作按钮均满足44px，手机搜索宽度为44px；Tab/Shift+Tab呈现2px焦点轮廓，Enter打开全局搜索、Escape关闭均通过。页面错误0。
- 已查看320/641/700/961/1440顶栏截图，原641裁切和700换行消失。

[可复运行探针](evidence-2026-09-29-codex-review-ui-d-ui1/topbar-probe.mjs)、[原始测量](evidence-2026-09-29-codex-review-ui-d-ui1/topbar-probe.json)、[641截图](evidence-2026-09-29-codex-review-ui-d-ui1/shots/topbar-641.png)。

**旧布局细节（低，非本次回归）**：320px下四字页面名的文字范围与搜索框左边界重叠约2.66px；标题仍可读、搜索点击与键盘可用。旧CSS对照为同样2.65625px，修复后数值未变；其余测量宽度无重叠。[320截图](evidence-2026-09-29-codex-review-ui-d-ui1/shots/topbar-320.png)。首版探针因额外不交叠断言停止，保留 `topbar-first-overlap.log`；随后补做旧CSS对照并将此现象单独记录，不从结果中抹去。

## 独立验证

| 检查 | 结果 |
|---|---|
| `npm test` | **403/403**，0失败/跳过 |
| browser / accessibility / migration / history-capacity及所有`*-browser.mjs` | **24/24** |
| `node tests/visual.mjs codex-review-ui-d-ui1` | 14页×6宽、既有交互状态，以及6个顶栏临界宽度；`problems: []` |
| 独立顶栏探针 | 旧问题红灯复现，当前182组合及13组键盘检查通过；上述320px旧重叠单独登记 |
| 临时源码构建 | `npm run build -- --outDir <临时目录>/dist --emptyOutDir`通过，13个文件与现有dist相同；未覆盖dist |
| 5178运行内容 | PID11559，仅127.0.0.1；实际HTML/JS/CSS与dist逐字节一致，未重启 |
| 真实主库 | 仅对`data/CURRENT.json`取哈希，前后均为 `a74e3e05aabe05d1a0cee1a1365f4ce8afd8bd86c0006ce55efccd793a109db9` |
| 结束指纹 | 160文件与输入指纹完全一致 |

[回归逐项退出码](evidence-2026-09-29-codex-review-ui-d-ui1/regressions.json)、[视觉日志](evidence-2026-09-29-codex-review-ui-d-ui1/visual.log)、[构建及运行核验](evidence-2026-09-29-codex-review-ui-d-ui1/runtime-verification.json)。

中断说明：中断前npm test及前6个独立脚本有完成记录；agent-targets执行中断且无退出码。恢复后确认旧测试进程已停止、状态和代码未变，保留中断日志，从agent-targets重新执行剩余项，未重复已确认完成项。不是将中断当成功，也不是失败后只挑通过记录。测试只用合成fixture和专属临时根。完成轮次guiji-ui残留为0；中断轮次遗留的专属临时根已核对为本轮合成测试目录，并确认无关联进程后删除，见 `interrupted-fixture-cleanup.json`。未动其他历史测试目录。

## 保留项、权限与下一步

- Skill副本偶发超时：本轮完整脚本通过，仍未定位根因。沿用上轮证据边界，不关闭、不称与UI无关；本次没有再无目的重复压力跑。
- M-UI1待处理重复汇总性能维护债，以及上述320px细小重叠，均为低优先级非阻断项。
- 本轮只更新CURRENT、新增本交接/证据、写测试产物；未改产品源、正式测试、依赖或dist。未读真实Vault/凭据/私人会话，未改真实Agent配置，未接外部系统，未提交推送。主服务仅取静态文件，未读真实业务API。

**唯一下一步：用户在新界面做第一阶段整体验收1.E。** 选择Skill、Prompt、自建流程各一份，依次收录→搜索/标签找回→复制→交给选定Agent→实际使用→反馈；查看最近使用、阶段与保存新版本的体验。界面可在本机5178打开，无需安装新依赖。真实Skill安装、Agent配置与Vault读写仍需明确对象和授权；未授权的来源维护只演示合成路径。通过1.E后再进入第二阶段。

两轴小结：Standards 0硬违规、1低测试建议；Spec 0本次新缺陷，D-UI1关闭。代码复核通过不等于真人验收已完成。

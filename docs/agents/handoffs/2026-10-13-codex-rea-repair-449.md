# Codex 交接449 · REA 第一阶段 R1–R3返修完成

| 项 | 结果 |
|---|---|
| 输入 / 认领 / 输出 | WB-20261013-447 → 448 → 449 |
| 范围 | 验收447的R1–R3；本地候选完成、未提交 |
| 结论 | 三项返修完成，按447无需Claude复验；正式采用与真实REA试用待常浩授权 |
| 写入者 | 交接与CURRENT回读后释放 |

## 改动与结果

- **R1**：网站任务包先要求用户在macOS终端手动运行独立Chrome调试命令，使用`$HOME/.rea-chrome`与9222端口，在新窗口打开目标页、取证后关闭；伙伴等待用户操作，不能自行启动或改用日常资料。明确`list_browser_targets({cdp_endpoint:"http://127.0.0.1:9222"})`。网站录入提示显示相同命令，可复制、不提交表单；Electron不显示。共享命令常量防两处漂移。
- **R2**：证据严格为`^ev_[a-f0-9]{64}$`。真实回复测试夹具及数量边界都使用64位；短示例`ev_0123456789abcdef`原样保留，其JSON语法有效但业务校验拒绝，避免照抄成为假证据。旧无evidence记录继续兼容，不做真实库迁移。
- **R3**：徽标显示“证据 01234567”，可访问名称为“复制证据编号 ev_…”，仍只缩写显示、复制完整64位ID。

6项交付：`src/reverse-recipe.js`、`src/ReverseV16.jsx`、`src/reverse-v16.css`、`tests/reverse-rea.test.mjs`、`tests/reverse-v16-browser.mjs`、`REVERSE-RECIPE.md`。另更新本票状态、交接与证据；后端/依赖/全局样式不改。

## 验证与证据

- REA定向10/10；全量串行单元**1232/1232**，0失败。两个静态资源环境变量都指向`work/rea448/dist`。
- `tests/reverse-v16-browser.mjs`通过：1440/390/320完整链路，真实组件录入、校验、任务包、伙伴键盘、回贴/回读、完整ID复制，以及网站提示与命令复制；1440炼成路径继续通过。日志的“173”是历史派单号，不是测试计数。
- 同候选截图专项三宽通过：网站命令与完整ID复制、实际Tab焦点、提示不横向截断、axe；12张同场景前后图。
- 独立Standards/Spec两轴均致命0／重要0／建议0；同构建T2为VISUAL_PASS，仅限本次视觉范围。
- [前后对照报告](../../../work/rea448/report.html)。日志、首败、截图、reviews.md、t2-visual-record.md及protection-final.json在`work/rea448/`。

命令：

```sh
node --test tests/reverse-rea.test.mjs
npm run build -- --outDir work/rea448/dist
WORKBENCH_TEST_STATIC_ROOT="$PWD/work/rea448/dist" GUIJI_TEST_DIST="$PWD/work/rea448/dist" node --test --test-concurrency=1 tests/*.test.mjs
WORKBENCH_TEST_STATIC_ROOT="$PWD/work/rea448/dist" node tests/reverse-v16-browser.mjs
WORKBENCH_TEST_STATIC_ROOT="$PWD/work/rea448/dist" node work/rea448/capture.mjs after
```

保留首败：R1任务缺CDP启动说明，R2短示例被接受，R3徽标缺“证据”，分别red-r1/r2/r3.log。截图专项首轮鼠标点击后程序focus未触发focus-visible，改成真实Shift+Tab/Tab路径后通过；保留after-capture-first.log，未修改产品以迁就测试、未放宽断言。

## 版本与保护

- start_head及结束HEAD：`e6e5d8b74474ea408ebb171ab70415e32d57ada4`，不提交。
- 本轮相对实际dirty前像的冻结diff：`work/rea448/review1/changes.diff`；6项manifest SHA256 `ba812d026fe7f650190b2487ecc59dd120ba0877040dd9fba08f6868039b0494`。
- 17文件候选build SHA256 `2abf2650f67a0007e0201a411dc754c9dc902d785f1bb9795d8512940db4d6d6`；最终源/构建回读0漂移。
- 55,654项所选工程文件指纹（含历史工程证据）无缺失、无范围外改动；正式dist和主库data/CURRENT.json指针不变。此检查不声称扫描全部真实业务数据或私人目录。

## 使用与剩余边界

正式采用后：进入逆向工程→投入参照物→FN→本机软件（REA）→网站，复制调试命令并在终端手动运行，在新窗口打开目标页，再把任务包交给本机伙伴；取证后关闭窗口。回贴真实64位Evidence ID后，可见“证据”徽标并复制完整编号。复制示例短ID会被明确拒绝。

**未做正式5178/dist采用或重启，未启动真实Chrome调试窗口、运行REA取证或访问目标网站。**所有浏览器验证使用合成隔离资料；无新增安装、提交、推送，无Vault/凭据/Agent私人会话读取或真实测试增删。

Claude447已说明R1–R3完成后不必再复验；此处不代签常浩真实使用验收。441连续阅读真人验收仍独立待办。

唯一下一步：常浩授权正式采用，再做真实REA试用；无需追加Claude复验。

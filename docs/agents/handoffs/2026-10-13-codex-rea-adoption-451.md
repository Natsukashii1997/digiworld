# Codex交接451 · REA第一阶段正式采用

输入 **WB-20261013-449** → 认领 **450** → 输出 **451**。用户本轮明确授权正式采用REA第一阶段（含447返修）、构建并重启5178一次，回读后交接。该授权已执行并用完。

## 采用结果

- 11项完整REA交付保持冻结：448返修6项与444保留5项均逐文件匹配，无源码/测试/依赖新增修改。
- 本轮重新构建`work/rea450/candidate-dist`，17文件与449已验候选逐字节一致，聚合SHA256 `2abf2650f67a0007e0201a411dc754c9dc902d785f1bb9795d8512940db4d6d6`。旧正式dist完整保存在`work/rea450/before-live-dist`，新构建已正式采用。
- 重启前核对固定Label、WorkbenchServer.app Node、项目/data目录、plist指纹、PID与监听归属；收藏导入/视频处理/夜巡运行数均为0。
- 对`gui/501/cn.personal-ai-workbench.server`仅执行一次`launchctl kickstart -k`：**PID41099→45724，runs7→8**，返回码0。一次性意向与回执保存，无重试、无修改服务配置、无重放历史unknown操作。

## 回读验证

| 验证层 | 本轮结果 |
|---|---|
| 源文件/候选 | 11项完整交付、17构建文件匹配 |
| 正式磁盘 | 17/17与候选匹配，无额外文件 |
| 公开HTTP | 7项全部200、逐字节匹配：HTML、JS、CSS、manifest、3图标 |
| REA后端 | 合成.app+asar检查200且完整；缺失目标200/exists=false；相对路径400；缺会话授权403 |
| 实际页面 | CUA打开正式5178，FN→REA→Electron字段→网站CDP提示/命令/复制入口可见；未提交表单，临时标签已关闭 |
| 数据与配置 | 主库指针、收藏state、data身份、plist及Node身份不变 |
| 既有工程QA | 复用449的1232/1232、三宽浏览器、双轴及T2；本轮重新构建与已验构建字节相同，不谎称重跑 |
| 独立采用复核 | 只读子代理复核回执，0项不一致 |

产品代码指纹重启前后保持`2d6402f853f8c6a9541d17f97a5fad5a52e087998d4570c9076a4b572ed2e9b0`；新进程身份及新REA接口共同支持后端采用结论。

首轮HTTP脚本误把所有17个dist文件都当作公开路由，在旧theme路径遇到404。经检查，现有服务只开放`/`与`/assets/`，10个历史theme文件本来就不公开。已保留首败，改为17项磁盘核对＋7项公开HTTP核对，未改产品路由、未再次重启。

## 保护与证据

824项所选工程/数据指纹无缺失、无范围外改动；原dist全部归档匹配，主库`data/CURRENT.json`和收藏`data/collection/state.json`逐字节不变。HEAD仍为`e6e5d8b74474ea408ebb171ab70415e32d57ada4`。已有dirty保留；未安装、提交、推送或写真实测试记录。常驻正常运行产生的日志不回滚；本轮不声称扫描全部私人/业务数据。

证据位于`work/rea450/`：

- `authorized-once.json`、`preflight.json`、`restart-attempt.json`、`command-result.json`、`restart-readback.json`；
- `source-manifest.json`、`candidate-manifest.json`、`build.log`、`adoption-readback.json`、`readback-first-failure.json`；
- `live-ui-readback.json`、`live-rea-web.jpg`、`protection-final.json`、`adoption-review.md`。

## 使用与下一步

刷新[正式工作台](http://127.0.0.1:5178/#references)，进入“投入参照物”→FN→“本机软件（REA）”。Electron可填路径并检查；网站可查看独立Chrome调试指引并复制命令。工作台不直接运行REA，任务仍交本机Codex/Claude Code。

**本轮正式采用与运行回读完成；未执行真实REA取证、未启动调试Chrome窗口、未创建真实逆向测试记录。**现有长流程、64位证据回贴/炼成等使用449同构建隔离证据，未冒充生产真实案例已完成。

唯一下一步：常浩选定并授权一个真实REA目标进行试用及用户验收；441连续阅读验收仍独立。447已明确无需追加Claude复验。任何后续重启需新的明确授权。

![正式5178：REA网站指引](../../../work/rea450/live-rea-web.jpg)

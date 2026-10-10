# 本地项目组合整理与项目空间呈现 · WB-20261009-311

## 输入、目标与范围

- 输入 `WB-20261009-309`，无人写入时认领 `WB-20261009-310`。常浩要求删除 TraineeOS、银饰工作台、银作间的本地项目及 TraineeOS GitHub 远端，保留独立「银饰计划」；把整个本地项目组合按真正独立的业务系统、产品、知识资产、工具和成果整理并显示在原数码世界项目页。
- 保留现有磁盘路径、未提交工作、项目事实源和其他业务服务。没有对其他仓库执行重命名、迁移、提交或推送。没有读取 Obsidian 正文或改动银饰计划数据。

## 实际变更

- 项目空间新增可持久保存的展示名、五个主分区、候选/附属/隐藏视图、手工目录登记和精确排除身份。批量写入要求当前 revision；扫描保留人工登记与策展，已排除身份不会重新出现；在推进项目不能被排除。扫描范围外的手工项目明确标「仅展示」，禁用状态与上下文操作。隐藏来源可从折叠列表重新打开和分类。
- 相关源码：`server/project-catalog.mjs`、`server/schema.mjs`、`server/discovery.mjs`、`server/http.mjs`、`src/projects-v16.js`、`src/ProjectsV16.jsx`、`src/ProjectCatalog.jsx`、`src/ProjectSettings.jsx`、`src/projects-v16.css`、`README.md`。回归：`tests/project-catalog.test.mjs`、`tests/project-catalog-browser.mjs`、`tests/project-catalog-live-browser.mjs`。
- 本地项目删除范围经逐路径审查后执行：TraineeOS 当前仓、关联 classic 工作树、两处历史检出/评审目录、恢复压缩包及专属失效 LaunchAgent；银饰工作台工程、视觉探索、银作间及内嵌模板。9 个精确目标路径回读均不存在，专属 LaunchAgent 不再加载。带教协同工程及其 Worker、银饰计划页面/数据均保留。
- GitHub 旧地址 `abdoulaziznafiou03-creator/traineeos` 实际解析为私有 `Natsukashii1997/traineeos`。常浩以该账号完成官方设备授权后，仓库已删除；管理员账号与旧地址查询均为 404。临时隔离 GitHub CLI 登录已退出，临时配置已清理。
- 真实主库通过原 5178 的带 revision 接口从 126 写到 130；两次重扫后 44 条来源身份分别为 **17 个主项目、11 个候选、9 个附属、7 个隐藏**。24 个手工登记目录保留，原 1 个「在推进」标记未改变。旧账号别名产生的 `my-app-lumist` 重复卡已并入规范远端入口；Little Steps 网页副本和本工作台规范远端入口放进所属主项目详情。

## 验证与采用

- `npm run build` 退出 0；`npm test` **1178/1178**；项目合并/排除专项 **13/13**；隔离浏览器项目分类、编辑及 1440/390px 几何检查通过。
- 原 5178 使用固定 `cn.personal-ai-workbench.server`，受控重启后 PID `51545` 运行，工作目录和 data 路径不变。HTTP `/` 与 `dist/index.html` SHA256 同为 `bac930649ab3ce40eabe674771a75fbf12791734fedee4777ab4e8732609a01e`；5179 MCP 端口返回预期 GET 405。最终 `data/CURRENT.json` revision `130`，SHA256 `b34a8718799b3117b377e5216f2d7b2379c75eddffcb039430a631a317646fa5`。
- 原 5178 项目页浏览器实测：5 区、17 主卡、11 候选、7 隐藏，已删名称缺席，附属远端与「仅展示」可见；桌面 1440px、手机 390px 无横向溢出、页面错误 0。截图及完整分类表在 `/Users/nat/Documents/Codex/2026-10-09/wo-m/outputs/`。
- `data/silver` 5 个文件迁移前后合并 SHA256 均为 `65fcbd83ea2db7e9e498a3bbae77c0ee40bb072fccc3fc8cd41ed697bb0fa6d9`。`/Users/nat/Documents/AI 项目/outputs/管培生带教-AI协同` 仍存在。

## 限制与下一步

- 自动扫描当前 `truncated=true`，无扫描错误；深度/读取预算限制意味着新发现的未归类项目可能不全。本轮以独立本地盘点补齐经核实的项目入口；没有把外部源码克隆、QClaw 备份、日期任务或目录容器冒充主项目。
- 源码构建与真实页面已采用，常浩本人对项目名称和 11 个候选是否晋升仍待使用验收；不能由工程检查代签。完整盘点见 `/Users/nat/Documents/Codex/2026-10-09/wo-m/outputs/本地项目组合与数码世界呈现-2026-10-09.md`。
- 唯一下一步：常浩打开原 `http://127.0.0.1:5178/#projects` 核对五区与候选；若某候选有明确现行归属，在其详情更改展示名/分区，或告知具体项目身份后由下一位按本交接复核。共享状态已释放，下一位先读 `CURRENT.md` 与本交接。

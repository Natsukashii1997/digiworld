# MuseMap 全量删除 · WB-20261009-315

## 输入与范围

- 输入 `WB-20261009-313`，常浩明确要求「musemap这个项目也是全部彻底删掉」；确认无人写入后认领 `WB-20261009-314` 单写。
- MuseMap 为手工登记项目 `manual-b8f3c5d8fe7fcd32fa8d0d1d`，路径 `/Users/nat/Documents/AI 项目/生图 Skill 导航工具`；非在推进、无上下文绑定、无 GitHub repoKey。其目录在共享父仓库中未跟踪，父仓库无 remote；不能删除父目录 `/Users/nat/Documents/AI 项目`。

## 删除内容

- 经实际目录身份校验后删除工程 `/Users/nat/Documents/AI 项目/生图 Skill 导航工具`（约 43 MB，含 MuseMap.app、启动器、源码、测试和设计资料）。
- 删除独立运行数据 `/Users/nat/Library/Application Support/MuseMap`（约 18 MB，含 catalog、媒体与自动备份）及 `/Users/nat/Library/Logs/MuseMap`。
- 删除前身迁移数据 `/Users/nat/Library/Application Support/ImageSkillNavigator` 与日志 `/Users/nat/Library/Logs/ImageSkillNavigator`；项目源码明确读取此旧路径，其他项目未见引用。
- Finder 废纸篓中精确删除两份旧启动器 `MuseMap-旧启动器-20260826-34981.app` 与 `MuseMap-launcher-qa.mpBh77-20260826`，未清空其他废纸篓内容。
- 通过原 5178 `POST /api/project-catalog/apply` 将该项目 ID 与完整目录路径加入精确排除规则，并移除项目身份及目录卡；主库 revision `132 → 133`。真实重扫到 `134` 后该项目仍缺席，目录卡为 **6 主项目、6 资产、4 任务、11 候选、9 附属、7 隐藏**，共 43 条来源。
- `tests/project-catalog-live-browser.mjs` 将原真实页面预期更新为 6 主项目并断言 MuseMap 缺席；真实 5178 浏览器桌面/390px 检查通过，页面错误 0、无横向溢出。前两份项目整理报告均标注其分类为历史快照；新删除记录在 `/Users/nat/Documents/Codex/2026-10-09/wo-m/outputs/MuseMap-项目删除记录-2026-10-09.md`。

## 验证与边界

- 41731 删除前无监听，未见 MuseMap 进程、LaunchAgent 或 `/Applications` 独立安装。五个本地工程/数据/日志目录删除后均回读不存在；Spotlight 的 MuseMap/ImageSkillNavigator 同名路径查询为空。Downloads、Desktop、Documents 文件名搜索未见独立 `.musemap` 备份。
- MuseMap 目录不是独立 Git 仓库，无 remote；数码世界也未关联 GitHub 卡。当前可访问的 `Natsukashii1997` 列表未见 MuseMap。当前 `gh` 登录的是另一账号，不能证明所有其他私人账号均无副本；因没有明确远端对象，本轮未执行 GitHub 删除。
- 共享工作台历史快照、交接与本删除记录只保留审计事实，不是当前项目或可运行备份。其他生图 Skill 工作、共享父仓、独立银饰计划和带教协同均未删除。
- 输出 `WB-20261009-315` 后释放写入者。唯一下一步：常浩打开原 5178 项目空间确认 MuseMap 不再出现；若另有具体远端 URL 或非本机副本，再凭该精确身份处理。

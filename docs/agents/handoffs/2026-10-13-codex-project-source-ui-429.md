# 项目空间来源UI恢复429

输入427 → 认领428 → 输出429。用户要求恢复旧版“全部项目”的青色 LOCAL / 紫色 GIT 实心来源格、清楚无挤压，并明确选择等抖音收藏完成后再做。已等另一会话425候选与426采用交回427、写入释放后认领；首次认领预检发现426再次占用，未写业务文件。

## 改动与采用

- `src/projects-v16.css`：撤掉末尾描边、居中及内外间距覆盖，恢复原有实心伸展来源格；新增关联标识使用既有紫色令牌。手机LOCAL可用/滚动宽度从26/43px恢复为43/43px。
- `src/ProjectsV16.jsx`：本地且已有 `githubUrl` 的行补紫色 GIT 小块。来源主格、筛选口径和分区仍按原规则；纯远端保持原紫色 GIT 格。实际主项目仍6个本地、1个已关联，没有新建或改类。
- 上方在推进卡片、项目分区/排序、动作、权限、逻辑、数据均保留。源文件只改上述2项。
- 原5178已提供最终构建，17项磁盘清单、5项公开HTTP字节、实际1440/390 DOM与截图一致；本轮PID13548未变，未重启。427抖音采用保留。

## 证据与验证

[前后图与简明报告](../../../work/project-source428/report.html)；[最终源清单](../../../work/project-source428/source-manifest.json)；[两文件差异](../../../work/project-source428/change.diff)；[构建清单](../../../work/project-source428/build-manifest.json)；[HTTP回读](../../../work/project-source428/http-readback.json)；[实际DOM](../../../work/project-source428/actual-dom.json)。

- 构建通过。三组浏览器命令退出0：项目专项（七宽、长名、焦点、44px、axe、正常/空/错误与原操作），目录专项（项目/资产/任务分层及编辑），来源专项（1440/390/320、实心两色与无文字裁切、9LOCAL/3GIT/2关联、原筛选与合成数据不变、外连0）。日志在 work/project-source428 的 projects-final、catalog-final、source-final.log。
- 首次受限环境 Chromium 启动与本地监听 EPERM 日志保留，获准隔离环境重跑解决；它们不是产品失败。没有用真实库试写。
- **完整单元1211：1210通过、1失败**，见[unit-final.log](../../../work/project-source428/unit-final.log)。失败为既有 `src/assets-quick-copy.css: border-radius:6px` 令牌检查；本票前像哈希相同，425已在修改前快照复现（work/douyin424/baseline-style.log）。本票不改资产样式，也未将全量宣称为全绿。
- 两轴最终只读审查0发现，新增颜色令牌P3已闭合；同构建T2 VISUAL_PASS、0 must-fix，见[review-final.md](../../../work/project-source428/review-final.md)。不代签Claude或真人验收。
- 同场景合成前后1440/390用于确认纯Git来源，真实页面前后另列；实际前像滚动位置略有差异。合成图不代表真实项目。

## 保全、边界与下一步

[基线](../../../work/project-source428/baseline.json)：2065项当前既有文件、189链接保全；无丢失/范围外源码变化，HEAD及依赖保持；data/CURRENT.json、data/collection/state.json、427抖音16项冻结源码哈希不变。动态 data/capability-use.json 随原服务变化保留，不回滚。旧完整dist在 work/project-source428/dist-before。最终保护核对见 work/project-source428/protection-final.json。

无新增依赖、提交、推送、后端重启、真实数据修改或外部消息。未创建后台定时跟进；等待在本会话完成。

最小使用说明：刷新工作台，进入“项目空间”→“全部项目”，看到青色LOCAL实心格；已有GitHub关联的本地项目另有紫色GIT标识，纯GitHub项目为紫色来源格。

唯一下一步：常浩验收项目列表呈现。既有资产6px令牌失败继续开放；[427](2026-10-13-codex-douyin-adoption-427.md)的Chrome插件重载与真实抖音单条首验仍待常浩。当前写入者释放为无；后续重启需新的明确授权。

# Codex｜收藏335验收341返修 · WB-20261010-344

```text
输入状态 / 输出状态：WB-20261010-341（写入者无）→ 342认领 → 用户截图追加R3，343扩围 → 344交回（完成回读后写入者无）
执行者 / 范围：Codex；R1/R2 + S1/S2，以及常浩本轮追加的R3（画布分组签遮挡帖子与名称截断）。
本轮产品改动只有 src/collection.css、src/collection/app/components/DeskView.tsx；测试只扩充 collection-redesign-browser.mjs；另有dist、CURRENT、本交接与证据。
唯一下一步：Claude 复验 R1/R2/R3/S1/S2；通过后由常浩在5178一次性验收收藏。
```

## 1. 实读与范围

按用户指定顺序实读 AGENTS → CURRENT头部 → COLLABORATION第4/6节 → 验收341全文 → 派单335 Z2/Z9。实际341、无人写入、唯一下一步Codex返修，与预期一致。Git HEAD仍为27160d2；其后的旧改动和本轮改动全部保持未提交。

342先保存1834个文件指纹、三目标文件与CURRENT前像、完整旧dist；回读认领后开工。常浩追加截图指出画布“AI…”分组签挡住首张相纸，登记343扩大到R3；不顺带改其他区、页面或开放项19–21。

## 2. 最小返修

| 项 | 改动与保留 | 本轮验证 |
|---|---|---|
| R1 | reader-bar不折行；category flex:1 1 auto/min-width:0/nowrap/ellipsis，title保留完整名；现有原帖、删除/确认、关闭同级操作均flex:none。没有改动作结构和回调。≤430px局部缩小横向padding/gap，保留44px | 六宽默认与删除确认态共12例；操作中线差0px，关闭键右边距0px，分类实际省略且title完整 |
| R2 | 搜索计数绝对定位在输入框右侧，输入右padding让位；手机也不增加文档流高度。role=status保持 | 1024/1440搜索框与两键中线差0px、轨道高度差0px；六宽键帽≥44px且无横向溢出 |
| S1 | 最后一步用 :has(+ .collection-danger-zone)取消底部虚线，保留危险区实线；原last-of-type选择器被后面的同类型div阻断 | 插件弹窗六宽截图、axe与原有弹窗断言通过 |
| S2 | 选中缩略图增加底部3px青条；悬停只提亮，选中描边/aria-pressed保留 | 原缩略图全访问、选中状态与阅读器断言通过；选中与hover有独立样式 |
| R3（用户追加） | 分组签上移32px、紧凑44px、固定168px宽；copy flex:1、名称18px行高，常见名完整展示，长名通过名称title/按钮title/访问名查看完整文字；编辑键跟随44px。不改buildOrganized/sr、堆叠角度、相纸尺寸、展开与拖拽逻辑 | 默认/展开六宽12组几何检查，本组帖子最小间距13.35px；默认标签与所有相纸交叉遮挡0；普通名“分组2”不截断。collection-browser的新建/重命名持久化与额外原生拖拽专项均通过 |

S3保持341已接受的过滤后胶囊行为。真实“AI工具”截图所示缺陷通过分组签最小宽度与留白修正；未读取或写入真实帖子正文来制作合成证据，真实人验仍待常浩。

本轮diff以 [task-only.diff](evidence-2026-10-10-codex-collection-343/task-only.diff) 为准，基线是实读341/339冻结产品，不把Git累计diff算成这次返修。buildOrganized/sr逐字一致；reader操作JSX除category title外未变。

## 3. 隔离验证

所有测试使用：

```sh
export NODE_OPTIONS="--import=$PWD/docs/agents/handoffs/evidence-2026-10-06-codex-221/isolation-runner/register.mjs"
# 各浏览器用 GUIJI_TEST_RESULTS 指向本证据目录独立子目录
node tests/collection-redesign-browser.mjs
node tests/collection-browser.mjs
node tests/collection-recycle-browser.mjs
node --test tests/design-tokens.test.mjs
npm test -- --test-concurrency=1
# R3移动可拖签，追加的相称回归
node tests/collection-drag-browser.mjs
```

| 检查 | 结果 | 日志 |
|---|---|---|
| npm run build | 通过；构建后未改产品源码，dist冻结 | [build-first.log](evidence-2026-10-10-codex-collection-343/build-first.log) |
| redesign（改前） | 通过；冻结旧dist、同fixture，六宽截图 | [before.log](evidence-2026-10-10-codex-collection-343/before.log) |
| redesign（首轮改后） | 通过；随后仅补R3展开/跨行证据，未改产品源码 | [redesign-first.log](evidence-2026-10-10-codex-collection-343/redesign-first.log) |
| redesign（最终） | 通过；保留所有旧断言，新增R1/R2/R3断言；六宽、44px、axe0、焦点/Esc、动效与只复制配置通过 | [redesign-final.log](evidence-2026-10-10-codex-collection-343/redesign-final.log) |
| collection-browser | 通过；分组、阅读器、搜索、配对、六宽与SPA原回归 | [collection-browser.log](evidence-2026-10-10-codex-collection-343/collection-browser.log) |
| collection-recycle-browser | 通过；单按钮、未知结果不重放、幂等、revision/draft、错误分支、六宽 | [collection-recycle-browser.log](evidence-2026-10-10-codex-collection-343/collection-recycle-browser.log) |
| design-tokens | 4/4，0跳过 | [design-tokens.log](evidence-2026-10-10-codex-collection-343/design-tokens.log) |
| 全量串行 | 1196/1196，0失败、0跳过 | [npm-test-serial.log](evidence-2026-10-10-codex-collection-343/npm-test-serial.log) |
| 额外collection-drag-browser | 通过；Alt多选、原生多笔拖入、原生分组排序持久化、外部drop、焦点恢复 | [collection-drag-browser.log](evidence-2026-10-10-codex-collection-343/collection-drag-browser.log) |

测试使用guiji-*临时库与随机端口；宿主/Vault/私人会话适配器禁用；真实data访问防护触发记录0。没有断言删除、放宽或skip。未重跑motion/video/extension及138图全站visual；这些产品区域未改，继续使用339冻结证据，本轮不代签新的全站验收。

## 4. 六宽改前/改后

[打开18组可折叠审阅页](evidence-2026-10-10-codex-collection-343/review.html)。同一14帖/12组/11图合成输入；左改前、右改后；无缩放或平移。reader与search原图完整，分组对照裁顶部1100px且保留完整原图链接。截图采用reduce动效、900px视口；两个构建均相同。实测数据见 [几何原记录](evidence-2026-10-10-codex-collection-343/after/geometry.json)、[汇总](evidence-2026-10-10-codex-collection-343/verification-summary.json)、[对照方法](evidence-2026-10-10-codex-collection-343/comparisons.json)。

| 宽度 | R1长名阅读器 | R2搜索态 | R3分组签 |
|---|---|---|---|
| 320 | [阅读器](evidence-2026-10-10-codex-collection-343/compare/reader-320.png) | [搜索态](evidence-2026-10-10-codex-collection-343/compare/search-empty-320.png) | [分组签](evidence-2026-10-10-codex-collection-343/compare/default-320.png) |
| 375 | [阅读器](evidence-2026-10-10-codex-collection-343/compare/reader-375.png) | [搜索态](evidence-2026-10-10-codex-collection-343/compare/search-empty-375.png) | [分组签](evidence-2026-10-10-codex-collection-343/compare/default-375.png) |
| 390 | [阅读器](evidence-2026-10-10-codex-collection-343/compare/reader-390.png) | [搜索态](evidence-2026-10-10-codex-collection-343/compare/search-empty-390.png) | [分组签](evidence-2026-10-10-codex-collection-343/compare/default-390.png) |
| 430 | [阅读器](evidence-2026-10-10-codex-collection-343/compare/reader-430.png) | [搜索态](evidence-2026-10-10-codex-collection-343/compare/search-empty-430.png) | [分组签](evidence-2026-10-10-codex-collection-343/compare/default-430.png) |
| 1024 | [阅读器](evidence-2026-10-10-codex-collection-343/compare/reader-1024.png) | [搜索态](evidence-2026-10-10-codex-collection-343/compare/search-empty-1024.png) | [分组签](evidence-2026-10-10-codex-collection-343/compare/default-1024.png) |
| 1440 | [阅读器](evidence-2026-10-10-codex-collection-343/compare/reader-1440.png) | [搜索态](evidence-2026-10-10-codex-collection-343/compare/search-empty-1440.png) | [分组签](evidence-2026-10-10-codex-collection-343/compare/default-1440.png) |

根代理已打开reader-320、reader-1440对照、search-empty-1024对照、default-390目视核对；全部六宽依几何/axe与原图留证，不把有限目视核对写成逐图独立验收。

## 5. 5178采用与保护

- 无重启、无停启。现行5178 PID 2596；`/`及`/assets/`下10个资源均200，与新dist逐字节一致。见 [runtime-byte-readback.json](evidence-2026-10-10-codex-collection-343/runtime-byte-readback.json)、[dist指纹](evidence-2026-10-10-codex-collection-343/dist-sha256.json)。用户刷新 `http://127.0.0.1:5178/#learning` 即可看到本轮候选。
- 首次尝试枚举全部20个dist文件HTTP访问时，`/theme/digievolution/crests.png`返回404中止；重新按既有server/http.mjs静态白名单核实：其余10个/theme资源同为404，不在静态可读路由范围。原始失败与完整枚举保留在读回JSON。没有修改HTTP/server以消除既有边界，也不声称20/20均在线可取。
- 主库`data/CURRENT.json` SHA `9478ee2539d5208e7b7b343867abaa8812172f6d171f0c72fb1c7a6f0bbc6f4f`不变；收藏22/22文件不变。state38/15媒体沿用331事实，不写data/collection或主库。
- 1834个基线文件除本轮三目标和CURRENT外，产品/测试/文档无其他漂移；server/native、浏览器插件、依赖、其他页面样式、D1文件及v16-open-issues均保留。两个布局函数逐字一致。
- 运行期间另观测`data/capability-use.json`及`data/aihot/cache.json`变化：AIHOT元信息`status=ok`、lastAttemptAt/lastSuccessAt=`2026-10-10T03:46:26.713Z`；调用者未独立核实。本任务未直接写这些文件、未调用5178写入API；保留观测状态、不恢复旧SHA，不把180/180全data写成不变。当前178/180相同。见 [protected-final.json](evidence-2026-10-10-codex-collection-343/protected-final.json)；较早核对首次发现缓存漂移的证据 [protected-pre-handoff.json](evidence-2026-10-10-codex-collection-343/protected-pre-handoff.json) 也保留。

## 6. 交回与边界

工程返修、隔离检查、新dist在5178静态采用完成；Claude复验、常浩真人验收未完成。本轮不等于真实MCP/ASR/Chrome使用验收。未提交、推送、装依赖；未写真实Agent配置；未启用Obsidian、读Vault/私人会话；未实施19–21。

CURRENT输出344，回读交接/证据/唯一下一步后释放写入者。已写入共享状态，待Claude实际读取；没有发送跨客户端消息，也没有把文档落地当成Claude接手回执。

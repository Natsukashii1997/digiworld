# Claude 交接：程序坞应用图标换成「A 数码夜景」（2026-10-28）

输入状态 / 输出状态：读到 CURRENT 头表 WB-20261024-651（写入者仍是 Claude 认领651，设置页 v19 未提交）；本轮按 652–666 的惯例由用户逐轮授权，只提交本轮文件，不改头表、不碰 651 的未提交改动。没有新开 state_id。

执行者 / 本轮范围：Claude 子会话 local_faf9470b（由 local_672a81c9 派出）。只换 macOS 程序坞里「数码世界」的应用图标；浏览器标签页图标（`index.html` 第 12 行 `digivice-192.png`）、侧栏品牌徽章（`src/App.jsx` `PixelBadge sprite="crest"`）、左下角伙伴屏都不动。

## 来源与定稿

- 程序坞里的「数码世界」是 Safari「添加到程序坞」生成的网页应用 `~/Applications/数码世界.app`（10-08 生成，adhoc 签名，无可执行文件，`LSTemplateApplication`），图标是 Safari 按网站清单 `public/assets/manifest.webmanifest` 的图生成的 `Contents/Resources/ApplicationIcon.icns`。
- 设计经过多轮：用户先给暴龙兽像素图 → 嫌复杂、要主体明显 → 改为用户给的拼豆图纸（55×65 格，逐格读出，11 色格数与图例一致）原封不动、原配色 → 背景重画，最后在「A 数码夜景（大青色齿轮光环 + 科技城市 + 透视网格地面）」和「B 全息电路 · 六边形 HUD」里选 A。设计稿与脚本在 `work/app-icon/bead-v12/`（`read.py` 读图纸、`common.py` 贴主体、`makeA.py` 画背景），不进仓库。

## 改动文件及结果

- `desktop/app-icon/source-1024.png`（新增）：定稿 A 的 1024 满版方图。
- `desktop/app-icon/make-icons.sh`（新增）：由原图用 `sips` + `iconutil` 生成 `public/assets/app-icon-192.png`、`app-icon-512.png` 和 `work/app-icon/AppIcon.icns`（16–1024 含 @2x，备用）。
- `public/assets/app-icon-192.png`、`app-icon-512.png`（新增，脚本生成）。
- `public/assets/manifest.webmanifest`：两个图标路径改为 `app-icon-*.png`。
- `index.html` 第 13 行：`apple-touch-icon` 改为 `/assets/app-icon-192.png`。
- 旧 `digivice-192.png` / `digivice-512.png` 保留（标签页仍用 192）。

## 已装应用怎么换上的

- 第一次尝试替换包内 `ApplicationIcon.icns` 被 macOS「App 管理」拦（`kTCCServiceSystemPolicyAppBundles`，责任进程是 `~/Library/Application Support/Claude/claude-code/2.1.309/5af865b9901c/claude.app`）；用户把它加进「App 管理」后替换成功，但重签后应用打不开：LaunchServices 报 `-10827 / -10410 Expected signature for template application did not match or was missing`。Safari 网页应用的签名被系统登记，改包内任何封装文件再重签都会被拒。已用备份整份恢复，CDHash 回到 `7bef5771…`。
- 最终做法：用 `NSWorkspace setIcon:forFile:` 贴自定义图标（等同 Finder「显示简介」贴图），图是按 Safari 原版式（824 圆角 + 外围阴影）合成的 `work/app-icon/程序坞自定义图标-1024.png`。签名 CDHash 不变、`Contents` 与备份逐字节一致，只在包外层多一个隐藏 `Icon\r`。打开后进程正常起来，无校验报错，程序坞显示新图标。
- 撤销：Finder 对「数码世界」显示简介，选中左上角小图标按删除键。整包备份：`work/app-icon/backup-20261028/数码世界.app`。

## 验证

- `npx vite build --outDir <草稿目录>` 通过；产物清单图标为 `/assets/app-icon-192.png`、`/assets/app-icon-512.png`，`apple-touch-icon` 为 `app-icon-192.png`，标签页 `rel=icon` 仍为 `digivice-192.png`；产物图标与 `public/assets` 逐字节一致。
- 全量 `npm test` 未跑：只改静态图标与清单路径，测试不引用这些文件。
- 证据：`work/app-icon/evidence/`（改前改后程序坞、系统图标、签名对比、A 版实拍）。

## 运行服务 / 真实数据

- 正式 5178 未发布，仍提供旧清单；只有从 Safari 重新「添加到程序坞」时才会用到新清单，下次发布时带上即可。
- 真实数据未变。

## 未完成项及风险

- 用户给 `claude.app` 开的「App 管理」权限已用不到，建议用户关掉。
- 自定义图标挂在应用包外层；如果 Safari 重建这个网页应用，图标会回到清单里的图（下次发布后清单已是新图）。

权限与禁止事项：未推送；未改 CURRENT 头表；未碰 651 与其他会话的未提交改动。

唯一下一步 / 建议接手者：无本轮后续；新清单随下次 5178 发布带上。

本轮新坑：Safari「添加到程序坞」的网页应用不能改包内文件后重签（LaunchServices 校验模板应用签名，-10410），换图标只能贴自定义图标或让 Safari 重建。
提升：已提升为全局 G-15（`/Users/nat/Documents/ChatGPT/个人/work/agent-kit/LESSONS.md`，agent-kit `011a196`）。

## 第二轮（同日）：改为「头像特写 · 华丽版」

- 来由：用户看实际程序坞说「不够明显、最突兀」。对照邻居图标分析：背景六层元素在 50px 下成噪点、全身像空隙多且条纹发花、底色深与深色程序坞分不清边界、色相五种。改为头像特写（拼豆暴龙兽原配色，19→18px 一格，只由画布边缘自然出画），背景只留一个多层光圈；用户要求更精致、更华丽后，光圈按 3px 细像素重画（与 18px 格对齐）：远景 24 道放射光束、中景断续轨道弧与点刻度、12 段斜面齿环（左上受光、段面高光条）、橙金菱形标记、盘面泛光 / 同心圈 / 网格 / 带缺口内环 / 36 块刻蚀轨道、光粒与暴龙兽青白背光。
- 用户又指出「不在一条水平线上」：实测与邻居图标上下边差不到 1px，是底边被出画的身体糊掉、上方亮光圈让重心上提造成的视觉错觉。修正：最下 16% 由透明到深青收边、四边 6px 细亮青内描边。
- 改动文件：`desktop/app-icon/source-1024.png`（换成修正版）、`desktop/app-icon/make-icons.sh`（注释改定稿名与设计稿目录 `work/app-icon/bead-v17/`）、`public/assets/app-icon-192.png`、`app-icon-512.png`（重新生成）。清单与 `index.html` 本轮未再改。
- 已装应用：重新贴自定义图标（CDHash 仍 `7bef5771…`，`Contents` 与备份一致）；正常退出再打开一次，`touch` + `lsregister -f` + 重启程序坞后显示新图标（运行中的应用和程序坞都会缓存旧图，只贴图不够），无校验报错。实拍 `work/app-icon/evidence/程序坞-修正版实拍.png`。
- 验证：`vite build` 到草稿目录通过，产物两张图标与 `public/assets` 逐字节一致，清单与标签页图标路径不变；`npm test` 未跑（只换静态图）。

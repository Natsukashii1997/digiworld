# Claude统一验收包：UI v14g批次1、2、3

输出状态WB-20261004-141，写入者已释放为“无”。唯一下一步：**交Claude统一验收批次1、2、3**，Claude给通过/返修清单后再交用户终验。此包是Codex开发与工程回归交接，不是Claude已读或视觉验收回执。

用户已确认夜巡采用v14g，且要求批次2、3全部完成后统一验收；night-v2方案不采用。依据为项目内v14g-preview.html、STYLE-GUIDE全文和COLLABORATION第6节。设计文件浏览器打开遭安全拒绝，用户允许HTML/CSS/交互源码点检替代，未改协议、换端口或换工具绕过。

## 文件修改

批次1完成待处理分诊队列、版本归档时间线、逆向看板与剪报；批次2完成AI HOT日报、学习书架与清单、随手记便签墙；批次3完成日历周轴、设置分类与配置抽屉、夜巡24小时表盘。页间仅共用令牌、页头和无样式单选辅助；没有掌机外壳、换页特效、整屏闪光或贴小插图。

业务handler、schema、服务接口与依赖保持。项目125/127/Claude129及批次1未提交变化保留，HEAD仍15dd5ba70877180fcf251150cb460e5dfda4ba4c；未reset、stash、提交或推送。22个源码/样式/测试文件相对WB139有变动，完整前后SHA256与关键diff见下；新增元文件另有台账。

- [批次1交接](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch1/批次1交接.md)
- [批次2交接及中间快照](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch2/批次2交接.md)
- [批次3交接及逐条断言变化](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch3/批次3交接.md)
- [批次2、3从WB139到最终源码的关键差异](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-unified/关键差异.patch)
- [批次3相对批次2中间回档SHA256](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch3/sha256.json)
- [统一文件台账](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-unified/文件台账.json)

批次2交接中的源码SHA是该批完成时的中间快照。批次3又改了共用文件中的设置表单、提示文案和测试入口；最终指纹以统一台账为准。下面批次2图片已补拍最终dist，旧中间对比完整保留在批次2交接中。

## 测试结果

每批均先build，再npm test、全部浏览器入口逐个、visual。批次1为607单元、53入口；批次2为607单元、54入口；批次3最终冻结版本为**607/607、55/55、visual problems=[]**，fail/skip/cancel均0。最终292个源码/测试/服务端/依赖文件和13个dist文件SHA256回读无漂移。

专项包括44px、320/390逐元素无横越界/隐藏裁切、长中英文、axe、减少动态效果与运行中切换；以及筛选空态/回焦、失败保留草稿与主库、一次反馈、只读与权限拒绝、跨日/全天/重叠/15分钟比例、标题全文、IME及busy重复Enter、设置单抽屉焦点、开关只改草稿、配置刷新失败、夜巡真实时长与不启用。具体条件和断言见各批交接。

旧断言只随实际角色/入口等价调整，不改业务预期，不跳过、不延长超时；新增专项的透明file层按真实label命中区测44px，可见文字仍全查。首败和定位记录保留。批次2资产置顶一次超时按源码/时序推断为saveLock疑点，改前/改后原脚本重跑均10/10通过，尚未确认其首败运行时原因或消除既有时序竞争。构建仍有既有大bundle提示，未调阈值。

测试运行在随机端口与所属guiji临时目录，用Node导入钩子阻断默认宿主/Vault/网络/日历/Agent读取，显式合成桩优先；服务路由和业务模块仍正式代码。运行器不是操作系统强隔离，不能把其结果称为真实宿主/外部系统验收。源码与运行器、逐条退出码、原日志均已存于项目共享证据目录及本包证据。

- [最终验证记录](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch3/verification.json)
- [静态服务字节核对](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch3/service-static.json)

## 九页前后对比

均为固定合成输入、1440/390、1:1原像素拼接，未缩放裁切。批次1“前”来自WB137改前dist；批次2“前”来自WB139；批次3“前”来自批次2中间回档。批次2、3“后”均为最终冻结dist，批次1源码在后续批次未变。

|页面|1440前后|390前后|Claude重点检查|
|---|---|---|---|
|待处理|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch1/comparisons/inbox-1440.png)|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch1/comparisons/inbox-390.png)|分诊密度、来源下划线、单条动作、数据缺口|
|版本归档|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch1/comparisons/history-1440.png)|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch1/comparisons/history-390.png)|资产选择、当前版本光效、字段/行差异、恢复文案|
|逆向工程|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch1/comparisons/references-1440.png)|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch1/comparisons/references-390.png)|四列看板、选中卡与剪报、荧光批注|
|AI HOT|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-unified/batch2-final/comparisons/aihot-1440.png)|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-unified/batch2-final/comparisons/aihot-390.png)|日报层级、主次稿、分类、可见已收藏|
|学习成长|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-unified/batch2-final/comparisons/learning-1440.png)|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-unified/batch2-final/comparisons/learning-390.png)|长书名、书架/清单差异、空态、筛选回焦|
|随手记|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-unified/batch2-final/comparisons/notes-1440.png)|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-unified/batch2-final/comparisons/notes-390.png)|速记优先、原五色语义、便签墙、工具位置|
|日历|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch3/comparisons/calendar-1440.png)|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch3/comparisons/calendar-390.png)|整点轴/红线、七天可达、真实比例与全文入口|
|设置|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch3/comparisons/settings-1440.png)|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch3/comparisons/settings-390.png)|两栏/分类、备份原门禁、配置抽屉与失败提示|
|夜巡|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch3/comparisons/night-1440.png)|[查看](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch3/comparisons/night-390.png)|真实时间弧、草稿/未启用、完整任务与数据缺口|

资产仓库和银饰源码、共享样式未变。批次1/2中间保护图四张逐字节相同；批次3资产1440/390和银饰1440相同，银饰390有21个圆角边缘像素差（最大通道6）。188个可见元素的坐标/尺寸/计算样式均相同，同一最终dist重复四图相同；原因未证实，未遮罩或修图。详见[保护图数据](/Users/nat/Documents/Codex/2026-10-04/ai-ui-users-nat-documents-chatgpt/outputs/ui-v14-batch3/screenshots.json)。

## 数据缺口与设计偏离

所有页缺失的数据都占位登记，没有把预览示例写入真实记录：分诊级别/统一时间、素材草稿/复制回执/Agent身份/原文锚点、长文本精确行差异、新闻模型等新分类/期号、图书作者/封面/阅读进度/正文、目录大小/上次备份/访达接口、夜巡结构化任务/执行时点/回执。

各页完整偏离理由见交接。主要取舍：44px优先于预览小按钮；长内容伸展不裁切；原五色便签语义保留；窄屏日历七天可达，时间轴色块与全文编辑清单分开；todo保留原顺序；设置备份区避免双层Dialog；网络开关仍需保存draft；共享导航保留“模型设置”保护其他页面；夜巡只显示已有草稿而不造三条任务。Claude应逐项判断视觉质量和这些取舍，不能用全绿回归替代视觉验收。

## 运行服务、未做与接手

5178仍是原node PID507，未停止/重启。仅静态HTML/JS/CSS只读核对，200且与最终dist一致；用户刷新即可看到新静态UI。真实API、Vault、凭据、私人会话均未读，data仅CURRENT.json哈希，仍cf914041e9395a8e77ed286847494122b38b74157cbe6090967086f28e8a52e4。

尚未完成：Claude视觉验收、用户终验、真人输入法/真实日历/提醒事项/外网/书架路径验证、缺口数据接入。未部署云端、提交或推送。10个未引用主题PNG的既有静态白名单404问题沿用批次1登记，没有扩大本批范围。

Claude启动文字：

> 请实际读取项目AGENTS.md、CURRENT.md、COLLABORATION.md第6节、STYLE-GUIDE全文和交接141。回报读到WB-20261004-141、写入者无，核对统一台账后认领验收。按v14g统一验收批次1/2/3九页，查看18张对比图、关键diff和各页偏离/数据缺口；给通过或有页名、位置、原因与标准的返修清单。返修交Codex，验收通过后再交常浩终验。不要把Codex工程全绿当作视觉通过，不动真实data/Vault/凭据、资产仓库/银饰或5178进程。

共享目录尚无核实的自动跨客户端消息通道：**已写入共享状态，待Claude实际读取**，没有代签已读或验收。

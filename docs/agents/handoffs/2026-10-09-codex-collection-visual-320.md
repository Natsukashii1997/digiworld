# 收藏清晰度、散落与呼吸感阶段交接320

日期：2026-10-09。当前会话：01a11f88-a8ee-7150-987c-13acfff4a943。
本记录是视觉修正阶段交接，不表示完整收藏复刻或真人验收已完成。

## 用户最新基线

- 同一帖子在数码世界中分类文字被裁、标题拥挤，要求清晰度优化。
- 随后明确纠正：未进组的笔记应像看看收藏一样散乱摆放，笔记有呼吸感。
- 上一轮把未分组卡片回正的处理撤回。保留原版确定性错位、随机角度与分组堆叠，不用方正网格代替。
- 旧书架/旧learning记录可删除的授权已执行，不得重复清除新收藏；磁盘书籍原件不在删除范围。Chrome安装、配对和一次真实帖子测试既有授权不扩大为批量采集。

## 实现与原因

- 源图定点读回为1080x1920；下载链路直接写响应字节，没有重新压缩。已证实文字问题是迁移CSS将12px分类字形压进12px行盒且隐藏溢出。
- 分类12px字、18px行盒；标题12.5px字、19px行高、两行38px；纸卡156x212，配图118高，展开间距170/226。完整预算为7+118+7+18+4+38+20=212。
- 图片去掉颜色滤镜，保留已有原图；未重新收藏、改分类或重写真实媒体。
- 恢复未分组和折叠组的上游随机角度；位置取整数像素。悬停只轻微抬起，不回正或放大。
- 3秒上下0至-2px浮动，每张错开相位，并有轻微阴影变化；不持续缩放字形。系统减少动效时静止，运行时双向切换有效。
- 新建分组改为画布末尾流内按钮，避免窄屏遮组名；组名与计数单行，长名字省略，完整可访问名保留，避免展开组签增高遮住相纸。组签外层采用Framer的x:'-50%'，避免y动画覆盖CSS transform导致编辑按钮被裁。

## 变更指针

- src/collection/app/components/DeskView.tsx
- src/collection/app/lib/desk-card-metrics.mjs
- src/collection.css
- tests/collection-browser.mjs
- tests/collection-motion-browser.mjs
- docs/agents/collection-replica/SPEC.md
- dist：index-CLwhBlfa.js / index-BRbdoarf.css

## 当前验证

- npm run build通过。现存大chunk警告未在本次无关重构。
- JS SHA256：8aa41ec17904e118db77f74f04d85d8bf9a25e3397c93054cd666b7488045e51。
- CSS SHA256：b62b2fa848bd1d0c8f2833e1cf56e2249d62eae866156f095ad3524bdc696b52。
- 最终构建下collection-browser通过：320/375/390/430/1024/1440，axe无违规、无横向溢出、完整标签行盒/两行标题、不同散落角度、悬停不缩放、组名单行、展开编辑按钮完整位于画布边界内且宽度至少44px、画布/展开/阅读/搜索/分组持久化/配对及合成XHS SPA切帖。
- 最终构建下collection-motion-browser通过：实际DOM transform持续浮动，减少动效与恢复动效两个方向均验证，字形不缩放。
- 最终构建下collection-drag-browser通过：Alt多选、原生批量拖拽、组排序、外部DataTransfer收录、阅读焦点圈与返回。
- 上述测试均通过isolation-runner/register.mjs注入，在合成隔离根和随机端口运行；不写真实5178数据。
- 实际5178独立IAB预览读回现行资产index-CLwhBlfa.js，三张未进组卡片角度不同、呼吸位移不同，分类clientHeight=scrollHeight=18。原用户页面未再次强制刷新，避免干扰正在进行的操作。
- 当前截图：/Users/nat/Documents/Codex/2026-10-09/ui/outputs/收藏-散落与呼吸感.jpg。
- T2最终复核以最新六张test-results/collection/stack/expanded/reader-{320,1440}.png为证，结论VISUAL_PASS，仅限本次视觉范围，不替代整体QA或真人验收。F1固定按钮遮组名、F2组签换行遮白边、F3编辑按钮裁切均已resolved；320编辑按钮约x200至244，完整44px盒在画布内。依据SPEC SHA46eafec918b29b8c4951f0e6203626025365580029abd5a331457da36d035f27与既有STYLE-GUIDE SHA91f78bd292882cd54b7e9efe8ef5d97af569d099703ce16d846b0e28f0381181。不要沿用旧DTO/CYg/Bh34截图结论。

## 首次失败与纠正

- 新hover测试初次选中硬编码的5/6号合成笔记，而fixture按实际返回顺序把它们放入折叠组，悬停被上层卡片拦截。改为从fixture workspace读出真实loose成员，没有强制穿透点击；重跑通过。
- 后一次图片检查在合成媒体尚未解码时过早断言失败。改为有限等待全部6张complete且naturalWidth>0，再执行原断言；不接受空列表或隐藏坏图，重跑通过。
- T2初次发现fixed按钮遮组签，修复后又发现320展开组名单行挤压，再发现编辑按钮右裁。分别修正流内按钮、文本列flex/nowrap及Framer居中；保留失败记录，最终版本重新截图与检查。

## 未完成与唯一下一步

完整319复刻尚未封板：受控MCP客户端实际采用、真实原生ASR验收、全套共享回归及最终后端采用仍需要收尾。前期focused检查、实际Chrome收藏、OCR结果不能替代这些层级。
当前写入者仍为本会话Codex；下一步在相同已授权范围内完成319收尾验收，先处理受控只读MCP接入缺口，再完整回归和精确运行采用。不得自动写全局客户端配置、读取凭据或Vault，不得提交/推送/发布，也不得清除新收藏。

# Codex 390：全部资产卡片三操作

输入388，按常浩最新纠正认领389→工程交回390。旧388的仅正文三类/常驻/44px口径被本票覆盖。当前代码、静态供应与隔离验证完成；Claude质量验收、常浩使用验收未完成，386及384待验继续保留。

## 可见结果与使用

资产页鼠标移到任意卡片，显示复制、删除、置顶三个32px按钮及14px图标；复制在删除左侧，间隔8px。默认隐藏；键盘聚焦显示，触屏保留可见入口。网格/列表及全部六类统一。点击复制直接写剪贴板，不进入详情。

Prompt/规则复制当前全文，工作流沿用固定引用；Skill沿用10分钟完整包安装口令，含全部依赖；MCP复制当前公开JSON定义，不代选目标，详情已登记Codex目标/TOML门禁保留；焚决复制全部未删除正文，按原顺序以空行分隔，每个复制条目计一次。空卷提示不覆盖剪贴板。复制拒绝不计次；整卷保存结果未知时提示并锁复制等待刷新，不自动重放。正文/Skill/MCP沿用共享使用记录锁、原记录ID及查询后补记恢复。复制不证明安装、连接或使用效果。

## 变更与审查

- src/Assets.jsx、src/assets-quick-copy.css；新tests/assets-actions-browser.mjs及受影响的assets-copy/assets-pin/scrolls浏览器测试。src/AssetUsage.jsx及后端未改。
- start_head=e6e5d8b74474ea408ebb171ab70415e32d57ada4；未提交，无completion commit。接手dirty前像work/assets389/before、1116文件基线baseline.json。原无关dirty保留。
- candidate2七文件清单 `63f1620f72449637b0bf0b2d7cae77c2272374ef63155808726fee3b596f8d6d`；生产源码/测试字节与冻结审查匹配，收尾只修改单票状态/跟踪/CURRENT和证据。Spec0新发现；Standards0硬违反/0新建议，首轮P3 helper命名已关闭。详见[两轴记录](../../../work/assets389/review-final.md)。
- 用户明确要求按钮缩小，32px仅限三个卡片操作的旧44px标准例外；其他入口44px不变。小屏列表恢复正文64px右留白，只在成长栏留24px，避免新增来源竖排。既有320列表MCP折行/描述裁切保留，不宣称全列表无裁字。

## 验证与真实采用

- 串行1206/1206单元/API通过（unit-final.log）。14个原浏览器入口通过（regression/results.json）。最终CSS只修列表留白，最终构建重跑受影响5入口（regression-final/results.json）及两个复制专项（actions-final.log、copy-final.log）；余9入口覆盖相同生产JSX/hook。无类型检查脚本，Vite构建通过；继承大包体积提示。
- 六类×六宽320/375/390/393/430/1440×两布局的三操作尺寸、默认/悬停/聚焦、相邻/无重叠/序号和横溢、Axe通过；触屏浏览器仿真可见。完整Skill包下载验证3个文本/二进制文件，MCP无目标JSON复制、卷已删除排除/空卷/成功计次/拒绝/保存失败、普通双击和刷新均通过。原全文跨入口未知记录与并发门禁继续通过。
- 最终17文件dist清单 `38f64d6dc3c3c892e009e0419812fccd88323b4921c514bed5698c4f351634ad`；HTML正式根路由、JS index-ORRIvQeR.js、CSS index-DYmZFy4o.css、manifest及图标五项公开HTTP逐字节一致。5178/PID97328未重启。用户原有浏览器1533宽已刷新，6张真实卡片每张三个32px控件、默认opacity0；仅用键盘聚焦证明opacity1及位置，随后恢复默认。无真实复制/测试性增删。
- 65张前后/最终/真实截图清单 `3b4b20818ca5d43cb18805f343608f7c8e58d0b709aa0bfd653c2994380ad0cb`；同构建T2限本票VISUAL_PASS，[T2记录](../../../work/assets389/t2-visual-record.md)和[报告](../../../work/assets389/report.html)。真机及Claude/常浩验收不代签。

## 首败与限制

首次沙箱测试绑定localhost EPERM；转为获准合成隔离服务。有效红：旧常驻44px不符隐藏32px；Skill原卡仅两操作。新测试首次二进制夹具用字符串被schema拒绝，修为Uint8Array；随后无connections对象的断言缺省处理已修，最终全部通过。首次CSS留白88造成320来源竖排，已修并重开受影响QA/T2；原始日志/图保留。首次HTTP /index.html 404，正式根路由 / 回读通过；首次实际证据保存引用不存在的fs绑定，重新绑定后保存成功。均不覆盖首败或将工具故障算产品成功。

保护回读：1116既有文件中本票外仅data/capability-use.json动态日志哈希变化，私有内容未读/未回滚；主库与其余保护指纹一致，dist为预期构建变化。新后端、真实Agent配置、Vault、凭据无操作；无安装/提交/推送/重启。

唯一下一步：Claude按本交接、冻结差异及报告质量审查；随后常浩在现有资产页移入卡片并点击复制使用验收。386及384独立待验保留。CURRENT写后回读并释放写入者；不声称Claude已经读取。

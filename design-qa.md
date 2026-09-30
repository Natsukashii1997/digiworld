# UI · 当前恢复状态与历史设计验收

当前：2026-09-28 用户撤销数码宝贝主题，精确恢复原归集视觉；`UI-ROLLBACK.md` 与 `QA-UI-ROLLBACK.md` 是当前记录。当前构建为 `index-CQYK6Tt-.js` / `index-DfnCsklW.css`，364项测试及本机HTTP回读通过；浏览器视觉与交互未复核，不宣称T2通过。

以下为已撤销数码主题的历史记录，不代表当前运行界面。

final result: blocked

- Source visual truth: `design/digievolution-v1/reference/approved.png`约束布局和配色；最新`UI-LINEART.md`要求全部装饰改为矢量轮廓，覆盖旧PNG资产要求。
- Source dimensions: 1402×1122 pixels；用户明确批准的高保真图。
- Implementation: `http://127.0.0.1:5178/#assets`；本机未提交候选，9个现有路由。
- Build: `dist/assets/index-DBJH6mTX.js`，SHA256 `7313a6394ae66b9cfbe180b6c2fc0812690baf06a185c331d758fff850d5a732`；CSS `index-ZhkfbYUK.css`，SHA256 `44c6acaa524ce1e4f1e2a165782aa957cb72b418342c395c0c10c7ffee44f703`。当前本机HTTP回读匹配；详见 `QA-UI-LINEART.md`。
- Intended comparison viewport/state: 1402×1122 / assets / 六条相同示例 /首项Skill详情 / scroll0，另需1440、1100、1024、760、430、375、320与长文本/空态。
- Implementation screenshot / actual viewport / density normalization: BLOCKED，未取得当前浏览器渲染证据。
- Full-view and focused-region comparison: BLOCKED，未伪造对比。

## 阻塞

2026-09-27，内置浏览器对本地工作台访问返回浏览器安全策略拒绝。已请求用户恢复该访问。没有换浏览器、CDP、Playwright、间接导航或其他方式绕过。

## 五类保真检查

|检查面|源码/资产层证据|当前运行验收|
|---|---|---|
|字体与排版|系统中文字体、统一字号与语义token|BLOCKED：字形、换行、光学对齐待看运行页|
|间距与布局|204px导航、76px顶栏、双栏资产浏览，单列轨道回归检查通过|BLOCKED：真实几何、滚动、窄屏溢出待验|
|颜色与状态|深蓝/冷青/琥珀；CSS解析/变量检查及静态对比度检查|BLOCKED：状态渲染待验|
|图形|全部主题图形改内联SVG，大小两档独立素材预览已检查；不使用位图，favicon也不再请求PNG|BLOCKED：浏览器运行尺寸、布局与最终观感待验|
|内容与功能入口|沿用真实数据、原操作及仅本机提示；新增组件渲染检查通过|BLOCKED：点击、剪贴板、下载及保存后的可见结果待验|

## 迭代记录

这不是浏览器视觉比较历史：目前尚无运行截图，不把以下源码审查冒充视觉QA。

1. v1源码审查发现默认列表继承三列，已在新组件样式明确单列并加结构回归检查。
2. v1源码审查发现内嵌详情卸载使原触发按钮消失，已以稳定资产ID在关闭后回焦。
3. v2复核发现完整详情→编辑→关闭会误回焦背景，v3仅在没有待重开详情模态时回焦。
4. v3两轴源码审查均0剩余发现；实际Tab/Escape/焦点顺序尚未执行。
5. 用户报告所有装饰破图，HTTP复现图片路径404。随后用户明确要求全部线稿，新的SVG方案移除图片请求依赖；追加HTML favicon遗漏回归，最终两轴源码0剩余发现、371项检查通过。独立SVG素材预览不是运行页面截图，T2仍BLOCKED。

## 下一步

恢复获准的浏览器访问，使用隔离主库完成真实资产创建/编辑/刷新/归档、分类搜索、详情与编辑焦点、9路由、窄屏和异常状态检查；取得同尺寸成对截图与局部比较，修复P0/P1/P2，再运行T2。当前不得宣称视觉验收通过或整体项目完成。

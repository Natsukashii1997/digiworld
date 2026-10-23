# Claude：收藏插件按钮视觉优化（并行小改，待登记 CURRENT）

输入状态 / 输出状态：读到 WB-20261014-474（写入者 Codex，任务为逆向 v4 R1/R2，与本改动无交集）。用户当轮明确安排并行修改；未改 CURRENT、未占用状态编号，待 Codex 释放后由下一位写入者登记。
执行者 / 本轮范围：Claude；仅 `browser-extension/collection/content.js` 的注入按钮样式。
改动文件及结果：
- 两个按钮合成深色胶囊分段（容器深色半透明底、圆角 14px、阴影）；「收藏」青色字 + ★，「GET+」紫色字 + ✦，各自淡色底，2px 间隔作分隔。
- 新增一个 `<style>`（以组 ID 限定）承担 ::before 图标、悬停提亮、按下下沉、focus-visible 描边、禁用态；图标不进入按钮文字。
- `setButtonState` 改为设置文字色而非背景；错误色 `#B56A5B` → `#ff9b8a`，保证深底上可读。
- 尺寸 44×64、拖拽、点击、状态气泡、业务语义不变。前像：`work/claude-buttons-ui/content.before.js`（sha1 545709de…）。
验证：`collection-get-extension-browser`、`collection-extension-browser`、`collection-douyin-browser` 三项通过，日志与截图在 `work/claude-buttons-ui/`。未跑全量；`dist/` 与数据未动。
运行服务是否采用 / 真实数据是否变更：否 / 否。Chrome 需在扩展页重新加载插件后才生效，真实小红书/抖音页面未目测。
唯一下一步：用户在 Chrome 重载插件目测；Codex 释放认领后登记 CURRENT。

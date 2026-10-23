# Claude 485 · 内容文稿页码改为视频文稿同款青色小方框（已上线）

输入 / 输出：WB-20261014-483 → Claude 认领 484 → WB-20261014-485（写入者释放）。
用户要求：内容文稿参照视频文稿，左侧青色小方框，里面写 P 几。

改动：
- `DeskView.tsx`：内容文稿复用视频文稿的 `collection-transcript / -segment` 布局，页码是 `collection-key collection-timestamp` 同款按钮；与时间戳点了跳视频一样，点页码把左侧画廊切到该图（按 `imageOcr.imageUrl` 定位，图片加载失败已移除时不动）。按钮读屏名「P{n}：在左侧查看这张图片」，避免与缩略图「查看第 n 张图片」重名。无 `imageOcr` 的旧记录仍整段无页码。
- `collection.css`：删除 479 加的三条分页样式（改用视频文稿样式，不再使用）。
- 测试：reading（P2/P3 与逐页文字）、redesign（首段 P2，点 P3 画廊为 03/11）。
验证：候选 `work/claude-pages484/dist`；reading / redesign / get / video 四项浏览器通过。未跑全量。
采用：正式 dist 替换为该候选（差异 index.html + 2 组 js/css），未重启（PID 55062）；旧版存 `work/claude-pages484/before-live-dist`。线上回读：脚本 `index-DCGhKf5l.js`；Loop Engineering 收藏点 P4 后画廊为 04/11。
唯一下一步：477 的 R3（launchd 找不到 npx，逆向页 500）仍待 Codex。

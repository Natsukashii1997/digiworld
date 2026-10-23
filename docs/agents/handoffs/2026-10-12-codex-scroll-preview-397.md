# 焚决外层浏览与逐条复制 · 工程交回397

输入395→认领396→输出397；常浩直接授权，明确确认“两张卡片的高度，内部纵向滚动”。不代签Claude质量验收或常浩使用验收。

## 目标与结果

一卷承载一类有序的简短高价值提示词。焚决卡728px（2×352＋24），内部纵向滚动，普通卡保持352px。外层完整呈现全部未删除条目：首个非空行派生名称、完整正文、已有标签、各自复制次数和44px逐条复制入口。沿用现有像素火焰、FJ编号、卷名、总次数与整卷/删除/置顶三操作。详情页及编辑/移动/回收功能不改；没有新增独立名称字段或改写旧正文。

逐条复制保持原换行，只计目标条目；整卷沿旧顺序拼接全部未删除正文并逐条计次。同卷共享同步会话锁，双击防重、剪贴板拒绝不计次；保存结果未知时保留提示和锁，不自动重放。锁跨筛选与整个页面卸载保留；页面刷新重读后才解除。沿用服务器revision拒覆盖，不修改App、ScrollDetail、模型或后端。

## 最终证据

- 源码/测试冻结9项：work/assets396/review5/manifest.json，SHA256 `17ad2ebc45bcc7098101fa040e416deea5590e34fdb5606199e86488ca02f2e7`。相对本轮前像差异在review4/delta-this-ticket.patch（review5仅标签字号额外一行），不把既有dirty作为本轮成果。
- 构建成功，17文件清单 work/assets396/build-final-manifest.json，SHA256 `bbdfc33da9e245478e6c433ca91965c9348616bf8c3047979ab84b6fb02c9e44`；JS `index-DwCsshdB.js`，CSS `index-CJbcifiI.css`。继承的chunk体积提示保留，不另改打包范围。
- 最终全量串行单元1206/1206：work/assets396/unit-final3.log。
- 新专项preview-final5通过：全文/标签/顺序/删除排除、目标计次、双击、刷新、键盘、拒绝、未提交503、已提交响应丢失、busy/unknown筛选及路由重入、同卷整条/整卷锁；合成资产和临时服务，未操作真实数据。
- 5个原入口全通过：scrolls-browser、assets-actions-browser、assets-copy-browser、assets-warehouse-browser、assets-pin-browser；work/assets396/regression-final2/results.json。合计6套浏览器验证。
- 320/375/390/393/430/1440六宽：728/352几何、44px新按钮、内部可滚动、键盘到末尾、无整页横溢、Axe均通过；work/assets396/preview-final5/results.json及截图。
- 同构建双轴：Standards硬性0/建议0，Spec0；P2门禁卸载问题已红绿关闭。见work/assets396/review-final.md。
- 工程T2：见work/assets396/t2-visual-record.md，VISUAL_PASS，未解决0，历史标签字号项已关闭。
- 视觉path3，复用既有权威，生图预算0。authority-manifest SHA256 `48224c42fde35d20f6436e43aad83cd7c3fde83280f1cd62ac78b1f554b0dba5`；screens-final-manifest SHA256 `a9da8adc7ac22b930a54fdf2ce96d8a1c4b6d8d6253e403cef763dcbf5e7ba32`，六宽＋原5178实图共7项，绑定最终构建。

最后T2发现条目中文标签10px偏小；仅改既有12px令牌，首轮TUNE保留于t2-visual-record-first.md。按Matt合同94只重开视觉及下游；最终构建、六宽排版/滚动/Axe与完整复制专项、5178回读/截图及T2重新绑定。unit-final3与五原入口回归沿用：它们的JavaScript、SSR和交互输入未变，qa-adoption-final.json记录哈希差异与依据。

## 原5178采用与保全

work/assets396/http-readback.json确认5个公开静态资源与磁盘逐字节一致。只读真实仓库DOM：心法728px，5张普通卡352px；既有2条正文呈现，复制次数2/3，新增复制入口44px。原标签为空未虚构标签。JS/CSS匹配上述最终资源，截图live-5178.png，DOM结论live-readback.json。未执行真实复制、编辑、删除或增添测试资产。原PID97328不变，未重启后端。

基线HEAD `e6e5d8b74474ea408ebb171ab70415e32d57ada4`不变，staged为空。2180既有指纹核对无丢失，2172不变；变化仅本轮授权7项与动态使用日志data/capability-use.json。使用日志保留、不回滚、不归因。主库指针、Scrolls/App/schema/服务端及其他既有未提交内容保留。详见baseline.json、protection-final.json、git-diff-before.patch。实际前像261文件，before-saved-manifest.json列明：初始92份，169份未改旧work附件因Git非ASCII路径引用解码补存；不覆盖原前像。

## 首败与修正

red.log保留旧卡没有外层列表的有效红。unit-final.log旧SSR仅匹配精确asset-card类，现允许附加类但保留7/1数量；旧scrolls-browser严格条数文案适配“·逐条浏览”，原恢复/标签/计数断言不降。preview-final.log为Axe要求显式context，preview-final2.log为原生End滚动异步读回，分别修正测试上下文和条件等待，不改业务或尺寸阈值。reentry-red2.log复现筛选卸载锁消失；生产锁移到页面会话后preview-final5为绿。EPERM本地监听环境拒绝单独保留reentry-red.log，不当业务红。初次HTTP回读manifest路径误用404，使用既有正确资源映射后5/5字节一致。

## 交接与唯一下一步

[可读前后对照报告](../../../work/assets396/report.html)及本交接为成果入口。本地工程验证与静态采用完成；Claude质量验收、常浩实际使用验收待完成，395/390/388/386/384待验历史边界不覆盖。CURRENT/tracker写后回读后释放写入者。

唯一下一步：Claude按397最终冻结和前后图质量验收，常浩在原资产仓库实际试用滚动浏览及逐条复制。未收到Claude读回确认，不声称已接手；未发送跨客户端消息。禁止提交、推送、安装、重启、测试性真实增删、Vault/Agent私人资料读写持续有效。
